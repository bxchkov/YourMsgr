package utils

import "testing"

func TestNormalizeIdentity(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"  User  ", "user"},
		{"Admin", "admin"},
		{"SUPPORT", "support"},
		{"  ", ""},
	}

	for _, test := range tests {
		result := NormalizeIdentity(test.input)
		if result != test.expected {
			t.Errorf("NormalizeIdentity(%q) = %q; expected %q", test.input, result, test.expected)
		}
	}
}

func TestIsReservedIdentity(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"admin", true},
		{"ADMIN  ", true},
		{"administrator", true},
		{"administator", true}, // typo check
		{"normal_user", false},
		{"random_guy", false},
	}

	for _, test := range tests {
		result := IsReservedIdentity(test.input)
		if result != test.expected {
			t.Errorf("IsReservedIdentity(%q) = %v; expected %v", test.input, result, test.expected)
		}
	}
}
