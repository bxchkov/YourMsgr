package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// redisPubSub implements PubSubAdapter via Redis PUBLISH/SUBSCRIBE
type redisPubSub struct {
	client *redis.Client
}

func newRedisPubSub(redisURL string) *redisPubSub {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Error("Redis PubSub: invalid REDIS_URL", slog.Any("error", err))
		os.Exit(1)
	}

	client := redis.NewClient(opts)

	// Verify connection at startup
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Error("Redis PubSub: cannot connect to Redis", slog.Any("error", err))
		os.Exit(1)
	}

	slog.Info("Redis PubSub: connected successfully")
	return &redisPubSub{client: client}
}

func (r *redisPubSub) Publish(ctx context.Context, event RealtimeEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return r.client.Publish(ctx, RealtimeChannel, payload).Err()
}

func (r *redisPubSub) StartListener() {
	go func() {
		for {
			if err := r.subscribeLoop(); err != nil {
				slog.Error("Redis PubSub listener error", slog.Any("error", err))
				time.Sleep(5 * time.Second)
			}
		}
	}()
}

func (r *redisPubSub) subscribeLoop() error {
	ctx := context.Background()
	sub := r.client.Subscribe(ctx, RealtimeChannel)
	defer sub.Close()

	// Wait for subscription confirmation
	if _, err := sub.Receive(ctx); err != nil {
		return err
	}

	slog.Info("Redis PubSub subscribed to channel", slog.String("channel", RealtimeChannel))

	ch := sub.Channel()
	for msg := range ch {
		var event RealtimeEvent
		if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
			slog.Error("Redis PubSub: failed to parse event", slog.Any("error", err))
			continue
		}

		handleRealtimeEvent(event)
	}

	return nil
}
