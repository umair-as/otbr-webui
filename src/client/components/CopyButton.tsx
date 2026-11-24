import { useState, useCallback, useEffect, useRef } from 'react';

interface CopyButtonProps {
  value: string;
  /** What is being copied, for screen readers (e.g. "Network Key"). Defaults to the value. */
  label?: string;
}

/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS or localhost).
 * The gateway serves the UI over plain HTTP on its LAN address, so fall back
 * to a hidden textarea and `document.execCommand('copy')`.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function CopyButton({ value, label }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(async () => {
    const ok = await copyText(value);
    setState(ok ? 'copied' : 'failed');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  }, [value]);

  const what = label ?? value;
  const ariaLabel =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : `Copy ${what}`;
  const title =
    state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : 'Copy to clipboard';
  const icon = state === 'copied' ? 'check' : state === 'failed' ? 'error_outline' : 'content_copy';

  return (
    <button
      type="button"
      onClick={copy}
      className="ml-2 inline-flex shrink-0 items-center rounded p-0.5 text-content-muted hover:text-accent transition-colors"
      aria-label={ariaLabel}
      title={title}
    >
      <span className="material-icons text-[16px]" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
