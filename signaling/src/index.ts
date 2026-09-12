/**
 * THE QUIET BETWEEN STARS - Ephemeral WebRTC Signaling Service
 * Cloudflare Worker + Durable Objects implementation
 */

export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
}

export class SignalingRoom {
  private state: DurableObjectState;
  private desktopWs: WebSocket | null = null;
  private companionWs: WebSocket | null = null;
  private sessionToken: string | null = null;
  private expiresAt: number = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const sessionId = url.searchParams.get('session') || '';
    const token = url.searchParams.get('token') || '';
    const role = url.searchParams.get('role') || '';

    if (!sessionId || !role) {
      return new Response('Missing session or role', { status: 400 });
    }

    // Set or check ephemeral session token
    if (!this.sessionToken) {
      this.sessionToken = token;
      this.expiresAt = Date.now() + 10 * 60 * 1000; // 10 minute auto-expiration
      // Set storage alarm for cleanup
      this.state.storage.setAlarm(this.expiresAt);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    if (role === 'desktop') {
      if (this.desktopWs) {
        try { this.desktopWs.close(1000, 'Replaced by new desktop connection'); } catch {}
      }
      this.desktopWs = server;
      this.setupSocket(server, 'desktop');

      // If companion was already waiting, notify desktop
      if (this.companionWs) {
        server.send(JSON.stringify({ type: 'peer_ready', sessionId }));
      }
    } else if (role === 'companion') {
      if (this.companionWs) {
        try { this.companionWs.close(1000, 'Replaced by new companion connection'); } catch {}
      }
      this.companionWs = server;
      this.setupSocket(server, 'companion');

      // Notify desktop that companion has joined
      if (this.desktopWs) {
        this.desktopWs.send(JSON.stringify({ type: 'peer_ready', sessionId }));
      }
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private setupSocket(ws: WebSocket, role: 'desktop' | 'companion'): void {
    ws.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const parsed = JSON.parse(data);

        // Forward signal to the opposite peer
        if (role === 'desktop' && this.companionWs) {
          this.companionWs.send(data);
        } else if (role === 'companion' && this.desktopWs) {
          this.desktopWs.send(data);
        }
      } catch (err) {
        console.warn('[SignalingRoom] Failed to parse message', err);
      }
    });

    ws.addEventListener('close', () => {
      if (role === 'desktop') {
        this.desktopWs = null;
        if (this.companionWs) {
          this.companionWs.send(JSON.stringify({ type: 'peer_disconnected' }));
        }
      } else {
        this.companionWs = null;
        if (this.desktopWs) {
          this.desktopWs.send(JSON.stringify({ type: 'peer_disconnected' }));
        }
      }
    });
  }

  async alarm(): Promise<void> {
    // Session expired: close sockets and clear
    if (this.desktopWs) {
      try { this.desktopWs.close(1000, 'Session expired'); } catch {}
    }
    if (this.companionWs) {
      try { this.companionWs.close(1000, 'Session expired'); } catch {}
    }
    await this.state.storage.deleteAll();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'TQBS Ephemeral Signaling', time: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (url.pathname === '/ws') {
      const sessionId = url.searchParams.get('session');
      if (!sessionId) {
        return new Response('Missing session parameter', { status: 400 });
      }

      // Route to Durable Object room for this session
      const id = env.SIGNALING_ROOM.idFromName(sessionId.toUpperCase());
      const room = env.SIGNALING_ROOM.get(id);
      return room.fetch(request);
    }

    return new Response('The Quiet Between Stars - Signaling Service', { status: 200 });
  },
};
