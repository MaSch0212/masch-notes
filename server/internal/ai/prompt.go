package ai

import (
	_ "embed"
	"fmt"
	"os"
	"regexp"
	"strings"
)

//go:embed prompt.txt
var defaultPrompt string

// DefaultPrompt returns the built-in system prompt.
func DefaultPrompt() string { return strings.TrimSpace(defaultPrompt) }

// LoadPrompt reads a system prompt override from a file.
func LoadPrompt(path string) (string, error) {
	b, err := os.ReadFile(path) //nolint:gosec // operator-configured prompt file
	if err != nil {
		return "", fmt.Errorf("read prompt file: %w", err)
	}
	s := strings.TrimSpace(string(b))
	if s == "" {
		return "", fmt.Errorf("prompt file %s is empty", path)
	}
	return s, nil
}

var (
	noiseTags = regexp.MustCompile(`\[[^\]]*\]|\([^)]*\)`)
	spaces    = regexp.MustCompile(`\s+`)
)

// CleanTranscript removes [..] and (..) noise tags and collapses whitespace.
func CleanTranscript(s string) string {
	s = noiseTags.ReplaceAllString(s, " ")
	return strings.TrimSpace(spaces.ReplaceAllString(s, " "))
}
