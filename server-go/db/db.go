package db

import (
	"context"
	"log"
	"time"

	"yourmsgr/config"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

// ConnectDB initializes the PostgreSQL connection pool using pgxpool
func ConnectDB() {
	if config.AppConfig == nil {
		log.Fatal("Configuration is not loaded. Call config.LoadConfig() first.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	poolConfig, err := pgxpool.ParseConfig(config.AppConfig.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to parse DATABASE_URL: %v", err)
	}

	// Tweak pool settings for performance
	poolConfig.MaxConns = int32(config.AppConfig.DbMaxConns)
	poolConfig.MinConns = int32(config.AppConfig.DbMinConns)
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		log.Fatalf("Failed to create connection pool: %v", err)
	}

	// Ping the database to verify connectivity
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Connected to PostgreSQL successfully")
	Pool = pool
}

// CloseDB gracefully shuts down the database connection pool
func CloseDB() {
	if Pool != nil {
		Pool.Close()
		log.Println("Database connection pool closed")
	}
}
