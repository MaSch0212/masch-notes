package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/ai"
	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/config"
	"github.com/MaSch0212/masch-notes/server/internal/db"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

var bg = context.Background()

var testSecret = []byte("test-secret-0123456789abcdef0123")

// testServer is the full API mux over a migrated temporary database.
type testServer struct {
	t      *testing.T
	Mux    *http.ServeMux
	Store  *store.Store
	Tokens *auth.Tokens
	Cfg    config.Config
	AI     *aiFakes
}

func newTestServer(t *testing.T) *testServer { return newTestServerCfg(t, nil) }

// newTestServerCfg is newTestServer with a hook to adjust the configuration (e.g. enable AI).
func newTestServerCfg(t *testing.T, mutate func(*config.Config)) *testServer {
	t.Helper()
	p := filepath.Join(t.TempDir(), "maschnotes.db")
	d, err := db.Open(p)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if err := db.Migrate(bg, d, p, time.Now); err != nil {
		t.Fatal(err)
	}
	st := store.New(d)
	tokens := auth.NewTokens(testSecret, time.Now)
	cfg := config.Config{AllowRegistration: true}
	if mutate != nil {
		mutate(&cfg)
	}
	mux := http.NewServeMux()
	opts := []api.ServerOption{
		api.WithErrorHandler(WriteError),
		api.WithMiddleware(auth.Middleware(tokens, st.UserIDByAPIKey, auth.IsPublicRoute)),
	}
	api.RegisterAuthRoutes(mux, &AuthService{Store: st, Tokens: tokens, Cfg: cfg, Secret: testSecret}, opts...)
	api.RegisterUserRoutes(mux, &UserService{Store: st}, opts...)
	api.RegisterNotebooksRoutes(mux, &NotebooksService{Store: st}, opts...)
	api.RegisterDayRatingsRoutes(mux, &DayRatingsService{Store: st}, opts...)
	api.RegisterAPIKeysRoutes(mux, &APIKeysService{Store: st}, opts...)
	api.RegisterCryptoRoutes(mux, &CryptoService{Store: st}, opts...)
	fakes := &aiFakes{}
	var jobs *ai.Jobs
	if cfg.AI.Enabled() {
		jobs = ai.NewJobs(fakes, fakes, func(int64, api.AiJob) {}, time.Minute, time.Now)
	}
	api.RegisterAiRoutes(mux, &AiService{Jobs: jobs, Cfg: cfg}, AiRouteOptions(cfg, opts...)...)
	return &testServer{t: t, Mux: mux, Store: st, Tokens: tokens, Cfg: cfg, AI: fakes}
}

// do performs a JSON request; token may be empty. The response body is returned raw.
func (s *testServer) do(method, path, token string, body any) (int, []byte) {
	s.t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			s.t.Fatal(err)
		}
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Mux.ServeHTTP(rec, req)
	return rec.Code, rec.Body.Bytes()
}

// doJSON performs a request and decodes the response into out (when non-nil).
func (s *testServer) doJSON(method, path, token string, body, out any) int {
	s.t.Helper()
	code, raw := s.do(method, path, token, body)
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			s.t.Fatalf("%s %s: decode %q: %v", method, path, raw, err)
		}
	}
	return code
}

func (s *testServer) tokenFor(userID int64) string {
	s.t.Helper()
	tok, _, err := s.Tokens.Issue(userID, false)
	if err != nil {
		s.t.Fatal(err)
	}
	return tok
}

const legacyKeyParams = "pbkdf2:5000:" + "AAECAwQFBgcICQoLDA0ODw==" + ":32"

// seedLegacyUser creates a legacy (password hash, no userkey) user with key params.
func (s *testServer) seedLegacyUser(name, password string) int64 {
	s.t.Helper()
	id, err := s.Store.CreateUser(bg, name, auth.NewLegacyHash(password), store.User{GivenName: "G", Surname: "S", Email: "e@x"})
	if err != nil {
		s.t.Fatal(err)
	}
	if _, err := s.Store.DB.ExecContext(bg,
		`INSERT INTO settings (userid, settingid, value) VALUES (?, -1, ?)`, id, legacyKeyParams); err != nil {
		s.t.Fatal(err)
	}
	return id
}

// seedV2User creates a user with an active key; authKey is the derived key the client would send.
func (s *testServer) seedV2User(name string, authKey []byte) int64 {
	s.t.Helper()
	hash, err := auth.HashAuthKey(authKey)
	if err != nil {
		s.t.Fatal(err)
	}
	id, err := s.Store.CreateUser(bg, name, hash, store.User{GivenName: "G", Surname: "S", Email: "e@x"})
	if err != nil {
		s.t.Fatal(err)
	}
	err = s.Store.UpsertUserKey(bg, store.UserKey{
		UserID: id, KdfSalt: bytes.Repeat([]byte{1}, 16), KdfIterations: 600000,
		WrappedKey: bytes.Repeat([]byte{2}, 60), Status: store.KeyStatusActive,
	})
	if err != nil {
		s.t.Fatal(err)
	}
	return id
}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func expectStatus(t *testing.T, got, want int, body []byte) {
	t.Helper()
	if got != want {
		t.Fatalf("status = %d, want %d (body %s)", got, want, body)
	}
}

func errCode(t *testing.T, raw []byte) string {
	t.Helper()
	var e api.Error
	if err := json.Unmarshal(raw, &e); err != nil {
		t.Fatalf("decode error body %q: %v", raw, err)
	}
	return e.Code
}
