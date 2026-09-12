import QRCode from 'qrcode';
import { audio } from '../audio/AudioEngine';
import { storage } from '../persistence/StorageManager';
import { generateSessionCode, generateSecureToken } from '../connection/token';
import { SignalingClient } from '../connection/signalingClient';
import { PeerConnectionManager } from '../connection/peerConnection';
import { InputManager } from '../game/input/InputManager';
import { GameRenderer } from '../game/rendering/renderer';
import { SpaceScene } from '../game/scenes/spaceScene';
import { FlightModel } from '../game/core/flightModel';
import { DebugOverlay } from '../game/ui/debugOverlay';
import type { ConnectionState } from '../connection/connectionState';

export type UIState = 'title' | 'mode_select' | 'pairing' | 'playing';

export class DesktopApp {
  private container: HTMLElement;
  private uiContainer: HTMLElement;
  private canvasContainer: HTMLElement;

  private renderer!: GameRenderer;
  private scene!: SpaceScene;
  private flightModel!: FlightModel;
  private inputManager!: InputManager;
  private debugOverlay!: DebugOverlay;

  private signaling: SignalingClient | null = null;
  private peer: PeerConnectionManager | null = null;
  private sessionCode = '';
  private sessionToken = '';

  private uiState: UIState = 'title';
  private lastTime = performance.now();
  private isRunning = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.canvasContainer = document.createElement('div');
    this.canvasContainer.id = 'canvas-container';
    this.canvasContainer.style.cssText = 'position: fixed; inset: 0; z-index: 1; overflow: hidden;';

    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'ui-container';
    this.uiContainer.style.cssText = 'position: fixed; inset: 0; z-index: 10; pointer-events: none;';

    this.container.appendChild(this.canvasContainer);
    this.container.appendChild(this.uiContainer);

