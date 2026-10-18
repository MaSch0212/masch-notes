// Package config loads the server configuration from environment variables.
package config

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

type AIConfig struct {
	WhisperURL, WhisperLanguage, LLMURL, LLMModel, PromptFile string
	LLMThink                                                  bool
	MaxAudioBytes                                             int64
	Timeout                                                   time.Duration
}

// Enabled reports whether all settings required for AI voice entries are present.
func (a AIConfig) Enabled() bool {
	return a.WhisperURL != "" && a.LLMURL != "" && a.LLMModel != ""
}

type Config struct {
	Port              int
	DataDir           string
	JWTKey            []byte // nil if unset
	BasePath          string
	AllowRegistration bool
	AI                AIConfig
}

// first returns the first non-empty value among the given env names.
func first(getenv func(string) string, names ...string) string {
	for _, n := range names {
		if v := getenv(n); v != "" {
			return v
		}
	}
	return ""
}

func normalizeBasePath(p string) string {
	p = strings.Trim(strings.TrimSpace(p), "/")
	if p == "" {
		return ""
	}
	return "/" + p
}

func parseBool(s string, def bool) (bool, error) {
	if s == "" {
		return def, nil
	}
	return strconv.ParseBool(s)
}

func Load(getenv func(string) string) (Config, error) {
	c := Config{Port: 80, AllowRegistration: true}

	if v := getenv("PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil || p < 1 || p > 65535 {
			return c, fmt.Errorf("invalid PORT %q", v)
		}
		c.Port = p
	}

	switch {
	case getenv("DATA_DIR") != "":
		c.DataDir = getenv("DATA_DIR")
	case strings.EqualFold(getenv("DOTNET_RUNNING_IN_CONTAINER"), "true"):
		c.DataDir = "/data"
	default:
		c.DataDir = "data"
	}

	if k := first(getenv, "JWT_KEY", "JWT__key", "JWT:key"); k != "" {
		c.JWTKey = []byte(k)
	}
	c.BasePath = normalizeBasePath(first(getenv, "BASE_PATH", "path-base", "PathBase"))

	var err error
	if c.AllowRegistration, err = parseBool(getenv("ALLOW_REGISTRATION"), true); err != nil {
		return c, fmt.Errorf("invalid ALLOW_REGISTRATION: %w", err)
	}

	a := AIConfig{
		WhisperURL:      getenv("AI_WHISPER_URL"),
		WhisperLanguage: "auto",
		LLMURL:          getenv("AI_LLM_URL"),
		LLMModel:        getenv("AI_LLM_MODEL"),
		PromptFile:      getenv("AI_LLM_PROMPT_FILE"),
		MaxAudioBytes:   50 << 20,
		Timeout:         10 * time.Minute,
	}
	if v := getenv("AI_WHISPER_LANGUAGE"); v != "" {
		a.WhisperLanguage = v
	}
	if a.LLMThink, err = parseBool(getenv("AI_LLM_THINK"), false); err != nil {
		return c, fmt.Errorf("invalid AI_LLM_THINK: %w", err)
	}
	if v := getenv("AI_MAX_AUDIO_MB"); v != "" {
		mb, err := strconv.ParseInt(v, 10, 64)
		if err != nil || mb < 1 {
			return c, fmt.Errorf("invalid AI_MAX_AUDIO_MB %q", v)
		}
		a.MaxAudioBytes = mb << 20
	}
	if v := getenv("AI_TIMEOUT"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return c, fmt.Errorf("invalid AI_TIMEOUT %q", v)
		}
		a.Timeout = d
	}
	c.AI = a
	return c, nil
}
