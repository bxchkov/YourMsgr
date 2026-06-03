package cli

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"yourmsgr/db"
	"yourmsgr/utils"
)

// PrintHelp displays help text for CLI commands
func PrintHelp() {
	fmt.Println(`
YourMsgr Admin CLI

Usage:
  server-go --cli <command> [args]

Commands:
  stats
      Show key project stats

  health
      Check database availability and print summary

  users:list
      List all users in table format

  users:create <login> <password> <username> [--admin]
      Create a user account with mock E2EE keys
	`)
}

// RunCommand parses and executes CLI commands
func RunCommand(args []string) {
	if len(args) == 0 {
		PrintHelp()
		return
	}

	command := args[0]
	ctx := context.Background()

	switch command {
	case "help":
		PrintHelp()

	case "stats":
		showStats(ctx)

	case "health":
		showHealth(ctx)

	case "users:list":
		listUsers(ctx)

	case "users:create":
		if len(args) < 4 {
			log.Fatal("Usage: users:create <login> <password> <username> [--admin]")
		}
		login := args[1]
		password := args[2]
		username := args[3]
		isAdmin := len(args) > 4 && args[4] == "--admin"

		createUser(ctx, login, password, username, isAdmin)

	default:
		fmt.Printf("Unknown command: %s\n", command)
		PrintHelp()
	}
}

func showStats(ctx context.Context) {
	var usersCount, adminsCount, privateChatsCount, messagesCount, groupMessagesCount, privateMessagesCount int

	err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&usersCount)
	if err != nil {
		log.Fatalf("Stats query failed: %v", err)
	}
	db.Pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE role = 3").Scan(&adminsCount)
	db.Pool.QueryRow(ctx, "SELECT count(*) FROM private_chats").Scan(&privateChatsCount)
	db.Pool.QueryRow(ctx, "SELECT count(*) FROM messages").Scan(&messagesCount)
	db.Pool.QueryRow(ctx, "SELECT count(*) FROM messages WHERE chat_type = 'group' OR chat_type IS NULL").Scan(&groupMessagesCount)
	db.Pool.QueryRow(ctx, "SELECT count(*) FROM messages WHERE chat_type = 'private'").Scan(&privateMessagesCount)

	fmt.Println("YourMsgr System Stats:")
	fmt.Printf("  Total Users:            %d\n", usersCount)
	fmt.Printf("  Administrators:         %d\n", adminsCount)
	fmt.Printf("  Private Chats:          %d\n", privateChatsCount)
	fmt.Printf("  Total Messages:         %d\n", messagesCount)
	fmt.Printf("  Group Messages:         %d\n", groupMessagesCount)
	fmt.Printf("  Private Messages:       %d\n", privateMessagesCount)
}

func showHealth(ctx context.Context) {
	err := db.Pool.Ping(ctx)
	status := "OK"
	details := "Database connection successfully verified"
	if err != nil {
		status = "FAIL"
		details = err.Error()
	}

	fmt.Println("System Health Status:")
	fmt.Printf("  Database Ping:          [%s] (%s)\n", status, details)
}

func listUsers(ctx context.Context) {
	rows, err := db.Pool.Query(ctx, "SELECT id, login, username, role, created_at FROM users ORDER BY created_at DESC")
	if err != nil {
		log.Fatalf("Failed to fetch users: %v", err)
	}
	defer rows.Close()

	fmt.Printf("%-5s | %-15s | %-15s | %-5s | %-20s\n", "ID", "Login", "Username", "Role", "Created At")
	fmt.Println(strings.Repeat("-", 68))
	for rows.Next() {
		var id, role int
		var login, username string
		var createdAt time.Time

		if err := rows.Scan(&id, &login, &username, &role, &createdAt); err != nil {
			log.Fatalf("Row scan failed: %v", err)
		}
		roleName := "user"
		if role == 3 {
			roleName = "admin"
		}
		fmt.Printf("%-5d | %-15s | %-15s | %-5s | %-20s\n", id, login, username, roleName, createdAt.Format("2006-01-02 15:04:05"))
	}
}

func createUser(ctx context.Context, login, password, username string, isAdmin bool) {
	normalizedLogin := utils.NormalizeIdentity(login)

	if utils.IsReservedIdentity(login) {
		log.Fatal("Error: Reserved login name")
	}
	if utils.IsReservedIdentity(username) {
		log.Fatal("Error: Reserved username")
	}

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		log.Fatalf("Password hashing failed: %v", err)
	}

	role := 1 // User
	if isAdmin {
		role = 3 // Admin
	}

	// Create mock E2EE keys (Wave 2 CLI E2EE placeholder requirement)
	mockPublicKey := "MOCK_PUBLIC_KEY_" + utils.NormalizeIdentity(username)
	mockPrivateKey := "MOCK_PRIVATE_KEY_ENCRYPTED"

	query := `
		INSERT INTO users (login, password, username, role, public_key, encrypted_private_key) 
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err = db.Pool.Exec(ctx, query, normalizedLogin, hashedPassword, username, role, mockPublicKey, mockPrivateKey)
	if err != nil {
		log.Fatalf("Failed to create user in DB: %v", err)
	}

	fmt.Printf("User '%s' (%s) successfully created. Role: %d. Mock E2EE keys generated.\n", username, login, role)
}
