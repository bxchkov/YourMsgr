package realtime

import (
	"log/slog"
	"sync"

	"github.com/gofiber/websocket/v2"
)

type Client struct {
	Conn         *websocket.Conn
	UserID       int64
	Username     string
	RefreshToken string
}

type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

var GlobalHub *Hub

// InitHub initializes the global WebSocket Hub
func InitHub() {
	GlobalHub = &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	go GlobalHub.run()
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			slog.Info("WebSocket client registered", slog.String("username", client.Username), slog.Int64("userId", client.UserID))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Conn.Close()
				slog.Info("WebSocket client unregistered", slog.String("username", client.Username), slog.Int64("userId", client.UserID))
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastToAll sends a JSON payload to all active connections
func (h *Hub) BroadcastToAll(payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		err := client.Conn.WriteMessage(websocket.TextMessage, payload)
		if err != nil {
			slog.Error("Failed to deliver payload to client", slog.Any("error", err))
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}

// BroadcastToUsers sends a JSON payload to specific user IDs
func (h *Hub) BroadcastToUsers(userIds []int64, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	targets := make(map[int64]bool)
	for _, id := range userIds {
		targets[id] = true
	}

	for client := range h.clients {
		if targets[client.UserID] {
			err := client.Conn.WriteMessage(websocket.TextMessage, payload)
			if err != nil {
				slog.Error("Failed to deliver payload to target user", slog.Int64("userId", client.UserID), slog.Any("error", err))
				go func(c *Client) { h.unregister <- c }(client)
			}
		}
	}
}

// CountUserConnections counts how many active sockets a user has
func (h *Hub) CountUserConnections(userId int64) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	count := 0
	for client := range h.clients {
		if client.UserID == userId {
			count++
		}
	}
	return count
}

// ForceLogoutUser disconnects all sockets of a user and notifies them
func (h *Hub) ForceLogoutUser(userId int64) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	logoutPayload := []byte(`{"type":"client_logout"}`)

	for client := range h.clients {
		if client.UserID == userId {
			// Notify client and unregister
			client.Conn.WriteMessage(websocket.TextMessage, logoutPayload)
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}
