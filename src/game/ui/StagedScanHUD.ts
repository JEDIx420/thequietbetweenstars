import type { SpaceAnomalyDescriptor } from '../systems/PlanetDescriptor';
import { StagedScanController } from '../scanning/StagedScanController';

export class StagedScanHUD {
  private container: HTMLElement;
  private cardEl: HTMLElement;
  private titleEl: HTMLElement;
  private freqBadgeEl: HTMLElement;
  private stageTitleEl: HTMLElement;
  private stagePipsEl: HTMLElement;
  private progressBarFillEl: HTMLElement;
  private progressPercentEl: HTMLElement;
  private distanceTextEl: HTMLElement;
  private statusBadgeEl: HTMLElement;
  private actionHintEl: HTMLElement;

  private isVisible = false;
  private lastStage = -1;
  private lastIsScanning = false;
  private flashTimeout: number | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'hud-staged-scan-banner';
    this.container.style.cssText = `
      position: fixed;
      bottom: 74px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 70;
      pointer-events: none;
      user-select: none;
      display: none;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      width: min(88vw, 290px);
    `;

    const style = document.createElement('style');
    style.textContent = `
      #hud-staged-scan-banner .scan-card {
        background: rgba(10, 16, 28, 0.88);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 6px;
        padding: 6px 10px;
        backdrop-filter: blur(12px);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.12);
        position: relative;
        overflow: hidden;
      }
      #hud-staged-scan-banner .scan-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.12), transparent);
        animation: hud-scan-sweep 3s infinite linear;
        pointer-events: none;
      }
      @keyframes hud-scan-sweep {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      @keyframes hud-scan-pulse {
        0%, 100% { opacity: 0.9; filter: drop-shadow(0 0 3px #38bdf8); }
        50% { opacity: 1; filter: drop-shadow(0 0 8px #c084fc); }
      }
      #hud-staged-scan-banner.scanning-active .scan-bar-fill {
        animation: hud-scan-pulse 0.8s infinite ease-in-out;
      }
      #hud-staged-scan-banner.stage-flash .scan-card {
        border-color: #38bdf8;
        box-shadow: 0 0 24px rgba(56, 189, 248, 0.7);
      }
      @media (pointer: coarse), (max-width: 768px) {
        #hud-staged-scan-banner {
          bottom: max(64px, env(safe-area-inset-bottom, 64px));
          width: min(90vw, 270px);
        }
        #hud-staged-scan-banner .scan-card {
          padding: 5px 8px;
        }
      }
    `;
    this.container.appendChild(style);

    this.cardEl = document.createElement('div');
    this.cardEl.className = 'scan-card';

    // Header Row: Target Name / Stage Pips + Frequency
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    `;

    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = `
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #38bdf8;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 170px;
    `;
    this.titleEl.textContent = 'HARMONIC RESONANCE SCANNER';

    const headerRight = document.createElement('div');
    headerRight.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    this.stagePipsEl = document.createElement('div');
    this.stagePipsEl.style.cssText = `
      display: flex;
      gap: 3px;
      align-items: center;
    `;

    this.freqBadgeEl = document.createElement('div');
    this.freqBadgeEl.style.cssText = `
      font-size: 8px;
      font-weight: 600;
      color: #c084fc;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 3px;
      padding: 1px 4px;
      letter-spacing: 0.04em;
    `;
    this.freqBadgeEl.textContent = '432.8 Hz';

    headerRight.appendChild(this.stagePipsEl);
    headerRight.appendChild(this.freqBadgeEl);
    headerRow.appendChild(this.titleEl);
    headerRow.appendChild(headerRight);
    this.cardEl.appendChild(headerRow);

    // Stage Subtitle & Percent Row
    const stageRow = document.createElement('div');
    stageRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    `;

    this.stageTitleEl = document.createElement('div');
    this.stageTitleEl.style.cssText = `
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 210px;
    `;
    this.stageTitleEl.textContent = 'STAGE 1/3: FREQ SYNC';

    this.progressPercentEl = document.createElement('div');
    this.progressPercentEl.style.cssText = `
      font-size: 8.5px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.04em;
    `;
    this.progressPercentEl.textContent = '0%';

    stageRow.appendChild(this.stageTitleEl);
    stageRow.appendChild(this.progressPercentEl);
    this.cardEl.appendChild(stageRow);

    // Slim Progress Bar Track & Fill (4px height)
    const barWrap = document.createElement('div');
    barWrap.style.cssText = `
      position: relative;
      width: 100%;
      height: 4px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 4px;
    `;

    this.progressBarFillEl = document.createElement('div');
    this.progressBarFillEl.className = 'scan-bar-fill';
    this.progressBarFillEl.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #38bdf8, #818cf8, #c084fc);
      transition: width 0.08s linear;
      box-shadow: 0 0 6px #38bdf8;
    `;

    barWrap.appendChild(this.progressBarFillEl);
    this.cardEl.appendChild(barWrap);

    // Telemetry Footer: Distance & Compact Status / Action Hint
    const footerRow = document.createElement('div');
    footerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    `;

    this.distanceTextEl = document.createElement('div');
    this.distanceTextEl.style.cssText = `
      font-size: 8px;
      color: #94a3b8;
      white-space: nowrap;
    `;
    this.distanceTextEl.textContent = '620m / 1500m';

    this.statusBadgeEl = document.createElement('div');
    this.statusBadgeEl.style.cssText = `
      display: none;
    `;

