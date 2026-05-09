import { useEffect, useState } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

declare const __APP_VERSION__: string;

const GITHUB_ICON_PATH =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'h-3.5 w-3.5'} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d={GITHUB_ICON_PATH} />
    </svg>
  );
}

function formatRelative(ms: number): string {
  if (ms < 10_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function SyncIndicator() {
  const { status, lastUpdate } = useWebSocket();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (status !== 'connected' || lastUpdate === null) {
    return (
      <span className="flex items-center gap-1.5 text-content-muted" aria-label="Sync status">
        <span className="material-icons text-[14px] opacity-60">cloud_off</span>
        <span>No live data</span>
      </span>
    );
  }

  const elapsed = Math.max(0, now - lastUpdate);
  const stale = elapsed > 30_000;

  return (
    <span
      className={`flex items-center gap-1.5 ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-content-muted'}`}
      title={new Date(lastUpdate).toLocaleString()}
      aria-label={`Last sync ${formatRelative(elapsed)}`}
    >
      <span className="material-icons text-[14px]">{stale ? 'sync_problem' : 'sync'}</span>
      <span>Synced {formatRelative(elapsed)}</span>
    </span>
  );
}

export default function Footer() {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  return (
    <footer className="grid grid-cols-3 items-center gap-4 border-t border-border bg-surface-elevated px-6 py-2.5 text-[12px]">
      <div className="flex items-center gap-2 text-content-muted">
        <span>
          Part of{' '}
          <a
            href="https://github.com/umair-as/rpi5-iot-gateway"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-content-secondary hover:text-accent"
          >
            RPi5 IoT Gateway OS
          </a>
        </span>
      </div>

      <div className="flex justify-center">
        <SyncIndicator />
      </div>

      <div className="flex items-center justify-end gap-3 text-content-muted">
        <span
          className="rounded-full bg-content/5 px-2 py-0.5 font-mono text-[11px] tabular-nums text-content-secondary"
          aria-label={`Version ${version}`}
        >
          v{version}
        </span>
        <a
          href="https://github.com/umair-as/otbr-webui"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-accent"
          aria-label="View source on GitHub"
        >
          <GithubIcon />
          <span>Source</span>
        </a>
      </div>
    </footer>
  );
}