    this.initGameEngine();
    this.renderTitleScreen();
  }

  public getUiState(): UIState {
    return this.uiState;
  }

  private initGameEngine(): void {
    this.renderer = new GameRenderer(this.canvasContainer);
    this.scene = new SpaceScene();
    this.flightModel = new FlightModel(this.scene.shipGroup);
    this.inputManager = new InputManager();
    this.debugOverlay = new DebugOverlay();

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private gameLoop(time: number): void {
    if (!this.isRunning) return;

    const dt = Math.min((time - this.lastTime) * 0.001, 0.1);
    this.lastTime = time;

    const input = this.inputManager.getNormalizedInput();
    this.flightModel.update(input, dt, this.renderer.camera);

    const shipPos = this.flightModel.position;
    const throttle = this.flightModel.getThrottle();
    this.scene.update(dt, shipPos, throttle);
    audio.updateThrottle(throttle);

    if (this.inputManager.consumeAction('scan')) {
      this.scene.triggerScan(shipPos);
      audio.playScanEffect();
      this.showHudNotice('SCAN INITIATED - ACOUSTIC RESONANCE EMITTED');
    }
    if (this.inputManager.consumeAction('map')) {
      audio.playBlip();
      this.showHudNotice('STELLAR CARTOGRAPHY - SECTOR UNCHARTED');
    }
    if (this.inputManager.consumeAction('autopilot')) {
      audio.playBlip();
      this.showHudNotice('AUTOPILOT ENGAGED - DRIFTING WITH SOLAR TIDES');
    }

    this.debugOverlay.updateFrame();
    this.debugOverlay.updateInputState(input, this.flightModel.getSpeed());

    this.renderer.render(this.scene.scene);

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private renderTitleScreen(): void {
    this.uiState = 'title';
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        color: #f8fafc;
        pointer-events: auto;
        background: radial-gradient(circle at 50% 50%, rgba(13, 21, 39, 0.45) 0%, rgba(3, 3, 7, 0.75) 100%);
      ">
        <div style="
          font-size: 13px;
          letter-spacing: 0.3em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 16px;
          font-weight: 500;
          opacity: 0.9;
        ">THE QUIET BETWEEN STARS</div>

        <h1 style="
          font-size: clamp(32px, 6vw, 64px);
          font-weight: 200;
          letter-spacing: 0.12em;
          margin: 0 0 16px 0;
          text-align: center;
          color: #f1f5f9;
          text-shadow: 0 0 40px rgba(56, 189, 248, 0.35);
        ">A Peaceful Space RPG</h1>

        <p style="
          font-size: clamp(14px, 2vw, 17px);
          font-weight: 300;
          color: #94a3b8;
          max-width: 520px;
          text-align: center;
          line-height: 1.7;
          margin: 0 0 48px 0;
        ">
          A cosmic road trip through the gentle strange. No combat. No ticking clocks. Just silence, wonder, and the warm hum of your craft.
        </p>

        <button id="btn-begin" style="
          padding: 16px 48px;
          background: rgba(14, 165, 233, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 9999px;
          color: #f8fafc;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.2em;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 0 25px rgba(56, 189, 248, 0.2);
        ">BEGIN</button>
      </div>
    `;

    const btn = this.uiContainer.querySelector('#btn-begin') as HTMLElement;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(14, 165, 233, 0.35)';
      btn.style.transform = 'scale(1.04)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(14, 165, 233, 0.15)';
      btn.style.transform = 'scale(1.0)';
    });

    btn.addEventListener('click', async () => {
      await audio.start();
      await storage.updateSettings({ introSeen: true });
      this.renderModeSelectScreen();
    });
  }

  private renderModeSelectScreen(): void {
    this.uiState = 'mode_select';
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: #f8fafc;
        pointer-events: auto;
        background: rgba(3, 3, 7, 0.65);
        backdrop-filter: blur(6px);
      ">
        <div style="
          font-size: 11px;
          letter-spacing: 0.25em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 12px;
        ">CONTROLLER SELECTION</div>

        <h2 style="
          font-size: clamp(24px, 4vw, 36px);
          font-weight: 300;
          letter-spacing: 0.08em;
          margin: 0 0 36px 0;
        ">How would you like to travel?</h2>

        <div style="display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; max-width: 680px;">
          <div id="card-pair-companion" style="
            flex: 1;
            min-width: 260px;
            max-width: 320px;
            padding: 32px 24px;
            background: rgba(15, 23, 42, 0.65);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          ">
            <div style="font-size: 32px; margin-bottom: 16px;">📱</div>
            <h3 style="font-size: 18px; font-weight: 500; margin: 0 0 10px 0; color: #38bdf8;">PAIR COMPANION</h3>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0;">
              Turn your smartphone into an in-universe flight terminal with virtual touch joystick, throttle, and scanner.
            </p>
            <span style="font-size: 12px; color: #38bdf8; font-weight: 600; letter-spacing: 0.05em;">RECOMMENDED →</span>
          </div>

          <div id="card-keyboard-mouse" style="
            flex: 1;
            min-width: 260px;
            max-width: 320px;
            padding: 32px 24px;
            background: rgba(15, 23, 42, 0.45);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          ">
            <div style="font-size: 32px; margin-bottom: 16px;">⌨️</div>
            <h3 style="font-size: 18px; font-weight: 500; margin: 0 0 10px 0; color: #e2e8f0;">KEYBOARD & MOUSE</h3>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0;">
              Fly directly on your computer using W/S pitch, A/D yaw, Shift/Ctrl throttle, and Space scan.
            </p>
            <span style="font-size: 12px; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">DIRECT DESKTOP →</span>
          </div>
        </div>
      </div>
    `;

    const pairCard = this.uiContainer.querySelector('#card-pair-companion') as HTMLElement;
    const kbCard = this.uiContainer.querySelector('#card-keyboard-mouse') as HTMLElement;

    pairCard.addEventListener('mouseenter', () => {
      pairCard.style.borderColor = 'rgba(56, 189, 248, 0.8)';
      pairCard.style.transform = 'translateY(-4px)';
    });
    pairCard.addEventListener('mouseleave', () => {
      pairCard.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      pairCard.style.transform = 'translateY(0)';
    });
    pairCard.addEventListener('click', () => {
      audio.playBlip();
      this.startPairingFlow();
    });

    kbCard.addEventListener('mouseenter', () => {
      kbCard.style.borderColor = 'rgba(148, 163, 184, 0.6)';
      kbCard.style.transform = 'translateY(-4px)';
    });
    kbCard.addEventListener('mouseleave', () => {
      kbCard.style.borderColor = 'rgba(148, 163, 184, 0.2)';
      kbCard.style.transform = 'translateY(0)';
    });
    kbCard.addEventListener('click', () => {
      audio.playBlip();
      this.inputManager.setMode('keyboard');
      this.debugOverlay.setInputSource('keyboard');
      this.renderFlightHUD('keyboard');
    });
  }

  private async startPairingFlow(): Promise<void> {
    this.uiState = 'pairing';
    this.sessionCode = generateSessionCode();
    this.sessionToken = generateSecureToken();

    const baseUrl = window.location.origin + window.location.pathname;
    const companionUrl = `${baseUrl}?mode=companion&session=${this.sessionCode}&token=${this.sessionToken}`;

    const signalingUrl =
      import.meta.env.VITE_SIGNALING_URL ||
      (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws';

    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: #f8fafc;
        pointer-events: auto;
        background: rgba(3, 3, 7, 0.75);
        backdrop-filter: blur(8px);
      ">
        <div style="font-size: 11px; letter-spacing: 0.25em; color: #38bdf8; margin-bottom: 8px;">PAIR YOUR COMPANION</div>
        <h2 style="font-size: 28px; font-weight: 300; margin: 0 0 12px 0;">Scan this with your phone</h2>
        
        <p style="
          font-size: 14px;
          color: #94a3b8;
          font-style: italic;
          max-width: 440px;
          text-align: center;
          margin: 0 0 24px 0;
          line-height: 1.5;
        ">
          "The universe is large enough already.<br>There is no need to bring a keyboard."
        </p>

        <div style="
          background: #ffffff;
          padding: 16px;
          border-radius: 16px;
          box-shadow: 0 0 30px rgba(56, 189, 248, 0.25);
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <canvas id="qr-canvas"></canvas>
        </div>

        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          padding: 8px 16px;
          margin-bottom: 16px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 13px;
        ">
          <span style="color: #94a3b8;">Session Code:</span>
          <span style="color: #38bdf8; font-weight: 700; letter-spacing: 0.1em;">${this.sessionCode}</span>
        </div>

        <div id="pairing-status" style="
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #cbd5e1;
          margin-bottom: 24px;
        ">
          <span style="
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #facc15;
            display: inline-block;
            animation: pulse 1.5s infinite;
          "></span>
          <span id="pairing-status-text">Waiting for Companion...</span>
        </div>

        <div id="pairing-offline-notice" style="
          display: none;
          max-width: 460px;
          padding: 12px 16px;
          background: rgba(234, 179, 8, 0.1);
          border: 1px solid rgba(234, 179, 8, 0.3);
          border-radius: 8px;
          font-size: 12px;
          color: #fde047;
          text-align: center;
          margin-bottom: 20px;
          line-height: 1.5;
        ">
          Signaling server is currently offline. Remote companion pairing requires a live signaling service (see README). You can still play immediately with Keyboard & Mouse!
        </div>

        <div style="display: flex; gap: 12px;">
          <button id="btn-fallback-keyboard" style="
            padding: 10px 20px;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 8px;
            color: #e2e8f0;
            font-size: 13px;
            cursor: pointer;
          ">USE KEYBOARD INSTEAD</button>

          <button id="btn-cancel-pairing" style="
            padding: 10px 20px;
            background: transparent;
            border: 1px solid transparent;
            color: #94a3b8;
            font-size: 13px;
            cursor: pointer;
          ">CANCEL</button>
        </div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      </style>
    `;

    const canvas = this.uiContainer.querySelector('#qr-canvas') as HTMLCanvasElement;
    if (canvas) {
      try {
        await QRCode.toCanvas(canvas, companionUrl, {
          width: 180,
          margin: 1,
          color: {
            dark: '#030307',
            light: '#ffffff',
          },
        });
      } catch (err) {
        console.warn('[QR] Failed to generate QR code', err);
      }
    }

    this.uiContainer.querySelector('#btn-fallback-keyboard')?.addEventListener('click', () => {
      this.cancelPairing();
      this.inputManager.setMode('keyboard');
      this.debugOverlay.setInputSource('keyboard');
      this.renderFlightHUD('keyboard');
    });

    this.uiContainer.querySelector('#btn-cancel-pairing')?.addEventListener('click', () => {
      this.cancelPairing();
      this.renderModeSelectScreen();
    });

    this.signaling = new SignalingClient(signalingUrl, this.sessionCode, this.sessionToken, 'desktop');
    this.peer = new PeerConnectionManager('desktop', this.signaling, {
      onStateChange: (state) => this.handleConnectionStateChange(state),
      onRealtimeInput: (input) => {
        this.inputManager.getCompanionSource().handleRealtimeInput(input);
      },
      onAction: (action) => {
        this.inputManager.getCompanionSource().handleAction(action);
      },
      onMetrics: (metrics) => {
        this.debugOverlay.updateMetrics(metrics);
      },
    });

    this.peer.start().catch((err) => {
      console.warn('[Pairing] Signaling server connection failed:', err);
      const notice = this.uiContainer.querySelector('#pairing-offline-notice') as HTMLElement;
      if (notice) notice.style.display = 'block';
    });
  }

  private handleConnectionStateChange(state: ConnectionState): void {
    const statusText = this.uiContainer.querySelector('#pairing-status-text');

    if (state === 'connected') {
      audio.playConnectChime();
      this.inputManager.setMode('companion');
      this.debugOverlay.setInputSource('companion');
      this.renderFlightHUD('companion');
    } else if (state === 'reconnecting') {
      this.showDisconnectBanner(true);
    } else if (state === 'disconnected') {
      this.showDisconnectBanner(true);
    } else if (statusText) {
      if (state === 'connecting') statusText.textContent = 'Companion detected! Negotiating WebRTC...';
      else if (state === 'waiting') statusText.textContent = 'Waiting for Companion...';
      else if (state === 'failed') statusText.textContent = 'Pairing failed. Re-trying...';
    }
  }

  private cancelPairing(): void {
    if (this.peer) {
      this.peer.dispose();
      this.peer = null;
    }
    this.signaling = null;
  }

  private renderFlightHUD(mode: 'companion' | 'keyboard'): void {
    this.uiState = 'playing';
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px 24px;
        box-sizing: border-box;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: auto;">
          <div style="
            font-size: 11px;
            letter-spacing: 0.25em;
            color: #38bdf8;
            font-weight: 600;
          ">THE QUIET BETWEEN STARS</div>

          <div style="display: flex; gap: 12px; align-items: center;">
            <button id="btn-audio-mute" style="
              background: rgba(15, 23, 42, 0.7);
              border: 1px solid rgba(148, 163, 184, 0.2);
              border-radius: 8px;
              color: #cbd5e1;
              padding: 6px 12px;
              font-size: 12px;
              cursor: pointer;
            ">${audio.getIsMuted() ? '🔇 MUTED' : '🔊 SOUND'}</button>
          </div>
        </div>

        <div id="companion-lost-banner" style="
          display: none;
          align-self: center;
          background: rgba(220, 38, 38, 0.25);
          border: 1px solid rgba(248, 113, 113, 0.5);
          backdrop-filter: blur(8px);
          border-radius: 12px;
          padding: 12px 20px;
          pointer-events: auto;
          display: none;
          align-items: center;
          gap: 16px;
          color: #fecaca;
          font-size: 13px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        ">
          <span>⚠ COMPANION SIGNAL LOST — Attempting to reconnect...</span>
          <button id="btn-switch-keyboard" style="
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">USE KEYBOARD INSTEAD</button>
        </div>

        <div id="hud-notice" style="
          align-self: center;
          font-size: 13px;
          letter-spacing: 0.15em;
          color: #38bdf8;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(56, 189, 248, 0.3);
          padding: 6px 16px;
          border-radius: 20px;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        "></div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div id="hud-controls-hint" style="
            font-size: 11px;
            color: #64748b;
            line-height: 1.6;
            font-family: ui-monospace, monospace;
          ">
            ${mode === 'keyboard' ? 'W/S Pitch · A/D Yaw · Q/E Roll · Shift/Ctrl Throttle · Space Scan' : 'Steer with Companion Joystick · Adjust Throttle · Press SCAN'}
          </div>

          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            color: #cbd5e1;
            font-family: ui-monospace, monospace;
          ">
            <span style="
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: ${mode === 'companion' ? '#4ade80' : '#38bdf8'};
            "></span>
            <span>${mode === 'companion' ? 'COMPANION ACTIVE' : 'KEYBOARD & MOUSE'}</span>
            <span style="color: #64748b; margin-left: 6px;">[ \` Telemetry ]</span>
          </div>
        </div>
      </div>
    `;

    const muteBtn = this.uiContainer.querySelector('#btn-audio-mute') as HTMLButtonElement;
    muteBtn?.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      muteBtn.textContent = isMuted ? '🔇 MUTED' : '🔊 SOUND';
      storage.updateSettings({ audioMuted: isMuted });
    });

    this.uiContainer.querySelector('#btn-switch-keyboard')?.addEventListener('click', () => {
      this.inputManager.setMode('keyboard');
      this.debugOverlay.setInputSource('keyboard');
      this.showDisconnectBanner(false);
      this.renderFlightHUD('keyboard');
    });
  }

  private showDisconnectBanner(show: boolean): void {
    const banner = this.uiContainer.querySelector('#companion-lost-banner') as HTMLElement;
    if (banner) {
      banner.style.display = show ? 'flex' : 'none';
    }
  }

  private showHudNotice(text: string): void {
    const el = this.uiContainer.querySelector('#hud-notice') as HTMLElement;
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    setTimeout(() => {
      if (el) el.style.opacity = '0';
    }, 2500);
  }

  public dispose(): void {
    this.isRunning = false;
    this.renderer.dispose();
    this.inputManager.dispose();
    this.cancelPairing();
  }
}
