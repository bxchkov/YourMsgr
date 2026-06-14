package main

import (
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
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

	// Initialize structured logger (slog)
	var handler slog.Handler
	if os.Getenv("NODE_ENV") == "production" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	slog.SetDefault(slog.New(handler))

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
		slog.Error("JWT Access Secret assertion failed", slog.Any("error", err))
		os.Exit(1)
	}
	if err := utils.AssertJwtSecret(config.AppConfig.JWTRefreshSecret, "JWT_REFRESH_SECRET"); err != nil {
		slog.Error("JWT Refresh Secret assertion failed", slog.Any("error", err))
		os.Exit(1)
	}

	// Connect to database
	db.ConnectDB()
	defer db.CloseDB()

	// Connect to Redis (used for rate limiting if configured)
	db.ConnectRedis()
	defer db.CloseRedis()

	// Run migrations (Goose)
	db.RunMigrations()

	// Initialize real-time WebSockets Hub (Phase 5)
	realtime.InitHub()

	// Start pub/sub listener — adapter selected via PUBSUB_ADAPTER env (postgres|redis)
	realtime.InitPubSub()

	app := fiber.New()

	// Structured HTTP Logger middleware
	app.Use(func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		status := c.Response().StatusCode()
		method := c.Method()
		path := c.Path()
		ip := c.IP()

		if err != nil {
			slog.Error("HTTP request failed",
				slog.String("method", method),
				slog.String("path", path),
				slog.Int("status", status),
				slog.String("ip", ip),
				slog.Duration("latency", latency),
				slog.Any("error", err),
			)
		} else {
			// Skip logging for health checks to keep logs clean
			if path != "/api/health" {
				slog.Info("HTTP request",
					slog.String("method", method),
					slog.String("path", path),
					slog.Int("status", status),
					slog.String("ip", ip),
					slog.Duration("latency", latency),
				)
			}
		}
		return err
	})

	// Rate Limiter middleware (Wave 1 / Audit recommendation)
	limiterCfg := limiter.Config{
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
	}

	// Use Redis storage for rate limiting if available
	if redisStore := db.NewRedisStorage(); redisStore != nil {
		limiterCfg.Storage = redisStore
		slog.Info("Rate Limiter: using Redis storage backend")
	} else {
		slog.Info("Rate Limiter: using default in-memory storage backend")
	}

	app.Use(limiter.New(limiterCfg))

	// CSRF Protection middleware (Wave 1 security requirement / Audit recommendation)
	app.Use(csrf.New(csrf.Config{
		KeyLookup:      "header:X-CSRF-Token",
		CookieName:     "csrf_token",
		CookieSameSite: "Lax",
		CookieSecure:   config.AppConfig.CookieSecure,
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

	// Setup channel to listen for interrupt/termination signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		slog.Info("Starting Go server", slog.String("port", config.AppConfig.Port))
		if err := app.Listen(":" + config.AppConfig.Port); err != nil && err != http.ErrServerClosed {
			slog.Error("Failed to start server", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	// Block until a signal is received
	sig := <-sigChan
	slog.Info("Received OS signal. Shutting down gracefully...", slog.String("signal", sig.String()))

	// Shutdown Fiber app with a 10s timeout
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		slog.Error("Graceful shutdown error", slog.Any("error", err))
	} else {
		slog.Info("Server stopped successfully")
	}
}
