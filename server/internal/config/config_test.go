package config

import (
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	c, err := Load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != 80 || c.DataDir != "data" || !c.AllowRegistration {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if c.AI.WhisperLanguage != "auto" || c.AI.MaxAudioBytes != 50<<20 || c.AI.Timeout != 10*time.Minute {
		t.Fatalf("unexpected AI defaults: %+v", c.AI)
	}
	if c.AI.Enabled() || c.JWTKey != nil || c.BasePath != "" {
		t.Fatalf("unexpected: %+v", c)
	}
}

func TestLoadContainerDataDir(t *testing.T) {
	c, err := Load(env(map[string]string{"DOTNET_RUNNING_IN_CONTAINER": "true"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.DataDir != "/data" {
		t.Fatalf("got %q", c.DataDir)
	}
	c, err = Load(env(map[string]string{"DOTNET_RUNNING_IN_CONTAINER": "true", "DATA_DIR": "/x"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.DataDir != "/x" {
		t.Fatalf("got %q", c.DataDir)
	}
}

func TestLoadAliases(t *testing.T) {
	c, _ := Load(env(map[string]string{"path-base": "/MaSchNotes/", "JWT__key": "abc"}))
	if c.BasePath != "/MaSchNotes" || string(c.JWTKey) != "abc" {
		t.Fatalf("got %+v", c)
	}
	c, _ = Load(env(map[string]string{"PathBase": "MaSchNotes", "JWT:key": "def"}))
	if c.BasePath != "/MaSchNotes" || string(c.JWTKey) != "def" {
		t.Fatalf("got %+v", c)
	}
	c, _ = Load(env(map[string]string{
		"BASE_PATH": "/new", "path-base": "/old", "JWT_KEY": "win", "JWT__key": "lose",
	}))
	if c.BasePath != "/new" || string(c.JWTKey) != "win" {
		t.Fatalf("got %+v", c)
	}
	c, _ = Load(env(map[string]string{"BASE_PATH": "/"}))
	if c.BasePath != "" {
		t.Fatalf("got %q", c.BasePath)
	}
}

func TestAIEnabledNeedsAllThree(t *testing.T) {
	full := map[string]string{"AI_WHISPER_URL": "w", "AI_LLM_URL": "l", "AI_LLM_MODEL": "m"}
	c, _ := Load(env(full))
	if !c.AI.Enabled() {
		t.Fatal("expected enabled")
	}
	for k := range full {
		m := map[string]string{}
		for k2, v := range full {
			if k2 != k {
				m[k2] = v
			}
		}
		c, _ := Load(env(m))
		if c.AI.Enabled() {
			t.Fatalf("enabled without %s", k)
		}
	}
}

func TestLoadInvalidPort(t *testing.T) {
	for _, p := range []string{"abc", "0", "70000", "-1"} {
		if _, err := Load(env(map[string]string{"PORT": p})); err == nil {
			t.Fatalf("expected error for %q", p)
		}
	}
}

func TestLoadAIOptions(t *testing.T) {
	c, err := Load(env(map[string]string{
		"AI_MAX_AUDIO_MB": "5", "AI_TIMEOUT": "30s", "AI_LLM_THINK": "true",
		"AI_WHISPER_LANGUAGE": "de", "ALLOW_REGISTRATION": "false",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.AI.MaxAudioBytes != 5<<20 || c.AI.Timeout != 30*time.Second || !c.AI.LLMThink ||
		c.AI.WhisperLanguage != "de" || c.AllowRegistration {
		t.Fatalf("got %+v", c)
	}
	if _, err := Load(env(map[string]string{"AI_TIMEOUT": "x"})); err == nil {
		t.Fatal("expected error")
	}
}
