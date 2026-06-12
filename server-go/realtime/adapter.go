package realtime

import (
	"context"
	"log"

	"yourmsgr/config"
)

// PubSubAdapter abstracts the pub/sub transport (Postgres or Redis)
type PubSubAdapter interface {
	Publish(ctx context.Context, event RealtimeEvent) error
	StartListener()
}

var activeAdapter PubSubAdapter

// InitPubSub selects and starts the pub/sub adapter based on PUBSUB_ADAPTER config.
// Falls back to Postgres if Redis URL is missing or adapter is unrecognised.
func InitPubSub() {
	if config.AppConfig.PubSubAdapter == "redis" && config.AppConfig.RedisURL != "" {
		log.Println("PubSub: using Redis adapter")
		activeAdapter = newRedisPubSub(config.AppConfig.RedisURL)
	} else {
		if config.AppConfig.PubSubAdapter == "redis" {
			log.Println("PubSub: REDIS_URL is not set, falling back to Postgres adapter")
		} else {
			log.Println("PubSub: using Postgres adapter")
		}
		activeAdapter = newPostgresPubSub()
	}

	activeAdapter.StartListener()
}

// PublishRealtimeEvent is the package-level wrapper — all existing callers remain unchanged.
func PublishRealtimeEvent(ctx context.Context, event RealtimeEvent) {
	if activeAdapter == nil {
		log.Println("PubSub: adapter not initialised, dropping event")
		return
	}
	if err := activeAdapter.Publish(ctx, event); err != nil {
		log.Printf("PubSub: failed to publish event %q: %v", event.Type, err)
	}
}

// StartRealtimeListener is kept for backwards-compatibility.
// Prefer calling InitPubSub() directly.
func StartRealtimeListener() {
	InitPubSub()
}
