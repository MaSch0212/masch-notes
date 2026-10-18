package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// publicRoutes are the operations reachable without authentication, as
// "METHOD /path-below-the-api-prefix".
var publicRoutes = map[string]bool{
	"GET /config":         true,
	"POST /auth/prelogin": true,
	"POST /auth/login":    true,
	"POST /auth/register": true,
}

// IsPublicRoute reports whether the request targets an unauthenticated operation.
// It matches by method and path after the "/api" segment, so any base path works.
func IsPublicRoute(r *http.Request) bool {
	p := r.URL.Path
	i := strings.LastIndex(p, "/api/")
	if i < 0 {
		return false
	}
	return publicRoutes[r.Method+" "+strings.TrimRight(p[i+len("/api"):], "/")]
}

// Middleware authenticates requests with a Bearer token or an "apikey" query
// parameter (name matched case-insensitively) and stores the user id in the context.
func Middleware(
	tokens *Tokens,
	apiKeys func(ctx context.Context, key string) (int64, error),
	public func(r *http.Request) bool,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if public != nil && public(r) {
				next.ServeHTTP(w, r)
				return
			}
			id, ok := authenticate(tokens, apiKeys, r)
			if !ok {
				writeUnauthorized(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), id)))
		})
	}
}

func authenticate(
	tokens *Tokens,
	apiKeys func(ctx context.Context, key string) (int64, error),
	r *http.Request,
) (int64, bool) {
	if h := r.Header.Get("Authorization"); h != "" {
		scheme, token, found := strings.Cut(h, " ")
		if found && strings.EqualFold(scheme, "Bearer") {
			if id, err := tokens.Parse(strings.TrimSpace(token)); err == nil {
				return id, true
			}
		}
		return 0, false
	}
	for name, values := range r.URL.Query() {
		if !strings.EqualFold(name, "apikey") || len(values) == 0 || values[0] == "" {
			continue
		}
		id, err := apiKeys(r.Context(), values[0])
		if err != nil {
			if !errors.Is(err, store.ErrNotFound) {
				slog.Error("api key lookup failed", "error", err)
			}
			return 0, false
		}
		return id, true
	}
	return 0, false
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", "Bearer")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(api.Error{Code: "unauthorized", Message: "authentication required"})
}
