package realtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"sync"
	"time"

	"yourmsgr/config"
	"yourmsgr/db"
	"yourmsgr/models"
	"yourmsgr/services"
	"yourmsgr/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/jackc/pgx/v5"
)

const (
	MaxWsConnectionsPerUser = 5
	WsLimit                 = 5
	WsWindowMs              = 1000 // 1 second
	SessionCacheTtlMs       = 15000 // 15 seconds
)

type cachedSession struct {
	user      *models.User
	expiresAt int64
}

type rateLimitState struct {
	count     int
	resetTime int64
}

var (
	sessionCache   = make(map[int]cachedSession)
	sessionCacheMu sync.Mutex

	rateLimits   = make(map[int]rateLimitState)
	rateLimitsMu sync.Mutex
)

// WsMessagePayload defines the incoming WS messages structure
type WsMessagePayload struct {
	Type             string  `json:"type"`
	ChatID           *int    `json:"chatId"`
	ChatType         string  `json:"chatType"`
	RecipientID      *int    `json:"recipientId"`
	Message          string  `json:"message"`
	Nonce            *string `json:"nonce"`
	SenderPublicKey  *string `json:"senderPublicKey"`
	IsEncrypted      *int    `json:"isEncrypted"`
	ReplyToMessageID *int    `json:"replyToMessageId"`
	ID               *int    `json:"id"`            // For delete_message
	LastMessageID    *int    `json:"lastMessageId"` // For load_more_messages
}

// getValidSession retrieves the user and checks token match, using short cache
func getValidSession(ctx context.Context, authService *services.AuthService, userId int, token string) (*models.User, bool) {
	now := time.Now().UnixNano() / int64(time.Millisecond)

	sessionCacheMu.Lock()
	cached, ok := sessionCache[userId]
	if ok && cached.expiresAt > now {
		sessionCacheMu.Unlock()
		return cached.user, true
	}
	sessionCacheMu.Unlock()

	// Hit DB on cache miss
	user, err := authService.GetValidSessionUser(ctx, userId, token, config.AppConfig.JWTRefreshSecret)
	if err != nil || user == nil {
		sessionCacheMu.Lock()
		delete(sessionCache, userId)
		sessionCacheMu.Unlock()
		return nil, false
	}

	sessionCacheMu.Lock()
	sessionCache[userId] = cachedSession{
		user:      user,
		expiresAt: now + SessionCacheTtlMs,
	}
	sessionCacheMu.Unlock()

	return user, true
}

// consumeRateLimit returns true if the user exceeded the WebSocket rate limit
func consumeRateLimit(userId int) bool {
	now := time.Now().UnixNano() / int64(time.Millisecond)

	rateLimitsMu.Lock()
	defer rateLimitsMu.Unlock()

	state, ok := rateLimits[userId]
	if !ok || state.resetTime < now {
		rateLimits[userId] = rateLimitState{
			count:     1,
			resetTime: now + WsWindowMs,
		}
		return false
	}

	if state.count >= WsLimit {
		return true
	}

	state.count++
	rateLimits[userId] = state
	return false
}

// WebSocketUpgradeMiddleware handles initial HTTP auth check before upgrading to WS
func WebSocketUpgradeMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Verify WebSocket upgrade request
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}

		refreshToken := c.Cookies("refreshToken")
		if refreshToken == "" {
			return c.Status(fiber.StatusUnauthorized).SendString("Unauthorized")
		}

		claims, err := utils.VerifyToken(refreshToken, config.AppConfig.JWTRefreshSecret)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).SendString("Unauthorized")
		}

		// Store claims in locals for the socket handler to read
		c.Locals("userId", claims.UserID)
		c.Locals("username", claims.UserName)
		c.Locals("refreshToken", refreshToken)

		return c.Next()
	}
}

