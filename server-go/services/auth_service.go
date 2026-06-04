package services

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"yourmsgr/db"
	"yourmsgr/models"
	"yourmsgr/utils"

	"github.com/jackc/pgx/v5"
)

type AuthService struct{}

func NewAuthService() *AuthService {
	return &AuthService{}
}

// FindUsernameConflict checks if a username or login is already taken
func (s *AuthService) FindUsernameConflict(ctx context.Context, userId int, username string) (bool, error) {
	normalized := utils.NormalizeIdentity(username)

	var query string
	var err error
	var exists bool

	if userId > 0 {
		query = `SELECT EXISTS(
			SELECT 1 FROM users 
			WHERE id != $1 AND (username = $2 OR login = $3)
		)`
		err = db.Pool.QueryRow(ctx, query, userId, username, normalized).Scan(&exists)
	} else {
		query = `SELECT EXISTS(
			SELECT 1 FROM users 
			WHERE username = $1 OR login = $2
		)`
		err = db.Pool.QueryRow(ctx, query, username, normalized).Scan(&exists)
	}

	return exists, err
}

// Register registers a new user with default keys
func (s *AuthService) Register(ctx context.Context, login, password, username, publicKey, encPrivKey, iv, salt string) (*models.User, error) {
	normalizedLogin := utils.NormalizeIdentity(login)

	if utils.IsReservedIdentity(login) {
		return nil, errors.New("Reserved login")
	}
	if utils.IsReservedIdentity(username) {
		return nil, errors.New("Reserved username")
	}

	// Check if user exists by login
	var loginExists bool
	err := db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE login = $1)", normalizedLogin).Scan(&loginExists)
	if err != nil {
		return nil, err
	}
	if loginExists {
		return nil, errors.New("User already exists")
	}

	// Check username conflict
	conflict, err := s.FindUsernameConflict(ctx, 0, username)
	if err != nil {
		return nil, err
	}
	if conflict {
		return nil, errors.New("Username already taken")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return nil, err
	}

	// Insert user
	query := `
		INSERT INTO users (
			login, username, password, public_key, 
			encrypted_private_key, encrypted_private_key_iv, encrypted_private_key_salt
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, login, username, role, created_at
	`
	user := &models.User{}
	err = db.Pool.QueryRow(ctx, query,
		normalizedLogin, username, hashedPassword,
		sql.NullString{String: publicKey, Valid: publicKey != ""},
		sql.NullString{String: encPrivKey, Valid: encPrivKey != ""},
		sql.NullString{String: iv, Valid: iv != ""},
		sql.NullString{String: salt, Valid: salt != ""},
	).Scan(&user.ID, &user.Login, &user.Username, &user.Role, &user.CreatedAt)

	if err != nil {
		return nil, err
	}

	return user, nil
}

// Login verifies credentials and returns user and encrypted keys
func (s *AuthService) Login(ctx context.Context, login, password string) (*models.User, error) {
	normalizedLogin := utils.NormalizeIdentity(login)

	query := `
		SELECT id, login, username, password, role, refresh_token, 
		       public_key, encrypted_private_key, encrypted_private_key_iv, encrypted_private_key_salt, created_at
		FROM users
		WHERE login = $1
	`
	user := &models.User{}
	var passwordHash string
	var pubKey, encPrivKey, iv, salt sql.NullString
	var rToken sql.NullString

	err := db.Pool.QueryRow(ctx, query, normalizedLogin).Scan(
		&user.ID, &user.Login, &user.Username, &passwordHash, &user.Role, &rToken,
		&pubKey, &encPrivKey, &iv, &salt, &user.CreatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, errors.New("Invalid credentials")
	} else if err != nil {
		return nil, err
	}

	if !utils.VerifyPassword(passwordHash, password) {
		return nil, errors.New("Invalid credentials")
	}

	if pubKey.Valid {
		user.PublicKey = &pubKey.String
	}
	if encPrivKey.Valid {
		user.EncryptedPrivateKey = &encPrivKey.String
	}
	if iv.Valid {
		user.EncryptedPrivateKeyIv = &iv.String
	}
	if salt.Valid {
		user.EncryptedPrivateKeySalt = &salt.String
	}
	if rToken.Valid {
		user.RefreshToken = &rToken.String
	}

	return user, nil
}

func parseRefreshTokens(rawToken string) []string {
	if rawToken == "" {
		return []string{}
	}
	rawToken = strings.TrimSpace(rawToken)
	if strings.HasPrefix(rawToken, "[") {
		var tokens []string
		if err := json.Unmarshal([]byte(rawToken), &tokens); err == nil {
			return tokens
		}
	}
	return []string{rawToken}
}

