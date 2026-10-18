// Package ai talks to the transcription and language model servers and runs AI jobs in memory.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

// Transcriber turns audio into text.
type Transcriber interface {
	Transcribe(ctx context.Context, audio io.Reader, filename string) (string, error)
}

type whisper struct {
	baseURL, language string
	client            *http.Client
}

// NewWhisper returns a Transcriber for a whisper.cpp server
// (POST {base}/inference, multipart "file", response_format=json).
func NewWhisper(baseURL, language string, client *http.Client) Transcriber {
	if client == nil {
		client = http.DefaultClient
	}
	return &whisper{baseURL: strings.TrimRight(baseURL, "/"), language: language, client: client}
}

func (w *whisper) Transcribe(ctx context.Context, audio io.Reader, filename string) (string, error) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	if _, err := io.Copy(part, audio); err != nil {
		return "", fmt.Errorf("whisper: read audio: %w", err)
	}
	if err := mw.WriteField("response_format", "json"); err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	if err := mw.WriteField("language", w.language); err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	if err := mw.Close(); err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.baseURL+"/inference", &body)
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := w.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode/100 != 2 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
		return "", fmt.Errorf("whisper: unexpected status %d", resp.StatusCode)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("whisper: decode response: %w", err)
	}
	return out.Text, nil
}
