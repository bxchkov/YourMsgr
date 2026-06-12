package controllers

import (
	"context"
	"strconv"
	"strings"
	"time"

	"yourmsgr/config"
	"yourmsgr/realtime"
	"yourmsgr/services"
	"yourmsgr/utils"

	"github.com/gofiber/fiber/v2"
)

type AuthController struct {
	authService *services.AuthService
}

func NewAuthController() *AuthController {
	return &AuthController{
		authService: services.NewAuthService(),
	}
}

// Helper to determine if the request is secure (HTTPS)
func (ctrl *AuthController) isSecureRequest(c *fiber.Ctx) bool {
	forwardedProto := c.Get("X-Forwarded-Proto")
	if forwardedProto != "" {
		protos := strings.Split(forwardedProto, ",")
		return strings.TrimSpace(strings.ToLower(protos[0])) == "https"
	}
	return c.Protocol() == "https"
}

// Helper to get refresh token cookie options
func (ctrl *AuthController) getRefreshCookieOptions(c *fiber.Ctx) *fiber.Cookie {
	return &fiber.Cookie{
		Name:     "refreshToken",
		HTTPOnly: true,
		Secure:   ctrl.isSecureRequest(c),
		SameSite: "Strict",
		Path:     "/",
		Expires:  time.Now().Add(30 * 24 * time.Hour), // 30 days
	}
}

// JWTAuthMiddleware verifies the JWT access token and sets user payload in Context locals
func JWTAuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return utils.SendError(c, fiber.StatusUnauthorized, "Unauthorized")
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return utils.SendError(c, fiber.StatusUnauthorized, "Unauthorized")
		}

		tokenString := parts[1]
		claims, err := utils.VerifyToken(tokenString, config.AppConfig.JWTAccessSecret)
		if err != nil {
			return utils.SendError(c, fiber.StatusUnauthorized, "Invalid or expired token")
		}

		// Store user info in Fiber context locals
		c.Locals("userId", claims.UserID)
		c.Locals("username", claims.UserName)
		c.Locals("userRole", claims.UserRole)
		c.Locals("login", claims.Login)

		return c.Next()
	}
}

// RegisterRequest represents the payload for user registration
type RegisterRequest struct {
	Login                   string `json:"login"`
	Password                string `json:"password"`
	Username                string `json:"username"`
	PublicKey               string `json:"publicKey"`
	EncryptedPrivateKey     string `json:"encryptedPrivateKey"`
	EncryptedPrivateKeyIv   string `json:"encryptedPrivateKeyIv"`
	EncryptedPrivateKeySalt string `json:"encryptedPrivateKeySalt"`
}

func (ctrl *AuthController) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid body")
	}

	// Validate inputs
	req.Login = strings.TrimSpace(req.Login)
	req.Username = strings.TrimSpace(req.Username)
	if req.Login == "" || req.Password == "" || req.Username == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Missing credentials")
	}

	if len(req.Login) < 3 || len(req.Login) > 20 {
		return utils.SendError(c, fiber.StatusBadRequest, "Login must be between 3 and 20 characters")
	}
	if len(req.Username) < 3 || len(req.Username) > 20 {
		return utils.SendError(c, fiber.StatusBadRequest, "Username must be between 3 and 20 characters")
	}
	if len(req.Password) < 6 {
		return utils.SendError(c, fiber.StatusBadRequest, "Password must be at least 6 characters")
	}

	ctx := context.Background()
	user, err := ctrl.authService.Register(ctx, req.Login, req.Password, req.Username,
		req.PublicKey, req.EncryptedPrivateKey, req.EncryptedPrivateKeyIv, req.EncryptedPrivateKeySalt)

	if err != nil {
		return utils.SendError(c, fiber.StatusUnauthorized, err.Error())
	}

	// Generate tokens
	accessToken, refreshToken, err := utils.GenerateTokens(user.ID, user.Username, user.Role, user.Login,
		config.AppConfig.JWTAccessSecret, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to generate tokens")
	}

	// Save hashed refresh token to DB
	hashedRefresh := utils.HashRefreshToken(refreshToken, config.AppConfig.JWTRefreshSecret)
	if err := ctrl.authService.SaveRefreshToken(ctx, user.ID, hashedRefresh); err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to save session")
	}

	// Set refresh token in cookie
	cookie := ctrl.getRefreshCookieOptions(c)
	cookie.Value = refreshToken
	c.Cookie(cookie)

	return utils.SendSuccess(c, "User registered successfully", fiber.Map{
		"accessToken": accessToken,
	})
}

// LoginRequest represents the payload for user login
type LoginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

