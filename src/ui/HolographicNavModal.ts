import * as THREE from 'three';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';
import type { WorldPosition } from '../game/universe/WorldPosition';
import type { SectorManager } from '../game/universe/SectorManager';
import { audio } from '../audio/AudioEngine';

export type HolographicScale = 'GALACTIC' | 'STELLAR' | 'SYSTEM';

interface StarNodeItem {
  mesh: THREE.Mesh;
  hitbox: THREE.Mesh;
  system: StarSystemDescriptor;
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

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private sectorManager: SectorManager;
  private playerWorldPos: WorldPosition;
  private onSelectDestination: (system: StarSystemDescriptor) => void;
  private onCourseSetCallback: ((system: StarSystemDescriptor) => void) | null = null;

  public currentScale: HolographicScale = 'STELLAR';
  public selectedSystem: StarSystemDescriptor | null = null;
  public activeCourseSystem: StarSystemDescriptor | null = null;

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

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private animId: number | null = null;
  private isDisposed = false;

  // Countdown timer state
  private countdownInterval: number | null = null;
  private countdownValue = 5;

  constructor(
    parent: HTMLElement,
    sectorManager: SectorManager,
    playerWorldPos: WorldPosition,
    onSelectDestination: (system: StarSystemDescriptor) => void
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
      background: radial-gradient(circle at 50% 50%, rgba(5, 9, 18, 0.96) 0%, rgba(2, 3, 6, 0.99) 100%);
      backdrop-filter: blur(14px);
      display: none;
      flex-direction: column;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      user-select: none;
    `;

    this.container.innerHTML = `
      <!-- Header -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 28px;
        border-bottom: 1px solid rgba(56, 189, 248, 0.25);
        background: rgba(10, 16, 28, 0.85);
      ">
        <div style="display: flex; align-items: center; gap: 24px;">
          <div>
            <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">INTERSTELLAR CARTOGRAPHY</div>
            <h2 style="font-size: 18px; font-weight: 400; margin: 2px 0 0 0; letter-spacing: 0.05em;">Star Chart & Warp Navigation</h2>
          </div>

          <div style="display: flex; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 6px; padding: 2px;">
            <button id="holo-btn-stellar" style="padding: 5px 14px; background: #0284c7; border: none; border-radius: 4px; color: white; font-size: 11px; cursor: pointer; font-weight: 500;">STELLAR CHART</button>
            <button id="holo-btn-system" style="padding: 5px 14px; background: transparent; border: none; border-radius: 4px; color: #94a3b8; font-size: 11px; cursor: pointer;">ORBITAL SYSTEM</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="font-size: 11px; color: #64748b; font-family: ui-monospace, monospace;">
            DRAG TO ROTATE // SCROLL TO ZOOM
          </div>
          <button id="holo-btn-close" style="
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 6px;
            color: #e2e8f0;
            padding: 6px 16px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">CLOSE [M]</button>
        </div>
      </div>

      <!-- Main Body: Sidebar + 3D Viewport + Inspector -->
      <div style="display: flex; flex: 1; min-height: 0; position: relative;">
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
          <div style="padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 11px; letter-spacing: 0.15em; color: #38bdf8; font-weight: 600;">
            REACHABLE DESTINATIONS
          </div>
          <div id="holo-destinations-list" style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Center 3D Holographic Canvas -->
        <div id="holo-canvas-container" style="flex: 1; position: relative; overflow: hidden; min-width: 0; cursor: grab;">
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

    // Three.js holographic scene setup
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020306, 0.0018);

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    this.updateCameraOrbit();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    if (!this.animId) {
      this.animate();
    }
  }

  public close(): void {
    this.abortCountdown();
    this.isVisible = false;
    this.container.style.display = 'none';
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
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
    // Clear old elements
    while (this.starNodesGroup.children.length > 0) {
      this.starNodesGroup.remove(this.starNodesGroup.children[0]);
    }
    while (this.originGroup.children.length > 0) {
      this.originGroup.remove(this.originGroup.children[0]);
    }
    this.starNodes = [];

    // 1. Build Player Origin Beacon at (0, 0, 0)
    const originGeo = new THREE.SphereGeometry(2.0, 16, 16);
    const originMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const originMesh = new THREE.Mesh(originGeo, originMat);
    this.originGroup.add(originMesh);

    const originRingGeo = new THREE.RingGeometry(3.6, 4.2, 32);
    originRingGeo.rotateX(Math.PI / 2);
    const originRingMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const originRing = new THREE.Mesh(originRingGeo, originRingMat);
    this.originGroup.add(originRing);

    // 2. Fetch destination systems in radius 4 sectors
    const systemEntries = this.sectorManager.getSystemsInRadius(this.playerWorldPos.sector, 4);
    const playerSector = this.playerWorldPos.sector;

    // Filter to destination systems
    for (const entry of systemEntries) {
      const sys = entry.system;
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

      // Star Node 3D Sphere
      const starGeo = new THREE.SphereGeometry(2.4, 16, 16);
      const starMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sys.star.lightColor),
      });
      const starMesh = new THREE.Mesh(starGeo, starMat);
      starMesh.position.copy(relPos);

      // Concentric halo ring
      const ringGeo = new THREE.RingGeometry(3.6, 4.0, 24);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sys.star.lightColor),
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(relPos);

      // Depth stem line to reference plane (y=0)
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(relX, 0, relZ),
        relPos,
      ]);
      const stemMat = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.35,
      });
      const stem = new THREE.Line(stemGeo, stemMat);

      // Invisible Click Hitbox (radius 6.0) for effortless raycast clicking
      const hitboxGeo = new THREE.SphereGeometry(6.0, 8, 8);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.copy(relPos);

      this.starNodesGroup.add(starMesh);
      this.starNodesGroup.add(ringMesh);
      this.starNodesGroup.add(stem);
      this.starNodesGroup.add(hitbox);

      this.starNodes.push({
        mesh: starMesh,
        hitbox,
        system: sys,
        worldRelPos: relPos,
        distanceLy: distLy,
      });
    }

    // Sort destinations by distance
    this.starNodes.sort((a, b) => a.distanceLy - b.distanceLy);

    // Auto-select first destination if none selected
    if (!this.selectedSystem && this.starNodes.length > 0) {
      this.selectSystem(this.starNodes[0].system);
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
          <span>${sys.planets.length} Worlds</span>
        </div>
        ${isLocked ? `<div style="font-size: 10px; color: #22c55e; margin-top: 4px; font-weight: 600;">✓ COURSE LOCKED</div>` : ''}
      `;

      card.addEventListener('click', () => {
        audio.playBlip();
        this.selectSystem(sys);
      });

      this.destinationsListEl.appendChild(card);
    }
  }

  /**
   * Select a star system, light it up in 3D, and update the UI
   */
  public selectSystem(sys: StarSystemDescriptor): void {
    this.selectedSystem = sys;
    this.updateSelectionHighlight();
    this.renderDestinationsSidebar();
    this.renderDetailsPanel();

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

    const sys = this.selectedSystem;
    if (!sys) return;

    // Central Star
    const starGeo = new THREE.SphereGeometry(4.2, 20, 20);
    const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sys.star.lightColor) });
    const star = new THREE.Mesh(starGeo, starMat);
    this.systemOrbitGroup.add(star);

    // Planets & Orbits
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      const r = (i + 1) * 12 + 10;

      // Orbit ring
      const ringGeo = new THREE.RingGeometry(r - 0.12, r + 0.12, 48);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      this.systemOrbitGroup.add(ring);

      // Planet body
      const planetGeo = new THREE.SphereGeometry(1.4, 12, 12);
      const planetMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.palette.primary || 0x60a5fa),
      });
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

    // Scale buttons
    this.container.querySelector('#holo-btn-stellar')?.addEventListener('click', () => this.setScale('STELLAR'));
    this.container.querySelector('#holo-btn-system')?.addEventListener('click', () => this.setScale('SYSTEM'));

    // Abort Countdown
    this.container.querySelector('#holo-countdown-abort')?.addEventListener('click', () => {
      audio.playBlip();
      this.abortCountdown();
    });

    // Window resize
    window.addEventListener('resize', () => {
      if (this.isVisible) this.resize();
    });

    // Mouse drag for 3D Camera Orbit
    this.canvasContainer.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
      this.canvasContainer.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.isVisible) return;
      const dx = e.clientX - this.prevMouseX;
      const dy = e.clientY - this.prevMouseY;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      this.camAzimuth -= dx * 0.008;
      this.camElevation = THREE.MathUtils.clamp(this.camElevation + dy * 0.008, 0.1, 1.4);
      this.updateCameraOrbit();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvasContainer.style.cursor = 'grab';
    });

    // Scroll to zoom
    this.canvasContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.15, 45, 320);
      this.updateCameraOrbit();
    }, { passive: false });

    // Click on 3D Destination Star Hitbox
    this.canvasContainer.addEventListener('click', (e) => {
      if (this.isDragging) return;

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
    window.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;
      if (e.key === 'Escape') {
        if (this.countdownInterval !== null) {
          this.abortCountdown();
        } else {
          this.close();
        }
      }
    });
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

  private resize(): void {
    const w = this.canvasContainer.clientWidth;
    const h = this.canvasContainer.clientHeight;
    if (w > 0 && h > 0) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }
  }

  private animate(): void {
    if (!this.isVisible || this.isDisposed) return;
    this.animId = requestAnimationFrame(() => this.animate());

    // Smoothly interpolate camera look-at position
    this.currentCamLook.lerp(this.targetCamLook, 0.05);
    this.updateCameraOrbit();

    // Rotate holographic selection reticle
    this.targetReticleGroup.rotation.y += 0.012;

    // Pulse halo mesh
    if (this.highlightHaloMesh) {
      const pulse = 1.0 + Math.sin(performance.now() * 0.005) * 0.12;
      this.highlightHaloMesh.scale.set(pulse, pulse, pulse);
    }

    this.renderer.render(this.scene, this.camera);
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
      <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">DESTINATION TELEMETRY</div>
      <h2 style="font-size: 22px; font-weight: 400; margin: 4px 0 16px 0; color: #f8fafc;">${sys.name}</h2>

      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12px; font-family: ui-monospace, monospace; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">DISTANCE:</span>
          <span style="color: #38bdf8; font-weight: 700;">${distLy} LIGHT YEARS</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">SPECTRAL TYPE:</span>
          <span style="color: #${sys.star.lightColor.toString(16).padStart(6, '0')}; font-weight: bold;">CLASS ${sys.star.spectralClass} STAR</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">SECTOR COORDS:</span>
          <span>[${sys.sectorX}, ${sys.sectorY}, ${sys.sectorZ}]</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">ORBITAL WORLDS:</span>
          <span>${sys.planets.length} REGISTERED</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">DEEP ANOMALIES:</span>
          <span style="color: #fbbf24;">${sys.anomalies?.length || 0} DETECTED</span>
        </div>
      </div>

      <!-- Worlds Preview -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 11px; letter-spacing: 0.15em; color: #94a3b8; margin-bottom: 8px;">SURVEYED WORLDS</div>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
          ${sys.planets.map((p, idx) => `
            <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 6px 10px; background: rgba(15, 23, 42, 0.5); border-radius: 4px;">
              <span style="color: #e2e8f0;">${idx + 1}. ${p.name}</span>
              <span style="color: #64748b;">${p.type || 'Terrestrial'}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: auto;">
        <button id="holo-btn-lock-course" style="
          padding: 12px;
          background: ${isLocked ? 'rgba(34, 197, 94, 0.25)' : 'rgba(14, 165, 233, 0.2)'};
          border: 1px solid ${isLocked ? '#22c55e' : 'rgba(56, 189, 248, 0.5)'};
          border-radius: 8px;
          color: #f8fafc;
          font-size: 12px;
          letter-spacing: 0.1em;
          font-weight: 600;
          cursor: pointer;
        ">${isLocked ? '✓ COURSE LOCKED' : 'LOCK COURSE VECTOR'}</button>

        <button id="holo-btn-engage-warp" style="
          padding: 14px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.4), rgba(14, 165, 233, 0.25));
          border: 1px solid #38bdf8;
          border-radius: 8px;
          color: #f8fafc;
          font-size: 13px;
          letter-spacing: 0.15em;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.25);
          transition: all 0.2s ease;
        ">ENGAGE WARP DRIVE</button>
      </div>
    `;

    this.detailsPanel.querySelector('#holo-btn-lock-course')?.addEventListener('click', () => {
      audio.playConnectChime();
      this.activeCourseSystem = sys;
      if (this.onCourseSetCallback) this.onCourseSetCallback(sys);
      this.renderDestinationsSidebar();
      this.renderDetailsPanel();
    });

    this.detailsPanel.querySelector('#holo-btn-engage-warp')?.addEventListener('click', () => {
      this.startWarpCountdown(sys);
    });
  }

  /**
   * Starts the 5-to-1 animated countdown overlay before initiating warp drive
   */
  public startWarpCountdown(sys: StarSystemDescriptor): void {
    this.abortCountdown();
    this.countdownValue = 5;

    const targetNameEl = this.container.querySelector('#holo-countdown-target-name') as HTMLElement;
    const digitEl = this.container.querySelector('#holo-countdown-digit') as HTMLElement;

    if (targetNameEl) targetNameEl.textContent = `TARGET // ${sys.name.toUpperCase()}`;
    if (digitEl) {
      digitEl.textContent = '5';
      digitEl.style.transform = 'scale(1.2)';
      setTimeout(() => { if (digitEl) digitEl.style.transform = 'scale(1.0)'; }, 100);
    }

    this.countdownOverlayEl.style.display = 'flex';
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
    this.renderer.dispose();
    this.container.remove();
  }
}
