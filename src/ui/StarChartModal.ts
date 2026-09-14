import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';
import type { SectorCoord, WorldPosition } from '../game/universe/WorldPosition';
import type { SectorManager } from '../game/universe/SectorManager';
import { audio } from '../audio/AudioEngine';

export type StarChartScale = 'STELLAR' | 'SYSTEM';

export class StarChartModal {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private detailsPanel: HTMLElement;
  private isVisible = false;

  private sectorManager: SectorManager;
  private playerWorldPos: WorldPosition;
  private onSelectDestination: (system: StarSystemDescriptor) => void;
  private onCourseSetCallback: ((system: StarSystemDescriptor) => void) | null = null;

  private currentScale: StarChartScale = 'STELLAR';
  private systems: Array<{ coord: SectorCoord; system: StarSystemDescriptor; distanceSectors: number }> = [];
  public selectedSystem: StarSystemDescriptor | null = null;
  public activeCourseSystem: StarSystemDescriptor | null = null;
  private hoveredSystem: StarSystemDescriptor | null = null;

  private zoom = 36; // Pixels per sector unit in STELLAR view
  private panOffset = { x: 0, y: 0 };
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private animFrameId: number | null = null;
  private animTime = 0;

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
    this.container.id = 'starchart-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: radial-gradient(circle at 50% 50%, rgba(10, 15, 26, 0.96) 0%, rgba(3, 3, 7, 0.98) 100%);
      backdrop-filter: blur(12px);
      display: none;
      flex-direction: column;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      user-select: none;
    `;

    this.container.innerHTML = `
      <!-- Top Navigation Header -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 28px;
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
        background: rgba(10, 16, 28, 0.6);
      ">
        <div style="display: flex; align-items: center; gap: 20px;">
          <div>
            <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">GALACTIC NAVIGATION</div>
            <h2 style="font-size: 20px; font-weight: 300; margin: 2px 0 0 0;">Stellar & System Cartography</h2>
          </div>

          <!-- View Mode Toggle -->
          <div style="display: flex; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 6px; padding: 2px;">
            <button id="btn-scale-stellar" style="
              padding: 5px 14px;
              background: #0284c7;
              border: none;
              border-radius: 4px;
              color: #fff;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">STELLAR VIEW</button>
            <button id="btn-scale-system" style="
              padding: 5px 14px;
              background: transparent;
              border: none;
              border-radius: 4px;
              color: #94a3b8;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">SYSTEM VIEW</button>
          </div>
        </div>

