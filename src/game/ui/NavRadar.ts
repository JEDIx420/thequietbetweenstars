import type { PlanetDescriptor } from '../systems/PlanetDescriptor';
import type { AutopilotController } from '../flight/AutopilotController';
import * as THREE from 'three';

export class NavRadar {
  public container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private targetInfoEl: HTMLElement;
  private autopilotController: AutopilotController;

  private planets: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }> = [];
  private selectedIndex = 0;
  private radarRadius = 65;

  constructor(parent: HTMLElement, autopilot: AutopilotController) {
    this.autopilotController = autopilot;

    this.container = document.createElement('div');
    this.container.id = 'nav-radar-widget';
    this.container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 28px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      z-index: 100;
      pointer-events: auto;
      user-select: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    `;

    // Holographic radar canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 140;
    this.canvas.height = 140;
    this.canvas.style.cssText = `
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(15, 23, 42, 0.9) 0%, rgba(3, 7, 18, 0.95) 100%);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.2), inset 0 0 16px rgba(0, 0, 0, 0.8);
      cursor: pointer;
    `;
    this.ctx = this.canvas.getContext('2d')!;

    // Info chip below radar
    this.targetInfoEl = document.createElement('div');
    this.targetInfoEl.style.cssText = `
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 10px;
      color: #cbd5e1;
      max-width: 180px;
      text-align: right;
      line-height: 1.4;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.targetInfoEl);
    parent.appendChild(this.container);

    // Clicking radar cycles targets
    this.canvas.addEventListener('click', () => {
      this.cycleTarget();
    });
  }

  public setPlanets(planets: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }>): void {
    this.planets = planets;
    if (this.planets.length > 0 && !this.autopilotController.currentTarget) {
      this.selectTargetIndex(0);
    }
  }

  public cycleTarget(): void {
    if (this.planets.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.planets.length;
    this.selectTargetIndex(this.selectedIndex);
  }

  public selectTargetIndex(index: number): void {
    if (index >= 0 && index < this.planets.length) {
      this.selectedIndex = index;
      const p = this.planets[index];
      this.autopilotController.setTarget({
        type: 'planet',
        descriptor: p.descriptor,
        position: p.position,
      });
    }
  }

  public getSelectedPlanet(): { descriptor: PlanetDescriptor; position: THREE.Vector3 } | null {
    if (this.planets.length === 0) return null;
    return this.planets[this.selectedIndex] || null;
  }

  public update(
    shipPos: THREE.Vector3,
    shipQuat: THREE.Quaternion,
    sunPos: THREE.Vector3,
    radarRange = 4000
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = this.radarRadius / radarRange;

    ctx.clearRect(0, 0, w, h);

    // 1. Concentric Holographic Range Rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radarRadius * 0.33, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, this.radarRadius * 0.66, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, this.radarRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - this.radarRadius);
    ctx.lineTo(cx, cy + this.radarRadius);
    ctx.moveTo(cx - this.radarRadius, cy);
    ctx.lineTo(cx + this.radarRadius, cy);
    ctx.stroke();

    // Transform from world to ship-relative top-down (XZ) coordinates
    const invShipQuat = shipQuat.clone().invert();

    // 2. Draw Sun / Primary Star
    const sunRel = sunPos.clone().sub(shipPos).applyQuaternion(invShipQuat);
    const sunDist = Math.sqrt(sunRel.x * sunRel.x + sunRel.z * sunRel.z);
    const sunR = Math.min(this.radarRadius - 3, sunDist * scale);
    const sunAngle = Math.atan2(sunRel.x, -sunRel.z);
    const sunPx = cx + Math.sin(sunAngle) * sunR;
    const sunPy = cy - Math.cos(sunAngle) * sunR;

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(sunPx, sunPy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 3. Draw Celestial Bodies (Planets)
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      const rel = p.position.clone().sub(shipPos).applyQuaternion(invShipQuat);
      const dist = Math.sqrt(rel.x * rel.x + rel.z * rel.z);
      const isSelected = i === this.selectedIndex;

      const r = Math.min(this.radarRadius - 4, dist * scale);
      const angle = Math.atan2(rel.x, -rel.z);
      const px = cx + Math.sin(angle) * r;
      const py = cy - Math.cos(angle) * r;

      // Color from planet palette
      const col = p.descriptor.palette.primary || '#38bdf8';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Selected Reticle
      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 6, py - 6, 12, 12);
      }
    }

    // 4. Ship Center Chevron (Pointing Up)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();

    // 5. Update Target Information Chip
    const active = this.getSelectedPlanet();
    if (active) {
      const d = active.position.distanceTo(shipPos);
      const autoText = this.autopilotController.isActive ? '<span style="color:#4ade80;">[AUTOPILOT ON]</span>' : '<span style="color:#94a3b8;">[TAB: Cycle]</span>';
      this.targetInfoEl.innerHTML = `
        <div style="color: #38bdf8; font-weight: 600;">${active.descriptor.name}</div>
        <div style="font-size: 9px; color: #94a3b8;">${active.descriptor.type} · ${d.toFixed(0)}u</div>
        <div style="font-size: 9px; margin-top: 2px;">${autoText}</div>
      `;
    } else {
      this.targetInfoEl.innerHTML = '<div style="color: #64748b;">NO TARGET SELECTED</div>';
    }
  }

  public dispose(): void {
    this.container.remove();
  }
}
