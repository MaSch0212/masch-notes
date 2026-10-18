package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/api"
)

func TestWhisperRequestShape(t *testing.T) {
	var gotPath, gotLang, gotFormat, gotFile, gotName string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Error(err)
		}
		gotLang = r.FormValue("language")
		gotFormat = r.FormValue("response_format")
		f, h, err := r.FormFile("file")
		if err != nil {
			t.Error(err)
			return
		}
		b, _ := io.ReadAll(f)
		gotFile, gotName = string(b), h.Filename
		_, _ = w.Write([]byte(`{"text":" hallo welt "}`))
	}))
	defer srv.Close()

	text, err := NewWhisper(srv.URL+"/", "de", srv.Client()).Transcribe(context.Background(), strings.NewReader("AUDIO"), "a.wav")
	if err != nil {
		t.Fatal(err)
	}
	if text != " hallo welt " || gotPath != "/inference" || gotLang != "de" || gotFormat != "json" || gotFile != "AUDIO" || gotName != "a.wav" {
		t.Fatalf("text=%q path=%q lang=%q format=%q file=%q name=%q", text, gotPath, gotLang, gotFormat, gotFile, gotName)
	}
}

func TestWhisperErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "boom", 500) }))
	defer srv.Close()
	if _, err := NewWhisper(srv.URL, "auto", nil).Transcribe(context.Background(), strings.NewReader("x"), "a.wav"); err == nil {
		t.Fatal("want error")
	}
}

type chatCapture struct {
	body map[string]any
}

func fakeOllama(t *testing.T, content string, cap *chatCapture) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			t.Errorf("path = %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&cap.body); err != nil {
			t.Error(err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]any{"content": content}})
	}))
}

func TestOllamaRequestShapeAndThinkFlag(t *testing.T) {
	date := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	in := ComposeInput{Kind: "diary", Transcript: "ich war heute einkaufen", Date: &date}

	var off chatCapture
	srv := fakeOllama(t, `{"text":"x","mood":2,"title":""}`, &off)
	defer srv.Close()
	if _, err := NewOllama(srv.URL, "gemma", false, "SYSTEM", srv.Client()).Compose(context.Background(), in); err != nil {
		t.Fatal(err)
	}
	if off.body["model"] != "gemma" || off.body["stream"] != false || off.body["think"] != false {
		t.Fatalf("body = %v", off.body)
	}
	if opts, _ := off.body["options"].(map[string]any); opts["temperature"] != 0.3 {
		t.Fatalf("options = %v", off.body["options"])
	}
	format, ok := off.body["format"].(map[string]any)
	if !ok {
		t.Fatalf("format missing with think=false: %v", off.body)
	}
	props, _ := format["properties"].(map[string]any)
	if format["type"] != "object" || len(props) != 3 {
		t.Fatalf("format = %v", format)
	}
	msgs, _ := off.body["messages"].([]any)
	sys, _ := msgs[0].(map[string]any)
	usr, _ := msgs[1].(map[string]any)
	want := "Kind: diary\nDate: 2026-10-18\nTitle: none\n\nTranscript:\n```\nich war heute einkaufen\n```"
	if sys["role"] != "system" || sys["content"] != "SYSTEM" || usr["role"] != "user" || usr["content"] != want {
		t.Fatalf("messages = %v", msgs)
	}

	var on chatCapture
	srv2 := fakeOllama(t, "Hier: {\"text\":\"x\",\"mood\":null,\"title\":\"t\"} fertig", &on)
	defer srv2.Close()
	res, err := NewOllama(srv2.URL, "gemma", true, "SYSTEM", srv2.Client()).Compose(context.Background(), ComposeInput{Kind: "notebook", Transcript: "t", Title: "Mein Titel"})
	if err != nil {
		t.Fatal(err)
	}
	if on.body["think"] != true {
		t.Fatalf("think = %v", on.body["think"])
	}
	if _, has := on.body["format"]; has {
		t.Fatal("format must not be sent with think=true")
	}
	if res.Text != "x" || res.Mood != nil || res.Title != "t" {
		t.Fatalf("res = %+v", res)
	}
	msgs, _ = on.body["messages"].([]any)
	usr, _ = msgs[1].(map[string]any)
	if !strings.Contains(usr["content"].(string), "Date: none\nTitle: Mein Titel") {
		t.Fatalf("user message = %v", usr["content"])
	}
}

