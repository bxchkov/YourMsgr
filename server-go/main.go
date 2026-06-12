package main

import (
	"flag"
	"log"
	"os"
	"strings"
	"time"

	"yourmsgr/cli"
	"yourmsgr/config"
	"yourmsgr/controllers"
	"yourmsgr/db"
	"yourmsgr/realtime"
	"yourmsgr/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/csrf"
	"github.com/gofiber/fiber/v2/middleware/limiter"
)

func main() {
	// Parse CLI flag if present
	cliFlag := flag.Bool("cli", false, "Run admin CLI command")
	flag.Parse()

	// Load configuration
	config.LoadConfig()

	// If running CLI command, we connect to DB, run it, and exit
	if *cliFlag {
		db.ConnectDB()
		defer db.CloseDB()

		// Run admin command passing remaining command line arguments
		cli.RunCommand(flag.Args())
		os.Exit(0)
	}

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

	// Run migrations (Goose)
	db.RunMigrations()

	// Initialize real-time WebSockets Hub (Phase 5)
	realtime.InitHub()

	// Start pub/sub listener — adapter selected via PUBSUB_ADAPTER env (postgres|redis)
	realtime.InitPubSub()

	app := fiber.New()

	// Rate Limiter middleware (Wave 1 / Audit recommendation)
	app.Use(limiter.New(limiter.Config{
		Max:        config.AppConfig.RateLimitMax,
		Expiration: time.Duration(config.AppConfig.RateLimitWindow) * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			// Extract IP considering reverse proxy headers
			forwarded := c.Get("X-Forwarded-For")
			if forwarded != "" {
				parts := strings.Split(forwarded, ",")
				return strings.TrimSpace(parts[0])
			}
			realIP := c.Get("X-Real-IP")
			if realIP != "" {
				return realIP
			}
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return utils.SendError(c, fiber.StatusTooManyRequests, "Слишком много запросов")
		},
		Next: func(c *fiber.Ctx) bool {
			// Skip rate limiting for health check endpoint
			return c.Path() == "/api/health"
		},
	}))

	// CSRF Protection middleware (Wave 1 security requirement / Audit recommendation)
	app.Use(csrf.New(csrf.Config{
		KeyLookup:      "header:X-CSRF-Token",
		CookieName:     "csrf_token",
		CookieSameSite: "Lax",
		CookieSecure:   false,
		CookieHTTPOnly: false,
		Expiration:     24 * time.Hour,
		Next: func(c *fiber.Ctx) bool {
			// Skip CSRF for health check
			if c.Path() == "/api/health" {
				return true
			}
			// Skip CSRF check for login and registration
			if c.Path() == "/auth/login" || c.Path() == "/auth/registration" {
				return true
			}
			return false
		},
	}))

	// Base API group
	api := app.Group("/api")

	// Health check endpoint
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":  "ok",
			"service": "yourmsgr-go",
		})
	})

	// Real-time WebSocket endpoint (Phase 5)
	app.Get("/ws", realtime.WebSocketUpgradeMiddleware(), realtime.CreateWebSocketHandler())

	// Auth routes
	authCtrl := controllers.NewAuthController()
	auth := app.Group("/auth")
	auth.Post("/registration", authCtrl.Register)
	auth.Post("/login", authCtrl.Login)
	auth.Post("/refresh", authCtrl.Refresh)
	auth.Post("/logout", authCtrl.Logout)
	auth.Get("/session", authCtrl.Session)

	// Protected routes
	auth.Patch("/username", controllers.JWTAuthMiddleware(), authCtrl.UpdateUsername)
	auth.Get("/publicKeys", controllers.JWTAuthMiddleware(), authCtrl.GetPublicKeys)

	// Chats and Messages routes
	chatCtrl := controllers.NewChatController()

	// Private Chats
	privateChats := api.Group("/private-chats", controllers.JWTAuthMiddleware())
	privateChats.Post("/", chatCtrl.CreatePrivateChat)
	privateChats.Get("/", chatCtrl.GetPrivateChats)
	privateChats.Get("/:chatId/messages", chatCtrl.GetPrivateChatMessages)

	// Messages (Group/General)
	messagesGroup := api.Group("/messages", controllers.JWTAuthMiddleware())
	messagesGroup.Get("/group", chatCtrl.GetGroupMessages)

	log.Printf("Starting Go server on port %s...", config.AppConfig.Port)
	if err := app.Listen(":" + config.AppConfig.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
