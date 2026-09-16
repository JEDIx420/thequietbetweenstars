import type { GameAction, NormalizedAxes } from '../protocol';
import { clamp, applyDeadzone } from '../protocol';

export interface TouchControlsCallbacks {
  onInput: (input: { axes: NormalizedAxes; look: NormalizedAxes; throttle: number }) => void;
  onAction: (action: GameAction, state: 'down' | 'up' | 'trigger') => void;
}

export class TouchControls {
  private callbacks: TouchControlsCallbacks;

  // Joystick state
  private joystickPointerId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private joystickKnobPos = { x: 0, y: 0 };
  private joystickRadius = 55;
  private currentAxes: NormalizedAxes = { x: 0, y: 0 };

  // Throttle state
  private throttlePointerId: number | null = null;
  private currentThrottle = 0; // 0.0 to 1.0

  // DOM elements
  private container: HTMLElement;
  private joystickBaseEl!: HTMLElement;
  private joystickKnobEl!: HTMLElement;
  private throttleTrackEl!: HTMLElement;
  private throttleFillEl!: HTMLElement;
  private throttleKnobEl!: HTMLElement;
  private throttleLabelEl!: HTMLElement;

  private sendInterval: number | null = null;
  private seq = 0;
  private lastSentAxes = { x: 0, y: 0 };
  private lastSentThrottle = 0;

  constructor(container: HTMLElement, callbacks: TouchControlsCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
    this.setupEvents();
    this.startTransmissionLoop();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="companion-flight-hud" style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 16px 24px;
        box-sizing: border-box;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
      ">
        <!-- Top Status Bar -->
        <div class="companion-top-bar" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          color: #94a3b8;
          pointer-events: auto;
        ">
          <div id="companion-context-badge" style="
            background: rgba(56, 189, 248, 0.12);
            border: 1px solid rgba(56, 189, 248, 0.3);
            color: #38bdf8;
            padding: 4px 10px;
            border-radius: 9999px;
            font-weight: 600;
            letter-spacing: 0.05em;
          ">SPACE FLIGHT</div>

          <div id="companion-status-badge" style="
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
          ">
            <span id="companion-status-dot" style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: #facc15;
              display: inline-block;
            "></span>
            <span id="companion-status-text">CONNECTING</span>
            <span id="companion-latency-text" style="color: #64748b; margin-left: 4px;">-- ms</span>
          </div>
        </div>

        <!-- Ship Dialogue Mirror Banner -->
        <div id="companion-dialogue-banner" style="
          display: none;
          pointer-events: auto;
          background: rgba(10, 16, 28, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 8px;
          padding: 8px 14px;
          margin: 6px 0;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          color: #f1f5f9;
          text-align: center;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          backdrop-filter: blur(8px);
          transition: all 0.3s ease;
        ">
          <div id="companion-dialogue-speaker" style="font-family: ui-monospace, monospace; font-size: 9px; font-weight: 700; color: #38bdf8; letter-spacing: 0.1em; margin-bottom: 2px;"></div>
          <div id="companion-dialogue-text" style="color: #e2e8f0; line-height: 1.4;"></div>
        </div>

        <!-- Center Controls Layout: Left Joystick, Center Actions, Right Throttle -->
        <div style="
          flex: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          pointer-events: none;
        ">
          <!-- Left Touch Zone: Virtual Joystick -->
          <div id="joystick-zone" style="
            width: 160px;
            height: 160px;
            position: relative;
            pointer-events: auto;
            touch-action: none;
          ">
            <div id="joystick-base" style="
              position: absolute;
              width: 130px;
              height: 130px;
              left: 15px;
              top: 15px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.85) 100%);
              border: 2px solid rgba(148, 163, 184, 0.25);
              box-shadow: 0 0 20px rgba(0, 0, 0, 0.6), inset 0 0 15px rgba(56, 189, 248, 0.1);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <!-- Crosshair lines -->
              <div style="position: absolute; width: 100%; height: 1px; background: rgba(255,255,255,0.08);"></div>
              <div style="position: absolute; height: 100%; width: 1px; background: rgba(255,255,255,0.08);"></div>
              
