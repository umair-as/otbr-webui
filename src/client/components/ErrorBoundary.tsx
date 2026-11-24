import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this value clears the error, e.g. the current route path. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a rendering error in one page from blanking the whole app.
 *
 * This is a class component on purpose: React has no hook equivalent of
 * getDerivedStateFromError / componentDidCatch.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="rounded-xl border border-border bg-surface p-5 shadow-sm border-l-4 border-l-accent">
        <div className="flex items-start gap-3">
          <span className="material-icons text-[22px] text-accent" aria-hidden="true">
            error_outline
          </span>
          <div>
            <p className="font-medium text-content">This page failed to render</p>
            <p className="mt-1 text-sm text-content-secondary">
              The border router may have returned data in an unexpected format. Other pages still work.
            </p>
            <p className="mt-2 font-mono text-xs text-content-muted">{error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium text-content-secondary hover:bg-page"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
