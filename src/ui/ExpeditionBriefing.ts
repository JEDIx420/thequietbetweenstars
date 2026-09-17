import { audio } from '../audio/AudioEngine';

export class ExpeditionBriefing {
  private container: HTMLElement;
  private currentStep = 0;
  private onCompleteCallback: (() => void) | null = null;
  private isDisposed = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'expedition-briefing';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: radial-gradient(circle at 50% 50%, rgba(6, 12, 24, 0.94) 0%, rgba(2, 3, 7, 0.98) 100%);
      backdrop-filter: blur(14px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      user-select: none;
      padding: 24px;
      box-sizing: border-box;
      opacity: 0;
      transition: opacity 0.35s ease;
    `;
    this.parent.appendChild(this.container);
  }

  public show(onComplete: () => void): void {
    this.onCompleteCallback = onComplete;
    this.currentStep = 0;
    this.render();

    requestAnimationFrame(() => {
      this.container.style.opacity = '1';
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (this.isDisposed) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.finish();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.next();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private next(): void {
    if (this.currentStep < 2) {
      audio.playBlip();
      this.currentStep++;
      this.render();
    } else {
      audio.playConnectChime();
      this.finish();
    }
  }

  private prev(): void {
    if (this.currentStep > 0) {
      audio.playBlip();
      this.currentStep--;
      this.render();
    }
  }

  private render(): void {
    const screens = [
      // SCREEN 1: FLY ANYWHERE
      {
        badge: 'EXPEDITION BRIEFING // 01',
        title: 'Fly Anywhere',
        summary: 'Deep space has no walls. You command a dedicated survey starfighter capable of crossing stellar voids and mapping living planetary systems.',
        sections: [
          {
            heading: 'MANUAL FLIGHT & AUTOPILOT',
            text: 'Control your craft directly or engage Autopilot [X] to orient toward chosen waypoints and celestial bodies.',
          },
          {
            heading: 'STAR CARTOGRAPHY & WARP DRIVE',
            text: 'Open the Star Chart [M] at any time. Select any reachable destination, lock your course vector, and engage the 5-second relativistic Warp Drive.',
          },
        ],
        controls: [
          { key: 'W / S', desc: 'Pitch Up / Down' },
          { key: 'A / D', desc: 'Yaw Left / Right' },
          { key: 'SHIFT / CTRL', desc: 'Throttle Accelerate / Decelerate' },
          { key: 'SPACE', desc: 'Survey Resonance Pulse' },
          { key: 'M', desc: 'Holographic Star Chart' },
          { key: 'TAB', desc: 'Cycle Radar Waypoint' },
          { key: 'X', desc: 'Autopilot Alignment' },
        ],
      },
      // SCREEN 2: EXPLORE WORLDS
      {
        badge: 'EXPEDITION BRIEFING // 02',
        title: 'Explore Worlds',
        summary: 'Planets are real, physical places. Approach any celestial body to inspect its composition, atmosphere, and ecological profile.',
        sections: [
          {
            heading: 'APPROACH & ORBITAL ENTRY',
            text: 'Fly toward planets to transition smoothly into orbit. Survey equatorial regions and select atmospheric descent corridors.',
          },
          {
            heading: 'LOW-ALTITUDE SURFACE FLIGHT',
            text: 'Descend through cloud layers into procedural terrain. Fly over oceans, canyons, and mountain ridges while maintaining altitude.',
          },
          {
            heading: 'ECOLOGY & LIVING SPECIES',
            text: 'Scan native flora and fauna using your survey pulse. Discover sentient structures, anomalous monoliths, and collect survey credits.',
          },
        ],
      },
      // SCREEN 3: KEEP WHAT YOU FIND
      {
        badge: 'EXPEDITION BRIEFING // 03',
        title: 'Keep What You Find',
        summary: 'Your journey persists. Every system surveyed, world catalogued, and anomalous signal decoded is preserved in your permanent record.',
        sections: [
          {
            heading: 'SURVEY CREDITS & SAMPLES',
            text: 'Collect glowing survey motes and gather planetary samples to fund upgrades and module orders.',
          },
          {
            heading: 'SHIP LOG & SUPPLY MANIFEST',
            text: 'Review documented worlds in your Ship Log [J]. Order experimental ship equipment and surveyor modules through Supply [U].',
          },
          {
            heading: 'AUTOSAVE & NATIVE FLIGHT DECK',
            text: 'Your journey autosaves continuously. Play on desktop with keyboard & mouse or on mobile & tablet with intuitive on-screen flight stick, throttle, and sensor controls.',
          },
        ],
        closingQuote: 'Pick a star. See what’s there.',
      },
    ];

    const current = screens[this.currentStep];

    this.container.innerHTML = `
      <div id="briefing-card" style="
        max-width: 680px;
        width: 100%;
        max-height: min(88dvh, 720px);
        background: rgba(10, 16, 28, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 14px;
        box-shadow: 0 0 35px rgba(56, 189, 248, 0.15), 0 20px 40px rgba(0, 0, 0, 0.7);
        padding: clamp(16px, 3.5vw, 32px);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      ">
        <!-- Top Bar with Step Indicators and Skip -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; font-weight: 700;">
              ${current.badge}
            </div>
            <div style="display: flex; gap: 6px; margin-left: 12px;">
              <span style="width: 24px; height: 3px; border-radius: 2px; background: ${this.currentStep === 0 ? '#38bdf8' : 'rgba(148, 163, 184, 0.3)'};"></span>
              <span style="width: 24px; height: 3px; border-radius: 2px; background: ${this.currentStep === 1 ? '#38bdf8' : 'rgba(148, 163, 184, 0.3)'};"></span>
              <span style="width: 24px; height: 3px; border-radius: 2px; background: ${this.currentStep === 2 ? '#38bdf8' : 'rgba(148, 163, 184, 0.3)'};"></span>
            </div>
          </div>

          <button id="btn-skip-briefing" style="
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 6px;
            color: #94a3b8;
            font-size: 11px;
            letter-spacing: 0.08em;
            padding: 6px 14px;
            cursor: pointer;
            transition: all 0.15s ease;
            touch-action: manipulation;
          ">SKIP [ESC]</button>
        </div>

        <!-- Main Title -->
        <h2 style="font-size: clamp(22px, 5vw, 28px); font-weight: 300; margin: 0 0 8px 0; color: #f8fafc; letter-spacing: 0.04em;">
          ${current.title}
        </h2>
        <p style="font-size: clamp(13px, 3.2vw, 14px); line-height: 1.6; color: #94a3b8; margin: 0 0 20px 0;">
          ${current.summary}
        </p>

        <!-- Feature Points -->
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
          ${current.sections.map(s => `
            <div style="padding: 10px 14px; background: rgba(15, 23, 42, 0.65); border-left: 2px solid #38bdf8; border-radius: 0 6px 6px 0;">
              <div style="font-size: 11px; font-weight: 700; color: #38bdf8; letter-spacing: 0.1em; margin-bottom: 4px;">
                ${s.heading}
              </div>
              <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5;">
                ${s.text}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Optional Controls Table (Screen 1) -->
        ${current.controls ? `
          <div style="
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 20px;
          ">
            <div style="font-size: 10px; letter-spacing: 0.2em; color: #94a3b8; margin-bottom: 8px; font-weight: 600;">
              FLIGHT DECK & SENSOR CONTROLS
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px 14px; font-size: 11px;">
              ${current.controls.map(c => `
                <div style="display: flex; justify-content: space-between; font-family: ui-monospace, monospace; gap: 8px;">
                  <span style="color: #38bdf8; font-weight: 600;">${c.key}</span>
                  <span style="color: #94a3b8; font-family: ui-sans-serif, sans-serif; text-align: right;">${c.desc}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Optional Closing Quote (Screen 3) -->
        ${current.closingQuote ? `
          <div style="
            text-align: center;
            font-size: 15px;
            font-style: italic;
            color: #38bdf8;
            letter-spacing: 0.08em;
            margin: 4px 0 20px 0;
            text-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
          ">
            "${current.closingQuote}"
          </div>
        ` : ''}

        <!-- Bottom Action Bar (Sticky at bottom of scroll container) -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          position: sticky;
          bottom: 0;
          background: rgba(10, 16, 28, 0.95);
          backdrop-filter: blur(8px);
          z-index: 10;
        ">
          <div>
            ${this.currentStep > 0 ? `
              <button id="btn-briefing-prev" style="
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 6px;
                color: #cbd5e1;
                font-size: 12px;
                padding: 10px 18px;
                cursor: pointer;
                touch-action: manipulation;
              ">← PREV</button>
            ` : ''}
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="btn-briefing-next" style="
              background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(14, 165, 233, 0.2));
              border: 1px solid #38bdf8;
              border-radius: 6px;
              color: #f8fafc;
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 0.08em;
              padding: 10px 24px;
              cursor: pointer;
              box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
              touch-action: manipulation;
            ">
              ${this.currentStep === 2 ? 'BEGIN EXPEDITION →' : 'NEXT →'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-skip-briefing')?.addEventListener('click', () => {
      audio.playBlip();
      this.finish();
    });

    this.container.querySelector('#btn-briefing-prev')?.addEventListener('click', () => {
      this.prev();
    });

    this.container.querySelector('#btn-briefing-next')?.addEventListener('click', () => {
      this.next();
    });

    // Mobile touch swipe support
    const card = this.container.querySelector('#briefing-card') as HTMLElement;
    if (card) {
      let touchStartX = 0;
      let touchStartY = 0;
      card.addEventListener('touchstart', (e: TouchEvent) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      card.addEventListener('touchend', (e: TouchEvent) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        // Only swipe if horizontal movement is dominant
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) {
            this.next();
          } else {
            this.prev();
          }
        }
      }, { passive: true });
    }
  }

  private finish(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    this.container.style.opacity = '0';
    setTimeout(() => {
      if (this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
        this.onCompleteCallback = null;
      }
    }, 350);
  }
}
