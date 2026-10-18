// Package auth contains password hashing, key derivation helpers and tokens.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // PBKDF2-HMAC-SHA1 is the legacy format
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

const (
	legacyAlgorithm  = "pbkdf2"
	legacyIterations = 5000
	legacySaltSize   = 8
	legacyHashSize   = 24
)

func legacyPBKDF2(password string, salt []byte, iter, size int) ([]byte, error) {
	return pbkdf2.Key(sha1.New, password, salt, iter, size)
}

// VerifyLegacyHash checks password against a stored "pbkdf2:<iter>:<b64 salt>:<b64 hash>"
// value. An empty stored hash accepts only the empty password (legacy quirk).
func VerifyLegacyHash(password, stored string) bool {
	if stored == "" {
		return password == ""
	}
	parts := strings.Split(stored, ":")
	if len(parts) != 4 || parts[0] != legacyAlgorithm {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 1 {
		return false
	}
	salt, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	want, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil || len(want) == 0 {
		return false
	}
	got, err := legacyPBKDF2(password, salt, iter, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// NewLegacyHash creates a legacy-format hash. Intended for tests only.
func NewLegacyHash(password string) string {
	salt := make([]byte, legacySaltSize)
	_, _ = rand.Read(salt)
	hash, err := legacyPBKDF2(password, salt, legacyIterations, legacyHashSize)
	if err != nil {
		panic(err)
	}
	return strings.Join([]string{
		legacyAlgorithm,
		strconv.Itoa(legacyIterations),
		base64.StdEncoding.EncodeToString(salt),
		base64.StdEncoding.EncodeToString(hash),
	}, ":")
}

// ParseLegacyKeyParams parses the settings value "pbkdf2:5000:<b64 salt>:32" and returns the salt.
func ParseLegacyKeyParams(v string) ([]byte, error) {
	parts := strings.Split(v, ":")
	if len(parts) != 4 {
		return nil, errors.New("legacy key params: expected 4 parts")
	}
	if parts[0] != legacyAlgorithm {
		return nil, fmt.Errorf("legacy key params: unsupported algorithm %q", parts[0])
	}
	if parts[1] != strconv.Itoa(legacyIterations) {
		return nil, fmt.Errorf("legacy key params: unsupported iterations %q", parts[1])
	}
	if parts[3] != "32" {
		return nil, fmt.Errorf("legacy key params: unsupported key size %q", parts[3])
	}
	salt, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("legacy key params: salt: %w", err)
	}
	return salt, nil
}
