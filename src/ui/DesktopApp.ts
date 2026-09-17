import * as THREE from 'three';
import { audio } from '../audio/AudioEngine';
import { storage } from '../persistence/StorageManager';
import { InputManager } from '../game/input/InputManager';
import { TouchControls, isTouchDevice } from '../game/input/TouchControls';
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
import { TitleRevealSequence } from './TitleRevealSequence';
import { NewJourneyCinematic } from './NewJourneyCinematic';
import { ExpeditionBriefing } from './ExpeditionBriefing';
import { ShipEmoteDirector, type EmoteType } from '../game/scenes/ShipEmoteDirector';
import type { NPCIdentity } from '../game/ecology/SentientSpeciesProfile';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';

export type UIState = 'title' | 'playing' | 'cinematic';

export class DesktopApp {
  private container: HTMLElement;
  private uiContainer: HTMLElement;
  private canvasContainer: HTMLElement;

  private renderer!: GameRenderer;
  private spaceScene!: SpaceScene;
  public shipEmoteDirector!: ShipEmoteDirector;
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
  public collectedCreditIds = new Set<string>();
  public sampleInventory: Record<string, number> = {};
  public installedModules = new Set<string>();
  public pendingOrders: any[] = [];
  public npcMemories: Record<string, any> = {};
  public activeNPCInConversation: NPCIdentity | null = null;
  private journeyStartTime = Date.now();

  // F3 Debug Telemetry Overlay
  private debugTelemetryVisible = false;
  private debugTelemetryEl: HTMLElement | null = null;

  private hasSavedJourney = false;
  private lastAutosaveTime = 0;

  private touchControls: TouchControls | null = null;

  private uiState: UIState = 'title';
  private lastTime = performance.now();
  private isRunning = false;
  private isTitleRevealActive = true;
  private lastDeflectionSoundTime = 0;
  private currentControlMode: 'keyboard' | 'touch' = 'keyboard';
  private newJourneyCinematic!: NewJourneyCinematic;
  private audioUnlocked = false;

  // In-Space Minimal Warp Countdown HUD
  private inSpaceWarpCountdownTimer: number | null = null;
  private inSpaceWarpCountdownTarget: StarSystemDescriptor | null = null;
  private inSpaceWarpCountdownValue = 0;
  private inSpaceWarpCountdownEl: HTMLElement | null = null;
  private lastCourierPodState: string | null = null;

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
    this.setupDebugKeyListeners();
    this.setupAudioUnlockListeners();

