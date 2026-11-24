import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';

function renderDialog(onConfirm = vi.fn(), onCancel = vi.fn()) {
  const ui = (cancel: () => void) => (
    <ConfirmDialog open title="Delete it?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={cancel}>
      <p>Body text</p>
    </ConfirmDialog>
  );
  const result = render(ui(onCancel));
  return { ...result, ui, onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('is an alertdialog named by its title, with focus on Cancel', () => {
    renderDialog();
    expect(screen.getByRole('alertdialog', { name: 'Delete it?' })).toHaveAccessibleDescription('Body text');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('cancels on Escape and confirms on the confirm button', () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps focus where the user put it when the parent re-renders', () => {
    const { rerender, ui } = renderDialog();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    confirm.focus();
    rerender(ui(vi.fn())); // new inline onCancel, as a parent re-render would pass
    expect(confirm).toHaveFocus();
  });

  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog open={false} title="x" confirmLabel="y" onConfirm={vi.fn()} onCancel={vi.fn()}>
        z
      </ConfirmDialog>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
