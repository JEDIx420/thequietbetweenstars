import * as THREE from 'three';
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
import { CompanionDiagnosticsModal } from './CompanionDiagnosticsModal';
import { HolographicNavModal } from './HolographicNavModal';
import { JournalModal } from './JournalModal';
import { HelpModal } from './HelpModal';
import { SupplyModal } from './SupplyModal';
import { DialoguePresenter } from './DialoguePresenter';
import { StructuredConversationProvider } from '../narrative/ConversationDirector';
import { NarrativeDirector } from '../narrative/NarrativeDirector';
import { TutorialDirector } from '../tutorial/TutorialDirector';
import type { NarrativeContext } from '../narrative/NarrativeTypes';
import { NavRadar } from '../game/ui/NavRadar';
import { DeepCruiseController } from '../game/flight/DeepCruiseController';
import { AutopilotController } from '../game/flight/AutopilotController';
import { saveManager, type PlayerSaveSlot, type ShipModule } from '../persistence/SaveManager';
import type { NPCIdentity } from '../game/ecology/SentientSpeciesProfile';
import type { ConnectionState } from '../connection/connectionState';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';

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

  // Navigation, Cruise & Autopilot Systems
  public deepCruiseController!: DeepCruiseController;
  public autopilotController!: AutopilotController;
  public navRadar!: NavRadar;
  public holographicNavModal!: HolographicNavModal;
  public journalModal!: JournalModal;
  public helpModal!: HelpModal;
  public supplyModal!: SupplyModal;

  // Narrative & Tutorial Systems
  public dialoguePresenter!: DialoguePresenter;
  public narrativeDirector!: NarrativeDirector;
  public tutorialDirector!: TutorialDirector;

  // Real journey stats & tracking
  public visitedSystems = new Set<string>();
  public scannedPlanets = new Set<string>();
  public visitedSurfaces = new Set<string>();
  public discoveredSpecies = new Set<string>();
  public discoveredAnomalies = new Set<string>();
  public credits = 0;
  public sampleInventory: Record<string, number> = {};
  public installedModules = new Set<string>();
  public pendingOrders: any[] = [];
  public npcMemories: Record<string, any> = {};
  public activeNPCInConversation: NPCIdentity | null = null;
  private journeyStartTime = Date.now();

  private hasSavedJourney = false;
  private lastAutosaveTime = 0;

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

    // Register floating-origin rebase listener
    this.floatingOrigin.registerListener({
      onRebase: (offset) => {
        this.flightModel.onRebase(offset, this.renderer.camera);
        this.spaceScene.onRebase(offset);
      },
    });

    // 1. Narrative & Dialogue Subsystems
    this.dialoguePresenter = new DialoguePresenter(this.canvasContainer);
    this.narrativeDirector = new NarrativeDirector(this.dialoguePresenter);
    this.tutorialDirector = new TutorialDirector(this.narrativeDirector, () => this.getNarrativeContext());
    this.tutorialDirector.setCallbacks(
      (prompt) => this.updateContextPrompt(prompt || ''),
      (action, prompt) => {
        if (this.peer) {
          this.peer.sendReliable({
            type: 'tutorial_hint',
            action,
            prompt,
            timestamp: Date.now(),
          } as any);
        }
      }
    );

    // Mirror ship computer dialogue to phone companion
    this.dialoguePresenter.setMirrorCallback((line) => {
      if (this.peer) {
        this.peer.sendReliable({
          type: 'dialogue_line',
          speaker: line.speaker,
          text: line.text,
          durationMs: line.durationMs,
          timestamp: Date.now(),
        } as any);
      }
    });

    // Wire interactive conversation choices
    this.dialoguePresenter.setChoiceCallback((topic: string) => {
      this.handleConversationChoice(topic);
    });

    // 2. Navigation & Autopilot subsystems
    this.autopilotController = new AutopilotController(this.flightModel);
    this.navRadar = new NavRadar(this.canvasContainer, this.autopilotController);
    this.navRadar.setPlanets(this.spaceScene.activePlanetList);
    this.navRadar.setOnTargetCycle((target) => {
      this.tutorialDirector.onPlayerTargetCycle();
      this.narrativeDirector.trigger('first_target_selected', { targetName: target.name }, this.getNarrativeContext(), { forceOnce: true });
    });
    this.navRadar.setOnOpenSystemMap(() => {
      this.holographicNavModal.setScale('SYSTEM');
      this.holographicNavModal.open();
    });

    // 3. Interstellar Deep Cruise subsystem
    this.deepCruiseController = new DeepCruiseController(
      this.stateMachine,
      this.flightModel,
      this.spaceScene
    );
    this.deepCruiseController.setOnArrival((targetSys) => {
      this.navRadar.setPlanets(this.spaceScene.activePlanetList, targetSys.anomalies || []);
      this.showHudNotice(`ARRIVED // STAR SYSTEM: ${targetSys.name.toUpperCase()}`);
      audio.playConnectChime();
      this.recordArrivalDiscovery(targetSys);
      this.tutorialDirector.onPlayerArrival(targetSys.name, targetSys.planets.length);
      this.saveCurrentJourney();
    });

    // 4. Modals: Holographic 3D Nav (M), Journal (J), Help (H), Supply (U)
    this.holographicNavModal = new HolographicNavModal(
      this.container,
      this.sectorManager,
      this.worldPosition,
      (targetSys) => {
        this.engageInterstellarCruise(targetSys);
      }
    );
    this.holographicNavModal.setOnCourseSet((targetSys) => {
      this.showHudNotice(`COURSE LOCKED // ${targetSys.name.toUpperCase()}`);
      this.tutorialDirector.onPlayerSetCourse(targetSys.name, `${Math.round(this.worldPosition.sector.x - targetSys.sectorX)} sec`);
    });

    this.journalModal = new JournalModal(this.container);
    this.helpModal = new HelpModal(this.container);

    this.supplyModal = new SupplyModal(this.container, {
      onOrderModule: (mod) => {
        this.handleModuleOrder(mod);
      },
      onClose: () => {
        audio.playBlip();
      },
    });

    // Wire music contexts to state machine
    this.stateMachine.onPhaseChange((_from, to) => {
      this.debugOverlay.setFlightPhase(to);
      if (to === FlightPhase.SYSTEM_CRUISE || to === FlightPhase.DEEP_SPACE) {
        audio.setContext('cruise');
      } else if (to === FlightPhase.STELLAR_CRUISE) {
        audio.setContext('deep_cruise');
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

    // Check steering & throttle for tutorial progress
    if (Math.abs(input.axes.x) > 0.25 || Math.abs(input.axes.y) > 0.25) {
      this.tutorialDirector.onPlayerSteer();
    }
    if (input.throttle > 0.1) {
      this.tutorialDirector.onPlayerThrottle();
    }
    this.tutorialDirector.update();

    if (phase === FlightPhase.SURFACE_FLIGHT && this.surfaceScene) {
      // 1. Surface Simulation Domain
      const res = this.surfaceScene.update(input, dt, this.renderer.camera);
      const throttle = input.throttle;
      audio.updateThrottle(throttle);

      // Telemetry HUD updates
      const spdEl = this.uiContainer.querySelector('#telemetry-speed');
      const thrEl = this.uiContainer.querySelector('#telemetry-throttle');
      const crEl = this.uiContainer.querySelector('#telemetry-credits');
      if (spdEl) spdEl.textContent = `${res.speedMps}`;
      if (thrEl) thrEl.textContent = `${Math.round(throttle * 100)}% (ALT ${res.altitudeAGL}m)`;
      if (crEl) crEl.textContent = `${this.credits}`;

      // Handle companion altitude adjustments
      if (this.inputManager.consumeAction('altitude_up')) {
        this.surfaceScene.adjustAltitude(12.0);
      }
      if (this.inputManager.consumeAction('altitude_down')) {
        this.surfaceScene.adjustAltitude(-12.0);
      }

      if (res.nearbyResource) {
        this.updateContextPrompt(`SURVEY SAMPLE DETECTED: ${res.nearbyResource.name} // PRESS SPACE TO COLLECT`);
      } else if (res.activeScanTarget) {
        if (res.activeScanTarget.isSentient) {
          this.updateContextPrompt(`SENTIENT BEACON: ${res.activeScanTarget.name.toUpperCase()} // PRESS SPACE TO COMMUNICATE`);
        } else {
          this.updateContextPrompt(`PROXIMITY: ${res.activeScanTarget.name} // SPACE TO SCAN`);
        }
      } else {
        this.updateContextPrompt('SURFACE EXPLORATION // SPACE: RADAR · Q/E: ALTITUDE · U: SUPPLY · ESC/E: ORBIT');
      }

      // Contextual action: Collect sample or initiate conversation or scan
      if (this.inputManager.consumeAction('scan') || this.inputManager.consumeAction('talk') || this.inputManager.consumeAction('interact')) {
        if (res.nearbyResource) {
          this.collectSurveySample(res.nearbyResource);
        } else if (res.activeScanTarget?.isSentient && res.activeScanTarget.npcData) {
          this.startGiantConversation(res.activeScanTarget.npcData);
        } else {
          audio.playScanEffect();
          this.tutorialDirector.onPlayerScan();

          if (res.activeScanTarget) {
            this.showHudNotice(`SCANNED: ${res.activeScanTarget.name} — LOG UPDATED`);
            this.recordSurfaceDiscovery(res.activeScanTarget.name, res.activeScanTarget.info);
            this.tutorialDirector.onPlayerDiscovery();
          } else {
            this.showHudNotice('SURFACE RADAR: MINERAL STRATA CONFIRMED');
          }
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

      // Telemetry in space
      const spdEl = this.uiContainer.querySelector('#telemetry-speed');
      const thrEl = this.uiContainer.querySelector('#telemetry-throttle');
      const crEl = this.uiContainer.querySelector('#telemetry-credits');
      if (spdEl) spdEl.textContent = `${Math.round(this.flightModel.getSpeed())}`;
      if (thrEl) thrEl.textContent = `${Math.round(throttle * 100)}%`;
      if (crEl) crEl.textContent = `${this.credits}`;

      // Check for pending courier deliveries and courier pod docking in space
      this.updateCourierDelivery(shipPos);

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
          this.tutorialDirector.onPlayerScan();
          this.showHudNotice('SCAN INITIATED — ACOUSTIC RESONANCE EMITTED');

          // Check if space anomalies or rare resonance trigger
          if (this.discoveredSpecies.size + this.visitedSystems.size >= 2 && !this.narrativeDirector.resonanceFlags.has('heard_first_resonance')) {
            this.narrativeDirector.resonanceFlags.add('heard_first_resonance');
            this.narrativeDirector.trigger('resonance_first_hint', {}, this.getNarrativeContext(), { priority: 'high' });
            saveManager.recordDiscovery({
              id: 'resonance-1420-harmonic',
              type: 'anomaly',
              name: 'Resonance Harmonic (1420 kHz)',
              systemName: this.spaceScene.currentSystem?.name || 'Local Star',
              sector: { ...this.worldPosition.sector },
              timestamp: Date.now(),
              details: 'Unclassified prime harmonic interval detected across sub-space carrier wave.',
              category: 'ANOMALIES',
            });
          }
        }
      }

      // Update Autopilot orientation alignment
      if (this.autopilotController.isActive) {
        this.autopilotController.update(dt, shipPos);
      }

      // Update Interstellar Deep Cruise
      if (phase === FlightPhase.STELLAR_CRUISE && this.deepCruiseController.state.isActive) {
        this.deepCruiseController.update(dt, this.worldPosition);
        const p = Math.round(this.deepCruiseController.state.cruiseProgress * 100);
        const targetName = this.deepCruiseController.state.targetSystem?.name || 'DESTINATION';
        this.updateContextPrompt(`INTERSTELLAR CRUISE // TRANSIT TO ${targetName.toUpperCase()} [${p}%]`);
      }

      // Update Local Nav Radar
      if (this.navRadar && this.uiState === 'playing') {
        const podPos = this.spaceScene.activeCourierPod ? this.spaceScene.activeCourierPod.position : undefined;
        this.navRadar.setPlanets(this.spaceScene.activePlanetList, this.spaceScene.currentSystem?.anomalies || [], podPos);
        this.navRadar.update(shipPos, this.flightModel.quaternion, this.spaceScene.sunPos);
      }

      // Floating-Origin Rebasing check (keeps coordinates within 2500 units)
      const rebased = this.floatingOrigin.checkAndRebase(
        shipPos,
        this.worldPosition,
        []
      );
      if (rebased) {
        this.sectorManager.update(this.worldPosition);
        this.debugOverlay.setRebaseCount(this.floatingOrigin.rebaseCount);
        this.debugOverlay.setWorldPos(
          `Sector [${this.worldPosition.sector.x},${this.worldPosition.sector.y},${this.worldPosition.sector.z}]`
        );
      }

      // Periodic autosave (every 30 seconds)
      const nowMs = performance.now();
      if (nowMs - this.lastAutosaveTime > 30000 && this.uiState === 'playing') {
        this.lastAutosaveTime = nowMs;
        this.saveCurrentJourney();
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

    // Modal & Control Actions
    if (this.inputManager.consumeAction('map')) {
      audio.playBlip();
      this.holographicNavModal.toggle();
      if (this.holographicNavModal.getIsOpen()) {
        this.tutorialDirector.onPlayerOpenMap();
      }
    }

    if (this.inputManager.consumeAction('supply')) {
      audio.playBlip();
      this.openSupplyModal();
    }

    if (this.inputManager.consumeAction('journal')) {
      audio.playBlip();
      this.journalModal.toggle();
      if (this.journalModal.getIsOpen()) {
        this.tutorialDirector.onPlayerOpenJournal();
      }
    }

    if (this.inputManager.consumeAction('help')) {
      audio.playBlip();
      this.helpModal.toggle();
    }

    if (this.inputManager.consumeAction('cycle_target')) {
      audio.playBlip();
      this.navRadar.cycleTarget();
      const p = this.navRadar.getSelectedPlanet();
      if (p) {
        this.showHudNotice(`NAVIGATION TARGET // ${p.descriptor.name.toUpperCase()}`);
      }
    }

    if (this.inputManager.consumeAction('autopilot')) {
      audio.playBlip();
      // If course is set to another star system in star chart, engage Deep Cruise!
      if (this.holographicNavModal.activeCourseSystem && this.stateMachine.getPhase() === FlightPhase.SYSTEM_CRUISE) {
        this.engageInterstellarCruise(this.holographicNavModal.activeCourseSystem);
      } else {
        const active = this.autopilotController.toggle();
        if (active) {
          const targetDesc = this.autopilotController.currentTarget?.type === 'planet'
            ? this.autopilotController.currentTarget.descriptor.name
            : 'DESTINATION';
          this.showHudNotice(`AUTOPILOT ENGAGED // ALIGNING WITH ${targetDesc.toUpperCase()}`);
        } else {
          this.showHudNotice('AUTOPILOT DISENGAGED // MANUAL FLIGHT RESUMED');
        }
      }
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

  private async renderTitleScreen(): Promise<void> {
    this.uiState = 'title';
    this.hasSavedJourney = await saveManager.hasSavedJourney();

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
          margin: 0 0 44px 0;
          letter-spacing: 0.02em;
        ">
          A cosmic road trip into the gentle strange. No combat. No ticking clocks. Just silence, wonder, and the warm hum of your craft.
        </p>

        <div style="display: flex; flex-direction: column; gap: 14px; align-items: center;">
          ${
            this.hasSavedJourney
              ? `
            <button id="btn-continue" style="
              padding: 16px 54px;
              background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(14, 165, 233, 0.2));
              border: 1px solid rgba(56, 189, 248, 0.8);
              border-radius: 9999px;
              color: #f8fafc;
              font-size: 14px;
              font-weight: 600;
              letter-spacing: 0.2em;
              cursor: pointer;
              transition: all 0.25s ease;
              box-shadow: 0 0 35px rgba(56, 189, 248, 0.35);
              min-width: 260px;
            ">CONTINUE JOURNEY</button>
          `
              : ''
          }

          <button id="btn-begin" style="
            padding: ${this.hasSavedJourney ? '12px 42px' : '18px 54px'};
            background: ${this.hasSavedJourney ? 'rgba(30, 41, 59, 0.6)' : 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(56, 189, 248, 0.12))'};
            border: 1px solid ${this.hasSavedJourney ? 'rgba(148, 163, 184, 0.3)' : 'rgba(56, 189, 248, 0.65)'};
            border-radius: 9999px;
            color: ${this.hasSavedJourney ? '#cbd5e1' : '#f8fafc'};
            font-size: ${this.hasSavedJourney ? '12px' : '15px'};
            font-weight: 600;
            letter-spacing: 0.2em;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: 0 0 35px rgba(56, 189, 248, 0.25);
            min-width: 260px;
          ">${this.hasSavedJourney ? 'NEW JOURNEY' : 'BEGIN JOURNEY'}</button>
        </div>
      </div>
    `;

    this.uiContainer.querySelector('#btn-continue')?.addEventListener('click', async () => {
      await audio.start();
      audio.playTitleMusic();
      await this.loadSavedJourney();
      this.renderModeSelectScreen();
    });

    const btnBegin = this.uiContainer.querySelector('#btn-begin') as HTMLElement;
    btnBegin.addEventListener('click', async () => {
      await audio.start();
      audio.playTitleMusic();
      if (this.hasSavedJourney) {
        await saveManager.clearJourney();
        this.visitedSystems.clear();
        this.scannedPlanets.clear();
        this.visitedSurfaces.clear();
        this.discoveredSpecies.clear();
        this.discoveredAnomalies.clear();
        this.journeyStartTime = Date.now();
        this.tutorialDirector.reset();
      }
      await storage.updateSettings({ introSeen: true });
      this.renderModeSelectScreen();
    });
  }

  public async loadSavedJourney(): Promise<void> {
    const slot = await saveManager.getSaveSlot();
    if (!slot) return;

    // Restore player sector & local position
    this.worldPosition.sector.x = slot.playerSector.x;
    this.worldPosition.sector.y = slot.playerSector.y;
    this.worldPosition.sector.z = slot.playerSector.z;
    this.worldPosition.localOffset.set(slot.playerLocalPos.x, slot.playerLocalPos.y, slot.playerLocalPos.z);

    this.flightModel.position.set(slot.playerLocalPos.x, slot.playerLocalPos.y, slot.playerLocalPos.z);
    this.flightModel.velocity.set(0, 0, 0);

    // If a non-origin star system was active, load it into SpaceScene
    if (slot.currentSystem) {
      this.spaceScene.loadSystem(slot.currentSystem);
      this.navRadar.setPlanets(this.spaceScene.activePlanetList, slot.currentSystem.anomalies || []);
    }

    // Restore tutorial & narrative state
    if (slot.tutorial) {
      this.tutorialDirector.loadState(slot.tutorial as any);
    }
    if (slot.narrative) {
      this.narrativeDirector.loadNarrativeState(
        slot.narrative.triggeredEventIds || [],
        slot.narrative.resonanceFlags || []
      );
    }
    if (slot.targetSystem) {
      this.holographicNavModal.activeCourseSystem = slot.targetSystem;
    }

    // Restore v0.0.7 progression state
    this.credits = slot.credits ?? 0;
    this.sampleInventory = slot.sampleInventory ? { ...slot.sampleInventory } : {};
    this.installedModules = new Set(slot.installedModules || []);
    this.pendingOrders = slot.pendingOrders ? [...slot.pendingOrders] : [];
    this.npcMemories = slot.npcMemories ? { ...slot.npcMemories } : {};

    // Apply installed modules to ship models and flight dynamics
    this.applyInstalledModules();
  }

  public applyInstalledModules(): void {
    const modulesList = Array.from(this.installedModules);
    this.spaceScene.surveyCraft.setInstalledModules(modulesList);
    if (this.surfaceScene) {
      this.surfaceScene.surveyCraft.setInstalledModules(modulesList);
      if (this.installedModules.has('mod_surface_grav_stabilizer')) {
        this.surfaceScene.maxAltitudeAGL = 75.0;
      }
    }

    if (this.installedModules.has('mod_propulsion_ion_vector')) {
      this.flightModel.accelerationMultiplier = 1.35;
    } else {
      this.flightModel.accelerationMultiplier = 1.0;
    }
  }

  public async saveCurrentJourney(): Promise<void> {
    const flightTimeSec = Math.round((Date.now() - this.journeyStartTime) / 1000);

    const slot: PlayerSaveSlot = {
      slotId: 'current_journey',
      saveVersion: 4,
      updatedAt: Date.now(),
      universeSeed: this.sectorManager.universeSeed,
      playerSector: { ...this.worldPosition.sector },
      playerLocalPos: {
        x: this.flightModel.position.x,
        y: this.flightModel.position.y,
        z: this.flightModel.position.z,
      },
      currentSystem: this.spaceScene.currentSystem,
      targetSystem: this.holographicNavModal.activeCourseSystem,
      flightPhase: this.stateMachine.getPhase(),
      credits: this.credits,
      sampleInventory: { ...this.sampleInventory },
      installedModules: Array.from(this.installedModules),
      pendingOrders: [...this.pendingOrders],
      npcMemories: { ...this.npcMemories },
      stats: {
        systemsVisited: Math.max(1, this.visitedSystems.size),
        planetsScanned: this.scannedPlanets.size,
        surfacesVisited: this.visitedSurfaces.size,
        speciesDiscovered: this.discoveredSpecies.size,
        sentientDiscovered: Object.keys(this.npcMemories).length,
        loreLearned: Object.values(this.npcMemories).reduce((acc: number, m: any) => acc + (m.factsRevealed?.length || 0), 0),
        samplesCollected: Object.values(this.sampleInventory).reduce((acc: number, cnt: number) => acc + cnt, 0),
        modulesInstalled: this.installedModules.size,
        anomaliesDiscovered: this.discoveredAnomalies.size,
        flightTimeSeconds: flightTimeSec,
      },
      tutorial: this.tutorialDirector.getState(),
      narrative: {
        triggeredEventIds: this.narrativeDirector.getTriggeredEventIds(),
        resonanceFlags: this.narrativeDirector.getResonanceFlags(),
      },
    };

    await saveManager.saveJourney(slot);
    this.showSaveIndicator();
  }

  public recordArrivalDiscovery(system: StarSystemDescriptor): void {
    this.visitedSystems.add(system.id);

    saveManager.recordDiscovery({
      id: `system:${system.id}`,
      type: 'system',
      name: system.name,
      systemName: system.name,
      sector: { x: system.sectorX, y: system.sectorY, z: system.sectorZ },
      timestamp: Date.now(),
      details: `Stellar class ${system.star.spectralClass}. ${system.planets.length} orbital bodies surveyed.`,
      category: 'SYSTEMS',
    });
  }

  public recordSurfaceDiscovery(name: string, info: string): void {
    const planet = this.surfaceScene?.planet;
    const site = this.surfaceScene?.site;
    const planetName = planet?.name || 'Local World';
    const planetId = planet?.id || 'world';

    const isFauna = info.includes('Diet:') || info.includes('Temperament:');
    const isFlora = info.includes('Vegetation') || info.includes('Flora');

    let category: 'WORLDS' | 'LIFE' | 'ANOMALIES' = 'WORLDS';
    let id = `landmark:${planetId}:${name.toLowerCase().replace(/\s+/g, '_')}`;

    if (isFauna || isFlora) {
      category = 'LIFE';
      id = `species:${planetId}:${name.toLowerCase().replace(/\s+/g, '_')}`;
      this.discoveredSpecies.add(id);
    } else {
      id = `landmark:${planetId}:${name.toLowerCase().replace(/\s+/g, '_')}`;
    }

    saveManager.recordDiscovery({
      id,
      type: category === 'LIFE' ? 'flora' : 'landmark',
      name,
      systemName: this.spaceScene.currentSystem?.name || 'Aurelia',
      sector: { ...this.worldPosition.sector },
      timestamp: Date.now(),
      details: `${info} (Observed on ${planetName} in ${site?.name || 'regional sector'})`,
      category,
    });

    if (isFauna) {
      this.narrativeDirector.trigger('scanned_fauna', { name }, this.getNarrativeContext(), { forceOnce: true });
    } else if (isFlora) {
      this.narrativeDirector.trigger('scanned_flora', { name }, this.getNarrativeContext(), { forceOnce: true });
    } else {
      this.narrativeDirector.trigger('scanned_landmark', { name }, this.getNarrativeContext(), { forceOnce: true });
    }

    this.saveCurrentJourney();
  }

  public getNarrativeContext(): NarrativeContext {
    return {
      sector: { ...this.worldPosition.sector },
      currentSystemName: this.spaceScene.currentSystem?.name || 'Aurelia',
      flightPhase: this.stateMachine.getPhase(),
      systemsVisited: Math.max(1, this.visitedSystems.size),
      discoveriesCount: this.discoveredSpecies.size + this.discoveredAnomalies.size + this.scannedPlanets.size,
      resonanceFlags: this.narrativeDirector.getResonanceFlags(),
    };
  }

  public engageInterstellarCruise(targetSys: StarSystemDescriptor): void {
    const engaged = this.deepCruiseController.engage(targetSys, this.worldPosition);
    if (engaged) {
      this.showHudNotice(`WARP DRIVE CHARGING // HEADING SET TO ${targetSys.name.toUpperCase()}`);
      this.tutorialDirector.onPlayerEngageCruise(targetSys.name);
    }
  }

  private showSaveIndicator(): void {
    const el = this.uiContainer.querySelector('#hud-save-indicator') as HTMLElement;
    if (el) {
      el.style.opacity = '1';
      setTimeout(() => {
        el.style.opacity = '0';
      }, 1500);
    }
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

        ${!signalingUrl ? `
          <div style="
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.4);
            border-radius: 8px;
            padding: 10px 16px;
            margin-bottom: 20px;
            font-size: 12px;
            color: #fca5a5;
            text-align: center;
            max-width: 440px;
          ">
            <b>Signaling Server Unconfigured</b><br/>
            Live GitHub Pages requires a deployed Cloudflare Worker or custom WebSocket endpoint.
            <button id="btn-banner-diag" style="
              margin-top: 6px;
              background: #0284c7;
              border: none;
              color: white;
              padding: 4px 12px;
              border-radius: 4px;
              font-size: 11px;
              cursor: pointer;
            ">Open Diagnostics & Setup</button>
          </div>
        ` : `
          <div id="pairing-status-text" style="font-size: 13px; color: #cbd5e1; margin-bottom: 20px;">
            Waiting for phone connection...
          </div>
        `}

        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
          <button id="btn-open-diagnostics" style="
            padding: 10px 18px;
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 8px;
            color: #38bdf8;
            font-size: 13px;
            cursor: pointer;
          ">⚙️ DIAGNOSTICS</button>

          <button id="btn-cancel-pairing" style="
            padding: 10px 18px;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 8px;
            color: #cbd5e1;
            font-size: 13px;
            cursor: pointer;
          ">CANCEL</button>

          <button id="btn-play-keyboard-fallback" style="
            padding: 10px 18px;
            background: rgba(14, 165, 233, 0.2);
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 8px;
            color: #f8fafc;
            font-size: 13px;
            cursor: pointer;
          ">KEYBOARD INSTEAD</button>
        </div>
      </div>
    `;

    const canvas = this.uiContainer.querySelector('#qr-canvas') as HTMLCanvasElement;
    if (canvas) {
      await QRCode.toCanvas(canvas, companionUrl, { width: 200, margin: 1 });
    }

    const openDiag = () => {
      new CompanionDiagnosticsModal({
        signalingClient: this.signaling,
        peerManager: this.peer,
        onReconnect: () => {
          this.cancelPairing();
          this.renderPairingScreen();
        },
        onClose: () => {},
      });
    };

    this.uiContainer.querySelector('#btn-banner-diag')?.addEventListener('click', openDiag);
    this.uiContainer.querySelector('#btn-open-diagnostics')?.addEventListener('click', openDiag);

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
    this.tutorialDirector.setInputMode(mode);
    if (!this.tutorialDirector.isComplete()) {
      this.tutorialDirector.start();
    }
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

          <div style="display: flex; gap: 10px; align-items: center;">
            <div id="hud-save-indicator" style="
              font-family: ui-monospace, monospace;
              font-size: 10px;
              letter-spacing: 0.1em;
              color: #4ade80;
              opacity: 0;
              transition: opacity 0.3s ease;
            ">● SAVED</div>

            <button id="btn-open-chart" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(56, 189, 248, 0.35);
              border-radius: 8px;
              color: #38bdf8;
              padding: 7px 14px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">MAP [M]</button>

            <button id="btn-open-supply" style="
              background: rgba(16, 185, 129, 0.15);
              border: 1px solid rgba(52, 211, 153, 0.4);
              border-radius: 8px;
              color: #34d399;
              padding: 7px 14px;
              font-size: 11px;
              font-weight: 700;
              cursor: pointer;
            ">SUPPLY [U]</button>

            <button id="btn-open-journal" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(148, 163, 184, 0.25);
              border-radius: 8px;
              color: #cbd5e1;
              padding: 7px 14px;
              font-size: 11px;
              cursor: pointer;
            ">LOG [J]</button>

            <button id="btn-open-help" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(148, 163, 184, 0.25);
              border-radius: 8px;
              color: #cbd5e1;
              padding: 7px 14px;
              font-size: 11px;
              cursor: pointer;
            ">HELP [H]</button>

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
          <!-- Telemetry readouts -->
          <div id="hud-telemetry-bar" style="
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(56, 189, 248, 0.25);
            padding: 4px 14px;
            border-radius: 12px;
            font-family: ui-monospace, monospace;
            font-size: 11px;
            color: #94a3b8;
          ">
            <span>SPD: <strong id="telemetry-speed" style="color: #38bdf8;">0</strong> m/s</span>
            <span>THR: <strong id="telemetry-throttle" style="color: #38bdf8;">0%</strong></span>
            <span>CREDITS: <strong id="telemetry-credits" style="color: #34d399;">${this.credits}</strong></span>
          </div>

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
            ${mode === 'keyboard' ? 'W/S Pitch · A/D Yaw · Q/E Roll · Shift/Ctrl Throttle · Space Scan · U Supply' : 'Steer with Companion Joystick · Adjust Throttle · Press SCAN · Tap SUPPLY'}
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

    this.uiContainer.querySelector('#btn-open-chart')?.addEventListener('click', () => {
      audio.playBlip();
      this.holographicNavModal.toggle();
    });

    this.uiContainer.querySelector('#btn-open-supply')?.addEventListener('click', () => {
      audio.playBlip();
      this.openSupplyModal();
    });

    this.uiContainer.querySelector('#btn-open-journal')?.addEventListener('click', () => {
      audio.playBlip();
      this.journalModal.toggle();
    });

    this.uiContainer.querySelector('#btn-open-help')?.addEventListener('click', () => {
      audio.playBlip();
      this.helpModal.toggle();
    });

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

  public collectSurveySample(node: any): void {
    if (!this.surfaceScene) return;
    const collected = this.surfaceScene.resourceManager.collectNode(node.id);
    if (!collected) return;

    audio.playConnectChime();
    this.credits += collected.creditValue;
    this.sampleInventory[collected.category] = (this.sampleInventory[collected.category] || 0) + 1;

    saveManager.recordDiscovery({
      id: `sample:${collected.id}`,
      type: 'resource',
      name: `${collected.name} (${collected.category})`,
      systemName: this.spaceScene.currentSystem?.name || 'Local Star',
      sector: { ...this.worldPosition.sector },
      timestamp: Date.now(),
      details: `${collected.description} Valued at ${collected.creditValue} survey credits.`,
      category: 'RESOURCES',
    });

    this.showHudNotice(`SAMPLE CATALOGUED: ${collected.name.toUpperCase()} (+${collected.creditValue} CREDITS)`);
    this.saveCurrentJourney();
  }

  public startGiantConversation(npc: NPCIdentity): void {
    this.activeNPCInConversation = npc;
    const memory = this.npcMemories[npc.npcId];
    const timesMet = memory ? memory.timesMet : 0;

    const turn = StructuredConversationProvider.startConversation(npc, timesMet);
    this.dialoguePresenter.showInteractiveConversation(turn.speakerName, turn.text, turn.choices);

    // Record or update memory
    if (!this.npcMemories[npc.npcId]) {
      this.npcMemories[npc.npcId] = {
        npcId: npc.npcId,
        speciesId: npc.speciesId,
        name: npc.name,
        timesMet: 1,
        lastMet: Date.now(),
        topicsDiscussed: [],
        factsRevealed: [],
        familiarity: 0.2,
      };

      saveManager.recordDiscovery({
        id: `giant:${npc.npcId}`,
        type: 'sentient',
        name: `${npc.name} (${npc.title})`,
        systemName: this.spaceScene.currentSystem?.name || 'Local Star',
        sector: { ...this.worldPosition.sector },
        timestamp: Date.now(),
        details: `Sentient giant of this world. Personality: ${npc.personality}. Currently observing: ${npc.currentConcern}`,
        category: 'PEOPLES',
      });
    } else {
      this.npcMemories[npc.npcId].timesMet++;
      this.npcMemories[npc.npcId].lastMet = Date.now();
      this.npcMemories[npc.npcId].familiarity = Math.min(1.0, this.npcMemories[npc.npcId].familiarity + 0.2);
    }

    this.saveCurrentJourney();
  }

  public handleConversationChoice(topic: string): void {
    if (!this.activeNPCInConversation) return;

    const npc = this.activeNPCInConversation;
    const memory = this.npcMemories[npc.npcId];
    if (memory && !memory.topicsDiscussed.includes(topic)) {
      memory.topicsDiscussed.push(topic);
    }

    const turn = StructuredConversationProvider.handleChoice(npc, topic);
    this.dialoguePresenter.showInteractiveConversation(turn.speakerName, turn.text, turn.choices);

    if (turn.revealedLoreTitle && turn.revealedLoreContent) {
      if (memory && !memory.factsRevealed.includes(turn.revealedLoreTitle)) {
        memory.factsRevealed.push(turn.revealedLoreTitle);
      }

      saveManager.recordDiscovery({
        id: `lore:${npc.npcId}:${topic}`,
        type: 'lore',
        name: turn.revealedLoreTitle,
        systemName: this.spaceScene.currentSystem?.name || 'Local Star',
        sector: { ...this.worldPosition.sector },
        timestamp: Date.now(),
        details: turn.revealedLoreContent,
        category: 'LORE',
      });

      this.showHudNotice(`LORE DISCOVERED: ${turn.revealedLoreTitle.toUpperCase()}`);
      this.saveCurrentJourney();
    }

    if (topic === 'farewell' || turn.choices.length === 0) {
      this.activeNPCInConversation = null;
    }
  }

  public openSupplyModal(): void {
    const slot: PlayerSaveSlot = {
      slotId: 'current_journey',
      saveVersion: 4,
      updatedAt: Date.now(),
      universeSeed: this.sectorManager.universeSeed,
      playerSector: { ...this.worldPosition.sector },
      playerLocalPos: {
        x: this.flightModel.position.x,
        y: this.flightModel.position.y,
        z: this.flightModel.position.z,
      },
      currentSystem: this.spaceScene.currentSystem,
      targetSystem: this.holographicNavModal.activeCourseSystem,
      flightPhase: this.stateMachine.getPhase(),
      credits: this.credits,
      sampleInventory: { ...this.sampleInventory },
      installedModules: Array.from(this.installedModules),
      pendingOrders: [...this.pendingOrders],
      npcMemories: { ...this.npcMemories },
      stats: {
        systemsVisited: Math.max(1, this.visitedSystems.size),
        planetsScanned: this.scannedPlanets.size,
        surfacesVisited: this.visitedSurfaces.size,
        speciesDiscovered: this.discoveredSpecies.size,
        sentientDiscovered: Object.keys(this.npcMemories).length,
        loreLearned: Object.values(this.npcMemories).reduce((acc: number, m: any) => acc + (m.factsRevealed?.length || 0), 0),
        samplesCollected: Object.values(this.sampleInventory).reduce((acc: number, cnt: number) => acc + cnt, 0),
        modulesInstalled: this.installedModules.size,
        anomaliesDiscovered: this.discoveredAnomalies.size,
        flightTimeSeconds: Math.round((Date.now() - this.journeyStartTime) / 1000),
      },
      tutorial: this.tutorialDirector.getState(),
      narrative: {
        triggeredEventIds: this.narrativeDirector.getTriggeredEventIds(),
        resonanceFlags: this.narrativeDirector.getResonanceFlags(),
      },
    };

    this.supplyModal.show(slot);
  }

  public handleModuleOrder(mod: ShipModule): void {
    if (this.credits < mod.costCredits) return;

    // Check & deduct samples
    for (const req of mod.sampleRequirements) {
      const avail = this.sampleInventory[req.category] || 0;
      if (avail < req.count) return;
    }

    this.credits -= mod.costCredits;
    for (const req of mod.sampleRequirements) {
      this.sampleInventory[req.category] -= req.count;
    }

    const order = {
      orderId: `order_${Date.now()}_${mod.id}`,
      moduleId: mod.id,
      orderedAt: Date.now(),
      deliveryEtaSec: 8,
      destinationSystemName: this.spaceScene.currentSystem?.name || 'Local System',
      status: 'IN_TRANSIT' as const,
    };

    this.pendingOrders.push(order);
    audio.playConnectChime();
    this.showHudNotice(`REQUISITION TRANSMITTED: ${mod.name.toUpperCase()} // COURIER POD DISPATCHED`);
    this.saveCurrentJourney();
  }

  public updateCourierDelivery(shipPos: any): void {
    const now = Date.now();

    // Check pending orders arriving in space
    for (const order of this.pendingOrders) {
      if (order.status === 'IN_TRANSIT') {
        const elapsedSec = (now - order.orderedAt) / 1000;
        if (elapsedSec >= order.deliveryEtaSec && !this.spaceScene.activeCourierPod) {
          order.status = 'ARRIVED';
          const spawnOffset = new THREE.Vector3(70, 15, -90);
          const spawnPos = (shipPos as THREE.Vector3).clone().add(spawnOffset);
          this.spaceScene.spawnCourierPod(order, spawnPos);
          this.showHudNotice(`COURIER POD INCOMING // SUB-SPACE DELIVERY CAPSULE ARRIVED NEARBY`);
          audio.playConnectChime();
        }
      }
    }

    // Check docking range with active courier pod
    if (this.spaceScene.activeCourierPod) {
      const pod = this.spaceScene.activeCourierPod;
      const dist = shipPos.distanceTo ? shipPos.distanceTo(pod.position) : 999;

      if (dist < 45) {
        this.updateContextPrompt(`DOCKING CORRIDOR ALIGNED: COURIER POD [${Math.round(dist)}m] // SPACE TO DOCK & INSTALL`);
        if (this.inputManager.consumeAction('scan') || this.inputManager.consumeAction('confirm') || this.inputManager.consumeAction('interact')) {
          this.dockCourierPod(pod);
        }
      }
    }
  }

  private dockCourierPod(pod: any): void {
    const modId = pod.order.moduleId;
    this.installedModules.add(modId);

    // Update order status
    const o = this.pendingOrders.find((p) => p.orderId === pod.order.orderId);
    if (o) o.status = 'INSTALLED';

    this.spaceScene.removeCourierPod();
    this.applyInstalledModules();
    audio.playConnectChime();
    this.showHudNotice(`MODULE INTEGRATION COMPLETE: ${modId.toUpperCase()}`);
    this.saveCurrentJourney();
  }

  public dispose(): void {
    this.isRunning = false;
    if (this.peer) this.peer.dispose();
  }
}
