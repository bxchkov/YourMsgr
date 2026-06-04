package utils

import "testing"

func TestPasswordHashing(t *testing.T) {
	password := "my_super_secret_pass"

	hashed, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if hashed == "" || hashed == password {
		t.Errorf("HashPassword returned invalid hash: %s", hashed)
	}

	if !VerifyPassword(hashed, password) {
		t.Error("VerifyPassword failed to match correct password")
	}

	if VerifyPassword(hashed, "wrong_pass") {
		t.Error("VerifyPassword matched incorrect password")
	}
}