func serializeRefreshTokens(tokens []string) string {
	bytes, err := json.Marshal(tokens)
	if err != nil {
		return "[]"
	}
	return string(bytes)
}

// SaveRefreshToken appends a new refresh token hash to the user's session list
func (s *AuthService) SaveRefreshToken(ctx context.Context, userId int, tokenHash string) error {
	var currentRaw sql.NullString
	err := db.Pool.QueryRow(ctx, "SELECT refresh_token FROM users WHERE id = $1", userId).Scan(&currentRaw)
	if err != nil {
		return err
	}

	var currentTokens []string
	if currentRaw.Valid {
		currentTokens = parseRefreshTokens(currentRaw.String)
	}

	newTokens := []string{tokenHash}
	count := 1
	for _, t := range currentTokens {
		if t != tokenHash && count < 10 {
			newTokens = append(newTokens, t)
			count++
		}
	}

	serialized := serializeRefreshTokens(newTokens)
	_, err = db.Pool.Exec(ctx, "UPDATE users SET refresh_token = $1 WHERE id = $2", serialized, userId)
	return err
}

// ClearRefreshToken removes all refresh token hashes (backwards compatibility)
func (s *AuthService) ClearRefreshToken(ctx context.Context, userId int) error {
	return s.ClearAllRefreshTokens(ctx, userId)
}

// RemoveRefreshToken removes a specific refresh token hash from the session list
func (s *AuthService) RemoveRefreshToken(ctx context.Context, userId int, token string, refreshSecret string) error {
	var currentRaw sql.NullString
	err := db.Pool.QueryRow(ctx, "SELECT refresh_token FROM users WHERE id = $1", userId).Scan(&currentRaw)
	if err != nil {
		return err
	}

	if !currentRaw.Valid || currentRaw.String == "" {
		return nil
	}

	currentTokens := parseRefreshTokens(currentRaw.String)
	targetHash := utils.HashRefreshToken(token, refreshSecret)

	newTokens := []string{}
	for _, t := range currentTokens {
		if t != targetHash {
			newTokens = append(newTokens, t)
		}
	}

	if len(newTokens) == 0 {
		_, err = db.Pool.Exec(ctx, "UPDATE users SET refresh_token = NULL WHERE id = $1", userId)
	} else {
		serialized := serializeRefreshTokens(newTokens)
		_, err = db.Pool.Exec(ctx, "UPDATE users SET refresh_token = $1 WHERE id = $2", serialized, userId)
	}
	return err
}

// RotateRefreshToken replaces an old refresh token hash with a new one in the session list
func (s *AuthService) RotateRefreshToken(ctx context.Context, userId int, oldToken string, newTokenHash string, refreshSecret string) error {
	var currentRaw sql.NullString
	err := db.Pool.QueryRow(ctx, "SELECT refresh_token FROM users WHERE id = $1", userId).Scan(&currentRaw)
	if err != nil {
		return err
	}

	var currentTokens []string
	if currentRaw.Valid {
		currentTokens = parseRefreshTokens(currentRaw.String)
	}

	oldTokenHash := utils.HashRefreshToken(oldToken, refreshSecret)

	newTokens := []string{newTokenHash}
	count := 1
	for _, t := range currentTokens {
		if t != oldTokenHash && t != newTokenHash && count < 10 {
			newTokens = append(newTokens, t)
			count++
		}
	}

	serialized := serializeRefreshTokens(newTokens)
	_, err = db.Pool.Exec(ctx, "UPDATE users SET refresh_token = $1 WHERE id = $2", serialized, userId)
	return err
}

// ClearAllRefreshTokens removes all refresh token hashes for a user
func (s *AuthService) ClearAllRefreshTokens(ctx context.Context, userId int) error {
	_, err := db.Pool.Exec(ctx, "UPDATE users SET refresh_token = NULL WHERE id = $1", userId)
	return err
}

// GetUserById retrieves a user by their ID
func (s *AuthService) GetUserById(ctx context.Context, userId int) (*models.User, error) {
	query := `
		SELECT id, login, username, role, refresh_token, 
		       public_key, encrypted_private_key, encrypted_private_key_iv, encrypted_private_key_salt, created_at
		FROM users
		WHERE id = $1
	`
	user := &models.User{}
	var pubKey, encPrivKey, iv, salt, rToken sql.NullString

	err := db.Pool.QueryRow(ctx, query, userId).Scan(
		&user.ID, &user.Login, &user.Username, &user.Role, &rToken,
		&pubKey, &encPrivKey, &iv, &salt, &user.CreatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, nil
	} else if err != nil {
		return nil, err
	}

	if pubKey.Valid {
		user.PublicKey = &pubKey.String
	}
	if encPrivKey.Valid {
		user.EncryptedPrivateKey = &encPrivKey.String
	}
	if iv.Valid {
		user.EncryptedPrivateKeyIv = &iv.String
	}
	if salt.Valid {
		user.EncryptedPrivateKeySalt = &salt.String
	}
	if rToken.Valid {
		user.RefreshToken = &rToken.String
	}

	return user, nil
}