    // 3-Second Live Title Reveal Sequence on page load
    const titleSequence = new TitleRevealSequence(this.container);
    titleSequence.play(() => {
      this.isTitleRevealActive = false;
      this.renderTitleScreen();
    });
  }

  public getUiState(): UIState {
    return this.uiState;
  }

  private initGameEngine(): void {
    this.renderer = new GameRenderer(this.canvasContainer);
    this.spaceScene = new SpaceScene();
    this.shipEmoteDirector = new ShipEmoteDirector();
    this.spaceScene.scene.add(this.shipEmoteDirector.group);

    this.flightModel = new FlightModel(this.spaceScene.shipGroup, this.spaceScene.physics, this.approachController);
    this.inputManager = new InputManager();
    this.debugOverlay = new DebugOverlay();

    // Register floating-origin rebase listener
    this.floatingOrigin.registerListener({
      onRebase: (offset) => {
        this.flightModel.onRebase(offset, this.renderer.camera);
        this.spaceScene.onRebase(offset);
        this.shipEmoteDirector.onRebase(offset);
        this.approachController.onRebase(offset);
        this.navRadar?.onRebase(offset);
      },
    });

    // 1. Narrative & Dialogue Subsystems
    this.dialoguePresenter = new DialoguePresenter(this.canvasContainer);
    this.narrativeDirector = new NarrativeDirector(this.dialoguePresenter);
    this.tutorialDirector = new TutorialDirector(this.narrativeDirector, () => this.getNarrativeContext());
    this.tutorialDirector.setCallbacks((prompt) => this.updateContextPrompt(prompt || ''));

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
      audio.setSystemGenome(targetSys.seed || 42000);
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
        this.startInSpaceWarpCountdown(targetSys);
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

    // 5. Cinematic Director
    this.newJourneyCinematic = new NewJourneyCinematic(this.container);

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

      // Update controls context
      this.updateControlContext(to);
    });

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private gameLoop(time: number): void {
    if (!this.isRunning) return;

    if (this.isTitleRevealActive) {
      this.lastTime = time;
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    const dt = Math.max(0.001, Math.min((time - this.lastTime) * 0.001, 0.05));
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
    this.shipEmoteDirector.update(dt);

    if (this.uiState === 'cinematic' && this.newJourneyCinematic.getIsPlaying()) {
      // Cinematic Intro Camera Directing
      this.newJourneyCinematic.update(dt, this.renderer.camera);
      const shipPos = this.flightModel.position;
      this.spaceScene.update(dt, shipPos, this.renderer.camera.position, 0.2, 0, 0);
      this.renderer.render(this.spaceScene.scene);
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

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

      // Handle Fly-Through Credit Pickup Events
      if (res.collectedCredits && res.collectedCredits.length > 0) {
        for (const pickup of res.collectedCredits) {
          this.credits += pickup.amount;
          this.collectedCreditIds.add(pickup.id);
          audio.playBlip();
          this.showHudNotice(`+${pickup.amount} SC // SURVEY DATA MOTE DIGITIZED`);
        }
        if (crEl) crEl.textContent = `${this.credits}`;
        this.saveCurrentJourney();
      }

      // Update Local Nav Radar with surface targets (Data motes & Sentient encounter beacons)
      if (this.navRadar && this.uiState === 'playing') {
        const encounterSites = this.surfaceScene.faunaPopulationManager.encounterSites.map(s => ({
          position: s.position,
          name: s.name,
        }));
        this.navRadar.setSurfaceTargets(res.nearestCreditPickups, encounterSites);
        this.navRadar.update(
          this.surfaceScene.shipPosition,
          this.surfaceScene.shipPhysicsRoot.quaternion,
          new THREE.Vector3(400, 600, 300),
          1200
        );
      }

      // Handle F3 Debug Telemetry Overlay Updates
      if (this.debugTelemetryVisible) {
        this.updateDebugTelemetryOverlay(this.surfaceScene.debugTelemetry);
      }

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
          this.updateContextPrompt(`SENTIENT CONTACT: ${res.activeScanTarget.name.toUpperCase()} // SPACE — COMMUNICATE`);
        } else {
          this.updateContextPrompt(`PROXIMITY: ${res.activeScanTarget.name} // SPACE TO SCAN`);
        }
      } else {
        const atmo = this.surfaceScene.currentAtmosphereState;
        const atmoInfo = atmo ? ` · ${atmo.localTimeFormatted} [${atmo.phase}] · WX: ${atmo.weather.replace('_', ' ')}` : '';
        this.updateContextPrompt(`SURFACE EXPLORATION${atmoInfo} // Q/E: ALTITUDE · F3: TELEMETRY · ESC: ORBIT`);
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

      // Relativistic camera FOV expansion strictly during warp drive
      if (this.spaceScene.warpFactor > 0.01) {
        const targetFov = 65 + this.spaceScene.warpFactor * 26;
        if (Math.abs(this.renderer.camera.fov - targetFov) > 0.05) {
          this.renderer.camera.fov = THREE.MathUtils.lerp(this.renderer.camera.fov, targetFov, dt * 5.0);
          this.renderer.camera.updateProjectionMatrix();
        }
      }

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
      this.updateCourierDelivery(shipPos, dt);

      // Check for ambient traffic comms chatter
      if (this.spaceScene.lastCommsHail) {
        const hail = this.spaceScene.lastCommsHail;
        this.spaceScene.lastCommsHail = null;
        this.showHudNotice(hail);
        audio.playConnectChime();
      }

      const scanReach = this.installedModules.has('mod_scanner_deep_ecology') ? 280 : 140;

      // Forward vector for heading-weighted approach prioritization
      const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.flightModel.quaternion);

      // Check Approach Controller for planets (strictly disabled while in deep cruise)
      const targetPlanet = (!this.deepCruiseController.state.isActive && phase !== FlightPhase.STELLAR_CRUISE)
        ? this.approachController.update(shipPos, this.spaceScene.activePlanetList, shipForward)
        : null;
      if (targetPlanet) {
        if (phase !== FlightPhase.PLANET_APPROACH) {
          this.stateMachine.transitionTo(FlightPhase.PLANET_APPROACH);
        }
        this.updateApproachHUD(targetPlanet);

        // Contextual SPACE action: Inspect Planet when in orbital reach
        if (targetPlanet.canInspect && this.inputManager.consumeAction('scan')) {
          this.engageOrbit(targetPlanet);
        } else if (
          targetPlanet.distance <= targetPlanet.planet.radius * 1.25 &&
          phase !== FlightPhase.ENTRY &&
          phase !== FlightPhase.SURFACE_FLIGHT
        ) {
          // Automatic atmospheric capture: flying directly into the upper atmosphere safely enters orbit
          this.showHudNotice(`ATMOSPHERIC PENETRATION DETECTED // ORBITAL INSERTION SYNCHRONIZED`);
          this.engageOrbit(targetPlanet);
        }
      } else {
        if (phase === FlightPhase.PLANET_APPROACH) {
          this.stateMachine.transitionTo(FlightPhase.SYSTEM_CRUISE);
        }
        this.clearApproachHUD();

        // Check for nearby cosmic space encounters
        const nearbyEncounter = this.spaceScene.encounterManager?.getNearbyEncounter(shipPos, scanReach);
        if (nearbyEncounter && !nearbyEncounter.isScanned) {
          const encDist = Math.round(nearbyEncounter.position.distanceTo(shipPos));
          this.updateContextPrompt(`PROXIMITY: ${nearbyEncounter.name} [${encDist}m] // SPACE TO SCAN & HARVEST`);
        }

        // Normal Scanner pulse in free space
        if (this.inputManager.consumeAction('scan')) {
          this.spaceScene.triggerScan(shipPos);
          audio.playScanEffect();
          this.tutorialDirector.onPlayerScan();

          // Check if scanning a nearby cosmic encounter
          const enc = this.spaceScene.encounterManager?.getNearbyEncounter(shipPos, scanReach);
          if (enc && !enc.isScanned) {
            enc.isScanned = true;
            this.credits += enc.rewardCredits;
            if (enc.rewardSampleCategory) {
              this.sampleInventory[enc.rewardSampleCategory] = (this.sampleInventory[enc.rewardSampleCategory] || 0) + 1;
            }
            audio.playConnectChime();
            const sampleNotice = enc.rewardSampleCategory ? ` · +1 ${enc.rewardSampleCategory} SAMPLE` : '';
            this.showHudNotice(`DISCOVERY: ${enc.name} // +${enc.rewardCredits} CREDITS${sampleNotice}`);
            saveManager.recordDiscovery({
              id: enc.id,
              type: 'anomaly',
              name: enc.name,
              systemName: this.spaceScene.currentSystem?.name || 'Deep Space',
              sector: { ...this.worldPosition.sector },
              timestamp: Date.now(),
              details: enc.logSnippet,
              category: 'ANOMALIES',
            });
            this.saveCurrentJourney();
          } else {
            this.showHudNotice('SCAN INITIATED — ACOUSTIC RESONANCE EMITTED');
          }

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
      if (this.deepCruiseController.state.isActive) {
        this.deepCruiseController.update(dt, this.worldPosition);
        const p = Math.round(this.deepCruiseController.state.cruiseProgress * 100);
        const targetName = this.deepCruiseController.state.targetSystem?.name || 'DESTINATION';
        this.updateContextPrompt(`INTERSTELLAR CRUISE // TRANSIT TO ${targetName.toUpperCase()} [${p}%]`);
      }

      // Update Local Nav Radar
      if (this.navRadar && this.uiState === 'playing') {
        const podId = this.spaceScene.activeCourierPod ? this.spaceScene.activeCourierPod.order.orderId : null;
        if (podId !== this.lastCourierPodState) {
          this.lastCourierPodState = podId;
          const podPos = this.spaceScene.activeCourierPod ? this.spaceScene.activeCourierPod.position : undefined;
          this.navRadar.setPlanets(this.spaceScene.activePlanetList, this.spaceScene.currentSystem?.anomalies || [], podPos);
        }
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

      // Handle F3 Debug Telemetry Overlay in Space
      if (this.debugTelemetryVisible) {
        this.updateDebugTelemetryOverlay(null);
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
      const phase = this.stateMachine.getPhase();
      if (this.holographicNavModal.activeCourseSystem && phase !== FlightPhase.SURFACE_FLIGHT && phase !== FlightPhase.STELLAR_CRUISE) {
        this.startInSpaceWarpCountdown(this.holographicNavModal.activeCourseSystem);
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
      this.surfaceScene = new SurfaceScene(
        this.orbitController.planet!,
        selectedSite,
        Array.from(this.collectedCreditIds)
      );
      this.stateMachine.transitionTo(FlightPhase.SURFACE_FLIGHT);
      audio.setPlanetGenome(this.orbitController.planet!.seed, this.orbitController.planet);
      this.renderSurfaceHUD();
      this.showHudNotice(`ATMOSPHERIC PENETRATION COMPLETE // COMMENCING HOVER RECONNAISSANCE`);
    }, 2200);
  }

  private returnToOrbitFromSurface(): void {
    this.stateMachine.transitionTo(FlightPhase.ASCENT);
    this.showHudNotice('SUB-ORBITAL ASCENT THRUSTERS ENGAGED');
    if (this.debugTelemetryEl) {
      this.debugTelemetryEl.style.display = 'none';
    }

    setTimeout(() => {
      if (this.surfaceScene) {
        this.surfaceScene.dispose();
        this.surfaceScene = null;
      }
      this.stateMachine.transitionTo(FlightPhase.ORBIT);
      audio.setSystemGenome(this.spaceScene.currentSystem?.seed || 42000);
      this.renderOrbitInspectionHUD();
      this.showHudNotice('ORBITAL ALTITUDE RESTORED');
    }, 1800);
  }

  private leaveOrbitToSpace(): void {
    this.orbitController.leaveOrbit();
    this.stateMachine.transitionTo(FlightPhase.SYSTEM_CRUISE);
    audio.setSystemGenome(this.spaceScene.currentSystem?.seed || 42000);
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

  private updateControlContext(phase: FlightPhase): void {
    if (phase === FlightPhase.SURFACE_FLIGHT) {
      this.touchControls?.setContext('surface');
    } else {
      this.touchControls?.setContext('space');
    }
  }

  private setupAudioUnlockListeners(): void {
    const unlockAudio = async () => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      try {
        await audio.start();
        audio.playTitleOverture();
        const hint = document.getElementById('audio-unlock-hint');
        if (hint) hint.style.opacity = '0';
      } catch (err) {
        console.warn('[DesktopApp] Audio unlock prevented:', err);
      }
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
  }

  private async renderTitleScreen(): Promise<void> {
    this.uiState = 'title';
    this.hasSavedJourney = await saveManager.hasSavedJourney();

    this.uiContainer.innerHTML = `
      <style>
        @media (max-height: 520px) {
          #title-screen-container h1 {
            font-size: clamp(20px, 4.8vw, 36px) !important;
            margin: 0 0 6px 0 !important;
          }
          #title-screen-container p {
            font-size: 11px !important;
            line-height: 1.4 !important;
            margin: 0 0 16px 0 !important;
            max-width: 480px !important;
          }
          #title-screen-container .title-kicker {
            font-size: 9px !important;
            letter-spacing: 0.2em !important;
            margin-bottom: 6px !important;
          }
          #title-screen-container button {
            padding: 8px 28px !important;
            font-size: 11px !important;
            min-width: 220px !important;
          }
        }
      </style>
      <div id="title-screen-container" style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: radial-gradient(circle at 50% 50%, rgba(13, 21, 39, 0.45) 0%, rgba(3, 3, 7, 0.8) 100%);
        opacity: 0;
        padding: 0 16px;
        box-sizing: border-box;
        transition: opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1);
      ">
        <div class="title-kicker" style="
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
              padding: 16px 56px;
              background: linear-gradient(135deg, rgba(56, 189, 248, 0.4), rgba(14, 165, 233, 0.25));
              border: 1.5px solid rgba(56, 189, 248, 0.9);
              border-radius: 9999px;
              color: #f8fafc;
              font-size: 14px;
              font-weight: 700;
              letter-spacing: 0.2em;
              cursor: pointer;
              transition: all 0.25s ease;
              box-shadow: 0 0 40px rgba(56, 189, 248, 0.45);
              min-width: 280px;
            ">CONTINUE JOURNEY</button>
          `
              : ''
          }

          <button id="btn-begin" style="
            padding: ${this.hasSavedJourney ? '12px 44px' : '18px 60px'};
            background: ${this.hasSavedJourney ? 'rgba(30, 41, 59, 0.65)' : 'linear-gradient(135deg, rgba(14, 165, 233, 0.5), rgba(56, 189, 248, 0.3))'};
            border: ${this.hasSavedJourney ? '1px solid rgba(148, 163, 184, 0.35)' : '1.5px solid rgba(56, 189, 248, 0.95)'};
            border-radius: 9999px;
            color: ${this.hasSavedJourney ? '#94a3b8' : '#ffffff'};
            font-size: ${this.hasSavedJourney ? '12px' : '15px'};
            font-weight: ${this.hasSavedJourney ? '600' : '700'};
            letter-spacing: 0.22em;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: ${this.hasSavedJourney ? 'none' : '0 0 50px rgba(56, 189, 248, 0.55), inset 0 0 20px rgba(56, 189, 248, 0.2)'};
            min-width: 280px;
          ">${this.hasSavedJourney ? 'NEW JOURNEY' : 'START NEW GAME'}</button>
        </div>

        <div id="audio-unlock-hint" style="
          margin-top: 28px;
          font-family: ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          color: #38bdf8;
          opacity: ${this.audioUnlocked ? '0' : '0.75'};
          transition: opacity 0.4s ease;
        ">
          CLICK ANYWHERE FOR TITLE OVERTURE
        </div>
      </div>
    `;

    const titleCard = this.uiContainer.querySelector('#title-screen-container') as HTMLElement;
    if (titleCard) {
      requestAnimationFrame(() => {
        titleCard.style.opacity = '1';
      });
    }

    if (this.audioUnlocked) {
      audio.playTitleMusic();
    }

    const titleReadyTime = Date.now() + 450;

    this.uiContainer.querySelector('#btn-continue')?.addEventListener('click', async () => {
      if (Date.now() < titleReadyTime) return;
      audio.playBlip();
      await audio.start();
      await this.loadSavedJourney();
      this.enterFlightMode();
    });

    const btnBegin = this.uiContainer.querySelector('#btn-begin') as HTMLElement;
    btnBegin.addEventListener('click', async () => {
      if (Date.now() < titleReadyTime) return;
      audio.playBlip();
      await audio.start();
      audio.setContext('cinematic');
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

      // Trigger 18-second in-engine New Journey Cinematic with shooting stars
      this.uiState = 'cinematic';
      this.uiContainer.innerHTML = '';
      this.newJourneyCinematic.play(
        this.flightModel.position,
        () => {
          const briefing = new ExpeditionBriefing(this.container);
          briefing.show(() => {
            this.enterFlightMode();
          });
        },
        this.spaceScene.scene
      );
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
      audio.setSystemGenome(slot.currentSystem.seed || 42000);
      this.flightModel.setPhysicsSystem(this.spaceScene.physics);
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
    this.collectedCreditIds = new Set(slot.collectedCreditIds || []);
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
        this.surfaceScene.maxAltitudeAGL = 95.0;
      } else {
        this.surfaceScene.maxAltitudeAGL = 40.0;
      }
      if (this.installedModules.has('mod_survey_mote_magnet')) {
        this.surfaceScene.creditPickupManager.pickupRadius = 14.0;
        this.surfaceScene.creditPickupManager.magnetismRadius = 85.0;
      } else {
        this.surfaceScene.creditPickupManager.pickupRadius = 6.5;
        this.surfaceScene.creditPickupManager.magnetismRadius = 16.0;
      }
    }

    if (this.installedModules.has('mod_propulsion_ion_vector')) {
      this.flightModel.accelerationMultiplier = 1.35;
      this.flightModel.turnRateMultiplier = 1.35;
    } else {
      this.flightModel.accelerationMultiplier = 1.0;
      this.flightModel.turnRateMultiplier = 1.0;
    }

    if (this.installedModules.has('mod_sublight_overdrive')) {
      this.flightModel.maxCruiseSpeedMultiplier = 1.5;
    } else {
      this.flightModel.maxCruiseSpeedMultiplier = 1.0;
    }

    if (this.installedModules.has('mod_warp_harmonic_field')) {
      this.deepCruiseController.state.cruiseDuration = 6.0;
    } else {
      this.deepCruiseController.state.cruiseDuration = 10.0;
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
      collectedCreditIds: Array.from(this.collectedCreditIds),
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

  public startInSpaceWarpCountdown(targetSys: StarSystemDescriptor): void {
    this.abortInSpaceWarpCountdown();
    this.inSpaceWarpCountdownTarget = targetSys;
    this.inSpaceWarpCountdownValue = 5;

    // Create or show minimal in-space HUD pill at the bottom of the screen
    if (!this.inSpaceWarpCountdownEl) {
      this.inSpaceWarpCountdownEl = document.createElement('div');
      this.inSpaceWarpCountdownEl.id = 'hud-inspace-warp-countdown';
      this.inSpaceWarpCountdownEl.style.cssText = `
        position: absolute;
        bottom: clamp(32px, 8vh, 60px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 2000;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 24px;
        background: rgba(3, 7, 18, 0.88);
        border: 1px solid rgba(56, 189, 248, 0.5);
        border-radius: 9999px;
        backdrop-filter: blur(12px);
        box-shadow: 0 0 30px rgba(56, 189, 248, 0.25);
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: #f8fafc;
        transition: all 0.2s ease;
      `;
      this.uiContainer.appendChild(this.inSpaceWarpCountdownEl);
    }

    const renderPill = () => {
      if (!this.inSpaceWarpCountdownEl) return;
      this.inSpaceWarpCountdownEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 10px #38bdf8;"></span>
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: #38bdf8; text-transform: uppercase;">
            WARP DRIVE CHARGING
          </span>
        </div>
        <div style="font-size: 12px; color: #cbd5e1; font-family: ui-monospace, monospace; border-left: 1px solid rgba(56, 189, 248, 0.3); padding-left: 14px;">
          TARGET: <strong style="color: #f8fafc;">${targetSys.name.toUpperCase()}</strong>
        </div>
        <div id="inspace-warp-digit" style="
          font-size: 20px;
          font-weight: 800;
          color: #38bdf8;
          font-family: ui-monospace, monospace;
          background: rgba(56, 189, 248, 0.15);
          padding: 2px 14px;
          border-radius: 6px;
          border: 1px solid rgba(56, 189, 248, 0.4);
          text-shadow: 0 0 12px rgba(56, 189, 248, 0.8);
        ">
          ${this.inSpaceWarpCountdownValue}
        </div>
        <button id="inspace-warp-abort-btn" style="
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #fca5a5;
          border-radius: 9999px;
          padding: 4px 12px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          cursor: pointer;
        ">ABORT [ESC]</button>
      `;

      this.inSpaceWarpCountdownEl.querySelector('#inspace-warp-abort-btn')?.addEventListener('click', () => {
        this.abortInSpaceWarpCountdown();
      });
    };

    this.inSpaceWarpCountdownEl.style.display = 'flex';
    renderPill();
    audio.playWarpCountdownTick(5);

    this.inSpaceWarpCountdownTimer = window.setInterval(() => {
      this.inSpaceWarpCountdownValue--;

      if (this.inSpaceWarpCountdownValue > 0) {
        renderPill();
        audio.playWarpCountdownTick(this.inSpaceWarpCountdownValue);
      } else {
        const target = this.inSpaceWarpCountdownTarget;
        this.abortInSpaceWarpCountdown();
        if (target) {
          audio.playWarpEntry();
          this.engageInterstellarCruise(target);
        }
      }
    }, 1000);
  }

  public abortInSpaceWarpCountdown(): void {
    if (this.inSpaceWarpCountdownTimer !== null) {
      clearInterval(this.inSpaceWarpCountdownTimer);
      this.inSpaceWarpCountdownTimer = null;
    }
    if (this.inSpaceWarpCountdownEl) {
      this.inSpaceWarpCountdownEl.style.display = 'none';
    }
    if (this.inSpaceWarpCountdownTarget) {
      audio.playBlip();
      this.showHudNotice('WARP SEQUENCE ABORTED');
      this.inSpaceWarpCountdownTarget = null;
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

  private async enterFlightMode(mode: 'keyboard' | 'touch' = 'keyboard'): Promise<void> {
    this.uiState = 'playing';
    try {
      await audio.start();
    } catch {}
    audio.stopTitleOverture();
    audio.setContext('cruise');

    const isTouch = isTouchDevice() || (typeof window !== 'undefined' && window.innerWidth <= 1024);
    const activeMode = isTouch ? 'touch' : mode;
    this.currentControlMode = activeMode;

    this.tutorialDirector.setInputMode(activeMode);
    if (!this.tutorialDirector.isComplete()) {
      this.tutorialDirector.start();
    }
    this.renderFlightHUD(activeMode);

    // Initialize & display on-screen touch controls if on mobile, tablet, or touch screen
    if (isTouch) {
      if (!this.touchControls) {
        this.touchControls = new TouchControls(this.uiContainer, this.inputManager.getTouchSource());
        this.touchControls.setOnEmote((type) => this.triggerShipEmote(type));
      }
      this.touchControls.show();
      const phase = this.stateMachine.getPhase();
      this.touchControls.setContext(phase === FlightPhase.SURFACE_FLIGHT ? 'surface' : 'space');
    }
  }

  private renderFlightHUD(mode: 'keyboard' | 'touch' = 'keyboard'): void {
    const isTouch = mode === 'touch' || isTouchDevice();
    this.uiContainer.innerHTML = `
      <style>
        #desktop-emote-drawer button:hover {
          filter: brightness(1.2);
        }
        @media (max-width: 850px), (max-height: 520px) {
          #hud-telemetry-bar {
            padding: 3px 8px !important;
            gap: 6px !important;
            font-size: 9.5px !important;
          }
          .hud-title-brand {
            font-size: 9.5px !important;
            letter-spacing: 0.15em !important;
          }
        }
      </style>
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: max(10px, env(safe-area-inset-top, 10px)) max(14px, env(safe-area-inset-right, 14px)) max(10px, env(safe-area-inset-bottom, 10px)) max(14px, env(safe-area-inset-left, 14px));
        box-sizing: border-box;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, sans-serif;
      ">
        <!-- Top HUD Header Strip -->
        <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: auto; gap: 8px; width: 100%;">
          <div class="hud-title-brand" style="font-size: 11px; letter-spacing: 0.22em; color: #38bdf8; font-weight: 600; white-space: nowrap;">
            THE QUIET BETWEEN STARS
          </div>

          <!-- Top-Center Telemetry Readout -->
          <div style="display: flex; align-items: center; gap: 8px; position: relative;">
            <div id="hud-telemetry-bar" style="
              display: flex;
              align-items: center;
              gap: 10px;
              background: rgba(15, 23, 42, 0.82);
              border: 1px solid rgba(56, 189, 248, 0.3);
              padding: 4px 12px;
              border-radius: 9999px;
              font-family: ui-monospace, monospace;
              font-size: 10.5px;
              color: #94a3b8;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
              white-space: nowrap;
            ">
              <span>SPD: <strong id="telemetry-speed" style="color: #38bdf8;">0</strong> m/s</span>
              <span>THR: <strong id="telemetry-throttle" style="color: #38bdf8;">0%</strong></span>
              <span>CREDITS: <strong id="telemetry-credits" style="color: #34d399;">${this.credits}</strong></span>
            </div>

            <!-- Desktop Radio Emote Drawer Trigger & Popover -->
            <div id="desktop-emote-container" style="display: ${isTouch ? 'none' : 'block'}; position: relative;">
              <button id="btn-desktop-emote-toggle" style="
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.4);
                color: #38bdf8;
                padding: 4px 10px;
                border-radius: 9999px;
                font-family: ui-monospace, monospace;
                font-size: 10.5px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
              ">
                <span>📡 RADIO [C] ▾</span>
              </button>

              <div id="desktop-emote-drawer" style="
                display: none;
                position: absolute;
                top: calc(100% + 6px);
                left: 50%;
                transform: translateX(-50%);
                background: rgba(10, 16, 28, 0.95);
                border: 1px solid rgba(56, 189, 248, 0.4);
                border-radius: 12px;
                padding: 6px 10px;
                gap: 6px;
                align-items: center;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.8), 0 0 16px rgba(56, 189, 248, 0.2);
                backdrop-filter: blur(12px);
                z-index: 500;
                white-space: nowrap;
              ">
                <button id="btn-desktop-emote-wave" style="
                  background: rgba(250, 204, 21, 0.15);
                  border: 1px solid rgba(250, 204, 21, 0.4);
                  border-radius: 6px;
                  color: #fde047;
                  padding: 3px 8px;
                  font-size: 11px;
                  cursor: pointer;
                " title="Wave [1]">👋 [1]</button>
                <button id="btn-desktop-emote-heart" style="
                  background: rgba(244, 63, 94, 0.15);
                  border: 1px solid rgba(244, 63, 94, 0.4);
                  border-radius: 6px;
                  color: #fda4af;
                  padding: 3px 8px;
                  font-size: 11px;
                  cursor: pointer;
                " title="Heart [2]">💖 [2]</button>
                <button id="btn-desktop-emote-peace" style="
                  background: rgba(56, 189, 248, 0.15);
                  border: 1px solid rgba(56, 189, 248, 0.4);
                  border-radius: 6px;
                  color: #7dd3fc;
                  padding: 3px 8px;
                  font-size: 11px;
                  cursor: pointer;
                " title="Peace [3]">✌️ [3]</button>
                <button id="btn-desktop-emote-close" style="
                  background: none;
                  border: none;
                  color: #94a3b8;
                  font-size: 12px;
                  padding: 2px 5px;
                  cursor: pointer;
                ">✕</button>
              </div>
            </div>
          </div>

          <!-- Top-Right Actions & Utilities -->
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: nowrap;">
            <div id="hud-save-indicator" style="
              font-family: ui-monospace, monospace;
              font-size: 10px;
              letter-spacing: 0.1em;
              color: #4ade80;
              opacity: 0;
              transition: opacity 0.3s ease;
            ">● SAVED</div>

            ${!isTouch ? `
              <button id="btn-open-chart" style="
                background: rgba(15, 23, 42, 0.75);
                border: 1px solid rgba(56, 189, 248, 0.35);
                border-radius: 8px;
                color: #38bdf8;
                padding: 5px 10px;
                font-size: 10.5px;
                font-weight: 600;
                cursor: pointer;
                touch-action: manipulation;
              ">MAP [M]</button>

              <button id="btn-open-supply" style="
                background: rgba(16, 185, 129, 0.15);
                border: 1px solid rgba(52, 211, 153, 0.4);
                border-radius: 8px;
                color: #34d399;
                padding: 5px 10px;
                font-size: 10.5px;
                font-weight: 700;
                cursor: pointer;
                touch-action: manipulation;
              ">STORE [U]</button>

              <button id="btn-open-journal" style="
                background: rgba(15, 23, 42, 0.75);
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 8px;
                color: #cbd5e1;
                padding: 5px 10px;
                font-size: 10.5px;
                cursor: pointer;
                touch-action: manipulation;
              ">LOG [J]</button>
            ` : ''}

            <button id="btn-open-help" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(148, 163, 184, 0.25);
              border-radius: 8px;
              color: #cbd5e1;
              padding: 5px 10px;
              font-size: 10.5px;
              cursor: pointer;
              touch-action: manipulation;
            ">${isTouch ? 'HELP' : 'HELP [H]'}</button>

            <button id="btn-audio-mute" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(148, 163, 184, 0.25);
              border-radius: 8px;
              color: #cbd5e1;
              padding: 5px 10px;
              font-size: 10.5px;
              cursor: pointer;
              touch-action: manipulation;
            ">${audio.getIsMuted() ? '🔇' : '🔊'}</button>

            <!-- Minimal Non-Intrusive Fullscreen Toggle -->
            <button id="btn-toggle-fullscreen" style="
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid rgba(56, 189, 248, 0.35);
              border-radius: 8px;
              color: #38bdf8;
              padding: 5px 10px;
              font-size: 12px;
              cursor: pointer;
              touch-action: manipulation;
              display: flex;
              align-items: center;
              justify-content: center;
            " title="Toggle Fullscreen">⛶</button>
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
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(56, 189, 248, 0.4);
            padding: 7px 20px;
            border-radius: 20px;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            max-width: min(640px, 90vw);
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
          "></div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px;">
          <div id="hud-controls-hint" style="
            font-size: 11px;
            color: #64748b;
            line-height: 1.6;
            font-family: ui-monospace, monospace;
            display: ${isTouch ? 'none' : 'block'};
          ">
            W/S Pitch · A/D Yaw · Q/E Roll · Hold Shift Accelerate · Space Scan/Tractor · 1, 2, 3 Radio Emotes · U Store · M Map
          </div>

          <div id="hud-mode-pill" style="
            display: ${isTouch ? 'none' : 'flex'};
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
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #38bdf8;"></span>
            <span>KEYBOARD & FLIGHT ACTIVE</span>
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

    // Desktop Emote Drawer Toggle & Close
    const desktopDrawer = this.uiContainer.querySelector('#desktop-emote-drawer') as HTMLElement;
    const desktopToggle = this.uiContainer.querySelector('#btn-desktop-emote-toggle');
    desktopToggle?.addEventListener('click', () => {
      if (desktopDrawer) {
        const isHidden = desktopDrawer.style.display === 'none' || !desktopDrawer.style.display;
        desktopDrawer.style.display = isHidden ? 'flex' : 'none';
      }
    });

    this.uiContainer.querySelector('#btn-desktop-emote-close')?.addEventListener('click', () => {
      if (desktopDrawer) desktopDrawer.style.display = 'none';
    });

    this.uiContainer.querySelector('#btn-desktop-emote-wave')?.addEventListener('click', () => {
      this.triggerShipEmote('wave');
      if (desktopDrawer) desktopDrawer.style.display = 'none';
    });

    this.uiContainer.querySelector('#btn-desktop-emote-heart')?.addEventListener('click', () => {
      this.triggerShipEmote('heart');
      if (desktopDrawer) desktopDrawer.style.display = 'none';
    });

    this.uiContainer.querySelector('#btn-desktop-emote-peace')?.addEventListener('click', () => {
      this.triggerShipEmote('peace');
      if (desktopDrawer) desktopDrawer.style.display = 'none';
    });

    this.uiContainer.querySelector('#btn-audio-mute')?.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      const btn = this.uiContainer.querySelector('#btn-audio-mute') as HTMLButtonElement;
      if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
    });

    // Minimal Fullscreen Toggle
    const updateFsIcon = () => {
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      const btn = this.uiContainer.querySelector('#btn-toggle-fullscreen') as HTMLButtonElement;
      if (btn) {
        btn.innerHTML = isFs ? '🗗' : '⛶';
        btn.title = isFs ? 'Exit Fullscreen' : 'Toggle Fullscreen';
      }
    };

    this.uiContainer.querySelector('#btn-toggle-fullscreen')?.addEventListener('click', async () => {
      audio.playBlip();
      try {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          } else if ((document.documentElement as any).webkitRequestFullscreen) {
            await (document.documentElement as any).webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          }
        }
      } catch (err) {
        console.warn('[DesktopApp] Fullscreen error:', err);
      }
      updateFsIcon();
    });

    document.addEventListener('fullscreenchange', updateFsIcon);
    document.addEventListener('webkitfullscreenchange', updateFsIcon);
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

  public showHudNotice(text: string, durationMs = 3200): void {
    const el = this.uiContainer.querySelector('#hud-notice') as HTMLElement;
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    setTimeout(() => {
      if (el && el.textContent === text) el.style.opacity = '0';
    }, durationMs);
  }

  public triggerShipEmote(type: EmoteType): void {
    if (!this.shipEmoteDirector) return;
    const playerPos = this.flightModel ? this.flightModel.position : new THREE.Vector3();
    const result = this.shipEmoteDirector.broadcastPlayerEmote(
      type,
      playerPos,
      this.spaceScene?.trafficDirector
    );
    this.showHudNotice(result.commNotice, result.responseReceived ? 5000 : 3500);
    if (result.responseReceived) {
      audio.playConnectChime();
    }
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
      collectedCreditIds: Array.from(this.collectedCreditIds),
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

  public updateCourierDelivery(shipPos: any, dt = 0.016): void {
    const now = Date.now();

    // Check pending orders arriving in space
    for (const order of this.pendingOrders) {
      if (order.status === 'IN_TRANSIT') {
        const elapsedSec = (now - order.orderedAt) / 1000;
        if (elapsedSec >= order.deliveryEtaSec && !this.spaceScene.activeCourierPod) {
          order.status = 'ARRIVED';
          const spawnOffset = new THREE.Vector3(45, 12, -65);
          const spawnPos = (shipPos as THREE.Vector3).clone().add(spawnOffset);
          this.spaceScene.spawnCourierPod(order, spawnPos);
          this.showHudNotice(`COURIER POD INCOMING // SUB-SPACE DELIVERY CAPSULE ARRIVED NEARBY`);
          audio.playConnectChime();
        }
      }
    }

    // Check docking & tractor range with active courier pod
    if (this.spaceScene.activeCourierPod) {
      const pod = this.spaceScene.activeCourierPod;
      const dist = shipPos.distanceTo ? shipPos.distanceTo(pod.position) : 999;

      if (dist <= 18) {
        // Auto-dock & integrate
        this.dockCourierPod(pod);
      } else if (dist < 140) {
        this.updateContextPrompt(`COURIER POD LOCKED [${Math.round(dist)}m] // HOLD SPACE OR TRACTOR BUTTON (PULL CAPSULE)`);
        if (this.inputManager.isActionPressed('scan') || this.inputManager.isActionPressed('confirm') || this.inputManager.isActionPressed('interact') || this.inputManager.isActionPressed('tractor')) {
          pod.applyTractorPull(shipPos, dt);
        }
      } else {
        this.updateContextPrompt(`COURIER POD BEACON DETECTED [${Math.round(dist)}m] // APPROACH FOR TRACTOR LOCK`);
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

  private setupDebugKeyListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (this.inSpaceWarpCountdownTimer !== null) {
          e.preventDefault();
          this.abortInSpaceWarpCountdown();
        }
      }
      if (e.key === 'F3' || e.code === 'F3') {
        e.preventDefault();
        this.debugTelemetryVisible = !this.debugTelemetryVisible;
        if (!this.debugTelemetryVisible && this.debugTelemetryEl) {
          this.debugTelemetryEl.style.display = 'none';
        }
        if (this.debugTelemetryVisible) {
          this.showHudNotice(`DEBUG TELEMETRY ${this.debugTelemetryVisible ? 'ACTIVE [F3]' : 'OFF'}`);
        }
      }
      if (e.key === 'c' || e.key === 'C') {
        const desktopDrawer = this.uiContainer.querySelector('#desktop-emote-drawer') as HTMLElement;
        if (desktopDrawer) {
          const isHidden = desktopDrawer.style.display === 'none' || !desktopDrawer.style.display;
          desktopDrawer.style.display = isHidden ? 'flex' : 'none';
        }
      }
      if (e.key === '1' || e.code === 'Digit1') {
        this.triggerShipEmote('wave');
        const desktopDrawer = this.uiContainer.querySelector('#desktop-emote-drawer') as HTMLElement;
        if (desktopDrawer) desktopDrawer.style.display = 'none';
      } else if (e.key === '2' || e.code === 'Digit2') {
        this.triggerShipEmote('heart');
        const desktopDrawer = this.uiContainer.querySelector('#desktop-emote-drawer') as HTMLElement;
        if (desktopDrawer) desktopDrawer.style.display = 'none';
      } else if (e.key === '3' || e.code === 'Digit3') {
        this.triggerShipEmote('peace');
        const desktopDrawer = this.uiContainer.querySelector('#desktop-emote-drawer') as HTMLElement;
        if (desktopDrawer) desktopDrawer.style.display = 'none';
      }
      if (e.key === 't' || e.key === 'T') {
        if (this.uiState === 'playing' && this.navRadar && this.stateMachine.getPhase() !== FlightPhase.SURFACE_FLIGHT) {
          const locked = this.navRadar.selectTargetInForwardView(this.flightModel.position, this.flightModel.quaternion);
          if (locked) {
            audio.playBlip();
            const target = this.navRadar.getSelectedTarget();
            if (target) {
              this.showHudNotice(`TARGET LOCKED // ${target.name.toUpperCase()}`);
            }
          }
        }
      }
    });
  }

  private updateDebugTelemetryOverlay(data: any): void {
    if (!this.debugTelemetryEl) {
      this.debugTelemetryEl = document.createElement('div');
      this.debugTelemetryEl.id = 'debug-flight-telemetry';
      this.debugTelemetryEl.style.cssText = `
        position: fixed;
        top: 60px;
        left: 24px;
        background: rgba(3, 7, 18, 0.88);
        border: 1px solid rgba(56, 189, 248, 0.5);
        border-radius: 8px;
        padding: 12px 16px;
        color: #e0f2fe;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        z-index: 1000;
        pointer-events: none;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        min-width: 300px;
      `;
      this.container.appendChild(this.debugTelemetryEl);
    }

    this.debugTelemetryEl.style.display = 'block';

    if (this.stateMachine.getPhase() === FlightPhase.SURFACE_FLIGHT) {
      this.debugTelemetryEl.innerHTML = `
        <div style="color: #38bdf8; font-weight: 700; border-bottom: 1px solid rgba(56, 189, 248, 0.3); padding-bottom: 4px; margin-bottom: 6px;">
          SURFACE CORRIDOR TELEMETRY [F3]
        </div>
        <div>Pos XZ: <span style="color: #f8fafc;">${data.shipPos.x.toFixed(1)}, ${data.shipPos.z.toFixed(1)}</span></div>
        <div>Ship Y (Alt): <span style="color: #f8fafc;">${data.shipPos.y.toFixed(2)}m</span></div>
        <div>Ground (Under): <span style="color: #94a3b8;">${data.groundHeight.toFixed(2)}m</span></div>
        <div>Anticipated Ground: <span style="color: #94a3b8;">${data.anticipatedGround.toFixed(2)}m</span></div>
        <div>Actual AGL: <span style="color: #4ade80;">${data.actualAGL.toFixed(2)}m</span></div>
        <div>Desired AGL: <span style="color: #38bdf8;">${data.desiredAGL.toFixed(1)}m</span></div>
        <div>Vert Velocity: <span style="color: ${data.verticalVelocity >= 0 ? '#4ade80' : '#f87171'};">${data.verticalVelocity.toFixed(2)} m/s</span></div>
        <div>Vert Accel: <span style="color: #cbd5e1;">${data.verticalAcceleration.toFixed(2)} m/s²</span></div>
        <div>Horizontal Speed: <span style="color: #facc15;">${data.speedMps} m/s</span></div>
        <div>Terrain Assist: <span style="color: ${data.terrainAssistActive ? '#38bdf8' : '#64748b'};">${data.terrainAssistActive ? 'ACTIVE [CREST CLIMB]' : 'STANDBY'}</span></div>
        <div>Local Time: <span style="color: #facc15;">${this.surfaceScene?.currentAtmosphereState?.localTimeFormatted || '--:--'} (${this.surfaceScene?.currentAtmosphereState?.phase || 'MIDDAY'})</span></div>
        <div>Weather: <span style="color: #67e8f9;">${this.surfaceScene?.currentAtmosphereState?.weather.replace('_', ' ') || 'CLEAR'}</span></div>
        <div>Frame dt: <span style="color: #64748b;">${(data.dt * 1000).toFixed(1)} ms</span></div>
      `;
    } else {
      const q = this.flightModel.quaternion;
      const vq = this.flightModel.shipVisualRoot.quaternion;
      const telem = this.flightModel.telemetry;
      this.debugTelemetryEl.innerHTML = `
        <div style="color: #38bdf8; font-weight: 700; border-bottom: 1px solid rgba(56, 189, 248, 0.3); padding-bottom: 4px; margin-bottom: 6px;">
          SPACE ARCADE FLIGHT TELEMETRY [F3]
        </div>
        <div>Speed: <span style="color: #facc15;">${Math.round(this.flightModel.getSpeed())} m/s</span></div>
        <div>Throttle: <span style="color: #38bdf8;">${Math.round(this.flightModel.getThrottle() * 100)}%</span></div>
        <div>Phys Quat: <span style="color: #94a3b8;">[${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}, ${q.w.toFixed(2)}]</span></div>
        <div>Vis Bank Quat: <span style="color: #94a3b8;">[${vq.x.toFixed(2)}, ${vq.y.toFixed(2)}, ${vq.z.toFixed(2)}, ${vq.w.toFixed(2)}]</span></div>
        <div>Angular Delta: <span style="color: ${telem.angleDeltaDeg > 35 ? '#f87171' : '#4ade80'};">${telem.angleDeltaDeg.toFixed(2)}°/frame</span></div>
        <div>Yaw Rate: <span style="color: #cbd5e1;">${telem.yawRate.toFixed(2)} rad/s</span></div>
        <div>Pitch Rate: <span style="color: #cbd5e1;">${telem.pitchRate.toFixed(2)} rad/s</span></div>
        <div>Roll Rate: <span style="color: #cbd5e1;">${telem.rollRate.toFixed(2)} rad/s</span></div>
        <div>Horizon Up Dot: <span style="color: #38bdf8;">${telem.cameraUpDotWorldUp.toFixed(3)}</span></div>
        <div>Discontinuity: <span style="color: ${telem.hasDiscontinuity ? '#f87171' : '#4ade80'};">${telem.hasDiscontinuity ? 'DETECTED (>45°)' : 'NONE (STABLE)'}</span></div>
      `;
    }
  }

  public dispose(): void {
    this.isRunning = false;
    this.abortInSpaceWarpCountdown();
    if (this.inSpaceWarpCountdownEl) this.inSpaceWarpCountdownEl.remove();
    if (this.touchControls) this.touchControls.dispose();
    if (this.debugTelemetryEl) this.debugTelemetryEl.remove();
  }
}
