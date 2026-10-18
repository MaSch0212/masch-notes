package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
)

func TestLegacyCryptoMatchesVectors(t *testing.T) {
	raw, err := os.ReadFile("../../internal/auth/testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Username, Password, LegacyKeySalt, LegacyKey, Plaintext, Ciphertext string
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	salt, _ := base64.StdEncoding.DecodeString(v.LegacyKeySalt)
	key, err := legacyKey(v.Username, v.Password, salt)
	if err != nil {
		t.Fatal(err)
	}
	if got := base64.StdEncoding.EncodeToString(key); got != v.LegacyKey {
		t.Fatalf("key = %s, want %s", got, v.LegacyKey)
	}
	ct, err := legacyEncrypt(key, v.Plaintext)
	if err != nil {
		t.Fatal(err)
	}
	if got := base64.StdEncoding.EncodeToString(ct); got != v.Ciphertext {
		t.Fatalf("ciphertext = %s, want %s", got, v.Ciphertext)
	}
}
