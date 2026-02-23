export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
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
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
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
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function putJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
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
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
}
