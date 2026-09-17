import * as THREE from 'three';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';
import type { WorldPosition } from '../game/universe/WorldPosition';
import type { SectorManager } from '../game/universe/SectorManager';
import type { StarSystemSummary } from '../game/systems/StarSystemSummary';
import { audio } from '../audio/AudioEngine';

export type HolographicScale = 'GALACTIC' | 'STELLAR' | 'SYSTEM';

interface StarNodeItem {
  mesh: THREE.Mesh;
  hitbox: THREE.Mesh;
  system: StarSystemDescriptor | StarSystemSummary;
  worldRelPos: THREE.Vector3;
  distanceLy: number;
}

export class HolographicNavModal {
  private container: HTMLElement;
  private canvasContainer: HTMLElement;
  private detailsPanel: HTMLElement;
  private destinationsListEl!: HTMLElement;
  private countdownOverlayEl!: HTMLElement;
  private isVisible = false;

  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;

  private sectorManager: SectorManager;
  private playerWorldPos: WorldPosition;
  private onSelectDestination: (system: StarSystemDescriptor) => void;
  private onCourseSetCallback: ((system: StarSystemDescriptor) => void) | null = null;

  public currentScale: HolographicScale = 'STELLAR';
  public selectedSystem: StarSystemDescriptor | null = null;
  public activeCourseSystem: StarSystemDescriptor | null = null;

  // Shared persistent geometries & materials
  private sharedStarGeo = new THREE.SphereGeometry(2.2, 16, 16);
  private sharedRingGeo = new THREE.RingGeometry(4.0, 4.6, 32);
  private sharedOriginGeo = new THREE.SphereGeometry(2.0, 16, 16);
  private sharedOriginRingGeo: THREE.RingGeometry;
  private sharedHitboxGeo = new THREE.SphereGeometry(7.0, 8, 8);
  private sharedHitboxMat = new THREE.MeshBasicMaterial({ visible: false });
  private sharedStemMat = new THREE.LineBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  private batchedStemGeo: THREE.BufferGeometry | null = null;
  private nodeMaterials: THREE.Material[] = [];
  private systemMaterials: THREE.Material[] = [];
  private systemGeometries: THREE.BufferGeometry[] = [];

  // Interaction & Raycasting state
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private animId: number | null = null;
  private isDisposed = false;

  // Window event listeners
  private handleWindowResize = (): void => {
    if (this.isVisible) this.resize();
  };
  private handleWindowKeydown = (e: KeyboardEvent): void => {
    if (!this.isVisible) return;
    if (e.key === 'Escape') {
      if (this.countdownInterval !== null) {
        this.abortCountdown();
      } else {
        this.close();
      }
    }
  };

  // 3D Scene Groups
  private gridGroup = new THREE.Group();
  private originGroup = new THREE.Group();
  private starNodesGroup = new THREE.Group();
  private trajectoryGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();
  private systemOrbitGroup = new THREE.Group();

  private starNodes: StarNodeItem[] = [];

  // Visual highlight elements
  private targetReticleGroup = new THREE.Group();
  private highlightHaloMesh!: THREE.Mesh;
  private trajectoryLine!: THREE.Line;

  // Camera Orbit Controls
  private camDistance = 180;
  private camAzimuth = 0.4;
  private camElevation = 0.55;
  private targetCamLook = new THREE.Vector3(0, 0, 0);
  private currentCamLook = new THREE.Vector3(0, 0, 0);
  private isDragging = false;
  private prevMouseX = 0;
  private prevMouseY = 0;

  // Countdown timer state
  private countdownInterval: number | null = null;
  private countdownValue = 5;

