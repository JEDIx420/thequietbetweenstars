import type { TouchInput } from './TouchInput';
import { clamp, applyDeadzone } from '../../protocol';

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  );
}

export class TouchControls {
  private parent: HTMLElement;
  private touchInput: TouchInput;
  private container!: HTMLElement;
  private isVisible = true;
  private currentContext: 'space' | 'surface' | 'menu' = 'space';

  // Joystick state
  private joystickPointerId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private joystickRadius = 55;
  private joystickBaseEl!: HTMLElement;
  private joystickKnobEl!: HTMLElement;

  // Throttle state
  private throttlePointerId: number | null = null;
  private currentThrottle = 0; // 0.0 to 1.0
  private throttleTrackEl!: HTMLElement;
  private throttleFillEl!: HTMLElement;
  private throttleKnobEl!: HTMLElement;
  private throttleLabelEl!: HTMLElement;

  // Action buttons
  private scanBtnEl!: HTMLElement;
  private mapBtnEl!: HTMLElement;
  private orbitBtnEl!: HTMLElement;
  private altUpBtnEl!: HTMLElement;
  private altDownBtnEl!: HTMLElement;
  private upgradeBtnEl!: HTMLElement;
  private journalBtnEl!: HTMLElement;
  private toggleBtnEl!: HTMLElement;

  // Radio emote callback
  private onEmoteCallback: ((type: 'wave' | 'heart' | 'peace') => void) | null = null;

  // Tractor beam hold tracking
  private isHoldingTractor = false;
  private tractorTimer: number | null = null;

  constructor(parent: HTMLElement, touchInput: TouchInput) {
    this.parent = parent;
    this.touchInput = touchInput;
    this.createDOM();
    this.setupJoystickEvents();
    this.setupThrottleEvents();
    this.setupActionEvents();
    this.setupResizeListener();
  }

  public setOnEmote(cb: (type: 'wave' | 'heart' | 'peace') => void): void {
    this.onEmoteCallback = cb;
  }