func TestOllamaParsesResult(t *testing.T) {
	cases := []struct {
		name, content string
		wantErr       bool
		text          string
		mood          *int
	}{
		{"plain", `{"text":" Hallo. ","mood":4,"title":"A"}`, false, "Hallo.", ptr(4)},
		{"null mood", `{"text":"Hallo","mood":null,"title":""}`, false, "Hallo", nil},
		{"mood out of range", `{"text":"Hallo","mood":7,"title":""}`, false, "Hallo", nil},
		{"negative mood", `{"text":"Hallo","mood":-1,"title":""}`, false, "Hallo", nil},
		{"fractional mood", `{"text":"Hallo","mood":2.5,"title":""}`, false, "Hallo", nil},
		{"empty content", "", true, "", nil},
		{"whitespace text", `{"text":"  ","mood":2,"title":""}`, true, "", nil},
		{"no json", "sorry", true, "", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var cp chatCapture
			srv := fakeOllama(t, c.content, &cp)
			defer srv.Close()
			res, err := NewOllama(srv.URL, "m", false, "s", nil).Compose(context.Background(), ComposeInput{Kind: "diary", Transcript: "t"})
			if c.wantErr {
				if err == nil || !IsCompositionFailure(err) {
					t.Fatalf("err = %v, want composition failure", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if res.Text != c.text || (res.Mood == nil) != (c.mood == nil) || (c.mood != nil && *res.Mood != *c.mood) {
				t.Fatalf("res = %+v", res)
			}
		})
	}
}

func ptr[T any](v T) *T { return &v }

func TestCleanTranscript(t *testing.T) {
	if got := CleanTranscript("[Musik] hallo  welt (Applaus)"); got != "hallo welt" {
		t.Fatalf("got %q", got)
	}
	if got := CleanTranscript(" [BLANK_AUDIO] \n "); got != "" {
		t.Fatalf("got %q", got)
	}
}

func TestDefaultPrompt(t *testing.T) {
	if len(DefaultPrompt()) < 200 {
		t.Fatal("embedded prompt missing")
	}
}

type fakeT struct {
	text string
	err  error
	wait bool
	ctx  chan context.Context
	name string
}

func (f *fakeT) Transcribe(ctx context.Context, _ io.Reader, name string) (string, error) {
	f.name = name
	if f.ctx != nil {
		f.ctx <- ctx
	}
	if f.wait {
		<-ctx.Done()
		return "", ctx.Err()
	}
	return f.text, f.err
}

type fakeC struct {
	res ComposeResult
	err error
	in  ComposeInput
}

func (f *fakeC) Compose(_ context.Context, in ComposeInput) (ComposeResult, error) {
	f.in = in
	return f.res, f.err
}

type recorder struct {
	mu   sync.Mutex
	msgs []api.AiJob
	done chan struct{}
}

func newRecorder() *recorder { return &recorder{done: make(chan struct{})} }

func (r *recorder) publish(_ int64, j api.AiJob) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.msgs = append(r.msgs, j)
	switch j.Status {
	case api.AiJobStatusDone, api.AiJobStatusFailed, api.AiJobStatusCancelled:
		close(r.done)
	default:
	}
}

func (r *recorder) wait(t *testing.T) []api.AiJob {
	t.Helper()
	select {
	case <-r.done:
	case <-time.After(5 * time.Second):
		t.Fatal("job did not finish")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]api.AiJob(nil), r.msgs...)
}

func statuses(msgs []api.AiJob) []api.AiJobStatus {
	out := make([]api.AiJobStatus, len(msgs))
	for i, m := range msgs {
		out[i] = m.Status
	}
	return out
}

func TestJobHappyPathPublishesSteps(t *testing.T) {
	rec := newRecorder()
	c := &fakeC{res: ComposeResult{Text: "Heute war ein guter Tag.", Mood: ptr(3), Title: "Guter Tag"}}
	tr := &fakeT{text: "[Musik] ähm heute war gut"}
	j := NewJobs(tr, c, rec.publish, time.Second, nil)
	id := j.Start(7, []byte("a"), "audio.mp3", ComposeInput{Kind: "notebook"})
	msgs := rec.wait(t)
	if tr.name != "audio.mp3" {
		t.Errorf("whisper got file name %q", tr.name)
	}

	want := []api.AiJobStatus{api.AiJobStatusQueued, api.AiJobStatusTranscribing, api.AiJobStatusComposing, api.AiJobStatusDone}
	got := statuses(msgs)
	if len(got) != len(want) {
		t.Fatalf("statuses = %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("statuses = %v", got)
		}
	}
	if c.in.Transcript != "ähm heute war gut" {
		t.Fatalf("composer transcript = %q", c.in.Transcript)
	}
	last := msgs[len(msgs)-1]
	if last.JobID != id || last.Result == nil || last.Result.Text != "Heute war ein guter Tag." ||
		last.Result.Mood == nil || *last.Result.Mood != 3 || last.Result.Title == nil || *last.Result.Title != "Guter Tag" {
		t.Fatalf("last = %+v", last)
	}
	if st, ok := j.Get(7, id); !ok || st.Status != api.AiJobStatusDone {
		t.Fatalf("Get = %+v, %v", st, ok)
	}
}

func TestJobDiaryHasNoTitleAndMoodRangeEnforced(t *testing.T) {
	rec := newRecorder()
	c := &fakeC{res: ComposeResult{Text: "x", Mood: ptr(9), Title: "ignored"}}
	j := NewJobs(&fakeT{text: "hallo"}, c, rec.publish, time.Second, nil)
	j.Start(1, nil, "audio.wav", ComposeInput{Kind: "diary"})
	msgs := rec.wait(t)
	r := msgs[len(msgs)-1].Result
	if r == nil || r.Mood != nil || r.Title != nil {
		t.Fatalf("result = %+v", r)
	}
}

