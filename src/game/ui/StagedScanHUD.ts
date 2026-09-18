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
      transition: opacity 0.25s ease, transform 0.25s ease;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      width: min(92vw, 420px);
    `;

    const style = document.createElement('style');
    style.textContent = `
      #hud-staged-scan-banner .scan-card {
        background: rgba(10, 16, 28, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.45);
        border-radius: 10px;
        padding: 10px 14px;
        backdrop-filter: blur(14px);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.15);
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
        background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.15), transparent);
        animation: hud-scan-sweep 3s infinite linear;
        pointer-events: none;
      }
      @keyframes hud-scan-sweep {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      @keyframes hud-scan-pulse {
        0%, 100% { opacity: 0.9; filter: drop-shadow(0 0 4px #38bdf8); }
        50% { opacity: 1; filter: drop-shadow(0 0 12px #c084fc); }
      }
      #hud-staged-scan-banner.scanning-active .scan-bar-fill {
        animation: hud-scan-pulse 0.8s infinite ease-in-out;
      }
      #hud-staged-scan-banner.stage-flash .scan-card {
        border-color: #38bdf8;
        box-shadow: 0 0 35px rgba(56, 189, 248, 0.8);
      }
      @media (pointer: coarse), (max-width: 768px) {
        #hud-staged-scan-banner {
          bottom: max(68px, env(safe-area-inset-bottom, 68px));
          width: min(94vw, 360px);
        }
        #hud-staged-scan-banner .scan-card {
          padding: 8px 10px;
        }
      }
    `;
    this.container.appendChild(style);

    this.cardEl = document.createElement('div');
    this.cardEl.className = 'scan-card';

    // Header Row: Target Name / Frequency
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    `;

    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #38bdf8;
      text-transform: uppercase;
    `;
    this.titleEl.textContent = 'HARMONIC RESONANCE SCANNER';

    this.freqBadgeEl = document.createElement('div');
    this.freqBadgeEl.style.cssText = `
      font-size: 9px;
      font-weight: 600;
      color: #a855f7;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.4);
      border-radius: 4px;
      padding: 1px 6px;
      letter-spacing: 0.05em;
    `;
    this.freqBadgeEl.textContent = '432.8 Hz';

    headerRow.appendChild(this.titleEl);
    headerRow.appendChild(this.freqBadgeEl);
    this.cardEl.appendChild(headerRow);

    // Stage Info Row
    const stageRow = document.createElement('div');
    stageRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    `;

    this.stageTitleEl = document.createElement('div');
    this.stageTitleEl.style.cssText = `
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: #94a3b8;
    `;
    this.stageTitleEl.textContent = 'STAGE 1/4: FREQUENCY SYNCHRONIZATION';

    this.stagePipsEl = document.createElement('div');
    this.stagePipsEl.style.cssText = `
      display: flex;
      gap: 4px;
      align-items: center;
    `;
    stageRow.appendChild(this.stageTitleEl);
    stageRow.appendChild(this.stagePipsEl);
    this.cardEl.appendChild(stageRow);

    // Progress Bar Track & Fill
    const barWrap = document.createElement('div');
    barWrap.style.cssText = `
      position: relative;
      width: 100%;
      height: 10px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 6px;
    `;

    this.progressBarFillEl = document.createElement('div');
    this.progressBarFillEl.className = 'scan-bar-fill';
    this.progressBarFillEl.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #38bdf8, #818cf8, #c084fc);
      transition: width 0.08s linear;
      box-shadow: 0 0 10px #38bdf8;
    `;

    this.progressPercentEl = document.createElement('div');
    this.progressPercentEl.style.cssText = `
      position: absolute;
      top: 50%;
      right: 6px;
      transform: translateY(-50%);
      font-size: 8px;
      font-weight: 800;
      color: #ffffff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
      letter-spacing: 0.05em;
    `;
    this.progressPercentEl.textContent = '0%';

    barWrap.appendChild(this.progressBarFillEl);
    barWrap.appendChild(this.progressPercentEl);
    this.cardEl.appendChild(barWrap);

    // Footer Telemetry: Distance / Range Status / Action Instruction
    const footerRow = document.createElement('div');
    footerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    `;

    this.distanceTextEl = document.createElement('div');
    this.distanceTextEl.style.cssText = `
      font-size: 9px;
      color: #94a3b8;
    `;
    this.distanceTextEl.textContent = 'RANGE: 620m / MAX 1500m';

    this.statusBadgeEl = document.createElement('div');
    this.statusBadgeEl.style.cssText = `
      font-size: 8px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.4);
    `;
    this.statusBadgeEl.textContent = 'IN RANGE';

    this.actionHintEl = document.createElement('div');
    this.actionHintEl.style.cssText = `
      width: 100%;
      font-size: 9px;
      font-weight: 600;
      color: #7dd3fc;
      margin-top: 2px;
      letter-spacing: 0.04em;
      text-align: center;
    `;
    this.actionHintEl.textContent = 'HOLD [SPACE] TO SYNCHRONIZE';

    footerRow.appendChild(this.distanceTextEl);
    footerRow.appendChild(this.statusBadgeEl);
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
      requestAnimationFrame(() => {
        this.container.style.opacity = '1';
        this.container.style.transform = 'translateX(-50%) translateY(0)';
      });
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
    this.distanceTextEl.textContent = `RANGE: ${distRounded}m / MAX ${stage.requiredMaxDistance}m`;

    if (canScan) {
      this.statusBadgeEl.textContent = 'IN RANGE';
      this.statusBadgeEl.style.background = 'rgba(34, 197, 94, 0.15)';
      this.statusBadgeEl.style.color = '#4ade80';
      this.statusBadgeEl.style.borderColor = 'rgba(34, 197, 94, 0.4)';

      if (isScanningActive) {
        this.actionHintEl.textContent = `⚡ HARMONIZING DEFLECTORS [${pct}%] · MAINTAIN HOLD`;
        this.actionHintEl.style.color = '#38bdf8';
      } else {
        this.actionHintEl.textContent = isTouch
          ? 'HOLD SENSOR BUTTON TO SCAN'
          : 'HOLD [SPACE] TO SCAN';
        this.actionHintEl.style.color = '#7dd3fc';
      }
    } else {
      this.statusBadgeEl.textContent = 'OUT OF RANGE';
      this.statusBadgeEl.style.background = 'rgba(239, 68, 68, 0.15)';
      this.statusBadgeEl.style.color = '#f87171';
      this.statusBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';

      const diff = distRounded - stage.requiredMaxDistance;
      this.actionHintEl.textContent = `APPROACH TARGET (CLOSE ${diff}m TO SYNCHRONIZE)`;
      this.actionHintEl.style.color = '#fbbf24';
    }
  }

  private renderStagePips(currentStage: number): void {
    const totalPips = 3;
    let html = '';
    for (let i = 1; i <= totalPips; i++) {
      if (i < currentStage) {
        html += `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981;"></span>`;
      } else if (i === currentStage) {
        html += `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#38bdf8; box-shadow:0 0 8px #38bdf8; border:1px solid #ffffff;"></span>`;
      } else {
        html += `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:rgba(148, 163, 184, 0.25); border:1px solid rgba(148, 163, 184, 0.4);"></span>`;
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
