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
      top: 68px;
      right: 20px;
      z-index: 1200;
      pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, monospace;
      max-width: 310px;
      transition: opacity 0.35s ease, transform 0.35s ease;
      opacity: 0;
      transform: translateY(-8px);
    `;

    this.cardEl = document.createElement('div');
    this.cardEl.style.cssText = `
      background: rgba(10, 16, 28, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-left: 3px solid #38bdf8;
      border-radius: 8px;
      padding: 12px 14px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.65), 0 0 16px rgba(56, 189, 248, 0.15);
      backdrop-filter: blur(10px);
      pointer-events: auto;
      color: #f1f5f9;
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
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 14px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
        " title="Dismiss Checklist">✕</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 2px;">
        ${stepsHtml}
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

    this.cardEl.querySelector('#btn-close-onboarding')?.addEventListener('click', () => {
      this.hide();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.storageKey, 'true');
      }
    });
  }

  public dispose(): void {
    this.container.remove();
  }
}
