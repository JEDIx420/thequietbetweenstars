import { audio } from '../audio/AudioEngine';
import type { TutorialStep, TutorialStepInfo } from '../tutorial/TutorialDirector';

export class ShipComputerGuidanceHUD {
  private parent: HTMLElement;
  private container: HTMLElement;
  private currentStep: TutorialStep | null = null;
  private isVisible = false;
  private highlightedElements: HTMLElement[] = [];
  private onSkipTutorialCallback: (() => void) | null = null;
  private onNextStepCallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.container = document.createElement('div');
    this.container.id = 'ship-computer-guidance-hud';
    this.container.style.cssText = `
      position: absolute;
      top: max(54px, calc(env(safe-area-inset-top, 0px) + 48px));
      left: 50%;
      transform: translateX(-50%) translateY(-10px);
      width: min(520px, calc(100vw - 28px));
      background: radial-gradient(circle at 50% 0%, rgba(14, 28, 54, 0.95) 0%, rgba(4, 9, 20, 0.98) 100%);
      border: 1px solid rgba(56, 189, 248, 0.55);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.25);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 14px 18px;
      box-sizing: border-box;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      z-index: 950;
      opacity: 0;
      pointer-events: auto;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    `;
    this.parent.appendChild(this.container);
  }

  public setCallbacks(onSkipTutorial: () => void, onNextStep: () => void): void {
    this.onSkipTutorialCallback = onSkipTutorial;
    this.onNextStepCallback = onNextStep;
  }

  public getCurrentStep(): TutorialStep | null {
    return this.currentStep;
  }

  public isGuideVisible(): boolean {
    return this.isVisible;
  }

  public showStep(info: TutorialStepInfo): void {
    this.currentStep = info.step;
    this.clearHighlights();

    if (info.step === 'COMPLETED') {
      this.hide();
      return;
    }

    this.render(info);
    this.applyHighlight(info.highlightSelector);

    if (!this.isVisible) {
      this.isVisible = true;
      audio.playBlip();
      requestAnimationFrame(() => {
        this.container.style.opacity = '1';
        this.container.style.transform = 'translateX(-50%) translateY(0)';
      });
    }
  }

  public hide(): void {
    if (!this.isVisible) return;
    this.clearHighlights();
    this.isVisible = false;
    this.container.style.opacity = '0';
    this.container.style.transform = 'translateX(-50%) translateY(-10px)';
  }

  private applyHighlight(selector?: string): void {
    if (!selector) return;
    try {
      const els = document.querySelectorAll<HTMLElement>(selector);
      els.forEach((el) => {
        el.classList.add('tutorial-target-highlight');
        this.highlightedElements.push(el);
      });
    } catch {
      // Ignored if invalid selector
    }
  }

  private clearHighlights(): void {
    for (const el of this.highlightedElements) {
      el.classList.remove('tutorial-target-highlight');
    }
    this.highlightedElements = [];
  }

  private detectPlatform(): 'ios' | 'android' | 'desktop' {
    if (typeof navigator === 'undefined') return 'desktop';
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      return 'ios';
    }
    if (/android/i.test(ua)) {
      return 'android';
    }
    return 'desktop';
  }

  private render(info: TutorialStepInfo): void {
    const isHomescreenStep = info.step === 'PWA_HOMESCREEN';
    const platform = this.detectPlatform();

    let homescreenGuideHtml = '';
    if (isHomescreenStep) {
      if (platform === 'ios') {
        homescreenGuideHtml = `
          <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 10px 12px; margin-top: 10px; font-size: 11px; line-height: 1.5; color: #cbd5e1;">
            <div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span>📱 APPLE iOS SAFARI INSTRUCTIONS:</span>
            </div>
            <div>1. Tap Safari's <strong>Share</strong> button (the square with an arrow ⎋ at bottom).</div>
            <div>2. Scroll down and select <strong>"Add to Home Screen"</strong>.</div>
            <div>3. Confirm the new cosmic logo icon and tap <strong>Add</strong>.</div>
          </div>
        `;
      } else if (platform === 'android') {
        homescreenGuideHtml = `
          <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 10px 12px; margin-top: 10px; font-size: 11px; line-height: 1.5; color: #cbd5e1;">
            <div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span>📱 ANDROID CHROME INSTRUCTIONS:</span>
            </div>
            <div>1. Tap Chrome's menu <strong>(⋮)</strong> in the top-right corner.</div>
            <div>2. Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</div>
            <div>3. Tap <strong>Install</strong> to launch directly with the full cosmic icon.</div>
          </div>
        `;
      } else {
        homescreenGuideHtml = `
          <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 10px 12px; margin-top: 10px; font-size: 11px; line-height: 1.5; color: #cbd5e1;">
            <div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span>💻 DESKTOP PWA & BOOKMARKING:</span>
            </div>
            <div>1. Click the <strong>Install</strong> icon in your browser address bar.</div>
            <div>2. Or bookmark this page <strong>[Ctrl+D / ⌘+D]</strong> for instant launch.</div>
          </div>
        `;
      }
    }

    this.container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 10px #38bdf8; animation: pulseGlow 1.5s infinite;"></span>
          <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.15em; color: #7dd3fc; text-transform: uppercase;">
            🤖 SHIP COMPUTER // FLIGHT ADVISOR
          </span>
          <span style="font-size: 9px; color: #94a3b8; font-family: ui-monospace, monospace; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.2); padding: 1px 6px; border-radius: 4px;">
            STEP ${info.stepIndex} OF ${info.totalSteps}
          </span>
        </div>
        <button id="btn-skip-tutorial" style="
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.08em;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          transition: color 0.15s ease;
        ">
          [SKIP TUTORIAL]
        </button>
      </div>

      <div style="margin-bottom: 6px;">
        <div style="font-size: 13px; font-weight: 700; color: #f8fafc; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: space-between;">
          <span>${info.title}</span>
          ${info.badge ? `<span style="font-size: 9.5px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.5); padding: 2px 8px; border-radius: 6px; font-family: ui-monospace, monospace;">${info.badge}</span>` : ''}
        </div>
        <div style="font-size: 11.5px; color: #cbd5e1; margin-top: 4px; line-height: 1.45;">
          ${info.instruction}
        </div>
        ${info.detail ? `
          <div style="font-size: 10px; color: #94a3b8; margin-top: 3px; font-style: italic;">
            ${info.detail}
          </div>
        ` : ''}
      </div>

      ${homescreenGuideHtml}

      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 10px;">
        ${info.canManuallyAdvance || isHomescreenStep ? `
          <button id="btn-tutorial-continue" style="
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.35) 0%, rgba(14, 165, 233, 0.5) 100%);
            border: 1px solid rgba(56, 189, 248, 0.8);
            border-radius: 6px;
            color: #ffffff;
            font-size: 10.5px;
            font-weight: 700;
            padding: 5px 14px;
            cursor: pointer;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
            touch-action: manipulation;
          ">
            ${isHomescreenStep ? 'PROCEED TO EXPLORATION ➔' : 'CONTINUE ➔'}
          </button>
        ` : `
          <button id="btn-tutorial-skip-step" style="
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 6px;
            color: #94a3b8;
            font-size: 9.5px;
            padding: 4px 10px;
            cursor: pointer;
            touch-action: manipulation;
          ">
            SKIP STEP ➔
          </button>
        `}
      </div>
    `;

    // Hook button listeners
    const btnSkip = this.container.querySelector('#btn-skip-tutorial');
    btnSkip?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playBlip();
      this.hide();
      this.onSkipTutorialCallback?.();
    });

    const btnContinue = this.container.querySelector('#btn-tutorial-continue');
    btnContinue?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playBlip();
      this.onNextStepCallback?.();
    });

    const btnSkipStep = this.container.querySelector('#btn-tutorial-skip-step');
    btnSkipStep?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playBlip();
      this.onNextStepCallback?.();
    });
  }

  public dispose(): void {
    this.clearHighlights();
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
