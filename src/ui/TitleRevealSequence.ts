/**
 * TitleRevealSequence.ts
 * 
 * Elegant 3-second opening reveal sequence:
 * - Subtle particle field drift
 * - Luminous typography fade-in with tracking expansion
 * - "A Peaceful Space RPG" subtitle fade-in
 * - Seamless fade out into title screen or game
 * - Fully skippable via Space, Escape, or pointer click
 */

export class TitleRevealSequence {
  private overlayEl: HTMLElement | null = null;
  private isFinished = false;
  private onCompleteCallback: (() => void) | null = null;
  private timeoutId: number | null = null;

  constructor(private container: HTMLElement) {}

  public play(onComplete: () => void): void {
    this.onCompleteCallback = onComplete;
    this.isFinished = false;

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'title-reveal-overlay';
    this.overlayEl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: #030307;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer;
      user-select: none;
      opacity: 1;
      transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    this.overlayEl.innerHTML = `
      <style>
        @keyframes titleGlowPulse {
          0% {
            opacity: 0;
            transform: scale(0.96) translateY(6px);
            letter-spacing: 0.28em;
            text-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
          }
          40% {
            opacity: 1;
            transform: scale(1.0) translateY(0);
            letter-spacing: 0.38em;
            text-shadow: 0 0 40px rgba(56, 189, 248, 0.75), 0 0 80px rgba(56, 189, 248, 0.35);
          }
          85% {
            opacity: 1;
            letter-spacing: 0.42em;
            text-shadow: 0 0 25px rgba(56, 189, 248, 0.5);
          }
          100% {
            opacity: 0.85;
            letter-spacing: 0.44em;
            text-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
          }
        }

        @keyframes subtitleFade {
          0% { opacity: 0; transform: translateY(4px); }
          50% { opacity: 0; }
          100% { opacity: 0.7; transform: translateY(0); }
        }

        @keyframes skipHintFade {
          0% { opacity: 0; }
          60% { opacity: 0; }
          100% { opacity: 0.4; }
        }
      </style>

      <div style="
        font-size: clamp(20px, 4.5vw, 42px);
        font-weight: 200;
        text-transform: uppercase;
        color: #f8fafc;
        animation: titleGlowPulse 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        text-align: center;
        padding: 0 20px;
        line-height: 1.4;
      ">
        THE QUIET BETWEEN STARS
      </div>

      <div style="
        font-size: clamp(11px, 1.6vw, 15px);
        font-weight: 300;
        letter-spacing: 0.22em;
        color: #38bdf8;
        text-transform: uppercase;
        margin-top: 14px;
        animation: subtitleFade 2.6s ease-out forwards;
      ">
        A Peaceful Space RPG
      </div>

      <div style="
        position: absolute;
        bottom: 24px;
        font-size: 10px;
        letter-spacing: 0.2em;
        color: #64748b;
        text-transform: uppercase;
        animation: skipHintFade 2.5s ease-out forwards;
      ">
        CLICK OR PRESS ANY KEY TO SKIP
      </div>
    `;

    this.container.appendChild(this.overlayEl);

    // Event listeners for skipping
    const onSkip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    };

    this.overlayEl.addEventListener('click', onSkip, { once: true });
    window.addEventListener('keydown', onSkip, { once: true });

    // Auto-advance after 3.2 seconds
    this.timeoutId = window.setTimeout(() => {
      this.finish();
    }, 3200);
  }

  private finish(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0';
      this.overlayEl.style.pointerEvents = 'none';

      setTimeout(() => {
        if (this.overlayEl && this.overlayEl.parentNode) {
          this.overlayEl.parentNode.removeChild(this.overlayEl);
          this.overlayEl = null;
        }
        if (this.onCompleteCallback) {
          this.onCompleteCallback();
          this.onCompleteCallback = null;
        }
      }, 850);
    } else if (this.onCompleteCallback) {
      this.onCompleteCallback();
      this.onCompleteCallback = null;
    }
  }
}
