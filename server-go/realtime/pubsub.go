package realtime

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"yourmsgr/db"
)

const RealtimeChannel = "yourmsgr_events"

type RealtimeEvent struct {
	Type    string `json:"type"`
	UserID  int    `json:"userId,omitempty"`
	UserIDs []int  `json:"userIds,omitempty"`
}

// PublishRealtimeEvent sends a notification via PostgreSQL NOTIFY
func PublishRealtimeEvent(ctx context.Context, event RealtimeEvent) {
	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf("Failed to marshal realtime event: %v", err)
		return
	}

	_, err = db.Pool.Exec(ctx, "SELECT pg_notify($1, $2)", RealtimeChannel, string(payload))
	if err != nil {
		log.Printf("Failed to publish realtime event: %v", err)
	}
}

// StartRealtimeListener starts listening to PG notifications in a background goroutine
func StartRealtimeListener() {
	go func() {
		for {
			err := listenLoop()
			if err != nil {
				log.Printf("Realtime listener error: %v. Reconnecting in 5 seconds...", err)
				time.Sleep(5 * time.Second)
			}
		}
	}()
}

func listenLoop() error {
	ctx := context.Background()
	conn, err := db.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	// Register LISTEN command
	_, err = conn.Exec(ctx, "LISTEN "+RealtimeChannel)
	if err != nil {
		return err
	}

	log.Printf("Realtime listener subscribed to channel: %s", RealtimeChannel)

	for {
		// Wait for notification (blocks until notification received or connection drops)
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}

		var event RealtimeEvent
		if err := json.Unmarshal([]byte(notification.Payload), &event); err != nil {
			log.Printf("Failed to parse realtime event payload: %v", err)
			continue
		}

		handleRealtimeEvent(event)
	}
}

func handleRealtimeEvent(event RealtimeEvent) {
	switch event.Type {
	case "force_logout":
		if event.UserID > 0 {
			GlobalHub.ForceLogoutUser(event.UserID)
		}

	case "sync_group_messages":
		respBytes, _ := json.Marshal(map[string]interface{}{"type": "sync_group_messages"})
		GlobalHub.BroadcastToAll(respBytes)

	case "sync_private_chats":
		if len(event.UserIDs) > 0 {
			respBytes, _ := json.Marshal(map[string]interface{}{"type": "sync_private_chats"})
			GlobalHub.BroadcastToUsers(event.UserIDs, respBytes)
		}
	}
}
