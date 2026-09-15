import * as THREE from 'three';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';
import type { WorldPosition } from '../game/universe/WorldPosition';
import type { SectorManager } from '../game/universe/SectorManager';
import { audio } from '../audio/AudioEngine';

export type HolographicScale = 'GALACTIC' | 'STELLAR' | 'SYSTEM';

export class HolographicNavModal {
  private container: HTMLElement;
  private canvasContainer: HTMLElement;
  private detailsPanel: HTMLElement;
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

  // 3D Visual scene elements
  private galacticArmGroup = new THREE.Group();
  private starNodesGroup = new THREE.Group();
  private systemOrbitGroup = new THREE.Group();
  private starMeshes: Array<{ mesh: THREE.Mesh; system: StarSystemDescriptor }> = [];

  private targetCamPos = new THREE.Vector3(0, 140, 220);
  private targetCamLook = new THREE.Vector3(0, 0, 0);

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private animId: number | null = null;
  private isDisposed = false;

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
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 28px;
        border-bottom: 1px solid rgba(56, 189, 248, 0.25);
        background: rgba(10, 16, 28, 0.7);
      ">
        <div style="display: flex; align-items: center; gap: 20px;">
          <div>
            <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">HOLOGRAPHIC CARTOGRAPHY</div>
            <h2 style="font-size: 20px; font-weight: 300; margin: 2px 0 0 0;">3D Sector Hologram</h2>
          </div>

          <div style="display: flex; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 6px; padding: 2px;">
            <button id="holo-btn-galactic" style="padding: 5px 14px; background: transparent; border: none; border-radius: 4px; color: #94a3b8; font-size: 11px; cursor: pointer;">GALACTIC</button>
            <button id="holo-btn-stellar" style="padding: 5px 14px; background: #0284c7; border: none; border-radius: 4px; color: white; font-size: 11px; cursor: pointer;">STELLAR</button>
            <button id="holo-btn-system" style="padding: 5px 14px; background: transparent; border: none; border-radius: 4px; color: #94a3b8; font-size: 11px; cursor: pointer;">SYSTEM</button>
          </div>
        </div>

        <button id="holo-btn-close" style="
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 6px;
          color: #e2e8f0;
          padding: 6px 16px;
          font-size: 12px;
          cursor: pointer;
        ">CLOSE [M]</button>
      </div>

      <div style="display: flex; flex: 1; min-height: 0; position: relative;">
        <div id="holo-canvas-container" style="flex: 1; position: relative; overflow: hidden; min-width: 0;"></div>

