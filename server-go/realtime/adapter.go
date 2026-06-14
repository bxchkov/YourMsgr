package realtime

import (
	"context"
	"log/slog"

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
		slog.Info("PubSub: using Redis adapter")
		activeAdapter = newRedisPubSub(config.AppConfig.RedisURL)
	} else {
		if config.AppConfig.PubSubAdapter == "redis" {
			slog.Warn("PubSub: REDIS_URL is not set, falling back to Postgres adapter")
		} else {
			slog.Info("PubSub: using Postgres adapter")
		}
		activeAdapter = newPostgresPubSub()
	}

	activeAdapter.StartListener()
}

// PublishRealtimeEvent is the package-level wrapper — all existing callers remain unchanged.
func PublishRealtimeEvent(ctx context.Context, event RealtimeEvent) {
	if activeAdapter == nil {
		slog.Warn("PubSub: adapter not initialised, dropping event")
		return
	}
	if err := activeAdapter.Publish(ctx, event); err != nil {
		slog.Error("PubSub: failed to publish event", slog.String("type", event.Type), slog.Any("error", err))
	}
}

// StartRealtimeListener is kept for backwards-compatibility.
// Prefer calling InitPubSub() directly.
func StartRealtimeListener() {
	InitPubSub()
}
