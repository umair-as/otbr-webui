import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('bad field');
  return <p>page content</p>;
}

describe('ErrorBoundary', () => {
  it('shows a message instead of the failed page and can retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('This page failed to render');
    expect(screen.getByText('bad field')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('clears the error when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary resetKey="/topology">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <ErrorBoundary resetKey="/">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
