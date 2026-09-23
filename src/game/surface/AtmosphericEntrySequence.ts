import * as THREE from 'three';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';
import type { LandingSite } from '../systems/LandingSiteGenerator';
import { HapticFeedback } from '../input/HapticFeedback';

export class AtmosphericEntrySequence {
  private container: HTMLElement;
  private overlayEl: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private startTime = 0;
  private duration = 2.8; // seconds
  private isFinished = false;
  private onComplete: (() => void) | null = null;

  // Particle streak pool for entry plasma sheath
  private streaks: Array<{
    x: number;
    y: number;
    speed: number;
    length: number;
    width: number;
    alpha: number;
    hue: number;
  }> = [];

  constructor(parent: HTMLElement) {
    this.container = parent;
  }

  public start(
    planet: PlanetDescriptor,
    site: LandingSite,
    renderer: THREE.WebGLRenderer,
    surfaceScene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onComplete: () => void
  ): void {
    this.onComplete = onComplete;
    this.isFinished = false;
    this.startTime = performance.now();
    this.duration = 2.8;

    this.createDOM(planet, site);
    this.initStreaks();

    // Pre-warm WebGL shaders for the new surface scene while the entry animation runs
    try {
      renderer.compile(surfaceScene, camera);
    } catch {
      // Gracefully ignore if compile is unsupported in mock environments
    }

    // Trigger tactile entry shudder (hardware vibration + audio micro-haptic tick)
    HapticFeedback.heavy();

    this.animate();
  }

