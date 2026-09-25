import type { PlanetDescriptor, SpaceAnomalyDescriptor } from '../systems/PlanetDescriptor';
import type { AutopilotController } from '../flight/AutopilotController';
import * as THREE from 'three';

export interface RadarTargetItem {
  id: string;
  name: string;
  type: string;
  position: THREE.Vector3;
  color: string;
  isAnomaly?: boolean;
  isStoryTarget?: boolean;
  storyTag?: string;
  descriptor?: PlanetDescriptor;
  anomaly?: SpaceAnomalyDescriptor;
}

export class NavRadar {
  public container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private targetInfoEl: HTMLElement;
  private autopilotController: AutopilotController;

  private targets: RadarTargetItem[] = [];
  private selectedIndex = 0;
  private radarRadius = 65;
  private onTargetCycleCallback: ((target: RadarTargetItem) => void) | null = null;
  private onOpenSystemMapCallback: (() => void) | null = null;

  // Static scratch vector & offscreen background canvas for high performance rendering
  private static readonly scratchForward = new THREE.Vector3();
  private bgCanvas: HTMLCanvasElement;
  private lastChipKey = '';
  private freeExplorationMode = false;
  private activeStoryObjectiveId: string | null = null;
  private activeStoryObjectiveLabel: string | null = null;
  private onTrackObjectiveCallback: ((targetId: string) => void) | null = null;

  public setFreeExplorationMode(enabled: boolean): void {
    this.freeExplorationMode = enabled;
  }

  public isFreeExplorationMode(): boolean {
    return this.freeExplorationMode;
  }

  public setActiveStoryObjective(id: string | null, label?: string | null): void {
    this.activeStoryObjectiveId = id;
    this.activeStoryObjectiveLabel = label || null;
  }

  public getActiveStoryObjectiveId(): string | null {
    return this.activeStoryObjectiveId;
  }

  public getActiveStoryObjectiveLabel(): string | null {
    return this.activeStoryObjectiveLabel;
  }

  public setOnTrackObjective(cb: (targetId: string) => void): void {
    this.onTrackObjectiveCallback = cb;
  }

  public selectActiveStoryObjective(): boolean {
    if (!this.activeStoryObjectiveId) return false;
    return this.selectTargetById(this.activeStoryObjectiveId);
  }

