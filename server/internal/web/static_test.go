package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":           {Data: []byte(`<!doctype html><html><head><base href="/" /><title>x</title></head><body>app</body></html>`)},
		"assets/app-123.js":    {Data: []byte(`console.log(1)`)},
		"favicon.svg":          {Data: []byte(`<svg/>`)},
		"manifest.webmanifest": {Data: []byte(`{"name":"MaSch Notes","start_url":".","scope":".","icons":[{"src":"favicon.svg"}]}`)},
	}
}

func get(h http.Handler, path string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestSPAFallbackAndBaseHref(t *testing.T) {
	h := NewSPA(testFS(), "/MaSchNotes")
	for _, p := range []string{"/MaSchNotes/", "/MaSchNotes/diary/2026-10-18", "/MaSchNotes/index.html"} {
		rec := get(h, p, nil)
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), `<base href="/MaSchNotes/" />`) || !strings.Contains(rec.Body.String(), "app") {
			t.Fatalf("%s: %d %s", p, rec.Code, rec.Body)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Fatalf("%s: index cache-control = %q", p, cc)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
			t.Fatalf("content type = %q", ct)
		}
	}
	// no base path: unchanged root base
	rec := get(NewSPA(testFS(), ""), "/settings", nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `<base href="/" />`) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestSPAStaticFiles(t *testing.T) {
	h := NewSPA(testFS(), "")
	rec := get(h, "/assets/app-123.js", nil)
	if rec.Code != 200 || rec.Body.String() != "console.log(1)" || !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("%d %q %v", rec.Code, rec.Body, rec.Header())
	}
	if rec := get(h, "/assets/missing.js", nil); rec.Code != 404 {
		t.Fatalf("missing asset status = %d", rec.Code)
	}
}

func TestSPAForwardedPath(t *testing.T) {
	h := NewSPA(testFS(), "")
	rec := get(h, "/MaSchNotes/diary", map[string]string{"X-Forwarded-Path": "MaSchNotes"})
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `<base href="/MaSchNotes/" />`) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	// also with slashes and non-matching values
	rec = get(h, "/MaSchNotes/", map[string]string{"X-Forwarded-Path": "/MaSchNotes/"})
	if !strings.Contains(rec.Body.String(), `<base href="/MaSchNotes/" />`) {
		t.Fatalf("%s", rec.Body)
	}
	rec = get(h, "/other/diary", map[string]string{"X-Forwarded-Path": "MaSchNotes"})
	if !strings.Contains(rec.Body.String(), `<base href="/" />`) {
		t.Fatalf("%s", rec.Body)
	}
}

func TestManifestRewrite(t *testing.T) {
	h := NewSPA(testFS(), "/MaSchNotes")
	rec := get(h, "/MaSchNotes/manifest.webmanifest", nil)
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("%v: %s", err, rec.Body)
	}
	if m["scope"] != "/MaSchNotes/" || m["start_url"] != "/MaSchNotes/" || m["name"] != "MaSch Notes" {
		t.Fatalf("manifest = %v", m)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/manifest+json") {
		t.Fatalf("content type = %q", ct)
	}
	// without a base the relative values are kept usable
	rec = get(NewSPA(testFS(), ""), "/manifest.webmanifest", nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	if m["scope"] != "/" || m["start_url"] != "/" {
		t.Fatalf("manifest = %v", m)
	}
}

func TestAPINotFoundNotSPA(t *testing.T) {
	h := NewSPA(testFS(), "")
	for _, p := range []string{"/api/nope", "/api"} {
		rec := get(h, p, nil)
		if rec.Code != 404 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("%s: %d %s", p, rec.Code, rec.Body)
		}
		var e struct{ Code, Message string }
		if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil || e.Code != "notFound" {
			t.Fatalf("%s: body %s (%v)", p, rec.Body, err)
		}
	}
}

func TestBasePathMiddlewareStripsForAPI(t *testing.T) {
	var seen string
	var base string
	h := BasePath("/MaSchNotes", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, base = r.URL.Path, EffectiveBase(r.Context())
	}))
	get(h, "/MaSchNotes/api/config", nil)
	if seen != "/api/config" || base != "/MaSchNotes" {
		t.Fatalf("seen=%q base=%q", seen, base)
	}
	get(BasePath("", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, base = r.URL.Path, EffectiveBase(r.Context())
	})), "/x/api/config", map[string]string{"X-Forwarded-Path": "x"})
	if seen != "/api/config" || base != "/x" {
		t.Fatalf("seen=%q base=%q", seen, base)
	}
	get(h, "/api/config", nil)
	if seen != "/api/config" || base != "/MaSchNotes" {
		t.Fatalf("seen=%q base=%q", seen, base)
	}
}

func TestForwardedPathIsNotInjectedIntoHTML(t *testing.T) {
	h := NewSPA(testFS(), "")
	rec := get(h, "/%22%3E%3Cscript%3E/x", map[string]string{"X-Forwarded-Path": `"><script>`})
	if strings.Contains(rec.Body.String(), "<script>") || !strings.Contains(rec.Body.String(), `<base href="/" />`) {
		t.Fatalf("%s", rec.Body)
	}
}
