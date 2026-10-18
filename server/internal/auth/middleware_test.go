package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/store"
)

func testMiddleware(t *testing.T) (http.Handler, *Tokens) {
	t.Helper()
	tokens := NewTokens([]byte("0123456789abcdef0123456789abcdef"), time.Now)
	keys := func(_ context.Context, key string) (int64, error) {
		if key == "good" {
			return 7, nil
		}
		return 0, store.ErrNotFound
	}
	h := Middleware(tokens, keys, IsPublicRoute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, _ := UserID(r.Context())
		w.Header().Set("X-User", string(rune('0'+id)))
		w.WriteHeader(http.StatusNoContent)
	}))
	return h, tokens
}

func serveReq(h http.Handler, method, target, bearer string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestMiddlewareBearer(t *testing.T) {
	h, tokens := testMiddleware(t)
	tok, _, err := tokens.Issue(3, false)
	if err != nil {
		t.Fatal(err)
	}
	rec := serveReq(h, "GET", "/api/notebooks", tok)
	if rec.Code != 204 || rec.Header().Get("X-User") != "3" {
		t.Fatalf("got %d user %q", rec.Code, rec.Header().Get("X-User"))
	}
	if rec := serveReq(h, "GET", "/api/notebooks", "garbage"); rec.Code != 401 {
		t.Fatalf("garbage token: %d", rec.Code)
	}
}

func TestMiddlewareAPIKeyQuery(t *testing.T) {
	h, _ := testMiddleware(t)
	if rec := serveReq(h, "GET", "/api/notebooks?ApiKey=good", ""); rec.Code != 204 || rec.Header().Get("X-User") != "7" {
		t.Fatalf("good key: %d", rec.Code)
	}
	if rec := serveReq(h, "GET", "/api/notebooks?apikey=bad", ""); rec.Code != 401 {
		t.Fatalf("bad key: %d", rec.Code)
	}
}

func TestMiddlewarePublicRoutes(t *testing.T) {
	h, _ := testMiddleware(t)
	for _, c := range []struct{ m, p string }{
		{"GET", "/api/config"},
		{"POST", "/api/auth/prelogin"},
		{"POST", "/api/auth/login"},
		{"POST", "/api/auth/register"},
		{"GET", "/MaSchNotes/api/config"},
	} {
		if rec := serveReq(h, c.m, c.p, ""); rec.Code != 204 {
			t.Errorf("%s %s: %d", c.m, c.p, rec.Code)
		}
	}
	for _, c := range []struct{ m, p string }{
		{"GET", "/api/auth/check"}, {"POST", "/api/auth/password"}, {"GET", "/api/auth/login"}, {"GET", "/api/user"},
	} {
		if rec := serveReq(h, c.m, c.p, ""); rec.Code != 401 {
			t.Errorf("%s %s: %d", c.m, c.p, rec.Code)
		}
	}
}

func TestMiddlewareRejectsMissing(t *testing.T) {
	h, _ := testMiddleware(t)
	rec := serveReq(h, "GET", "/api/notebooks", "")
	if rec.Code != 401 {
		t.Fatalf("got %d", rec.Code)
	}
	if got := rec.Body.String(); got == "" || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("body %q", got)
	}
}
