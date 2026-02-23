import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../api/client';
import type { DeviceItem } from '../types/device';

interface JsonApiItem {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
}

export interface UseDevicesResult {
  devices: DeviceItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Unwrap JSON:API envelope `{ data: [...] }` or return as-is. */
function extractDevices(raw: unknown): DeviceItem[] {
  let items: unknown[];

  if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    items = (raw as { data: unknown[] }).data;
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    return [];
  }

  const devices: DeviceItem[] = items.map((item) => {
    // JSON:API item: { type, id, attributes: { ... } }
    if (item && typeof item === 'object' && 'attributes' in item) {
      const { type, id, attributes } = item as JsonApiItem;
      return { ...(attributes as object), type, id } as unknown as DeviceItem;
    }
    // Plain item — already flat
    return item as DeviceItem;
  });

  // Deduplicate by extAddress, keeping newest by created
  const byAddress = new Map<string, DeviceItem>();
  for (const d of devices) {
    const existing = byAddress.get(d.extAddress);
    if (!existing || d.created > existing.created) {
      byAddress.set(d.extAddress, d);
    }
  }

  return Array.from(byAddress.values());
}

export function useDevices(): UseDevicesResult {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<unknown>('/api/devices')
      .then((raw) => setDevices(extractDevices(raw)))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { devices, loading, error, refresh };
}
