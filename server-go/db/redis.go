package db

import (
	"context"
	"log"
	"time"

	"yourmsgr/config"

	"github.com/redis/go-redis/v9"
)

var RedisClient *redis.Client

// ConnectRedis initializes the Redis client if REDIS_URL is configured
func ConnectRedis() {
	if config.AppConfig == nil {
		log.Fatal("Configuration is not loaded. Call config.LoadConfig() first.")
	}

	redisURL := config.AppConfig.RedisURL
	if redisURL == "" {
		log.Println("Redis is not configured (REDIS_URL is empty). Skipping Redis connection.")
		return
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse REDIS_URL: %v", err)
	}

	client := redis.NewClient(opts)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	log.Println("Connected to Redis successfully")
	RedisClient = client
}

// CloseRedis gracefully closes the Redis client connection
func CloseRedis() {
	if RedisClient != nil {
		if err := RedisClient.Close(); err != nil {
			log.Printf("Error closing Redis client: %v", err)
		} else {
			log.Println("Redis connection closed")
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
