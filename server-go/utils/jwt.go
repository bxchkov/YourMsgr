package utils

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenPayload struct {
	UserID   int    `json:"userId"`
	UserName string `json:"userName"`
	UserRole int    `json:"userRole"`
	Login    string `json:"login"`
	jwt.RegisteredClaims
}

const MinSecretLength = 32

var jwtSecretPlaceholders = map[string]bool{
	"your-secret-access-key-here":  true,
	"your-secret-refresh-key-here": true,
	"change_me":                    true,
	"secret":                       true,
}

// AssertJwtSecret checks that the secret is secure
func AssertJwtSecret(value string, name string) error {
	if value == "" {
		return fmt.Errorf("%s environment variable is not set", name)
	}

	if len(value) < MinSecretLength {
		return fmt.Errorf("%s must be at least %d characters long", name, MinSecretLength)
	}

	if jwtSecretPlaceholders[value] {
		return fmt.Errorf("%s must not use a placeholder value", name)
	}

	return nil
}

// GenerateTokens creates access and refresh tokens for a user
func GenerateTokens(userId int, userName string, userRole int, login string, accessSecret, refreshSecret string) (string, string, error) {
	// Access Token (expires in 15 minutes)
	accessClaims := &TokenPayload{
		UserID:   userId,
		UserName: userName,
		UserRole: userRole,
		Login:    login,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessSigned, err := accessToken.SignedString([]byte(accessSecret))
	if err != nil {
		return "", "", err
	}

	// Refresh Token (expires in 30 days)
	refreshClaims := &TokenPayload{
		UserID:   userId,
		UserName: userName,
		UserRole: userRole,
		Login:    login,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
		},
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshSigned, err := refreshToken.SignedString([]byte(refreshSecret))
	if err != nil {
		return "", "", err
	}

	return accessSigned, refreshSigned, nil
}

// VerifyToken parses and validates a JWT token using the provided secret
func VerifyToken(tokenString string, secret string) (*TokenPayload, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenPayload{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*TokenPayload); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token claims")
}