// CreateWebSocketHandler creates the actual WS loop handler
func CreateWebSocketHandler() fiber.Handler {
	authService := services.NewAuthService()
	chatService := services.NewChatService()

	return websocket.New(func(conn *websocket.Conn) {
		userId := conn.Locals("userId").(int)
		username := conn.Locals("username").(string)
		refreshToken := conn.Locals("refreshToken").(string)

		ctx := context.Background()

		// Verify session initially
		user, valid := getValidSession(ctx, authService, userId, refreshToken)
		if !valid {
			log.Printf("WS session invalid during open for %s (ID: %d)", username, userId)
			conn.WriteJSON(fiber.Map{"type": "client_logout"})
			conn.Close()
			return
		}

		// Check connection limits
		activeConns := GlobalHub.CountUserConnections(userId)
		if activeConns >= MaxWsConnectionsPerUser {
			conn.WriteJSON(fiber.Map{"type": "error", "message": "Too many active connections"})
			conn.Close()
			log.Printf("Rejected extra WS connection for %s (ID: %d)", username, userId)
			return
		}

		// Register client
		client := &Client{
			Conn:         conn,
			UserID:       userId,
			Username:     user.Username,
			RefreshToken: refreshToken,
		}
		GlobalHub.register <- client

		// On connection close, unregister
		defer func() {
			GlobalHub.unregister <- client
		}()

		// Send initial group messages history
		groupHistory, err := chatService.GetGroupMessages(ctx, nil, 50)
		if err == nil {
			conn.WriteJSON(fiber.Map{
				"type":     "load_messages",
				"chatType": "group",
				"messages": groupHistory,
			})
		}

		// Message reading loop
		for {
			_, msgBytes, err := conn.ReadMessage()
			if err != nil {
				// Connection closed
				break
			}

			// Consume rate-limit
			if consumeRateLimit(userId) {
				conn.WriteJSON(fiber.Map{"type": "error", "message": "Rate limit exceeded. Please wait."})
				continue
			}

			var payload WsMessagePayload
			if err := json.Unmarshal(msgBytes, &payload); err != nil {
				conn.WriteJSON(fiber.Map{"type": "error", "message": "Invalid JSON format"})
				continue
			}

			// Handle events
			switch payload.Type {
			case "send_message":
				handleSendMessage(ctx, chatService, authService, client, payload)

			case "delete_message":
				handleDeleteMessage(ctx, chatService, authService, client, payload)

			case "load_more_messages":
				handleLoadMoreMessages(ctx, chatService, authService, client, payload)

			default:
				conn.WriteJSON(fiber.Map{"type": "error", "message": "Unknown message type"})
			}
		}
	})
}

func handleSendMessage(ctx context.Context, chatService *services.ChatService, authService *services.AuthService, client *Client, payload WsMessagePayload) {
	// Re-verify session
	user, valid := getValidSession(ctx, authService, client.UserID, client.RefreshToken)
	if !valid {
		log.Printf("WS send_message session is invalid for %s", client.Username)
		GlobalHub.ForceLogoutUser(client.UserID)
		return
	}

	isEnc := 0
	if payload.IsEncrypted != nil {
		isEnc = *payload.IsEncrypted
	}

	// 1. Direct Private Message
	if payload.ChatID != nil && payload.RecipientID != nil {
		newMsg, err := chatService.SendPrivateMessage(ctx, *payload.ChatID, user.ID, user.Username, payload.Message, *payload.RecipientID,
			payload.Nonce, isEnc, payload.ReplyToMessageID)
		if err != nil {
			client.Conn.WriteJSON(fiber.Map{"type": "error", "message": err.Error()})
			return
		}

		respBytes, _ := json.Marshal(fiber.Map{
			"type":            "send_message",
			"id":              newMsg.ID,
			"userId":          newMsg.UserID,
			"username":        newMsg.Username,
			"message":         newMsg.Message.Message,
			"chatId":          newMsg.ChatID,
			"chatType":        newMsg.ChatType,
			"nonce":           newMsg.Nonce,
			"senderPublicKey": newMsg.SenderPublicKey,
			"replyTo":         newMsg.ReplyTo,
			"recipientId":     newMsg.RecipientID,
			"isEncrypted":     newMsg.IsEncrypted,
			"date":            newMsg.Date,
		})

		// Send only to sender and recipient
		GlobalHub.BroadcastToUsers([]int{user.ID, *newMsg.RecipientID}, respBytes)
		return
	}

	// 2. Global Group Message
	newMsg, err := chatService.SendGroupMessage(ctx, user.ID, user.Username, payload.Message,
		payload.Nonce, isEnc, payload.ReplyToMessageID)
	if err != nil {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": err.Error()})
		return
	}

	respBytes, _ := json.Marshal(fiber.Map{
		"type":            "send_message",
		"id":              newMsg.ID,
		"userId":          newMsg.UserID,
		"username":        newMsg.Username,
		"message":         newMsg.Message.Message,
		"chatId":          newMsg.ChatID,
		"chatType":        newMsg.ChatType,
		"nonce":           newMsg.Nonce,
		"senderPublicKey": newMsg.SenderPublicKey,
		"replyTo":         newMsg.ReplyTo,
		"recipientId":     newMsg.RecipientID,
		"isEncrypted":     newMsg.IsEncrypted,
		"date":            newMsg.Date,
	})

	GlobalHub.BroadcastToAll(respBytes)
}

