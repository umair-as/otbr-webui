import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionStatus, ServerMessage, ClientMessage } from '../types/websocket';

type MessageCallback = (msg: ServerMessage) => void;

interface WebSocketContextValue {
  status: ConnectionStatus;
  lastState: Record<string, unknown> | null;
  lastDevices: Array<Record<string, unknown>> | null;
  lastProperties: Record<string, string> | null;
  lastUpdate: number | null;
  send: (msg: ClientMessage) => void;
  subscribe: (type: string, cb: MessageCallback) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

function buildWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const BACKOFF_FACTOR = 2;
const JITTER = 500;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastState, setLastState] = useState<Record<string, unknown> | null>(null);
  const [lastDevices, setLastDevices] = useState<Array<Record<string, unknown>> | null>(null);
  const [lastProperties, setLastProperties] = useState<Record<string, string> | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<MessageCallback>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_DELAY);
  const mountedRef = useRef(true);

  const notify = useCallback((msg: ServerMessage) => {
    const cbs = listenersRef.current.get(msg.type);
    if (cbs) {
      for (const cb of cbs) cb(msg);
    }
  }, []);

  const subscribe = useCallback((type: string, cb: MessageCallback) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(cb);
    return () => {
      listenersRef.current.get(type)?.delete(cb);
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setStatus('connecting');
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus('connected');
      reconnectDelayRef.current = INITIAL_DELAY;
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        switch (msg.type) {
          case 'state':
            setLastState(msg.data);
            setLastUpdate(Date.now());
            break;
          case 'devices':
            setLastDevices(msg.data);
            setLastUpdate(Date.now());
            break;
          case 'properties':
            setLastProperties(msg.data);
            setLastUpdate(Date.now());
            break;
        }
        notify(msg);
      } catch {
        // Invalid JSON — ignore
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const jitter = Math.random() * JITTER * 2 - JITTER;
    const delay = Math.min(reconnectDelayRef.current + jitter, MAX_DELAY);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * BACKOFF_FACTOR, MAX_DELAY);
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider
      value={{ status, lastState, lastDevices, lastProperties, lastUpdate, send, subscribe }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
