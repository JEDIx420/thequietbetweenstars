import QRCode from 'qrcode';
import { audio } from '../audio/AudioEngine';
import { storage } from '../persistence/StorageManager';
import { generateSessionCode, generateSecureToken } from '../connection/token';
import { SignalingClient } from '../connection/signalingClient';
import { PeerConnectionManager } from '../connection/peerConnection';
import { getSignalingUrl } from '../connection/config';
import { buildCompanionUrl } from '../connection/url';
import { InputManager } from '../game/input/InputManager';
import { GameRenderer } from '../game/rendering/renderer';
import { SpaceScene } from '../game/scenes/spaceScene';
import { SurfaceScene } from '../game/surface/SurfaceScene';
import { FlightModel } from '../game/core/flightModel';
import { DebugOverlay } from '../game/ui/debugOverlay';
import { FlightStateMachine, FlightPhase } from '../game/flight/FlightStateMachine';
import { ApproachController, type TargetPlanetInfo } from '../game/flight/ApproachController';
import { OrbitController } from '../game/flight/OrbitController';
import { WorldPosition } from '../game/universe/WorldPosition';
import { FloatingOrigin } from '../game/universe/FloatingOrigin';
import { SectorManager } from '../game/universe/SectorManager';
import { LandingSiteGenerator, type LandingSite } from '../game/systems/LandingSiteGenerator';
import type { ConnectionState } from '../connection/connectionState';

export type UIState = 'title' | 'mode_select' | 'pairing' | 'playing';

export class DesktopApp {
  private container: HTMLElement;
  private uiContainer: HTMLElement;
  private canvasContainer: HTMLElement;

  private renderer!: GameRenderer;
  private spaceScene!: SpaceScene;
  private surfaceScene: SurfaceScene | null = null;
  private flightModel!: FlightModel;
  private inputManager!: InputManager;
  private debugOverlay!: DebugOverlay;

  // Universe and Flight Subsystems
  public stateMachine: FlightStateMachine = new FlightStateMachine(FlightPhase.SYSTEM_CRUISE);
  public approachController: ApproachController = new ApproachController();
  public orbitController: OrbitController = new OrbitController();
  public worldPosition: WorldPosition = new WorldPosition();
  public floatingOrigin: FloatingOrigin = new FloatingOrigin(2500);
  public sectorManager: SectorManager = new SectorManager('QUIET-DEFAULT-001');

  // Active Orbit / Inspection State
  public activeOrbitSites: LandingSite[] = [];
  public selectedSiteIndex = 0;

  private signaling: SignalingClient | null = null;
  private peer: PeerConnectionManager | null = null;
  private sessionCode = '';
  private sessionToken = '';

  private uiState: UIState = 'title';
  private lastTime = performance.now();
  private isRunning = false;
  private lastDeflectionSoundTime = 0;
  private currentControlMode: 'companion' | 'keyboard' = 'keyboard';

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
    this.spaceScene = new SpaceScene();
    this.flightModel = new FlightModel(this.spaceScene.shipGroup, this.spaceScene.physics, this.approachController);
    this.inputManager = new InputManager();
    this.debugOverlay = new DebugOverlay();

    // Register camera rebase listener
    this.floatingOrigin.registerListener({
      onRebase: (offset) => {
        this.flightModel.onRebase(offset);
      },
    });