  constructor(parent: HTMLElement, autopilot: AutopilotController) {
    this.autopilotController = autopilot;

    this.container = document.createElement('div');
    this.container.id = 'nav-radar-widget';

    // Injected responsive style tag for mobile/tablet screen adaptation
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #nav-radar-widget {
        position: fixed;
        bottom: 50px;
        right: 24px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        z-index: 100;
        pointer-events: auto;
        user-select: none;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      #nav-radar-widget .radar-canvas {
        position: relative !important;
        inset: auto !important;
        display: block !important;
        flex-shrink: 0 !important;
        width: 140px !important;
        height: 140px !important;
        border-radius: 50% !important;
        box-sizing: border-box !important;
      }
      #nav-radar-widget .radar-info {
        position: relative !important;
        inset: auto !important;
        box-sizing: border-box !important;
      }
      /* Tablet & Touch Devices: Move radar below top header bar and keep bottom-right clear for throttle & action buttons */
      @media (pointer: coarse), (max-width: 1366px) and (hover: none) {
        #nav-radar-widget {
          bottom: auto !important;
          top: max(48px, calc(env(safe-area-inset-top, 0px) + 42px)) !important;
          right: max(12px, env(safe-area-inset-right, 12px)) !important;
          gap: 8px !important;
          flex-direction: row-reverse !important;
          align-items: center !important;
        }
        #nav-radar-widget .radar-canvas {
          width: 88px !important;
          height: 88px !important;
        }
        #nav-radar-widget .radar-info {
          max-width: 150px !important;
          padding: 5px 8px !important;
          font-size: 9px !important;
        }
      }
      body.touch-controls-active #nav-radar-widget {
        bottom: auto !important;
        top: max(48px, calc(env(safe-area-inset-top, 0px) + 42px)) !important;
        right: max(12px, env(safe-area-inset-right, 12px)) !important;
        gap: 8px !important;
        flex-direction: row-reverse !important;
        align-items: center !important;
      }
      body.touch-controls-active #nav-radar-widget .radar-canvas {
        width: 88px !important;
        height: 88px !important;
      }
      body.touch-controls-active #nav-radar-widget .radar-info {
        max-width: 150px !important;
        padding: 5px 8px !important;
        font-size: 9px !important;
      }
      /* Compact Phone Overrides */
      @media (max-width: 850px), (max-height: 520px) {
        #nav-radar-widget {
          bottom: auto !important;
          top: max(46px, calc(env(safe-area-inset-top, 0px) + 40px)) !important;
          right: max(10px, env(safe-area-inset-right, 10px)) !important;
          gap: 6px !important;
          flex-direction: row-reverse !important;
          align-items: center !important;
        }
        #nav-radar-widget .radar-canvas {
          width: 78px !important;
          height: 78px !important;
        }
        #nav-radar-widget .radar-info {
          max-width: 130px !important;
          padding: 3px 6px !important;
          font-size: 8px !important;
          text-align: right;
          background: rgba(10, 16, 28, 0.9) !important;
        }
      }
    `;
    this.container.appendChild(styleEl);

    // Holographic radar canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'nav-radar-canvas';
    this.canvas.className = 'radar-canvas';
    this.canvas.width = 140;
    this.canvas.height = 140;
    this.canvas.title = 'Click to cycle target · Double-click for Map';
    this.canvas.style.cssText = `
      position: relative !important;
      inset: auto !important;
      display: block !important;
      flex-shrink: 0 !important;
      width: 140px;
      height: 140px;
      border-radius: 50% !important;
      background: radial-gradient(circle, rgba(15, 23, 42, 0.92) 0%, rgba(3, 7, 18, 0.98) 100%) !important;
      border: 1px solid rgba(56, 189, 248, 0.4) !important;
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.2), inset 0 0 16px rgba(0, 0, 0, 0.8) !important;
      cursor: pointer;
    `;
    this.ctx = this.canvas.getContext('2d')!;

    // Static background offscreen canvas
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = 140;
    this.bgCanvas.height = 140;
    this.renderStaticBackground();

    // Info chip below radar
    this.targetInfoEl = document.createElement('div');
    this.targetInfoEl.className = 'radar-info';
    this.targetInfoEl.style.cssText = `
      position: relative !important;
      inset: auto !important;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 8px;
      padding: 7px 12px;
      font-size: 10px;
      color: #cbd5e1;
      max-width: 200px;
      text-align: right;
      line-height: 1.4;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
    `;

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.targetInfoEl);
    parent.appendChild(this.container);

    this.canvas.addEventListener('click', () => {
      this.cycleTarget();
    });

    this.canvas.addEventListener('dblclick', () => {
      if (this.onOpenSystemMapCallback) this.onOpenSystemMapCallback();
    });

    this.targetInfoEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('#radar-btn-track-objective') || target.closest('.radar-objective-badge')) {
        e.stopPropagation();
        if (this.activeStoryObjectiveId && this.onTrackObjectiveCallback) {
          this.onTrackObjectiveCallback(this.activeStoryObjectiveId);
        } else if (this.activeStoryObjectiveId) {
          this.selectActiveStoryObjective();
        }
      }
    });
  }

  private renderStaticBackground(): void {
    const ctx = this.bgCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.bgCanvas.width;
    const h = this.bgCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const rMax = this.radarRadius - 4;

    ctx.clearRect(0, 0, w, h);

    // 1. Forward Vision Cone (Frustum Wedge ±32° matching chase camera FOV)
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.07)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, this.radarRadius, -Math.PI / 2 - 0.56, -Math.PI / 2 + 0.56);
    ctx.closePath();
    ctx.fill();

    // Vision cone radial dashed edges
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(-Math.PI / 2 - 0.56) * this.radarRadius, cy + Math.sin(-Math.PI / 2 - 0.56) * this.radarRadius);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(-Math.PI / 2 + 0.56) * this.radarRadius, cy + Math.sin(-Math.PI / 2 + 0.56) * this.radarRadius);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 2. Concentric Holographic Range Rings & Scale Markers
    const ringRadii = [rMax * 0.33, rMax * 0.66, rMax];
    const ringLabels = ['1.2k', '5.5k', '25k'];

    ctx.lineWidth = 1;
    for (let i = 0; i < ringRadii.length; i++) {
      const rad = ringRadii[i];
      ctx.strokeStyle = i === ringRadii.length - 1 ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle range markings
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.font = '7.5px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(ringLabels[i], cx + 4, cy - rad + 8);
    }

    // Crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - this.radarRadius);
    ctx.lineTo(cx, cy + this.radarRadius);
    ctx.moveTo(cx - this.radarRadius, cy);
    ctx.lineTo(cx + this.radarRadius, cy);
    ctx.stroke();
  }

  public setOnTargetCycle(cb: (target: RadarTargetItem) => void): void {
    this.onTargetCycleCallback = cb;
  }

  public setOnOpenSystemMap(cb: () => void): void {
    this.onOpenSystemMapCallback = cb;
  }

  public setPlanets(
    planets: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }>,
    anomalies: SpaceAnomalyDescriptor[] = [],
    courierPodPos?: THREE.Vector3,
    extraTargets: RadarTargetItem[] = []
  ): void {
    const list: RadarTargetItem[] = [];

    for (const p of planets) {
      list.push({
        id: p.descriptor.id,
        name: p.descriptor.name,
        type: p.descriptor.type,
        position: p.position,
        color: p.descriptor.palette?.primary || '#38bdf8',
        descriptor: p.descriptor,
      });
    }

    // Add space anomalies to radar targets
    for (const a of anomalies) {
      const pos = a.position
        ? new THREE.Vector3(a.position.x, a.position.y, a.position.z)
        : new THREE.Vector3(Math.cos(a.angle || 0) * (a.distanceFromStar || 1200), 0, Math.sin(a.angle || 0) * (a.distanceFromStar || 1200));
      const isResonance = a.hasResonance || a.signature?.isResonanceAnomaly || a.type === 'RESONANCE_ECHO' || a.type === 'resonance_monolith' || a.id.startsWith('story_');
      list.push({
        id: a.id,
        name: a.name,
        type: a.type,
        position: pos,
        color: a.color || (isResonance ? '#38bdf8' : '#f59e0b'),
        isAnomaly: true,
        isStoryTarget: isResonance,
        storyTag: isResonance ? 'RESONANCE SIGNAL' : undefined,
        anomaly: a,
      });
    }

    // Add active courier pod delivery target if present
    if (courierPodPos) {
      list.push({
        id: 'courier_pod',
        name: 'SUPPLY COURIER POD',
        type: 'delivery_pod',
        position: courierPodPos,
        color: '#38bdf8',
        isAnomaly: false,
      });
    }

    // Add active story entities (stations, vessels, relays)
    for (const extra of extraTargets) {
      list.push(extra);
    }

    this.targets = list;
    if (this.targets.length > 0 && !this.autopilotController.currentTarget) {
      this.selectTargetIndex(0);
    }
  }

  public setSurfaceTargets(
    pickups: Array<{ position: THREE.Vector3; amount: number }> = [],
    encounterSites: Array<{ position: THREE.Vector3; name: string }> = []
  ): void {
    const list: RadarTargetItem[] = [];

    for (const site of encounterSites) {
      list.push({
        id: `beacon_${site.name}`,
        name: site.name,
        type: 'cultural_beacon',
        position: site.position,
        color: '#a855f7',
        isAnomaly: false,
      });
    }

    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      list.push({
        id: `pickup_${i}`,
        name: `DATA MOTE (+${p.amount} SC)`,
        type: 'credit_pickup',
        position: p.position,
        color: '#38bdf8',
        isAnomaly: false,
      });
    }

    this.targets = list;
    if (this.targets.length > 0 && this.selectedIndex >= this.targets.length) {
      this.selectedIndex = 0;
    }
  }

  public cycleTarget(): void {
    if (this.targets.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.targets.length;
    this.selectTargetIndex(this.selectedIndex);
  }

  public selectTargetIndex(index: number): void {
    if (index >= 0 && index < this.targets.length) {
      this.selectedIndex = index;
      const t = this.targets[index];
      if (t.descriptor) {
        this.autopilotController.setTarget({
          type: 'planet',
          descriptor: t.descriptor,
          position: t.position,
        });
      } else {
        this.autopilotController.setTarget({
          type: 'vector',
          heading: t.position.clone().normalize(),
          name: t.name,
        });
      }

      if (this.onTargetCycleCallback) {
        this.onTargetCycleCallback(t);
      }
    }
  }

  public hasTargetId(id: string): boolean {
    return this.targets.some((t) => t.id === id);
  }

  public get currentTarget(): RadarTargetItem | null {
    return this.targets[this.selectedIndex] || null;
  }

  public selectTargetById(id: string): boolean {
    const idx = this.targets.findIndex((t) => t.id === id);
    if (idx >= 0) {
      this.selectTargetIndex(idx);
      return true;
    }
    return false;
  }

  public onRebase(offset: THREE.Vector3): void {
    for (const t of this.targets) {
      if (t.isAnomaly || t.id === 'courier_pod') {
        t.position.add(offset);
      }
    }
  }

  public selectTargetInForwardView(shipPos: THREE.Vector3, shipQuat: THREE.Quaternion): boolean {
    if (this.targets.length === 0) return false;

    const shipForward = NavRadar.scratchForward.set(0, 0, -1).applyQuaternion(shipQuat);
    const shipYaw = Math.atan2(shipForward.x, -shipForward.z);

    let bestIndex = -1;
    let minAngleDiff = 0.58; // within ~33° forward vision cone

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      const dx = t.position.x - shipPos.x;
      const dz = t.position.z - shipPos.z;
      const targetYaw = Math.atan2(dx, -dz);
      let diff = Math.abs(targetYaw - shipYaw);
      while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

      if (diff < minAngleDiff) {
        minAngleDiff = diff;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      this.selectTargetIndex(bestIndex);
      return true;
    }
    return false;
  }

  public getSelectedTarget(): RadarTargetItem | null {
    if (this.targets.length === 0) return null;
    return this.targets[this.selectedIndex] || null;
  }

  public getSelectedPlanet(): { descriptor: PlanetDescriptor; position: THREE.Vector3 } | null {
    const t = this.getSelectedTarget();
    if (t && t.descriptor) {
      return { descriptor: t.descriptor, position: t.position };
    }
    return null;
  }

  public update(
    shipPos: THREE.Vector3,
    shipQuat: THREE.Quaternion,
    sunPos: THREE.Vector3,
    _radarRange = 25000
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const rMax = this.radarRadius - 4;

    ctx.clearRect(0, 0, w, h);
    if (ctx.drawImage) {
      ctx.drawImage(this.bgCanvas, 0, 0);
    }

    // 3. Stabilized Horizontal Heading Calculation (Invariant to pitch and roll)
    const shipForward = NavRadar.scratchForward.set(0, 0, -1).applyQuaternion(shipQuat);
    const shipYaw = Math.atan2(shipForward.x, -shipForward.z);

    // Smooth logarithmic distance projection mapping 0 to 25,000 units
    const maxSystemRange = 25000;
    const logMax = Math.log10(1 + maxSystemRange / 250);
    const computeRadarPos = (targetPos: THREE.Vector3) => {
      const dx = targetPos.x - shipPos.x;
      const dy = targetPos.y - shipPos.y;
      const dz = targetPos.z - shipPos.z;
      const dist3D = Math.hypot(dx, dy, dz);
      const targetYaw = Math.atan2(dx, -dz);
      let relAngle = targetYaw - shipYaw;
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;

      // Logarithmic radial scale
      const r = Math.min(rMax, (Math.log10(1 + dist3D / 250) / logMax) * rMax);
      const px = cx + Math.sin(relAngle) * r;
      const py = cy - Math.cos(relAngle) * r;
      const inForwardCone = Math.abs(relAngle) <= 0.56;

      return { px, py, r, dist3D, dy, relAngle, inForwardCone };
    };

    // 4. Draw Sun / Primary Star
    const sunData = computeRadarPos(sunPos);
    ctx.save();
    // Sun corona glow
    const sunGrad = ctx.createRadialGradient(sunData.px, sunData.py, 1, sunData.px, sunData.py, 8);
    sunGrad.addColorStop(0, '#fef08a');
    sunGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.5)');
    sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunData.px, sunData.py, 8, 0, Math.PI * 2);
    ctx.fill();
    // Sun core
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(sunData.px, sunData.py, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. Draw Radar Targets (Planets, Anomalies, Courier Pod)
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      const data = computeRadarPos(t.position);
      const isSelected = i === this.selectedIndex;

      ctx.save();

      if (t.type === 'credit_pickup') {
        // Diamond credit mote
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(data.px, data.py - 3.5);
        ctx.lineTo(data.px + 3, data.py);
        ctx.lineTo(data.px, data.py + 3.5);
        ctx.lineTo(data.px - 3, data.py);
        ctx.closePath();
        ctx.fill();
      } else if (t.type === 'cultural_beacon') {
        // Cultural Beacon: violet ring with bright core
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(data.px, data.py, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f3e8ff';
        ctx.beginPath();
        ctx.arc(data.px, data.py, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.isAnomaly) {
        // Space Anomaly: amber diamond with glow
        const isResonance = !this.freeExplorationMode && (t.isStoryTarget || t.anomaly?.hasResonance || t.anomaly?.signature?.isResonanceAnomaly || t.id.startsWith('story_'));
        ctx.fillStyle = isResonance ? '#38bdf8' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(data.px, data.py - 4);
        ctx.lineTo(data.px + 4, data.py);
        ctx.lineTo(data.px, data.py + 4);
        ctx.lineTo(data.px - 4, data.py);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = isResonance ? 'rgba(56, 189, 248, 0.7)' : 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (t.type === 'station' || t.type === 'vessel' || t.type === 'relay') {
        // Story Station / Vessel / Relay: prominent glowing node
        ctx.fillStyle = t.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(data.px, data.py, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (t.type === 'gas-giant') {
        // Gas giant: larger sphere with horizontal ring slash
        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.beginPath();
        ctx.arc(data.px, data.py, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(data.px, data.py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(data.px - 6, data.py);
        ctx.lineTo(data.px + 6, data.py);
        ctx.stroke();
      } else {
        // Terrestrial / Moon / Ice / Volcanic Planet: crisp glowing celestial node
        // High-contrast outer halo ensuring dark basalt/hematite planets are always clearly visible
        ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(data.px, data.py, isSelected ? 4.8 : 3.6, 0, Math.PI * 2);
        ctx.stroke();

        // Planet core
        ctx.fillStyle = t.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(data.px, data.py, isSelected ? 3.6 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Elevation Indicator Stalk / Marker (above/below current plane)
      if (Math.abs(data.dy) > 180) {
        ctx.fillStyle = data.dy > 0 ? '#4ade80' : '#f87171';
        ctx.font = '8px ui-monospace, monospace';
        const glyph = data.dy > 0 ? '▲' : '▼';
        ctx.fillText(glyph, data.px - 3, data.dy > 0 ? data.py - 6 : data.py + 11);
      }

      // Dedicated Story / Resonance harmonic wave animation (suppressed in Free Roam mode)
      const isStory = !this.freeExplorationMode && (t.isStoryTarget || t.anomaly?.hasResonance || t.anomaly?.signature?.isResonanceAnomaly || t.type === 'station' || t.type === 'vessel' || t.type === 'relay' || t.id.startsWith('story_'));
      if (isStory) {
        const pulseTime = Date.now() * 0.0035;
        const pulseRadius = 5.2 + Math.sin(pulseTime) * 1.2;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(data.px, data.py, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Second outer harmonic wave ripple
        const ripplePhase = (Date.now() % 1600) / 1600;
        const rippleRadius = 6.5 + ripplePhase * 5.0;
        const rippleAlpha = 1.0 - ripplePhase;
        ctx.strokeStyle = `rgba(129, 140, 248, ${rippleAlpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(data.px, data.py, rippleRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Selected Target Reticle with Animated Corner Brackets
      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        const boxSize = 7;
        ctx.strokeRect(data.px - boxSize, data.py - boxSize, boxSize * 2, boxSize * 2);

        // Forward indicator tick
        ctx.beginPath();
        ctx.moveTo(data.px, data.py - boxSize - 3);
        ctx.lineTo(data.px, data.py - boxSize);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 5.5 Active Story Objective Minimap Beacon & Perimeter Rim Waypoint Pointer
    if (!this.freeExplorationMode && this.activeStoryObjectiveId) {
      const objTarget = this.targets.find((t) => t.id === this.activeStoryObjectiveId);
      if (objTarget) {
        const objData = computeRadarPos(objTarget.position);
        const pulseTime = Date.now() * 0.004;
        const pulseAlpha = 0.7 + Math.sin(pulseTime) * 0.3;

        ctx.save();

        // 1. Radar Map Diamond Beacon & Ripple Rings
        ctx.strokeStyle = `rgba(251, 191, 36, ${pulseAlpha})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(objData.px, objData.py, 7.5 + Math.sin(pulseTime * 1.6) * 2, 0, Math.PI * 2);
        ctx.stroke();

        const ripplePhase = (Date.now() % 1400) / 1400;
        const rippleRad = 7.5 + ripplePhase * 10;
        const rippleOpacity = (1.0 - ripplePhase) * 0.7;
        ctx.strokeStyle = `rgba(245, 158, 11, ${rippleOpacity})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(objData.px, objData.py, rippleRad, 0, Math.PI * 2);
        ctx.stroke();

        // Glowing gold diamond core
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(objData.px, objData.py - 5);
        ctx.lineTo(objData.px + 5, objData.py);
        ctx.lineTo(objData.px, objData.py + 5);
        ctx.lineTo(objData.px - 5, objData.py);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fffbeb';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Text tag on minimap
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 7.5px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✦ MISSION', objData.px, objData.py - 8);

        ctx.restore();

        // 2. Animated Perimeter Rim Waypoint Chevron (Compass Pointer)
        const rimAngle = objData.relAngle;
        const rimRadius = rMax + 1;
        const rimPx = cx + Math.sin(rimAngle) * rimRadius;
        const rimPy = cy - Math.cos(rimAngle) * rimRadius;

        ctx.save();
        ctx.translate(rimPx, rimPy);
        ctx.rotate(rimAngle);

        // Pulsing background glow on the rim
        ctx.fillStyle = `rgba(251, 191, 36, ${pulseAlpha * 0.45})`;
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Golden directional chevron arrow pointing along bearing
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#fffbeb';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -6.5);
        ctx.lineTo(4.5, 3);
        ctx.lineTo(0, 1.2);
        ctx.lineTo(-4.5, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Objective distance readout on radar rim when distant (> 600m)
        if (objData.dist3D > 600) {
          ctx.save();
          const distKm = objData.dist3D >= 1000
            ? `${(objData.dist3D / 1000).toFixed(1)}k`
            : `${Math.round(objData.dist3D)}m`;
          const textDist = rMax - 11;
          const textPx = cx + Math.sin(rimAngle) * textDist;
          const textPy = cy - Math.cos(rimAngle) * textDist;
          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 7px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(distKm, textPx, textPy);
          ctx.restore();
        }
      }
    }

    // 6. Ship Center Chevron (Pointing Up along heading)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4.5, cy + 4.5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx + 4.5, cy + 4.5);
    ctx.closePath();
    ctx.fill();

    // 7. Update Target Information Chip (dirty-checked to eliminate DOM string parsing overhead)
    const active = this.getSelectedTarget();
    if (active) {
      const d = Math.round(active.position.distanceTo(shipPos));
      const autoOn = this.autopilotController.isActive;
      const isObjective = !this.freeExplorationMode && (active.id === this.activeStoryObjectiveId);
      const chipKey = `${active.id}_${d}_${autoOn}_${isObjective}`;
      if (chipKey !== this.lastChipKey) {
        this.lastChipKey = chipKey;
        const isTouch = typeof window !== 'undefined' && (
          'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
          document.body?.classList?.contains?.('touch-controls-active')
        );
        const autoText = autoOn
          ? '<span style="color:#4ade80; font-weight: 700;">[AUTOPILOT ON]</span>'
          : isTouch
            ? '<span style="color:#94a3b8;">[Tap / TARGET: Cycle]</span>'
            : '<span style="color:#94a3b8;">[TAB: Cycle · T: Target Ahead]</span>';

        const isStoryObjective = active.isStoryTarget || active.id.startsWith('story_');
        const badgeLabel = isStoryObjective ? '✦ MISSION' : '✦ CONTACT';
        const storyBadge = isObjective
          ? `<span class="radar-objective-badge" style="color:#fbbf24; font-size:8px; font-weight:700; letter-spacing:0.1em; border:1px solid rgba(251, 191, 36, 0.7); background:rgba(251, 191, 36, 0.18); border-radius:3px; padding:1px 4px; margin-left:5px; cursor:pointer;">${badgeLabel}</span>`
          : active.type === 'station'
            ? '<span style="color:#38bdf8; font-size:8px; font-weight:700; letter-spacing:0.1em; border:1px solid rgba(56, 189, 248, 0.6); border-radius:3px; padding:1px 4px; margin-left:5px;">STATION</span>'
            : active.type === 'vessel'
              ? '<span style="color:#c084fc; font-size:8px; font-weight:700; letter-spacing:0.1em; border:1px solid rgba(192, 132, 252, 0.6); border-radius:3px; padding:1px 4px; margin-left:5px;">VESSEL</span>'
              : active.isAnomaly
                ? '<span style="color:#f59e0b; font-size:8px; font-weight:700; letter-spacing:0.1em; border:1px solid rgba(245, 158, 11, 0.6); border-radius:3px; padding:1px 4px; margin-left:5px;">ANOMALY</span>'
                : '';
        const typeLabel = active.isAnomaly ? `⚡ ${active.type}` : active.type;
        const objectiveActionHtml = isObjective && !autoOn
          ? '<div style="margin-top: 3px;"><button id="radar-btn-track-objective" style="background: rgba(251, 191, 36, 0.18); border: 1px solid rgba(251, 191, 36, 0.7); color: #fbbf24; font-size: 8px; font-weight: 700; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-family: inherit;">🎯 TRACK OBJECTIVE</button></div>'
          : '';

        this.targetInfoEl.innerHTML = `
          <div style="color: ${isObjective ? '#fbbf24' : '#38bdf8'}; font-weight: 600; font-size: 11px;">${active.name}${storyBadge}</div>
          <div style="font-size: 9px; color: #cbd5e1; margin-top: 1px;">${typeLabel} · ${d}u</div>
          <div style="font-size: 9px; margin-top: 3px;">${autoText}</div>
          ${objectiveActionHtml}
        `;
      }
    } else if (this.lastChipKey !== '__none__') {
      this.lastChipKey = '__none__';
      this.targetInfoEl.innerHTML = '<div style="color: #64748b;">NO TARGET SELECTED</div>';
    }
  }

  public dispose(): void {
    this.container.remove();
  }
}
