package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/config"
	"github.com/MaSch0212/masch-notes/server/internal/db"
)

func testHandler(t *testing.T, mutate func(*config.Config)) http.Handler {
	t.Helper()
	cfg := config.Config{DataDir: t.TempDir(), AllowRegistration: true}
	if mutate != nil {
		mutate(&cfg)
	}
	p := filepath.Join(cfg.DataDir, "maschnotes.db")
	d, err := db.Open(p)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if err := db.Migrate(context.Background(), d, p, time.Now); err != nil {
		t.Fatal(err)
	}
	h, err := buildHandler(t.Context(), cfg, d, []byte("test-secret-0123456789abcdef0123"), slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func do(h http.Handler, method, path string) (int, string) {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	b, _ := io.ReadAll(rec.Body)
	return rec.Code, string(b)
}

func TestWiring(t *testing.T) {
	h := testHandler(t, nil)
	if code, body := do(h, "GET", "/api/config"); code != 200 || !strings.Contains(body, `"aiEnabled":false`) {
		t.Fatalf("config: %d %s", code, body)
	}
	if code, _ := do(h, "GET", "/api/notebooks"); code != 401 {
		t.Fatalf("notebooks without token: %d", code)
	}
	if code, body := do(h, "GET", "/api/nope"); code != 404 || !strings.Contains(body, `"notFound"`) {
		t.Fatalf("unknown api: %d %s", code, body)
	}
	if code, body := do(h, "GET", "/diary/2026-10-18"); code != 200 || !strings.Contains(body, "<base href=\"/\" />") {
		t.Fatalf("spa: %d %s", code, body)
	}
	// the websocket endpoint is not behind the auth middleware (a plain GET is no upgrade, not a 401)
	if code, _ := do(h, "GET", "/api/ws"); code == 401 || code == 404 {
		t.Fatalf("ws: %d", code)
	}
	if code, body := do(h, "POST", "/api/ai/jobs"); code != 401 {
		t.Fatalf("ai jobs without token: %d %s", code, body)
	}
}

func TestWiringBasePath(t *testing.T) {
	h := testHandler(t, func(c *config.Config) { c.BasePath = "/MaSchNotes" })
	if code, body := do(h, "GET", "/MaSchNotes/api/config"); code != 200 || !strings.Contains(body, "registrationEnabled") {
		t.Fatalf("config: %d %s", code, body)
	}
	if code, body := do(h, "GET", "/MaSchNotes/diary"); code != 200 || !strings.Contains(body, `<base href="/MaSchNotes/" />`) {
		t.Fatalf("spa: %d %s", code, body)
	}
}
