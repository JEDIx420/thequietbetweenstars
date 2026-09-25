/**
 * TitleRevealSequence.ts
 * 
 * Cinematic 3D space opening reveal sequence:
 * - Rendered directly over the unified live GameRenderer space scene (zero extra WebGL context)
 * - Shimmering anamorphic flare pulse beam
 * - Sector mandate badge and cinematic typography
 * - Breathing viewport CTA plate
 * - High-speed warp flash transition to title screen on Space, Escape, Enter, or Click
 */

export class TitleRevealSequence {
  private overlayEl: HTMLElement | null = null;
  private isFinished = false;
  private onCompleteCallback: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

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
      background: radial-gradient(circle at 50% 50%, rgba(3, 3, 7, 0.45) 0%, rgba(2, 2, 6, 0.85) 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      opacity: 1;
      overflow: hidden;
      contain: strict;
      transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // HTML Content & Stylized Cinema HUD
    const contentEl = document.createElement('div');
    contentEl.id = 'title-reveal-content';
    contentEl.style.cssText = `
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      pointer-events: none;
      padding: 0 24px;
      contain: layout style;
    `;

    contentEl.innerHTML = `
      <style>
        @keyframes cinemaGlow {
          0% {
            opacity: 0;
            transform: scale(0.88) translateY(10px);
          }
          35% {
            opacity: 1;
            transform: scale(1.02) translateY(0);
          }
          85% {
            opacity: 1;
            transform: scale(1.0) translateY(0);
          }
          100% {
            opacity: 0.92;
            transform: scale(1.0) translateY(0);
          }
        }

        @keyframes badgeReveal {
          0% {
            opacity: 0;
            letter-spacing: 0.12em;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            letter-spacing: 0.28em;
            transform: translateY(0);
          }
        }

        @keyframes subReveal {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }
          40% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 0.85;
            transform: translateY(0);
          }
        }

        @keyframes flarePulse {
          0% {
            opacity: 0;
            transform: scaleX(0.2);
          }
          25% {
            opacity: 0.9;
            transform: scaleX(1.15);
          }
          65% {
            opacity: 0.45;
            transform: scaleX(1.0);
          }
          100% {
            opacity: 0.7;
            transform: scaleX(1.05);
          }
        }

        @keyframes ctaBreathing {
          0%, 100% {
            opacity: 0.85;
            box-shadow: 0 0 16px rgba(56, 189, 248, 0.2);
            transform: translateX(-50%) scale(1);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 28px rgba(56, 189, 248, 0.45);
            transform: translateX(-50%) scale(1.02);
          }
        }

        .title-reveal-main {
          font-size: clamp(20px, 5.2vw, 60px);
          font-weight: 200;
          letter-spacing: clamp(0.1em, 1.5vw, 0.35em);
          text-transform: uppercase;
          color: #f8fafc;
          text-shadow: 0 0 25px rgba(56, 189, 248, 0.8), 0 0 50px rgba(14, 165, 233, 0.4);
          animation: cinemaGlow 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          line-height: 1.2;
          text-align: center;
          max-width: min(92vw, 1000px);
          box-sizing: border-box;
          will-change: transform, opacity;
        }

        @media (max-width: 640px) {
          .title-reveal-main {
            font-size: clamp(17px, 5.2vw, 26px);
            letter-spacing: 0.12em;
          }
          .title-reveal-badge {
            font-size: 9px !important;
            letter-spacing: 0.15em !important;
            margin-bottom: 8px !important;
          }
          .title-reveal-sub {
            font-size: 11px !important;
            letter-spacing: 0.14em !important;
            margin-top: 10px !important;
          }
        }

        @media (max-height: 500px) {
          .title-reveal-main {
            font-size: clamp(17px, 4.6vw, 30px) !important;
            letter-spacing: 0.16em !important;
          }
          .title-reveal-badge {
            font-size: 9px !important;
            margin-bottom: 6px !important;
          }
          .title-reveal-sub {
            font-size: 11px !important;
            margin-top: 8px !important;
          }
        }
      </style>

      <!-- Horizontal Cinematic Anamorphic Flare Beam -->
      <div style="
        position: absolute;
        width: 100vw;
        height: 2px;
        background: linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.25) 25%, rgba(255, 255, 255, 0.95) 50%, rgba(56, 189, 248, 0.25) 75%, transparent 100%);
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.8);
        animation: flarePulse 3.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        will-change: transform, opacity;
      "></div>

      <!-- Sector Mandate Badge -->
      <div class="title-reveal-badge" style="
        font-family: ui-monospace, monospace;
        font-size: clamp(10px, 1.4vw, 13px);
        font-weight: 700;
        letter-spacing: 0.28em;
        color: #38bdf8;
        text-transform: uppercase;
        margin-bottom: 14px;
        animation: badgeReveal 2.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        will-change: transform, opacity;
      ">
        ◈ DEEP SPACE EXPLORATION DIVISION ◈
      </div>

      <!-- Main Title -->
      <div class="title-reveal-main">
        THE QUIET BETWEEN STARS
      </div>

      <!-- Subtitle -->
      <div class="title-reveal-sub" style="
        font-size: clamp(12px, 1.8vw, 16px);
        font-weight: 300;
        letter-spacing: 0.25em;
        color: #94a3b8;
        text-transform: uppercase;
        margin-top: 18px;
        animation: subReveal 3.0s ease-out forwards;
        will-change: transform, opacity;
      ">
        A Peaceful Space Odyssey
      </div>
    `;

    this.overlayEl.appendChild(contentEl);

    // Viewport-Level CTA Plate (Target lower 12-16% of viewport, never overlapping central titles)
    const ctaEl = document.createElement('div');
    ctaEl.id = 'title-reveal-cta';
    ctaEl.style.cssText = `
      position: absolute;
      bottom: clamp(40px, 14vh, 110px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 25;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 10px 28px;
      background: rgba(8, 14, 26, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 9999px;
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.22);
      font-family: ui-monospace, monospace;
      font-size: clamp(11px, 1.3vw, 13px);
      font-weight: 600;
      color: #ffffff;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
      animation: ctaBreathing 2.4s infinite ease-in-out;
      user-select: none;
      -webkit-user-select: none;
      white-space: nowrap;
      transition: all 0.2s ease;
    `;
    ctaEl.innerHTML = `
      <span>PRESS</span>
      <span style="color: #38bdf8; font-weight: 700;">SPACE / ENTER</span>
      <span>OR CLICK TO CONTINUE</span>
    `;
    this.overlayEl.appendChild(ctaEl);

    this.container.appendChild(this.overlayEl);

    // Event listeners for fast hyperspace transition to title screen
    const onTrigger = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerHyperspaceTransition();
    };