              <div id="joystick-knob" style="
                width: 54px;
                height: 54px;
                border-radius: 50%;
                background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%);
                border: 2px solid rgba(255, 255, 255, 0.7);
                box-shadow: 0 4px 14px rgba(56, 189, 248, 0.4);
                transform: translate(0px, 0px);
                transition: transform 0.05s ease-out;
                pointer-events: none;
              "></div>
            </div>
          </div>

          <!-- Middle Action Buttons -->
          <div style="
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
            pointer-events: auto;
          ">
            <button id="btn-scan" class="companion-btn" style="
              width: 120px;
              padding: 14px 0;
              background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.1));
              border: 1px solid rgba(56, 189, 248, 0.4);
              border-radius: 12px;
              color: #f8fafc;
              font-family: ui-sans-serif, system-ui, sans-serif;
              font-size: 14px;
              font-weight: 700;
              letter-spacing: 0.1em;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
              transition: transform 0.08s, background 0.08s;
            ">SCAN</button>

            <div style="display: flex; gap: 8px;">
              <button id="btn-map" class="companion-btn" style="
                width: 70px;
                padding: 10px 0;
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 8px;
                color: #cbd5e1;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                touch-action: manipulation;
              ">MAP</button>

              <button id="btn-autopilot" class="companion-btn" style="
                width: 70px;
                padding: 10px 0;
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 8px;
                color: #cbd5e1;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                touch-action: manipulation;
              ">AUTO</button>
            </div>

            <div style="display: flex; gap: 8px;">
              <button id="btn-target" class="companion-btn" style="
                width: 70px;
                padding: 8px 0;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 8px;
                color: #38bdf8;
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                touch-action: manipulation;
              ">TARGET</button>

              <button id="btn-journal" class="companion-btn" style="
                width: 70px;
                padding: 8px 0;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 8px;
                color: #cbd5e1;
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                touch-action: manipulation;
              ">LOG</button>
            </div>

            <!-- v0.0.7: Altitude / Supply / Talk Actions -->
            <div style="display: flex; gap: 8px;">
              <button id="btn-alt-up" class="companion-btn" style="
                width: 70px;
                padding: 8px 0;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 8px;
                color: #38bdf8;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                touch-action: manipulation;
              ">ALT ▲</button>

              <button id="btn-alt-down" class="companion-btn" style="
                width: 70px;
                padding: 8px 0;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 8px;
                color: #38bdf8;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                touch-action: manipulation;
              ">ALT ▼</button>
            </div>

            <div style="display: flex; gap: 8px;">
              <button id="btn-supply" class="companion-btn" style="
                width: 70px;
                padding: 8px 0;
                background: rgba(16, 185, 129, 0.15);
                border: 1px solid rgba(16, 185, 129, 0.4);
                border-radius: 8px;
                color: #34d399;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.05em;
                cursor: pointer;
                touch-action: manipulation;
              ">SUPPLY</button>

              <button id="btn-talk" class="companion-btn" style="
                width: 70px;
                padding: 8px 0;
                background: rgba(168, 85, 247, 0.15);
                border: 1px solid rgba(168, 85, 247, 0.4);
                border-radius: 8px;
                color: #c084fc;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.05em;
                cursor: pointer;
                touch-action: manipulation;
              ">TALK</button>
            </div>
          </div>

          <!-- Right Touch Zone: Vertical Throttle Slider -->
          <div id="throttle-zone" style="
            width: 100px;
            height: 180px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
            touch-action: none;
          ">
            <div style="
              font-family: ui-monospace, SFMono-Regular, monospace;
              font-size: 10px;
              color: #94a3b8;
              margin-bottom: 6px;
              letter-spacing: 0.05em;
            ">THROTTLE</div>

            <div id="throttle-track" style="
              position: relative;
              width: 38px;
              height: 140px;
              background: rgba(15, 23, 42, 0.8);
              border: 2px solid rgba(148, 163, 184, 0.25);
              border-radius: 19px;
              overflow: hidden;
              box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);
            ">
              <!-- Dynamic fill bar -->
              <div id="throttle-fill" style="
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 0%;
                background: linear-gradient(to top, #0284c7, #38bdf8);
                opacity: 0.6;
                transition: height 0.05s ease-out;
              "></div>

              <!-- Handle knob -->
              <div id="throttle-knob" style="
                position: absolute;
                bottom: 0px;
                left: 2px;
                right: 2px;
                height: 30px;
                border-radius: 15px;
                background: #f8fafc;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <div style="width: 16px; height: 2px; background: #94a3b8; border-radius: 1px;"></div>
              </div>
            </div>

            <div id="throttle-label" style="
              font-family: ui-monospace, SFMono-Regular, monospace;
              font-size: 11px;
              font-weight: 700;
              color: #38bdf8;
              margin-top: 6px;
            ">0%</div>
          </div>
        </div>

        <!-- Personality footer quote -->
        <div style="
          text-align: center;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 10px;
          color: #64748b;
          letter-spacing: 0.02em;
          pointer-events: none;
        ">
          Please try not to drop this. It is technically spacecraft equipment now.
        </div>
      </div>
    `;

    this.joystickBaseEl = this.container.querySelector('#joystick-base')!;
    this.joystickKnobEl = this.container.querySelector('#joystick-knob')!;
    this.throttleTrackEl = this.container.querySelector('#throttle-track')!;
    this.throttleFillEl = this.container.querySelector('#throttle-fill')!;
    this.throttleKnobEl = this.container.querySelector('#throttle-knob')!;
    this.throttleLabelEl = this.container.querySelector('#throttle-label')!;
  }

  private setupEvents(): void {
    const joystickZone = this.container.querySelector('#joystick-zone') as HTMLElement;
    joystickZone.addEventListener('pointerdown', (e) => this.onJoystickPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onJoystickPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onJoystickPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onJoystickPointerUp(e));

    const throttleZone = this.container.querySelector('#throttle-zone') as HTMLElement;
    throttleZone.addEventListener('pointerdown', (e) => this.onThrottlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.onThrottlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.onThrottlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onThrottlePointerUp(e));

    const bindBtn = (id: string, action: GameAction) => {
      const btn = this.container.querySelector(id) as HTMLElement;
      if (!btn) return;

      const trigger = (state: 'down' | 'up' | 'trigger') => {
        if (state === 'down' && typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(30);
          } catch {
            // Ignore vibrate errors
          }
        }
        btn.style.transform = state === 'down' ? 'scale(0.92)' : 'scale(1.0)';
        this.callbacks.onAction(action, state);
      };

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        trigger('down');
      });

      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        trigger('up');
      });

      btn.addEventListener('pointerleave', () => {
        btn.style.transform = 'scale(1.0)';
      });
    };

    bindBtn('#btn-scan', 'scan');
    bindBtn('#btn-map', 'map');
    bindBtn('#btn-autopilot', 'autopilot');
    bindBtn('#btn-target', 'cycle_target');
    bindBtn('#btn-journal', 'journal');
    bindBtn('#btn-alt-up', 'altitude_up');
    bindBtn('#btn-alt-down', 'altitude_down');
    bindBtn('#btn-supply', 'supply');
    bindBtn('#btn-talk', 'talk');
  }

  private onJoystickPointerDown(e: PointerEvent): void {
    if (this.joystickPointerId !== null) return;
    this.joystickPointerId = e.pointerId;

    const rect = this.joystickBaseEl.getBoundingClientRect();
    this.joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    this.updateJoystickPosition(e.clientX, e.clientY);
  }

  private onJoystickPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.joystickPointerId) return;
    this.updateJoystickPosition(e.clientX, e.clientY);
  }

  private onJoystickPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.joystickPointerId) return;
    this.joystickPointerId = null;
    this.joystickKnobPos = { x: 0, y: 0 };
    this.currentAxes = { x: 0, y: 0 };
    this.joystickKnobEl.style.transform = `translate(0px, 0px)`;
  }

  private updateJoystickPosition(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);

    let normX = 0;
    let normY = 0;

    if (dist > 0) {
      const clampedDist = Math.min(dist, this.joystickRadius);
      const angle = Math.atan2(dy, dx);
      this.joystickKnobPos.x = Math.cos(angle) * clampedDist;
      this.joystickKnobPos.y = Math.sin(angle) * clampedDist;

      normX = this.joystickKnobPos.x / this.joystickRadius;
      normY = -this.joystickKnobPos.y / this.joystickRadius;
    }

    this.currentAxes = {
      x: applyDeadzone(clamp(normX, -1, 1)),
      y: applyDeadzone(clamp(normY, -1, 1)),
    };

    this.joystickKnobEl.style.transform = `translate(${this.joystickKnobPos.x}px, ${this.joystickKnobPos.y}px)`;
  }

  private onThrottlePointerDown(e: PointerEvent): void {
    if (this.throttlePointerId !== null) return;
    this.throttlePointerId = e.pointerId;
    this.updateThrottlePosition(e.clientY);
  }

  private onThrottlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.throttlePointerId) return;
    this.updateThrottlePosition(e.clientY);
  }

  private onThrottlePointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.throttlePointerId) return;
    this.throttlePointerId = null;

    // Spring return to 0 (real accelerator pedal physics)
    this.currentThrottle = 0;
    this.throttleFillEl.style.height = '0%';
    this.throttleKnobEl.style.bottom = '0px';
    this.throttleLabelEl.textContent = '0%';
    this.callbacks.onInput({
      axes: this.currentAxes,
      look: { x: 0, y: 0 },
      throttle: 0,
    });
    this.lastSentThrottle = 0;
  }

  private updateThrottlePosition(clientY: number): void {
    const rect = this.throttleTrackEl.getBoundingClientRect();
    const trackHeight = rect.height;
    const relativeY = clientY - rect.top;
    const rawRatio = 1 - (relativeY / trackHeight);
    const clampedRatio = clamp(rawRatio, 0, 1);

    this.currentThrottle = clampedRatio;

    const fillPercent = (clampedRatio * 100).toFixed(0);
    this.throttleFillEl.style.height = `${fillPercent}%`;

    const knobMaxTravel = trackHeight - 30;
    const knobBottom = clampedRatio * knobMaxTravel;
    this.throttleKnobEl.style.bottom = `${knobBottom}px`;

    this.throttleLabelEl.textContent = `${fillPercent}%`;
  }

  private startTransmissionLoop(): void {
    this.sendInterval = window.setInterval(() => {
      const axesChanged =
        Math.abs(this.currentAxes.x - this.lastSentAxes.x) > 0.01 ||
        Math.abs(this.currentAxes.y - this.lastSentAxes.y) > 0.01;
      const throttleChanged = Math.abs(this.currentThrottle - this.lastSentThrottle) > 0.01;

      if (
        axesChanged ||
        throttleChanged ||
        this.currentAxes.x !== 0 ||
        this.currentAxes.y !== 0 ||
        this.currentThrottle !== 0
      ) {
        this.seq++;
        this.callbacks.onInput({
          axes: this.currentAxes,
          look: { x: 0, y: 0 },
          throttle: this.currentThrottle,
        });

        this.lastSentAxes = { ...this.currentAxes };
        this.lastSentThrottle = this.currentThrottle;
      }
    }, 22);
  }

  public updateStatus(state: string, latencyMs: number): void {
    const dot = this.container.querySelector('#companion-status-dot') as HTMLElement;
    const text = this.container.querySelector('#companion-status-text') as HTMLElement;
    const lat = this.container.querySelector('#companion-latency-text') as HTMLElement;

    if (!dot || !text || !lat) return;

    if (state === 'connected') {
      dot.style.background = '#4ade80';
      text.textContent = 'CONNECTED';
      lat.textContent = `${latencyMs} ms`;
    } else if (state === 'reconnecting') {
      dot.style.background = '#f87171';
      text.textContent = 'RECONNECTING';
    } else {
      dot.style.background = '#facc15';
      text.textContent = state.toUpperCase();
    }
  }

  public showDialogueLine(speaker: string, text: string, durationMs = 4000): void {
    const banner = this.container.querySelector('#companion-dialogue-banner') as HTMLElement;
    const speakerEl = this.container.querySelector('#companion-dialogue-speaker') as HTMLElement;
    const textEl = this.container.querySelector('#companion-dialogue-text') as HTMLElement;

    if (!banner || !speakerEl || !textEl) return;

    speakerEl.textContent = speaker;
    textEl.textContent = text;
    banner.style.display = 'block';

    setTimeout(() => {
      banner.style.display = 'none';
    }, durationMs);
  }

  public highlightAction(actionName: string): void {
    let btn: HTMLElement | null = null;
    if (actionName === 'scan') btn = this.container.querySelector('#btn-scan');
    else if (actionName === 'map') btn = this.container.querySelector('#btn-map');
    else if (actionName === 'autopilot') btn = this.container.querySelector('#btn-autopilot');
    else if (actionName === 'target') btn = this.container.querySelector('#btn-target');
    else if (actionName === 'journal') btn = this.container.querySelector('#btn-journal');
    else if (actionName === 'throttle') btn = this.container.querySelector('#throttle-track');
    else if (actionName === 'joystick') btn = this.container.querySelector('#joystick-base');

    if (btn) {
      btn.style.boxShadow = '0 0 20px #38bdf8, 0 0 40px #0284c7';
      btn.style.borderColor = '#38bdf8';
      setTimeout(() => {
        if (btn) {
          btn.style.boxShadow = '';
          btn.style.borderColor = '';
        }
      }, 4500);
    }
  }

  public dispose(): void {
    if (this.sendInterval !== null) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
  }
}
