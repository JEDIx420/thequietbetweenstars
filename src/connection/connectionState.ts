/**
 * Connection lifecycle states for Desktop and Companion
 */

export type ConnectionState =
  | 'idle'
  | 'creating-session'
  | 'waiting'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface ConnectionMetrics {
  state: ConnectionState;
  rttMs: number;
  realtimePacketRateHz: number;
  packetsReceived: number;
  packetsSent: number;
  lastAction?: string;
}
