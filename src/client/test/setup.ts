import '@testing-library/jest-dom/vitest';

// Guard: only set up browser mocks when running in jsdom (not node environment)
if (typeof window !== 'undefined') {
  // jsdom doesn't implement matchMedia — provide a stub
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Minimal WebSocket mock that stays in CONNECTING state — existing tests
  // pass unchanged because the WS never opens/closes, so status stays "connecting"
  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState = MockWebSocket.CLOSED;
    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    url: string;
    protocol = '';
    bufferedAmount = 0;
    extensions = '';
    binaryType: BinaryType = 'blob';

    constructor(url: string | URL) {
      this.url = typeof url === 'string' ? url : url.href;
    }

    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false; }
  }

  Object.defineProperty(globalThis, 'WebSocket', {
    writable: true,
    value: MockWebSocket,
  });
}
