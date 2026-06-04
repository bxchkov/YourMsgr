package realtime

import (
	"context"
	"crypto/rand"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"yourmsgr/config"
	"yourmsgr/db"
	"yourmsgr/services"
	"yourmsgr/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

func generateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func setupTestDB(t *testing.T) {
	config.LoadConfig()
	dbURL := config.AppConfig.DatabaseURL
	if dbURL == "" {
		dbURL = "postgresql://chat_user:chat_password@localhost:5432/chat"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("Skipping integration test: failed to connect to Postgres: %v", err)
		return
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("Skipping integration test: failed to ping Postgres: %v", err)
		return
	}

	db.Pool = pool
	t.Cleanup(func() {
		db.Pool.Close()
	})
}

func TestWebSocket_ConnectionAndLimits(t *testing.T) {
	setupTestDB(t)
	if db.Pool == nil {
		return
	}

	ctx := context.Background()
	authService := services.NewAuthService()

	// Register test user
	uniqueID := generateRandomString(8)
	login := "ws_user_" + uniqueID
	password := "pass123"
	username := "WsUser" + uniqueID
	secret := "my-secure-jwt-refresh-secret-key-32-chars-long"
	config.AppConfig.JWTRefreshSecret = secret

	user, err := authService.Register(ctx, login, password, username, "pub", "priv", "iv", "salt")
	if err != nil {
		t.Fatalf("Failed to register test user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	})

	// Generate and save token
	_, refreshToken, err := utils.GenerateTokens(user.ID, user.Username, user.Role, user.Login, "my-secure-access-key-32-chars-long-here", secret)
	if err != nil {
		t.Fatalf("Failed to generate tokens: %v", err)
	}
	hash := utils.HashRefreshToken(refreshToken, secret)
	err = authService.SaveRefreshToken(ctx, user.ID, hash)
	if err != nil {
		t.Fatalf("Failed to save refresh token hash: %v", err)
	}

	// Initialize WebSocket hub
	InitHub()

	// Setup Fiber App
	app := fiber.New()
	app.Get("/ws", WebSocketUpgradeMiddleware(), CreateWebSocketHandler())

	// Listen on random port
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to listen on port: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port

	go func() {
		_ = app.Listener(ln)
	}()
	defer func() {
		_ = app.Shutdown()
	}()

	// WebSocket Dialer with auth cookie
	dialer := websocket.Dialer{}
	header := http.Header{}
	header.Add("Cookie", fmt.Sprintf("refreshToken=%s", refreshToken))

	wsURL := fmt.Sprintf("ws://127.0.0.1:%d/ws", port)

	// 1. Establish 5 successful connections (MaxWsConnectionsPerUser = 5)
	conns := make([]*websocket.Conn, 0)
	for i := 0; i < 5; i++ {
		conn, resp, err := dialer.Dial(wsURL, header)
		if err != nil {
			t.Fatalf("Connection %d failed to dial: %v", i+1, err)
		}
		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Errorf("Connection %d expected 101 status, got %d", i+1, resp.StatusCode)
		}
		conns = append(conns, conn)
	}

	// 2. The 6th connection must be rejected due to limits
	_, _, err = dialer.Dial(wsURL, header)
	if err == nil {
		t.Error("Expected 6th connection to be rejected, but it succeeded")
	}

	// Close all connections to cleanup
	for _, conn := range conns {
		_ = conn.Close()
	}
}
