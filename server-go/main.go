package main

import (
	"log"

	"yourmsgr/config"
	"yourmsgr/db"

	"github.com/gofiber/fiber/v2"
)

func main() {
	// Load configuration
	config.LoadConfig()

	// Connect to database
	db.ConnectDB()
	defer db.CloseDB()

	app := fiber.New()

	// Base API group
	api := app.Group("/api")

	// Health check endpoint
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":  "ok",
			"service": "yourmsgr-go",
		})
	})

	log.Printf("Starting Go server on port %s...", config.AppConfig.Port)
	if err := app.Listen(":" + config.AppConfig.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
