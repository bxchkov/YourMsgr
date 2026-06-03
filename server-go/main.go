package main

import (
	"log"

	"yourmsgr/config"
	"yourmsgr/controllers"
	"yourmsgr/db"
	"yourmsgr/utils"

	"github.com/gofiber/fiber/v2"
)

func main() {
	// Load configuration
	config.LoadConfig()

	// Validate JWT secrets strength and placeholders (Wave 1 security requirement)
	if err := utils.AssertJwtSecret(config.AppConfig.JWTAccessSecret, "JWT_ACCESS_SECRET"); err != nil {
		log.Fatalf("JWT Access Secret assertion failed: %v", err)
	}
	if err := utils.AssertJwtSecret(config.AppConfig.JWTRefreshSecret, "JWT_REFRESH_SECRET"); err != nil {
		log.Fatalf("JWT Refresh Secret assertion failed: %v", err)
	}

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

	// Auth routes
	authCtrl := controllers.NewAuthController()
	auth := api.Group("/auth")
	auth.Post("/register", authCtrl.Register)
	auth.Post("/login", authCtrl.Login)
	auth.Post("/refresh", authCtrl.Refresh)
	auth.Post("/logout", authCtrl.Logout)
	auth.Get("/session", authCtrl.Session)

	// Protected routes
	auth.Post("/username", controllers.JWTAuthMiddleware(), authCtrl.UpdateUsername)
	auth.Get("/publicKeys", controllers.JWTAuthMiddleware(), authCtrl.GetPublicKeys)

	log.Printf("Starting Go server on port %s...", config.AppConfig.Port)
	if err := app.Listen(":" + config.AppConfig.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