        <div id="holo-details-panel" style="
          flex: 0 0 360px;
          width: 360px;
          background: rgba(10, 16, 28, 0.95);
          border-left: 1px solid rgba(56, 189, 248, 0.2);
          padding: 24px;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          overflow-y: auto;
        "></div>
      </div>
    `;

    parent.appendChild(this.container);

    this.canvasContainer = this.container.querySelector('#holo-canvas-container') as HTMLElement;
    this.detailsPanel = this.container.querySelector('#holo-details-panel') as HTMLElement;

    // Three.js holographic scene setup
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020306, 0.002);

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
    this.camera.position.set(0, 140, 220);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.scene.add(this.galacticArmGroup);
    this.scene.add(this.starNodesGroup);
    this.scene.add(this.systemOrbitGroup);

    this.buildGalacticArm();
    this.setupEvents();
  }

  private buildGalacticArm(): void {
    // Volumetric luminous spiral band sprites & particles
    const particleCount = 1200;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const c1 = new THREE.Color(0x38bdf8);
    const c2 = new THREE.Color(0x818cf8);

    for (let i = 0; i < particleCount; i++) {
      const arm = i % 2 === 0 ? 0 : Math.PI;
      const dist = Math.pow(Math.random(), 1.5) * 500;
      const angle = dist * 0.008 + arm + (Math.random() - 0.5) * 0.6;

      positions[i * 3] = Math.cos(angle) * dist;
      positions[i * 3 + 1] = (Math.random() - 0.5) * (40 + dist * 0.1);
      positions[i * 3 + 2] = Math.sin(angle) * dist;

      const c = Math.random() > 0.5 ? c1 : c2;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
    });

    const armPoints = new THREE.Points(geom, mat);
    this.galacticArmGroup.add(armPoints);
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
    this.rebuildStars();
    this.renderDetailsPanel();

    if (!this.animId) {
      this.animate();
    }
  }

  public close(): void {
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

    const btnG = this.container.querySelector('#holo-btn-galactic') as HTMLElement;
    const btnS = this.container.querySelector('#holo-btn-stellar') as HTMLElement;
    const btnSys = this.container.querySelector('#holo-btn-system') as HTMLElement;

    if (btnG) btnG.style.background = scale === 'GALACTIC' ? '#0284c7' : 'transparent';
    if (btnS) btnS.style.background = scale === 'STELLAR' ? '#0284c7' : 'transparent';
    if (btnSys) btnSys.style.background = scale === 'SYSTEM' ? '#0284c7' : 'transparent';

    if (scale === 'GALACTIC') {
      this.targetCamPos.set(0, 380, 520);
      this.targetCamLook.set(0, 0, 0);
      this.galacticArmGroup.visible = true;
      this.starNodesGroup.visible = true;
      this.systemOrbitGroup.visible = false;
    } else if (scale === 'STELLAR') {
      this.targetCamPos.set(0, 110, 180);
      this.targetCamLook.set(0, 0, 0);
      this.galacticArmGroup.visible = true;
      this.starNodesGroup.visible = true;
      this.systemOrbitGroup.visible = false;
    } else if (scale === 'SYSTEM') {
      this.targetCamPos.set(0, 70, 95);
      this.targetCamLook.set(0, 0, 0);
      this.galacticArmGroup.visible = false;
      this.starNodesGroup.visible = false;
      this.systemOrbitGroup.visible = true;
      this.rebuildSystemView();
    }

    this.renderDetailsPanel();
  }

  private rebuildStars(): void {
    // Clear previous stars
    while (this.starNodesGroup.children.length > 0) {
      this.starNodesGroup.remove(this.starNodesGroup.children[0]);
    }
    this.starMeshes = [];

    const systemEntries = this.sectorManager.getSystemsInRadius(this.playerWorldPos.sector, 4);
    const systems = systemEntries.map((e) => e.system);

    for (const sys of systems) {
      const dx = (sys.sectorX - this.playerWorldPos.sector.x) * 32.0;
      const dy = (sys.sectorY - this.playerWorldPos.sector.y) * 16.0;
      const dz = (sys.sectorZ - this.playerWorldPos.sector.z) * 32.0;

      // 3D holographic star node
      const starGeo = new THREE.SphereGeometry(1.6, 12, 12);
      const starMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sys.star.lightColor),
      });
      const starMesh = new THREE.Mesh(starGeo, starMat);
      starMesh.position.set(dx, dy, dz);

      // Depth stem line to z-plane
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(dx, 0, dz),
        new THREE.Vector3(dx, dy, dz),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.35,
      });
      const stem = new THREE.Line(lineGeo, lineMat);

      this.starNodesGroup.add(starMesh);
      this.starNodesGroup.add(stem);
      this.starMeshes.push({ mesh: starMesh, system: sys });
    }

    if (systems.length > 0 && !this.selectedSystem) {
      this.selectedSystem = systems[0];
    }
  }

  private rebuildSystemView(): void {
    while (this.systemOrbitGroup.children.length > 0) {
      this.systemOrbitGroup.remove(this.systemOrbitGroup.children[0]);
    }

    const sys = this.selectedSystem;
    if (!sys) return;

    // Central Star
    const starGeo = new THREE.SphereGeometry(4.0, 16, 16);
    const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sys.star.lightColor) });
    const star = new THREE.Mesh(starGeo, starMat);
    this.systemOrbitGroup.add(star);

    // Planets & Orbits
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      const r = (i + 1) * 12 + 10;

      // Orbit ring
      const ringGeo = new THREE.RingGeometry(r - 0.1, r + 0.1, 48);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      this.systemOrbitGroup.add(ring);

      // Planet body
      const planetGeo = new THREE.SphereGeometry(1.2, 8, 8);
      const planetMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(p.palette.primary || 0x60a5fa),
        roughness: 0.6,
      });
      const planet = new THREE.Mesh(planetGeo, planetMat);
      const ang = (i / sys.planets.length) * Math.PI * 2 + 0.5;
      planet.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      this.systemOrbitGroup.add(planet);
    }
  }

  private setupEvents(): void {
    this.container.querySelector('#holo-btn-close')?.addEventListener('click', () => {
      audio.playBlip();
      this.close();
    });

    this.container.querySelector('#holo-btn-galactic')?.addEventListener('click', () => this.setScale('GALACTIC'));
    this.container.querySelector('#holo-btn-stellar')?.addEventListener('click', () => this.setScale('STELLAR'));
    this.container.querySelector('#holo-btn-system')?.addEventListener('click', () => this.setScale('SYSTEM'));

    window.addEventListener('resize', () => {
      if (this.isVisible) this.resize();
    });

    this.canvasContainer.addEventListener('click', (e) => {
      const rect = this.canvasContainer.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const targets = this.starMeshes.map((s) => s.mesh);
      const intersects = this.raycaster.intersectObjects(targets);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const found = this.starMeshes.find((s) => s.mesh === hit);
        if (found) {
          audio.playBlip();
          this.selectedSystem = found.system;
          this.renderDetailsPanel();
        }
      }
    });
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

    // Smooth camera lerp
    this.camera.position.lerp(this.targetCamPos, 0.05);

    // Subtle galactic rotation
    this.galacticArmGroup.rotation.y += 0.0006;
    this.renderer.render(this.scene, this.camera);
  }

  private renderDetailsPanel(): void {
    const sys = this.selectedSystem;
    if (!sys) {
      this.detailsPanel.innerHTML = `<div style="color: #94a3b8; font-size: 13px;">Select a star system to inspect survey data.</div>`;
      return;
    }

    const isLocked = this.activeCourseSystem?.id === sys.id;

    this.detailsPanel.innerHTML = `
      <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">SURVEY TARGET</div>
      <h2 style="font-size: 24px; font-weight: 300; margin: 4px 0 12px 0;">${sys.name}</h2>

      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-family: ui-monospace, monospace; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-bottom: 20px;">
        <div>Spectral Class: <span style="color: #${sys.star.lightColor.toString(16).padStart(6, '0')}; font-weight: bold;">${sys.star.spectralClass}</span></div>
        <div>Sector Coordinates: <span>[${sys.sectorX}, ${sys.sectorY}, ${sys.sectorZ}]</span></div>
        <div>Orbital Bodies: <span>${sys.planets.length} worlds</span></div>
        <div>Anomalies: <span style="color: #fbbf24;">${sys.anomalies?.length || 0} registered</span></div>
      </div>

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
        ">${isLocked ? '✓ COURSE LOCKED' : 'SET COURSE'}</button>

        <button id="holo-btn-engage-warp" style="
          padding: 12px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(14, 165, 233, 0.2));
          border: 1px solid rgba(56, 189, 248, 0.8);
          border-radius: 8px;
          color: #f8fafc;
          font-size: 12px;
          letter-spacing: 0.1em;
          font-weight: 600;
          cursor: pointer;
        ">ENGAGE DEEP CRUISE</button>
      </div>
    `;

    this.detailsPanel.querySelector('#holo-btn-lock-course')?.addEventListener('click', () => {
      audio.playConnectChime();
      this.activeCourseSystem = sys;
      if (this.onCourseSetCallback) this.onCourseSetCallback(sys);
      this.renderDetailsPanel();
    });

    this.detailsPanel.querySelector('#holo-btn-engage-warp')?.addEventListener('click', () => {
      audio.playConnectChime();
      this.activeCourseSystem = sys;
      this.onSelectDestination(sys);
      this.close();
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.animId) cancelAnimationFrame(this.animId);
    this.renderer.dispose();
    this.container.remove();
  }
}
