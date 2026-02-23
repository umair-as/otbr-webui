import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../api/client';
import type { NodeInfo } from '../types/node';

export interface UseNodeInfoResult {
  data: NodeInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useNodeInfo(): UseNodeInfoResult {
  const [data, setData] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<NodeInfo>('/api/node')
      .then(setData)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