  constructor(
    parent: HTMLElement,
    sectorManager: SectorManager,
    playerWorldPos: WorldPosition,
    onSelectDestination: (system: StarSystemDescriptor) => void,
    _deprecatedRenderer?: unknown
  ) {
    this.sectorManager = sectorManager;
    this.playerWorldPos = playerWorldPos;
    this.onSelectDestination = onSelectDestination;

    this.container = document.createElement('div');
    this.container.id = 'holographic-nav-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: radial-gradient(circle at 50% 50%, rgba(5, 9, 18, 0.98) 0%, rgba(2, 3, 6, 0.99) 100%);
      display: none;
      flex-direction: column;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      user-select: none;
    `;

    this.container.innerHTML = `
      <!-- Header -->
      <div class="holo-header" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 24px;
        border-bottom: 1px solid rgba(56, 189, 248, 0.25);
        background: rgba(10, 16, 28, 0.85);
      ">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div>
            <div class="holo-kicker" style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">INTERSTELLAR CARTOGRAPHY</div>
            <h2 class="holo-title" style="font-size: 17px; font-weight: 400; margin: 2px 0 0 0; letter-spacing: 0.05em;">Star Chart & Warp Navigation</h2>
          </div>

          <div style="display: flex; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 6px; padding: 2px;">
            <button id="holo-btn-stellar" style="padding: 4px 12px; background: #0284c7; border: none; border-radius: 4px; color: white; font-size: 10.5px; cursor: pointer; font-weight: 500;">STELLAR CHART</button>
            <button id="holo-btn-system" style="padding: 4px 12px; background: transparent; border: none; border-radius: 4px; color: #94a3b8; font-size: 10.5px; cursor: pointer;">ORBITAL SYSTEM</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="holo-help-text" style="font-size: 11px; color: #64748b; font-family: ui-monospace, monospace;">
            DRAG TO ROTATE // SCROLL TO ZOOM
          </div>
          <button id="holo-btn-close" style="
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 6px;
            color: #e2e8f0;
            padding: 5px 14px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">CLOSE [M]</button>
        </div>
      </div>

      <!-- Responsive Style for Mobile & Tablet -->
      <style>
        @media (max-width: 850px), (max-height: 520px) {
          .holo-header {
            padding: 6px 12px !important;
          }
          .holo-kicker {
            display: none !important;
          }
          .holo-title {
            font-size: 13px !important;
          }
          .holo-help-text {
            display: none !important;
          }
          #holo-btn-stellar, #holo-btn-system {
            padding: 3px 8px !important;
            font-size: 9.5px !important;
          }
          #holo-destinations-sidebar {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            bottom: 0 !important;
            width: min(280px, 78vw) !important;
            flex: none !important;
            z-index: 50 !important;
            transform: translateX(-100%);
            transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            background: rgba(8, 13, 22, 0.98) !important;
            box-shadow: 10px 0 30px rgba(0, 0, 0, 0.85) !important;
          }
          #holo-destinations-sidebar.drawer-open {
            transform: translateX(0) !important;
          }
          #holo-dest-toggle-btn {
            display: flex !important;
          }
          #holo-details-panel {
            position: absolute !important;
            right: 0 !important;
            top: 0 !important;
            bottom: 0 !important;
            width: min(300px, 80vw) !important;
            flex: none !important;
            z-index: 60 !important;
            transform: translateX(100%);
            transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            background: rgba(8, 13, 22, 0.98) !important;
            box-shadow: -10px 0 30px rgba(0, 0, 0, 0.85) !important;
            padding: 14px !important;
          }
          #holo-details-panel.drawer-open {
            transform: translateX(0) !important;
          }
        }
      </style>

      <!-- Main Body: Sidebar + 3D Viewport + Inspector -->
      <div style="display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden;">
        <!-- Left Destinations Sidebar -->
        <div id="holo-destinations-sidebar" style="
          flex: 0 0 280px;
          width: 280px;
          background: rgba(8, 13, 22, 0.92);
          border-right: 1px solid rgba(56, 189, 248, 0.15);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          z-index: 10;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <span style="font-size: 11px; letter-spacing: 0.15em; color: #38bdf8; font-weight: 600;">REACHABLE DESTINATIONS</span>
            <button id="holo-dest-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 2px 6px;">✕</button>
          </div>
          <div id="holo-destinations-list" style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Center 3D Holographic Canvas -->
        <div id="holo-canvas-container" style="flex: 1; position: relative; overflow: hidden; min-width: 0; cursor: grab;">
          <!-- Floating Destinations Toggle Pill for Mobile/Tablet -->
          <button id="holo-dest-toggle-btn" style="
            display: none;
            position: absolute;
            top: 12px;
            left: 12px;
            z-index: 25;
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(56, 189, 248, 0.45);
            color: #38bdf8;
            padding: 5px 12px;
            border-radius: 9999px;
            font-family: ui-monospace, monospace;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.05em;
            cursor: pointer;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          ">📍 DESTINATIONS ▾</button>

          <!-- 3D Overlay Help Tag -->
          <div style="position: absolute; bottom: 16px; left: 16px; pointer-events: none; font-size: 11px; color: rgba(148, 163, 184, 0.7); font-family: ui-monospace, monospace;">
            CURRENT SECTOR: [${this.playerWorldPos.sector.x}, ${this.playerWorldPos.sector.y}, ${this.playerWorldPos.sector.z}]
          </div>
        </div>

        <!-- Right Selected Target Inspector Panel -->
        <div id="holo-details-panel" style="
          flex: 0 0 340px;
          width: 340px;
          background: rgba(8, 13, 22, 0.95);
          border-left: 1px solid rgba(56, 189, 248, 0.18);
          padding: 24px;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          overflow-y: auto;
          z-index: 10;
        "></div>
      </div>

      <!-- Holographic Warp Countdown Overlay -->
      <div id="holo-warp-countdown" style="
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(2, 4, 10, 0.88);
        backdrop-filter: blur(12px);
        z-index: 2100;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      ">
        <div style="font-size: 12px; letter-spacing: 0.35em; color: #38bdf8; text-transform: uppercase; font-weight: 600;">
          WARP DRIVE CHARGING
        </div>
        <div id="holo-countdown-target-name" style="font-size: 24px; font-weight: 300; margin: 10px 0 20px 0; color: #f8fafc; letter-spacing: 0.05em;">
          TARGET: ALPHA CENTAURI
        </div>
        <div id="holo-countdown-digit" style="
          font-size: 100px;
          font-weight: 800;
          color: #38bdf8;
          font-family: ui-monospace, monospace;
          line-height: 1;
          margin-bottom: 24px;
          text-shadow: 0 0 35px rgba(56, 189, 248, 0.9);
          transition: transform 0.15s ease;
        ">
          5
        </div>
        <div style="font-size: 12px; color: #94a3b8; font-family: ui-monospace, monospace; margin-bottom: 32px; letter-spacing: 0.15em;">
          ALIGNING GRAVITON EMITTER & TUNING WARP BUBBLE...
        </div>
        <button id="holo-countdown-abort" style="
          padding: 10px 24px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.6);
          border-radius: 6px;
          color: #fca5a5;
          font-size: 12px;
          letter-spacing: 0.1em;
          font-weight: 600;
          cursor: pointer;
        ">ABORT WARP [ESC]</button>
      </div>
    `;

    parent.appendChild(this.container);

    this.canvasContainer = this.container.querySelector('#holo-canvas-container') as HTMLElement;
    this.detailsPanel = this.container.querySelector('#holo-details-panel') as HTMLElement;
    this.destinationsListEl = this.container.querySelector('#holo-destinations-list') as HTMLElement;
    this.countdownOverlayEl = this.container.querySelector('#holo-warp-countdown') as HTMLElement;

    this.sharedOriginRingGeo = new THREE.RingGeometry(3.6, 4.2, 32);
    this.sharedOriginRingGeo.rotateX(Math.PI / 2);

    // Three.js holographic scene setup
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020306, 0.0018);

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    this.updateCameraOrbit();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.canvasContainer.appendChild(this.renderer.domElement);

    // Add Scene Layers
    this.scene.add(this.gridGroup);
    this.scene.add(this.originGroup);
    this.scene.add(this.starNodesGroup);
    this.scene.add(this.trajectoryGroup);
    this.scene.add(this.highlightGroup);
    this.scene.add(this.systemOrbitGroup);

    this.buildCartographyGrid();
    this.buildSelectionHighlight();
    this.setupEvents();
  }

  /**
   * Build clean holographic polar distance grid on the reference plane
   */
  private buildCartographyGrid(): void {
    while (this.gridGroup.children.length > 0) {
      this.gridGroup.remove(this.gridGroup.children[0]);
    }

    const gridMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });

    // Concentric range rings: 30, 60, 90, 120 units
    const radii = [30, 60, 90, 120, 150];
    for (const r of radii) {
      const ringGeo = new THREE.BufferGeometry();
      const points: THREE.Vector3[] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r));
      }
      ringGeo.setFromPoints(points);
      const ringLine = new THREE.Line(ringGeo, gridMat);
      this.gridGroup.add(ringLine);
    }

    // Radial crosshair axes
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-150, 0, 0),
      new THREE.Vector3(150, 0, 0),
      new THREE.Vector3(0, 0, -150),
      new THREE.Vector3(0, 0, 150),
    ]);
    const crossLine = new THREE.LineSegments(crossGeo, gridMat);
    this.gridGroup.add(crossLine);
  }

  /**
   * Selection highlight aura, rotating reticle brackets, and trajectory line
   */
  private buildSelectionHighlight(): void {
    // 1. Pulsing halo sphere
    const haloGeo = new THREE.SphereGeometry(4.2, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    this.highlightHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.highlightGroup.add(this.highlightHaloMesh);

    // 2. Rotating holographic targeting reticle (dual rings)
    const reticleGeo1 = new THREE.RingGeometry(5.2, 5.5, 32);
    reticleGeo1.rotateX(Math.PI / 2);
    const reticleMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const reticle1 = new THREE.Mesh(reticleGeo1, reticleMat1);
    this.targetReticleGroup.add(reticle1);

    const reticleGeo2 = new THREE.RingGeometry(6.4, 6.7, 4);
    reticleGeo2.rotateX(Math.PI / 2);
    const reticleMat2 = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const reticle2 = new THREE.Mesh(reticleGeo2, reticleMat2);
    this.targetReticleGroup.add(reticle2);

    this.highlightGroup.add(this.targetReticleGroup);
    this.highlightGroup.visible = false;

    // 3. Glowing Trajectory Vector Line from (0,0,0) to target
    const trajGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const trajMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    this.trajectoryLine = new THREE.Line(trajGeo, trajMat);
    this.trajectoryGroup.add(this.trajectoryLine);
    this.trajectoryGroup.visible = false;
  }

  public setOnCourseSet(cb: (system: StarSystemDescriptor) => void): void {
    this.onCourseSetCallback = cb;
  }

  public toggle(): void {
    if (this.isVisible) this.close();
    else this.open();
  }

  public open(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.resize();
    this.rebuildStarsAndDestinations();
    this.renderDetailsPanel();
  }

  public close(): void {
    this.abortCountdown();
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  public setScale(scale: HolographicScale): void {
    this.currentScale = scale;
    audio.playBlip();

    const btnS = this.container.querySelector('#holo-btn-stellar') as HTMLElement;
    const btnSys = this.container.querySelector('#holo-btn-system') as HTMLElement;

    if (btnS) btnS.style.background = scale === 'STELLAR' || scale === 'GALACTIC' ? '#0284c7' : 'transparent';
    if (btnSys) btnSys.style.background = scale === 'SYSTEM' ? '#0284c7' : 'transparent';

    if (scale === 'SYSTEM') {
      this.camDistance = 90;
      this.camElevation = 0.65;
      this.targetCamLook.set(0, 0, 0);
      this.gridGroup.visible = false;
      this.originGroup.visible = false;
      this.starNodesGroup.visible = false;
      this.trajectoryGroup.visible = false;
      this.highlightGroup.visible = false;
      this.systemOrbitGroup.visible = true;
      this.rebuildSystemView();
    } else {
      this.camDistance = 180;
      this.camElevation = 0.55;
      this.targetCamLook.set(0, 0, 0);
      this.gridGroup.visible = true;
      this.originGroup.visible = true;
      this.starNodesGroup.visible = true;
      this.systemOrbitGroup.visible = false;
      this.rebuildStarsAndDestinations();
    }

    this.renderDetailsPanel();
  }

  /**
   * Rebuilds reachable destinations cleanly:
   * Only displays the player's origin beacon and valid destination stars.
   */
  private rebuildStarsAndDestinations(): void {
    // Clear old elements and dispose previous transient materials
    while (this.starNodesGroup.children.length > 0) {
      this.starNodesGroup.remove(this.starNodesGroup.children[0]);
    }
    while (this.originGroup.children.length > 0) {
      this.originGroup.remove(this.originGroup.children[0]);
    }
    for (const mat of this.nodeMaterials) {
      mat.dispose();
    }
    this.nodeMaterials = [];
    if (this.batchedStemGeo) {
      this.batchedStemGeo.dispose();
      this.batchedStemGeo = null;
    }
    this.starNodes = [];

    // 1. Build Player Origin Beacon at (0, 0, 0) (using shared persistent geometries)
    const originMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const originMesh = new THREE.Mesh(this.sharedOriginGeo, originMat);
    this.originGroup.add(originMesh);
    this.nodeMaterials.push(originMat);

    const originRingMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const originRing = new THREE.Mesh(this.sharedOriginRingGeo, originRingMat);
    this.originGroup.add(originRing);
    this.nodeMaterials.push(originRingMat);

    // 2. Fetch destination systems using ultra-lightweight summaries
    const systemEntries = this.sectorManager.getSystemSummariesInRadius(this.playerWorldPos.sector, 4);
    const playerSector = this.playerWorldPos.sector;
    const stemPoints: THREE.Vector3[] = [];

    // Filter to destination systems
    for (const entry of systemEntries) {
      const sys = entry.summary;
      const sDx = sys.sectorX - playerSector.x;
      const sDy = sys.sectorY - playerSector.y;
      const sDz = sys.sectorZ - playerSector.z;

      // Calculate relative coordinate in hologram units
      const relX = sDx * 36.0;
      const relY = sDy * 18.0;
      const relZ = sDz * 36.0;
      const relPos = new THREE.Vector3(relX, relY, relZ);

      // Distance in light years
      const sectorDist = Math.hypot(sDx, sDy, sDz);
      if (sectorDist < 0.1) {
        // Current system origin
        continue;
      }

      const distLy = Math.max(1.2, sectorDist * 3.26);

      // Star Node 3D Sphere (using shared geometry)
      const starMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sys.star.lightColor),
      });
      this.nodeMaterials.push(starMat);
      const starMesh = new THREE.Mesh(this.sharedStarGeo, starMat);
      starMesh.position.copy(relPos);

      // Concentric halo ring (using shared geometry)
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sys.star.lightColor),
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      this.nodeMaterials.push(ringMat);
      const ringMesh = new THREE.Mesh(this.sharedRingGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.copy(relPos);

      // Depth stem point pair for batched LineSegments
      stemPoints.push(new THREE.Vector3(relX, 0, relZ), relPos);

      // Invisible Click Hitbox (using shared geometry & material)
      const hitbox = new THREE.Mesh(this.sharedHitboxGeo, this.sharedHitboxMat);
      hitbox.position.copy(relPos);

      this.starNodesGroup.add(starMesh);
      this.starNodesGroup.add(ringMesh);
      this.starNodesGroup.add(hitbox);

      this.starNodes.push({
        mesh: starMesh,
        hitbox,
        system: sys,
        worldRelPos: relPos,
        distanceLy: distLy,
      });
    }

    // Single batched LineSegments for all depth stems
    if (stemPoints.length > 0) {
      this.batchedStemGeo = new THREE.BufferGeometry().setFromPoints(stemPoints);
      const stemLines = new THREE.LineSegments(this.batchedStemGeo, this.sharedStemMat);
      this.starNodesGroup.add(stemLines);
    }

    // Sort destinations by distance
    this.starNodes.sort((a, b) => a.distanceLy - b.distanceLy);

    // Auto-select first destination if none selected (do not force drawer open)
    if (!this.selectedSystem && this.starNodes.length > 0) {
      this.selectSystem(this.starNodes[0].system, false);
    } else if (this.selectedSystem) {
      this.updateSelectionHighlight();
    }

    this.renderDestinationsSidebar();
  }

  /**
   * Render sidebar list of clickable destination cards
   */
  private renderDestinationsSidebar(): void {
    this.destinationsListEl.innerHTML = '';

    if (this.starNodes.length === 0) {
      this.destinationsListEl.innerHTML = `
        <div style="font-size: 12px; color: #64748b; padding: 12px; text-align: center;">
          No destinations within sensor range.
        </div>
      `;
      return;
    }

    for (const node of this.starNodes) {
      const sys = node.system;
      const isSelected = this.selectedSystem?.id === sys.id;
      const isLocked = this.activeCourseSystem?.id === sys.id;
      const planetCount = 'planets' in sys ? sys.planets.length : sys.planetCount;

      const card = document.createElement('div');
      card.style.cssText = `
        padding: 10px 12px;
        background: ${isSelected ? 'rgba(14, 165, 233, 0.22)' : 'rgba(15, 23, 42, 0.6)'};
        border: 1px solid ${isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      `;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
          <span style="font-weight: 600; font-size: 13px; color: ${isSelected ? '#38bdf8' : '#f8fafc'};">
            ${sys.name}
          </span>
          <span style="font-size: 11px; color: #38bdf8; font-family: ui-monospace, monospace;">
            ${node.distanceLy.toFixed(1)} LY
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
          <span>Class ${sys.star.spectralClass} Star</span>
          <span>${planetCount} Worlds</span>
        </div>
        ${isLocked ? `<div style="font-size: 10px; color: #22c55e; margin-top: 4px; font-weight: 600;">✓ COURSE LOCKED</div>` : ''}
      `;

      card.addEventListener('click', () => {
        audio.playBlip();
        this.selectSystem(sys, true);
        const sidebar = this.container.querySelector('#holo-destinations-sidebar');
        sidebar?.classList.remove('drawer-open');
      });

      this.destinationsListEl.appendChild(card);
    }
  }

  /**
   * Select a star system, light it up in 3D, and update the UI
   */
  public selectSystem(sys: StarSystemDescriptor | StarSystemSummary, openDrawer = true): void {
    const fullSystem = 'planets' in sys
      ? sys
      : this.sectorManager.getFullSystem(sys.sectorX, sys.sectorY, sys.sectorZ);
    this.selectedSystem = fullSystem;
    this.updateSelectionHighlight();
    this.renderDestinationsSidebar();
    this.renderDetailsPanel();

    if (openDrawer) {
      this.detailsPanel.classList.add('drawer-open');
    }

    if (this.currentScale === 'SYSTEM') {
      this.rebuildSystemView();
    }
  }

  /**
   * Lights up the selected star system:
   * Positions glowing halo, rotating reticle, and draws trajectory line from origin.
   */
  private updateSelectionHighlight(): void {
    if (!this.selectedSystem) {
      this.highlightGroup.visible = false;
      this.trajectoryGroup.visible = false;
      return;
    }

    const node = this.starNodes.find((n) => n.system.id === this.selectedSystem!.id);
    if (!node) {
      this.highlightGroup.visible = false;
      this.trajectoryGroup.visible = false;
      return;
    }

    // Position highlight at target star
    this.highlightGroup.position.copy(node.worldRelPos);
    this.highlightGroup.visible = true;

    // Update trajectory vector from origin (0,0,0) to target
    const positions = new Float32Array([
      0, 0, 0,
      node.worldRelPos.x, node.worldRelPos.y, node.worldRelPos.z,
    ]);
    this.trajectoryLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trajectoryGroup.visible = true;

    // Pan camera target smoothly toward midpoint
    this.targetCamLook.set(
      node.worldRelPos.x * 0.45,
      node.worldRelPos.y * 0.45,
      node.worldRelPos.z * 0.45
    );
  }

  private rebuildSystemView(): void {
    while (this.systemOrbitGroup.children.length > 0) {
      this.systemOrbitGroup.remove(this.systemOrbitGroup.children[0]);
    }
    for (const geo of this.systemGeometries) {
      geo.dispose();
    }
    this.systemGeometries = [];
    for (const mat of this.systemMaterials) {
      mat.dispose();
    }
    this.systemMaterials = [];

    const sys = this.selectedSystem;
    if (!sys) return;

    // Central Star
    const starGeo = new THREE.SphereGeometry(4.2, 20, 20);
    this.systemGeometries.push(starGeo);
    const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sys.star.lightColor) });
    this.systemMaterials.push(starMat);
    const star = new THREE.Mesh(starGeo, starMat);
    this.systemOrbitGroup.add(star);

    // Planets & Orbits
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      const r = (i + 1) * 12 + 10;

      // Orbit ring
      const ringGeo = new THREE.RingGeometry(r - 0.12, r + 0.12, 48);
      ringGeo.rotateX(Math.PI / 2);
      this.systemGeometries.push(ringGeo);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      this.systemMaterials.push(ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      this.systemOrbitGroup.add(ring);

      // Planet body
      const planetGeo = new THREE.SphereGeometry(1.4, 12, 12);
      this.systemGeometries.push(planetGeo);
      const planetMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.palette.primary || 0x60a5fa),
      });
      this.systemMaterials.push(planetMat);
      const planet = new THREE.Mesh(planetGeo, planetMat);
      const ang = (i / Math.max(1, sys.planets.length)) * Math.PI * 2 + 0.5;
      planet.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      this.systemOrbitGroup.add(planet);
    }
  }

  private setupEvents(): void {
    // Close button
    this.container.querySelector('#holo-btn-close')?.addEventListener('click', () => {
      audio.playBlip();
      this.close();
    });

    // Destinations drawer toggle & close (Mobile/Compact screens)
    const destSidebar = this.container.querySelector('#holo-destinations-sidebar') as HTMLElement;
    this.container.querySelector('#holo-dest-toggle-btn')?.addEventListener('click', () => {
      audio.playBlip();
      destSidebar?.classList.toggle('drawer-open');
    });

    this.container.querySelector('#holo-dest-close-btn')?.addEventListener('click', () => {
      destSidebar?.classList.remove('drawer-open');
    });

    // Scale buttons
    this.container.querySelector('#holo-btn-stellar')?.addEventListener('click', () => this.setScale('STELLAR'));
    this.container.querySelector('#holo-btn-system')?.addEventListener('click', () => this.setScale('SYSTEM'));

    // Abort Countdown
    this.container.querySelector('#holo-countdown-abort')?.addEventListener('click', () => {
      audio.playBlip();
      this.abortCountdown();
    });

    // Window resize
    window.addEventListener('resize', this.handleWindowResize);

    // Pointer drag for 3D Camera Orbit (Mouse & Touch)
    let pointerDragDist = 0;
    let initialPinchDist = 0;
    let initialCamDist = this.camDistance;

    this.canvasContainer.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      pointerDragDist = 0;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
      this.canvasContainer.style.cursor = 'grabbing';
      try {
        this.canvasContainer.setPointerCapture(e.pointerId);
      } catch {}
    });

    this.canvasContainer.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.isVisible) return;
      const dx = e.clientX - this.prevMouseX;
      const dy = e.clientY - this.prevMouseY;
      pointerDragDist += Math.abs(dx) + Math.abs(dy);
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      this.camAzimuth -= dx * 0.008;
      this.camElevation = THREE.MathUtils.clamp(this.camElevation + dy * 0.008, 0.1, 1.4);
      this.updateCameraOrbit();
    });

    const endPointerDrag = (e: PointerEvent) => {
      this.isDragging = false;
      this.canvasContainer.style.cursor = 'grab';
      try {
        this.canvasContainer.releasePointerCapture(e.pointerId);
      } catch {}
    };

    this.canvasContainer.addEventListener('pointerup', endPointerDrag);
    this.canvasContainer.addEventListener('pointercancel', endPointerDrag);

    // Multi-touch pinch-to-zoom
    this.canvasContainer.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (initialPinchDist > 0) {
          const delta = initialPinchDist - dist;
          this.camDistance = THREE.MathUtils.clamp(initialCamDist + delta * 0.4, 45, 320);
          this.updateCameraOrbit();
        } else {
          initialPinchDist = dist;
          initialCamDist = this.camDistance;
        }
      }
    }, { passive: false });

    this.canvasContainer.addEventListener('touchend', () => {
      initialPinchDist = 0;
    });

    // Scroll to zoom
    this.canvasContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.15, 45, 320);
      this.updateCameraOrbit();
    }, { passive: false });

    // Click on 3D Destination Star Hitbox
    this.canvasContainer.addEventListener('click', (e) => {
      if (pointerDragDist > 8) return;

      const rect = this.canvasContainer.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hitboxes = this.starNodes.map((s) => s.hitbox);
      const intersects = this.raycaster.intersectObjects(hitboxes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const found = this.starNodes.find((s) => s.hitbox === hit);
        if (found) {
          audio.playBlip();
          this.selectSystem(found.system);
        }
      }
    });

    // Keyboard Escape to abort countdown or close
    window.addEventListener('keydown', this.handleWindowKeydown);
  }

  private updateCameraOrbit(): void {
    const cosEle = Math.cos(this.camElevation);
    const sinEle = Math.sin(this.camElevation);

    const x = this.currentCamLook.x + this.camDistance * cosEle * Math.sin(this.camAzimuth);
    const y = this.currentCamLook.y + this.camDistance * sinEle;
    const z = this.currentCamLook.z + this.camDistance * cosEle * Math.cos(this.camAzimuth);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.currentCamLook);
  }

  public resize(): void {
    const w = this.canvasContainer.clientWidth;
    const h = this.canvasContainer.clientHeight;
    if (w > 0 && h > 0) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.renderer) {
        this.renderer.setSize(w, h);
      }
    }
  }

  public render(): void {
    if (!this.isVisible || this.isDisposed || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  public update(dt: number = 0.016): void {
    if (!this.isVisible || this.isDisposed) return;

    // Smoothly interpolate camera look-at position
    this.currentCamLook.lerp(this.targetCamLook, Math.min(1.0, dt * 4.0));
    this.updateCameraOrbit();

    // Rotate holographic selection reticle
    this.targetReticleGroup.rotation.y += dt * 0.75;

    // Pulse halo mesh
    if (this.highlightHaloMesh) {
      const pulse = 1.0 + Math.sin(performance.now() * 0.005) * 0.12;
      this.highlightHaloMesh.scale.set(pulse, pulse, pulse);
    }
  }

  /**
   * Inspector panel for the selected destination
   */
  private renderDetailsPanel(): void {
    const sys = this.selectedSystem;
    if (!sys) {
      this.detailsPanel.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">Select a destination star to inspect telemetry.</div>`;
      return;
    }

    const node = this.starNodes.find((n) => n.system.id === sys.id);
    const distLy = node ? node.distanceLy.toFixed(1) : '---';
    const isLocked = this.activeCourseSystem?.id === sys.id;

    this.detailsPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div>
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">DESTINATION TELEMETRY</div>
          <h2 style="font-size: clamp(16px, 3.5vw, 22px); font-weight: 400; margin: 4px 0 0 0; color: #f8fafc;">${sys.name}</h2>
        </div>
        <button id="holo-btn-details-close" style="
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 6px;
          color: #cbd5e1;
          padding: 3px 8px;
          font-size: 12px;
          cursor: pointer;
        ">✕</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px; font-family: ui-monospace, monospace; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">DISTANCE:</span>
          <span style="color: #38bdf8; font-weight: 700;">${distLy} LIGHT YEARS</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">SPECTRAL TYPE:</span>
          <span style="color: #f8fafc;">Class ${sys.star.spectralClass} (T: ${sys.star.temperature}K)</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">PRIMARY RADIUS:</span>
          <span style="color: #f8fafc;">${sys.star.radius * 10} km</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">CONFIRMED WORLDS:</span>
          <span style="color: #38bdf8; font-weight: 600;">${sys.planets.length} bodies</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">SECTOR COORD:</span>
          <span style="color: #94a3b8;">[${sys.sectorX}, ${sys.sectorY}, ${sys.sectorZ}]</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: auto;">
        <button id="holo-btn-set-course" style="
          width: 100%;
          padding: 10px;
          background: ${isLocked ? 'rgba(34, 197, 94, 0.2)' : 'rgba(2, 132, 199, 0.2)'};
          border: 1px solid ${isLocked ? '#22c55e' : '#38bdf8'};
          border-radius: 6px;
          color: ${isLocked ? '#22c55e' : '#38bdf8'};
          font-family: ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.15s ease;
        ">
          ${isLocked ? '✓ COURSE LOCKED' : 'LOCK DESTINATION COURSE'}
        </button>

        <button id="holo-btn-warp-now" style="
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border: 1px solid #38bdf8;
          border-radius: 6px;
          color: white;
          font-family: ui-monospace, monospace;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.15em;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
          transition: all 0.15s ease;
        ">
          INITIATE WARP TRANSIT ➔
        </button>
      </div>
    `;

    // Hook up detail action buttons
    const closeBtn = this.detailsPanel.querySelector('#holo-btn-details-close') as HTMLElement;
    closeBtn?.addEventListener('click', () => {
      this.detailsPanel.classList.remove('drawer-open');
    });

    const setCourseBtn = this.detailsPanel.querySelector('#holo-btn-set-course') as HTMLElement;
    setCourseBtn?.addEventListener('click', () => {
      audio.playConnectChime();
      this.activeCourseSystem = sys;
      if (this.onCourseSetCallback) {
        this.onCourseSetCallback(sys);
      }
      this.renderDestinationsSidebar();
      this.renderDetailsPanel();
    });

    const warpBtn = this.detailsPanel.querySelector('#holo-btn-warp-now') as HTMLElement;
    warpBtn?.addEventListener('click', () => {
      this.startCountdown(sys);
    });
  }

  /**
   * Start the 5-second warp countdown sequence
   */
  private startCountdown(sys: StarSystemDescriptor): void {
    if (this.countdownInterval !== null) return;

    this.countdownValue = 5;
    this.countdownOverlayEl.style.display = 'flex';

    const destNameEl = this.container.querySelector('#holo-warp-dest-name');
    const digitEl = this.container.querySelector('#holo-warp-digit') as HTMLElement;

    if (destNameEl) destNameEl.textContent = sys.name.toUpperCase();
    if (digitEl) digitEl.textContent = '5';

    audio.playWarpCountdownTick(5);

    this.countdownInterval = window.setInterval(() => {
      this.countdownValue--;

      if (this.countdownValue > 0) {
        if (digitEl) {
          digitEl.textContent = `${this.countdownValue}`;
          digitEl.style.transform = 'scale(1.3)';
          setTimeout(() => { if (digitEl) digitEl.style.transform = 'scale(1.0)'; }, 120);
        }
        audio.playWarpCountdownTick(this.countdownValue);
      } else {
        // Countdown reached 0 -> Launch warp!
        this.abortCountdown();
        this.activeCourseSystem = sys;
        audio.playConnectChime();
        this.close();
        this.onSelectDestination(sys);
      }
    }, 1000);
  }

  /**
   * Abort active countdown
   */
  public abortCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.countdownOverlayEl) {
      this.countdownOverlayEl.style.display = 'none';
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.abortCountdown();
    if (this.animId) cancelAnimationFrame(this.animId);

    this.sharedStarGeo.dispose();
    this.sharedRingGeo.dispose();
    this.sharedOriginGeo.dispose();
    this.sharedOriginRingGeo.dispose();
    this.sharedHitboxGeo.dispose();
    this.sharedHitboxMat.dispose();
    this.sharedStemMat.dispose();
    if (this.batchedStemGeo) {
      this.batchedStemGeo.dispose();
      this.batchedStemGeo = null;
    }
    for (const mat of this.nodeMaterials) {
      mat.dispose();
    }
    this.nodeMaterials = [];

    for (const geo of this.systemGeometries) {
      geo.dispose();
    }
    this.systemGeometries = [];
    for (const mat of this.systemMaterials) {
      mat.dispose();
    }
    this.systemMaterials = [];

    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('keydown', this.handleWindowKeydown);

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.container.remove();
  }
}
