import { audio } from '../audio/AudioEngine';

export interface OnboardingStep {
  id: string;
  label: string;
  keyHint: string;
  completed: boolean;
}

export class PilotOnboardingHUD {
  private container: HTMLElement;
  private cardEl: HTMLElement;
  private isVisible = false;
  private onSkipCallback: (() => void) | null = null;
  private steps: OnboardingStep[] = [
    { id: 'steer', label: 'Steer Spacecraft', keyHint: 'Mouse / Stick', completed: false },
    { id: 'throttle', label: 'Adjust Throttle', keyHint: 'W/S / Thrust Slider', completed: false },
    { id: 'target', label: 'Target Celestial / Ship', keyHint: 'T / Target Button', completed: false },
    { id: 'cruise', label: 'Engage Warp / Land', keyHint: 'Shift / Warp / Orbit', completed: false },
  ];

  private readonly storageKey = 'pilot_onboarding_completed_v1';

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'pilot-onboarding-container';
    this.container.style.cssText = `
      position: fixed;
      top: max(68px, calc(env(safe-area-inset-top, 0px) + 68px));
      right: 20px;
      z-index: 1200;
      pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, monospace;
      max-width: 310px;
      width: calc(100vw - 40px);
      transition: opacity 0.35s ease, transform 0.35s ease;
      opacity: 0;
      transform: translateY(-8px);
    `;

    this.cardEl = document.createElement('div');
    this.cardEl.style.cssText = `
      background: rgba(10, 16, 28, 0.92);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-left: 3px solid #38bdf8;
      border-radius: 10px;
      padding: 12px 14px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75), 0 0 16px rgba(56, 189, 248, 0.15);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      pointer-events: auto;
      color: #f1f5f9;
      user-select: none;
      touch-action: manipulation;
    `;

    this.container.appendChild(this.cardEl);
    parent.appendChild(this.container);

    this.render();

    // Only show if not previously completed
    if (typeof window !== 'undefined' && window.localStorage) {
      const isDone = localStorage.getItem(this.storageKey);
      if (!isDone) {
        this.show();
      }
    }
  }

  public setOnSkipCallback(cb: () => void): void {
    this.onSkipCallback = cb;
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public show(): void {
    this.isVisible = true;
    this.container.style.opacity = '1';
    this.container.style.transform = 'translateY(0)';
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.opacity = '0';
    this.container.style.transform = 'translateY(-8px)';
  }

  public completeStep(stepId: 'steer' | 'throttle' | 'target' | 'cruise'): void {
    this.markStep(stepId);
  }

  public dismiss(): void {
    this.hide();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(this.storageKey, 'true');
    }
  }

  public markStep(stepId: 'steer' | 'throttle' | 'target' | 'cruise'): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step && !step.completed) {
      step.completed = true;
      audio.playConnectChime();
      this.render();

      // Check if all completed
      if (this.steps.every((s) => s.completed)) {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(this.storageKey, 'true');
        }
        setTimeout(() => {
          this.hide();
        }, 3200);
      }
    }
  }

  public reset(): void {
    for (const step of this.steps) {
      step.completed = false;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(this.storageKey);
    }
    this.render();
    this.show();
  }

  private render(): void {
    const allDone = this.steps.every((s) => s.completed);

    const stepsHtml = this.steps
      .map(
        (s) => `
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 11px;
          color: ${s.completed ? '#34d399' : '#cbd5e1'};
          transition: color 0.2s;
        ">
          <div style="display: flex; align-items: center; gap: 7px;">
            <span style="font-size: 12px; color: ${s.completed ? '#34d399' : '#38bdf8'};">
              ${s.completed ? '✓' : '○'}
            </span>
            <span style="${s.completed ? 'text-decoration: line-through; opacity: 0.75;' : ''}">${s.label}</span>
          </div>
          <span style="font-size: 9px; color: ${s.completed ? '#059669' : '#94a3b8'}; background: rgba(255,255,255,0.06); padding: 2px 5px; border-radius: 4px;">
            ${s.keyHint}
          </span>
        </div>
      `
      )
      .join('');

    this.cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.15em; color: #38bdf8; text-transform: uppercase;">
          FLIGHT ORIENTATION
        </div>
        <button id="btn-close-onboarding" style="
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 13px;
          cursor: pointer;
          min-width: 36px;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        " title="Dismiss Checklist">✕</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 2px;">
        ${stepsHtml}
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
        <button id="btn-skip-onboarding-action" style="
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.45);
          border-radius: 5px;
          color: #fca5a5;
          font-family: ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 6px 12px;
          min-height: 36px;
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        ">
          ✕ SKIP TUTORIAL
        </button>
      </div>

      ${
        allDone
          ? `
        <div style="margin-top: 8px; font-size: 10px; color: #34d399; text-align: center; font-weight: 600;">
          ALL SYSTEMS NOMINAL · SAFE TRAVELS PILOT
        </div>
      `
          : ''
      }
    `;

    const bindFastAction = (el: Element | null, action: () => void) => {
      if (!el) return;
      let lastTrigger = 0;
      const trigger = (e?: any) => {
        const now = performance.now();
        if (now - lastTrigger < 350) return;
        lastTrigger = now;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        action();
      };
      el.addEventListener('pointerdown', trigger);
      el.addEventListener('touchstart', trigger, { passive: false });
      el.addEventListener('click', trigger);
    };

    const handleDismiss = () => {
      this.hide();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.storageKey, 'true');
      }
      this.onSkipCallback?.();
    };

    bindFastAction(this.cardEl.querySelector('#btn-close-onboarding'), handleDismiss);
    bindFastAction(this.cardEl.querySelector('#btn-skip-onboarding-action'), handleDismiss);
  }

  public dispose(): void {
    this.container.remove();
  }
}