func (ctrl *AuthController) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid body")
	}

	req.Login = strings.TrimSpace(req.Login)
	if req.Login == "" || req.Password == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Missing credentials")
	}

	ctx := context.Background()
	user, err := ctrl.authService.Login(ctx, req.Login, req.Password)
	if err != nil {
		return utils.SendError(c, fiber.StatusUnauthorized, err.Error())
	}

	// Generate tokens
	accessToken, refreshToken, err := utils.GenerateTokens(user.ID, user.Username, user.Role, user.Login,
		config.AppConfig.JWTAccessSecret, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to generate tokens")
	}

	// Save hashed refresh token to DB
	hashedRefresh := utils.HashRefreshToken(refreshToken, config.AppConfig.JWTRefreshSecret)
	if err := ctrl.authService.SaveRefreshToken(ctx, user.ID, hashedRefresh); err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to save session")
	}

	// Set refresh token in cookie
	cookie := ctrl.getRefreshCookieOptions(c)
	cookie.Value = refreshToken
	c.Cookie(cookie)

	return utils.SendSuccess(c, "Login successful", fiber.Map{
		"accessToken":             accessToken,
		"encryptedPrivateKey":     user.EncryptedPrivateKey,
		"encryptedPrivateKeyIv":   user.EncryptedPrivateKeyIv,
		"encryptedPrivateKeySalt": user.EncryptedPrivateKeySalt,
	})
}

func (ctrl *AuthController) Refresh(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	refreshToken := c.Cookies("refreshToken")

	if refreshToken == "" {
		return utils.SendError(c, fiber.StatusForbidden, "Missing refresh token")
	}

	// Verify refresh token
	refreshPayload, err := utils.VerifyToken(refreshToken, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusForbidden, "Invalid refresh token")
	}

	ctx := context.Background()
	user, err := ctrl.authService.GetValidSessionUser(ctx, refreshPayload.UserID, refreshToken, config.AppConfig.JWTRefreshSecret)
	if err != nil || user == nil {
		return utils.SendError(c, fiber.StatusForbidden, "Token mismatch")
	}

	// Match access token ownership if present
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			accessPayload, err := utils.VerifyToken(parts[1], config.AppConfig.JWTAccessSecret)
			if err == nil && accessPayload.UserID != user.ID {
				return utils.SendError(c, fiber.StatusForbidden, "Token mismatch")
			}
		}
	}

	// Generate new tokens
	newAccessToken, newRefreshToken, err := utils.GenerateTokens(user.ID, user.Username, user.Role, user.Login,
		config.AppConfig.JWTAccessSecret, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to generate tokens")
	}

	// Save new hashed refresh token (rotate old session token)
	hashedRefresh := utils.HashRefreshToken(newRefreshToken, config.AppConfig.JWTRefreshSecret)
	if err := ctrl.authService.RotateRefreshToken(ctx, user.ID, refreshToken, hashedRefresh, config.AppConfig.JWTRefreshSecret); err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to save session")
	}

	// Set new cookie
	cookie := ctrl.getRefreshCookieOptions(c)
	cookie.Value = newRefreshToken
	c.Cookie(cookie)

	return utils.SendSuccess(c, "Tokens refreshed", fiber.Map{
		"accessToken": newAccessToken,
	})
}

func (ctrl *AuthController) Logout(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	refreshToken := c.Cookies("refreshToken")
	var logoutUserId int64

	ctx := context.Background()

	// 1. Try to fetch user from Access Token
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			accessPayload, err := utils.VerifyToken(parts[1], config.AppConfig.JWTAccessSecret)
			if err == nil {
				logoutUserId = accessPayload.UserID
			}
		}
	}

	// 2. If access token is invalid, try Refresh Token
	if logoutUserId == 0 && refreshToken != "" {
		refreshPayload, err := utils.VerifyToken(refreshToken, config.AppConfig.JWTRefreshSecret)
		if err == nil {
			user, err := ctrl.authService.GetValidSessionUser(ctx, refreshPayload.UserID, refreshToken, config.AppConfig.JWTRefreshSecret)
			if err == nil && user != nil {
				logoutUserId = user.ID
			}
		}
	}

	// 3. Clear token in DB
	if logoutUserId > 0 {
		if refreshToken != "" {
			ctrl.authService.RemoveRefreshToken(ctx, logoutUserId, refreshToken, config.AppConfig.JWTRefreshSecret)
		} else {
			ctrl.authService.ClearAllRefreshTokens(ctx, logoutUserId)
			realtime.PublishRealtimeEvent(ctx, realtime.RealtimeEvent{
				Type:   "force_logout",
				UserID: logoutUserId,
			})
		}
	}

	// 4. Delete refresh token cookie
	c.ClearCookie("refreshToken")

	return utils.SendSuccess(c, "Logout successful", nil)
}

