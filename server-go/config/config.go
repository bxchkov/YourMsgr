package config

import (
	"flag"
	"log/slog"
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
	CookieSecure     bool
	DbMaxConns       int
	DbMinConns       int
}

var AppConfig *Config

// LoadConfig reads configuration from environment variables
func LoadConfig() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL environment variable is not set")
		os.Exit(1)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	jwtAccess := os.Getenv("JWT_ACCESS_SECRET")
	jwtRefresh := os.Getenv("JWT_REFRESH_SECRET")

	// Ensure JWT secrets are provided — fatal because auth is completely broken without them
	if jwtAccess == "" || jwtRefresh == "" {
		if flag.Lookup("test.v") != nil {
			if jwtAccess == "" {
				jwtAccess = "dummy_jwt_access_secret_key_32_chars"
			}
			if jwtRefresh == "" {
				jwtRefresh = "dummy_jwt_refresh_secret_key_32_chars"
			}
		} else {
			slog.Error("FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set")
			os.Exit(1)
		}
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

	cookieSecureStr := os.Getenv("COOKIE_SECURE")
	cookieSecure := false
	if cookieSecureStr == "true" {
		cookieSecure = true
	} else {
		publicURL := os.Getenv("PUBLIC_URL")
		if publicURL != "" && len(publicURL) >= 5 && publicURL[:5] == "https" {
			cookieSecure = true
		}
	}

	dbMaxConnsStr := os.Getenv("DB_MAX_CONNS")
	dbMaxConns := 25
	if dbMaxConnsStr != "" {
		if val, err := strconv.Atoi(dbMaxConnsStr); err == nil {
			dbMaxConns = val
		}
	}

	dbMinConnsStr := os.Getenv("DB_MIN_CONNS")
	dbMinConns := 5
	if dbMinConnsStr != "" {
		if val, err := strconv.Atoi(dbMinConnsStr); err == nil {
			dbMinConns = val
		}
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
		CookieSecure:     cookieSecure,
		DbMaxConns:       dbMaxConns,
		DbMinConns:       dbMinConns,
	}
}