        <div style="display: flex; gap: 16px; align-items: center;">
          <div id="chart-player-pos" style="font-family: ui-monospace, monospace; font-size: 12px; color: #94a3b8;">
            CURRENT SECTOR: [${playerWorldPos.sector.x}, ${playerWorldPos.sector.y}, ${playerWorldPos.sector.z}]
          </div>
          <button id="btn-chart-close" style="
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.3);
            color: #cbd5e1;
            padding: 6px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">CLOSE [ESC / M]</button>
        </div>
      </div>

      <!-- Main Chart Body: Flexible Canvas on Left, Guaranteed Fixed-width Drawer on Right -->
      <div style="flex: 1; display: flex; position: relative; overflow: hidden; min-height: 0;">
        <div style="flex: 1 1 auto; min-width: 0; position: relative; display: flex; overflow: hidden;">
          <canvas id="starchart-canvas" style="width: 100%; height: 100%; cursor: grab; display: block;"></canvas>
          
          <!-- On-canvas navigation helper instructions -->
          <div style="
            position: absolute;
            bottom: 16px;
            left: 20px;
            font-size: 11px;
            color: #64748b;
            font-family: ui-monospace, monospace;
            background: rgba(10, 16, 28, 0.7);
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.06);
            pointer-events: none;
          ">
            Drag to pan · Scroll to zoom · Click star to select
          </div>
        </div>

        <!-- Right Side Details Drawer - Guaranteed minimum and maximum width -->
        <div id="starchart-details" style="
          flex: 0 0 360px;
          width: 360px;
          min-width: 360px;
          max-width: 360px;
          background: rgba(15, 23, 42, 0.96);
          border-left: 1px solid rgba(56, 189, 248, 0.25);
          padding: 24px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
          z-index: 10;
        "></div>
      </div>
    `;

    parent.appendChild(this.container);

    this.canvas = this.container.querySelector('#starchart-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.detailsPanel = this.container.querySelector('#starchart-details') as HTMLElement;

    this.setupEvents();
  }

  public setOnCourseSet(cb: (sys: StarSystemDescriptor) => void): void {
    this.onCourseSetCallback = cb;
  }

  private setupEvents(): void {
    const closeBtn = this.container.querySelector('#btn-chart-close');
    closeBtn?.addEventListener('click', () => this.hide());

    const btnStellar = this.container.querySelector('#btn-scale-stellar') as HTMLElement;
    const btnSystem = this.container.querySelector('#btn-scale-system') as HTMLElement;

    btnStellar?.addEventListener('click', () => {
      this.setScale('STELLAR');
      btnStellar.style.background = '#0284c7';
      btnStellar.style.color = '#fff';
      btnSystem.style.background = 'transparent';
      btnSystem.style.color = '#94a3b8';
    });

    btnSystem?.addEventListener('click', () => {
      this.setScale('SYSTEM');
      btnSystem.style.background = '#0284c7';
      btnSystem.style.color = '#fff';
      btnStellar.style.background = 'transparent';
      btnStellar.style.color = '#94a3b8';
    });

    window.addEventListener('resize', () => {
      if (this.isVisible) this.resizeCanvas();
    });

    // Pan & Drag handlers
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.isDragging) {
        this.panOffset.x = e.clientX - this.dragStart.x;
        this.panOffset.y = e.clientY - this.dragStart.y;
      } else {
        // Hover detection
        this.checkHover(mouseX, mouseY);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    // Zoom handler
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
      this.zoom = Math.max(16, Math.min(90, this.zoom * zoomFactor));
    });

    // Click to select system
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const cx = this.canvas.width / 2 + this.panOffset.x;
      const cy = this.canvas.height / 2 + this.panOffset.y;

      if (this.currentScale === 'STELLAR') {
        for (const entry of this.systems) {
          const depthScale = 1.0 + entry.coord.y * 0.08;
          const sx = cx + (entry.coord.x - this.playerWorldPos.sector.x) * this.zoom;
          const sy = cy + (entry.coord.z - this.playerWorldPos.sector.z) * this.zoom - entry.coord.y * 6;
          const dist = Math.hypot(clickX - sx, clickY - sy);

          if (dist < 16 * depthScale) {
            audio.playBlip();
            this.selectSystem(entry.system);
            return;
          }
        }
      } else {
        // System view planet click
        const curSys = this.selectedSystem || (this.systems.length > 0 ? this.systems[0].system : null);
        if (curSys) {
          for (let i = 0; i < curSys.planets.length; i++) {
            const p = curSys.planets[i];
            const orbitR = (i + 1) * 38;
            const angle = (p.seed % 360) * (Math.PI / 180) + this.animTime * (0.015 / (i + 1));
            const px = cx + Math.cos(angle) * orbitR;
            const py = cy + Math.sin(angle) * orbitR;
            if (Math.hypot(clickX - px, clickY - py) < 14) {
              audio.playBlip();
              this.renderDetails(curSys, p.name);
              return;
            }
          }
        }
      }
    });
  }

  private checkHover(mouseX: number, mouseY: number): void {
    if (this.currentScale !== 'STELLAR') return;

    const cx = this.canvas.width / 2 + this.panOffset.x;
    const cy = this.canvas.height / 2 + this.panOffset.y;

    let found: StarSystemDescriptor | null = null;
    for (const entry of this.systems) {
      const sx = cx + (entry.coord.x - this.playerWorldPos.sector.x) * this.zoom;
      const sy = cy + (entry.coord.z - this.playerWorldPos.sector.z) * this.zoom - entry.coord.y * 6;
      if (Math.hypot(mouseX - sx, mouseY - sy) < 16) {
        found = entry.system;
        break;
      }
    }

    if (this.hoveredSystem !== found) {
      this.hoveredSystem = found;
      this.canvas.style.cursor = found ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
    }
  }

  public setScale(scale: StarChartScale): void {
    this.currentScale = scale;
    this.panOffset = { x: 0, y: 0 };
    if (this.selectedSystem) {
      this.renderDetails(this.selectedSystem);
    }
  }

  public open(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.panOffset = { x: 0, y: 0 };
    this.zoom = 36;
    this.resizeCanvas();

    // Query 7-sector radius around player
    this.systems = this.sectorManager.getSystemsInRadius(this.playerWorldPos.sector, 7);

    // Default select current sector system or closest
    if (!this.selectedSystem && this.systems.length > 0) {
      this.selectSystem(this.systems[0].system);
    } else if (this.selectedSystem) {
      this.renderDetails(this.selectedSystem);
    }

    this.startAnimationLoop();
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.open();
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  private startAnimationLoop(): void {
    const loop = (t: number) => {
      if (!this.isVisible) return;
      this.animTime = t * 0.001;
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(loop);
  }

  private resizeCanvas(): void {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  public selectSystem(sys: StarSystemDescriptor): void {
    this.selectedSystem = sys;
    this.renderDetails(sys);
  }

  private renderDetails(sys: StarSystemDescriptor, highlightedPlanetName?: string): void {
    const isCurrent =
      sys.sectorX === this.playerWorldPos.sector.x &&
      sys.sectorY === this.playerWorldPos.sector.y &&
      sys.sectorZ === this.playerWorldPos.sector.z;

    const isCourseSet = this.activeCourseSystem?.id === sys.id;

    const dx = sys.sectorX - this.playerWorldPos.sector.x;
    const dy = sys.sectorY - this.playerWorldPos.sector.y;
    const dz = sys.sectorZ - this.playerWorldPos.sector.z;
    const distSectors = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const planetsHtml = sys.planets.length > 0
      ? sys.planets.map((p) => {
          const isHigh = highlightedPlanetName === p.name;
          return `
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: ${isHigh ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.6)'};
              border: 1px solid ${isHigh ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'};
              border-radius: 6px;
              padding: 8px 12px;
              margin-bottom: 6px;
              font-size: 11px;
            ">
              <div>
                <span style="font-weight: 600; color: #f8fafc;">${p.name}</span>
                <span style="color: #64748b; margin-left: 6px;">${p.type}</span>
              </div>
              <span style="color: ${p.isLandable ? '#4ade80' : '#94a3b8'}; font-size: 10px;">
                ${p.isLandable ? 'LANDABLE' : 'GAS/BARREN'}
              </span>
            </div>
          `;
        }).join('')
      : '<div style="color: #64748b; font-size: 12px;">No major planetary bodies recorded.</div>';

    const anomaliesHtml = sys.anomalies && sys.anomalies.length > 0
      ? `
        <div style="margin-top: 14px;">
          <div style="font-size: 10px; letter-spacing: 0.15em; color: #f59e0b; text-transform: uppercase; margin-bottom: 6px;">
            DETECTED ANOMALIES
          </div>
          ${sys.anomalies.map(a => `
            <div style="font-size: 11px; color: #cbd5e1; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 6px 10px; margin-bottom: 4px;">
              ⚡ ${a.name} — <span style="color:#94a3b8;">${a.type}</span>
            </div>
          `).join('')}
        </div>
      `
      : '';

    this.detailsPanel.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">SYSTEM TELEMETRY</div>
          ${isCourseSet ? '<span style="font-size: 10px; color: #4ade80; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74,222,128,0.4); border-radius: 4px; padding: 2px 6px;">COURSE ACTIVE</span>' : ''}
        </div>
        <h2 style="font-size: 24px; font-weight: 400; margin: 4px 0 6px 0;">${sys.name}</h2>
        <div style="font-family: ui-monospace, monospace; font-size: 12px; color: #94a3b8; margin-bottom: 16px;">
          COORDS: [${sys.sectorX}, ${sys.sectorY}, ${sys.sectorZ}] · DIST: ${distSectors.toFixed(1)} sectors
        </div>

        <div style="background: rgba(30, 41, 59, 0.5); border-radius: 8px; padding: 12px; font-size: 11px; margin-bottom: 16px; border: 1px solid rgba(148, 163, 184, 0.2);">
          <div style="margin-bottom: 4px;"><b>Primary Star:</b> ${sys.star.name} (${sys.star.spectralClass}-class)</div>
          <div style="margin-bottom: 4px;"><b>Confirmed Worlds:</b> ${sys.planets.length}</div>
          <div><b>Status:</b> <span style="color: ${isCurrent ? '#38bdf8' : '#cbd5e1'};">${isCurrent ? 'LOCAL SECTOR' : 'REMOTE SYSTEM'}</span></div>
        </div>

        <div style="font-size: 10px; letter-spacing: 0.15em; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px;">
          CELESTIAL SURVEY
        </div>
        <div style="max-height: 200px; overflow-y: auto;">
          ${planetsHtml}
        </div>

        ${anomaliesHtml}
      </div>

      <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
        ${!isCurrent ? `
          <button id="btn-chart-set-course" style="
            width: 100%;
            padding: 12px 0;
            background: ${isCourseSet ? 'rgba(74, 222, 128, 0.2)' : 'rgba(56, 189, 248, 0.15)'};
            border: 1px solid ${isCourseSet ? '#4ade80' : 'rgba(56, 189, 248, 0.5)'};
            border-radius: 8px;
            color: ${isCourseSet ? '#4ade80' : '#38bdf8'};
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 0.1em;
            cursor: pointer;
          ">
            ${isCourseSet ? '✓ COURSE LOCKED' : 'SET COURSE (ROUTE)'}
          </button>

          <button id="btn-chart-engage" style="
            width: 100%;
            padding: 14px 0;
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
            border: 1px solid rgba(56, 189, 248, 0.5);
            border-radius: 8px;
            color: white;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.1em;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(2, 132, 199, 0.35);
          ">
            ENGAGE DEEP CRUISE →
          </button>
        ` : `
          <div style="text-align: center; color: #64748b; font-size: 12px; padding: 12px;">
            CURRENT LOCAL SYSTEM (NO WARP NEEDED)
          </div>
        `}
      </div>
    `;

    if (!isCurrent) {
      this.detailsPanel.querySelector('#btn-chart-set-course')?.addEventListener('click', () => {
        audio.playBlip();
        this.activeCourseSystem = sys;
        if (this.onCourseSetCallback) this.onCourseSetCallback(sys);
        this.renderDetails(sys);
      });

      this.detailsPanel.querySelector('#btn-chart-engage')?.addEventListener('click', () => {
        audio.playBlip();
        this.activeCourseSystem = sys;
        this.hide();
        this.onSelectDestination(sys);
      });
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2 + this.panOffset.x;
    const cy = h / 2 + this.panOffset.y;

    if (this.currentScale === 'STELLAR') {
      this.renderStellarView(ctx, w, h, cx, cy);
    } else {
      this.renderSystemView(ctx, w, h, cx, cy);
    }
  }

  private renderStellarView(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number
  ): void {
    // 1. Subtle 2.5D coordinate grid
    const minGridX = Math.floor(-cx / this.zoom) - 1;
    const maxGridX = Math.ceil((w - cx) / this.zoom) + 1;
    const minGridZ = Math.floor(-cy / this.zoom) - 1;
    const maxGridZ = Math.ceil((h - cy) / this.zoom) + 1;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = minGridX; gx <= maxGridX; gx++) {
      const x = cx + gx * this.zoom;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let gz = minGridZ; gz <= maxGridZ; gz++) {
      const y = cy + gz * this.zoom;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 2. Range radar circles
    const radii = [2, 4, 6];
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.setLineDash([4, 4]);
    for (const r of radii) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3. Draw Route Line if active course is set
    if (this.activeCourseSystem) {
      const targetX = cx + (this.activeCourseSystem.sectorX - this.playerWorldPos.sector.x) * this.zoom;
      const targetY = cy + (this.activeCourseSystem.sectorZ - this.playerWorldPos.sector.z) * this.zoom - this.activeCourseSystem.sectorY * 6;

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Render Star Nodes (NO overlapping labels!)
    for (const entry of this.systems) {
      const depthY = entry.coord.y * 6;
      const sx = cx + (entry.coord.x - this.playerWorldPos.sector.x) * this.zoom;
      const sy = cy + (entry.coord.z - this.playerWorldPos.sector.z) * this.zoom - depthY;

      const isSelected = this.selectedSystem?.id === entry.system.id;
      const isCourse = this.activeCourseSystem?.id === entry.system.id;
      const isHovered = this.hoveredSystem?.id === entry.system.id;
      const isCurrent = entry.distanceSectors < 0.01;

      // Depth offset line (giving 2.5D vertical position)
      if (Math.abs(depthY) > 2) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy + depthY);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      // Spectral colors
      const starCol = entry.system.star.spectralClass === 'M' ? '#f87171'
        : entry.system.star.spectralClass === 'K' ? '#fbbf24'
        : entry.system.star.spectralClass === 'O' || entry.system.star.spectralClass === 'B' ? '#60a5fa'
        : '#fef08a';

      // Subtle shimmer
      const shimmer = Math.sin(this.animTime * 2.5 + entry.system.seed) * 1.5;

      // Glow circle
      ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(sx, sy, (isSelected ? 10 : 7) + shimmer, 0, Math.PI * 2);
      ctx.fill();

      // Main star core
      ctx.fillStyle = starCol;
      ctx.beginPath();
      ctx.arc(sx, sy, isSelected ? 5.5 : 3.8, 0, Math.PI * 2);
      ctx.fill();

      // Reticle for selected / course
      if (isSelected || isCourse) {
        ctx.strokeStyle = isCourse ? '#4ade80' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.stroke();
      }

      // LABELS: ONLY show for Selected, Hovered, or Course system!
      if (isSelected || isHovered || isCourse || isCurrent) {
        ctx.fillStyle = isSelected ? '#38bdf8' : (isCourse ? '#4ade80' : '#cbd5e1');
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        const label = isCurrent ? `${entry.system.name} (YOU)` : entry.system.name;
        ctx.fillText(label, sx, sy - 14);

        // Distance subtitle
        if (!isCurrent) {
          ctx.fillStyle = '#64748b';
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText(`${entry.distanceSectors.toFixed(1)} sec`, sx, sy + 18);
        }
      }
    }

    // 5. Current Player Reticle
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderSystemView(
    ctx: CanvasRenderingContext2D,
    _w: number,
    _h: number,
    cx: number,
    cy: number
  ): void {
    const sys = this.selectedSystem || (this.systems.length > 0 ? this.systems[0].system : null);
    if (!sys) return;

    // Central Star
    const starCol = sys.star.spectralClass === 'M' ? '#f87171'
      : sys.star.spectralClass === 'K' ? '#fbbf24'
      : sys.star.spectralClass === 'O' || sys.star.spectralClass === 'B' ? '#60a5fa'
      : '#fef08a';

    ctx.fillStyle = starCol;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sys.star.name, cx, cy - 28);

    // Planets and Orbital tracks
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      const orbitR = (i + 1) * 38;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
      ctx.stroke();

      const angle = (p.seed % 360) * (Math.PI / 180) + this.animTime * (0.015 / (i + 1));
      const px = cx + Math.cos(angle) * orbitR;
      const py = cy + Math.sin(angle) * orbitR;

      ctx.fillStyle = p.palette?.primary || '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, px, py - 10);
    }
  }

  public dispose(): void {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.container.remove();
  }
}
