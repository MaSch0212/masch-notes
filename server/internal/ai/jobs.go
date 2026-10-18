package ai

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/api"
)

// Error codes reported in a failed job.
const (
	ErrCodeEmptyTranscript     = "emptyTranscript"
	ErrCodeTranscriptionFailed = "transcriptionFailed"
	ErrCodeCompositionFailed   = "compositionFailed"
)

// finishedTTL is how long a finished job stays available.
const finishedTTL = 15 * time.Minute

type job struct {
	userID     int64
	state      api.AiJob
	cancel     context.CancelFunc
	finishedAt time.Time
}

func (j *job) finished() bool {
	switch j.state.Status {
	case api.AiJobStatusDone, api.AiJobStatusFailed, api.AiJobStatusCancelled:
		return true
	default:
		return false
	}
}

// Jobs runs transcribe-then-compose jobs in memory. Audio, transcripts and results are never persisted.
type Jobs struct {
	transcriber Transcriber
	composer    Composer
	publish     func(userID int64, job api.AiJob)
	timeout     time.Duration
	now         func() time.Time

	mu   sync.Mutex
	jobs map[string]*job
}

// NewJobs creates the manager; timeout applies to each step (transcription, composition).
func NewJobs(t Transcriber, c Composer, publish func(userID int64, job api.AiJob), timeout time.Duration, now func() time.Time) *Jobs {
	if now == nil {
		now = time.Now
	}
	if publish == nil {
		publish = func(int64, api.AiJob) {}
	}
	return &Jobs{transcriber: t, composer: c, publish: publish, timeout: timeout, now: now, jobs: map[string]*job{}}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Start queues a job and returns its id immediately.
func (j *Jobs) Start(userID int64, audio []byte, in ComposeInput) string {
	ctx, cancel := context.WithCancel(context.Background())
	id := newID()
	jb := &job{userID: userID, cancel: cancel, state: api.AiJob{JobID: id, Status: api.AiJobStatusQueued}}
	j.mu.Lock()
	j.jobs[id] = jb
	j.mu.Unlock()
	j.publish(userID, jb.state)
	go j.run(ctx, jb, audio, in)
	return id
}

// transition moves a running job to a new state and publishes it. It does nothing once the job is finished
// (e.g. cancelled while a step was in flight) and reports whether the transition was applied.
func (j *Jobs) transition(jb *job, mutate func(*api.AiJob)) bool {
	j.mu.Lock()
	if jb.finished() {
		j.mu.Unlock()
		return false
	}
	mutate(&jb.state)
	if jb.finished() {
		jb.finishedAt = j.now()
	}
	snapshot := jb.state
	j.mu.Unlock()
	j.publish(jb.userID, snapshot)
	return true
}

func (j *Jobs) setStatus(jb *job, s api.AiJobStatus) bool {
	return j.transition(jb, func(a *api.AiJob) { a.Status = s })
}

func (j *Jobs) fail(jb *job, code string) {
	j.transition(jb, func(a *api.AiJob) {
		a.Status = api.AiJobStatusFailed
		a.Error = &code
	})
}

func (j *Jobs) run(ctx context.Context, jb *job, audio []byte, in ComposeInput) {
	defer jb.cancel()
	if !j.setStatus(jb, api.AiJobStatusTranscribing) {
		return
	}
	tctx, cancelT := context.WithTimeout(ctx, j.timeout)
	text, err := j.transcriber.Transcribe(tctx, bytes.NewReader(audio), "audio.wav")
	cancelT()
	if err != nil {
		if ctx.Err() == nil {
			slog.Warn("transcription failed", "error", err)
		}
		j.fail(jb, ErrCodeTranscriptionFailed)
		return
	}
	in.Transcript = CleanTranscript(text)
	if in.Transcript == "" {
		j.fail(jb, ErrCodeEmptyTranscript)
		return
	}
	if !j.setStatus(jb, api.AiJobStatusComposing) {
		return
	}
	cctx, cancelC := context.WithTimeout(ctx, j.timeout)
	res, err := j.composer.Compose(cctx, in)
	cancelC()
	if err != nil {
		if ctx.Err() == nil {
			slog.Warn("composition failed", "error", err)
		}
		j.fail(jb, ErrCodeCompositionFailed)
		return
	}
	out := api.AiResult{Text: res.Text}
	if res.Mood != nil && *res.Mood >= 0 && *res.Mood <= 4 {
		m := *res.Mood
		out.Mood = &m
	}
	if in.Kind == string(api.EntryKindNotebook) && res.Title != "" {
		t := res.Title
		out.Title = &t
	}
	j.transition(jb, func(a *api.AiJob) {
		a.Status = api.AiJobStatusDone
		a.Result = &out
	})
}

func (j *Jobs) lookup(userID int64, id string) (*job, bool) {
	jb, ok := j.jobs[id]
	if !ok || jb.userID != userID {
		return nil, false
	}
	return jb, true
}

// Get returns the job state; jobs of other users are not found.
func (j *Jobs) Get(userID int64, id string) (api.AiJob, bool) {
	j.mu.Lock()
	defer j.mu.Unlock()
	jb, ok := j.lookup(userID, id)
	if !ok {
		return api.AiJob{}, false
	}
	return jb.state, true
}

// Cancel aborts a running job (cancelling the upstream requests). It reports whether
// the job exists for the user; cancelling a finished job is a no-op.
func (j *Jobs) Cancel(userID int64, id string) bool {
	j.mu.Lock()
	jb, ok := j.lookup(userID, id)
	j.mu.Unlock()
	if !ok {
		return false
	}
	if j.setStatus(jb, api.AiJobStatusCancelled) {
		jb.cancel()
	}
	return true
}

// Sweep removes jobs that finished more than 15 minutes ago.
func (j *Jobs) Sweep() {
	j.mu.Lock()
	defer j.mu.Unlock()
	now := j.now()
	for id, jb := range j.jobs {
		if jb.finished() && now.Sub(jb.finishedAt) >= finishedTTL {
			delete(j.jobs, id)
		}
	}
}

// RunJanitor sweeps expired jobs every minute until ctx is done.
func (j *Jobs) RunJanitor(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			j.Sweep()
		}
	}
}

// IsCompositionFailure reports whether err is a composition failure from the language model.
func IsCompositionFailure(err error) bool { return errors.Is(err, ErrCompositionFailed) }
