// Command maschnotes is the MaSch Notes server.
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/ai"
	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/config"
	"github.com/MaSch0212/masch-notes/server/internal/db"
	"github.com/MaSch0212/masch-notes/server/internal/service"
	"github.com/MaSch0212/masch-notes/server/internal/store"
	"github.com/MaSch0212/masch-notes/server/internal/web"
	"github.com/MaSch0212/masch-notes/server/internal/ws"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("configuration: %w", err)
	}
	if err := os.MkdirAll(cfg.DataDir, 0o750); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}
	secret, keySource, err := jwtKey(cfg)
	if err != nil {
		return err
	}
	logConfig(log, cfg, keySource)

	dbPath := filepath.Join(cfg.DataDir, "maschnotes.db")
	database, err := db.Open(dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = database.Close() }()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := db.Migrate(ctx, database, dbPath, time.Now); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	handler, err := buildHandler(ctx, cfg, database, secret, log)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              net.JoinHostPort("", strconv.Itoa(cfg.Port)),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	log.Info("listening", "addr", srv.Addr)

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		_ = srv.Close()
	}
	return nil
}

func logConfig(log *slog.Logger, cfg config.Config, keySource string) {
	attrs := []any{
		"port", cfg.Port, "dataDir", cfg.DataDir, "basePath", cfg.BasePath,
		"allowRegistration", cfg.AllowRegistration, "jwtKey", keySource, "aiEnabled", cfg.AI.Enabled(),
	}
	if cfg.AI.Enabled() {
		attrs = append(attrs,
			"aiWhisperUrl", cfg.AI.WhisperURL, "aiWhisperLanguage", cfg.AI.WhisperLanguage,
			"aiLlmUrl", cfg.AI.LLMURL, "aiLlmModel", cfg.AI.LLMModel, "aiLlmThink", cfg.AI.LLMThink,
			"aiMaxAudioBytes", cfg.AI.MaxAudioBytes, "aiTimeout", cfg.AI.Timeout.String(),
			"aiCustomPrompt", cfg.AI.PromptFile != "")
	}
	log.Info("configuration", attrs...)
}

// checkAI logs whether the whisper and Ollama servers are reachable. It never stops the server,
// since the AI servers may simply start later.
func checkAI(ctx context.Context, cfg config.AIConfig, client *http.Client, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	report := func(name, url string, err error) {
		if err != nil {
			log.Error("AI endpoint check failed", "endpoint", name, "url", url, "error", err)
			return
		}
		log.Info("AI endpoint reachable", "endpoint", name, "url", url)
	}
	report("whisper", cfg.WhisperURL, ai.CheckWhisper(ctx, client, cfg.WhisperURL))
	report("ollama", cfg.LLMURL, ai.CheckOllama(ctx, client, cfg.LLMURL, cfg.LLMModel))
}

// jwtKey returns the signing secret from the environment or DATA_DIR/jwt.key (created on first start).
func jwtKey(cfg config.Config) (key []byte, source string, err error) {
	if len(cfg.JWTKey) > 0 {
		return cfg.JWTKey, "env", nil
	}
	p := filepath.Join(cfg.DataDir, "jwt.key")
	b, err := os.ReadFile(p) //nolint:gosec // fixed file name inside the data dir
	if err == nil && len(strings.TrimSpace(string(b))) > 0 {
		return []byte(strings.TrimSpace(string(b))), "file", nil
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, "", fmt.Errorf("read jwt key: %w", err)
	}
	raw := make([]byte, 64)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", fmt.Errorf("generate jwt key: %w", err)
	}
	enc := base64.StdEncoding.EncodeToString(raw)
	if err := os.WriteFile(p, []byte(enc), 0o600); err != nil {
		return nil, "", fmt.Errorf("write jwt key: %w", err)
	}
	return []byte(enc), "generated", nil
}

// buildHandler wires the services, the generated routes, the WebSocket endpoint and the SPA.
func buildHandler(ctx context.Context, cfg config.Config, database *sql.DB, secret []byte, log *slog.Logger) (http.Handler, error) {
	st := store.New(database)
	tokens := auth.NewTokens(secret, time.Now)
	hub := ws.NewHub()

	opts := []api.ServerOption{
		api.WithErrorHandler(service.WriteError),
		api.WithMiddleware(auth.Middleware(tokens, st.UserIDByAPIKey, auth.IsPublicRoute)),
	}
	mux := http.NewServeMux()
	api.RegisterAuthRoutes(mux, &service.AuthService{Store: st, Tokens: tokens, Cfg: cfg, Secret: secret}, opts...)
	api.RegisterUserRoutes(mux, &service.UserService{Store: st}, opts...)
	api.RegisterNotebooksRoutes(mux, &service.NotebooksService{Store: st}, opts...)
	api.RegisterDayRatingsRoutes(mux, &service.DayRatingsService{Store: st}, opts...)
	api.RegisterAPIKeysRoutes(mux, &service.APIKeysService{Store: st}, opts...)
	api.RegisterCryptoRoutes(mux, &service.CryptoService{Store: st}, opts...)

	aiSvc := &service.AiService{Cfg: cfg}
	if cfg.AI.Enabled() {
		prompt := ai.DefaultPrompt()
		if cfg.AI.PromptFile != "" {
			p, err := ai.LoadPrompt(cfg.AI.PromptFile)
			if err != nil {
				return nil, err
			}
			prompt = p
		}
		// A short dial timeout makes an unreachable host fail fast instead of after AI_TIMEOUT.
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.DialContext = (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext
		client := &http.Client{Timeout: cfg.AI.Timeout, Transport: transport}
		go checkAI(ctx, cfg.AI, client, log)
		aiSvc.Jobs = ai.NewJobs(
			ai.NewWhisper(cfg.AI.WhisperURL, cfg.AI.WhisperLanguage, client),
			ai.NewOllama(cfg.AI.LLMURL, cfg.AI.LLMModel, cfg.AI.LLMThink, prompt, client),
			func(userID int64, job api.AiJob) {
				hub.Publish(userID, api.WsServerMessage{Type: api.WsServerMessageTypeAiJob, Job: &job})
			},
			cfg.AI.Timeout, time.Now,
		)
		go aiSvc.Jobs.RunJanitor(ctx)
	}
	api.RegisterAiRoutes(mux, aiSvc, service.AiRouteOptions(cfg, opts...)...)

	// The WebSocket authenticates itself with its first message, so it lives outside the auth middleware.
	mux.Handle("/api/ws", ws.Handler(hub, tokens, log))
	mux.Handle("/", web.NewSPA(web.Dist(), cfg.BasePath))

	return web.BasePath(cfg.BasePath, mux), nil
}
