import { audio } from '../audio/AudioEngine';

export class ExpeditionBriefing {
  private container: HTMLElement;
  private currentStep = 0;
  private totalSteps = 5;
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

    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(cb, 16);
    raf(() => {
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
    if (this.currentStep < this.totalSteps - 1) {
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

  private isTouchDevice(): boolean {
    return (
      (typeof window !== 'undefined' && 'ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)')?.matches)
    );
  }

  private render(): void {
    const isTouch = this.isTouchDevice();

    const screens = [
      // SCREEN 1: YOUR JOURNEY
      {
        badge: 'EXPEDITION BRIEFING // 01',
        title: 'Your Journey',
        summary: 'Follow the mysterious harmonic signal, or chart your own path. The story waits for you. Exploration does not.',
        sections: [
          {
            heading: 'INDEPENDENT SURVEY PILOT',
            text: 'You command the SC-1, a deep-range survey craft designed for long solo expeditions. Your mission is discovery, observation, and cataloguing the unknown.',
          },
          {
            heading: 'OPEN GALAXY // MAIN STORY',
            text: 'An ancient resonance is echoing across this sector. You can pursue this central mystery or freely explore any star, planet, and moon without restrictions.',
          },
        ],
      },
      // SCREEN 2: FLY & NAVIGATE
      {
        badge: 'EXPEDITION BRIEFING // 02',
        title: 'Fly & Navigate',
        summary: isTouch
          ? 'Intuitive touch controls tailored for mobile and tablet navigation.'
          : 'Full flight control with keyboard and mouse for precision maneuvers.',
        sections: [
          {
            heading: isTouch ? 'TOUCH FLIGHT CONTROLS' : 'MANUAL FLIGHT & AUTOPILOT',
            text: isTouch
              ? 'Use the virtual stick on the left for pitch and yaw. Use the vertical slider on the right to regulate relativistic throttle.'
              : 'Steer with WASD. Accelerate and decelerate with SHIFT and CTRL. Use Autopilot [X] to automatically align with selected targets.',
          },
          {
            heading: isTouch ? 'TARGETING & STAR CHART' : 'TARGET LOCK & STAR CARTOGRAPHY',
            text: isTouch
              ? 'Tap the target button or tap directly on celestial bodies to lock sensors. Open the Star Chart at any time to plot warp jumps.'
              : 'Press [T] to lock onto whatever is in front of your ship. Cycle radar targets with [TAB]. Open the Star Chart [M] to initiate warp.',
          },
        ],
        controls: isTouch
          ? [
              { key: 'FLIGHT STICK', desc: 'Left side — Pitch & Yaw' },
              { key: 'THROTTLE SLIDER', desc: 'Right side — Forward / Reverse Speed' },
              { key: 'TARGET BUTTON', desc: 'Lock closest target in view' },
              { key: 'SENSOR / SCAN', desc: 'Hold for multi-stage anomaly scanning' },
              { key: 'MAP [M]', desc: 'Open Holographic Star Chart' },
            ]
          : [
              { key: 'W / S', desc: 'Pitch Up / Down' },
              { key: 'A / D', desc: 'Yaw Left / Right' },
              { key: 'SHIFT / CTRL', desc: 'Throttle Accelerate / Decelerate' },
              { key: 'T', desc: 'Lock Target Ahead' },
              { key: 'TAB', desc: 'Cycle Radar Waypoint' },
              { key: 'X', desc: 'Autopilot Alignment' },
              { key: 'M', desc: 'Holographic Star Chart' },
            ],
      },
      // SCREEN 3: EXPLORE WORLDS
      {
        badge: 'EXPEDITION BRIEFING // 03',
        title: 'Explore Worlds',
        summary: 'Planets are real celestial bodies with atmospheres, geography, and living ecosystems.',
        sections: [
          {
            heading: 'APPROACH & ORBITAL ENTRY',
            text: 'Fly toward any planet to establish orbit. Review its environmental profile, surface gravity, and biosignatures before selecting a landing region.',
          },
          {
            heading: 'ATMOSPHERIC DESCENT & SURFACE FLIGHT',
            text: 'Descend through clouds into procedural terrain. Cruise over mountain ridges, alien forests, volcanic fissures, and vast oceans.',
          },
          {
            heading: 'BIOSPHERES & SILENT RUINS',
            text: 'Not every planet harbors life—sterile worlds hold valuable minerals, while garden worlds teem with native flora, fauna, and ancient titan landmarks.',
          },
        ],
      },
      // SCREEN 4: SCAN, DISCOVER & UPGRADE
      {
        badge: 'EXPEDITION BRIEFING // 04',
        title: 'Scan, Discover & Upgrade',
        summary: 'Collect telemetry, analyze unknown phenomena, and enhance the SC-1.',
        sections: [
          {
            heading: 'STAGED RESONANCE SCANNING',
            text: 'Ancient resonance monoliths require multi-stage scanning. Approach closer and hold the scan button through all 4 stages to penetrate harmonic shields and recover telemetry fragments.',
          },
          {
            heading: 'SURVEY CREDITS & SAMPLES',
            text: 'Scanning discoveries awards Survey Credits and geological samples. Use the Ship Journal [J] to review your permanent expedition archive.',
          },
          {
            heading: 'SUPPLY & MODULE UPGRADES',
            text: 'Order surveyor modules, booster drives, and sensor suites at orbital stations or summon deep-space supply courier pods.',
          },
        ],
      },
      // SCREEN 5: THE SIGNAL
      {
        badge: 'EXPEDITION BRIEFING // 05',
        title: 'The Subcarrier Signal',
        summary: 'A persistent, structured transmission is modulating the hyperlane grid of this star system.',
        sections: [
          {
            heading: 'CURRENT PRIORITY // ANOMALOUS CARRIER',
            text: 'Frequency: 432.8 Hz · Mathematically structured · Non-stellar origin · Location: within local star system.',
          },
          {
            heading: 'FIRST OBJECTIVE',
            text: 'Review navigation telemetry with Mnemosyne, locate the source of the resonance, and begin Chapter 1: The Resonance.',
          },
        ],
        closingQuote: 'The quiet is not empty. Something is answering.',
      },
    ];

    const current = screens[this.currentStep];

    this.container.innerHTML = `
      <div id="briefing-card" style="
        max-width: 680px;
        width: 100%;
        max-height: min(90dvh, 720px);
        background: rgba(10, 16, 28, 0.94);
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
            <div style="display: flex; gap: 5px; margin-left: 12px;">
              ${Array.from({ length: this.totalSteps }).map((_, idx) => `
                <span style="width: 18px; height: 3px; border-radius: 2px; background: ${this.currentStep === idx ? '#38bdf8' : 'rgba(148, 163, 184, 0.25)'};"></span>
              `).join('')}
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
          ">${isTouch ? '✕ SKIP' : 'SKIP [ESC]'}</button>
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
          ${current.sections.map((s) => `
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

        <!-- Optional Controls Table (Screen 2) -->
        ${current.controls ? `
          <div style="
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 20px;
          ">
            <div style="font-size: 10px; letter-spacing: 0.2em; color: #94a3b8; margin-bottom: 8px; font-weight: 600;">
              ${isTouch ? 'TOUCH CONTROL MAPPING' : 'KEYBOARD & FLIGHT DECK CONTROLS'}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 14px; font-size: 11px;">
              ${current.controls.map((c) => `
                <div style="display: flex; justify-content: space-between; font-family: ui-monospace, monospace; gap: 8px;">
                  <span style="color: #38bdf8; font-weight: 600;">${c.key}</span>
                  <span style="color: #94a3b8; font-family: ui-sans-serif, sans-serif; text-align: right;">${c.desc}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Optional Closing Quote (Screen 5) -->
        ${current.closingQuote ? `
          <div style="
            text-align: center;
            font-size: 14px;
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
            ` : `
              <button id="btn-briefing-quickstart" style="
                background: rgba(34, 197, 94, 0.15);
                border: 1px solid rgba(74, 222, 128, 0.4);
                border-radius: 6px;
                color: #86efac;
                font-size: 11.5px;
                font-weight: 600;
                padding: 10px 16px;
                cursor: pointer;
                touch-action: manipulation;
              ">START FLYING →</button>
            `}
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
              ${this.currentStep === this.totalSteps - 1 ? 'BEGIN EXPEDITION →' : 'NEXT →'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-skip-briefing')?.addEventListener('click', () => {
      audio.playBlip();
      this.finish();
    });

    this.container.querySelector('#btn-briefing-quickstart')?.addEventListener('click', () => {
      audio.playConnectChime();
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
      card.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        },
        { passive: true }
      );

      card.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          const touchEndX = e.changedTouches[0].screenX;
          const touchEndY = e.changedTouches[0].screenY;
          const dx = touchEndX - touchStartX;
          const dy = touchEndY - touchStartY;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) {
              this.next();
            } else {
              this.prev();
            }
          }
        },
        { passive: true }
      );
    }
  }

  public dispose(): void {
    this.finish();
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