  private createDOM(planet: PlanetDescriptor, site: LandingSite): void {
    if (typeof document === 'undefined') return;
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'atmospheric-entry-overlay';
    this.overlayEl.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      user-select: none;
      z-index: 80;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      opacity: 0;
      transition: opacity 0.3s ease-in;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;
    this.overlayEl.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();

    // Atmospheric Telemetry HUD Card
    const hudCard = document.createElement('div');
    hudCard.id = 'entry-telemetry-card';
    hudCard.style.cssText = `
      position: relative;
      margin: max(16px, env(safe-area-inset-top, 16px)) auto 0 auto;
      padding: 8px 18px;
      background: rgba(10, 16, 28, 0.88);
      border: 1px solid rgba(249, 115, 22, 0.6);
      border-top: 2px solid #f97316;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(249, 115, 22, 0.35), inset 0 0 16px rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      max-width: min(440px, 88vw);
      text-align: center;
      transition: transform 0.05s ease-out;
    `;

    hudCard.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #f97316; box-shadow: 0 0 8px #f97316; animation: blink 0.6s infinite alternate;"></span>
        <span style="font-size: 10px; font-weight: 700; color: #fdba74; letter-spacing: 0.14em;">ATMOSPHERIC RE-ENTRY // HYPERSONIC VECTOR</span>
      </div>
      <div id="entry-target-name" style="font-size: 12px; font-weight: 700; color: #f8fafc; letter-spacing: 0.08em;">
        ${planet.name.toUpperCase()} · ${site.name.toUpperCase()}
      </div>
      <div id="entry-telemetry-readout" style="font-size: 9.5px; color: #94a3b8; margin-top: 2px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <span>ALT: <strong id="entry-alt-val" style="color: #fdba74;">78,000m</strong></span>
        <span>VEL: <strong id="entry-vel-val" style="color: #38bdf8;">MACH 22.4</strong></span>
        <span>HEAT SHIELD: <strong id="entry-heat-val" style="color: #f97316;">2,140°C</strong></span>
      </div>
      <style>
        @keyframes blink { from { opacity: 0.3; } to { opacity: 1; } }
      </style>
    `;

    // Cloud Deck Transition Flash Screen
    const cloudFlash = document.createElement('div');
    cloudFlash.id = 'entry-cloud-flash';
    cloudFlash.style.cssText = `
      position: absolute;
      inset: 0;
      background: radial-gradient(circle, rgba(254, 215, 170, 0.45) 0%, rgba(249, 115, 22, 0.25) 50%, rgba(15, 23, 42, 0) 100%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease-out;
    `;
    this.overlayEl.appendChild(cloudFlash);
    this.overlayEl.appendChild(hudCard);

    this.container.appendChild(this.overlayEl);

    // Fade in
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        if (this.overlayEl) this.overlayEl.style.opacity = '1';
      });
    }
  }

  private initStreaks(): void {
    const w = typeof window !== 'undefined' ? window.innerWidth : 800;
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    this.streaks = [];
    const count = 45;

    for (let i = 0; i < count; i++) {
      this.streaks.push({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: 900 + Math.random() * 1200,
        length: 80 + Math.random() * 160,
        width: 1.5 + Math.random() * 3.0,
        alpha: 0.3 + Math.random() * 0.7,
        hue: Math.random() < 0.75 ? 28 + Math.random() * 20 : 190 + Math.random() * 25, // Orange heat glow or cyan ion trail
      });
    }
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const w = typeof window !== 'undefined' ? window.innerWidth : 800;
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
  }

  private animate = (): void => {
    if (this.isFinished) return;

    const elapsed = (performance.now() - this.startTime) / 1000;
    const progress = Math.min(1.0, elapsed / this.duration);

    this.updateTelemetry(progress);
    this.renderPlasmaCanvas(progress);

    if (progress >= 1.0) {
      this.finish();
      return;
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animFrameId = requestAnimationFrame(this.animate);
    }
  };

  private updateTelemetry(progress: number): void {
    if (!this.overlayEl) return;

    // Shake HUD during peak heating (progress 0.2 to 0.75)
    const shakeIntensity = progress > 0.15 && progress < 0.85
      ? Math.sin(progress * Math.PI) * 4.5
      : 0;

    const hudCard = this.overlayEl.querySelector('#entry-telemetry-card') as HTMLElement;
    if (hudCard) {
      const sx = (Math.random() - 0.5) * shakeIntensity;
      const sy = (Math.random() - 0.5) * shakeIntensity;
      hudCard.style.transform = `translate(${sx}px, ${sy}px)`;
    }

    // Interpolate simulated telemetry
    const alt = Math.round(THREE.MathUtils.lerp(78000, 850, Math.pow(progress, 1.8)));
    const mach = (THREE.MathUtils.lerp(24.2, 1.2, progress)).toFixed(1);
    const temp = Math.round(
      progress < 0.5
        ? THREE.MathUtils.lerp(800, 2480, progress * 2)
        : THREE.MathUtils.lerp(2480, 420, (progress - 0.5) * 2)
    );

    const altEl = this.overlayEl.querySelector('#entry-alt-val');
    const velEl = this.overlayEl.querySelector('#entry-vel-val');
    const heatEl = this.overlayEl.querySelector('#entry-heat-val');

    if (altEl) altEl.textContent = `${alt.toLocaleString()}m`;
    if (velEl) velEl.textContent = `MACH ${mach}`;
    if (heatEl) heatEl.textContent = `${temp}°C`;

    // Cloud flash veil near completion
    const cloudFlash = this.overlayEl.querySelector('#entry-cloud-flash') as HTMLElement;
    if (cloudFlash) {
      if (progress > 0.72 && progress < 0.94) {
        const flashAlpha = Math.sin(((progress - 0.72) / 0.22) * Math.PI) * 0.75;
        cloudFlash.style.opacity = `${flashAlpha}`;
      } else {
        cloudFlash.style.opacity = '0';
      }
    }
  }

  private renderPlasmaCanvas(progress: number): void {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const intensity = Math.sin(progress * Math.PI); // Peak intensity in the middle
    if (intensity <= 0.01) return;

    const dt = 0.016;
    const centerX = w / 2;
    const centerY = h / 2;

    // 1. Draw peripheral aerodynamic plasma glow
    const grad = this.ctx.createRadialGradient(
      centerX, centerY, h * 0.2,
      centerX, centerY, h * 0.75
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.65, `rgba(249, 115, 22, ${intensity * 0.18})`);
    grad.addColorStop(1, `rgba(234, 88, 12, ${intensity * 0.45})`);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);

    // 2. Draw hypersonic plasma streaks radiating outward from center
    this.ctx.save();
    for (const s of this.streaks) {
      // Radiate outward from center
      const dx = s.x - centerX;
      const dy = s.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      s.x += nx * s.speed * dt * (1 + intensity);
      s.y += ny * s.speed * dt * (1 + intensity);

      // Wrap around bounds
      if (s.x < 0 || s.x > w || s.y < 0 || s.y > h) {
        const angle = Math.random() * Math.PI * 2;
        const startDist = Math.random() * (h * 0.25);
        s.x = centerX + Math.cos(angle) * startDist;
        s.y = centerY + Math.sin(angle) * startDist;
      }

      const tailX = s.x - nx * s.length;
      const tailY = s.y - ny * s.length;

      const streakGrad = this.ctx.createLinearGradient(tailX, tailY, s.x, s.y);
      streakGrad.addColorStop(0, `hsla(${s.hue}, 95%, 60%, 0)`);
      streakGrad.addColorStop(0.8, `hsla(${s.hue}, 100%, 70%, ${s.alpha * intensity})`);
      streakGrad.addColorStop(1, `hsla(50, 100%, 95%, ${s.alpha * intensity})`);

      this.ctx.strokeStyle = streakGrad;
      this.ctx.lineWidth = s.width;
      this.ctx.beginPath();
      this.ctx.moveTo(tailX, tailY);
      this.ctx.lineTo(s.x, s.y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  public finish(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0';
      const el = this.overlayEl;
      setTimeout(() => {
        el.remove();
      }, 300);
      this.overlayEl = null;
    }

    if (this.onComplete) {
      this.onComplete();
      this.onComplete = null;
    }
  }

  public dispose(): void {
    this.finish();
  }
}
