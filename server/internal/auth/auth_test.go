package auth

import (
	"bytes"
	"crypto/pbkdf2"
	"crypto/sha1" //nolint:gosec // legacy
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

type vectors struct {
	Username        string `json:"username"`
	Password        string `json:"password"`
	LegacyHash      string `json:"legacyHash"`
	EncryptPass     string `json:"encryptPass"`
	LegacyKeyParams string `json:"legacyKeyParams"`
	LegacyKeySalt   string `json:"legacyKeySalt"`
	LegacyKey       string `json:"legacyKey"`
}

func loadVectors(t *testing.T) vectors {
	t.Helper()
	b, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestVerifyLegacyHashDotNetVector(t *testing.T) {
	v := loadVectors(t)
	if !VerifyLegacyHash(v.Password, v.LegacyHash) {
		t.Fatal("expected .NET hash to verify")
	}
}

func TestVerifyLegacyHashWrongPassword(t *testing.T) {
	v := loadVectors(t)
	if VerifyLegacyHash(v.Password+"x", v.LegacyHash) {
		t.Fatal("wrong password accepted")
	}
	h := NewLegacyHash("secret")
	if !VerifyLegacyHash("secret", h) || VerifyLegacyHash("Secret", h) {
		t.Fatal("round trip failed")
	}
	if VerifyLegacyHash("x", "garbage") || VerifyLegacyHash("x", "pbkdf2:5000:!!:!!") {
		t.Fatal("malformed hash accepted")
	}
}

func TestVerifyLegacyHashEmptyQuirk(t *testing.T) {
	if !VerifyLegacyHash("", "") {
		t.Fatal("empty/empty should verify")
	}
	if VerifyLegacyHash("x", "") {
		t.Fatal("non-empty password with empty hash must fail")
	}
}

func TestLegacyDerivationsMatchDotNet(t *testing.T) {
	v := loadVectors(t)
	ep, err := pbkdf2.Key(sha1.New, v.Username, []byte(v.Password), 5000, 64) //nolint:gosec // legacy
	if err != nil {
		t.Fatal(err)
	}
	if got := base64.StdEncoding.EncodeToString(ep); got != v.EncryptPass {
		t.Fatalf("encrypt pass %q != %q", got, v.EncryptPass)
	}
	salt, err := ParseLegacyKeyParams(v.LegacyKeyParams)
	if err != nil {
		t.Fatal(err)
	}
	if base64.StdEncoding.EncodeToString(salt) != v.LegacyKeySalt {
		t.Fatal("salt mismatch")
	}
	k, err := pbkdf2.Key(sha1.New, v.EncryptPass, salt, 5000, 32) //nolint:gosec // legacy
	if err != nil {
		t.Fatal(err)
	}
	if got := base64.StdEncoding.EncodeToString(k); got != v.LegacyKey {
		t.Fatalf("legacy key %q != %q", got, v.LegacyKey)
	}
}

func TestParseLegacyKeyParams(t *testing.T) {
	salt, err := ParseLegacyKeyParams("pbkdf2:5000:AAECAwQFBgcICQoLDA0ODw==:32")
	if err != nil || len(salt) != 16 {
		t.Fatalf("%v %v", salt, err)
	}
	for _, bad := range []string{
		"", "pbkdf2:5000:AAEC", "pbkdf2:5000:AAEC:32:x", "md5:5000:AAEC:32",
		"pbkdf2:1:AAEC:32", "pbkdf2:5000:AAEC:16", "pbkdf2:5000:!!:32",
	} {
		if _, err := ParseLegacyKeyParams(bad); err == nil {
			t.Errorf("expected error for %q", bad)
		}
	}
}

func TestArgonRoundTrip(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	h, err := HashAuthKey(key)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "argon2id$v=19$m=65536,t=3,p=1$") {
		t.Fatalf("format: %s", h)
	}
	if !VerifyAuthKey(key, h) {
		t.Fatal("should verify")
	}
	if VerifyAuthKey(bytes.Repeat([]byte{8}, 32), h) {
		t.Fatal("wrong key accepted")
	}
	h2, _ := HashAuthKey(key)
	if h == h2 {
		t.Fatal("salt must be random")
	}
}

func TestArgonRejectsTampered(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	h, _ := HashAuthKey(key)
	parts := strings.Split(h, "$")
	tampered := []string{
		strings.Join(parts[:4], "$"),
		strings.Replace(h, "m=65536", "m=1024", 1),
		strings.Join(append(parts[:4:4], "AAAA"), "$"),
		"argon2i" + h[len("argon2id"):],
		"",
		"pbkdf2:5000:AAEC:AAEC",
	}
	for _, s := range tampered {
		if VerifyAuthKey(key, s) {
			t.Errorf("accepted %q", s)
		}
	}
}

func TestTokensIssueParse(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	tk := NewTokens([]byte("k"), func() time.Time { return now })
	s, exp, err := tk.Issue(42, false)
	if err != nil {
		t.Fatal(err)
	}
	if !exp.Equal(now.Add(2 * time.Hour)) {
		t.Fatalf("exp %v", exp)
	}
	id, err := tk.Parse(s)
	if err != nil || id != 42 {
		t.Fatalf("%d %v", id, err)
	}
	if _, err := tk.Parse("garbage"); err == nil {
		t.Fatal("expected error")
	}
}

func TestTokensExpiry(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	clock := now
	tk := NewTokens([]byte("k"), func() time.Time { return clock })
	short, _, _ := tk.Issue(1, false)
	long, exp, _ := tk.Issue(1, true)
	if !exp.Equal(now.Add(365 * 24 * time.Hour)) {
		t.Fatalf("long exp %v", exp)
	}
	clock = now.Add(3 * time.Hour)
	if _, err := tk.Parse(short); err == nil {
		t.Fatal("short token should be expired")
	}
	if _, err := tk.Parse(long); err != nil {
		t.Fatalf("long token should be valid: %v", err)
	}
	clock = now.Add(366 * 24 * time.Hour)
	if _, err := tk.Parse(long); err == nil {
		t.Fatal("long token should be expired")
	}
}

func TestTokensRejectWrongKey(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC) }
	s, _, _ := NewTokens([]byte("a"), now).Issue(1, true)
	if _, err := NewTokens([]byte("b"), now).Parse(s); err == nil {
		t.Fatal("wrong key accepted")
	}
}

func TestFakeKdfSaltDeterministicCaseInsensitive(t *testing.T) {
	a := FakeKdfSalt([]byte("s"), "Alice")
	b := FakeKdfSalt([]byte("s"), "alice")
	c := FakeKdfSalt([]byte("s"), "bob")
	d := FakeKdfSalt([]byte("t"), "alice")
	if len(a) != 16 || !bytes.Equal(a, b) || bytes.Equal(a, c) || bytes.Equal(a, d) {
		t.Fatal("unexpected salts")
	}
}
