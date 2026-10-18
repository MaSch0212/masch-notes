package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// CheckWhisper verifies that the whisper.cpp server answers HTTP requests.
func CheckWhisper(ctx context.Context, client *http.Client, baseURL string) error {
	res, err := get(ctx, client, strings.TrimRight(baseURL, "/")+"/")
	if err != nil {
		return fmt.Errorf("whisper: %w", err)
	}
	_ = res.Body.Close()
	if res.StatusCode >= http.StatusInternalServerError {
		return fmt.Errorf("whisper: status %d", res.StatusCode)
	}
	return nil
}

// CheckOllama verifies that the Ollama server answers and has the model installed.
func CheckOllama(ctx context.Context, client *http.Client, baseURL, model string) error {
	res, err := get(ctx, client, strings.TrimRight(baseURL, "/")+"/api/tags")
	if err != nil {
		return fmt.Errorf("ollama: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("ollama: status %d", res.StatusCode)
	}
	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&tags); err != nil {
		return fmt.Errorf("ollama: decode model list: %w", err)
	}
	names := make([]string, 0, len(tags.Models))
	for _, m := range tags.Models {
		// Ollama lists untagged models as "<name>:latest".
		if m.Name == model || m.Name == model+":latest" {
			return nil
		}
		names = append(names, m.Name)
	}
	return fmt.Errorf("ollama: model %q is not installed (available: %s)", model, strings.Join(names, ", "))
}

func get(ctx context.Context, client *http.Client, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return client.Do(req)
}
