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
            heading: 'AUTOSAVE & PHONE COMPANION',
            text: 'Your progress autosaves continuously. Pair your phone at any time as an in-universe physical cockpit touch terminal.',
          },
        ],
        closingQuote: 'Pick a star. See what’s there.',
      },
    ];

    const current = screens[this.currentStep];

    this.container.innerHTML = `
      <div style="
        max-width: 680px;
        width: 100%;
        background: rgba(10, 16, 28, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 12px;
        box-shadow: 0 0 35px rgba(56, 189, 248, 0.15), 0 20px 40px rgba(0, 0, 0, 0.6);
        padding: 36px 40px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        position: relative;
      ">
        <!-- Top Bar with Step Indicators and Skip -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
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
            background: transparent;
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 4px;
            color: #94a3b8;
            font-size: 11px;
            letter-spacing: 0.1em;
            padding: 4px 12px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">SKIP BRIEFING [ESC]</button>
        </div>

        <!-- Main Title -->
        <h2 style="font-size: 28px; font-weight: 300; margin: 0 0 10px 0; color: #f8fafc; letter-spacing: 0.04em;">
          ${current.title}
        </h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px 0;">
          ${current.summary}
        </p>

        <!-- Feature Points -->
        <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
          ${current.sections.map(s => `
            <div style="padding: 12px 16px; background: rgba(15, 23, 42, 0.6); border-left: 2px solid #38bdf8; border-radius: 0 6px 6px 0;">
              <div style="font-size: 11px; font-weight: 700; color: #38bdf8; letter-spacing: 0.1em; margin-bottom: 4px;">
                ${s.heading}
              </div>
              <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                ${s.text}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Optional Controls Table (Screen 1) -->
        ${current.controls ? `
          <div style="
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 24px;
          ">
            <div style="font-size: 10px; letter-spacing: 0.2em; color: #94a3b8; margin-bottom: 8px; font-weight: 600;">
              CORE FLIGHT INPUTS
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 16px; font-size: 12px;">
              ${current.controls.map(c => `
                <div style="display: flex; justify-content: space-between; font-family: ui-monospace, monospace;">
                  <span style="color: #38bdf8; font-weight: 600;">${c.key}</span>
                  <span style="color: #94a3b8; font-family: ui-sans-serif, sans-serif;">${c.desc}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Optional Closing Quote (Screen 3) -->
        ${current.closingQuote ? `
          <div style="
            text-align: center;
            font-size: 16px;
            font-style: italic;
            color: #38bdf8;
            letter-spacing: 0.08em;
            margin: 8px 0 24px 0;
            text-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
          ">
            "${current.closingQuote}"
          </div>
        ` : ''}

        <!-- Bottom Action Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
          <div>
            ${this.currentStep > 0 ? `
              <button id="btn-briefing-prev" style="
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 6px;
                color: #cbd5e1;
                font-size: 12px;
                padding: 10px 20px;
                cursor: pointer;
              ">← PREVIOUS</button>
            ` : ''}
          </div>

          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 11px; color: #64748b; font-family: ui-monospace, monospace;">
              [SPACE / ENTER]
            </span>
            <button id="btn-briefing-next" style="
              background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(14, 165, 233, 0.2));
              border: 1px solid #38bdf8;
              border-radius: 6px;
              color: #f8fafc;
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 0.1em;
              padding: 10px 28px;
              cursor: pointer;
              box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
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
