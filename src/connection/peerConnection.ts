/**
 * WebRTC PeerConnection with Dual DataChannels (Realtime Unordered + Reliable Ordered)
 */

import {
  deserializeMessage,
  serializeMessage,
  PROTOCOL_VERSION,
  type ProtocolMessage,
  type RealtimeInputMessage,
  type ActionMessage,
  type GameContextMessage,
  type ClientRole,
} from '../protocol';
import type { ConnectionState, ConnectionMetrics } from './connectionState';
import type { SignalingClient } from './signalingClient';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export interface PeerConnectionCallbacks {
  onStateChange?: (state: ConnectionState) => void;
  onRealtimeInput?: (input: RealtimeInputMessage) => void;
  onAction?: (action: ActionMessage) => void;
  onContextChange?: (ctx: GameContextMessage) => void;
  onMetrics?: (metrics: ConnectionMetrics) => void;
  onError?: (err: Error) => void;
}

export class PeerConnectionManager {
  private role: ClientRole;
  private signaling: SignalingClient;
  private callbacks: PeerConnectionCallbacks;

  private pc: RTCPeerConnection | null = null;
  private realtimeChannel: RTCDataChannel | null = null;
  private reliableChannel: RTCDataChannel | null = null;

  private state: ConnectionState = 'idle';
  private rttMs = 0;
  private packetRateHz = 0;
  private packetsReceivedInWindow = 0;
  private packetsSent = 0;
  private totalPacketsReceived = 0;
  private lastAction?: string;

  private heartbeatInterval: number | null = null;
  private rateInterval: number | null = null;
  private lastActivityTimestamp = 0;
  private isDisposed = false;

  constructor(role: ClientRole, signaling: SignalingClient, callbacks: PeerConnectionCallbacks = {}) {
    this.role = role;
    this.signaling = signaling;
    this.callbacks = callbacks;
  }

  public async start(): Promise<void> {
    if (this.isDisposed) return;
    this.setState('signaling');

    try {
      await this.signaling.connect();
    } catch (err) {
      this.setState('failed');
      throw err;
    }

    this.signaling.onMessage((msg) => this.handleSignalingMessage(msg));
    this.signaling.onDisconnect(() => {
      if (this.state !== 'connected') {
        this.setState('disconnected');
      }
    });

    this.initPeerConnection();

    if (this.role === 'desktop') {
      this.setState('waiting');
    }
  }

