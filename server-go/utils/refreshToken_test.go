package utils

import "testing"

func TestRefreshTokenHashing(t *testing.T) {
	token := "some_random_refresh_token_12345"
	secret := "secret_key_with_sufficient_entropy"

	hashed := HashRefreshToken(token, secret)
	if hashed == "" || hashed == token {
		t.Errorf("HashRefreshToken returned invalid hash: %s", hashed)
	}

	if !VerifyRefreshTokenHash(token, &hashed, secret) {
		t.Error("VerifyRefreshTokenHash failed to match correct token and secret")
	}

	if VerifyRefreshTokenHash(token, &hashed, "wrong_secret") {
		t.Error("VerifyRefreshTokenHash matched with incorrect secret")
	}

	if VerifyRefreshTokenHash("wrong_token", &hashed, secret) {
		t.Error("VerifyRefreshTokenHash matched with incorrect token")
	}

	if VerifyRefreshTokenHash(token, nil, secret) {
		t.Error("VerifyRefreshTokenHash matched with nil hash")
	}
}
