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
	clients    map[int64][]*Client
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

var GlobalHub *Hub

// InitHub initializes the global WebSocket Hub
func InitHub() {
	GlobalHub = &Hub{
		clients:    make(map[int64][]*Client),
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
			h.clients[client.UserID] = append(h.clients[client.UserID], client)
			h.mu.Unlock()
			slog.Info("WebSocket client registered", slog.String("username", client.Username), slog.Int64("userId", client.UserID))

		case client := <-h.unregister:
			h.mu.Lock()
			clientList, ok := h.clients[client.UserID]
			if ok {
				newIdx := -1
				for i, c := range clientList {
					if c == client {
						newIdx = i
						break
					}
				}
				if newIdx != -1 {
					// Close connection
					client.Conn.Close()
					// Remove from slice
					clientList = append(clientList[:newIdx], clientList[newIdx+1:]...)
					if len(clientList) == 0 {
						delete(h.clients, client.UserID)
					} else {
						h.clients[client.UserID] = clientList
					}
					slog.Info("WebSocket client unregistered", slog.String("username", client.Username), slog.Int64("userId", client.UserID))
				}
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastToAll sends a JSON payload to all active connections
func (h *Hub) BroadcastToAll(payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, clientList := range h.clients {
		for _, client := range clientList {
			err := client.Conn.WriteMessage(websocket.TextMessage, payload)
			if err != nil {
				slog.Error("Failed to deliver payload to client", slog.Any("error", err))
				go func(c *Client) { h.unregister <- c }(client)
			}
		}
	}
}

// BroadcastToUsers sends a JSON payload to specific user IDs
func (h *Hub) BroadcastToUsers(userIds []int64, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, id := range userIds {
		if clientList, ok := h.clients[id]; ok {
			for _, client := range clientList {
				err := client.Conn.WriteMessage(websocket.TextMessage, payload)
				if err != nil {
					slog.Error("Failed to deliver payload to target user", slog.Int64("userId", client.UserID), slog.Any("error", err))
					go func(c *Client) { h.unregister <- c }(client)
				}
			}
		}
	}
}

// CountUserConnections counts how many active sockets a user has
func (h *Hub) CountUserConnections(userId int64) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.clients[userId])
}

// ForceLogoutUser disconnects all sockets of a user and notifies them
func (h *Hub) ForceLogoutUser(userId int64) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	logoutPayload := []byte(`{"type":"client_logout"}`)

	if clientList, ok := h.clients[userId]; ok {
		for _, client := range clientList {
			// Notify client and unregister
			client.Conn.WriteMessage(websocket.TextMessage, logoutPayload)
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}
