import type { GameRenderer } from '../rendering/renderer';
import { PerformanceMonitor } from './PerformanceMonitor';

export interface RenderQualityOptions {
  minDpr?: number;
  maxDpr?: number;
  stepDownThresholdMs?: number;
  stepUpThresholdMs?: number;
  cooldownMs?: number;
}

/**
 * RenderQualityController
 * Monitors rolling p95 frame times via PerformanceMonitor and dynamically adjusts
 * renderer pixel ratio (DPR) to maintain fluid 60 FPS across desktop, tablet, and mobile.
 */
export class RenderQualityController {
  private renderer: GameRenderer;
  private perfMonitor: PerformanceMonitor;

  private currentDpr: number;
  private readonly minDpr: number;
  private readonly maxDpr: number;
  private readonly stepDownThresholdMs: number;
  private readonly stepUpThresholdMs: number;
  private readonly cooldownMs: number;

  private timeSinceLastAdjustment = 0;
  private isMobile = false;

  constructor(renderer: GameRenderer, perfMonitor?: PerformanceMonitor, options?: RenderQualityOptions) {
    this.renderer = renderer;
    this.perfMonitor = perfMonitor || PerformanceMonitor.getInstance();

    this.isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0) || window.innerWidth < 800);

    const deviceMax = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2.0);

    this.minDpr = options?.minDpr ?? (this.isMobile ? 0.85 : 1.0);
    this.maxDpr = options?.maxDpr ?? deviceMax;
    this.stepDownThresholdMs = options?.stepDownThresholdMs ?? 22.0; // < 45 FPS
    this.stepUpThresholdMs = options?.stepUpThresholdMs ?? 13.5; // > 74 FPS
    this.cooldownMs = options?.cooldownMs ?? 3000;

    this.currentDpr = this.renderer.getPixelRatio();
  }

  public getCurrentDpr(): number {
    return this.currentDpr;
  }

  public getMinDpr(): number {
    return this.minDpr;
  }

  public getMaxDpr(): number {
    return this.maxDpr;
  }

  public update(dt: number): void {
    this.timeSinceLastAdjustment += dt * 1000;
    if (this.timeSinceLastAdjustment < this.cooldownMs) {
      return;
    }

    const metrics = this.perfMonitor.getMetrics();
    const p95 = metrics.p95FrameTimeMs;

    // Under-performing: step down DPR
    if (p95 > this.stepDownThresholdMs && this.currentDpr > this.minDpr) {
      const newDpr = Math.max(this.minDpr, Number((this.currentDpr - 0.2).toFixed(2)));
      if (newDpr !== this.currentDpr) {
        this.currentDpr = newDpr;
        this.renderer.setPixelRatio(this.currentDpr);
        this.timeSinceLastAdjustment = 0;
      }
    }
    // High headroom: step up DPR
    else if (p95 < this.stepUpThresholdMs && this.currentDpr < this.maxDpr) {
      const newDpr = Math.min(this.maxDpr, Number((this.currentDpr + 0.15).toFixed(2)));
      if (newDpr !== this.currentDpr) {
        this.currentDpr = newDpr;
        this.renderer.setPixelRatio(this.currentDpr);
        this.timeSinceLastAdjustment = 0;
      }
    }
  }

  public reset(): void {
    this.currentDpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2.0);
    this.renderer.setPixelRatio(this.currentDpr);
    this.timeSinceLastAdjustment = 0;
  }
}
