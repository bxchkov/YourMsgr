package db

import (
	"database/sql"
	"embed"
	"log/slog"
	"os"

	"yourmsgr/config"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

// RunMigrations executes all embedded SQL migrations against the database
func RunMigrations() {
	if config.AppConfig == nil {
		slog.Error("Configuration is not loaded. Call config.LoadConfig() first.")
		os.Exit(1)
	}

	// Open connection with standard SQL driver registered by pgx stdlib
	db, err := sql.Open("pgx", config.AppConfig.DatabaseURL)
	if err != nil {
		slog.Error("Failed to open db connection for migrations", slog.Any("error", err))
		os.Exit(1)
	}
	defer db.Close()

	// Configure goose to use our embedded migrations FS
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("postgres"); err != nil {
		slog.Error("goose failed to set dialect", slog.Any("error", err))
		os.Exit(1)
	}

	slog.Info("Running database migrations...")
	if err := goose.Up(db, "migrations"); err != nil {
		slog.Error("goose failed to run Up", slog.Any("error", err))
		os.Exit(1)
	}
	slog.Info("Database migrations completed successfully")
}
