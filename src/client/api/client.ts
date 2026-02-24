export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Try to extract a human-readable error from the response body. */
async function extractErrorMessage(res: Response): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.errors?.[0]?.title === 'string') return body.errors[0].title;
    if (typeof body?.message === 'string') return body.message;
  } catch { /* not JSON, use fallback */ }
  return fallback;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }
  return res.json();
}

/** Like fetchJson but returns null on 204 (no content). */
export async function fetchJsonOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(path, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }
  return res.json();
}

export async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }
  return res.json();
}

/**
 * Post a JSON:API action to /api/actions.
 * Wraps body in the required `{ data: [...] }` array format and
 * unwraps the first item from the response array.
 */
export async function postAction<T = unknown>(
  type: string,
  attributes: Record<string, unknown>,
): Promise<T> {
  const body = { data: [{ type, attributes }] };
  const resp = await postJson<{ data?: unknown[] }>('/api/actions', body);
  // Unwrap: response is { data: [{id, type, attributes}], meta }
  const first = resp.data?.[0];
  return (first ?? resp) as T;
}

export async function putJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }
}

export async function deleteJson(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'DELETE',
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }
}
