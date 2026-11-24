import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CopyButton, { copyText } from './CopyButton';

function setSecureContext(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure });
}

afterEach(() => {
  vi.restoreAllMocks();
  setSecureContext(true);
});

describe('copyText', () => {
  it('uses the Clipboard API in a secure context', async () => {
    setSecureContext(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    expect(await copyText('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  // The gateway serves the UI over plain HTTP, where navigator.clipboard is undefined.
  it('falls back to execCommand outside a secure context', async () => {
    setSecureContext(false);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });

    expect(await copyText('abc')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('CopyButton', () => {
  it('reports a failed copy', async () => {
    setSecureContext(false);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });

    render(<CopyButton value="secret" label="Network Key" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Network Key' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
    });
  });
});
