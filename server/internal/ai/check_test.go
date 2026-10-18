package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckWhisper(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("<html></html>"))
	}))
	defer srv.Close()
	if err := CheckWhisper(context.Background(), srv.Client(), srv.URL+"/"); err != nil {
		t.Fatal(err)
	}

	srv.Close()
	if err := CheckWhisper(context.Background(), srv.Client(), srv.URL); err == nil {
		t.Fatal("expected an error for a stopped server")
	}
}

func TestCheckOllama(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"models":[{"name":"gemma4:12b"},{"name":"llama3:latest"}]}`))
	}))
	defer srv.Close()

	for _, model := range []string{"gemma4:12b", "llama3"} {
		if err := CheckOllama(context.Background(), srv.Client(), srv.URL, model); err != nil {
			t.Errorf("%s: %v", model, err)
		}
	}
	if gotPath != "/api/tags" {
		t.Errorf("path = %q", gotPath)
	}

	err := CheckOllama(context.Background(), srv.Client(), srv.URL, "qwen3:8b")
	if err == nil || !strings.Contains(err.Error(), `"qwen3:8b" is not installed`) || !strings.Contains(err.Error(), "gemma4:12b") {
		t.Fatalf("err = %v", err)
	}
}

func TestCheckOllamaStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	if err := CheckOllama(context.Background(), srv.Client(), srv.URL, "gemma4:12b"); err == nil {
		t.Fatal("expected an error for status 404")
	}
}