    this.actionHintEl = document.createElement('div');
    this.actionHintEl.style.cssText = `
      font-size: 8px;
      font-weight: 600;
      color: #7dd3fc;
      letter-spacing: 0.03em;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    this.actionHintEl.textContent = 'HOLD [SPACE] TO SCAN';

    footerRow.appendChild(this.distanceTextEl);
    footerRow.appendChild(this.actionHintEl);
    this.cardEl.appendChild(footerRow);

    this.container.appendChild(this.cardEl);
    parent.appendChild(this.container);
  }

  public update(
    anomaly: SpaceAnomalyDescriptor | null,
    distance: number,
    isScanningActive = false,
    isTouch = false
  ): void {
    if (!anomaly || anomaly.scanned || (anomaly.currentStage ?? 0) >= 4) {
      this.hide();
      return;
    }

    StagedScanController.ensureScanStages(anomaly);
    const stage = StagedScanController.getCurrentStage(anomaly);
    const stageIdx = anomaly.currentStage ?? 0;
    const progress = Math.min(1.0, Math.max(0, anomaly.scanProgress ?? 0));
    const canScanCheck = StagedScanController.canInitiateStage(anomaly, distance);
    const canScan = canScanCheck.canScan;

    if (!this.isVisible) {
      this.container.style.display = 'block';
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          this.container.style.opacity = '1';
          this.container.style.transform = 'translateX(-50%) translateY(0)';
        });
      } else {
        this.container.style.opacity = '1';
        this.container.style.transform = 'translateX(-50%) translateY(0)';
      }
      this.isVisible = true;
    }

    // Active pulse class
    if (isScanningActive !== this.lastIsScanning) {
      this.lastIsScanning = isScanningActive;
      if (isScanningActive) {
        this.container.classList.add('scanning-active');
      } else {
        this.container.classList.remove('scanning-active');
      }
    }

    // Check if stage advanced for flash effect
    if (this.lastStage !== -1 && stageIdx > this.lastStage) {
      this.triggerFlash(`STAGE ${this.lastStage} COMPLETE! ADVANCING...`);
    }
    this.lastStage = stageIdx;

    // Header updates
    const titleText = anomaly.name ? anomaly.name.toUpperCase() : 'RESONANCE ANOMALY';
    if (this.titleEl.textContent !== titleText) {
      this.titleEl.textContent = titleText;
    }

    const freq = anomaly.signature?.frequency || (anomaly.id.includes('beta') ? 528.0 : 432.8);
    const freqText = `${freq.toFixed(1)} Hz`;
    if (this.freqBadgeEl.textContent !== freqText) {
      this.freqBadgeEl.textContent = freqText;
    }

    // Stage Title
    const stageText = `STAGE ${stage.stage}/3: ${stage.name.toUpperCase()}`;
    if (this.stageTitleEl.textContent !== stageText) {
      this.stageTitleEl.textContent = stageText;
    }

    // Update Stage Pips (Stages 1, 2, 3)
    this.renderStagePips(stageIdx);

    // Progress Bar Fill
    const pct = Math.round(progress * 100);
    this.progressBarFillEl.style.width = `${pct}%`;
    this.progressPercentEl.textContent = `${pct}%`;

    // Distance & Range Status
    const distRounded = Math.round(distance);
    this.distanceTextEl.textContent = `${distRounded}m / ${stage.requiredMaxDistance}m`;

    if (canScan) {
      this.statusBadgeEl.textContent = 'IN RANGE';
      if (isScanningActive) {
        this.actionHintEl.textContent = `⚡ SYNCHRONIZING [${pct}%]`;
        this.actionHintEl.style.color = '#38bdf8';
      } else {
        this.actionHintEl.textContent = isTouch
          ? 'HOLD SENSOR TO SCAN'
          : 'HOLD [SPACE] TO SCAN';
        this.actionHintEl.style.color = '#7dd3fc';
      }
    } else {
      this.statusBadgeEl.textContent = 'OUT OF RANGE';
      const diff = distRounded - stage.requiredMaxDistance;
      this.actionHintEl.textContent = `APPROACH (-${diff}m)`;
      this.actionHintEl.style.color = '#fbbf24';
    }
  }

  private renderStagePips(currentStage: number): void {
    const totalPips = 3;
    let html = '';
    for (let i = 1; i <= totalPips; i++) {
      if (i < currentStage) {
        html += `<span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#10b981; box-shadow:0 0 4px #10b981;"></span>`;
      } else if (i === currentStage) {
        html += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#38bdf8; box-shadow:0 0 6px #38bdf8; border:1px solid #ffffff;"></span>`;
      } else {
        html += `<span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:rgba(148, 163, 184, 0.25); border:1px solid rgba(148, 163, 184, 0.4);"></span>`;
      }
    }
    this.stagePipsEl.innerHTML = html;
  }

  public triggerFlash(message: string): void {
    if (this.flashTimeout !== null) {
      window.clearTimeout(this.flashTimeout);
    }
    this.container.classList.add('stage-flash');
    this.actionHintEl.textContent = `✨ ${message.toUpperCase()}`;
    this.actionHintEl.style.color = '#38bdf8';

    this.flashTimeout = window.setTimeout(() => {
      this.container.classList.remove('stage-flash');
      this.flashTimeout = null;
    }, 1200);
  }

  public hide(): void {
    if (!this.isVisible) return;
    this.container.style.opacity = '0';
    this.container.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => {
      if (!this.isVisible) {
        this.container.style.display = 'none';
      }
    }, 250);
    this.isVisible = false;
    this.lastStage = -1;
    this.lastIsScanning = false;
    this.container.classList.remove('scanning-active');
  }

  public dispose(): void {
    if (this.flashTimeout !== null) {
      window.clearTimeout(this.flashTimeout);
    }
    this.container.remove();
  }
}
