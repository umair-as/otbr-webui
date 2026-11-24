import { describe, it, expect } from 'vitest';
import { extractActionId, extractStatus, extractDiagnosticsId, isActionFinished } from './actions';

describe('isActionFinished', () => {
  it('treats only completed, stopped and failed as final', () => {
    expect(isActionFinished('pending')).toBe(false);
    expect(isActionFinished('active')).toBe(false);
    expect(isActionFinished('unknown')).toBe(false);
    expect(isActionFinished('completed')).toBe(true);
    expect(isActionFinished('stopped')).toBe(true);
    expect(isActionFinished('failed')).toBe(true);
  });
});

describe('action response parsing', () => {
  // POST /api/actions response shape from otbr-agent thread-reference-20250612.
  const posted = {
    data: [
      {
        id: '2b6d852c-f4d5-4d79-9eb7-d287fda7737f',
        type: 'updateDeviceCollectionTask',
        attributes: { maxAge: 30, timeout: 29, status: 'pending' },
      },
    ],
    meta: { collection: { offset: 0, limit: 200, total: 1 } },
  };

  it('reads id and status from the envelope, a single item, or a bare item', () => {
    for (const resp of [posted, { data: posted.data[0] }, posted.data[0]]) {
      expect(extractActionId(resp)).toBe('2b6d852c-f4d5-4d79-9eb7-d287fda7737f');
      expect(extractStatus(resp)).toBe('pending');
    }
  });

  it('returns defaults for unexpected input', () => {
    expect(extractActionId(null)).toBe('');
    expect(extractStatus({})).toBe('unknown');
    expect(extractDiagnosticsId('x')).toBe('');
  });

  it('reads the linked diagnostics id', () => {
    const done = {
      data: {
        id: 'a1',
        attributes: { status: 'completed' },
        relationships: { result: { data: { type: 'energyScanReport', id: 'diag-1' } } },
      },
    };
    expect(extractDiagnosticsId(done)).toBe('diag-1');
  });
});
