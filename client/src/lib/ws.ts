import type { WsClientMessage } from '../api/models/ws-client-message';
import type { WsServerMessage } from '../api/models/ws-server-message';

export type WsClient = {
  subscribe(fn: (m: WsServerMessage) => void): () => void;
  close(): void;
};

const MIN_DELAY = 1000;
const MAX_DELAY = 30000;
const AUTH_REJECTED = 4401;

/**
 * WebSocket client for server pushes. It connects lazily (on the first subscriber), sends the
 * auth message, reconnects with backoff and disconnects when the last subscriber leaves.
 * Subscribers also receive `authOk` / `error` messages, so they can re-sync after a reconnect.
 */
export function createWsClient(opts: { url: string; getToken(): string | null }): WsClient {
  const subscribers = new Set<(m: WsServerMessage) => void>();
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = MIN_DELAY;
  let rejectedToken: string | null = null;
  let closed = true;

  const schedule = () => {
    if (closed || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      connect();
    }, delay);
    delay = Math.min(delay * 2, MAX_DELAY);
  };

  function connect() {
    if (closed || socket) return;
    const token = opts.getToken();
    // After a 4401 wait for a different token instead of hammering the server.
    if (!token || token === rejectedToken) {
      schedule();
      return;
    }
    const ws = new WebSocket(opts.url);
    socket = ws;
    ws.onopen = () => {
      const msg: WsClientMessage = { type: 'auth', token };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (e) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as WsServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'authOk') delay = MIN_DELAY;
      for (const fn of subscribers) fn(msg);
    };
    ws.onclose = (e) => {
      if (socket !== ws) return;
      socket = undefined;
      if (e.code === AUTH_REJECTED) rejectedToken = token;
      schedule();
    };
  }

  const shutdown = () => {
    closed = true;
    clearTimeout(timer);
    timer = undefined;
    const ws = socket;
    socket = undefined;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };

  return {
    subscribe(fn) {
      subscribers.add(fn);
      if (closed) {
        closed = false;
        delay = MIN_DELAY;
        connect();
      }
      return () => {
        subscribers.delete(fn);
        if (subscribers.size === 0) shutdown();
      };
    },
    close() {
      subscribers.clear();
      shutdown();
    },
  };
}
