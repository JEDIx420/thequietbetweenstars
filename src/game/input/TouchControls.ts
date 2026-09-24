import type { TouchInput } from './TouchInput';
import { clamp, applyDeadzone } from '../../protocol';
import { HapticFeedback } from './HapticFeedback';

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
  private isJoystickEngaged = false;

  // Throttle state
  private throttlePointerId: number | null = null;
  private currentThrottle = 0; // 0.0 to 1.0
  private throttleTrackEl!: HTMLElement;
  private throttleFillEl!: HTMLElement;
  private throttleKnobEl!: HTMLElement;
  private throttleLabelEl!: HTMLElement;
  private lastThrottleDetent = -1; // 0: idle, 1: cruise 50%, 2: overdrive 100%

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

  public isTractorHeld(): boolean {
    return this.isHoldingTractor;
  }

  // Cached layout metrics to eliminate layout thrashing
  private cachedThrottleTrackHeight = 136;
  private cachedThrottleTrackBottom = 0;

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
      touch-action: none;
      overscroll-behavior: none;
      z-index: 50;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 10px 14px;
      box-sizing: border-box;
      transition: opacity 0.2s ease;
    `;

    this.container.innerHTML = `
      <style>
        #touch-controls-overlay {
          padding: max(8px, env(safe-area-inset-top, 0px))
                   max(14px, calc(env(safe-area-inset-right, 0px) + 12px))
                   max(8px, calc(env(safe-area-inset-bottom, 0px) + 6px))
                   max(14px, calc(env(safe-area-inset-left, 0px) + 12px)) !important;
        }
        #touch-controls-overlay,
        #touch-controls-overlay * {
          touch-action: none;
          -webkit-touch-callout: none;
        }
        #touch-controls-overlay button {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
          transition: transform 0.08s ease, filter 0.08s ease;
        }
        #touch-controls-overlay button:active {
          transform: scale(0.92) !important;
          filter: brightness(1.28) !important;
        }
        #touch-controls-main {
          margin-top: auto !important;
          width: 100% !important;
        }
        /* Dedicated Tablet & iPad Layout and Sizing */
        @media (min-width: 851px) and (pointer: coarse),
               (min-width: 851px) and (max-width: 1366px) and (hover: none) {
          #touch-controls-overlay {
            padding: max(10px, env(safe-area-inset-top, 0px))
                     max(18px, calc(env(safe-area-inset-right, 0px) + 14px))
                     max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))
                     max(18px, calc(env(safe-area-inset-left, 0px) + 14px)) !important;
          }
          #touch-top-bar {
            margin-top: 32px !important;
          }
          #touch-toggle-btn {
            font-size: 9.5px !important;
            padding: 3.5px 10px !important;
          }
          #touch-left-pills button {
            padding: 6px 13px !important;
            font-size: 11px !important;
            border-radius: 8px !important;
          }
          #touch-joystick-zone {
            width: 136px !important;
            height: 136px !important;
          }
          #touch-joystick-base {
            width: 120px !important;
            height: 120px !important;
            left: 8px !important;
            top: 8px !important;
          }
          #touch-joystick-knob {
            width: 48px !important;
            height: 48px !important;
          }
          #touch-right-zone {
            gap: 14px !important;
          }
          #touch-actions-cluster {
            gap: 6px !important;
            margin-bottom: 2px !important;
          }
          #touch-btn-scan {
            width: 134px !important;
            padding: 10px 0 !important;
            font-size: 12px !important;
            border-radius: 10px !important;
          }
          .touch-compact-btn {
            width: 64px !important;
            padding: 8px 0 !important;
            font-size: 11px !important;
            border-radius: 8px !important;
          }
          .touch-util-btn {
            width: 64px !important;
            padding: 7px 0 !important;
            font-size: 10.5px !important;
            border-radius: 8px !important;
          }
          #touch-throttle-track {
            width: 44px !important;
            height: 144px !important;
            border-radius: 22px !important;
          }
          #touch-throttle-knob {
            width: 34px !important;
            height: 28px !important;
            border-radius: 14px !important;
            left: 3px !important;
          }
          #touch-throttle-label {
            font-size: 10px !important;
            margin-bottom: 4px !important;
          }
          #touch-btn-brake {
            width: 44px !important;
            padding: 6px 0 !important;
            font-size: 9.5px !important;
            margin-top: 6px !important;
            border-radius: 8px !important;
          }
          #touch-emote-drawer {
            padding: 6px 10px !important;
            gap: 6px !important;
            border-radius: 12px !important;
          }
          #touch-emote-drawer button {
            width: 34px !important;
            height: 30px !important;
            font-size: 14px !important;
          }
        }
        @media (max-height: 520px), (max-width: 850px) {
          #touch-controls-overlay {
            padding: max(6px, env(safe-area-inset-top, 0px))
                     max(14px, calc(env(safe-area-inset-right, 0px) + 12px))
                     max(6px, calc(env(safe-area-inset-bottom, 0px) + 4px))
                     max(14px, calc(env(safe-area-inset-left, 0px) + 12px)) !important;
          }
          #touch-top-bar {
            margin-top: 18px !important;
          }
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
      <div id="touch-top-bar" style="display: flex; justify-content: flex-start; align-items: center; width: 100%; pointer-events: none; margin-top: 32px;">
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
        margin-top: auto;
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

    // Prevent iOS Safari gesture recognition & fullscreen cancellation on touch
    const preventTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    zone.addEventListener('touchstart', preventTouch, { passive: false });
    zone.addEventListener('touchmove', preventTouch, { passive: false });
    zone.addEventListener('touchend', preventTouch, { passive: false });

    const handlePointerDown = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {}

      const rect = this.joystickBaseEl.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const measuredRadius = (rect.width / 2) - 10;
      if (measuredRadius > 20) {
        this.joystickRadius = measuredRadius;
      }

      HapticFeedback.light();
      this.updateJoystick(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.pointerId !== this.joystickPointerId) return;
      this.updateJoystick(e.clientX, e.clientY);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      try {
        zone.releasePointerCapture(e.pointerId);
      } catch {}

      if (this.isJoystickEngaged) {
        this.isJoystickEngaged = false;
        HapticFeedback.light();
      }

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

    // Detect engaging deflection beyond deadzone for tactile click
    if (clampedDist > 12) {
      if (!this.isJoystickEngaged) {
        this.isJoystickEngaged = true;
        HapticFeedback.light();
      }
    } else {
      this.isJoystickEngaged = false;
    }

    // Normalized axes (-1 to 1) with deadzone
    const normX = applyDeadzone(knobX / this.joystickRadius, 0.06);
    // Y is inverted for flight pitch (pushing forward = pitch down / nose down)
    const normY = applyDeadzone(-knobY / this.joystickRadius, 0.06);

    this.touchInput.setAxes({ x: normX, y: normY });
  }

  private setupThrottleEvents(): void {
    const track = this.container.querySelector('#touch-throttle-track') as HTMLElement;

    // Prevent iOS Safari gesture recognition & fullscreen cancellation on touch
    const preventTrackTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    track.addEventListener('touchstart', preventTrackTouch, { passive: false });
    track.addEventListener('touchmove', preventTrackTouch, { passive: false });
    track.addEventListener('touchend', preventTrackTouch, { passive: false });

    const handlePointerDown = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      if (this.throttlePointerId !== null) return;
      this.throttlePointerId = e.pointerId;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {}
      const rect = this.throttleTrackEl.getBoundingClientRect();
      this.cachedThrottleTrackHeight = rect.height || 136;
      this.cachedThrottleTrackBottom = rect.bottom;
      HapticFeedback.light();
      this.updateThrottleFromPointer(e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.pointerId !== this.throttlePointerId) return;
      this.updateThrottleFromPointer(e.clientY);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
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
    brakeBtn.addEventListener('pointerdown', (e) => {
      if (e.cancelable) e.preventDefault();
      this.setThrottle(0);
      this.touchInput.triggerAction('pause');
      HapticFeedback.heavy();
    });
  }

  private updateThrottleFromPointer(clientY: number): void {
    const trackHeight = this.cachedThrottleTrackHeight;
    // 0 is bottom, 1 is top
    const relativeY = this.cachedThrottleTrackBottom - clientY;
    const norm = clamp(relativeY / trackHeight, 0, 1);
    this.setThrottle(norm);
  }

  public setThrottle(val: number): void {
    this.currentThrottle = clamp(val, 0, 1);
    const percent = Math.round(this.currentThrottle * 100);

    // Detent notch haptics: idle (0%), cruise (50%), overdrive (100%)
    if (this.currentThrottle <= 0.02) {
      if (this.lastThrottleDetent !== 0) {
        this.lastThrottleDetent = 0;
        HapticFeedback.notch();
      }
    } else if (Math.abs(this.currentThrottle - 0.5) <= 0.035) {
      if (this.lastThrottleDetent !== 1) {
        this.lastThrottleDetent = 1;
        HapticFeedback.notch();
      }
    } else if (this.currentThrottle >= 0.96) {
      if (this.lastThrottleDetent !== 2) {
        this.lastThrottleDetent = 2;
        HapticFeedback.notch();
      }
    } else if ((this.currentThrottle > 0.06 && this.currentThrottle < 0.44) || (this.currentThrottle > 0.56 && this.currentThrottle < 0.92)) {
      this.lastThrottleDetent = -1;
    }

    // Update fill height & knob position using cached track height to avoid layout thrashing
    this.throttleFillEl.style.height = `${percent}%`;
    const trackHeight = this.cachedThrottleTrackHeight;
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
    // SCAN / SENSOR / TRACTOR button: tap to scan, hold to continuously scan or tractor
    this.scanBtnEl.addEventListener('pointerdown', (e) => {
      if (e.cancelable) e.preventDefault();
      this.isHoldingTractor = false;
      this.scanBtnEl.style.transform = 'scale(0.95)';
      this.scanBtnEl.textContent = '📡 SCANNING...';
      this.scanBtnEl.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.45), rgba(168, 85, 247, 0.35))';
      this.scanBtnEl.style.borderColor = '#38bdf8';
      this.scanBtnEl.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.7)';

      // Immediately set scan and interact state down
      this.touchInput.setActionState('scan', true);
      this.touchInput.setActionState('interact', true);
      HapticFeedback.scan();

      const timerFn = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout.bind(window) : setTimeout;
      this.tractorTimer = timerFn(() => {
        this.isHoldingTractor = true;
        this.scanBtnEl.textContent = '⚡ SCAN / TRACTOR';
        this.scanBtnEl.style.background = 'linear-gradient(135deg, rgba(168, 85, 247, 0.5), rgba(56, 189, 248, 0.5))';
        this.scanBtnEl.style.borderColor = '#c084fc';
        this.scanBtnEl.style.boxShadow = '0 0 18px rgba(192, 132, 252, 0.8)';
        this.touchInput.setActionState('tractor', true);
        HapticFeedback.medium();
      }, 350) as any;
    });

    const releaseScan = (e?: Event) => {
      if (e?.cancelable) e.preventDefault();
      this.scanBtnEl.style.transform = 'scale(1)';
      this.scanBtnEl.style.boxShadow = 'none';
      if (this.tractorTimer !== null) {
        clearTimeout(this.tractorTimer);
        this.tractorTimer = null;
      }

      this.touchInput.setActionState('scan', false);
      this.touchInput.setActionState('tractor', false);
      this.touchInput.setActionState('interact', false);

      this.isHoldingTractor = false;
      this.scanBtnEl.textContent = this.currentContext === 'surface' ? 'SCAN / SAMPLE' : 'SCAN / TRACTOR';
      this.scanBtnEl.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(14, 165, 233, 0.16))';
      this.scanBtnEl.style.borderColor = 'rgba(56, 189, 248, 0.65)';

      // Trigger action tick for instant tap consumers
      this.touchInput.triggerAction('scan');
      HapticFeedback.light();
    };

    this.scanBtnEl.addEventListener('pointerup', releaseScan);
    this.scanBtnEl.addEventListener('pointercancel', releaseScan);
    this.scanBtnEl.addEventListener('pointerleave', releaseScan);

    const bindFastTap = (el: HTMLElement | null, action: () => void) => {
      if (!el) return;
      let lastTrigger = 0;
      const trigger = (e: Event) => {
        const now = Date.now();
        if (now - lastTrigger < 250) return;
        lastTrigger = now;
        if (e.cancelable) e.preventDefault();
        action();
      };
      el.addEventListener('pointerdown', trigger);
      el.addEventListener('click', trigger);
    };

    // Map button (Left Thumb)
    bindFastTap(this.mapBtnEl, () => {
      this.touchInput.triggerAction('map');
      HapticFeedback.light();
    });

    // Target button (Left Thumb: lock on target ahead / cycle lock)
    bindFastTap(this.targetBtnEl, () => {
      this.touchInput.triggerAction('target_lock');
      this.touchInput.triggerAction('cycle_target');
      HapticFeedback.medium();
    });

    // Orbit / Land button
    bindFastTap(this.orbitBtnEl, () => {
      if (this.currentContext === 'surface') {
        this.touchInput.triggerAction('cancel'); // Return to orbit
      } else {
        this.touchInput.triggerAction('confirm'); // Land / engage orbit
      }
      HapticFeedback.medium();
    });

    // Altitude controls (surface hover)
    bindFastTap(this.altUpBtnEl, () => {
      this.touchInput.triggerAction('altitude_up');
      HapticFeedback.light();
    });

    bindFastTap(this.altDownBtnEl, () => {
      this.touchInput.triggerAction('altitude_down');
      HapticFeedback.light();
    });

    // Modules / Store
    bindFastTap(this.upgradeBtnEl, () => {
      this.touchInput.triggerAction('supply');
      HapticFeedback.light();
    });

    // Journal
    bindFastTap(this.journalBtnEl, () => {
      this.touchInput.triggerAction('journal');
      HapticFeedback.light();
    });

    // Toggle touch controls visibility
    bindFastTap(this.toggleBtnEl, () => {
      this.toggleVisibility();
      HapticFeedback.light();
    });

    // Emote Drawer Toggle & Close
    this.container.querySelector('#touch-btn-emote-toggle')?.addEventListener('click', (e) => {
      if (e.cancelable) e.preventDefault();
      this.toggleEmoteDrawer();
      HapticFeedback.light();
    });

    this.container.querySelector('#touch-btn-emote-close')?.addEventListener('click', (e) => {
      if (e.cancelable) e.preventDefault();
      this.closeEmoteDrawer();
    });

    // In-Flight Radio Emote Actions (Auto-collapse drawer upon transmit)
    this.container.querySelector('#touch-btn-emote-wave')?.addEventListener('click', (e) => {
      if (e.cancelable) e.preventDefault();
      this.onEmoteCallback?.('wave');
      this.closeEmoteDrawer();
      HapticFeedback.medium();
    });

    this.container.querySelector('#touch-btn-emote-heart')?.addEventListener('click', (e) => {
      if (e.cancelable) e.preventDefault();
      this.onEmoteCallback?.('heart');
      this.closeEmoteDrawer();
      HapticFeedback.medium();
    });

    this.container.querySelector('#touch-btn-emote-peace')?.addEventListener('click', (e) => {
      if (e.cancelable) e.preventDefault();
      this.onEmoteCallback?.('peace');
      this.closeEmoteDrawer();
      HapticFeedback.medium();
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
      if (typeof document !== 'undefined') {
        document.body?.classList?.add?.('touch-controls-active');
      }
      this.recalibrateMetrics();
    } else {
      if (mainControls) mainControls.style.display = 'none';
      this.toggleBtnEl.textContent = 'TOUCH: OFF';
      this.toggleBtnEl.style.color = '#64748b';
      if (typeof document !== 'undefined') {
        document.body?.classList?.remove?.('touch-controls-active');
      }
    }
  }

  public show(): void {
    this.container.style.display = 'flex';
    if (this.isVisible) {
      if (typeof document !== 'undefined') {
        document.body?.classList?.add?.('touch-controls-active');
      }
    }
    this.recalibrateMetrics();
  }

  public hide(): void {
    this.container.style.display = 'none';
    if (typeof document !== 'undefined') {
      document.body?.classList?.remove?.('touch-controls-active');
    }
  }

  private recalibrateMetrics(): void {
    if (this.throttleTrackEl) {
      const rect = this.throttleTrackEl.getBoundingClientRect();
      if (rect && rect.height > 0) {
        this.cachedThrottleTrackHeight = rect.height;
        this.cachedThrottleTrackBottom = rect.bottom;
      }
    }
    if (this.joystickPointerId === null && this.joystickBaseEl) {
      const rect = this.joystickBaseEl.getBoundingClientRect();
      if (rect && rect.width > 0) {
        this.joystickCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        const measuredRadius = (rect.width / 2) - 10;
        if (measuredRadius > 20) {
          this.joystickRadius = measuredRadius;
        }
      }
    }
  }

  private setupResizeListener(): void {
    window.addEventListener('resize', () => {
      this.recalibrateMetrics();
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.recalibrateMetrics(), 100);
    });
  }

  public dispose(): void {
    if (this.tractorTimer) {
      clearTimeout(this.tractorTimer);
    }
    if (typeof document !== 'undefined') {
      document.body?.classList?.remove?.('touch-controls-active');
    }
    this.container.remove();
  }
}
