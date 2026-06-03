package main

import (
	"log"

	"github.com/gofiber/fiber/v2"
)

func main() {
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

	log.Println("Starting Go server on port 3001...")
	if err := app.Listen(":3001"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
