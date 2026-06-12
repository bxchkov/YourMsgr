package realtime

import (
	"context"
	"encoding/json"
	"log"
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
		log.Fatalf("Redis PubSub: invalid REDIS_URL: %v", err)
	}

	client := redis.NewClient(opts)

	// Verify connection at startup
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("Redis PubSub: cannot connect to Redis: %v", err)
	}

	log.Println("Redis PubSub: connected successfully")
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
				log.Printf("Redis PubSub listener error: %v. Reconnecting in 5s...", err)
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

	log.Printf("Redis PubSub subscribed to channel: %s", RealtimeChannel)

	ch := sub.Channel()
	for msg := range ch {
		var event RealtimeEvent
		if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
			log.Printf("Redis PubSub: failed to parse event: %v", err)
			continue
		}

		handleRealtimeEvent(event)
	}

	return nil
}
