package ws

import (
	"context"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
)

var secret = []byte("test-secret-0123456789abcdef0123")

type env struct {
	srv    *httptest.Server
	hub    *Hub
	tokens *auth.Tokens
}

func newEnv(t *testing.T) *env {
	t.Helper()
	hub := NewHub()
	tokens := auth.NewTokens(secret, time.Now)
	srv := httptest.NewServer(Handler(hub, tokens, slog.New(slog.DiscardHandler)))
	t.Cleanup(srv.Close)
	return &env{srv: srv, hub: hub, tokens: tokens}
}

func (e *env) dial(t *testing.T) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(e.srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c
}

func (e *env) login(t *testing.T, userID int64) *websocket.Conn {
	t.Helper()
	c := e.dial(t)
	tok, _, err := e.tokens.Issue(userID, false)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := wsjson.Write(ctx, c, api.WsClientMessage{Type: api.WsClientMessageTypeAuth, Token: tok}); err != nil {
		t.Fatal(err)
	}
	var m api.WsServerMessage
	if err := wsjson.Read(ctx, c, &m); err != nil {
		t.Fatal(err)
	}
	if m.Type != api.WsServerMessageTypeAuthOk {
		t.Fatalf("got %+v, want authOk", m)
	}
	return c
}

func readMsg(t *testing.T, c *websocket.Conn, d time.Duration) (api.WsServerMessage, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	var m api.WsServerMessage
	err := wsjson.Read(ctx, c, &m)
	return m, err
}

func jobMsg(id string) api.WsServerMessage {
	return api.WsServerMessage{Type: api.WsServerMessageTypeAiJob, Job: &api.AiJob{JobID: id, Status: api.AiJobStatusQueued}}
}

func waitConns(t *testing.T, h *Hub, user int64, n int) {
	t.Helper()
	for range 200 {
		if h.connCount(user) == n {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("connections of user %d = %d, want %d", user, h.connCount(user), n)
}

func TestWsAuthAndPublish(t *testing.T) {
	e := newEnv(t)
	c1 := e.login(t, 1)
	c2 := e.login(t, 2)
	waitConns(t, e.hub, 1, 1)
	waitConns(t, e.hub, 2, 1)

	e.hub.Publish(1, jobMsg("a"))
	m, err := readMsg(t, c1, 2*time.Second)
	if err != nil || m.Type != api.WsServerMessageTypeAiJob || m.Job == nil || m.Job.JobID != "a" {
		t.Fatalf("user 1 got %+v, %v", m, err)
	}
	if m, err := readMsg(t, c2, 200*time.Millisecond); err == nil {
		t.Fatalf("user 2 must not receive the message of user 1, got %+v", m)
	}
}

func TestWsMultipleTabsSameUser(t *testing.T) {
	e := newEnv(t)
	c1 := e.login(t, 1)
	c2 := e.login(t, 1)
	waitConns(t, e.hub, 1, 2)
	e.hub.Publish(1, jobMsg("x"))
	for i, c := range []*websocket.Conn{c1, c2} {
		m, err := readMsg(t, c, 2*time.Second)
		if err != nil || m.Job == nil || m.Job.JobID != "x" {
			t.Fatalf("tab %d got %+v, %v", i, m, err)
		}
	}
}

func TestWsBadToken(t *testing.T) {
	e := newEnv(t)
	c := e.dial(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := wsjson.Write(ctx, c, api.WsClientMessage{Type: api.WsClientMessageTypeAuth, Token: "nope"}); err != nil {
		t.Fatal(err)
	}
	var m api.WsServerMessage
	if err := wsjson.Read(ctx, c, &m); err != nil || m.Type != api.WsServerMessageTypeError {
		t.Fatalf("got %+v, %v; want error message", m, err)
	}
	_, _, err := c.Read(ctx)
	if websocket.CloseStatus(err) != 4401 {
		t.Fatalf("close status = %d, want 4401 (%v)", websocket.CloseStatus(err), err)
	}
}

func TestWsAuthTimeout(t *testing.T) {
	old := authTimeout
	authTimeout = 100 * time.Millisecond
	t.Cleanup(func() { authTimeout = old })
	e := newEnv(t)
	c := e.dial(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var m api.WsServerMessage
	if err := wsjson.Read(ctx, c, &m); err != nil || m.Type != api.WsServerMessageTypeError {
		t.Fatalf("got %+v, %v; want error message", m, err)
	}
	_, _, err := c.Read(ctx)
	if websocket.CloseStatus(err) != 4401 {
		t.Fatalf("close status = %d, want 4401 (%v)", websocket.CloseStatus(err), err)
	}
}

func TestWsDisconnectUnregisters(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, 1)
	waitConns(t, e.hub, 1, 1)
	_ = c.Close(websocket.StatusNormalClosure, "")
	waitConns(t, e.hub, 1, 0)
}