    // Wire music contexts to state machine
    this.stateMachine.onPhaseChange((_from, to) => {
      this.debugOverlay.setFlightPhase(to);
      if (to === FlightPhase.SYSTEM_CRUISE || to === FlightPhase.DEEP_SPACE) {
        audio.setContext('cruise');
      } else if (to === FlightPhase.PLANET_APPROACH) {
        audio.setContext('approach');
      } else if (to === FlightPhase.ORBIT) {
        audio.setContext('orbit');
      } else if (to === FlightPhase.ENTRY) {
        audio.setContext('entry');
      } else if (to === FlightPhase.SURFACE_FLIGHT) {
        audio.setContext('surface');
      }

      // Notify companion of context change
      this.notifyCompanionContext(to);
    });

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private gameLoop(time: number): void {
    if (!this.isRunning) return;

    const dt = Math.min((time - this.lastTime) * 0.001, 0.06);
    this.lastTime = time;

    const input = this.inputManager.getNormalizedInput();
    const phase = this.stateMachine.getPhase();

    if (phase === FlightPhase.SURFACE_FLIGHT && this.surfaceScene) {
      // 1. Surface Simulation Domain
      const res = this.surfaceScene.update(input, dt, this.renderer.camera);
      const throttle = input.throttle;
      audio.updateThrottle(throttle);

      if (res.activeScanTarget) {
        this.updateContextPrompt(`PROXIMITY: ${res.activeScanTarget.name} // SPACE TO SCAN`);
      } else {
        this.updateContextPrompt('SURFACE EXPLORATION // SPACE: TERRAIN RADAR · E: RETURN TO ORBIT');
      }

      if (this.inputManager.consumeAction('scan')) {
        audio.playScanEffect();
        if (res.activeScanTarget) {
          this.showHudNotice(`SCANNED: ${res.activeScanTarget.name} — ${res.activeScanTarget.info}`);
        } else {
          this.showHudNotice('SURFACE RADAR: MINERAL FORMATIONS CONFIRMED');
        }
      }

      if (this.inputManager.consumeAction('confirm') || this.inputManager.consumeAction('autopilot')) {
        this.returnToOrbitFromSurface();
      }

      this.renderer.render(this.surfaceScene.scene);
    } else if (phase === FlightPhase.ORBIT) {
      // 2. Orbital Inspection Domain
      this.orbitController.update(dt, this.spaceScene.shipGroup, this.renderer.camera);
      const shipPos = this.spaceScene.shipGroup.position;
      this.spaceScene.update(dt, shipPos, this.renderer.camera.position, 0);

      // Orbital UI interactions: A/D or arrows change site, Enter/Space enters
      if (this.inputManager.consumeAction('confirm')) {
        this.initiateSurfaceEntry();
      }
      if (this.inputManager.consumeAction('cancel')) {
        this.leaveOrbitToSpace();
      }

      this.renderer.render(this.spaceScene.scene);
    } else {
      // 3. Space Flight & Approach Domain
      this.flightModel.update(input, dt, this.renderer.camera);

      const shipPos = this.flightModel.position;
      const throttle = this.flightModel.getThrottle();
      this.spaceScene.update(dt, shipPos, this.renderer.camera.position, throttle, input.axes.x, input.axes.y);

      if (this.uiState === 'playing') {
        audio.updateThrottle(throttle);
      }

      // Check Approach Controller for planets
      const targetPlanet = this.approachController.update(shipPos, this.spaceScene.activePlanetList);
      if (targetPlanet) {
        if (phase !== FlightPhase.PLANET_APPROACH) {
          this.stateMachine.transitionTo(FlightPhase.PLANET_APPROACH);
        }
        this.updateApproachHUD(targetPlanet);

        // Contextual SPACE action: Inspect Planet when in orbital reach
        if (targetPlanet.canInspect && this.inputManager.consumeAction('scan')) {
          this.engageOrbit(targetPlanet);
        }
      } else {
        if (phase === FlightPhase.PLANET_APPROACH) {
          this.stateMachine.transitionTo(FlightPhase.SYSTEM_CRUISE);
        }
        this.clearApproachHUD();

        // Normal Scanner pulse in free space
        if (this.inputManager.consumeAction('scan')) {
          this.spaceScene.triggerScan(shipPos);
          audio.playScanEffect();
          this.showHudNotice('SCAN INITIATED — ACOUSTIC RESONANCE EMITTED');
        }
      }

      // Floating-Origin Rebasing check (keeps coordinates within 2500 units)
      const rebased = this.floatingOrigin.checkAndRebase(
        shipPos,
        this.worldPosition,
        [this.spaceScene.scene]
      );
      if (rebased) {
        this.sectorManager.update(this.worldPosition);
        this.debugOverlay.setWorldPos(
          `Sector [${this.worldPosition.sector.x},${this.worldPosition.sector.y},${this.worldPosition.sector.z}]`
        );
      }

      // Celestial collision feedback
      if (this.flightModel.lastCollision.hasCollided) {
        const now = performance.now();
        if (now - this.lastDeflectionSoundTime > 400) {
          this.lastDeflectionSoundTime = now;
          audio.playCollisionDeflection(this.flightModel.lastCollision.isDanger);
          const bodyName = this.flightModel.lastCollision.collidedBody?.name || 'CELESTIAL BODY';
          this.showHudNotice(`EXCLUSION SHELL ENGAGED — DEFLECTION ALONG ${bodyName}`);
        }
      }

      this.renderer.render(this.spaceScene.scene);
    }

    if (this.inputManager.consumeAction('map')) {
      audio.playBlip();
      this.showHudNotice(`STELLAR CARTOGRAPHY — SECTOR [${this.worldPosition.sector.x},${this.worldPosition.sector.y},${this.worldPosition.sector.z}] RECORDED`);
    }

    this.debugOverlay.updateFrame();
    this.debugOverlay.updateInputState(input, this.flightModel.getSpeed());

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private engageOrbit(target: TargetPlanetInfo): void {
    audio.playConnectChime();
    this.stateMachine.transitionTo(FlightPhase.ORBIT);
    this.orbitController.enterOrbit(target.planet, target.position, this.flightModel.position);

    // Generate deterministic landing sites for inspection UI
    this.activeOrbitSites = LandingSiteGenerator.generateSites(target.planet);
    this.selectedSiteIndex = 0;

    this.showHudNotice(`ORBITAL INSERTION // SYNCHRONIZING WITH ${target.planet.name.toUpperCase()}`);
    this.renderOrbitInspectionHUD();
  }

  private initiateSurfaceEntry(): void {
    if (this.activeOrbitSites.length === 0 || !this.orbitController.planet) {
      this.showHudNotice('ATMOSPHERIC ENTRY UNAVAILABLE ON THIS CELESTIAL BODY');
      return;
    }

    const selectedSite = this.activeOrbitSites[this.selectedSiteIndex];
    this.stateMachine.transitionTo(FlightPhase.ENTRY);
    this.showHudNotice(`ATMOSPHERIC ENTRY INITIATED // VECTOR: ${selectedSite.name}`);

    // Cinematic entry ease: 2.2 seconds before transitioning to SurfaceScene
    setTimeout(() => {
      this.surfaceScene = new SurfaceScene(this.orbitController.planet!, selectedSite);
      this.stateMachine.transitionTo(FlightPhase.SURFACE_FLIGHT);
      this.renderSurfaceHUD();
      this.showHudNotice(`ATMOSPHERIC PENETRATION COMPLETE // COMMENCING HOVER RECONNAISSANCE`);
    }, 2200);
  }

  private returnToOrbitFromSurface(): void {
    this.stateMachine.transitionTo(FlightPhase.ASCENT);
    this.showHudNotice('SUB-ORBITAL ASCENT THRUSTERS ENGAGED');

    setTimeout(() => {
      if (this.surfaceScene) {
        this.surfaceScene.dispose();
        this.surfaceScene = null;
      }
      this.stateMachine.transitionTo(FlightPhase.ORBIT);
      this.renderOrbitInspectionHUD();
      this.showHudNotice('ORBITAL ALTITUDE RESTORED');
    }, 1800);
  }

  private leaveOrbitToSpace(): void {
    this.orbitController.leaveOrbit();
    this.stateMachine.transitionTo(FlightPhase.SYSTEM_CRUISE);
    this.renderFlightHUD(this.currentControlMode);
    this.showHudNotice('ORBIT DISENGAGED // CRUISE FLIGHT RESTORED');
  }

  private updateApproachHUD(target: TargetPlanetInfo): void {
    const el = this.uiContainer.querySelector('#proximity-indicator') as HTMLElement;
    if (!el) return;

    el.style.display = 'flex';
    const distKm = Math.round(target.distance);
    if (target.canInspect) {
      el.innerHTML = `
        <span style="color: #4ade80;">●</span>
        <span>${target.planet.name.toUpperCase()} [ORBIT REACHED: ${distKm} KM]</span>
        <span style="background: #38bdf8; color: #0284c7; padding: 2px 8px; border-radius: 9999px; font-weight: 700; color: #030307;">SPACE — INSPECT</span>
      `;
    } else {
      el.innerHTML = `
        <span style="color: #38bdf8;">●</span>
        <span>${target.planet.name.toUpperCase()} [APPROACH: ${distKm} KM]</span>
        <span style="color: #94a3b8;">DECELERATING</span>
      `;
    }
  }

  private clearApproachHUD(): void {
    const el = this.uiContainer.querySelector('#proximity-indicator') as HTMLElement;
    if (el) el.style.display = 'none';
  }

  private updateContextPrompt(text: string): void {
    const el = this.uiContainer.querySelector('#hud-controls-hint') as HTMLElement;
    if (el) el.textContent = text;
  }

  private notifyCompanionContext(phase: FlightPhase): void {
    if (!this.peer) return;
    let layout = 'flight-v1';
    let context = 'space-flight';

    if (phase === FlightPhase.ORBIT) {
      context = 'dialogue';
      layout = 'dialogue-v1';
    } else if (phase === FlightPhase.SURFACE_FLIGHT) {
      context = 'planet-exploration';
      layout = 'flight-v1';
    }

    this.peer.sendContextChange(context as any, layout as any);
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
        pointer-events: auto;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: radial-gradient(circle at 50% 50%, rgba(13, 21, 39, 0.45) 0%, rgba(3, 3, 7, 0.8) 100%);
      ">
        <div style="
          font-size: 13px;
          letter-spacing: 0.35em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 16px;
          font-weight: 600;
          text-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
        ">THE QUIET BETWEEN STARS</div>

        <h1 style="
          font-size: clamp(34px, 6.5vw, 68px);
          font-weight: 200;
          letter-spacing: 0.14em;
          margin: 0 0 18px 0;
          text-align: center;
          color: #f8fafc;
          text-shadow: 0 0 45px rgba(56, 189, 248, 0.4);
        ">A Peaceful Space RPG</h1>

        <p style="
          font-size: clamp(14px, 2vw, 17px);
          font-weight: 300;
          color: #94a3b8;
          max-width: 540px;
          text-align: center;
          line-height: 1.75;
          margin: 0 0 48px 0;
          letter-spacing: 0.02em;
        ">
          A cosmic road trip into the gentle strange. No combat. No ticking clocks. Just silence, wonder, and the warm hum of your craft.
        </p>

        <button id="btn-begin" style="
          padding: 18px 54px;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(56, 189, 248, 0.12));
          border: 1px solid rgba(56, 189, 248, 0.65);
          border-radius: 9999px;
          color: #f8fafc;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.22em;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 0 35px rgba(56, 189, 248, 0.3);
        ">BEGIN JOURNEY</button>
      </div>
    `;

    const btn = this.uiContainer.querySelector('#btn-begin') as HTMLElement;
    btn.addEventListener('click', async () => {
      await audio.start();
      audio.playTitleMusic();
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
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: #f8fafc;
        pointer-events: auto;
        background: rgba(3, 3, 7, 0.65);
        backdrop-filter: blur(8px);
      ">
        <div style="
          font-size: 11px;
          letter-spacing: 0.3em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 12px;
          font-weight: 600;
        ">CONTROLLER SELECTION</div>

        <h2 style="
          font-size: 28px;
          font-weight: 300;
          letter-spacing: 0.08em;
          margin: 0 0 36px 0;
        ">Choose Your Flight Terminal</h2>

        <div style="display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; max-width: 720px; padding: 0 20px;">
          <div id="card-companion" style="
            flex: 1;
            min-width: 260px;
            max-width: 320px;
            padding: 32px 24px;
            background: rgba(15, 23, 42, 0.7);
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
            <div style="font-size: 34px; margin-bottom: 16px;">📱</div>
            <h3 style="font-size: 18px; font-weight: 500; margin: 0 0 10px 0; color: #38bdf8;">PAIR COMPANION</h3>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0;">
              Turn your smartphone into an in-universe flight terminal with virtual touch joystick, throttle, and scanner.
            </p>
            <span style="font-size: 12px; color: #38bdf8; letter-spacing: 0.1em; font-weight: 600;">RECOMMENDED →</span>
          </div>

          <div id="card-keyboard" style="
            flex: 1;
            min-width: 260px;
            max-width: 320px;
            padding: 32px 24px;
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          ">
            <div style="font-size: 34px; margin-bottom: 16px;">⌨️</div>
            <h3 style="font-size: 18px; font-weight: 500; margin: 0 0 10px 0; color: #e2e8f0;">KEYBOARD & MOUSE</h3>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0;">
              Fly directly on your computer using W/S pitch, A/D yaw, Shift/Ctrl throttle, and Space scan.
            </p>
            <span style="font-size: 12px; color: #94a3b8; letter-spacing: 0.1em; font-weight: 600;">PLAY NOW →</span>
          </div>
        </div>
      </div>
    `;

    this.uiContainer.querySelector('#card-companion')?.addEventListener('click', () => {
      audio.playBlip();
      this.renderPairingScreen();
    });

    this.uiContainer.querySelector('#card-keyboard')?.addEventListener('click', () => {
      audio.playBlip();
      this.inputManager.setMode('keyboard');
      this.debugOverlay.setInputSource('keyboard');
      this.currentControlMode = 'keyboard';
      this.enterFlightMode('keyboard');
    });
  }

