package cli

import (
	"bufio"
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"yourmsgr/db"
	"yourmsgr/utils"

	"github.com/jackc/pgx/v5"
	"github.com/mattn/go-isatty"
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

  users:get <login>
      Show detailed info about one user

  users:create [login] [password] [username] [--admin]
      Create a user interactively or from arguments

  users:create-auto [--admin]
      Create an account with generated credentials

  users:create-admin [login] [password] [username]
      Create an admin user

  users:bootstrap-admin [login] [password] [username]
      Create the first admin only when there is no admin yet

  users:role <login> <user|admin>
      Change user role

  users:logout <login>
      Invalidate all sessions for a user

  users:delete <login> [--yes]
      Delete user with confirmation

  messages:purge-group <login> [--yes]
      Delete all group messages for a user

  messages:admin-post <admin-login> <message>
      Publish an admin announcement to the general chat
	`)
}

// generateRandomString returns a secure random string of charset characters
func generateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func askInteractive(promptText string, defaultValue string) string {
	fmt.Printf("%s [%s]: ", promptText, defaultValue)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		if text == "" {
			return defaultValue
		}
		return text
	}
	return defaultValue
}

func confirmInteractive(promptText string) bool {
	fmt.Printf("%s (yes/no): ", promptText)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		text := strings.ToLower(strings.TrimSpace(scanner.Text()))
		return text == "yes"
	}
	return false
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

	case "users:get":
		if len(args) < 2 {
			log.Fatal("Usage: users:get <login>")
		}
		getUserDetails(ctx, args[1])

	case "users:create":
		createUserCmd(ctx, args[1:], false)

	case "users:create-auto":
		isAdmin := false
		for _, arg := range args {
			if arg == "--admin" {
				isAdmin = true
			}
		}
		createAutoUser(ctx, isAdmin)

	case "users:create-admin":
		createUserCmd(ctx, args[1:], true)

	case "users:bootstrap-admin":
		bootstrapAdmin(ctx, args[1:])

	case "users:role":
		if len(args) < 3 {
			log.Fatal("Usage: users:role <login> <user|admin>")
		}
		changeUserRole(ctx, args[1], args[2])

	case "users:logout":
		if len(args) < 2 {
			log.Fatal("Usage: users:logout <login>")
		}
		logoutUser(ctx, args[1])

	case "users:delete":
		if len(args) < 2 {
			log.Fatal("Usage: users:delete <login> [--yes]")
		}
		skipYes := false
		for _, arg := range args {
			if arg == "--yes" {
				skipYes = true
			}
		}
		deleteUser(ctx, args[1], skipYes)

	case "messages:purge-group":
		if len(args) < 2 {
			log.Fatal("Usage: messages:purge-group <login> [--yes]")
		}
		skipYes := false
		for _, arg := range args {
			if arg == "--yes" {
				skipYes = true
			}
		}
		purgeGroupMessages(ctx, args[1], skipYes)

	case "messages:admin-post":
		if len(args) < 3 {
			log.Fatal("Usage: messages:admin-post <admin-login> <message>")
		}
		postAdminAnnouncement(ctx, args[1], args[2:])

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

func createUserInDB(ctx context.Context, login, password, username string, isAdmin bool) {
	normalizedLogin := utils.NormalizeIdentity(login)

	if utils.IsReservedIdentity(login) {
		log.Fatal("Error: Reserved login name")
	}
	if utils.IsReservedIdentity(username) {
		log.Fatal("Error: Reserved username")
	}

	var loginExists bool
	err := db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE login = $1)", normalizedLogin).Scan(&loginExists)
	if err != nil {
		log.Fatalf("Failed to check unique login: %v", err)
	}
	if loginExists {
		log.Fatalf("Error: User '%s' already exists", normalizedLogin)
	}

	var usernameExists bool
	err = db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 OR login = $2)", username, strings.ToLower(username)).Scan(&usernameExists)
	if err != nil {
		log.Fatalf("Failed to check unique username: %v", err)
	}
	if usernameExists {
		log.Fatalf("Error: Username '%s' is already taken", username)
	}

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		log.Fatalf("Password hashing failed: %v", err)
	}

	role := 1 // User
	if isAdmin {
		role = 3 // Admin
	}

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
}

func createUserCmd(ctx context.Context, args []string, forceAdmin bool) {
	var login, password, username string
	isAdmin := forceAdmin

	posArgs := []string{}
	for _, arg := range args {
		if arg == "--admin" {
			isAdmin = true
		} else {
			posArgs = append(posArgs, arg)
		}
	}

	if len(posArgs) > 0 {
		login = posArgs[0]
	}
	if len(posArgs) > 1 {
		password = posArgs[1]
	}
	if len(posArgs) > 2 {
		username = posArgs[2]
	}

	isTerminal := isatty.IsTerminal(os.Stdin.Fd()) && isatty.IsTerminal(os.Stdout.Fd())

	if login == "" || password == "" || username == "" {
		prefix := "user"
		if isAdmin {
			prefix = "admin"
		}
		defaultLogin := prefix + strings.ToLower(generateRandomString(6))
		defaultPassword := generateRandomString(14)
		defaultUsername := defaultLogin

		if !isTerminal {
			if login == "" {
				login = defaultLogin
			}
			if password == "" {
				password = defaultPassword
			}
			if username == "" {
				username = defaultUsername
			}
		} else {
			if login == "" {
				login = askInteractive("Login (6-16 chars)", defaultLogin)
			}
			if password == "" {
				password = askInteractive("Password (8-128 chars)", defaultPassword)
			}
			if username == "" {
				username = askInteractive("Username (6-16 chars)", defaultUsername)
			}
		}
	}

	createUserInDB(ctx, login, password, username, isAdmin)
	roleName := "user"
	if isAdmin {
		roleName = "admin"
	}
	fmt.Printf("Created %s '%s'\n", roleName, login)
}

func createAutoUser(ctx context.Context, isAdmin bool) {
	prefix := "user"
	if isAdmin {
		prefix = "admin"
	}
	login := prefix + strings.ToLower(generateRandomString(6))
	password := generateRandomString(14)
	username := login

	createUserInDB(ctx, login, password, username, isAdmin)

	roleName := "user"
	if isAdmin {
		roleName = "admin"
	}

	fmt.Println("Automatically Created User:")
	fmt.Printf("  Role:                   %s\n", roleName)
	fmt.Printf("  Login:                  %s\n", login)
	fmt.Printf("  Password:               %s\n", password)
}

func bootstrapAdmin(ctx context.Context, args []string) {
	var adminCount int
	err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE role = 3").Scan(&adminCount)
	if err != nil {
		log.Fatalf("Database query failed: %v", err)
	}

	if adminCount > 0 {
		fmt.Println("Admin bootstrap skipped: admin user already exists")
		return
	}

	var login, password, username string

	posArgs := []string{}
	for _, arg := range args {
		if arg != "--admin" {
			posArgs = append(posArgs, arg)
		}
	}

	if len(posArgs) > 0 {
		login = posArgs[0]
	}
	if len(posArgs) > 1 {
		password = posArgs[1]
	}
	if len(posArgs) > 2 {
		username = posArgs[2]
	}

	isTerminal := isatty.IsTerminal(os.Stdin.Fd()) && isatty.IsTerminal(os.Stdout.Fd())

	if login == "" || password == "" || username == "" {
		defaultLogin := "admin" + strings.ToLower(generateRandomString(6))
		defaultPassword := generateRandomString(14)
		defaultUsername := defaultLogin

		if !isTerminal {
			if login == "" {
				login = defaultLogin
			}
			if password == "" {
				password = defaultPassword
			}
			if username == "" {
				username = defaultUsername
			}
		} else {
			if login == "" {
				login = askInteractive("Login (6-16 chars)", defaultLogin)
			}
			if password == "" {
				password = askInteractive("Password (8-128 chars)", defaultPassword)
			}
			if username == "" {
				username = askInteractive("Username (6-16 chars)", defaultUsername)
			}
		}
	}

	createUserInDB(ctx, login, password, username, true)
	fmt.Printf("Bootstrapped admin '%s'\n", login)
}

func getUserDetails(ctx context.Context, login string) {
	if login == "" {
		log.Fatal("Usage: users:get <login>")
	}
	normalized := utils.NormalizeIdentity(login)

	var id, role int
	var dbLogin, username string
	var rToken, pubKey sql.NullString
	var createdAt time.Time

	query := "SELECT id, login, username, role, refresh_token, public_key, created_at FROM users WHERE login = $1"
	err := db.Pool.QueryRow(ctx, query, normalized).Scan(&id, &dbLogin, &username, &role, &rToken, &pubKey, &createdAt)
	if err == pgx.ErrNoRows {
		log.Fatalf("Error: User '%s' not found", normalized)
	} else if err != nil {
		log.Fatalf("Failed to fetch user details: %v", err)
	}

	roleName := "user"
	if role == 3 {
		roleName = "admin"
	}
	hasSession := "false"
	if rToken.Valid && rToken.String != "" {
		hasSession = "true"
	}
	hasPubKey := "false"
	if pubKey.Valid && pubKey.String != "" {
		hasPubKey = "true"
	}

	fmt.Println("User Details:")
	fmt.Printf("  ID:                     %d\n", id)
	fmt.Printf("  Login:                  %s\n", dbLogin)
	fmt.Printf("  Username:               %s\n", username)
	fmt.Printf("  Role:                   %s\n", roleName)
	fmt.Printf("  Has Active Session:     %s\n", hasSession)
	fmt.Printf("  Has Public Key:         %s\n", hasPubKey)
	fmt.Printf("  Created At:             %s\n", createdAt.Format("2006-01-02 15:04:05"))
}

func changeUserRole(ctx context.Context, login, roleValue string) {
	if login == "" || roleValue == "" {
		log.Fatal("Usage: users:role <login> <user|admin>")
	}
	normalizedLogin := utils.NormalizeIdentity(login)
	normalizedRole := strings.ToLower(strings.TrimSpace(roleValue))

	role := 1
	if normalizedRole == "admin" {
		role = 3
	} else if normalizedRole != "user" {
		log.Fatal("Error: Role must be 'user' or 'admin'")
	}

	var exists bool
	err := db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE login = $1)", normalizedLogin).Scan(&exists)
	if err != nil {
		log.Fatalf("Failed to check user: %v", err)
	}
	if !exists {
		log.Fatalf("Error: User '%s' not found", normalizedLogin)
	}

	_, err = db.Pool.Exec(ctx, "UPDATE users SET role = $1 WHERE login = $2", role, normalizedLogin)
	if err != nil {
		log.Fatalf("Failed to update user role: %v", err)
	}

	fmt.Printf("Changed role for '%s' to %s\n", normalizedLogin, normalizedRole)
}

func logoutUser(ctx context.Context, login string) {
	if login == "" {
		log.Fatal("Usage: users:logout <login>")
	}
	normalized := utils.NormalizeIdentity(login)

	var id int
	err := db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE login = $1", normalized).Scan(&id)
	if err == pgx.ErrNoRows {
		log.Fatalf("Error: User '%s' not found", normalized)
	} else if err != nil {
		log.Fatalf("Failed to query user: %v", err)
	}

	_, err = db.Pool.Exec(ctx, "UPDATE users SET refresh_token = NULL WHERE id = $1", id)
	if err != nil {
		log.Fatalf("Failed to logout user: %v", err)
	}

	fmt.Printf("Logged out '%s' from all sessions\n", normalized)
}

func deleteUser(ctx context.Context, login string, skipConfirmation bool) {
	if login == "" {
		log.Fatal("Usage: users:delete <login> [--yes]")
	}
	normalized := utils.NormalizeIdentity(login)

	var id int
	err := db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE login = $1", normalized).Scan(&id)
	if err == pgx.ErrNoRows {
		log.Fatalf("Error: User '%s' not found", normalized)
	} else if err != nil {
		log.Fatalf("Failed to query user: %v", err)
	}

	if !skipConfirmation {
		isTerminal := isatty.IsTerminal(os.Stdin.Fd()) && isatty.IsTerminal(os.Stdout.Fd())
		if isTerminal {
			if !confirmInteractive(fmt.Sprintf("Delete user '%s' and all related data?", normalized)) {
				fmt.Println("Cancelled")
				return
			}
		} else {
			log.Fatal("Error: Confirmation required. Run with --yes flag in non-interactive environment.")
		}
	}

	_, err = db.Pool.Exec(ctx, "DELETE FROM users WHERE id = $1", id)
	if err != nil {
		log.Fatalf("Failed to delete user: %v", err)
	}

	fmt.Printf("Deleted user '%s'\n", normalized)
}

func purgeGroupMessages(ctx context.Context, login string, skipConfirmation bool) {
	if login == "" {
		log.Fatal("Usage: messages:purge-group <login> [--yes]")
	}
	normalized := utils.NormalizeIdentity(login)

	var id int
	err := db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE login = $1", normalized).Scan(&id)
	if err == pgx.ErrNoRows {
		log.Fatalf("Error: User '%s' not found", normalized)
	} else if err != nil {
		log.Fatalf("Failed to query user: %v", err)
	}

	if !skipConfirmation {
		isTerminal := isatty.IsTerminal(os.Stdin.Fd()) && isatty.IsTerminal(os.Stdout.Fd())
		if isTerminal {
			if !confirmInteractive(fmt.Sprintf("Delete all group messages for '%s'?", normalized)) {
				fmt.Println("Cancelled")
				return
			}
		} else {
			log.Fatal("Error: Confirmation required. Run with --yes flag in non-interactive environment.")
		}
	}

	res, err := db.Pool.Exec(ctx, "DELETE FROM messages WHERE user_id = $1 AND (chat_type = 'group' OR chat_id IS NULL)", id)
	if err != nil {
		log.Fatalf("Failed to purge group messages: %v", err)
	}

	fmt.Printf("Deleted %d group messages for '%s'\n", res.RowsAffected(), normalized)
}

func postAdminAnnouncement(ctx context.Context, login string, rawMessageParts []string) {
	if login == "" || len(rawMessageParts) == 0 {
		log.Fatal("Usage: messages:admin-post <admin-login> <message>")
	}
	normalized := utils.NormalizeIdentity(login)

	var id, role int
	err := db.Pool.QueryRow(ctx, "SELECT id, role FROM users WHERE login = $1", normalized).Scan(&id, &role)
	if err == pgx.ErrNoRows {
		log.Fatalf("Error: User '%s' not found", normalized)
	} else if err != nil {
		log.Fatalf("Failed to query user: %v", err)
	}

	if role != 3 {
		log.Fatalf("Error: User '%s' is not an admin", normalized)
	}

	announcement := strings.TrimSpace(strings.Join(rawMessageParts, " "))
	if announcement == "" {
		log.Fatal("Error: Announcement message is required")
	}

	query := `
		INSERT INTO messages (user_id, username, message, chat_type, chat_id, is_encrypted)
		VALUES ($1, 'Admin', $2, 'group', NULL, 0)
		RETURNING id, date
	`
	var msgId int
	var date time.Time
	err = db.Pool.QueryRow(ctx, query, id, announcement).Scan(&msgId, &date)
	if err != nil {
		log.Fatalf("Failed to post announcement: %v", err)
	}

	fmt.Println("Announcement posted successfully:")
	fmt.Printf("  ID:        %d\n", msgId)
	fmt.Printf("  Author:    Admin\n")
	fmt.Printf("  Posted by: %s\n", normalized)
	fmt.Printf("  Date:      %s\n", date.Format("2006-01-02 15:04:05"))
	fmt.Printf("  Message:   %s\n", announcement)
}
