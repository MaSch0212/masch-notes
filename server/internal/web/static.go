// Package web serves the embedded single-page client and handles base paths behind reverse proxies.
package web

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"regexp"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Dist returns the embedded client build (index.html at its root).
func Dist() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err) // dist is embedded at build time, so the sub-tree always exists
	}
	return sub
}

type baseKey struct{}

// EffectiveBase returns the base path ("" or "/a/b", no trailing slash) the request was
// received under, as determined by BasePath.
func EffectiveBase(ctx context.Context) string {
	b, _ := ctx.Value(baseKey{}).(string)
	return b
}

// stripSegments removes prefix (a "/a/b" style path) from p when it matches whole segments.
func stripSegments(p, prefix string) (string, bool) {
	if prefix == "" {
		return p, false
	}
	if p == prefix {
		return "/", true
	}
	if rest, ok := strings.CutPrefix(p, prefix+"/"); ok {
		return "/" + rest, true
	}
	return p, false
}

var safePath = regexp.MustCompile(`^(/[A-Za-z0-9._~-]+)+$`)

// normalize returns p as "/a/b" or "" when it is empty or contains characters that must not end up in HTML.
func normalize(p string) string {
	p = strings.Trim(strings.TrimSpace(p), "/")
	if p == "" || !safePath.MatchString("/"+p) {
		return ""
	}
	return "/" + p
}

// BasePath strips the configured base path and the path announced in X-Forwarded-Path from the
// request path, and records the resulting effective base in the request context. Applying it twice
// is harmless.
func BasePath(basePath string, next http.Handler) http.Handler {
	static := normalize(basePath)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, done := r.Context().Value(baseKey{}).(string); done {
			next.ServeHTTP(w, r)
			return
		}
		p, base := r.URL.Path, static
		if rest, ok := stripSegments(p, static); ok {
			p = rest
		}
		for _, v := range r.Header.Values("X-Forwarded-Path") {
			prefix := normalize(v)
			if rest, ok := stripSegments(p, prefix); ok {
				p, base = rest, base+prefix
				break
			}
		}
		r2 := r.Clone(context.WithValue(r.Context(), baseKey{}, base))
		r2.URL.Path, r2.URL.RawPath = p, ""
		next.ServeHTTP(w, r2)
	})
}

var baseTag = regexp.MustCompile(`<base href="[^"]*"\s*/?>`)

type spa struct {
	dist fs.FS
}

// NewSPA serves dist: existing files as they are, any other non-API path as index.html. It rewrites
// <base href> in index.html and scope/start_url in the web manifest to the effective base path.
func NewSPA(dist fs.FS, basePath string) http.Handler {
	return BasePath(basePath, &spa{dist: dist})
}

func writeNotFound(w http.ResponseWriter, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(`{"code":"` + code + `","message":"not found"}`))
}

func (s *spa) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if p == "api" || strings.HasPrefix(p, "api/") {
		writeNotFound(w, "notFound")
		return
	}
	base := EffectiveBase(r.Context())

	if p != "" && p != "index.html" {
		if info, err := fs.Stat(s.dist, p); err == nil && !info.IsDir() {
			s.serveFile(w, r, p, base)
			return
		}
		if strings.Contains(path.Base(p), ".") {
			writeNotFound(w, "notFound") // a missing file, not a client route
			return
		}
	}
	s.serveFile(w, r, "index.html", base)
}

func (s *spa) serveFile(w http.ResponseWriter, r *http.Request, name, base string) {
	data, err := fs.ReadFile(s.dist, name)
	if err != nil {
		writeNotFound(w, "notFound")
		return
	}
	h := w.Header()
	ct := mime.TypeByExtension(path.Ext(name))
	switch {
	case name == "index.html":
		data = baseTag.ReplaceAll(data, []byte(`<base href="`+base+`/" />`))
		ct = "text/html; charset=utf-8"
		h.Set("Cache-Control", "no-cache")
	case name == "manifest.webmanifest":
		data = rewriteManifest(data, base)
		ct = "application/manifest+json"
		h.Set("Cache-Control", "no-cache")
	case strings.HasPrefix(name, "assets/"):
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		h.Set("Cache-Control", "no-cache")
	}
	if ct != "" {
		h.Set("Content-Type", ct)
	}
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(data) //nolint:gosec // embedded client files, base path is normalised
}

func rewriteManifest(data []byte, base string) []byte {
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return data
	}
	m["scope"] = base + "/"
	m["start_url"] = base + "/"
	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return data
	}
	return out
}