  private async renderPairingScreen(): Promise<void> {
    this.uiState = 'pairing';
    this.sessionCode = generateSessionCode();
    this.sessionToken = generateSecureToken();

    const signalingUrl = getSignalingUrl();
    const companionUrl = buildCompanionUrl({
      origin: window.location.origin,
      pathname: window.location.pathname,
      basePath: import.meta.env.BASE_URL,
      session: this.sessionCode,
      token: this.sessionToken,
      signalingUrl,
    });

    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: #f8fafc;
        pointer-events: auto;
        background: rgba(3, 3, 7, 0.7);
        backdrop-filter: blur(10px);
        padding: 24px;
        box-sizing: border-box;
      ">
        <div style="font-size: 11px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase; margin-bottom: 8px;">PAIRING TERMINAL</div>
        <h2 style="font-size: 26px; font-weight: 300; margin: 0 0 24px 0;">Scan with your Phone</h2>

        <div style="
          background: #ffffff;
          padding: 16px;
          border-radius: 16px;
          box-shadow: 0 0 40px rgba(56, 189, 248, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        ">
          <canvas id="qr-canvas"></canvas>
        </div>

        <div style="margin-bottom: 20px; text-align: center;">
          <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">OR ENTER SESSION CODE ON PHONE:</div>
          <div style="font-family: ui-monospace, monospace; font-size: 28px; letter-spacing: 0.2em; color: #38bdf8; font-weight: 700;">
            ${this.sessionCode}
          </div>
        </div>

        <div id="pairing-status-text" style="font-size: 13px; color: #cbd5e1; margin-bottom: 24px;">
          Waiting for phone connection...
        </div>

        <div style="display: flex; gap: 16px;">
          <button id="btn-cancel-pairing" style="
            padding: 10px 24px;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 8px;
            color: #cbd5e1;
            font-size: 13px;
            cursor: pointer;
          ">CANCEL</button>

          <button id="btn-play-keyboard-fallback" style="
            padding: 10px 24px;
            background: rgba(14, 165, 233, 0.2);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 8px;
            color: #38bdf8;
            font-size: 13px;
            cursor: pointer;
          ">PLAY WITH KEYBOARD INSTEAD</button>
        </div>
      </div>
    `;

    const canvas = this.uiContainer.querySelector('#qr-canvas') as HTMLCanvasElement;
    if (canvas) {
      await QRCode.toCanvas(canvas, companionUrl, { width: 200, margin: 1 });
    }

    this.uiContainer.querySelector('#btn-play-keyboard-fallback')?.addEventListener('click', () => {
      this.cancelPairing();
      this.inputManager.setMode('keyboard');
      this.debugOverlay.setInputSource('keyboard');
      this.currentControlMode = 'keyboard';
      this.enterFlightMode('keyboard');
    });

    this.uiContainer.querySelector('#btn-cancel-pairing')?.addEventListener('click', () => {
      this.cancelPairing();
      this.renderModeSelectScreen();
    });

    if (signalingUrl) {
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
      });
    }
  }

  private handleConnectionStateChange(state: ConnectionState): void {
    const statusText = this.uiContainer.querySelector('#pairing-status-text');

    if (state === 'connected') {
      audio.playConnectChime();
      this.inputManager.setMode('companion');
      this.debugOverlay.setInputSource('companion');
      this.currentControlMode = 'companion';
      this.enterFlightMode('companion');
    } else if (statusText) {
      if (state === 'connecting') statusText.textContent = 'Companion detected! Negotiating WebRTC...';
      else if (state === 'waiting') statusText.textContent = 'Waiting for phone connection...';
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

  private enterFlightMode(mode: 'companion' | 'keyboard'): void {
    this.uiState = 'playing';
    audio.setContext('cruise');
    this.renderFlightHUD(mode);
  }

  private renderFlightHUD(mode: 'companion' | 'keyboard'): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 22px 28px;
        box-sizing: border-box;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: auto;">
          <div style="font-size: 11px; letter-spacing: 0.3em; color: #38bdf8; font-weight: 600;">
            THE QUIET BETWEEN STARS
          </div>

          <div style="display: flex; gap: 12px; align-items: center;">
            <button id="btn-audio-mute" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(148, 163, 184, 0.25);
              border-radius: 8px;
              color: #cbd5e1;
              padding: 7px 14px;
              font-size: 12px;
              cursor: pointer;
            ">${audio.getIsMuted() ? '🔇 MUTED' : '🔊 SOUND'}</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; align-self: center;">
          <div id="proximity-indicator" style="
            display: none;
            align-items: center;
            gap: 10px;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 11px;
            letter-spacing: 0.08em;
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(56, 189, 248, 0.35);
            padding: 6px 16px;
            border-radius: 20px;
            color: #e2e8f0;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          "></div>

          <div id="hud-notice" style="
            font-size: 13px;
            letter-spacing: 0.12em;
            color: #38bdf8;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(56, 189, 248, 0.3);
            padding: 6px 18px;
            border-radius: 20px;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
          "></div>
        </div>

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
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${mode === 'companion' ? '#4ade80' : '#38bdf8'};"></span>
            <span>${mode === 'companion' ? 'COMPANION ACTIVE' : 'KEYBOARD & MOUSE'}</span>
            <span style="color: #64748b; margin-left: 6px;">[ \` Telemetry ]</span>
          </div>
        </div>
      </div>
    `;

    this.uiContainer.querySelector('#btn-audio-mute')?.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      const btn = this.uiContainer.querySelector('#btn-audio-mute') as HTMLButtonElement;
      if (btn) btn.textContent = isMuted ? '🔇 MUTED' : '🔊 SOUND';
    });
  }

  private renderOrbitInspectionHUD(): void {
    const planet = this.orbitController.planet;
    if (!planet) return;

    const sitesListHtml = this.activeOrbitSites
      .map((site, idx) => `
        <div class="site-card" data-idx="${idx}" style="
          padding: 10px 14px;
          margin-bottom: 8px;
          background: ${idx === this.selectedSiteIndex ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.6)'};
          border: 1px solid ${idx === this.selectedSiteIndex ? 'rgba(56, 189, 248, 0.8)' : 'rgba(148, 163, 184, 0.2)'};
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        ">
          <div style="display: flex; justify-content: space-between; font-weight: 600; color: #f8fafc; font-size: 12px;">
            <span>${site.name}</span>
            <span style="color: #38bdf8;">${site.safetyRating}</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">${site.interestingSignals[0] || site.biome}</div>
        </div>
      `)
      .join('');

    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        justify-content: space-between;
        padding: 24px;
        box-sizing: border-box;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, sans-serif;
      ">
        <!-- Left Panel: Planet Facts -->
        <div style="
          width: 320px;
          background: rgba(10, 15, 26, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 14px;
          padding: 20px;
          pointer-events: auto;
          color: #e2e8f0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        ">
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">ORBITAL SURVEY</div>
          <h2 style="font-size: 22px; font-weight: 400; margin: 4px 0 12px 0; color: #f8fafc;">${planet.name}</h2>
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">${planet.shortDescription}</p>

          <div style="display: flex; flex-direction: column; gap: 6px; font-family: ui-monospace, monospace; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
            <div>Classification: <span style="color: #38bdf8;">${planet.type}</span></div>
            <div>Equatorial Radius: <span>${(planet.radius * 38).toFixed(0)} km</span></div>
            <div>Surface Gravity: <span>${planet.gravity} m/s²</span></div>
            <div>Atmospheric Pressure: <span>${planet.surfacePressureAtm} atm</span></div>
            <div>Hydrosphere Coverage: <span>${(planet.oceanCoverage * 100).toFixed(0)}%</span></div>
            <div>Biosignature: <span style="color: #4ade80;">${planet.biosignature.toUpperCase()}</span></div>
          </div>
        </div>

        <!-- Right Panel: Landing Site Selection -->
        <div style="
          width: 320px;
          background: rgba(10, 15, 26, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 14px;
          padding: 20px;
          pointer-events: auto;
          color: #e2e8f0;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        ">
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">LANDING RECONNAISSANCE</div>
          <h3 style="font-size: 16px; font-weight: 500; margin: 4px 0 14px 0;">Designate Touchdown Site</h3>

          <div id="sites-container" style="flex: 1; overflow-y: auto;">
            ${sitesListHtml}
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">
            <button id="btn-land" style="
              padding: 12px;
              background: linear-gradient(135deg, rgba(14, 165, 233, 0.4), rgba(56, 189, 248, 0.2));
              border: 1px solid rgba(56, 189, 248, 0.8);
              border-radius: 8px;
              color: #f8fafc;
              font-weight: 700;
              font-size: 13px;
              letter-spacing: 0.1em;
              cursor: pointer;
            ">INITIATE DESCENT (ENTER)</button>

            <button id="btn-leave-orbit" style="
              padding: 10px;
              background: rgba(30, 41, 59, 0.6);
              border: 1px solid rgba(148, 163, 184, 0.3);
              border-radius: 8px;
              color: #cbd5e1;
              font-size: 12px;
              cursor: pointer;
            ">LEAVE ORBIT (ESC)</button>
          </div>
        </div>
      </div>
    `;

    // Site card selection handlers
    this.uiContainer.querySelectorAll('.site-card').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
        this.selectedSiteIndex = idx;
        audio.playBlip();
        this.renderOrbitInspectionHUD();
      });
    });

    this.uiContainer.querySelector('#btn-land')?.addEventListener('click', () => {
      this.initiateSurfaceEntry();
    });

    this.uiContainer.querySelector('#btn-leave-orbit')?.addEventListener('click', () => {
      this.leaveOrbitToSpace();
    });
  }

  private renderSurfaceHUD(): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 24px;
        box-sizing: border-box;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: auto;">
          <div style="font-size: 11px; letter-spacing: 0.25em; color: #38bdf8; font-weight: 600;">
            ${this.orbitController.planet?.name.toUpperCase()} SURFACE // LOW-ALTITUDE HOVER
          </div>

          <button id="btn-return-orbit" style="
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 8px;
            color: #38bdf8;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">RETURN TO ORBIT [E]</button>
        </div>

        <div id="hud-notice" style="
          align-self: center;
          font-size: 13px;
          letter-spacing: 0.12em;
          color: #38bdf8;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.35);
          padding: 6px 18px;
          border-radius: 20px;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        "></div>

        <div id="hud-controls-hint" style="
          font-size: 11px;
          color: #94a3b8;
          font-family: ui-monospace, monospace;
        ">
          SURFACE HOVER FLIGHT · STEER W/A/S/D · SHIFT THROTTLE · SPACE TO SCAN MONOLITHS
        </div>
      </div>
    `;

    this.uiContainer.querySelector('#btn-return-orbit')?.addEventListener('click', () => {
      this.returnToOrbitFromSurface();
    });
  }

  private showHudNotice(text: string): void {
    const el = this.uiContainer.querySelector('#hud-notice') as HTMLElement;
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    setTimeout(() => {
      if (el) el.style.opacity = '0';
    }, 3000);
  }

  public dispose(): void {
    this.isRunning = false;
    if (this.peer) this.peer.dispose();
  }
}
