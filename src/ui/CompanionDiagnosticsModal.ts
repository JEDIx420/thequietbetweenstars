import { getSignalingUrl, setCustomSignalingUrl } from '../connection/config';
import type { ConnectionMetrics, ConnectionState } from '../connection/connectionState';
import type { PeerConnectionManager } from '../connection/peerConnection';
import type { SignalingClient } from '../connection/signalingClient';

export interface CompanionDiagnosticsProps {
  signalingClient: SignalingClient | null;
  peerManager: PeerConnectionManager | null;
  metrics?: ConnectionMetrics;
  onReconnect?: (newUrl: string | null) => void;
  onClose: () => void;
}

export class CompanionDiagnosticsModal {
  private container: HTMLElement;
  private props: CompanionDiagnosticsProps;
  private pollTimer: number | null = null;
  private healthStatus: 'CHECKING...' | 'ONLINE (200 OK)' | 'UNREACHABLE' | 'UNCONFIGURED' = 'CHECKING...';

  constructor(props: CompanionDiagnosticsProps) {
    this.props = props;
    this.container = document.createElement('div');
    this.container.id = 'companion-diagnostics-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(3, 4, 8, 0.88);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ui-monospace, monospace;
      color: #e2e8f0;
      pointer-events: auto;
    `;

    document.body.appendChild(this.container);
    this.checkHealth();
    this.render();

    this.pollTimer = window.setInterval(() => {
      this.render();
    }, 1000);
  }

  private async checkHealth(): Promise<void> {
    const url = getSignalingUrl();
    if (!url) {
      this.healthStatus = 'UNCONFIGURED';
      this.render();
      return;
    }

    try {
      const httpUrl = url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://').replace(/\/ws(\?.*)?$/i, '/health');
      const res = await fetch(httpUrl, { method: 'GET', mode: 'cors' });
      if (res.ok) {
        this.healthStatus = 'ONLINE (200 OK)';
      } else {
        this.healthStatus = 'UNREACHABLE';
      }
    } catch {
      this.healthStatus = 'UNREACHABLE';
    }
    this.render();
  }

  public render(): void {
    const signalingUrl = getSignalingUrl() || 'UNCONFIGURED';
    const signalingSocketState = this.props.signalingClient ? (this.props.signalingClient as any).ws?.readyState : -1;
    const socketLabel = signalingSocketState === 1 ? 'OPEN' : signalingSocketState === 0 ? 'CONNECTING' : 'CLOSED';
    const socketColor = signalingSocketState === 1 ? '#4ade80' : signalingSocketState === 0 ? '#facc15' : '#f87171';

    const metrics = this.props.metrics || {
      state: 'idle' as ConnectionState,
      rttMs: 0,
      realtimePacketRateHz: 0,
      packetsReceived: 0,
      packetsSent: 0,
    };

    const peer = this.props.peerManager as any;
    const pc = peer?.pc as RTCPeerConnection | null;
    const iceState = pc ? pc.iceConnectionState : 'new';
    const signalingState = pc ? pc.signalingState : 'stable';
    const realtimeOpen = peer?.realtimeChannel?.readyState === 'open';
    const reliableOpen = peer?.reliableChannel?.readyState === 'open';

    this.container.innerHTML = `
      <div style="
        background: #0d121f;
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 14px;
        width: 100%;
        max-width: 620px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.65);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <header style="
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.85);
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div>
            <div style="font-size: 11px; letter-spacing: 0.2em; color: #38bdf8; text-transform: uppercase;">DIAGNOSTICS & TELEMETRY</div>
            <h2 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 500; color: #f8fafc;">WebRTC Companion Pipeline</h2>
          </div>
          <button id="btn-close-diag" style="
            background: transparent;
            border: 1px solid rgba(255,255,255,0.2);
            color: #94a3b8;
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 14px;
            cursor: pointer;
          ">✕</button>
        </header>

        <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px; font-size: 13px;">
          <!-- Diagnostics Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: rgba(0,0,0,0.3); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Signaling Endpoint</span>
              <code style="color: ${signalingUrl === 'UNCONFIGURED' ? '#f87171' : '#38bdf8'}; font-size: 11px; word-break: break-all;">${signalingUrl}</code>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Health Status</span>
              <b style="color: ${this.healthStatus.includes('ONLINE') ? '#4ade80' : this.healthStatus.includes('CHECKING') ? '#facc15' : '#f87171'};">${this.healthStatus}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Signaling Socket</span>
              <b style="color: ${socketColor};">${socketLabel}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Signaling State</span>
              <b style="color: #cbd5e1;">${signalingState}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">ICE State</span>
              <b style="color: ${iceState === 'connected' || iceState === 'completed' ? '#4ade80' : iceState === 'failed' ? '#f87171' : '#facc15'};">${iceState.toUpperCase()}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Peer State</span>
              <b style="color: ${metrics.state === 'connected' ? '#4ade80' : metrics.state === 'failed' ? '#f87171' : '#facc15'};">${metrics.state.toUpperCase()}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Realtime Channel</span>
              <b style="color: ${realtimeOpen ? '#4ade80' : '#94a3b8'};">${realtimeOpen ? 'OPEN (Unordered 60Hz)' : 'CLOSED'}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Reliable Channel</span>
              <b style="color: ${reliableOpen ? '#4ade80' : '#94a3b8'};">${reliableOpen ? 'OPEN (Ordered Actions)' : 'CLOSED'}</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">RTT Round-Trip Latency</span>
              <b style="color: ${metrics.rttMs > 0 && metrics.rttMs < 60 ? '#4ade80' : '#facc15'};">${metrics.rttMs} ms</b>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; text-transform: uppercase; display: block;">Packets Received</span>
              <b style="color: #cbd5e1;">${metrics.packetsReceived} (${metrics.realtimePacketRateHz} Hz)</b>
            </div>
          </div>

          <!-- Quick Manual URL / Test Section -->
          <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
            <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Test Custom Signaling URL (Overrides production configuration in this browser):</label>
            <div style="display: flex; gap: 8px;">
              <input id="input-custom-signaling" type="text" placeholder="wss://my-worker.workers.dev/ws or ws://localhost:8787/ws" value="${signalingUrl === 'UNCONFIGURED' ? '' : signalingUrl}" style="
                flex: 1;
                background: #070a13;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                color: #f8fafc;
                padding: 8px 12px;
                font-size: 12px;
                font-family: monospace;
              "/>
              <button id="btn-save-signaling" style="
                background: #0284c7;
                border: none;
                color: #fff;
                border-radius: 6px;
                padding: 8px 14px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
              ">Save & Reconnect</button>
              <button id="btn-reset-signaling" style="
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                color: #cbd5e1;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 12px;
                cursor: pointer;
              ">Reset</button>
            </div>
          </div>

          <!-- Owner Deployment Guidance -->
          ${signalingUrl === 'UNCONFIGURED' ? `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: 8px; font-size: 12px; line-height: 1.5; color: #fca5a5;">
              <b style="color: #fecaca; display: block; margin-bottom: 4px;">REQUIRED OWNER ACTION FOR LIVE GITHUB PAGES:</b>
              The signaling worker has not yet been deployed to Cloudflare. To enable phone companion on live GitHub Pages:
              <ol style="margin: 6px 0 0 16px; padding: 0;">
                <li>Run <code>cd signaling && npx wrangler login</code></li>
                <li>Run <code>npx wrangler deploy</code></li>
                <li>Copy the deployed worker URL (e.g. <code>https://&lt;name&gt;.workers.dev</code>)</li>
                <li>Add to GitHub Repo: <b>Settings → Secrets and variables → Actions → Variables</b> named <code>VITE_SIGNALING_URL</code> with value <code>wss://&lt;name&gt;.workers.dev/ws</code></li>
              </ol>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    this.container.querySelector('#btn-close-diag')?.addEventListener('click', () => this.dispose());

    this.container.querySelector('#btn-save-signaling')?.addEventListener('click', () => {
      const input = this.container.querySelector('#input-custom-signaling') as HTMLInputElement;
      if (input && input.value.trim().length > 0) {
        setCustomSignalingUrl(input.value.trim());
        this.checkHealth();
        if (this.props.onReconnect) {
          this.props.onReconnect(input.value.trim());
        }
      }
    });

    this.container.querySelector('#btn-reset-signaling')?.addEventListener('click', () => {
      setCustomSignalingUrl(null);
      this.checkHealth();
      if (this.props.onReconnect) {
        this.props.onReconnect(null);
      }
    });
  }

  public dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.props.onClose();
  }
}
