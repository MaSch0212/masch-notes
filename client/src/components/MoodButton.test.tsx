import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../lib/i18n';
import { MoodButton } from './MoodPicker';

describe('MoodButton', () => {
  it('shows the mood and changes it through the popover', async () => {
    const user = userEvent.setup();
    const [mood, setMood] = createSignal<number | null>(null);
    render(() => (
      <I18nProvider locale="en">
        <MoodButton value={mood()} onChange={setMood} />
      </I18nProvider>
    ));
    await user.click(screen.getByRole('button', { name: 'Mood' }));
    await user.click(screen.getByRole('button', { name: /good/i, pressed: false }));
    expect(mood()).toBe(3);
    expect(screen.getByRole('button', { name: /^Mood: /, expanded: false })).toBeInTheDocument();
  });
});
