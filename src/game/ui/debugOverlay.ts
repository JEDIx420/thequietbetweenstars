import type { NormalizedInputState } from '../input/InputSource';
import { PerformanceMonitor } from '../performance/PerformanceMonitor';

export class DebugOverlay {
  private container: HTMLElement;
  private isVisible = false;
  private lastUpdate = performance.now();
  private updateIntervalMs = 250; // 4 times per second throttled

  private inputSource = 'keyboard';
  private inputState: NormalizedInputState = {
    axes: { x: 0, y: 0 },
    roll: 0,
    throttle: 0,
  };
  private speed = 0;

  private flightPhase = 'CRUISE';
  private worldPosInfo = 'Sector [0,0,0]';
  private rebaseCount = 0;

  private keyListener: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'debug-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 12px 16px;
      background: rgba(10, 15, 26, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10.5px;
      line-height: 1.45;
      color: #e2e8f0;
      z-index: 10000;
      display: none;
      pointer-events: none;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      min-width: 290px;
      max-width: min(340px, 90vw);
    `;
    document.body.appendChild(this.container);

    this.keyListener = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.code === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.keyListener);
  }

  public toggle(): boolean {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
    if (this.isVisible) this.render();
    return this.isVisible;
  }

  public setInputSource(source: string): void {
    this.inputSource = source;
  }

  public setFlightPhase(phase: string): void {
    this.flightPhase = phase;
  }

  public setWorldPos(sectorStr: string): void {
    this.worldPosInfo = sectorStr;
  }

  public setRebaseCount(count: number): void {
    this.rebaseCount = count;
  }

  public updateInputState(input: NormalizedInputState, speed: number): void {
    this.inputState = input;
    this.speed = speed;
  }

  public updateFrame(): void {
    const now = performance.now();
    if (now - this.lastUpdate >= this.updateIntervalMs) {
      this.lastUpdate = now;
      if (this.isVisible) {
        this.render();
      }
    }
  }

  private render(): void {
    const { throttle } = this.inputState;
    const m = PerformanceMonitor.getInstance().getMetrics();

    const fpsColor = m.fps >= 55 ? '#4ade80' : m.fps >= 30 ? '#facc15' : '#f87171';
    const p95Color = m.p95FrameTimeMs <= 20 ? '#4ade80' : m.p95FrameTimeMs <= 33 ? '#facc15' : '#f87171';

    this.container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
        <span style="font-weight: 700; color: #38bdf8; letter-spacing: 0.05em;">DIAGNOSTICS & TELEMETRY</span>
        <span style="color: ${fpsColor}; font-weight: 800; font-size: 13px;">${m.fps} <span style="font-size: 9px; font-weight: 400; color: #94a3b8;">(${m.smoothedFps} sm)</span></span>
      </div>

      <!-- Frame Timing -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; font-size: 9.5px; background: rgba(15, 23, 42, 0.6); padding: 4px 6px; border-radius: 4px; margin-bottom: 6px;">
        <div>Avg: <strong style="color: #cbd5e1;">${m.avgFrameTimeMs}ms</strong></div>
        <div>p95: <strong style="color: ${p95Color};">${m.p95FrameTimeMs}ms</strong></div>
        <div>p99: <strong style="color: #cbd5e1;">${m.p99FrameTimeMs}ms</strong></div>
        <div>Max: <strong style="color: #cbd5e1;">${m.maxFrameTimeMs}ms</strong></div>
      </div>

      <!-- Breakdown -->
      <div style="font-size: 9.5px; color: #94a3b8; line-height: 1.4; margin-bottom: 4px;">
        <span>Sim: ${m.simDurationMs}ms</span> · <span>Rend: ${m.renderDurationMs}ms</span> · <span>Stream: ${m.streamingDurationMs}ms</span>
      </div>

      <!-- GPU / Renderer Stats -->
      <div style="font-size: 9.5px; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px; margin-bottom: 4px;">
        <div>Calls: <strong style="color: #38bdf8;">${m.drawCalls}</strong> · Tris: <strong style="color: #38bdf8;">${m.triangles.toLocaleString()}</strong></div>
        <div>Geo/Tex: <strong>${m.geometries}</strong> / <strong>${m.textures}</strong> · DPR: <strong>${m.dpr.toFixed(2)}</strong> [${m.adaptiveTier}]</div>
        ${m.longTaskCount > 0 ? `<div style="color: #f87171;">Long Tasks: ${m.longTaskCount} (max ${m.maxLongTaskMs}ms)</div>` : ''}
      </div>

      <!-- Scene Entity Counters -->
      <div style="font-size: 9.5px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px; margin-bottom: 4px;">
        <div>Traffic: <strong>${m.activeTrafficCount}</strong> ships · PointLights: <strong style="color: ${m.activeRealLights > 6 ? '#f87171' : '#4ade80'};">${m.activeRealLights}</strong></div>
        <div>Terrain Chunks: <strong>${m.activeTerrainChunks}</strong> · Props: <strong>${m.activePropChunks}</strong></div>
        <div>Fauna: <strong>${m.activeFaunaCount}</strong> · Pickups: <strong>${m.activePickupCount}</strong></div>
      </div>

      <!-- Flight & Navigation Context -->
      <div style="font-size: 9.5px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px;">
        <div>Phase: <span style="color: #38bdf8; font-weight: 600;">${this.flightPhase}</span> · Input: <span style="color: #fbbf24;">${this.inputSource.toUpperCase()}</span></div>
        <div>Pos: <span style="color: #cbd5e1;">${this.worldPosInfo}</span> (Rebase: ${this.rebaseCount})</div>
        <div>Vel: <strong style="color: #38bdf8;">${this.speed.toFixed(1)}</strong> u/s · Thr: <strong>${(throttle * 100).toFixed(0)}%</strong></div>
      </div>
      <div style="margin-top: 4px; font-size: 8.5px; color: #64748b; text-align: right;">\` or F3 to toggle</div>
    `;
  }

  public dispose(): void {
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
