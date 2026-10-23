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
      position: fixed;
      top: max(54px, calc(env(safe-area-inset-top, 0px) + 48px));
      left: 50%;
      transform: translateX(-50%) translateY(-10px);
      width: min(540px, calc(100vw - 24px));
      background: radial-gradient(circle at 50% 0%, rgba(14, 28, 54, 0.96) 0%, rgba(4, 9, 20, 0.98) 100%);
      border: 1px solid rgba(56, 189, 248, 0.65);
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85), 0 0 28px rgba(56, 189, 248, 0.25);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 14px 18px;
      box-sizing: border-box;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      z-index: 2200;
      opacity: 0;
      display: none;
      pointer-events: none;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      touch-action: manipulation;
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
    const isAdvancing = this.isVisible && this.currentStep !== info.step;
    this.currentStep = info.step;
    this.clearHighlights();

    if (info.step === 'COMPLETED') {
      audio.playConnectChime();
      this.hide();
      return;
    }

    this.render(info, isAdvancing);
    this.applyHighlight(info.highlightSelector);

    if (!this.isVisible) {
      this.isVisible = true;
      this.container.style.display = 'block';
      this.container.style.pointerEvents = 'auto';
      audio.playBlip();
      requestAnimationFrame(() => {
        this.container.style.opacity = '1';
        this.container.style.transform = 'translateX(-50%) translateY(0)';
      });
    } else if (isAdvancing) {
      audio.playConnectChime();
    }
  }

  public hide(): void {
    this.clearHighlights();
    this.isVisible = false;
    this.container.style.opacity = '0';
    this.container.style.transform = 'translateX(-50%) translateY(-10px)';
    this.container.style.pointerEvents = 'none';
    this.container.style.display = 'none';
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

  private render(info: TutorialStepInfo, isAdvancing = false): void {
    const isHomescreenStep = info.step === 'PWA_HOMESCREEN';
    const platform = this.detectPlatform();

    // Segmented progress tracker pips
    const pipsHtml = Array.from({ length: info.totalSteps }, (_, idx) => {
      const stepNum = idx + 1;
      const isPast = stepNum < info.stepIndex;
      const isCurrent = stepNum === info.stepIndex;
      const bg = isCurrent ? '#4ade80' : isPast ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)';
      const shadow = isCurrent ? '0 0 8px #4ade80' : isPast ? '0 0 4px rgba(56, 189, 248, 0.5)' : 'none';
      return `<span style="flex: 1; height: 3px; border-radius: 2px; background: ${bg}; box-shadow: ${shadow}; transition: all 0.3s ease;"></span>`;
    }).join('');

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
      <div style="display: flex; gap: 4px; margin-bottom: 8px;">
        ${pipsHtml}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 10px #38bdf8; animation: pulseGlow 1.5s infinite;"></span>
          <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.15em; color: #7dd3fc; text-transform: uppercase;">
            🤖 SHIP COMPUTER // FLIGHT ADVISOR
          </span>
          <span style="font-size: 9px; color: #94a3b8; font-family: ui-monospace, monospace; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.2); padding: 1px 6px; border-radius: 4px;">
            STEP ${info.stepIndex} OF ${info.totalSteps}
          </span>
          ${isAdvancing ? `<span style="font-size: 8px; color: #4ade80; font-weight: 700; letter-spacing: 0.08em; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); padding: 1px 6px; border-radius: 4px;">✓ SYNCED</span>` : ''}
        </div>
        <button id="btn-skip-tutorial" style="
          background: rgba(239, 68, 68, 0.2);
          border: 1.5px solid rgba(239, 68, 68, 0.6);
          color: #fca5a5;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          cursor: pointer;
          min-height: 40px;
          min-width: 105px;
          padding: 6px 14px;
          border-radius: 6px;
          transition: all 0.15s ease;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.25);
        ">
          ✕ SKIP TUTORIAL
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
            font-size: 11.5px;
            font-weight: 700;
            min-height: 40px;
            padding: 6px 18px;
            cursor: pointer;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          ">
            ${isHomescreenStep ? 'PROCEED TO EXPLORATION ➔' : 'CONTINUE ➔'}
          </button>
        ` : `
          <button id="btn-tutorial-skip-step" style="
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.4);
            border-radius: 6px;
            color: #cbd5e1;
            font-size: 11px;
            font-weight: 600;
            min-height: 40px;
            padding: 6px 14px;
            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          ">
            SKIP STEP ➔
          </button>
        `}
      </div>
    `;

    // Hook touch & pointer responsive button listeners with fast activation
    const bindFastAction = (el: Element | null, action: () => void) => {
      if (!el) return;
      let lastTrigger = 0;
      const trigger = (e?: any) => {
        const now = performance.now();
        if (lastTrigger > 0 && now - lastTrigger < 350) return;
        lastTrigger = now;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        action();
      };
      el.addEventListener('pointerdown', trigger);
      el.addEventListener('touchstart', trigger, { passive: false });
      el.addEventListener('click', trigger);
    };

    const btnSkip = this.container.querySelector('#btn-skip-tutorial');
    bindFastAction(btnSkip, () => {
      audio.playBlip();
      this.hide();
      this.onSkipTutorialCallback?.();
    });

    const btnContinue = this.container.querySelector('#btn-tutorial-continue');
    bindFastAction(btnContinue, () => {
      audio.playBlip();
      this.onNextStepCallback?.();
    });

    const btnSkipStep = this.container.querySelector('#btn-tutorial-skip-step');
    bindFastAction(btnSkipStep, () => {
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
