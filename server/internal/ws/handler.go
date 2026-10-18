package ws

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
)

// closeUnauthorized is the close status used when authentication fails or times out.
const closeUnauthorized websocket.StatusCode = 4401

var (
	authTimeout  = 10 * time.Second
	pingInterval = 30 * time.Second
	writeTimeout = 10 * time.Second
)

// Handler serves the WebSocket endpoint. The client must send {type:"auth", token}
// within 10 seconds; the server answers authOk, or error and close status 4401.
func Handler(h *Hub, tokens *auth.Tokens, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			log.Debug("websocket accept failed", "error", err)
			return
		}
		defer func() { _ = conn.CloseNow() }()
		serve(r.Context(), h, tokens, conn)
	})
}

func fail(ctx context.Context, conn *websocket.Conn, code string) {
	wctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_ = wsjson.Write(wctx, conn, api.WsServerMessage{Type: api.WsServerMessageTypeError, Error: &code})
	_ = conn.Close(closeUnauthorized, code)
}

func authenticate(ctx context.Context, tokens *auth.Tokens, conn *websocket.Conn) (int64, bool) {
	// A read that is cancelled by its context closes the connection, so the timeout is
	// raced against the read instead; the pending read ends when the connection closes.
	type result struct {
		m   api.WsClientMessage
		err error
	}
	ch := make(chan result, 1)
	go func() {
		var m api.WsClientMessage
		err := wsjson.Read(ctx, conn, &m)
		ch <- result{m, err}
	}()
	timer := time.NewTimer(authTimeout)
	defer timer.Stop()
	var res result
	select {
	case res = <-ch:
	case <-timer.C:
		fail(ctx, conn, "authTimeout")
		return 0, false
	}
	if res.err != nil {
		_ = conn.CloseNow()
		return 0, false
	}
	if res.m.Type != api.WsClientMessageTypeAuth {
		fail(ctx, conn, "unauthorized")
		return 0, false
	}
	id, err := tokens.Parse(res.m.Token)
	if err != nil {
		fail(ctx, conn, "unauthorized")
		return 0, false
	}
	return id, true
}

func serve(ctx context.Context, h *Hub, tokens *auth.Tokens, conn *websocket.Conn) {
	userID, ok := authenticate(ctx, tokens, conn)
	if !ok {
		return
	}
	c := h.register(userID)
	defer h.unregister(userID, c)

	wctx, cancelWrite := context.WithTimeout(ctx, writeTimeout)
	err := wsjson.Write(wctx, conn, api.WsServerMessage{Type: api.WsServerMessageTypeAuthOk})
	cancelWrite()
	if err != nil {
		return
	}

	// Reading drives control frames (pong, close); incoming data messages are ignored.
	rctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		defer cancel()
		for {
			if _, _, err := conn.Read(rctx); err != nil {
				return
			}
		}
	}()

	ping := time.NewTicker(pingInterval)
	defer ping.Stop()
	for {
		select {
		case <-rctx.Done():
			return
		case <-c.drop:
			_ = conn.Close(websocket.StatusPolicyViolation, "slow consumer")
			return
		case msg := <-c.send:
			wctx, cancel := context.WithTimeout(rctx, writeTimeout)
			err := wsjson.Write(wctx, conn, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(rctx, writeTimeout)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