  private initPeerConnection(): void {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendSignal({ candidate: event.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const pcs = this.pc?.connectionState;
      if (pcs === 'connected') {
        this.setState('connected');
      } else if (pcs === 'disconnected') {
        this.setState('reconnecting');
      } else if (pcs === 'failed') {
        this.setState('failed');
      } else if (pcs === 'closed') {
        this.setState('disconnected');
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const ics = this.pc?.iceConnectionState;
      if (ics === 'disconnected') {
        if (this.state === 'connected') {
          this.setState('reconnecting');
        }
      } else if (ics === 'failed') {
        this.setState('failed');
      }
    };

    if (this.role === 'desktop') {
      this.setupRealtimeChannel(
        this.pc.createDataChannel('realtime', {
          ordered: false,
          maxRetransmits: 0,
        })
      );

      this.setupReliableChannel(
        this.pc.createDataChannel('reliable', {
          ordered: true,
        })
      );
    } else {
      this.pc.ondatachannel = (event) => {
        const ch = event.channel;
        if (ch.label === 'realtime') {
          this.setupRealtimeChannel(ch);
        } else if (ch.label === 'reliable') {
          this.setupReliableChannel(ch);
        }
      };
    }
  }

  private setupRealtimeChannel(ch: RTCDataChannel): void {
    this.realtimeChannel = ch;
    ch.binaryType = 'arraybuffer';

    ch.onmessage = (event) => {
      this.packetsReceivedInWindow++;
      this.totalPacketsReceived++;
      this.lastActivityTimestamp = Date.now();

      const msg = deserializeMessage(event.data);
      if (msg && msg.type === 'realtime_input') {
        this.callbacks.onRealtimeInput?.(msg);
      }
    };

    ch.onopen = () => {
      this.checkChannelsOpen();
    };

    ch.onclose = () => {
      if (this.state === 'connected') {
        this.setState('reconnecting');
      }
    };
  }

  private setupReliableChannel(ch: RTCDataChannel): void {
    this.reliableChannel = ch;

    ch.onmessage = (event) => {
      this.lastActivityTimestamp = Date.now();
      const msg = deserializeMessage(event.data);
      if (!msg) return;

      switch (msg.type) {
        case 'ping':
          this.sendReliable({
            type: 'pong',
            pingTimestamp: msg.timestamp,
            timestamp: Date.now(),
          });
          break;

        case 'pong':
          this.rttMs = Math.max(0, Date.now() - msg.pingTimestamp);
          this.emitMetrics();
          break;

        case 'action':
          this.lastAction = `${msg.action} (${msg.state})`;
          this.callbacks.onAction?.(msg);
          this.emitMetrics();
          break;

        case 'context_change':
          this.callbacks.onContextChange?.(msg);
          break;

        case 'handshake':
          this.sendReliable({
            type: 'handshake_ack',
            version: PROTOCOL_VERSION,
            accepted: msg.version === PROTOCOL_VERSION,
            serverTime: Date.now(),
            sessionContext: 'space-flight',
          });
          break;

        case 'disconnect':
          this.setState('disconnected');
          break;
      }
    };

    ch.onopen = () => {
      this.checkChannelsOpen();
    };

    ch.onclose = () => {
      if (this.state === 'connected') {
        this.setState('reconnecting');
      }
    };
  }

  private checkChannelsOpen(): void {
    if (
      this.realtimeChannel?.readyState === 'open' &&
      this.reliableChannel?.readyState === 'open'
    ) {
      this.setState('connected');
      this.startHeartbeat();
      this.startMetricsTimer();

      this.sendReliable({
        type: 'handshake',
        version: PROTOCOL_VERSION,
        role: this.role,
        clientId: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
      });
    }
  }

  private async handleSignalingMessage(msg: any): Promise<void> {
    if (!this.pc) return;

    if (msg.type === 'peer_ready') {
      if (this.role === 'desktop') {
        this.setState('connecting');
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.signaling.sendSignal(offer);
      }
    } else if (msg.type === 'signal' && msg.signal) {
      const signal = msg.signal;
      if (signal.type === 'offer') {
        this.setState('connecting');
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signaling.sendSignal(answer);
      } else if (signal.type === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn('[WebRTC] Failed to add ICE candidate', e);
        }
      }
    } else if (msg.type === 'peer_disconnected') {
      this.setState('reconnecting');
    }
  }

  public sendRealtime(msg: RealtimeInputMessage): void {
    if (this.realtimeChannel && this.realtimeChannel.readyState === 'open') {
      this.realtimeChannel.send(serializeMessage(msg));
      this.packetsSent++;
    }
  }

  public sendReliable(msg: ProtocolMessage): void {
    if (this.reliableChannel && this.reliableChannel.readyState === 'open') {
      this.reliableChannel.send(serializeMessage(msg));
      this.packetsSent++;
    }
  }

  public sendContextChange(context: any, layout: any): void {
    this.sendReliable({
      type: 'context_change',
      context,
      layout,
      timestamp: Date.now(),
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastActivityTimestamp = Date.now();

    this.heartbeatInterval = window.setInterval(() => {
      if (this.state !== 'connected') return;

      if (this.role === 'desktop') {
        this.sendReliable({
          type: 'ping',
          timestamp: Date.now(),
        });
      }

      if (Date.now() - this.lastActivityTimestamp > 6000) {
        this.setState('reconnecting');
      }
    }, 1500);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startMetricsTimer(): void {
    this.stopMetricsTimer();
    this.rateInterval = window.setInterval(() => {
      this.packetRateHz = this.packetsReceivedInWindow;
      this.packetsReceivedInWindow = 0;
      this.emitMetrics();
    }, 1000);
  }

  private stopMetricsTimer(): void {
    if (this.rateInterval !== null) {
      clearInterval(this.rateInterval);
      this.rateInterval = null;
    }
  }

  private emitMetrics(): void {
    this.callbacks.onMetrics?.({
      state: this.state,
      rttMs: this.rttMs,
      realtimePacketRateHz: this.packetRateHz,
      packetsReceived: this.totalPacketsReceived,
      packetsSent: this.packetsSent,
      lastAction: this.lastAction,
    });
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
    this.emitMetrics();
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public get isDisposedState(): boolean {
    return this.isDisposed;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.stopHeartbeat();
    this.stopMetricsTimer();

    if (this.realtimeChannel) {
      this.realtimeChannel.close();
      this.realtimeChannel = null;
    }
    if (this.reliableChannel) {
      this.reliableChannel.close();
      this.reliableChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.signaling.disconnect();
    this.setState('disconnected');
  }
}
