package service

import (
	"bytes"
	"errors"
	"testing"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
)

var authKey = bytes.Repeat([]byte{9}, 32)

func TestPreloginLegacy(t *testing.T) {
	s := newTestServer(t)
	s.seedLegacyUser("Alice", "pw")
	var r api.PreloginResponse
	code := s.doJSON("POST", "/api/auth/prelogin", "", map[string]any{"username": "alice"}, &r)
	if code != 200 || r.Scheme != api.KeySchemeLegacy || r.KdfSalt != nil {
		t.Fatalf("%d %+v", code, r)
	}
}

func TestPreloginV2(t *testing.T) {
	s := newTestServer(t)
	s.seedV2User("bob", authKey)
	var r api.PreloginResponse
	code := s.doJSON("POST", "/api/auth/prelogin", "", map[string]any{"username": "BOB"}, &r)
	if code != 200 || r.Scheme != api.KeySchemeV2 || len(r.KdfSalt) != 16 || r.KdfIterations == nil || *r.KdfIterations != 600000 {
		t.Fatalf("%d %+v", code, r)
	}
	if !bytes.Equal(r.KdfSalt, bytes.Repeat([]byte{1}, 16)) {
		t.Fatal("stored salt not returned")
	}
}

func TestPreloginUnknownLooksV2AndStable(t *testing.T) {
	s := newTestServer(t)
	var a, b, c api.PreloginResponse
	s.doJSON("POST", "/api/auth/prelogin", "", map[string]any{"username": "ghost"}, &a)
	s.doJSON("POST", "/api/auth/prelogin", "", map[string]any{"username": "Ghost"}, &b)
	s.doJSON("POST", "/api/auth/prelogin", "", map[string]any{"username": "other"}, &c)
	if a.Scheme != api.KeySchemeV2 || len(a.KdfSalt) != 16 || a.KdfIterations == nil || *a.KdfIterations != 600000 {
		t.Fatalf("%+v", a)
	}
	if !bytes.Equal(a.KdfSalt, b.KdfSalt) || bytes.Equal(a.KdfSalt, c.KdfSalt) {
		t.Fatal("fake salt must be stable per username and differ between usernames")
	}
}

func TestLoginLegacyReturnsMigrationInfo(t *testing.T) {
	s := newTestServer(t)
	s.seedLegacyUser("Alice", "pw")
	var r api.LoginResponse
	code := s.doJSON("POST", "/api/auth/login", "", map[string]any{"username": "alice", "password": "pw", "stayLoggedIn": true}, &r)
	if code != 200 {
		t.Fatalf("status %d", code)
	}
	if r.Scheme != api.KeySchemeLegacy || r.Token == "" || r.User.Username != "Alice" {
		t.Fatalf("%+v", r)
	}
	if r.Migration == nil || r.Migration.Status != api.MigrationStatusNone || !bytes.Equal(r.Migration.LegacySalt, []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}) {
		t.Fatalf("%+v", r.Migration)
	}
	if code := s.doJSON("GET", "/api/auth/check", r.Token, nil, nil); code != 204 {
		t.Fatalf("token rejected: %d", code)
	}
}

func TestLoginLegacyWrongPassword401(t *testing.T) {
	s := newTestServer(t)
	s.seedLegacyUser("alice", "hunter2")
	for _, body := range []map[string]any{
		{"username": "alice", "password": "nope"},
		{"username": "nobody", "password": "hunter2"},
		{"username": "alice"},
	} {
		code, raw := s.do("POST", "/api/auth/login", "", body)
		expectStatus(t, code, 401, raw)
		if errCode(t, raw) != "invalidCredentials" {
			t.Fatalf("code %s", errCode(t, raw))
		}
	}
}

func TestLoginV2(t *testing.T) {
	s := newTestServer(t)
	s.seedV2User("bob", authKey)
	var r api.LoginResponse
	code := s.doJSON("POST", "/api/auth/login", "", map[string]any{"username": "bob", "authKey": b64(authKey)}, &r)
	if code != 200 || r.Scheme != api.KeySchemeV2 || len(r.WrappedKey) != 60 || r.Migration != nil {
		t.Fatalf("%d %+v", code, r)
	}
	code, raw := s.do("POST", "/api/auth/login", "", map[string]any{"username": "bob", "authKey": b64([]byte("wrong"))})
	expectStatus(t, code, 401, raw)
}

func TestLoginV2RejectsPasswordField(t *testing.T) {
	s := newTestServer(t)
	s.seedV2User("eve", authKey)
	code, raw := s.do("POST", "/api/auth/login", "", map[string]any{"username": "eve", "password": "anything"})
	expectStatus(t, code, 401, raw)
}

func registerBody(name string) map[string]any {
	return map[string]any{
		"username": name, "authKey": b64(authKey), "kdfSalt": b64(bytes.Repeat([]byte{3}, 16)),
		"kdfIterations": 600000, "wrappedKey": b64(bytes.Repeat([]byte{4}, 60)),
		"givenName": "G", "surname": "S", "email": "g@s.de",
	}
}