  private createDOM(): void {
    this.container = document.createElement('div');
    this.container.id = 'touch-controls-overlay';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      z-index: 50;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: env(safe-area-inset-top, 16px) env(safe-area-inset-right, 16px) env(safe-area-inset-bottom, 16px) env(safe-area-inset-left, 16px);
      box-sizing: border-box;
      transition: opacity 0.2s ease;
    `;

    this.container.innerHTML = `
      <!-- Top Toggle & Status Bar -->
      <div style="display: flex; justify-content: flex-end; align-items: center; width: 100%; pointer-events: auto;">
        <button id="touch-toggle-btn" style="
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
          padding: 6px 12px;
          border-radius: 9999px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          cursor: pointer;
          touch-action: manipulation;
          backdrop-filter: blur(6px);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        ">TOUCH: ON</button>
      </div>

      <!-- Controls Zone: Left Joystick, Center Actions, Right Throttle -->
      <div id="touch-controls-main" style="
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        width: 100%;
        pointer-events: none;
        padding-bottom: 8px;
      ">
        <!-- Left Zone: Virtual Analog Flight Stick -->
        <div id="touch-joystick-zone" style="
          width: 150px;
          height: 150px;
          position: relative;
          pointer-events: auto;
          touch-action: none;
        ">
          <div id="touch-joystick-base" style="
            position: absolute;
            width: 130px;
            height: 130px;
            left: 10px;
            top: 10px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%);
            border: 2px solid rgba(56, 189, 248, 0.3);
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.6), inset 0 0 15px rgba(56, 189, 248, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <!-- Reticle Crosshairs -->
            <div style="position: absolute; width: 100%; height: 1px; background: rgba(255, 255, 255, 0.1);"></div>
            <div style="position: absolute; height: 100%; width: 1px; background: rgba(255, 255, 255, 0.1);"></div>
            <div style="position: absolute; width: 60px; height: 60px; border-radius: 50%; border: 1px dashed rgba(56, 189, 248, 0.2);"></div>

            <!-- Joystick Knob -->
            <div id="touch-joystick-knob" style="
              width: 50px;
              height: 50px;
              border-radius: 50%;
              background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%);
              border: 2px solid rgba(255, 255, 255, 0.8);
              box-shadow: 0 4px 14px rgba(56, 189, 248, 0.4);
              transform: translate(0px, 0px);
              transition: transform 0.05s ease-out;
              pointer-events: none;
            "></div>
          </div>
        </div>

        <!-- Center Actions Cluster -->
        <div id="touch-actions-cluster" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          pointer-events: auto;
          margin-bottom: 6px;
        ">
          <!-- In-Flight Radio Emote Deck -->
          <div id="touch-emote-row" style="display: flex; gap: 6px; margin-bottom: 2px;">
            <button id="touch-btn-emote-wave" style="
              width: 42px;
              height: 36px;
              background: rgba(15, 23, 42, 0.85);
              border: 1px solid rgba(250, 204, 21, 0.5);
              border-radius: 10px;
              font-size: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            " title="Wave">👋</button>

            <button id="touch-btn-emote-heart" style="
              width: 42px;
              height: 36px;
              background: rgba(15, 23, 42, 0.85);
              border: 1px solid rgba(244, 63, 94, 0.5);
              border-radius: 10px;
              font-size: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            " title="Heart">💖</button>

            <button id="touch-btn-emote-peace" style="
              width: 42px;
              height: 36px;
              background: rgba(15, 23, 42, 0.85);
              border: 1px solid rgba(56, 189, 248, 0.5);
              border-radius: 10px;
              font-size: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            " title="Peace">✌️</button>
          </div>

          <!-- Primary Scan / Tractor Beam Button -->
          <button id="touch-btn-scan" style="
            width: 140px;
            padding: 11px 0;
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.15));
            border: 1.5px solid rgba(56, 189, 248, 0.6);
            border-radius: 12px;
            color: #f8fafc;
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.08em;
            cursor: pointer;
            touch-action: manipulation;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(8px);
            transition: transform 0.08s, background 0.08s;
          ">
            SCAN / TRACTOR
          </button>

          <!-- Navigation & Flight Operations -->
          <div style="display: flex; gap: 8px;">
            <button id="touch-btn-map" style="
              width: 66px;
              padding: 9px 0;
              background: rgba(30, 41, 59, 0.7);
              border: 1px solid rgba(148, 163, 184, 0.3);
              border-radius: 8px;
              color: #cbd5e1;
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.05em;
              cursor: pointer;
              touch-action: manipulation;
            ">MAP</button>

            <button id="touch-btn-orbit" style="
              width: 66px;
              padding: 9px 0;
              background: rgba(30, 41, 59, 0.7);
              border: 1px solid rgba(56, 189, 248, 0.35);
              border-radius: 8px;
              color: #38bdf8;
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.05em;
              cursor: pointer;
              touch-action: manipulation;
            ">ORBIT</button>
          </div>

          <!-- Surface Altitude Controls (shown on surface) -->
          <div id="touch-altitude-row" style="display: none; gap: 8px;">
            <button id="touch-btn-alt-up" style="
              width: 66px;
              padding: 8px 0;
              background: rgba(15, 23, 42, 0.8);
              border: 1px solid rgba(56, 189, 248, 0.4);
              border-radius: 8px;
              color: #38bdf8;
              font-size: 11px;
              font-weight: 700;
              cursor: pointer;
              touch-action: manipulation;
            ">ALT ▲</button>

            <button id="touch-btn-alt-down" style="
              width: 66px;
              padding: 8px 0;
              background: rgba(15, 23, 42, 0.8);
              border: 1px solid rgba(56, 189, 248, 0.4);
              border-radius: 8px;
              color: #38bdf8;
              font-size: 11px;
              font-weight: 700;
              cursor: pointer;
              touch-action: manipulation;
            ">ALT ▼</button>
          </div>

          <!-- Modules & Journal -->
          <div style="display: flex; gap: 8px;">
            <button id="touch-btn-upgrade" style="
              width: 66px;
              padding: 8px 0;
              background: rgba(15, 23, 42, 0.8);
              border: 1px solid rgba(148, 163, 184, 0.3);
              border-radius: 8px;
              color: #94a3b8;
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.05em;
              cursor: pointer;
              touch-action: manipulation;
            ">STORE</button>

            <button id="touch-btn-journal" style="
              width: 66px;
              padding: 8px 0;
              background: rgba(15, 23, 42, 0.8);
              border: 1px solid rgba(148, 163, 184, 0.3);
              border-radius: 8px;
              color: #94a3b8;
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.05em;
              cursor: pointer;
              touch-action: manipulation;
            ">LOGS</button>
          </div>
        </div>

        <!-- Right Zone: Vertical Throttle Lever & Brake -->
        <div id="touch-throttle-zone" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: auto;
          touch-action: none;
        ">
          <!-- Throttle Readout -->
          <div id="touch-throttle-label" style="
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 10px;
            font-weight: 700;
            color: #38bdf8;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
            text-align: center;
          ">IDLE 0%</div>

          <!-- Vertical Throttle Track -->
          <div id="touch-throttle-track" style="
            width: 44px;
            height: 160px;
            background: rgba(15, 23, 42, 0.85);
            border: 2px solid rgba(56, 189, 248, 0.3);
            border-radius: 22px;
            position: relative;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(0, 0, 0, 0.8);
            overflow: hidden;
            cursor: pointer;
            touch-action: none;
          ">
            <!-- Fill Gradient -->
            <div id="touch-throttle-fill" style="
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              height: 0%;
              background: linear-gradient(to top, rgba(56, 189, 248, 0.2) 0%, rgba(56, 189, 248, 0.7) 100%);
              border-radius: 0 0 20px 20px;
              pointer-events: none;
              transition: height 0.04s ease-out;
            "></div>

            <!-- Throttle Dragger Knob -->
            <div id="touch-throttle-knob" style="
              position: absolute;
              bottom: 0px;
              left: 3px;
              width: 34px;
              height: 28px;
              border-radius: 14px;
              background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%);
              border: 1.5px solid #ffffff;
              box-shadow: 0 2px 8px rgba(56, 189, 248, 0.5);
              pointer-events: none;
              transition: bottom 0.04s ease-out;
            "></div>
          </div>

          <!-- Emergency Retro-Thruster Brake Button -->
          <button id="touch-btn-brake" style="
            margin-top: 8px;
            width: 48px;
            padding: 5px 0;
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.5);
            border-radius: 8px;
            color: #fca5a5;
            font-family: ui-monospace, monospace;
            font-size: 9px;
            font-weight: 700;
            cursor: pointer;
            touch-action: manipulation;
          ">BRAKE</button>
        </div>
      </div>
    `;

    this.parent.appendChild(this.container);

    // Cache elements
    this.joystickBaseEl = this.container.querySelector('#touch-joystick-base')!;
    this.joystickKnobEl = this.container.querySelector('#touch-joystick-knob')!;
    this.throttleTrackEl = this.container.querySelector('#touch-throttle-track')!;
    this.throttleFillEl = this.container.querySelector('#touch-throttle-fill')!;
    this.throttleKnobEl = this.container.querySelector('#touch-throttle-knob')!;
    this.throttleLabelEl = this.container.querySelector('#touch-throttle-label')!;

    this.scanBtnEl = this.container.querySelector('#touch-btn-scan')!;
    this.mapBtnEl = this.container.querySelector('#touch-btn-map')!;
    this.orbitBtnEl = this.container.querySelector('#touch-btn-orbit')!;
    this.altUpBtnEl = this.container.querySelector('#touch-btn-alt-up')!;
    this.altDownBtnEl = this.container.querySelector('#touch-btn-alt-down')!;
    this.upgradeBtnEl = this.container.querySelector('#touch-btn-upgrade')!;
    this.journalBtnEl = this.container.querySelector('#touch-btn-journal')!;
    this.toggleBtnEl = this.container.querySelector('#touch-toggle-btn')!;
  }

  private setupJoystickEvents(): void {
    const zone = this.container.querySelector('#touch-joystick-zone') as HTMLElement;

    const handlePointerDown = (e: PointerEvent) => {
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);

      const rect = this.joystickBaseEl.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      this.updateJoystick(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.updateJoystick(e.clientX, e.clientY);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      try {
        zone.releasePointerCapture(e.pointerId);
      } catch {}

      // Reset joystick knob with smooth center return
      this.joystickKnobEl.style.transform = 'translate(0px, 0px)';
      this.touchInput.setAxes({ x: 0, y: 0 });
    };

    zone.addEventListener('pointerdown', handlePointerDown);
    zone.addEventListener('pointermove', handlePointerMove);
    zone.addEventListener('pointerup', handlePointerUp);
    zone.addEventListener('pointercancel', handlePointerUp);
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const clampedDist = Math.min(dist, this.joystickRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    this.joystickKnobEl.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // Normalized axes (-1 to 1) with deadzone
    const normX = applyDeadzone(knobX / this.joystickRadius, 0.06);
    // Negative dy = forward stick = pitch down (or pitch up based on preference; convention: forward stick pushes nose down)
    const normY = applyDeadzone(-knobY / this.joystickRadius, 0.06);

    this.touchInput.setAxes({ x: normX, y: normY });
  }

  private setupThrottleEvents(): void {
    const track = this.throttleTrackEl;

    const handlePointerDown = (e: PointerEvent) => {
      this.throttlePointerId = e.pointerId;
      track.setPointerCapture(e.pointerId);
      this.updateThrottleFromPointer(e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.throttlePointerId) return;
      this.updateThrottleFromPointer(e.clientY);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.throttlePointerId) return;
      this.throttlePointerId = null;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}
      // Cruise throttle holds position so fingers don't get tired
    };

    track.addEventListener('pointerdown', handlePointerDown);
    track.addEventListener('pointermove', handlePointerMove);
    track.addEventListener('pointerup', handlePointerUp);
    track.addEventListener('pointercancel', handlePointerUp);

    // Brake button
    const brakeBtn = this.container.querySelector('#touch-btn-brake') as HTMLElement;
    brakeBtn.addEventListener('pointerdown', () => {
      this.setThrottle(0);
      this.touchInput.triggerAction('pause');
      navigator.vibrate?.(20);
    });
  }

  private updateThrottleFromPointer(clientY: number): void {
    const rect = this.throttleTrackEl.getBoundingClientRect();
    const trackHeight = rect.height;
    // 0 is bottom, 1 is top
    const relativeY = rect.bottom - clientY;
    const norm = clamp(relativeY / trackHeight, 0, 1);
    this.setThrottle(norm);
  }

  public setThrottle(val: number): void {
    this.currentThrottle = clamp(val, 0, 1);
    const percent = Math.round(this.currentThrottle * 100);

    // Update fill height & knob position
    this.throttleFillEl.style.height = `${percent}%`;
    const knobTravel = 160 - 32; // track height - knob height
    this.throttleKnobEl.style.bottom = `${(this.currentThrottle * knobTravel)}px`;

    // Update readout
    if (this.currentThrottle <= 0.01) {
      this.throttleLabelEl.textContent = 'IDLE 0%';
      this.throttleLabelEl.style.color = '#94a3b8';
    } else if (this.currentThrottle >= 0.95) {
      this.throttleLabelEl.textContent = 'OVERDRIVE!';
      this.throttleLabelEl.style.color = '#38bdf8';
    } else {
      this.throttleLabelEl.textContent = `THRUST ${percent}%`;
      this.throttleLabelEl.style.color = '#38bdf8';
    }

    this.touchInput.setThrottle(this.currentThrottle);
  }

  private setupActionEvents(): void {
    // SCAN / TRACTOR button: tap to scan, hold to engage tractor beam
    this.scanBtnEl.addEventListener('pointerdown', () => {
      this.isHoldingTractor = false;
      this.scanBtnEl.style.transform = 'scale(0.95)';

      this.tractorTimer = window.setTimeout(() => {
        this.isHoldingTractor = true;
        this.scanBtnEl.textContent = '⚡ TRACTOR ACTIVE';
        this.scanBtnEl.style.background = 'linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(56, 189, 248, 0.4))';
        this.scanBtnEl.style.borderColor = '#c084fc';
        this.touchInput.setActionState('tractor', true);
        this.touchInput.setActionState('interact', true);
        navigator.vibrate?.([30, 40, 30]);
      }, 250);
    });

    const releaseScan = () => {
      this.scanBtnEl.style.transform = 'scale(1)';
      if (this.tractorTimer) {
        clearTimeout(this.tractorTimer);
        this.tractorTimer = null;
      }

      if (this.isHoldingTractor) {
        this.isHoldingTractor = false;
        this.touchInput.setActionState('tractor', false);
        this.touchInput.setActionState('interact', false);
      } else {
        // Quick tap was a scan
        this.touchInput.triggerAction('scan');
        navigator.vibrate?.(15);
      }

      this.scanBtnEl.textContent = 'SCAN / TRACTOR';
      this.scanBtnEl.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.15))';
      this.scanBtnEl.style.borderColor = 'rgba(56, 189, 248, 0.6)';
    };

    this.scanBtnEl.addEventListener('pointerup', releaseScan);
    this.scanBtnEl.addEventListener('pointercancel', releaseScan);

    // MAP
    this.mapBtnEl.addEventListener('click', () => {
      this.touchInput.triggerAction('map');
      navigator.vibrate?.(15);
    });

    // ORBIT / LAND
    this.orbitBtnEl.addEventListener('click', () => {
      if (this.currentContext === 'surface') {
        this.touchInput.triggerAction('cancel'); // Return to orbit
      } else {
        this.touchInput.triggerAction('confirm'); // Land / engage
      }
      navigator.vibrate?.(15);
    });

    // Altitude controls
    this.altUpBtnEl.addEventListener('click', () => {
      this.touchInput.triggerAction('altitude_up');
      navigator.vibrate?.(10);
    });

    this.altDownBtnEl.addEventListener('click', () => {
      this.touchInput.triggerAction('altitude_down');
      navigator.vibrate?.(10);
    });

    // Modules / Store
    this.upgradeBtnEl.addEventListener('click', () => {
      this.touchInput.triggerAction('supply');
      navigator.vibrate?.(15);
    });

    // Journal
    this.journalBtnEl.addEventListener('click', () => {
      this.touchInput.triggerAction('journal');
      navigator.vibrate?.(15);
    });

    // Toggle touch controls visibility
    this.toggleBtnEl.addEventListener('click', () => {
      this.toggleVisibility();
    });

    // In-Flight Radio Emote Actions
    this.container.querySelector('#touch-btn-emote-wave')?.addEventListener('click', () => {
      this.onEmoteCallback?.('wave');
      navigator.vibrate?.(25);
    });

    this.container.querySelector('#touch-btn-emote-heart')?.addEventListener('click', () => {
      this.onEmoteCallback?.('heart');
      navigator.vibrate?.(25);
    });

    this.container.querySelector('#touch-btn-emote-peace')?.addEventListener('click', () => {
      this.onEmoteCallback?.('peace');
      navigator.vibrate?.(25);
    });
  }

  public setContext(context: 'space' | 'surface' | 'menu'): void {
    this.currentContext = context;
    const altRow = this.container.querySelector('#touch-altitude-row') as HTMLElement;
    if (context === 'surface') {
      if (altRow) altRow.style.display = 'flex';
      if (this.orbitBtnEl) this.orbitBtnEl.textContent = 'ORBIT';
    } else {
      if (altRow) altRow.style.display = 'none';
      if (this.orbitBtnEl) this.orbitBtnEl.textContent = 'LAND';
    }
  }

  public toggleVisibility(): void {
    this.isVisible = !this.isVisible;
    const mainControls = this.container.querySelector('#touch-controls-main') as HTMLElement;
    if (this.isVisible) {
      if (mainControls) mainControls.style.display = 'flex';
      this.toggleBtnEl.textContent = 'TOUCH: ON';
      this.toggleBtnEl.style.color = '#38bdf8';
    } else {
      if (mainControls) mainControls.style.display = 'none';
      this.toggleBtnEl.textContent = 'TOUCH: OFF';
      this.toggleBtnEl.style.color = '#64748b';
    }
  }

  public show(): void {
    this.container.style.display = 'flex';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private setupResizeListener(): void {
    window.addEventListener('resize', () => {
      // Re-center joystick if pointer is not currently active
      if (this.joystickPointerId === null && this.joystickBaseEl) {
        const rect = this.joystickBaseEl.getBoundingClientRect();
        this.joystickCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    });
  }

  public dispose(): void {
    if (this.tractorTimer) {
      clearTimeout(this.tractorTimer);
    }
    this.container.remove();
  }
}
