/**
 * Helpers for otbr-agent's JSON:API task queue (`/api/actions`).
 *
 * Task status values, from upstream ot-br-posix src/rest/actions/action.cpp:
 * pending -> active -> completed | stopped | failed.
 */

export type ActionStatus = 'pending' | 'active' | 'completed' | 'stopped' | 'failed';

const FINISHED: ReadonlySet<string> = new Set(['completed', 'stopped', 'failed']);

/** True once a task can no longer change: completed, stopped or failed. */
export function isActionFinished(status: string): boolean {
  return FINISHED.has(status);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Unwrap `{ data: [item] }`, `{ data: item }` or a bare item. */
function unwrapItem(resp: unknown): Record<string, unknown> | null {
  const r = asRecord(resp);
  if (!r) return null;
  if (Array.isArray(r.data)) return asRecord(r.data[0]);
  if (asRecord(r.data)) return asRecord(r.data);
  return r;
}

/** Task id from a POST or GET `/api/actions` response. */
export function extractActionId(resp: unknown): string {
  const item = unwrapItem(resp);
  return item?.id ? String(item.id) : '';
}

/** Task status from a POST or GET `/api/actions` response ('unknown' if absent). */
export function extractStatus(resp: unknown): string {
  const item = unwrapItem(resp);
  const attrs = asRecord(item?.attributes);
  const status = attrs?.status ?? item?.status;
  return typeof status === 'string' ? status : 'unknown';
}

/** Id of the diagnostics resource linked from a finished task (`relationships.result`). */
export function extractDiagnosticsId(resp: unknown): string {
  const item = unwrapItem(resp);
  const rel = asRecord(asRecord(item?.relationships)?.result);
  const data = asRecord(rel?.data);
  return data?.id ? String(data.id) : '';
}
