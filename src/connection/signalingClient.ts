/**
 * Lightweight Ephemeral Signaling Client for WebRTC peer introduction
 */

export interface SignalingMessage {
  type: 'register' | 'registered' | 'peer_ready' | 'signal' | 'peer_disconnected' | 'error' | 'ping' | 'pong';
  sessionId: string;
  role?: 'desktop' | 'companion';
  token?: string;
  signal?: RTCSessionDescriptionInit | RTCIceCandidateInit | { candidate: RTCIceCandidateInit | null };
  message?: string;
}

export type SignalingEventHandler = (msg: SignalingMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private token: string;
  private role: 'desktop' | 'companion';
  private listeners: Set<SignalingEventHandler> = new Set();
  private disconnectListeners: Set<() => void> = new Set();
  private isIntentionalClose = false;

  constructor(url: string, sessionId: string, token: string, role: 'desktop' | 'companion') {
    this.url = url;
    this.sessionId = sessionId;
    this.token = token;
    this.role = role;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.url) {
          reject(new Error('Signaling server URL is not configured.'));
          return;
        }

        // Convert http/https to ws/wss if needed
        let wsUrl = this.url;
        if (wsUrl.startsWith('http://')) {
          wsUrl = 'ws://' + wsUrl.slice(7);
        } else if (wsUrl.startsWith('https://')) {
          wsUrl = 'wss://' + wsUrl.slice(8);
        }

        // Append query parameters
        const urlObj = new URL(wsUrl, window.location.href);
        urlObj.searchParams.set('session', this.sessionId);
        urlObj.searchParams.set('token', this.token);
        urlObj.searchParams.set('role', this.role);

        this.ws = new WebSocket(urlObj.toString());

        const timeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('Signaling server connection timed out.'));
          }
        }, 8000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          // Register presence
          this.send({
            type: 'register',
            sessionId: this.sessionId,
            role: this.role,
            token: this.token,
          });
          resolve();
        };

        this.ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data) as SignalingMessage;
            this.notifyListeners(data);
          } catch (e) {
            console.warn('[Signaling] Failed to parse message', e);
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to connect to signaling server.'));
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          if (!this.isIntentionalClose) {
            for (const handler of this.disconnectListeners) {
              handler();
            }
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public send(msg: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public sendSignal(signal: RTCSessionDescriptionInit | RTCIceCandidateInit | { candidate: RTCIceCandidateInit | null }): void {
    this.send({
      type: 'signal',
      sessionId: this.sessionId,
      role: this.role,
      signal,
    });
  }

  public onMessage(handler: SignalingEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  public onDisconnect(handler: () => void): () => void {
    this.disconnectListeners.add(handler);
    return () => this.disconnectListeners.delete(handler);
  }

  private notifyListeners(msg: SignalingMessage): void {
    for (const handler of this.listeners) {
      handler(msg);
    }
  }

  public disconnect(): void {
    this.isIntentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
    this.disconnectListeners.clear();
  }

  public get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
