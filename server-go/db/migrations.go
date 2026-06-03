package db

import (
	"database/sql"
	"embed"
	"log"

	"yourmsgr/config"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

// RunMigrations executes all embedded SQL migrations against the database
func RunMigrations() {
	if config.AppConfig == nil {
		log.Fatal("Configuration is not loaded. Call config.LoadConfig() first.")
	}

	// Open connection with standard SQL driver registered by pgx stdlib
	db, err := sql.Open("pgx", config.AppConfig.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to open db connection for migrations: %v", err)
	}
	defer db.Close()

	// Configure goose to use our embedded migrations FS
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("goose failed to set dialect: %v", err)
	}

	log.Println("Running database migrations...")
	if err := goose.Up(db, "migrations"); err != nil {
		log.Fatalf("goose failed to run Up: %v", err)
	}
	log.Println("Database migrations completed successfully")
}
