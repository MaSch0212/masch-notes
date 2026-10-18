import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../lib/i18n';
import { SessionContext } from '../lib/session-context';
import type { Session } from '../lib/session';

const recorderStart = vi.fn<() => Promise<void>>();
const checkLiveUpdates = vi.fn<() => Promise<boolean>>();

vi.mock('../lib/audio/recorder', async () => {
  const { createSignal } = await import('solid-js');
  return {
    createRecorder: () => ({
      start: recorderStart,
      stop: vi.fn<() => void>(),
      cancel: vi.fn<() => void>(),
      elapsedMs: createSignal(0)[0],
      recording: createSignal(false)[0],
    }),
  };
});
vi.mock('../lib/ai-jobs', () => ({
  checkLiveUpdates: () => checkLiveUpdates(),
  resumePendingJob: () => undefined,
  sharedWsClient: () => ({}),
  startAiJob: vi.fn<() => void>(),
}));

import { RecordButton } from './RecordButton';

const KEY = 'maschnotes.recordingInfoAccepted';

function show() {
  const session = { state: { token: 't' }, api: {} } as unknown as Session;
  render(() => (
    <I18nProvider locale="en">
      <SessionContext.Provider value={session}>
        <RecordButton kind="diary" date="2026-10-18" onResult={() => undefined} />
      </SessionContext.Provider>
    </I18nProvider>
  ));
}

beforeEach(() => {
  localStorage.clear();
  recorderStart.mockReset();
  recorderStart.mockResolvedValue();
  checkLiveUpdates.mockReset();
  checkLiveUpdates.mockResolvedValue(true);
});

describe('RecordButton info dialog', () => {
  it('first click shows the dialog without recording; Start recording records and remembers', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByRole('dialog', { name: 'Before you record' })).toBeInTheDocument();
    expect(recorderStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(recorderStart).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Cancel leaves the flag unset', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(recorderStart).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts directly once accepted; info button reopens a read-only dialog', async () => {
    localStorage.setItem(KEY, '1');
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(recorderStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('info button opens the dialog in info mode', async () => {
    localStorage.setItem(KEY, '1');
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'About voice entries' }));
    expect(screen.getByRole('dialog', { name: 'Before you record' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('RecordButton live updates', () => {
  it('disables recording with an explanation when the WebSocket cannot connect', async () => {
    checkLiveUpdates.mockResolvedValue(false);
    show();
    const button = screen.getByRole('button', { name: 'Record' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button.title).toMatch(/WebSocket/);
  });

  it('keeps recording enabled when the WebSocket connects', async () => {
    show();
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });
});
