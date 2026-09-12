import { SignalingClient } from '../connection/signalingClient';
import { PeerConnectionManager } from '../connection/peerConnection';
import { TouchControls } from './touchControls';
import { getPairingParams, type PairingUrlParams } from './deviceDetection';

export class CompanionApp {
  private container: HTMLElement;
  private params: PairingUrlParams;
  private signaling: SignalingClient | null = null;
  private peer: PeerConnectionManager | null = null;
  private touchControls: TouchControls | null = null;
  private inputSeq = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.params = getPairingParams();
  }

  public start(): void {
    if (this.params.session && this.params.token) {
      this.initPairingFlow(this.params.session, this.params.token, this.params.signaling);
    } else {
      this.renderManualEntry();
    }
    this.setupOrientationWatcher();
  }

  private renderManualEntry(): void {
    this.container.innerHTML = `
      <div style="
        min-height: 100vh;
        width: 100%;
        background: radial-gradient(circle at 50% 30%, #0d1527 0%, #030307 100%);
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        text-align: center;
      ">
        <div style="
          font-size: 11px;
          letter-spacing: 0.25em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 8px;
        ">THE QUIET BETWEEN STARS</div>

        <h1 style="
          font-size: 24px;
          font-weight: 300;
          letter-spacing: 0.08em;
          margin: 0 0 16px 0;
          color: #f1f5f9;
        ">Companion Terminal</h1>

        <p style="
          font-size: 14px;
          color: #94a3b8;
          max-width: 320px;
          line-height: 1.6;
          margin-bottom: 28px;
        ">
          "This universe is meant for a larger window."
        </p>

        <div style="
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 16px;
          padding: 20px;
          max-width: 320px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        ">
          <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 12px; text-align: left;">
            Enter 6-character Ship Session Code:
          </div>
          <input id="manual-session-code" type="text" maxlength="8" placeholder="e.g. 7K9M4X" style="
            width: 100%;
            padding: 12px;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 18px;
            letter-spacing: 0.15em;
            text-align: center;
            text-transform: uppercase;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 8px;
            color: #38bdf8;
            box-sizing: border-box;
            outline: none;
            margin-bottom: 16px;
          " />
          <button id="btn-connect-manual" style="
            width: 100%;
            padding: 12px;
            background: #0284c7;
            border: none;
            border-radius: 8px;
            color: #ffffff;
            font-weight: 600;
            font-size: 14px;
            letter-spacing: 0.05em;
            cursor: pointer;
          ">PAIR COMPANION</button>
        </div>
      </div>
    `;

    const btn = this.container.querySelector('#btn-connect-manual') as HTMLButtonElement;
    const input = this.container.querySelector('#manual-session-code') as HTMLInputElement;

    btn.addEventListener('click', () => {
      const code = input.value.trim().toUpperCase();
      if (code.length >= 4) {
        this.initPairingFlow(code, 'manual-token');
      }
    });
  }

  private initPairingFlow(sessionId: string, token: string, signalingOverride?: string): void {
    const signalingUrl =
      signalingOverride ||
      import.meta.env.VITE_SIGNALING_URL ||
      (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws';

    this.renderConnecting(sessionId);

    this.signaling = new SignalingClient(signalingUrl, sessionId, token, 'companion');
    this.peer = new PeerConnectionManager('companion', this.signaling, {
      onStateChange: (state) => {
        if (state === 'connected') {
          this.renderConnectedHUD();
        } else if (state === 'reconnecting') {
          this.renderSignalLost(sessionId);
        } else if (state === 'failed') {
          this.renderConnectionFailed(sessionId);
        }
      },
      onMetrics: (metrics) => {
        this.touchControls?.updateStatus(metrics.state, metrics.rttMs);
      },
    });

    this.peer.start().catch((err) => {
      console.warn('[Companion] Connection error:', err);
      this.renderConnectionFailed(sessionId);
    });
  }

  private renderConnecting(sessionId: string): void {
    this.container.innerHTML = `
      <div style="
        min-height: 100vh;
        width: 100%;
        background: #030307;
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, sans-serif;
        text-align: center;
      ">
        <div style="
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 3px solid rgba(56, 189, 248, 0.2);
          border-top-color: #38bdf8;
          animation: spin 1s linear infinite;
          margin-bottom: 24px;
        "></div>
        <div style="font-size: 11px; letter-spacing: 0.2em; color: #38bdf8; margin-bottom: 8px;">THE QUIET BETWEEN STARS</div>
        <h2 style="font-size: 20px; font-weight: 300; margin: 0 0 8px 0;">Finding your ship...</h2>
        <div style="font-family: ui-monospace, monospace; font-size: 13px; color: #94a3b8;">Session: ${sessionId}</div>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    `;
  }

  private renderSignalLost(sessionId: string): void {
    this.container.innerHTML = `
      <div style="
        min-height: 100vh;
        width: 100%;
        background: #030307;
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, sans-serif;
        text-align: center;
      ">
        <div style="color: #f87171; font-size: 32px; margin-bottom: 12px;">⚠</div>
        <h2 style="font-size: 20px; font-weight: 400; margin: 0 0 8px 0; color: #f87171;">SIGNAL LOST</h2>
        <p style="font-size: 13px; color: #94a3b8; max-width: 280px; margin-bottom: 16px;">
          Finding ship in session <strong>${sessionId}</strong>... Attempting reconnection.
        </p>
        <button id="btn-reconnect" style="
          padding: 10px 20px;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 13px;
          cursor: pointer;
        ">RETURN TO TITLE</button>
      </div>
    `;

    this.container.querySelector('#btn-reconnect')?.addEventListener('click', () => {
      window.location.search = '';
    });
  }

  private renderConnectionFailed(sessionId: string): void {
    this.container.innerHTML = `
      <div style="
        min-height: 100vh;
        width: 100%;
        background: #030307;
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, sans-serif;
        text-align: center;
      ">
        <h2 style="font-size: 20px; font-weight: 400; margin: 0 0 12px 0; color: #facc15;">Signaling Unavailable</h2>
        <p style="font-size: 13px; color: #94a3b8; max-width: 320px; line-height: 1.6; margin-bottom: 24px;">
          Could not establish connection to session <strong>${sessionId}</strong>. Ensure your signaling service is running or check your network.
        </p>
        <button id="btn-retry" style="
          padding: 12px 24px;
          background: #0284c7;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 14px;
          cursor: pointer;
        ">TRY AGAIN</button>
      </div>
    `;

    this.container.querySelector('#btn-retry')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  private renderConnectedHUD(): void {
    this.container.innerHTML = `
      <div id="touch-controls-root" style="
        position: fixed;
        inset: 0;
        background: #030307;
        overflow: hidden;
        touch-action: none;
      "></div>
      <div id="orientation-warning" style="
        display: none;
        position: fixed;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 11px;
        color: #93c5fd;
        pointer-events: none;
        z-index: 1000;
        white-space: nowrap;
      ">↺ Rotate to landscape for optimal flight controls</div>
    `;

    const root = this.container.querySelector('#touch-controls-root') as HTMLElement;
    this.touchControls = new TouchControls(root, {
      onInput: (input) => {
        this.inputSeq++;
        this.peer?.sendRealtime({
          type: 'realtime_input',
          seq: this.inputSeq,
          timestamp: Date.now(),
          axes: input.axes,
          look: input.look,
          throttle: input.throttle,
        });
      },
      onAction: (action, state) => {
        this.inputSeq++;
        this.peer?.sendReliable({
          type: 'action',
          seq: this.inputSeq,
          action,
          state,
          timestamp: Date.now(),
        });
      },
    });

    this.checkOrientation();
  }

  private setupOrientationWatcher(): void {
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());
  }

  private checkOrientation(): void {
    const warning = this.container.querySelector('#orientation-warning') as HTMLElement;
    if (!warning) return;
    const isPortrait = window.innerHeight > window.innerWidth;
    warning.style.display = isPortrait ? 'block' : 'none';
  }

  public dispose(): void {
    this.touchControls?.dispose();
    this.peer?.dispose();
  }
}
