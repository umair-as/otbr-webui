import { useState, useCallback } from 'react';

interface CopyButtonProps {
  value: string;
}

export default function CopyButton({ value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className="ml-2 inline-flex shrink-0 items-center rounded p-0.5 text-content-muted hover:text-accent transition-colors"
      aria-label={copied ? 'Copied' : `Copy ${value}`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      <span className="material-icons text-[16px]">
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  );
}
