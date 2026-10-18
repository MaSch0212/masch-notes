package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemory  = 64 * 1024
	argonTime    = 3
	argonThreads = 1
	argonKeyLen  = 32
	argonSaltLen = 16
)

var rawB64 = base64.RawStdEncoding

// HashAuthKey hashes the client-derived auth key with argon2id and returns a PHC-style string.
func HashAuthKey(authKey []byte) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}
	h := argon2.IDKey(authKey, salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version,
		argonMemory, argonTime, argonThreads, rawB64.EncodeToString(salt), rawB64.EncodeToString(h)), nil
}

// VerifyAuthKey checks authKey against a string produced by HashAuthKey in constant time.
func VerifyAuthKey(authKey []byte, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 5 || parts[0] != "argon2id" {
		return false
	}
	var version int
	if _, err := fmt.Sscanf(parts[1], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	// Guard against absurd parameters in tampered rows.
	if m == 0 || m > 1<<20 || t == 0 || t > 20 || p == 0 {
		return false
	}
	salt, err := rawB64.DecodeString(parts[3])
	if err != nil {
		return false
	}
	want, err := rawB64.DecodeString(parts[4])
	if err != nil || len(want) == 0 || len(want) > 64 {
		return false
	}
	got := argon2.IDKey(authKey, salt, t, m, p, uint32(len(want))) //nolint:gosec // len bounded above
	return subtle.ConstantTimeCompare(got, want) == 1
}

// FakeKdfSalt returns a deterministic pseudo salt for unknown usernames so that
// prelogin cannot be used to probe which usernames exist.
func FakeKdfSalt(secret []byte, username string) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(strings.ToLower(username)))
	return mac.Sum(nil)[:16]
}
