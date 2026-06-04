package services

import (
	"context"
	"crypto/rand"
	"fmt"
	"testing"
	"time"

	"yourmsgr/config"
	"yourmsgr/db"
	"yourmsgr/utils"

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
	// Override/check test database URL, default to standard docker-compose port if not set
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

func TestAuthService_RegisterAndLogin(t *testing.T) {
	setupTestDB(t)
	if db.Pool == nil {
		return
	}

	ctx := context.Background()
	authService := NewAuthService()

	uniqueID := generateRandomString(8)
	login := "test_" + uniqueID
	password := "secure_password_123"
	username := "User " + uniqueID

	// Clean up user after test
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM users WHERE login = $1", login)
	})

	// 1. Test Register
	user, err := authService.Register(ctx, login, password, username, "pubkey_data", "privkey_data", "iv_data", "salt_data")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	if user.Login != login || user.Username != username {
		t.Errorf("Registered user details mismatch: got login %q, username %q", user.Login, user.Username)
	}

	// 2. Register Duplicate Login
	_, err = authService.Register(ctx, login, password, "Another Username", "pub", "priv", "iv", "salt")
	if err == nil {
		t.Error("Expected error when registering duplicate login, got nil")
	}

	// 3. Test Login Success
	loggedInUser, err := authService.Login(ctx, login, password)
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	if loggedInUser.ID != user.ID {
		t.Errorf("LoggedIn user ID mismatch: got %d, expected %d", loggedInUser.ID, user.ID)
	}

	// 4. Test Login Fail (Wrong Password)
	_, err = authService.Login(ctx, login, "wrong_password")
	if err == nil {
		t.Error("Expected error when logging in with incorrect password, got nil")
	}
}

func TestAuthService_UsernameUpdate(t *testing.T) {
	setupTestDB(t)
	if db.Pool == nil {
		return
	}

	ctx := context.Background()
	authService := NewAuthService()

	uniqueID := generateRandomString(8)
	login := "test_update_" + uniqueID
	password := "password_123"
	username := "OldName" + uniqueID
	newName := "NewName" + uniqueID

	user, err := authService.Register(ctx, login, password, username, "pubkey", "privkey", "iv", "salt")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	})

	// 1. Update Username
	updatedUser, affectedIds, err := authService.UpdateUsername(ctx, user.ID, newName)
	if err != nil {
		t.Fatalf("Failed to update username: %v", err)
	}

	if updatedUser.Username != newName {
		t.Errorf("Updated username mismatch: got %q, expected %q", updatedUser.Username, newName)
	}

	// We expect at least the user's own ID in affected IDs
	foundSelf := false
	for _, id := range affectedIds {
		if id == user.ID {
			foundSelf = true
			break
		}
	}
	if !foundSelf {
		t.Error("Expected user's own ID in affected IDs list after username update")
	}

	// 2. Check conflict with existing username
	conflict, err := authService.FindUsernameConflict(ctx, 0, newName)
	if err != nil {
		t.Fatalf("FindUsernameConflict query failed: %v", err)
	}
	if !conflict {
		t.Errorf("Expected username conflict for %q, but got none", newName)
	}
}

func TestAuthService_MultiSessions(t *testing.T) {
	setupTestDB(t)
	if db.Pool == nil {
		return
	}

	ctx := context.Background()
	authService := NewAuthService()

	uniqueID := generateRandomString(8)
	login := "test_session_" + uniqueID
	password := "pass123"
	username := "SessionUser" + uniqueID
	secret := "my-secure-jwt-refresh-secret-key-32-chars-long"

	user, err := authService.Register(ctx, login, password, username, "pub", "priv", "iv", "salt")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	})

	// Create 2 different sessions (refresh tokens)
	token1 := "refresh_token_device_1_" + uniqueID
	token2 := "refresh_token_device_2_" + uniqueID

	hash1 := utils.HashRefreshToken(token1, secret)
	hash2 := utils.HashRefreshToken(token2, secret)

	// Save session 1
	err = authService.SaveRefreshToken(ctx, user.ID, hash1)
	if err != nil {
		t.Fatalf("SaveRefreshToken 1 failed: %v", err)
	}

	// Save session 2
	err = authService.SaveRefreshToken(ctx, user.ID, hash2)
	if err != nil {
		t.Fatalf("SaveRefreshToken 2 failed: %v", err)
	}

	// 1. Verify both sessions are active (multi-session test)
	u1, err := authService.GetValidSessionUser(ctx, user.ID, token1, secret)
	if err != nil || u1 == nil {
		t.Errorf("Session 1 should be valid: %v", err)
	}

	u2, err := authService.GetValidSessionUser(ctx, user.ID, token2, secret)
	if err != nil || u2 == nil {
		t.Errorf("Session 2 should be valid: %v", err)
	}

	// 2. Rotate Session 1 to Token 3
	token3 := "refresh_token_device_1_rotated_" + uniqueID
	hash3 := utils.HashRefreshToken(token3, secret)

	err = authService.RotateRefreshToken(ctx, user.ID, token1, hash3, secret)
	if err != nil {
		t.Fatalf("RotateRefreshToken failed: %v", err)
	}

	// Verify old session 1 token is invalid
	u1old, _ := authService.GetValidSessionUser(ctx, user.ID, token1, secret)
	if u1old != nil {
		t.Error("Old rotated session 1 token should be invalid")
	}

	// Verify new rotated session 1 token is valid
	u1new, _ := authService.GetValidSessionUser(ctx, user.ID, token3, secret)
	if u1new == nil {
		t.Error("New rotated session 1 token should be valid")
	}

	// Verify session 2 remains unaffected
	u2after, _ := authService.GetValidSessionUser(ctx, user.ID, token2, secret)
	if u2after == nil {
		t.Error("Session 2 should remain valid after session 1 rotation")
	}

	// 3. Remove Session 2
	err = authService.RemoveRefreshToken(ctx, user.ID, token2, secret)
	if err != nil {
		t.Fatalf("RemoveRefreshToken failed: %v", err)
	}

	u2deleted, _ := authService.GetValidSessionUser(ctx, user.ID, token2, secret)
	if u2deleted != nil {
		t.Error("Session 2 should be invalid after removal")
	}

	// Verify session 1 rotated remains active
	u1final, _ := authService.GetValidSessionUser(ctx, user.ID, token3, secret)
	if u1final == nil {
		t.Error("Rotated session 1 should remain valid after session 2 removal")
	}

	// 4. Clear all sessions
	err = authService.ClearAllRefreshTokens(ctx, user.ID)
	if err != nil {
		t.Fatalf("ClearAllRefreshTokens failed: %v", err)
	}

	u1cleared, _ := authService.GetValidSessionUser(ctx, user.ID, token3, secret)
	if u1cleared != nil {
		t.Error("All sessions should be invalid after ClearAllRefreshTokens")
	}
}
