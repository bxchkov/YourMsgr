package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
)

// HashRefreshToken hashes a refresh token using HMAC-SHA256 with the secret key
func HashRefreshToken(token string, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(token))
	return hex.EncodeToString(h.Sum(nil))
}

// VerifyRefreshTokenHash compares a candidate refresh token with the stored hash in constant time
func VerifyRefreshTokenHash(token string, storedHash *string, secret string) bool {
	if storedHash == nil {
		return false
	}

	incomingHash := HashRefreshToken(token, secret)
	// subtle.ConstantTimeCompare prevents timing attacks
	return subtle.ConstantTimeCompare([]byte(incomingHash), []byte(*storedHash)) == 1
}
