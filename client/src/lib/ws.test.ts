import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WsServerMessage } from '../api/models/ws-server-message';
import { createWsClient } from './ws';

class FakeSocket {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
  open() {
    this.onopen?.();
  }
  receive(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(code = 1006) {
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ws client', () => {
  it('authenticates then delivers messages and reconnects', () => {
    const client = createWsClient({ url: 'ws://x/api/ws', getToken: () => 'tok' });
    const got: WsServerMessage[] = [];
    expect(FakeSocket.instances).toHaveLength(0); // lazy
    client.subscribe((m) => got.push(m));
    const first = FakeSocket.instances[0]!;
    first.open();
    expect(JSON.parse(first.sent[0]!)).toEqual({ type: 'auth', token: 'tok' });
    first.receive({ type: 'authOk' });
    first.receive({ type: 'aiJob', job: { jobId: '1', status: 'done' } });
    expect(got.map((m) => m.type)).toEqual(['authOk', 'aiJob']);

    first.drop();
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.open();
    expect(JSON.parse(FakeSocket.instances[1]!.sent[0]!).token).toBe('tok');
    client.close();
  });

  it('does not reconnect with a rejected token', () => {
    let token = 'old';
    const client = createWsClient({ url: 'ws://x/api/ws', getToken: () => token });
    client.subscribe(() => {});
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(4401);
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.instances).toHaveLength(1);
    token = 'new';
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });
});