func TestJobEmptyTranscript(t *testing.T) {
	rec := newRecorder()
	c := &fakeC{}
	j := NewJobs(&fakeT{text: " [BLANK_AUDIO] "}, c, rec.publish, time.Second, nil)
	j.Start(1, []byte("a"), "audio.wav", ComposeInput{Kind: "diary"})
	msgs := rec.wait(t)
	last := msgs[len(msgs)-1]
	if last.Status != api.AiJobStatusFailed || last.Error == nil || *last.Error != "emptyTranscript" || last.Result != nil {
		t.Fatalf("last = %+v", last)
	}
	if c.in.Transcript != "" {
		t.Fatal("composer must not be called")
	}
}

func TestJobUpstreamErrors(t *testing.T) {
	rec := newRecorder()
	j := NewJobs(&fakeT{err: io.ErrUnexpectedEOF}, &fakeC{}, rec.publish, time.Second, nil)
	j.Start(1, nil, "audio.wav", ComposeInput{})
	if last := lastOf(rec.wait(t)); last.Error == nil || *last.Error != "transcriptionFailed" {
		t.Fatalf("last = %+v", last)
	}

	rec = newRecorder()
	j = NewJobs(&fakeT{text: "hallo"}, &fakeC{err: ErrCompositionFailed}, rec.publish, time.Second, nil)
	j.Start(1, nil, "audio.wav", ComposeInput{})
	if last := lastOf(rec.wait(t)); last.Error == nil || *last.Error != "compositionFailed" {
		t.Fatalf("last = %+v", last)
	}
}

func lastOf(m []api.AiJob) api.AiJob { return m[len(m)-1] }

func TestJobCancel(t *testing.T) {
	rec := newRecorder()
	ft := &fakeT{wait: true, ctx: make(chan context.Context, 1)}
	j := NewJobs(ft, &fakeC{}, rec.publish, time.Minute, nil)
	id := j.Start(1, nil, "audio.wav", ComposeInput{})
	upstream := <-ft.ctx
	if j.Cancel(2, id) {
		t.Fatal("other user must not cancel")
	}
	if !j.Cancel(1, id) {
		t.Fatal("cancel failed")
	}
	select {
	case <-upstream.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("cancellation did not reach the upstream request")
	}
	msgs := rec.wait(t)
	if last := lastOf(msgs); last.Status != api.AiJobStatusCancelled {
		t.Fatalf("last = %+v", last)
	}
	time.Sleep(50 * time.Millisecond)
	if st, _ := j.Get(1, id); st.Status != api.AiJobStatusCancelled {
		t.Fatalf("status after cancel = %s", st.Status)
	}
}

func TestJobOwnership(t *testing.T) {
	rec := newRecorder()
	j := NewJobs(&fakeT{text: "hallo"}, &fakeC{res: ComposeResult{Text: "x"}}, rec.publish, time.Second, nil)
	id := j.Start(1, nil, "audio.wav", ComposeInput{})
	rec.wait(t)
	if _, ok := j.Get(2, id); ok {
		t.Fatal("other user must not see the job")
	}
	if _, ok := j.Get(1, "nope"); ok {
		t.Fatal("unknown job")
	}
	if j.Cancel(2, id) {
		t.Fatal("other user must not cancel")
	}
}

func TestJobExpiry(t *testing.T) {
	var mu sync.Mutex
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	rec := newRecorder()
	j := NewJobs(&fakeT{text: "hallo"}, &fakeC{res: ComposeResult{Text: "x"}}, rec.publish, time.Second, clock)
	id := j.Start(1, nil, "audio.wav", ComposeInput{})
	rec.wait(t)

	mu.Lock()
	now = now.Add(14 * time.Minute)
	mu.Unlock()
	j.Sweep()
	if _, ok := j.Get(1, id); !ok {
		t.Fatal("job expired too early")
	}
	mu.Lock()
	now = now.Add(2 * time.Minute)
	mu.Unlock()
	j.Sweep()
	if _, ok := j.Get(1, id); ok {
		t.Fatal("job should have expired")
	}
}

func TestAudioFileName(t *testing.T) {
	for in, want := range map[string]string{
		"recording.mp3":    "audio.mp3",
		"Recording.WAV":    "audio.wav",
		"voice.m4a":        "audio.m4a",
		"":                 "audio.wav",
		"noext":            "audio.wav",
		"../../etc/passwd": "audio.wav",
		"x.mp3;rm -rf":     "audio.wav",
		"a.verylongext":    "audio.wav",
	} {
		if got := AudioFileName(in); got != want {
			t.Errorf("AudioFileName(%q) = %q, want %q", in, got, want)
		}
	}
}