// GetValidSessionUser retrieves user and verifies refresh token hash match
func (s *AuthService) GetValidSessionUser(ctx context.Context, userId int, refreshToken, refreshSecret string) (*models.User, error) {
	user, err := s.GetUserById(ctx, userId)
	if err != nil || user == nil {
		return nil, err
	}

	if user.RefreshToken == nil {
		return nil, nil
	}

	tokens := parseRefreshTokens(*user.RefreshToken)
	incomingHash := utils.HashRefreshToken(refreshToken, refreshSecret)

	matched := false
	for _, t := range tokens {
		if subtle.ConstantTimeCompare([]byte(incomingHash), []byte(t)) == 1 {
			matched = true
			break
		}
	}

	if !matched {
		return nil, nil
	}

	return user, nil
}

// UpdateUsername updates the user's username across users and messages
func (s *AuthService) UpdateUsername(ctx context.Context, userId int, newUsername string) (*models.User, []int, error) {
	normalized := strings.TrimSpace(newUsername)

	if utils.IsReservedIdentity(normalized) {
		return nil, nil, errors.New("Reserved username")
	}

	conflict, err := s.FindUsernameConflict(ctx, userId, normalized)
	if err != nil {
		return nil, nil, err
	}
	if conflict {
		return nil, nil, errors.New("Username already taken")
	}

	// Begin transaction to ensure consistency
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	// Update user's username
	user := &models.User{}
	err = tx.QueryRow(ctx, "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, login, username, role, created_at", normalized, userId).
		Scan(&user.ID, &user.Login, &user.Username, &user.Role, &user.CreatedAt)
	if err != nil {
		return nil, nil, err
	}

	// Update username in messages
	_, err = tx.Exec(ctx, "UPDATE messages SET username = $1 WHERE user_id = $2", normalized, userId)
	if err != nil {
		return nil, nil, err
	}

	// Find affected user IDs (users having private chats with this user)
	rows, err := tx.Query(ctx, "SELECT user1_id, user2_id FROM private_chats WHERE user1_id = $1 OR user2_id = $1", userId)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	affectedSet := map[int]bool{userId: true}
	for rows.Next() {
		var u1, u2 int
		if err := rows.Scan(&u1, &u2); err != nil {
			return nil, nil, err
		}
		affectedSet[u1] = true
		affectedSet[u2] = true
	}

	affectedUserIds := make([]int, 0, len(affectedSet))
	for id := range affectedSet {
		affectedUserIds = append(affectedUserIds, id)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	return user, affectedUserIds, nil
}

// GetPublicKeysForUser returns public keys of users sharing private chats with the requester
func (s *AuthService) GetPublicKeysForUser(ctx context.Context, userId int, targetUserIds []int) ([]map[string]interface{}, error) {
	// Find all private chats of this user
	rows, err := db.Pool.Query(ctx, "SELECT user1_id, user2_id FROM private_chats WHERE user1_id = $1 OR user2_id = $1", userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	relatedSet := map[int]bool{userId: true}
	for rows.Next() {
		var u1, u2 int
		if err := rows.Scan(&u1, &u2); err != nil {
			return nil, err
		}
		relatedSet[u1] = true
		relatedSet[u2] = true
	}

	var allowedUserIds []int
	if len(targetUserIds) > 0 {
		// Filter targetUserIds to only those that share a chat (are in relatedSet)
		seen := map[int]bool{}
		for _, tid := range targetUserIds {
			if relatedSet[tid] && !seen[tid] {
				allowedUserIds = append(allowedUserIds, tid)
				seen[tid] = true
			}
		}
	} else {
		// Default to all related users
		for rid := range relatedSet {
			allowedUserIds = append(allowedUserIds, rid)
		}
	}

	if len(allowedUserIds) == 0 {
		return []map[string]interface{}{}, nil
	}

	// Fetch public keys
	query := "SELECT id, username, public_key FROM users WHERE id = ANY($1) AND public_key IS NOT NULL"
	uRows, err := db.Pool.Query(ctx, query, allowedUserIds)
	if err != nil {
		return nil, err
	}
	defer uRows.Close()

	var result []map[string]interface{}
	for uRows.Next() {
		var id int
		var username, pubKey string
		if err := uRows.Scan(&id, &username, &pubKey); err != nil {
			return nil, err
		}
		result = append(result, map[string]interface{}{
			"userId":    id,
			"username":  username,
			"publicKey": pubKey,
		})
	}

	return result, nil
}
