import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketProvider, useWebSocket } from './WebSocketContext';

// Enhanced MockWebSocket with simulation helpers
class TestMockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = TestMockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  url: string;
  protocol = '';
  bufferedAmount = 0;
  extensions = '';
  binaryType: BinaryType = 'blob';
  sentMessages: string[] = [];

  static instances: TestMockWebSocket[] = [];

  constructor(url: string | URL) {
    this.url = typeof url === 'string' ? url : url.href;
    TestMockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = TestMockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }

  // Test helpers
  simulateOpen() {
    this.readyState = TestMockWebSocket.OPEN;
    if (this.onopen) this.onopen(new Event('open'));
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateClose() {
    this.readyState = TestMockWebSocket.CLOSED;
    if (this.onclose) this.onclose(new CloseEvent('close'));
  }
}

function StatusDisplay() {
  const { status, lastState, lastDevices, lastProperties } = useWebSocket();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="state">{lastState ? JSON.stringify(lastState) : 'null'}</span>
      <span data-testid="devices">{lastDevices ? JSON.stringify(lastDevices) : 'null'}</span>
      <span data-testid="properties">{lastProperties ? JSON.stringify(lastProperties) : 'null'}</span>
    </div>
  );
}

function SubscriberDisplay() {
  const { subscribe } = useWebSocket();
  const [received, setReceived] = React.useState<string[]>([]);

  React.useEffect(() => {
    return subscribe('state', (msg) => {
      setReceived((prev) => [...prev, JSON.stringify(msg)]);
    });
  }, [subscribe]);

  return <span data-testid="received">{received.join('|')}</span>;
}

import React from 'react';

function SenderDisplay() {
  const { send } = useWebSocket();
  return <button onClick={() => send({ type: 'refresh' })}>Send</button>;
}

describe('WebSocketContext', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalWS: any;

  beforeEach(() => {
    vi.useFakeTimers();
    TestMockWebSocket.instances = [];
    originalWS = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = TestMockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWS;
  });

  it('renders children', () => {
    render(
      <WebSocketProvider>
        <span>hello</span>
      </WebSocketProvider>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('starts with connecting status', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );
    expect(screen.getByTestId('status').textContent).toBe('connecting');
  });

  it('transitions to connected on open', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
    });

    expect(screen.getByTestId('status').textContent).toBe('connected');
  });

  it('transitions to disconnected on close', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
    });
    expect(screen.getByTestId('status').textContent).toBe('connected');

    act(() => {
      TestMockWebSocket.instances[0].simulateClose();
    });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');
  });

  it('updates lastState on state message', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
      TestMockWebSocket.instances[0].simulateMessage({ type: 'state', data: { role: 'leader' } });
    });

    expect(screen.getByTestId('state').textContent).toBe('{"role":"leader"}');
  });

  it('updates lastDevices on devices message', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
      TestMockWebSocket.instances[0].simulateMessage({ type: 'devices', data: [{ ext: 'aa' }] });
    });

    expect(screen.getByTestId('devices').textContent).toBe('[{"ext":"aa"}]');
  });

  it('updates lastProperties on properties message', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
      TestMockWebSocket.instances[0].simulateMessage({ type: 'properties', data: { 'Net:Name': 'T' } });
    });

    expect(screen.getByTestId('properties').textContent).toBe('{"Net:Name":"T"}');
  });

  it('subscribe() callback fires on matching type', () => {
    render(
      <WebSocketProvider>
        <SubscriberDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
      TestMockWebSocket.instances[0].simulateMessage({ type: 'state', data: { role: 'child' } });
    });

    expect(screen.getByTestId('received').textContent).toContain('child');
  });

  it('send() forwards to WebSocket', () => {
    render(
      <WebSocketProvider>
        <SenderDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      screen.getByText('Send').click();
    });

    expect(TestMockWebSocket.instances[0].sentMessages).toEqual([
      JSON.stringify({ type: 'refresh' }),
    ]);
  });

  it('schedules reconnection after close', () => {
    render(
      <WebSocketProvider>
        <StatusDisplay />
      </WebSocketProvider>,
    );

    act(() => {
      TestMockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      TestMockWebSocket.instances[0].simulateClose();
    });
    expect(screen.getByTestId('status').textContent).toBe('disconnected');

    // Advance timer past the reconnection delay
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // A new WebSocket instance should have been created
    expect(TestMockWebSocket.instances.length).toBe(2);
    expect(screen.getByTestId('status').textContent).toBe('connecting');
  });

  it('useWebSocket() throws outside provider', () => {
    function Bare() {
      useWebSocket();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useWebSocket must be used within WebSocketProvider');
  });
});
