import type { ConnectionMetrics } from '../../connection/connectionState';
import type { NormalizedInputState } from '../input/InputSource';

export class DebugOverlay {
  private container: HTMLElement;
  private isVisible = false;
  private fps = 60;
  private frameCount = 0;
  private lastFpsUpdate = performance.now();

  private inputSource = 'keyboard';
  private metrics: ConnectionMetrics = {
    state: 'idle',
    rttMs: 0,
    realtimePacketRateHz: 0,
    packetsReceived: 0,
    packetsSent: 0,
  };
  private inputState: NormalizedInputState = {
    axes: { x: 0, y: 0 },
    roll: 0,
    throttle: 0,
  };
  private speed = 0;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'debug-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 12px 16px;
      background: rgba(10, 15, 26, 0.82);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(147, 197, 253, 0.25);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #e2e8f0;
      z-index: 10000;
      display: none;
      pointer-events: none;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      min-width: 240px;
    `;
    document.body.appendChild(this.container);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  public toggle(): boolean {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
    if (this.isVisible) this.render();
    return this.isVisible;
  }

  public updateMetrics(metrics: ConnectionMetrics): void {
    this.metrics = metrics;
    if (this.isVisible) this.render();
  }

  public setInputSource(source: string): void {
    this.inputSource = source;
    if (this.isVisible) this.render();
  }

  public updateInputState(input: NormalizedInputState, speed: number): void {
    this.inputState = input;
    this.speed = speed;
  }

  public updateFrame(): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      if (this.isVisible) {
        this.render();
      }
    }
  }

  private render(): void {
    const { state, rttMs, realtimePacketRateHz, packetsReceived, lastAction } = this.metrics;
    const { axes, roll, throttle } = this.inputState;

    let stateColor = '#94a3b8';
    if (state === 'connected') stateColor = '#4ade80';
    else if (state === 'connecting' || state === 'signaling' || state === 'waiting') stateColor = '#facc15';
    else if (state === 'reconnecting' || state === 'failed') stateColor = '#f87171';

    this.container.innerHTML = `
      <div style="font-weight: 700; color: #38bdf8; margin-bottom: 6px; letter-spacing: 0.05em;">
        FLIGHT TELEMETRY [${this.fps} FPS]
      </div>
      <div>Input Source: <span style="color: #fbbf24; font-weight: 600;">${this.inputSource.toUpperCase()}</span></div>
      <div>Peer State: <span style="color: ${stateColor}; font-weight: 600;">${state.toUpperCase()}</span></div>
      <div>RTT Latency: <span style="color: ${rttMs < 60 ? '#4ade80' : '#facc15'};">${rttMs} ms</span></div>
      <div>Realtime Rate: <span>${realtimePacketRateHz} Hz</span> (total: ${packetsReceived})</div>
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1);">
        <div>Steering (Yaw/Pitch): [${axes.x.toFixed(2)}, ${axes.y.toFixed(2)}]</div>
        <div>Roll: ${roll.toFixed(2)}</div>
        <div>Throttle: ${(throttle * 100).toFixed(0)}%</div>
        <div>Velocity: ${this.speed.toFixed(1)} u/s</div>
      </div>
      <div style="margin-top: 4px;">Last Action: <span style="color: #a7f3d0;">${lastAction || 'none'}</span></div>
      <div style="margin-top: 6px; font-size: 10px; color: #64748b;">Toggle with \` or F3</div>
    `;
  }
}