func handleDeleteMessage(ctx context.Context, chatService *services.ChatService, authService *services.AuthService, client *Client, payload WsMessagePayload) {
	if payload.ID == nil {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": "Message ID is required"})
		return
	}

	// Re-verify session
	user, valid := getValidSession(ctx, authService, client.UserID, client.RefreshToken)
	if !valid {
		GlobalHub.ForceLogoutUser(client.UserID)
		return
	}

	// Fetch message to verify permissions
	var msgOwnerId, role, recipientIdVal int
	var chatType string
	var recipientId sql.NullInt64

	err := db.Pool.QueryRow(ctx, "SELECT user_id, chat_type, recipient_id FROM messages WHERE id = $1", *payload.ID).
		Scan(&msgOwnerId, &chatType, &recipientId)

	if err == pgx.ErrNoRows {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": "Message not found"})
		return
	} else if err != nil {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": err.Error()})
		return
	}

	if recipientId.Valid {
		recipientIdVal = int(recipientId.Int64)
	}

	// Permission check (only author or admin role >= 3)
	role = user.Role
	if msgOwnerId != user.ID && role < 3 {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": "Insufficient permissions to delete"})
		return
	}

	// Perform delete
	_, err = db.Pool.Exec(ctx, "DELETE FROM messages WHERE id = $1", *payload.ID)
	if err != nil {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": "Delete operation failed"})
		return
	}

	respBytes, _ := json.Marshal(fiber.Map{
		"type": "delete_message",
		"id":   *payload.ID,
	})

	if chatType == "private" && recipientIdVal > 0 {
		GlobalHub.BroadcastToUsers([]int{msgOwnerId, recipientIdVal}, respBytes)
		// Trigger sync chat lists for recipients
		syncBytes, _ := json.Marshal(fiber.Map{"type": "sync_private_chats"})
		GlobalHub.BroadcastToUsers([]int{msgOwnerId, recipientIdVal}, syncBytes)
		return
	}

	// Broadcast group delete to all
	GlobalHub.BroadcastToAll(respBytes)
	syncBytes, _ := json.Marshal(fiber.Map{"type": "sync_group_messages"})
	GlobalHub.BroadcastToAll(syncBytes)
}

func handleLoadMoreMessages(ctx context.Context, chatService *services.ChatService, authService *services.AuthService, client *Client, payload WsMessagePayload) {
	// Re-verify session
	user, valid := getValidSession(ctx, authService, client.UserID, client.RefreshToken)
	if !valid {
		GlobalHub.ForceLogoutUser(client.UserID)
		return
	}

	var history []models.MessageWithReply
	var err error

	if payload.ChatType == "private" && payload.ChatID != nil {
		history, err = chatService.GetPrivateChatMessages(ctx, *payload.ChatID, user.ID, payload.LastMessageID, 50)
	} else {
		history, err = chatService.GetGroupMessages(ctx, payload.LastMessageID, 50)
	}

	if err != nil {
		client.Conn.WriteJSON(fiber.Map{"type": "error", "message": err.Error()})
		return
	}

	client.Conn.WriteJSON(fiber.Map{
		"type":         "load_messages",
		"chatType":     payload.ChatType,
		"messages":     history,
		"isPagination": true,
	})
}
