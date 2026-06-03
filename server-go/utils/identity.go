package utils

import "strings"

var reservedIdentifiers = map[string]bool{
	"admin":         true,
	"administrator": true,
	"owner":         true,
	"root":          true,
	"system":        true,
	"support":       true,
	"moder":         true,
	"mod":           true,
	"moderator":     true,
	"administator":  true, // protect against anti-phishing misspelling
}

// NormalizeIdentity trims and lowercases the input string
func NormalizeIdentity(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// IsReservedIdentity returns true if the input identity is reserved
func IsReservedIdentity(value string) bool {
	return reservedIdentifiers[NormalizeIdentity(value)]
}
