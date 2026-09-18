import * as THREE from 'three';
import { LockableTarget, TargetLockSystem } from '../targeting/TargetLockSystem';

export class TargetLockReticle {
  private container: HTMLElement;
  private reticleEl: HTMLElement;
  private labelEl: HTMLElement;
  private actionEl: HTMLElement;
  private isVisible = false;
  private lastTargetId: string | null = null;
  private static readonly scratchPos = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'hud-target-lock-reticle';
    this.container.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 60;
      display: none;
    `;

    this.reticleEl = document.createElement('div');
    this.reticleEl.className = 'lock-reticle-box';
    this.reticleEl.style.cssText = `
      position: absolute;
      width: 64px;
      height: 64px;
      transform: translate(-50%, -50%);
      transition: width 0.15s ease, height 0.15s ease;
    `;

    this.reticleEl.innerHTML = `
      <!-- Corner brackets -->
      <div style="position: absolute; top: 0; left: 0; width: 14px; height: 14px; border-top: 2px solid #38bdf8; border-left: 2px solid #38bdf8;"></div>
      <div style="position: absolute; top: 0; right: 0; width: 14px; height: 14px; border-top: 2px solid #38bdf8; border-right: 2px solid #38bdf8;"></div>
      <div style="position: absolute; bottom: 0; left: 0; width: 14px; height: 14px; border-bottom: 2px solid #38bdf8; border-left: 2px solid #38bdf8;"></div>
      <div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; border-bottom: 2px solid #38bdf8; border-right: 2px solid #38bdf8;"></div>
      
      <!-- Central pip -->
      <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: #38bdf8; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 8px #38bdf8;"></div>
    `;

    const tagEl = document.createElement('div');
    tagEl.style.cssText = `
      position: absolute;
      top: 36px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      white-space: nowrap;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.5);
      border-radius: 6px;
      padding: 3px 8px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    `;

    this.labelEl = document.createElement('div');
    this.labelEl.style.cssText = `
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #38bdf8;
    `;

    this.actionEl = document.createElement('div');
    this.actionEl.style.cssText = `
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: #7dd3fc;
      margin-top: 1px;
    `;

    tagEl.appendChild(this.labelEl);
    tagEl.appendChild(this.actionEl);
    this.reticleEl.appendChild(tagEl);
    this.container.appendChild(this.reticleEl);
    parent.appendChild(this.container);
  }

  public update(
    target: LockableTarget | null,
    camera: THREE.Camera,
    screenWidth: number,
    screenHeight: number,
    isTouchDevice = false
  ): void {
    if (!target) {
      if (this.isVisible) {
        this.container.style.display = 'none';
        this.isVisible = false;
        this.lastTargetId = null;
      }
      return;
    }

    TargetLockReticle.scratchPos.copy(target.position);
    TargetLockReticle.scratchPos.project(camera);

    // Behind camera check: normalized device coordinate z must be < 1.0
    if (TargetLockReticle.scratchPos.z >= 1.0) {
      if (this.isVisible) {
        this.container.style.display = 'none';
        this.isVisible = false;
      }
      return;
    }

    const screenX = (TargetLockReticle.scratchPos.x * 0.5 + 0.5) * screenWidth;
    const screenY = (-TargetLockReticle.scratchPos.y * 0.5 + 0.5) * screenHeight;

    // Off screen check with margin
    if (screenX < -100 || screenX > screenWidth + 100 || screenY < -100 || screenY > screenHeight + 100) {
      if (this.isVisible) {
        this.container.style.display = 'none';
        this.isVisible = false;
      }
      return;
    }

    if (!this.isVisible) {
      this.container.style.display = 'block';
      this.isVisible = true;
    }

    this.container.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;

    // Check if new target acquired for pulse effect
    if (this.lastTargetId !== target.id) {
      this.lastTargetId = target.id;
      this.pulse();
    }

    const distStr = target.distance !== undefined ? ` · ${target.distance}m` : '';
    this.labelEl.textContent = `[${target.name.toUpperCase()}${distStr}]`;

    const action = TargetLockSystem.getActionVerb(target);
    const keyHint = isTouchDevice ? 'TAP / SCAN' : `${action.keyHint}: ${action.verb}`;
    this.actionEl.textContent = keyHint;

    // Color theme based on target type
    const accent = target.isSentient
      ? '#4ade80' // Green for sentient giants/titans
      : target.type === 'encounter' || target.type === 'anomaly'
        ? '#f59e0b' // Amber for anomalies/encounters
        : target.type === 'courier'
          ? '#c084fc' // Purple for courier
          : '#38bdf8'; // Blue for creatures/planets/landmarks

    this.labelEl.style.color = accent;
  }

  public pulse(): void {
    this.reticleEl.style.width = '84px';
    this.reticleEl.style.height = '84px';
    setTimeout(() => {
      this.reticleEl.style.width = '64px';
      this.reticleEl.style.height = '64px';
    }, 150);
  }

  public dispose(): void {
    this.container.remove();
  }
}
