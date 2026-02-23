import { useTheme } from '../context/ThemeContext';
import { useWebSocket } from '../context/WebSocketContext';
import type { ConnectionStatus } from '../types/websocket';

interface HeaderProps {
  onMenuToggle: () => void;
}

const themeIcons: Record<string, { icon: string; next: 'dark' | 'system' | 'light'; label: string }> = {
  light: { icon: 'light_mode', next: 'dark', label: 'Switch to dark mode' },
  dark: { icon: 'dark_mode', next: 'system', label: 'Switch to system mode' },
  system: { icon: 'contrast', next: 'light', label: 'Switch to light mode' },
};

const statusBadge: Record<ConnectionStatus, { text: string; dotClass: string; pillClass: string }> = {
  connected: {
    text: 'Connected',
    dotClass: 'bg-emerald-500',
    pillClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  connecting: {
    text: 'Connecting',
    dotClass: 'bg-amber-500 animate-pulse',
    pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  disconnected: {
    text: 'Offline',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
    pillClass: 'bg-slate-500/10 text-slate-500',
  },
};

function ThreadIcon() {
  return (
    <svg className="h-7 w-7 text-accent" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="24" cy="8" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="16" cy="22" r="3.5" fill="currentColor" />
      <circle cx="8" cy="24" r="2.5" fill="currentColor" opacity="0.5" />
      <circle cx="26" cy="20" r="2.5" fill="currentColor" opacity="0.5" />
      <line x1="8" y1="8" x2="24" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="8" y1="8" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="24" y1="8" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="8" y1="24" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="26" y1="20" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { status } = useWebSocket();
  const { icon, next, label } = themeIcons[theme];
  const badge = statusBadge[status];

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-content-secondary hover:bg-page md:hidden"
          aria-label="Toggle menu"
        >
          <span className="material-icons text-[24px]">menu</span>
        </button>
        <ThreadIcon />
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-content">Thread Border Router</h1>
          <span className="text-content-muted">·</span>
          <span className="text-sm text-content-secondary">IoT Gateway</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTheme(next)}
          className="rounded-lg p-2 text-content-secondary hover:bg-page"
          aria-label={label}
          title={`Theme: ${theme}`}
        >
          <span className="material-icons text-[22px]">{icon}</span>
        </button>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${badge.pillClass}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${badge.dotClass}`} />
          {badge.text}
        </span>
      </div>
    </header>
  );
}
