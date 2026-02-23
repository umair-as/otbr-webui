export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Server -> Client messages */

export interface StateMessage {
  type: 'state';
  data: Record<string, unknown>;
}

export interface DevicesMessage {
  type: 'devices';
  data: Array<Record<string, unknown>>;
}

export interface PropertiesMessage {
  type: 'properties';
  data: Record<string, string>;
}

export interface EventMessage {
  type: 'event';
  event: string;
  data: Record<string, unknown>;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | StateMessage
  | DevicesMessage
  | PropertiesMessage
  | EventMessage
  | ErrorMessage;

/** Client -> Server messages */

export interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
}

export interface RefreshMessage {
  type: 'refresh';
  topic?: string;
}

export type ClientMessage = SubscribeMessage | RefreshMessage;
