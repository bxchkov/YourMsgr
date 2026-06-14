package db

import (
	"context"
	"log/slog"
	"os"
	"time"

	"yourmsgr/config"

	"github.com/redis/go-redis/v9"
)

var RedisClient *redis.Client

// ConnectRedis initializes the Redis client if REDIS_URL is configured
func ConnectRedis() {
	if config.AppConfig == nil {
		slog.Error("Configuration is not loaded. Call config.LoadConfig() first.")
		os.Exit(1)
	}

	redisURL := config.AppConfig.RedisURL
	if redisURL == "" {
		slog.Info("Redis is not configured (REDIS_URL is empty). Skipping Redis connection.")
		return
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Error("Failed to parse REDIS_URL", slog.Any("error", err))
		os.Exit(1)
	}

	client := redis.NewClient(opts)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Error("Failed to connect to Redis", slog.Any("error", err))
		os.Exit(1)
	}

	slog.Info("Connected to Redis successfully")
	RedisClient = client
}

// CloseRedis gracefully closes the Redis client connection
func CloseRedis() {
	if RedisClient != nil {
		if err := RedisClient.Close(); err != nil {
			slog.Error("Error closing Redis client", slog.Any("error", err))
		} else {
			slog.Info("Redis connection closed")
		}
	}
}

// RedisStorage implements fiber.Storage interface using go-redis
type RedisStorage struct {
	client *redis.Client
}

func NewRedisStorage() *RedisStorage {
	if RedisClient == nil {
		return nil
	}
	return &RedisStorage{client: RedisClient}
}

func (s *RedisStorage) Get(key string) ([]byte, error) {
	val, err := s.client.Get(context.Background(), key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return val, err
}

func (s *RedisStorage) Set(key string, val []byte, exp time.Duration) error {
	return s.client.Set(context.Background(), key, val, exp).Err()
}

func (s *RedisStorage) Delete(key string) error {
	return s.client.Del(context.Background(), key).Err()
}

func (s *RedisStorage) Reset() error {
	return s.client.FlushDB(context.Background()).Err()
}

func (s *RedisStorage) Close() error {
	// Let ConnectRedis handle the client lifecycle
	return nil
}