func TestRegisterCreatesActiveKey(t *testing.T) {
	s := newTestServer(t)
	var r api.LoginResponse
	code := s.doJSON("POST", "/api/auth/register", "", registerBody("carol"), &r)
	if code != 201 || r.Scheme != api.KeySchemeV2 || r.User.Username != "carol" || len(r.WrappedKey) != 60 {
		t.Fatalf("%d %+v", code, r)
	}
	k, err := s.Store.GetUserKey(bg, r.User.ID)
	if err != nil || k.Status != "active" {
		t.Fatalf("%+v %v", k, err)
	}
	acc, _ := s.Store.AccountByUsername(bg, "carol")
	if !auth.VerifyAuthKey(authKey, acc.PasswordHash) {
		t.Fatal("stored hash does not verify")
	}
	bad := registerBody("dave")
	bad["kdfIterations"] = 1000
	code, raw := s.do("POST", "/api/auth/register", "", bad)
	expectStatus(t, code, 400, raw)
	bad = registerBody("dave")
	bad["kdfSalt"] = b64([]byte("short"))
	code, raw = s.do("POST", "/api/auth/register", "", bad)
	expectStatus(t, code, 400, raw)
}

func TestRegisterDisabled403(t *testing.T) {
	s := newTestServer(t)
	s.Cfg.AllowRegistration = false
	// rebuild only the auth service with registration off
	svc := &AuthService{Store: s.Store, Tokens: s.Tokens, Cfg: s.Cfg, Secret: testSecret}
	_, err := svc.Register(bg, api.RegisterRequestObject{Body: api.RegisterRequest{Username: "x"}})
	var se *Error
	if !errors.As(err, &se) || se.Status != 403 || se.Code != "registrationDisabled" {
		t.Fatalf("%v", err)
	}
}

func TestRegisterUsernameTaken409(t *testing.T) {
	s := newTestServer(t)
	s.seedLegacyUser("Alice", "pw")
	code, raw := s.do("POST", "/api/auth/register", "", registerBody("alice"))
	expectStatus(t, code, 409, raw)
	if errCode(t, raw) != "usernameTaken" {
		t.Fatal(errCode(t, raw))
	}
}

func changeBody(oldKey, newKey []byte) map[string]any {
	return map[string]any{
		"oldAuthKey": b64(oldKey), "newAuthKey": b64(newKey), "kdfSalt": b64(bytes.Repeat([]byte{5}, 16)),
		"kdfIterations": 700000, "wrappedKey": b64(bytes.Repeat([]byte{6}, 60)),
	}
}

func TestChangePassword(t *testing.T) {
	s := newTestServer(t)
	id := s.seedV2User("bob", authKey)
	newKey := bytes.Repeat([]byte{7}, 32)
	code, raw := s.do("POST", "/api/auth/password", s.tokenFor(id), changeBody(authKey, newKey))
	expectStatus(t, code, 204, raw)
	var r api.LoginResponse
	if code := s.doJSON("POST", "/api/auth/login", "", map[string]any{"username": "bob", "authKey": b64(newKey)}, &r); code != 200 {
		t.Fatalf("new key login: %d", code)
	}
	if bytes.Equal(r.WrappedKey, bytes.Repeat([]byte{2}, 60)) {
		t.Fatal("wrapped key not updated")
	}
	code, _ = s.do("POST", "/api/auth/login", "", map[string]any{"username": "bob", "authKey": b64(authKey)})
	if code != 401 {
		t.Fatalf("old key still works: %d", code)
	}
}

func TestChangePasswordWrongOld401(t *testing.T) {
	s := newTestServer(t)
	id := s.seedV2User("bob", authKey)
	code, raw := s.do("POST", "/api/auth/password", s.tokenFor(id), changeBody([]byte("wrong"), bytes.Repeat([]byte{7}, 32)))
	expectStatus(t, code, 401, raw)
	if errCode(t, raw) != "wrongPassword" {
		t.Fatal(errCode(t, raw))
	}
}

func TestChangePasswordLegacy409(t *testing.T) {
	s := newTestServer(t)
	id := s.seedLegacyUser("alice", "pw")
	code, raw := s.do("POST", "/api/auth/password", s.tokenFor(id), changeBody(authKey, authKey))
	expectStatus(t, code, 409, raw)
	if errCode(t, raw) != "migrationRequired" {
		t.Fatal(errCode(t, raw))
	}
}

func TestUpdateUser(t *testing.T) {
	s := newTestServer(t)
	id := s.seedLegacyUser("Alice", "pw")
	tok := s.tokenFor(id)
	var u api.User
	code := s.doJSON("PUT", "/api/user", tok, map[string]any{"givenName": "New", "surname": "Name", "email": "n@x.de"}, &u)
	if code != 200 || u.GivenName != "New" || u.Username != "Alice" || u.ID != id {
		t.Fatalf("%d %+v", code, u)
	}
	var got api.User
	s.doJSON("GET", "/api/user", tok, nil, &got)
	if got != u {
		t.Fatalf("%+v vs %+v", got, u)
	}
	if code, _ := s.do("GET", "/api/user", "", nil); code != 401 {
		t.Fatalf("unauthenticated: %d", code)
	}
}

func TestGetConfig(t *testing.T) {
	s := newTestServer(t)
	var c api.AppConfig
	if code := s.doJSON("GET", "/api/config", "", nil, &c); code != 200 || !c.RegistrationEnabled || c.AiEnabled {
		t.Fatalf("%d %+v", code, c)
	}
}
