package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrCompositionFailed is returned when the language model produced no usable entry.
var ErrCompositionFailed = errors.New("compositionFailed")

// ComposeInput is what the language model turns into an entry.
type ComposeInput struct {
	Kind       string // "diary" or "notebook"
	Transcript string
	Title      string
	Date       *time.Time
	Locale     string
}

// ComposeResult is the written entry.
type ComposeResult struct {
	Text  string
	Mood  *int // 0..4, nil if unknown
	Title string
}

// Composer writes an entry from a transcript.
type Composer interface {
	Compose(ctx context.Context, in ComposeInput) (ComposeResult, error)
}

type ollama struct {
	baseURL, model, systemPrompt string
	think                        bool
	client                       *http.Client
}

// NewOllama returns a Composer for an Ollama server (POST {base}/api/chat).
func NewOllama(baseURL, model string, think bool, systemPrompt string, client *http.Client) Composer {
	if client == nil {
		client = http.DefaultClient
	}
	return &ollama{baseURL: strings.TrimRight(baseURL, "/"), model: model, think: think, systemPrompt: systemPrompt, client: client}
}

func responseSchema() map[string]any {
	return map[string]any{
		"type":     "object",
		"required": []string{"text", "mood", "title"},
		"properties": map[string]any{
			"text":  map[string]any{"type": "string"},
			"mood":  map[string]any{"type": []string{"integer", "null"}, "minimum": 0, "maximum": 4},
			"title": map[string]any{"type": "string"},
		},
	}
}

func orNone(s string) string {
	if strings.TrimSpace(s) == "" {
		return "none"
	}
	return s
}

func userMessage(in ComposeInput) string {
	date := "none"
	if in.Date != nil {
		date = in.Date.Format(time.DateOnly)
	}
	return fmt.Sprintf("Kind: %s\nDate: %s\nTitle: %s\n\nTranscript:\n```\n%s\n```", in.Kind, date, orNone(in.Title), in.Transcript)
}

func (o *ollama) Compose(ctx context.Context, in ComposeInput) (ComposeResult, error) {
	reqBody := map[string]any{
		"model":   o.model,
		"stream":  false,
		"think":   o.think,
		"options": map[string]any{"temperature": 0.3},
		"messages": []map[string]string{
			{"role": "system", "content": o.systemPrompt},
			{"role": "user", "content": userMessage(in)},
		},
	}
	// gemma returns empty content when think and format are combined, so with think the
	// JSON is extracted from the free-form content instead.
	if !o.think {
		reqBody["format"] = responseSchema()
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return ComposeResult{}, fmt.Errorf("ollama: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/api/chat", bytes.NewReader(raw))
	if err != nil {
		return ComposeResult{}, fmt.Errorf("ollama: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := o.client.Do(req)
	if err != nil {
		return ComposeResult{}, fmt.Errorf("ollama: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode/100 != 2 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
		return ComposeResult{}, fmt.Errorf("ollama: unexpected status %d", resp.StatusCode)
	}
	var out struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return ComposeResult{}, fmt.Errorf("ollama: decode response: %w", err)
	}
	return parseResult(out.Message.Content)
}

func parseResult(content string) (ComposeResult, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return ComposeResult{}, fmt.Errorf("%w: empty response", ErrCompositionFailed)
	}
	start, end := strings.Index(content, "{"), strings.LastIndex(content, "}")
	if start < 0 || end < start {
		return ComposeResult{}, fmt.Errorf("%w: no JSON object in response", ErrCompositionFailed)
	}
	var r struct {
		Text  string   `json:"text"`
		Mood  *float64 `json:"mood"`
		Title string   `json:"title"`
	}
	if err := json.Unmarshal([]byte(content[start:end+1]), &r); err != nil {
		return ComposeResult{}, fmt.Errorf("%w: %w", ErrCompositionFailed, err)
	}
	text := strings.TrimSpace(r.Text)
	if text == "" {
		return ComposeResult{}, fmt.Errorf("%w: empty text", ErrCompositionFailed)
	}
	res := ComposeResult{Text: text, Title: strings.TrimSpace(r.Title)}
	if r.Mood != nil && *r.Mood == float64(int(*r.Mood)) && *r.Mood >= 0 && *r.Mood <= 4 {
		m := int(*r.Mood)
		res.Mood = &m
	}
	return res, nil
}
