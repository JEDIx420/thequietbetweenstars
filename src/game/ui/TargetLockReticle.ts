import * as THREE from 'three';
import { LockableTarget, TargetLockSystem } from '../targeting/TargetLockSystem';
import { StagedScanController } from '../scanning/StagedScanController';

export class TargetLockReticle {
  private container: HTMLElement;
  private reticleEl: HTMLElement;
  private labelEl: HTMLElement;
  private actionEl: HTMLElement;
  private stagePipsEl: HTMLElement;
  private progressBarWrapEl: HTMLElement;
  private progressBarFillEl: HTMLElement;
  private scanArcEl: SVGElement | null = null;
  private scanArcFillEl: SVGElement | null = null;
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
      transition: width 0.15s ease, height 0.15s ease, filter 0.15s ease;
    `;

    this.reticleEl.innerHTML = `
      <!-- Radial SVG Scan Arc -->
      <svg class="lock-scan-arc" viewBox="0 0 100 100" style="position: absolute; top: -18px; left: -18px; width: 100px; height: 100px; transform: rotate(-90deg); pointer-events: none; display: none;">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(56, 189, 248, 0.18)" stroke-width="3" />
        <circle class="lock-arc-fill" cx="50" cy="50" r="42" fill="none" stroke="#38bdf8" stroke-width="4.5"
                stroke-dasharray="263.89" stroke-dashoffset="263.89" stroke-linecap="round"
                style="transition: stroke-dashoffset 0.08s linear, stroke 0.2s ease; filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.7));" />
      </svg>

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
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.5);
      border-radius: 6px;
      padding: 3px 8px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
      min-width: 90px;
    `;

    this.labelEl = document.createElement('div');
    this.labelEl.style.cssText = `
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #38bdf8;
    `;

    // Compact stage dots
    this.stagePipsEl = document.createElement('div');
    this.stagePipsEl.style.cssText = `
      display: none;
      gap: 3px;
      align-items: center;
      margin-top: 2px;
    `;

    // Horizontal Progress Bar
    this.progressBarWrapEl = document.createElement('div');
    this.progressBarWrapEl.style.cssText = `
      width: 100%;
      height: 4px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 3px;
      display: none;
    `;

    this.progressBarFillEl = document.createElement('div');
    this.progressBarFillEl.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #38bdf8, #a855f7);
      transition: width 0.08s linear;
      box-shadow: 0 0 6px #38bdf8;
    `;
    this.progressBarWrapEl.appendChild(this.progressBarFillEl);

    this.actionEl = document.createElement('div');
    this.actionEl.style.cssText = `
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: #7dd3fc;
      margin-top: 2px;
    `;

    tagEl.appendChild(this.labelEl);
    tagEl.appendChild(this.stagePipsEl);
    tagEl.appendChild(this.progressBarWrapEl);
    tagEl.appendChild(this.actionEl);
    this.reticleEl.appendChild(tagEl);
    this.container.appendChild(this.reticleEl);
    parent.appendChild(this.container);

    this.scanArcEl = this.reticleEl.querySelector('.lock-scan-arc');
    this.scanArcFillEl = this.reticleEl.querySelector('.lock-arc-fill');
  }

  public update(
    target: LockableTarget | null,
    camera: THREE.Camera,
    screenWidth: number,
    screenHeight: number,
    isTouchDevice = false,
    isScanningActive = false,
    freeExplorationMode = false
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

    const anomaly = (target.data as any)?.anomalyDescriptor;
    const isStagedScan = !!anomaly && !anomaly.scanned && (anomaly.currentStage ?? 0) < 4;
    const isStory = target.id.startsWith('story_') ||
      target.type === 'station' ||
      target.type === 'vessel' ||
      target.type === 'relay' ||
      isStagedScan ||
      anomaly?.hasResonance ||
      anomaly?.signature?.isResonanceAnomaly;

    let screenX = (TargetLockReticle.scratchPos.x * 0.5 + 0.5) * screenWidth;
    let screenY = (-TargetLockReticle.scratchPos.y * 0.5 + 0.5) * screenHeight;
    const isBehind = TargetLockReticle.scratchPos.z >= 1.0;
    const isOffScreen = screenX < 24 || screenX > screenWidth - 24 || screenY < 24 || screenY > screenHeight - 24;

    if (isBehind || isOffScreen) {
      if (isStory && !freeExplorationMode) {
        // Reverse coordinates when behind camera so direction points to actual bearing
        if (isBehind) {
          screenX = screenWidth - screenX;
          screenY = screenHeight - screenY;
        }

        // Clamp to screen perimeter with margin
        const marginX = isTouchDevice ? 64 : 50;
        const marginY = isTouchDevice ? 56 : 50;
        const centerX = screenWidth / 2;
        const centerY = screenHeight / 2;
        let dx = screenX - centerX;
        let dy = screenY - centerY;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dy = -1;

        const halfW = centerX - marginX;
        const halfH = centerY - marginY;
        const scaleX = halfW / Math.max(0.001, Math.abs(dx));
        const scaleY = halfH / Math.max(0.001, Math.abs(dy));
        const scale = Math.min(scaleX, scaleY);

        screenX = centerX + dx * scale;
        screenY = centerY + dy * scale;

        // If on touch device, push reticle up away from virtual stick or throttle
        if (isTouchDevice) {
          if (screenX < 170 && screenY > screenHeight - 170) {
            screenY = Math.max(marginY, screenHeight - 180);
          } else if (screenX > screenWidth - 180 && screenY > screenHeight - 180) {
            screenY = Math.max(marginY, screenHeight - 190);
          }
        }
      } else {
        if (this.isVisible) {
          this.container.style.display = 'none';
          this.isVisible = false;
        }
        return;
      }
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
    const isEdgeClamped = isStory && !freeExplorationMode && (isBehind || isOffScreen);
    const prefix = isEdgeClamped ? '✦ ' : '';
    this.labelEl.textContent = `${prefix}[${target.name.toUpperCase()}${distStr}]`;

    if (isStagedScan) {
      StagedScanController.ensureScanStages(anomaly);
      const stage = StagedScanController.getCurrentStage(anomaly);
      const stageIdx = anomaly.currentStage ?? 0;
      const progress = Math.min(1.0, Math.max(0, anomaly.scanProgress ?? 0));
      const dist = target.distance ?? 9999;
      const canScan = StagedScanController.canInitiateStage(anomaly, dist).canScan;

      // Radial SVG Arc
      if (this.scanArcEl && this.scanArcFillEl) {
        this.scanArcEl.style.display = 'block';
        const circumference = 263.89;
        const offset = circumference * (1 - progress);
        this.scanArcFillEl.style.strokeDashoffset = `${offset}px`;
        this.scanArcFillEl.style.stroke = isScanningActive ? '#c084fc' : (canScan ? '#38bdf8' : '#f59e0b');
      }

      // Compact Stage Pips
      this.stagePipsEl.style.display = 'flex';
      let pipsHtml = '';
      for (let i = 1; i <= 3; i++) {
        if (i < stageIdx) {
          pipsHtml += `<span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#10b981;"></span>`;
        } else if (i === stageIdx) {
          pipsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#38bdf8; border:1px solid #ffffff; box-shadow:0 0 4px #38bdf8;"></span>`;
        } else {
          pipsHtml += `<span style="display:inline-block; width:4px; height:4px; border-radius:50%; background:rgba(148,163,184,0.3);"></span>`;
        }
      }
      this.stagePipsEl.innerHTML = pipsHtml;

      // Progress Bar
      this.progressBarWrapEl.style.display = 'block';
      const pct = Math.round(progress * 100);
      this.progressBarFillEl.style.width = `${pct}%`;

      if (canScan) {
        if (isScanningActive) {
          this.actionEl.textContent = `SYNCING [${pct}%]`;
          this.actionEl.style.color = '#38bdf8';
          this.reticleEl.style.filter = 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.9))';
        } else {
          this.actionEl.textContent = isTouchDevice ? 'HOLD SENSOR TO SCAN' : 'HOLD SPACE TO SCAN';
          this.actionEl.style.color = '#7dd3fc';
          this.reticleEl.style.filter = 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.4))';
        }
      } else {
        this.actionEl.textContent = `APPROACH <${stage.requiredMaxDistance}m`;
        this.actionEl.style.color = '#fbbf24';
        this.reticleEl.style.filter = 'none';
      }
    } else {
      if (this.scanArcEl) this.scanArcEl.style.display = 'none';
      this.stagePipsEl.style.display = 'none';
      this.progressBarWrapEl.style.display = 'none';
      this.reticleEl.style.filter = 'none';

      const action = TargetLockSystem.getActionVerb(target);
      let keyHint = isTouchDevice ? 'TAP / SCAN' : `${action.keyHint}: ${action.verb}`;
      if (isStory && (target.type === 'encounter' || target.type === 'anomaly')) {
        keyHint = isTouchDevice ? 'HOLD SENSOR: STAGED SCAN' : 'HOLD SPACE: STAGED SCAN';
      }
      this.actionEl.textContent = keyHint;
      this.actionEl.style.color = '#7dd3fc';
    }

    // Color theme based on target type
    const accent = isEdgeClamped
      ? '#fbbf24' // Vibrant gold waypoint indicator for off-screen objective
      : isStory && !freeExplorationMode
        ? '#38bdf8' // Vibrant resonance cyan
        : target.isSentient
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
