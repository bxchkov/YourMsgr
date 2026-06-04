package utils

import (
	"testing"
)

func TestAssertJwtSecret(t *testing.T) {
	tests := []struct {
		secret  string
		name    string
		wantErr bool
	}{
		{"", "JWT_ACCESS_SECRET", true},
		{"short", "JWT_ACCESS_SECRET", true},
		{"secret", "JWT_ACCESS_SECRET", true},
		{"your-secret-access-key-here", "JWT_ACCESS_SECRET", true},
		{"my-secure-access-key-with-long-length-that-is-valid-and-good", "JWT_ACCESS_SECRET", false},
	}

	for _, tt := range tests {
		err := AssertJwtSecret(tt.secret, tt.name)
		if (err != nil) != tt.wantErr {
			t.Errorf("AssertJwtSecret(%q, %q) error = %v, wantErr %v", tt.secret, tt.name, err, tt.wantErr)
		}
	}
}

func TestGenerateAndVerifyTokens(t *testing.T) {
	accessSecret := "my-secure-access-key-with-long-length-that-is-valid-and-good"
	refreshSecret := "my-secure-refresh-key-with-long-length-that-is-valid-and-good"

	accessToken, refreshToken, err := GenerateTokens(1, "test_user", 1, "test_login", accessSecret, refreshSecret)
	if err != nil {
		t.Fatalf("GenerateTokens failed: %v", err)
	}

	if accessToken == "" || refreshToken == "" {
		t.Errorf("GenerateTokens returned empty tokens")
	}

	// Verify Access Token
	claims, err := VerifyToken(accessToken, accessSecret)
	if err != nil {
		t.Fatalf("VerifyToken (access) failed: %v", err)
	}

	if claims.UserID != 1 || claims.UserName != "test_user" || claims.Login != "test_login" {
		t.Errorf("VerifyToken (access) returned invalid claims: %+v", claims)
	}

	// Verify with wrong secret
	_, err = VerifyToken(accessToken, "wrong-secret-with-sufficient-length-to-not-fail-check-here")
	if err == nil {
		t.Error("VerifyToken (access) succeeded with wrong secret")
	}

	// Verify Refresh Token
	refreshClaims, err := VerifyToken(refreshToken, refreshSecret)
	if err != nil {
		t.Fatalf("VerifyToken (refresh) failed: %v", err)
	}

	if refreshClaims.UserID != 1 {
		t.Errorf("VerifyToken (refresh) returned invalid claims: %+v", refreshClaims)
	}
}
