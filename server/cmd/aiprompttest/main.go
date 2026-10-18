// Command aiprompttest runs the transcription and composition pipeline on an audio file with the real
// servers, to tune the system prompt.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/ai"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "aiprompttest:", err)
		os.Exit(1)
	}
}

func run() error {
	audio := flag.String("audio", "", "audio file (mp3/wav)")
	whisperURL := flag.String("whisper", "", "whisper.cpp server base URL")
	llmURL := flag.String("llm", "", "Ollama base URL")
	model := flag.String("model", "", "Ollama model")
	think := flag.Bool("think", false, "enable Ollama thinking")
	kind := flag.String("kind", "diary", "diary or notebook")
	date := flag.String("date", "", "entry date (yyyy-MM-dd)")
	language := flag.String("language", "auto", "whisper language")
	promptFile := flag.String("prompt", "", "optional system prompt file (default: built-in)")
	timeout := flag.Duration("timeout", 10*time.Minute, "per-step timeout")
	flag.Parse()
	if *audio == "" || *whisperURL == "" || *llmURL == "" || *model == "" {
		return errors.New("-audio, -whisper, -llm and -model are required")
	}

	prompt := ai.DefaultPrompt()
	if *promptFile != "" {
		p, err := ai.LoadPrompt(*promptFile)
		if err != nil {
			return err
		}
		prompt = p
	}
	in := ai.ComposeInput{Kind: *kind}
	if *date != "" {
		d, err := time.Parse(time.DateOnly, *date)
		if err != nil {
			return fmt.Errorf("-date: %w", err)
		}
		in.Date = &d
	}

	f, err := os.Open(*audio)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	client := &http.Client{Timeout: *timeout}
	ctx := context.Background()

	start := time.Now()
	text, err := ai.NewWhisper(*whisperURL, *language, client).Transcribe(ctx, f, filepath.Base(*audio))
	if err != nil {
		return err
	}
	transcribeTime := time.Since(start)
	in.Transcript = ai.CleanTranscript(text)
	if in.Transcript == "" {
		return errors.New("empty transcript")
	}

	start = time.Now()
	res, err := ai.NewOllama(*llmURL, *model, *think, prompt, client).Compose(ctx, in)
	if err != nil {
		return err
	}
	composeTime := time.Since(start)

	fmt.Printf("--- transcript ---\n%s\n\n--- entry ---\n%s\n\n", in.Transcript, res.Text)
	mood := "none"
	if res.Mood != nil {
		mood = fmt.Sprint(*res.Mood)
	}
	fmt.Printf("mood: %s\ntitle: %q\ntranscribe: %s\ncompose: %s (think=%v)\n",
		mood, res.Title, transcribeTime.Round(time.Millisecond), composeTime.Round(time.Millisecond), *think)
	return nil
}
