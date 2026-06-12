package config

import (
	"log"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL      string
	Port             string
	JWTAccessSecret  string
	JWTRefreshSecret string
	RateLimitWindow  int
	RateLimitMax     int
	RedisURL         string // Optional: set to enable Redis pub/sub adapter
	PubSubAdapter    string // "postgres" (default) or "redis"
}

var AppConfig *Config

// LoadConfig reads configuration from environment variables
func LoadConfig() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is not set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	jwtAccess := os.Getenv("JWT_ACCESS_SECRET")
	jwtRefresh := os.Getenv("JWT_REFRESH_SECRET")

	// Ensure JWT secrets are provided — fatal because auth is completely broken without them
	if jwtAccess == "" || jwtRefresh == "" {
		log.Fatal("FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set")
	}

	rateLimitWindowStr := os.Getenv("RATE_LIMIT_WINDOW")
	rateLimitWindow := 15
	if rateLimitWindowStr != "" {
		if val, err := strconv.Atoi(rateLimitWindowStr); err == nil {
			rateLimitWindow = val
		}
	}

	rateLimitMaxStr := os.Getenv("RATE_LIMIT_MAX")
	rateLimitMax := 100
	if rateLimitMaxStr != "" {
		if val, err := strconv.Atoi(rateLimitMaxStr); err == nil {
			rateLimitMax = val
		}
	}

	redisURL := os.Getenv("REDIS_URL")

	pubSubAdapter := os.Getenv("PUBSUB_ADAPTER")
	if pubSubAdapter == "" {
		pubSubAdapter = "postgres"
	}

	AppConfig = &Config{
		DatabaseURL:      dbURL,
		Port:             port,
		JWTAccessSecret:  jwtAccess,
		JWTRefreshSecret: jwtRefresh,
		RateLimitWindow:  rateLimitWindow,
		RateLimitMax:     rateLimitMax,
		RedisURL:         redisURL,
		PubSubAdapter:    pubSubAdapter,
	}
}
