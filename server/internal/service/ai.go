package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/ai"
	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/config"
)

// multipartOverhead is the slack above the audio limit that the request body may use for the other form fields.
const multipartOverhead = 1 << 20

// AiService implements api.AiService.
type AiService struct {
	// Jobs is nil when AI is not configured.
	Jobs *ai.Jobs
	Cfg  config.Config
}

var _ api.AiService = (*AiService)(nil)

func aiDisabled() *Error {
	return newError(http.StatusNotFound, "aiDisabled", "AI voice entries are not configured")
}

func audioTooLarge() *Error {
	return newError(http.StatusRequestEntityTooLarge, "audioTooLarge", "the recording is too large")
}

func (s *AiService) enabled() bool { return s.Jobs != nil && s.Cfg.AI.Enabled() }

// AiRouteOptions extends the shared server options for the AI routes: the multipart body is kept in
// memory (never spooled to disk) and limited to the configured audio size.
func AiRouteOptions(cfg config.Config, base ...api.ServerOption) []api.ServerOption {
	limit := cfg.AI.MaxAudioBytes
	opts := append([]api.ServerOption(nil), base...)
	return append(opts,
		api.WithErrorHandler(writeAiError),
		api.WithMaxMultipartMemory(limit+multipartOverhead),
		api.WithMiddleware(func(next http.Handler) http.Handler {
			return http.MaxBytesHandler(next, limit+multipartOverhead)
		}),
	)
}

// writeAiError reports a request body that exceeds the limit as audioTooLarge.
func writeAiError(w http.ResponseWriter, r *http.Request, err error) {
	var re *api.RequestError
	if errors.As(err, &re) && re.StatusCode == http.StatusRequestEntityTooLarge {
		err = audioTooLarge()
	}
	WriteError(w, r, err)
}

func (s *AiService) CreateAiJob(ctx context.Context, req api.CreateAiJobRequest) (api.CreateAiJobResponse, error) {
	if !s.enabled() {
		return nil, aiDisabled()
	}
	userID, ok := auth.UserID(ctx)
	if !ok {
		return nil, errors.New("no authenticated user")
	}
	b := req.Body
	if !b.Kind.IsValid() {
		return nil, badRequest("invalidKind", "kind must be diary or notebook")
	}
	in := ai.ComposeInput{Kind: string(b.Kind)}
	if b.Date != nil && *b.Date != "" {
		d, err := time.Parse(time.DateOnly, *b.Date)
		if err != nil {
			return nil, badRequest("invalidDate", "date must be yyyy-MM-dd")
		}
		in.Date = &d
	}
	if b.Title != nil {
		in.Title = strings.TrimSpace(*b.Title)
	}

	limit := s.Cfg.AI.MaxAudioBytes
	if b.Audio == nil {
		return nil, badRequest("invalidRequest", "audio is required")
	}
	if b.Audio.Size > limit {
		return nil, audioTooLarge()
	}
	f, err := b.Audio.Open()
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	audio, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(audio)) > limit {
		return nil, audioTooLarge()
	}
	if len(audio) == 0 {
		return nil, badRequest("emptyAudio", "the recording is empty")
	}

	id := s.Jobs.Start(userID, audio, ai.AudioFileName(b.Audio.Filename), in)
	return api.CreateAiJob202Response{Body: api.AiJobCreated{JobID: id}}, nil
}

func (s *AiService) GetAiJob(ctx context.Context, req api.GetAiJobRequest) (api.GetAiJobResponse, error) {
	if !s.enabled() {
		return nil, aiDisabled()
	}
	userID, _ := auth.UserID(ctx)
	job, ok := s.Jobs.Get(userID, req.JobID)
	if !ok {
		return nil, newError(http.StatusNotFound, "notFound", "job not found")
	}
	return api.GetAiJob200Response{Body: job}, nil
}

func (s *AiService) CancelAiJob(ctx context.Context, req api.CancelAiJobRequest) (api.CancelAiJobResponse, error) {
	if !s.enabled() {
		return nil, aiDisabled()
	}
	userID, _ := auth.UserID(ctx)
	if !s.Jobs.Cancel(userID, req.JobID) {
		return nil, newError(http.StatusNotFound, "notFound", "job not found")
	}
	return api.CancelAiJob204Response{}, nil
}
