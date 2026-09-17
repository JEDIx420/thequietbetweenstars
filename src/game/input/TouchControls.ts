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
  private targetBtnEl!: HTMLElement;
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
      padding: env(safe-area-inset-top, 10px) env(safe-area-inset-right, 12px) env(safe-area-inset-bottom, 10px) env(safe-area-inset-left, 12px);
      box-sizing: border-box;
      transition: opacity 0.2s ease;
    `;

    this.container.innerHTML = `
      <style>
        #touch-controls-overlay button:active {
          transform: scale(0.94);
        }
        @media (max-height: 520px), (max-width: 850px) {
          #touch-joystick-zone {
            width: 110px !important;
            height: 110px !important;
          }
          #touch-joystick-base {
            width: 96px !important;
            height: 96px !important;
            left: 7px !important;
            top: 7px !important;
          }
          #touch-joystick-knob {
            width: 36px !important;
            height: 36px !important;
          }
          #touch-throttle-track {
            width: 36px !important;
            height: 110px !important;
          }
          #touch-throttle-knob {
            width: 28px !important;
            height: 24px !important;
          }
          #touch-throttle-label {
            font-size: 8px !important;
            margin-bottom: 2px !important;
          }
          #touch-btn-brake {
            width: 36px !important;
            padding: 4px 0 !important;
            font-size: 8px !important;
            margin-top: 3px !important;
          }
          #touch-actions-cluster {
            gap: 4px !important;
            margin-bottom: 0px !important;
          }
          #touch-btn-scan {
            width: 116px !important;
            padding: 6px 0 !important;
            font-size: 10.5px !important;
          }
          .touch-compact-btn {
            padding: 5px 0 !important;
            font-size: 9.5px !important;
            width: 56px !important;
          }
          .touch-util-btn {
            padding: 4px 0 !important;
            font-size: 8.5px !important;
            width: 56px !important;
          }
          #touch-left-pills button {
            padding: 4px 8px !important;
            font-size: 9px !important;
          }
          #touch-toggle-btn {
            font-size: 8.5px !important;
            padding: 2.5px 7px !important;
            margin-top: 18px !important;
          }
          #touch-emote-drawer {
            padding: 3px 6px !important;
            gap: 4px !important;
            border-radius: 8px !important;
          }
          #touch-emote-drawer button {
            width: 28px !important;
            height: 25px !important;
            font-size: 11px !important;
          }
        }
      </style>

      <!-- Top Status & Toggle Bar -->
      <div style="display: flex; justify-content: flex-start; align-items: center; width: 100%; pointer-events: none; margin-top: 22px;">
        <button id="touch-toggle-btn" style="
          pointer-events: auto;
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
          padding: 3px 9px;
          border-radius: 9999px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.05em;
          cursor: pointer;
          touch-action: manipulation;
          backdrop-filter: blur(6px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        ">TOUCH: ON</button>
      </div>

      <!-- Controls Zone: Left Thumb (Stick + Nav) | Completely Clear Center | Right Thumb (Actions + Throttle) -->
      <div id="touch-controls-main" style="
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        width: 100%;
        pointer-events: none;
        padding-bottom: 2px;
      ">
        <!-- LEFT THUMB ZONE: Stick & Quick Nav -->
        <div id="touch-left-zone" style="
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          pointer-events: none;
        ">
          <!-- Left Thumb Quick Navigation Pills -->
          <div id="touch-left-pills" style="display: flex; gap: 6px; pointer-events: auto;">
            <button id="touch-btn-map" style="
              padding: 5px 10px;
              background: rgba(15, 23, 42, 0.82);
              border: 1px solid rgba(148, 163, 184, 0.35);
              border-radius: 8px;
              color: #cbd5e1;
              font-family: ui-monospace, monospace;
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.04em;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
              backdrop-filter: blur(6px);
            ">MAP</button>

            <button id="touch-btn-target" style="
              padding: 5px 10px;
              background: rgba(15, 23, 42, 0.82);
              border: 1px solid rgba(56, 189, 248, 0.35);
              border-radius: 8px;
              color: #38bdf8;
              font-family: ui-monospace, monospace;
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.04em;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
              backdrop-filter: blur(6px);
            ">TARGET</button>
          </div>

          <!-- Virtual Analog Flight Stick -->
          <div id="touch-joystick-zone" style="
            width: 130px;
            height: 130px;
            position: relative;
            pointer-events: auto;
            touch-action: none;
          ">
            <div id="touch-joystick-base" style="
              position: absolute;
              width: 114px;
              height: 114px;
              left: 8px;
              top: 8px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.85) 100%);
              border: 2px solid rgba(56, 189, 248, 0.35);
              box-shadow: 0 0 20px rgba(0, 0, 0, 0.65), inset 0 0 15px rgba(56, 189, 248, 0.12);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <!-- Reticle Crosshairs -->
              <div style="position: absolute; width: 100%; height: 1px; background: rgba(255, 255, 255, 0.1);"></div>
              <div style="position: absolute; height: 100%; width: 1px; background: rgba(255, 255, 255, 0.1);"></div>
              <div style="position: absolute; width: 50px; height: 50px; border-radius: 50%; border: 1px dashed rgba(56, 189, 248, 0.22);"></div>

              <!-- Joystick Knob -->
              <div id="touch-joystick-knob" style="
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%);
                border: 2px solid rgba(255, 255, 255, 0.85);
                box-shadow: 0 3px 12px rgba(56, 189, 248, 0.5);
                transform: translate(0px, 0px);
                transition: transform 0.04s ease-out;
                pointer-events: none;
              "></div>
            </div>
          </div>
        </div>

        <!-- CENTER VIEW: COMPLETELY EMPTY & UNOBSTRUCTED -->

        <!-- RIGHT THUMB ZONE: Inward Actions Cluster + Outward Throttle Slider -->
        <div id="touch-right-zone" style="
          display: flex;
          align-items: flex-end;
          gap: 10px;
          pointer-events: none;
        ">
          <!-- Action Buttons Cluster (Within Natural Right-Thumb Arc) -->
          <div id="touch-actions-cluster" style="
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 5px;
            pointer-events: auto;
            margin-bottom: 2px;
            position: relative;
          ">
            <!-- In-Flight Radio Emote Popout Drawer (Pops out above the cluster) -->
            <div id="touch-emote-drawer" style="
              display: none;
              position: absolute;
              bottom: calc(100% + 8px);
              right: 0;
              background: rgba(10, 16, 28, 0.95);
              border: 1px solid rgba(56, 189, 248, 0.45);
              border-radius: 12px;
              padding: 5px 8px;
              gap: 6px;
              align-items: center;
              box-shadow: 0 8px 30px rgba(0, 0, 0, 0.8), 0 0 16px rgba(56, 189, 248, 0.25);
              backdrop-filter: blur(12px);
              z-index: 300;
              white-space: nowrap;
            ">
              <span style="font-size: 8.5px; font-family: ui-monospace, monospace; color: #94a3b8; margin-right: 2px;">COMMS:</span>
              <button id="touch-btn-emote-wave" style="
                width: 34px;
                height: 30px;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(250, 204, 21, 0.5);
                border-radius: 6px;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                touch-action: manipulation;
              " title="Wave">👋</button>

              <button id="touch-btn-emote-heart" style="
                width: 34px;
                height: 30px;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(244, 63, 94, 0.5);
                border-radius: 6px;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                touch-action: manipulation;
              " title="Heart">💖</button>

              <button id="touch-btn-emote-peace" style="
                width: 34px;
                height: 30px;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.5);
                border-radius: 6px;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                touch-action: manipulation;
              " title="Peace">✌️</button>

              <button id="touch-btn-emote-close" style="
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 12px;
                padding: 2px 4px;
                cursor: pointer;
              ">✕</button>
            </div>

            <!-- Primary Action Button: SCAN / TRACTOR (space) or SCAN / SAMPLE (surface) -->
            <button id="touch-btn-scan" style="
              width: 126px;
              padding: 8px 0;
              background: linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(14, 165, 233, 0.16));
              border: 1.5px solid rgba(56, 189, 248, 0.65);
              border-radius: 10px;
              color: #f8fafc;
              font-family: ui-sans-serif, system-ui, sans-serif;
              font-size: 11.5px;
              font-weight: 700;
              letter-spacing: 0.06em;
              cursor: pointer;
              touch-action: manipulation;
              box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
              backdrop-filter: blur(8px);
              transition: transform 0.08s, background 0.08s, border-color 0.08s;
            ">
              SCAN / TRACTOR
            </button>

            <!-- Surface Altitude Controls Row (Visible exclusively in surface flight) -->
            <div id="touch-altitude-row" style="display: none; gap: 5px;">
              <button id="touch-btn-alt-up" class="touch-compact-btn" style="
                width: 60px;
                padding: 6px 0;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.45);
                border-radius: 8px;
                color: #38bdf8;
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
                touch-action: manipulation;
              ">ALT ▲</button>

              <button id="touch-btn-alt-down" class="touch-compact-btn" style="
                width: 60px;
                padding: 6px 0;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.45);
                border-radius: 8px;
                color: #38bdf8;
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
                touch-action: manipulation;
              ">ALT ▼</button>
            </div>

            <!-- Orbit / Land + Comms Row -->
            <div style="display: flex; gap: 5px;">
              <button id="touch-btn-orbit" class="touch-compact-btn" style="
                width: 60px;
                padding: 7px 0;
                background: rgba(30, 41, 59, 0.75);
                border: 1px solid rgba(56, 189, 248, 0.4);
                border-radius: 8px;
                color: #38bdf8;
                font-size: 10.5px;
                font-weight: 600;
                letter-spacing: 0.04em;
                cursor: pointer;
                touch-action: manipulation;
                transition: all 0.15s ease;
              ">LAND</button>

              <button id="touch-btn-emote-toggle" class="touch-compact-btn" style="
                width: 60px;
                padding: 7px 0;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.4);
                border-radius: 8px;
                color: #38bdf8;
                font-family: ui-monospace, monospace;
                font-size: 9.5px;
                font-weight: 600;
                letter-spacing: 0.04em;
                cursor: pointer;
                touch-action: manipulation;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 2px;
              ">
                <span>📡 COMMS</span>
              </button>
            </div>

            <!-- Modules Store + Journey Logs Row -->
            <div style="display: flex; gap: 5px;">
              <button id="touch-btn-upgrade" class="touch-util-btn" style="
                width: 60px;
                padding: 5px 0;
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 6px;
                color: #94a3b8;
                font-size: 9.5px;
                font-weight: 600;
                letter-spacing: 0.04em;
                cursor: pointer;
                touch-action: manipulation;
              ">STORE</button>

              <button id="touch-btn-journal" class="touch-util-btn" style="
                width: 60px;
                padding: 5px 0;
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 6px;
                color: #94a3b8;
                font-size: 9.5px;
                font-weight: 600;
                letter-spacing: 0.04em;
                cursor: pointer;
                touch-action: manipulation;
              ">LOGS</button>
            </div>
          </div>

          <!-- Vertical Throttle Lever & Brake Zone (Far Right Edge) -->
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
              font-size: 9px;
              font-weight: 700;
              color: #38bdf8;
              letter-spacing: 0.04em;
              margin-bottom: 4px;
              text-align: center;
              white-space: nowrap;
            ">IDLE 0%</div>

            <!-- Vertical Throttle Track -->
            <div id="touch-throttle-track" style="
              width: 40px;
              height: 136px;
              background: rgba(15, 23, 42, 0.88);
              border: 2px solid rgba(56, 189, 248, 0.35);
              border-radius: 20px;
              position: relative;
              box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55), inset 0 0 10px rgba(0, 0, 0, 0.8);
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
                background: linear-gradient(to top, rgba(56, 189, 248, 0.2) 0%, rgba(56, 189, 248, 0.75) 100%);
                border-radius: 0 0 18px 18px;
                pointer-events: none;
                transition: height 0.04s ease-out;
              "></div>

              <!-- Throttle Dragger Knob -->
              <div id="touch-throttle-knob" style="
                position: absolute;
                bottom: 0px;
                left: 3px;
                width: 30px;
                height: 26px;
                border-radius: 13px;
                background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%);
                border: 1.5px solid #ffffff;
                box-shadow: 0 2px 8px rgba(56, 189, 248, 0.55);
                pointer-events: none;
                transition: bottom 0.04s ease-out;
              "></div>
            </div>

            <!-- Emergency Retro-Thruster Brake Button -->
            <button id="touch-btn-brake" style="
              margin-top: 6px;
              width: 40px;
              padding: 5px 0;
              background: rgba(239, 68, 68, 0.22);
              border: 1px solid rgba(239, 68, 68, 0.55);
              border-radius: 8px;
              color: #fca5a5;
              font-family: ui-monospace, monospace;
              font-size: 8.5px;
              font-weight: 700;
              cursor: pointer;
              touch-action: manipulation;
            ">BRAKE</button>
          </div>
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
    this.targetBtnEl = this.container.querySelector('#touch-btn-target')!;
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
      const measuredRadius = (rect.width / 2) - 10;
      if (measuredRadius > 20) {
        this.joystickRadius = measuredRadius;
      }

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
    // Y is inverted for flight pitch (pushing forward = pitch down / nose down)
    const normY = applyDeadzone(-knobY / this.joystickRadius, 0.06);

    this.touchInput.setAxes({ x: normX, y: normY });
  }

  private setupThrottleEvents(): void {
    const track = this.container.querySelector('#touch-throttle-track') as HTMLElement;

    const handlePointerDown = (e: PointerEvent) => {
      if (this.throttlePointerId !== null) return;
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
    const trackHeight = rect.height || 136;
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
    const rect = this.throttleTrackEl.getBoundingClientRect();
    const trackHeight = rect.height || 136;
    const knobTravel = Math.max(50, trackHeight - 28);
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
      }, 350);
    });

    const releaseScan = () => {
      this.scanBtnEl.style.transform = 'scale(1)';
      if (this.tractorTimer !== null) {
        clearTimeout(this.tractorTimer);
        this.tractorTimer = null;
      }

      if (this.isHoldingTractor) {
        this.isHoldingTractor = false;
        this.scanBtnEl.textContent = this.currentContext === 'surface' ? 'SCAN / SAMPLE' : 'SCAN / TRACTOR';
        this.scanBtnEl.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(14, 165, 233, 0.16))';
        this.scanBtnEl.style.borderColor = 'rgba(56, 189, 248, 0.65)';
        this.touchInput.setActionState('tractor', false);
        this.touchInput.setActionState('interact', false);
      } else {
        // Tap: Trigger pulse scan or sample collect
        this.touchInput.triggerAction('scan');
        navigator.vibrate?.(20);
      }
    };

    this.scanBtnEl.addEventListener('pointerup', releaseScan);
    this.scanBtnEl.addEventListener('pointercancel', releaseScan);

    // Map button (Left Thumb)
    this.mapBtnEl.addEventListener('click', () => {
      this.touchInput.triggerAction('map');
      navigator.vibrate?.(15);
    });

    // Target button (Left Thumb: cycle lock on nav radar)
    this.targetBtnEl?.addEventListener('click', () => {
      this.touchInput.triggerAction('cycle_target');
      navigator.vibrate?.(15);
    });

    // Orbit / Land button
    this.orbitBtnEl.addEventListener('click', () => {
      if (this.currentContext === 'surface') {
        this.touchInput.triggerAction('cancel'); // Return to orbit
      } else {
        this.touchInput.triggerAction('confirm'); // Land / engage orbit
      }
      navigator.vibrate?.(15);
    });

    // Altitude controls (surface hover)
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

    // Emote Drawer Toggle & Close
    this.container.querySelector('#touch-btn-emote-toggle')?.addEventListener('click', () => {
      this.toggleEmoteDrawer();
      navigator.vibrate?.(10);
    });

    this.container.querySelector('#touch-btn-emote-close')?.addEventListener('click', () => {
      this.closeEmoteDrawer();
    });

    // In-Flight Radio Emote Actions (Auto-collapse drawer upon transmit)
    this.container.querySelector('#touch-btn-emote-wave')?.addEventListener('click', () => {
      this.onEmoteCallback?.('wave');
      this.closeEmoteDrawer();
      navigator.vibrate?.(25);
    });

    this.container.querySelector('#touch-btn-emote-heart')?.addEventListener('click', () => {
      this.onEmoteCallback?.('heart');
      this.closeEmoteDrawer();
      navigator.vibrate?.(25);
    });

    this.container.querySelector('#touch-btn-emote-peace')?.addEventListener('click', () => {
      this.onEmoteCallback?.('peace');
      this.closeEmoteDrawer();
      navigator.vibrate?.(25);
    });
  }

  public openEmoteDrawer(): void {
    const drawer = this.container.querySelector('#touch-emote-drawer') as HTMLElement;
    if (drawer) drawer.style.display = 'flex';
  }

  public closeEmoteDrawer(): void {
    const drawer = this.container.querySelector('#touch-emote-drawer') as HTMLElement;
    if (drawer) drawer.style.display = 'none';
  }

  public toggleEmoteDrawer(): void {
    const drawer = this.container.querySelector('#touch-emote-drawer') as HTMLElement;
    if (drawer) {
      const isHidden = drawer.style.display === 'none' || !drawer.style.display;
      drawer.style.display = isHidden ? 'flex' : 'none';
    }
  }

  public isEmoteDrawerOpen(): boolean {
    const drawer = this.container.querySelector('#touch-emote-drawer') as HTMLElement;
    return drawer ? drawer.style.display === 'flex' : false;
  }

  public setContext(context: 'space' | 'surface' | 'menu'): void {
    this.currentContext = context;
    const altRow = this.container.querySelector('#touch-altitude-row') as HTMLElement;
    if (context === 'surface') {
      if (altRow) altRow.style.display = 'flex';
      if (this.orbitBtnEl) {
        this.orbitBtnEl.textContent = 'ORBIT';
        this.orbitBtnEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        this.orbitBtnEl.style.color = '#38bdf8';
        this.orbitBtnEl.style.background = 'rgba(30, 41, 59, 0.75)';
        this.orbitBtnEl.style.boxShadow = 'none';
      }
      if (this.scanBtnEl) {
        this.scanBtnEl.textContent = 'SCAN / SAMPLE';
      }
    } else {
      if (altRow) altRow.style.display = 'none';
      if (this.orbitBtnEl) {
        this.orbitBtnEl.textContent = 'LAND';
      }
      if (this.scanBtnEl) {
        this.scanBtnEl.textContent = 'SCAN / TRACTOR';
      }
    }
  }

  public setOrbitAvailable(available: boolean, _planetName?: string): void {
    if (this.currentContext === 'surface') return;
    if (available) {
      if (this.orbitBtnEl) {
        this.orbitBtnEl.textContent = 'ORBIT';
        this.orbitBtnEl.style.borderColor = '#38bdf8';
        this.orbitBtnEl.style.color = '#ffffff';
        this.orbitBtnEl.style.background = 'linear-gradient(135deg, rgba(14, 165, 233, 0.7), rgba(56, 189, 248, 0.5))';
        this.orbitBtnEl.style.boxShadow = '0 0 14px rgba(56, 189, 248, 0.6)';
      }
    } else {
      if (this.orbitBtnEl) {
        this.orbitBtnEl.textContent = 'LAND';
        this.orbitBtnEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        this.orbitBtnEl.style.color = '#38bdf8';
        this.orbitBtnEl.style.background = 'rgba(30, 41, 59, 0.75)';
        this.orbitBtnEl.style.boxShadow = 'none';
      }
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
