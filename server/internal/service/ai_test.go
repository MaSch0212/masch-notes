package service

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/ai"
	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/config"
)

// aiFakes is a Transcriber and Composer without network access.
type aiFakes struct{}

func (*aiFakes) Transcribe(context.Context, io.Reader, string) (string, error) {
	return "heute war ein guter tag", nil
}

func (*aiFakes) Compose(context.Context, ai.ComposeInput) (ai.ComposeResult, error) {
	m := 3
	return ai.ComposeResult{Text: "Heute war ein guter Tag.", Mood: &m}, nil
}

func enableAI(maxBytes int64) func(*config.Config) {
	return func(c *config.Config) {
		c.AI = config.AIConfig{
			WhisperURL: "http://whisper", LLMURL: "http://llm", LLMModel: "m",
			MaxAudioBytes: maxBytes, Timeout: time.Minute,
		}
	}
}

func (s *testServer) postJob(token string, audio []byte, fields map[string]string) (int, []byte) {
	s.t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if audio != nil {
		fw, err := mw.CreateFormFile("audio", "rec.wav")
		if err != nil {
			s.t.Fatal(err)
		}
		_, _ = fw.Write(audio)
	}
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/ai/jobs", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Mux.ServeHTTP(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func TestCreateJobAIDisabled404(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedV2User("u", []byte("k")))
	code, raw := s.postJob(tok, []byte("abc"), map[string]string{"kind": "diary"})
	expectStatus(t, code, http.StatusNotFound, raw)
	if c := errCode(t, raw); c != "aiDisabled" {
		t.Fatalf("code = %s", c)
	}
	code, raw = s.do("GET", "/api/ai/jobs/x", tok, nil)
	expectStatus(t, code, http.StatusNotFound, raw)
}

func TestCreateJobRequiresAuth(t *testing.T) {
	s := newTestServerCfg(t, enableAI(1<<20))
	code, raw := s.postJob("", []byte("abc"), map[string]string{"kind": "diary"})
	expectStatus(t, code, http.StatusUnauthorized, raw)
}

func TestCreateJobTooLarge(t *testing.T) {
	s := newTestServerCfg(t, enableAI(1024))
	tok := s.tokenFor(s.seedV2User("u", []byte("k")))

	// slightly above the limit but within the body slack: rejected by the service
	code, raw := s.postJob(tok, bytes.Repeat([]byte{1}, 2000), map[string]string{"kind": "diary"})
	expectStatus(t, code, http.StatusRequestEntityTooLarge, raw)
	if c := errCode(t, raw); c != "audioTooLarge" {
		t.Fatalf("code = %s", c)
	}

	// far above the limit: rejected while reading the body
	code, raw = s.postJob(tok, bytes.Repeat([]byte{1}, 3<<20), map[string]string{"kind": "diary"})
	expectStatus(t, code, http.StatusRequestEntityTooLarge, raw)
	if c := errCode(t, raw); c != "audioTooLarge" {
		t.Fatalf("code = %s", c)
	}
}

func TestCreateJobValidation(t *testing.T) {
	s := newTestServerCfg(t, enableAI(1<<20))
	tok := s.tokenFor(s.seedV2User("u", []byte("k")))
	cases := []struct {
		name   string
		audio  []byte
		fields map[string]string
		code   string
	}{
		{"bad kind", []byte("a"), map[string]string{"kind": "poem"}, "invalidRequest"},
		{"bad date", []byte("a"), map[string]string{"kind": "diary", "date": "18.10.2026"}, "invalidDate"},
		{"empty audio", []byte{}, map[string]string{"kind": "diary"}, "emptyAudio"},
		{"missing audio", nil, map[string]string{"kind": "diary"}, "invalidRequest"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			code, raw := s.postJob(tok, c.audio, c.fields)
			expectStatus(t, code, http.StatusBadRequest, raw)
			if got := errCode(t, raw); got != c.code {
				t.Fatalf("code = %s, want %s", got, c.code)
			}
		})
	}
}

func TestCreateGetCancelJob(t *testing.T) {
	s := newTestServerCfg(t, enableAI(1<<20))
	tok := s.tokenFor(s.seedV2User("u", []byte("k")))
	other := s.tokenFor(s.seedV2User("v", []byte("k")))

	var created api.AiJobCreated
	code, body := s.postJob(tok, []byte("RIFFxxxx"), map[string]string{"kind": "diary", "date": "2026-10-18", "title": "Idee"})
	expectStatus(t, code, http.StatusAccepted, body)
	if code := s.doJSON("GET", "/api/ai/jobs/nope", tok, nil, nil); code != http.StatusNotFound {
		t.Fatalf("unknown job status = %d", code)
	}
	if err := json.Unmarshal(body, &created); err != nil || created.JobID == "" {
		t.Fatalf("created = %+v (%v)", created, err)
	}

	var job api.AiJob
	deadline := time.Now().Add(5 * time.Second)
	for {
		if code := s.doJSON("GET", "/api/ai/jobs/"+created.JobID, tok, nil, &job); code != http.StatusOK {
			t.Fatalf("get status = %d", code)
		}
		if job.Status == api.AiJobStatusDone || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if job.Status != api.AiJobStatusDone || job.Result == nil || job.Result.Text != "Heute war ein guter Tag." ||
		job.Result.Mood == nil || *job.Result.Mood != 3 {
		t.Fatalf("job = %+v", job)
	}

	if code := s.doJSON("GET", "/api/ai/jobs/"+created.JobID, other, nil, nil); code != http.StatusNotFound {
		t.Fatalf("other user status = %d", code)
	}
	if code := s.doJSON("DELETE", "/api/ai/jobs/"+created.JobID, other, nil, nil); code != http.StatusNotFound {
		t.Fatalf("other user cancel status = %d", code)
	}
	if code := s.doJSON("DELETE", "/api/ai/jobs/"+created.JobID, tok, nil, nil); code != http.StatusNoContent {
		t.Fatalf("cancel status = %d", code)
	}
}