    this.overlayEl.addEventListener('click', onTrigger, { once: true });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        this.triggerHyperspaceTransition();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  public triggerHyperspaceTransition(): void {
    if (this.isFinished) return;

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    // 1. Fast text scaling and dissolve
    const contentEl = this.overlayEl?.querySelector('#title-reveal-content') as HTMLElement | null;
    if (contentEl) {
      contentEl.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s ease';
      contentEl.style.transform = 'scale(1.15)';
      contentEl.style.opacity = '0';
    }

    const ctaEl = this.overlayEl?.querySelector('#title-reveal-cta') as HTMLElement | null;
    if (ctaEl) {
      ctaEl.style.transition = 'opacity 0.18s ease-out, transform 0.2s ease-out';
      ctaEl.style.opacity = '0';
      ctaEl.style.transform = 'translateX(-50%) scale(0.94)';
    }

    // 2. Anamorphic Warp Flash beam
    if (this.overlayEl) {
      const warpFlash = document.createElement('div');
      warpFlash.style.cssText = `
        position: absolute;
        inset: 0;
        z-index: 40;
        pointer-events: none;
        background: radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0%, rgba(56, 189, 248, 0.65) 30%, rgba(2, 6, 23, 0) 75%);
        opacity: 0;
        transform: scale(0.6);
        transition: opacity 0.15s ease-out, transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      `;
      this.overlayEl.appendChild(warpFlash);
      requestAnimationFrame(() => {
        warpFlash.style.opacity = '1';
        warpFlash.style.transform = 'scale(1.4)';
      });
    }

    // 3. Mount title screen at warp peak (~140ms)
    setTimeout(() => {
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
        this.onCompleteCallback = null;
      }
    }, 140);

    // 4. Fade out entire overlay
    setTimeout(() => {
      if (this.overlayEl) {
        this.overlayEl.style.transition = 'opacity 0.25s ease-out';
        this.overlayEl.style.opacity = '0';
        this.overlayEl.style.pointerEvents = 'none';
      }
    }, 180);

    // 5. Clean up DOM elements
    setTimeout(() => {
      this.finish();
    }, 380);
  }

  private finish(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
      this.overlayEl = null;
    }

    if (this.onCompleteCallback) {
      this.onCompleteCallback();
      this.onCompleteCallback = null;
    }
  }
}
