export type HelpTab = 'FLIGHT' | 'NAVIGATION' | 'EXPLORATION' | 'COMPANION' | 'LOG';

export class HelpModal {
  private container: HTMLElement;
  private isVisible = false;
  private currentTab: HelpTab = 'FLIGHT';
  private inputMode: 'keyboard' | 'companion' = 'keyboard';

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'help-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2100;
      background: radial-gradient(circle at 50% 50%, rgba(10, 15, 26, 0.97) 0%, rgba(3, 3, 7, 0.98) 100%);
      backdrop-filter: blur(14px);
      display: none;
      flex-direction: column;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      user-select: none;
    `;

    this.container.innerHTML = `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: clamp(14px, 3vw, 20px) clamp(16px, 4vw, 32px);
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
        flex-wrap: wrap;
        gap: 8px;
      ">
        <div>
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">SHIP'S MANUAL</div>
          <h2 style="font-size: clamp(18px, 4vw, 22px); font-weight: 300; margin: 4px 0 0 0;">Flight Operations & Guide</h2>
        </div>
        <button id="btn-help-close" style="
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          color: #cbd5e1;
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          touch-action: manipulation;
        ">CLOSE [H / ? / ESC]</button>
      </div>

      <!-- Navigation Tabs -->
      <div style="
        display: flex;
        gap: 8px;
        padding: 10px clamp(16px, 4vw, 32px);
        background: rgba(15, 23, 42, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        overflow-x: auto;
        white-space: nowrap;
        -webkit-overflow-scrolling: touch;
      ">
        <button class="help-tab-btn" data-tab="FLIGHT" style="padding: 6px 14px; background: #0284c7; border: none; border-radius: 6px; color: #fff; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0;">FLIGHT CONTROLS</button>
        <button class="help-tab-btn" data-tab="NAVIGATION" style="padding: 6px 14px; background: transparent; border: none; border-radius: 6px; color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0;">NAVIGATION & WARP</button>
        <button class="help-tab-btn" data-tab="EXPLORATION" style="padding: 6px 14px; background: transparent; border: none; border-radius: 6px; color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0;">EXPLORATION & SCAN</button>
        <button class="help-tab-btn" data-tab="COMPANION" style="padding: 6px 14px; background: transparent; border: none; border-radius: 6px; color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0;">TOUCH CONTROLS</button>
        <button class="help-tab-btn" data-tab="LOG" style="padding: 6px 14px; background: transparent; border: none; border-radius: 6px; color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0;">SHIP LOG & SAVE</button>
      </div>

      <!-- Content Area -->
      <div id="help-tab-content" style="
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: clamp(16px, 4vw, 32px);
        max-width: 800px;
        line-height: 1.6;
        box-sizing: border-box;
      "></div>
    `;

    parent.appendChild(this.container);
    this.setupEvents();
  }

  public setInputMode(mode: 'keyboard' | 'companion'): void {
    this.inputMode = mode;
    if (this.isVisible) this.renderTab(this.currentTab);
  }

  private setupEvents(): void {
    this.container.querySelector('#btn-help-close')?.addEventListener('click', () => {
      this.hide();
    });

    const btns = this.container.querySelectorAll('.help-tab-btn');
    btns.forEach((b) => {
      b.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as HelpTab;
        if (tab) {
          btns.forEach((other) => {
            (other as HTMLElement).style.background = 'transparent';
            (other as HTMLElement).style.color = '#94a3b8';
          });
          (b as HTMLElement).style.background = '#0284c7';
          (b as HTMLElement).style.color = '#fff';
          this.renderTab(tab);
        }
      });
    });
  }

  public open(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.renderTab(this.currentTab);
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.open();
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  private renderTab(tab: HelpTab): void {
    this.currentTab = tab;
    const content = this.container.querySelector('#help-tab-content') as HTMLElement;
    const isKb = this.inputMode === 'keyboard';

    switch (tab) {
      case 'FLIGHT':
        content.innerHTML = `
          <div style="font-size: 16px; font-weight: 600; color: #38bdf8; margin-bottom: 12px;">
            Atmospheric & Spaceflight Dynamics (${isKb ? 'Keyboard Mode Active' : 'Phone Companion Active'})
          </div>
          <table style="width: 100%; border-collapse: collapse; font-family: ui-monospace, monospace; font-size: 13px;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 10px 0; color: #38bdf8; width: 180px;">W / S (or ↑ / ↓)</td>
              <td style="color: #cbd5e1;">Pitch nose down / up</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 10px 0; color: #38bdf8;">A / D (or ← / →)</td>
              <td style="color: #cbd5e1;">Yaw turn left / right</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 10px 0; color: #38bdf8;">Q / E</td>
              <td style="color: #cbd5e1;">Bank & roll wings left / right</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 10px 0; color: #38bdf8;">Shift / Ctrl</td>
              <td style="color: #cbd5e1;">Increase / decrease main drive throttle (Backspace to cut)</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 10px 0; color: #38bdf8;">X</td>
              <td style="color: #cbd5e1;">Engage Autopilot alignment / Deep Cruise</td>
            </tr>
          </table>
          <p style="margin-top: 20px; font-size: 13px; color: #94a3b8;">
            * In surface flight, the craft automatically engages terrain stabilization with gentle banking limits and radar altimeter tracking.
          </p>
        `;
        break;

      case 'NAVIGATION':
        content.innerHTML = `
          <div style="font-size: 16px; font-weight: 600; color: #38bdf8; margin-bottom: 12px;">
            Interstellar Navigation & Deep Cruise
          </div>
          <p style="font-size: 13px; color: #cbd5e1;">
            The universe is composed of infinite deterministic sectors. Each sector may harbor unique star classes, multi-planet systems, or deep space anomalies.
          </p>
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 13px;">
            <div style="color: #38bdf8; font-weight: 600; margin-bottom: 6px;">How to Travel Between Star Systems:</div>
            <ol style="margin: 0; padding-left: 20px; color: #e2e8f0; line-height: 1.8;">
              <li>Press <b>[M]</b> to open the In-Universe Star Chart.</li>
              <li>Pan and select any destination star system within range.</li>
              <li>Click <b>[SET COURSE]</b> to establish the navigation route.</li>
              <li>Click <b>[ENGAGE DEEP CRUISE]</b> (or press <b>[X]</b> in flight) to warp to the destination.</li>
              <li>Warp takes 7 to 14 seconds depending on distance. The destination system will load upon arrival.</li>
            </ol>
          </div>
          <p style="font-size: 13px; color: #94a3b8;">
            <b>Local Radar:</b> The bottom-right holographic radar plots local worlds, orbits, and anomalies. Press <b>[Tab]</b> or click the radar to cycle targets.
          </p>
        `;
        break;

      case 'EXPLORATION':
        content.innerHTML = `
          <div style="font-size: 16px; font-weight: 600; color: #38bdf8; margin-bottom: 12px;">
            Planetary Survey, Landing & Living Worlds
          </div>
          <p style="font-size: 13px; color: #cbd5e1;">
            Every world is deterministically generated with unique atmospheres, palettes, and landing regions.
          </p>
          <ul style="color: #cbd5e1; font-size: 13px; line-height: 1.8;">
            <li><b>Approach:</b> Fly close to any planet to begin orbital approach.</li>
            <li><b>Inspect & Orbit:</b> Press <b>[Space]</b> when in orbital range to enter stable orbit and inspect landing sites.</li>
            <li><b>Landing:</b> Select a landing site (A/D) and press <b>[Enter]</b> or <b>[Space]</b> to descend into the atmosphere.</li>
            <li><b>Surface Scans:</b> Fly within 55m of exotic flora, living fauna, or monolithic landmarks and press <b>[Space]</b> to scan.</li>
            <li><b>Ascent:</b> Press <b>[E]</b> or <b>[X]</b> at any time in surface flight to ascend back to orbit.</li>
          </ul>
        `;
        break;

      case 'COMPANION':
        content.innerHTML = `
          <div style="font-size: 16px; font-weight: 600; color: #38bdf8; margin-bottom: 12px;">
            Mobile & Tablet Touch Flight Deck
          </div>
          <p style="font-size: 13px; color: #cbd5e1;">
            The entire 3D game runs natively on modern smartphones and tablets with an ergonomic, tactile heads-up flight deck.
          </p>
          <ul style="color: #cbd5e1; font-size: 13px; line-height: 1.8;">
            <li><b>Left Virtual Joystick:</b> Analog thumbstick for precision pitch and yaw orientation. Features spring-return centering and radial deadzone.</li>
            <li><b>Right Throttle Lever:</b> Vertical slider for 0% to 100% continuous main engine thrust, complete with cruise lock and emergency <b>BRAKE</b> button.</li>
            <li><b>SCAN / TRACTOR:</b> Tap once to fire a sensor resonance scan; tap and hold (>250ms) to lock the graviton tractor beam onto cargo pods and discovery motes.</li>
            <li><b>MAP & FLIGHT:</b> Instant access buttons for <b>MAP</b> (Star Chart), <b>ORBIT / LAND</b> (dynamic descent and orbital exit), and <b>ALT ▲ / ▼</b> (surface flight).</li>
            <li><b>RADIO EMOTES:</b> Dedicated in-flight buttons for <b>👋 Wave</b>, <b>💖 Heart</b>, and <b>✌️ Peace</b> to transmit radio hails to passing ships.</li>
          </ul>
        `;
        break;

      case 'LOG':
        content.innerHTML = `
          <div style="font-size: 16px; font-weight: 600; color: #38bdf8; margin-bottom: 12px;">
            Expedition Journal & Journey Persistence
          </div>
          <p style="font-size: 13px; color: #cbd5e1;">
            Press <b>[J]</b> to open your Ship Log.
          </p>
          <p style="font-size: 13px; color: #cbd5e1;">
            Discoveries are permanently recorded into your browser's IndexedDB database, categorized under <b>WORLDS</b>, <b>LIVING WORLDS</b>, <b>STAR SYSTEMS</b>, and <b>ANOMALIES</b>.
          </p>
          <p style="font-size: 13px; color: #cbd5e1;">
            The game autosaves your coordinates, active star system, visited locations, and narrative progress every 30 seconds and upon system arrival. Click <b>CONTINUE JOURNEY</b> on the title screen to resume where you left off.
          </p>
        `;
        break;
    }
  }

  public dispose(): void {
    this.container.remove();
  }
}
