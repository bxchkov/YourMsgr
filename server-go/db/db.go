package db

import (
	"context"
	"log/slog"
	"os"
	"time"

	"yourmsgr/config"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

// ConnectDB initializes the PostgreSQL connection pool using pgxpool
func ConnectDB() {
	if config.AppConfig == nil {
		slog.Error("Configuration is not loaded. Call config.LoadConfig() first.")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	poolConfig, err := pgxpool.ParseConfig(config.AppConfig.DatabaseURL)
	if err != nil {
		slog.Error("Failed to parse DATABASE_URL", slog.Any("error", err))
		os.Exit(1)
	}

	// Tweak pool settings for performance
	poolConfig.MaxConns = int32(config.AppConfig.DbMaxConns)
	poolConfig.MinConns = int32(config.AppConfig.DbMinConns)
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		slog.Error("Failed to create connection pool", slog.Any("error", err))
		os.Exit(1)
	}

	// Ping the database to verify connectivity
	if err := pool.Ping(ctx); err != nil {
		slog.Error("Failed to ping database", slog.Any("error", err))
		os.Exit(1)
	}

	slog.Info("Connected to PostgreSQL successfully")
	Pool = pool
}

// CloseDB gracefully shuts down the database connection pool
func CloseDB() {
	if Pool != nil {
		Pool.Close()
		slog.Info("Database connection pool closed")
	}
}
