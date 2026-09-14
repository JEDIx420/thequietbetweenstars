import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';
import type { SectorCoord, WorldPosition } from '../game/universe/WorldPosition';
import type { SectorManager } from '../game/universe/SectorManager';
import { audio } from '../audio/AudioEngine';

export class StarChartModal {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private detailsPanel: HTMLElement;
  private isVisible = false;

  private sectorManager: SectorManager;
  private playerWorldPos: WorldPosition;
  private onSelectDestination: (system: StarSystemDescriptor) => void;

  private systems: Array<{ coord: SectorCoord; system: StarSystemDescriptor; distanceSectors: number }> = [];
  private selectedSystem: StarSystemDescriptor | null = null;
  private zoom = 32; // Pixels per sector unit
  private panOffset = { x: 0, y: 0 };
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };

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
      font-family: ui-sans-serif, system-ui, sans-serif;
      user-select: none;
    `;

    this.container.innerHTML = `
      <!-- Top Navigation Header -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 32px;
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
      ">
        <div>
          <div style="font-size: 11px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">GALACTIC NAVIGATION</div>
          <h2 style="font-size: 22px; font-weight: 300; margin: 4px 0 0 0;">In-Universe Star Chart</h2>
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
            cursor: pointer;
          ">CLOSE [ESC / M]</button>
        </div>
      </div>

      <!-- Main Chart Body: Canvas on Left, System Inspector on Right -->
      <div style="flex: 1; display: flex; position: relative; overflow: hidden;">
        <canvas id="starchart-canvas" style="flex: 1; cursor: grab;"></canvas>

        <!-- Right Side Details Drawer -->
        <div id="starchart-details" style="
          width: 360px;
          background: rgba(15, 23, 42, 0.95);
          border-left: 1px solid rgba(56, 189, 248, 0.25);
          padding: 24px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
        "></div>
      </div>
    `;

    parent.appendChild(this.container);

    this.canvas = this.container.querySelector('#starchart-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.detailsPanel = this.container.querySelector('#starchart-details') as HTMLElement;

    this.setupEvents();
  }

  private setupEvents(): void {
    const closeBtn = this.container.querySelector('#btn-chart-close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Window resize
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
      if (!this.isDragging) return;
      this.panOffset.x = e.clientX - this.dragStart.x;
      this.panOffset.y = e.clientY - this.dragStart.y;
      this.render();
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
      this.zoom = Math.max(14, Math.min(80, this.zoom * zoomFactor));
      this.render();
    });

    // Click to select system
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const cx = this.canvas.width / 2 + this.panOffset.x;
      const cy = this.canvas.height / 2 + this.panOffset.y;

      for (const entry of this.systems) {
        const sx = cx + (entry.coord.x - this.playerWorldPos.sector.x) * this.zoom;
        const sy = cy + (entry.coord.z - this.playerWorldPos.sector.z) * this.zoom;
        const dist = Math.hypot(clickX - sx, clickY - sy);

        if (dist < 14) {
          audio.playBlip();
          this.selectSystem(entry.system);
          return;
        }
      }
    });
  }

  public open(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.panOffset = { x: 0, y: 0 };
    this.zoom = 36;
    this.resizeCanvas();

    // Query 6-sector radius around player
    this.systems = this.sectorManager.getSystemsInRadius(this.playerWorldPos.sector, 6);

    // Default select current sector or closest system
    if (this.systems.length > 0) {
      this.selectSystem(this.systems[0].system);
    } else {
      this.renderDetailsEmpty();
    }

    this.render();
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.open();
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  private resizeCanvas(): void {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.render();
  }

  private selectSystem(sys: StarSystemDescriptor): void {
    this.selectedSystem = sys;
    this.renderDetails(sys);
    this.render();
  }

  private renderDetails(sys: StarSystemDescriptor): void {
    const isCurrent =
      sys.sectorX === this.playerWorldPos.sector.x &&
      sys.sectorY === this.playerWorldPos.sector.y &&
      sys.sectorZ === this.playerWorldPos.sector.z;

    const dx = sys.sectorX - this.playerWorldPos.sector.x;
    const dy = sys.sectorY - this.playerWorldPos.sector.y;
    const dz = sys.sectorZ - this.playerWorldPos.sector.z;
    const distSectors = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const planetsHtml = sys.planets.length > 0
      ? sys.planets.map((p) => `
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
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
        `).join('')
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
        <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">SYSTEM DATA</div>
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
        <div style="max-height: 220px; overflow-y: auto;">
          ${planetsHtml}
        </div>

        ${anomaliesHtml}
      </div>

      <div style="margin-top: 24px;">
        <button id="btn-chart-engage" style="
          width: 100%;
          padding: 14px 0;
          background: ${isCurrent ? 'rgba(30, 41, 59, 0.6)' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'};
          border: 1px solid ${isCurrent ? 'rgba(148, 163, 184, 0.3)' : 'rgba(56, 189, 248, 0.5)'};
          border-radius: 8px;
          color: white;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.1em;
          cursor: ${isCurrent ? 'default' : 'pointer'};
          opacity: ${isCurrent ? '0.6' : '1.0'};
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        ">
          ${isCurrent ? 'CURRENT SYSTEM (NO CRUISE NEEDED)' : 'ENGAGE DEEP CRUISE →'}
        </button>
      </div>
    `;

    if (!isCurrent) {
      this.detailsPanel.querySelector('#btn-chart-engage')?.addEventListener('click', () => {
        audio.playBlip();
        this.hide();
        this.onSelectDestination(sys);
      });
    }
  }

  private renderDetailsEmpty(): void {
    this.detailsPanel.innerHTML = `
      <div style="color: #64748b; font-size: 13px; text-align: center; margin-top: 60px;">
        NO STELLAR SYSTEMS IN SCAN RANGE
      </div>
    `;
  }

  private render(): void {
    if (!this.isVisible) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2 + this.panOffset.x;
    const cy = h / 2 + this.panOffset.y;

    // 1. Sector Grid Lines
    const minGridX = Math.floor(-cx / this.zoom) - 1;
    const maxGridX = Math.ceil((w - cx) / this.zoom) + 1;
    const minGridZ = Math.floor(-cy / this.zoom) - 1;
    const maxGridZ = Math.ceil((h - cy) / this.zoom) + 1;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
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

    // 2. Draw Range Circles around player
    const radii = [2, 4, 6];
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.setLineDash([4, 4]);
    for (const r of radii) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3. Render Star Systems
    for (const entry of this.systems) {
      const sx = cx + (entry.coord.x - this.playerWorldPos.sector.x) * this.zoom;
      const sy = cy + (entry.coord.z - this.playerWorldPos.sector.z) * this.zoom;
      const isSelected = this.selectedSystem?.id === entry.system.id;
      const isCurrent = entry.distanceSectors < 0.01;

      // Glow circle
      const starCol = entry.system.star.spectralClass === 'M' ? '#f87171'
        : entry.system.star.spectralClass === 'K' ? '#fbbf24'
        : entry.system.star.spectralClass === 'O' || entry.system.star.spectralClass === 'B' ? '#60a5fa'
        : '#fef08a';

      if (isCurrent) {
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = starCol;
      ctx.beginPath();
      ctx.arc(sx, sy, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();

      // Selected ring
      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.stroke();
      }

      // System label
      ctx.fillStyle = isSelected ? '#38bdf8' : '#94a3b8';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(entry.system.name, sx, sy - 12);
    }

    // 4. Player Ship Center Reticle
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', cx, cy + 18);
  }

  public dispose(): void {
    this.container.remove();
  }
}
