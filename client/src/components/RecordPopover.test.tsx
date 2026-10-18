import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AiJobStatus } from '../api/models/ai-job-status';
import { I18nProvider } from '../lib/i18n';
import { RecordPopover } from './RecordPopover';

function show(status: AiJobStatus, extra: { error?: string } = {}) {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const onCancel = vi.fn<() => void>();
  const onRetry = vi.fn<() => void>();
  render(() => (
    <I18nProvider locale="en">
      <RecordPopover
        open
        anchor={anchor}
        status={status}
        duration="02:41"
        onCancel={onCancel}
        onRetry={onRetry}
        {...extra}
      />
    </I18nProvider>
  ));
  return { onCancel, onRetry };
}

const state = (step: string) =>
  document.querySelector(`[data-step="${step}"]`)?.getAttribute('data-state');

describe('RecordPopover', () => {
  it('popover shows steps without a privacy note', async () => {
    const { onCancel } = show('composing');
    expect(screen.getByText(/Recording/)).toHaveTextContent('Recording (02:41)');
    expect(state('transcribing')).toBe('done');
    expect(state('composing')).toBe('active');
    expect(screen.queryByText(/Your recording is sent through your MaSch Notes server/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the failing step with retry', async () => {
    const { onRetry } = show('failed', { error: 'transcriptionFailed' });
    expect(state('transcribing')).toBe('failed');
    expect(state('composing')).toBe('pending');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed during: Transcribing');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be transcribed');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