func (ctrl *AuthController) Session(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	refreshToken := c.Cookies("refreshToken")

	if refreshToken == "" {
		return utils.SendError(c, fiber.StatusForbidden, "Session expired")
	}

	refreshPayload, err := utils.VerifyToken(refreshToken, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusForbidden, "Session expired")
	}

	ctx := context.Background()
	user, err := ctrl.authService.GetValidSessionUser(ctx, refreshPayload.UserID, refreshToken, config.AppConfig.JWTRefreshSecret)
	if err != nil || user == nil {
		return utils.SendError(c, fiber.StatusForbidden, "Session expired")
	}

	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			accessPayload, err := utils.VerifyToken(parts[1], config.AppConfig.JWTAccessSecret)
			if err == nil {
				if accessPayload.UserID != user.ID {
					return utils.SendError(c, fiber.StatusForbidden, "Session expired")
				}
				return utils.SendSuccess(c, "Session valid", fiber.Map{
					"accessToken": parts[1],
				})
			}
		}
	}

	// Restore session with new tokens
	newAccessToken, newRefreshToken, err := utils.GenerateTokens(user.ID, user.Username, user.Role, user.Login,
		config.AppConfig.JWTAccessSecret, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to restore session")
	}

	hashedRefresh := utils.HashRefreshToken(newRefreshToken, config.AppConfig.JWTRefreshSecret)
	if err := ctrl.authService.SaveRefreshToken(ctx, user.ID, hashedRefresh); err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to save session")
	}

	cookie := ctrl.getRefreshCookieOptions(c)
	cookie.Value = newRefreshToken
	c.Cookie(cookie)

	return utils.SendSuccess(c, "Session restored with new tokens", fiber.Map{
		"accessToken": newAccessToken,
	})
}

type UpdateUsernameRequest struct {
	Username string `json:"username"`
}

func (ctrl *AuthController) UpdateUsername(c *fiber.Ctx) error {
	userId := c.Locals("userId").(int64)

	var req UpdateUsernameRequest
	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid body")
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Username) < 3 || len(req.Username) > 20 {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid username")
	}

	ctx := context.Background()
	user, err := ctrl.authService.GetUserById(ctx, userId)
	if err != nil || user == nil {
		return utils.SendError(c, fiber.StatusNotFound, "User not found")
	}

	if user.Username == req.Username {
		return utils.SendError(c, fiber.StatusConflict, "Username unchanged")
	}

	updatedUser, affectedUserIds, err := ctrl.authService.UpdateUsername(ctx, userId, req.Username)
	if err != nil {
		return utils.SendError(c, fiber.StatusConflict, err.Error())
	}

	// Generate new tokens
	accessToken, refreshToken, err := utils.GenerateTokens(updatedUser.ID, updatedUser.Username, updatedUser.Role, updatedUser.Login,
		config.AppConfig.JWTAccessSecret, config.AppConfig.JWTRefreshSecret)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to generate tokens")
	}

	// Invalidate all active sessions because username has changed (embedded in JWT payload)
	ctrl.authService.ClearAllRefreshTokens(ctx, updatedUser.ID)

	hashedRefresh := utils.HashRefreshToken(refreshToken, config.AppConfig.JWTRefreshSecret)
	if err := ctrl.authService.SaveRefreshToken(ctx, updatedUser.ID, hashedRefresh); err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to save session")
	}

	cookie := ctrl.getRefreshCookieOptions(c)
	cookie.Value = refreshToken
	c.Cookie(cookie)

	// Publish realtime sync and force_logout events for scaling
	realtime.PublishRealtimeEvent(ctx, realtime.RealtimeEvent{
		Type: "sync_group_messages",
	})
	realtime.PublishRealtimeEvent(ctx, realtime.RealtimeEvent{
		Type:   "force_logout",
		UserID: updatedUser.ID,
	})
	if len(affectedUserIds) > 0 {
		realtime.PublishRealtimeEvent(ctx, realtime.RealtimeEvent{
			Type:    "sync_private_chats",
			UserIDs: affectedUserIds,
		})
	}

	return utils.SendSuccess(c, "Username updated successfully", fiber.Map{
		"accessToken": accessToken,
		"username":    updatedUser.Username,
	})
}

func (ctrl *AuthController) GetPublicKeys(c *fiber.Ctx) error {
	userId := c.Locals("userId").(int64)
	rawUserIds := c.Query("userIds")
	var targetUserIds []int64

	if rawUserIds != "" {
		parts := strings.Split(rawUserIds, ",")
		for _, part := range parts {
			val, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
			if err == nil && val > 0 {
				targetUserIds = append(targetUserIds, val)
			}
		}

		if len(targetUserIds) == 0 {
			return utils.SendError(c, fiber.StatusBadRequest, "Invalid userIds query")
		}

		if len(targetUserIds) > 50 {
			return utils.SendError(c, fiber.StatusBadRequest, "Too many requested userIds")
		}
	}

	ctx := context.Background()
	publicKeys, err := ctrl.authService.GetPublicKeysForUser(ctx, userId, targetUserIds)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to retrieve public keys")
	}

	return utils.SendSuccess(c, "Public keys retrieved", fiber.Map{
		"publicKeys": publicKeys,
	})
}
