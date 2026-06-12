package realtime

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"yourmsgr/db"
)

const RealtimeChannel = "yourmsgr_events"

// RealtimeEvent is the shared event envelope used by all adapters
type RealtimeEvent struct {
	Type    string  `json:"type"`
	UserID  int64   `json:"userId,omitempty"`
	UserIDs []int64 `json:"userIds,omitempty"`
}

// postgresPubSub implements PubSubAdapter via PostgreSQL LISTEN/NOTIFY
type postgresPubSub struct{}

func newPostgresPubSub() *postgresPubSub {
	return &postgresPubSub{}
}

func (p *postgresPubSub) Publish(ctx context.Context, event RealtimeEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = db.Pool.Exec(ctx, "SELECT pg_notify($1, $2)", RealtimeChannel, string(payload))
	return err
}

func (p *postgresPubSub) StartListener() {
	go func() {
		for {
			if err := p.listenLoop(); err != nil {
				log.Printf("Postgres PubSub listener error: %v. Reconnecting in 5s...", err)
				time.Sleep(5 * time.Second)
			}
		}
	}()
}

func (p *postgresPubSub) listenLoop() error {
	ctx := context.Background()
	conn, err := db.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err = conn.Exec(ctx, "LISTEN "+RealtimeChannel); err != nil {
		return err
	}

	log.Printf("Postgres PubSub subscribed to channel: %s", RealtimeChannel)

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}

		var event RealtimeEvent
		if err := json.Unmarshal([]byte(notification.Payload), &event); err != nil {
			log.Printf("Postgres PubSub: failed to parse event: %v", err)
			continue
		}

		handleRealtimeEvent(event)
	}
}

// handleRealtimeEvent dispatches an inbound event to the local WebSocket hub.
// Shared by all adapters.
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
