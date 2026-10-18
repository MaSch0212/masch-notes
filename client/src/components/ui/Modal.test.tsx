import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('traps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(() => (
      <>
        <button>outside</button>
        <Modal open title="Hello" onClose={onClose}>
          <button>first</button>
          <button>last</button>
        </Modal>
      </>
    ));

    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('first')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('last')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('first')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByText('last')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
