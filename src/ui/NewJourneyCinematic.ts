import * as THREE from 'three';
import { CinematicCameraDirector, type CinematicKeyframe } from './CinematicCameraDirector';

/**
 * NewJourneyCinematic.ts
 * 
 * 18-second skippable in-engine cinematic sequence for New Journey:
 * Scene 1: The Chart (Cosmic star cluster panorama & Deep survey directive)
 * Scene 2: The Assignment (High orbital transit over Aurelia Prime)
 * Scene 3: The Starfighter (Slow cinematic reveal of the Survey Craft and articulated survey vanes)
 * Scene 4: Departure (Engine ignition, thrusters flare, craft accelerates into the void)
 */

export class NewJourneyCinematic {
  private director: CinematicCameraDirector;
  private overlayEl: HTMLElement | null = null;
  private captionTitleEl: HTMLElement | null = null;
  private captionBodyEl: HTMLElement | null = null;
  private isFinished = false;
  private onCompleteCallback: (() => void) | null = null;

  constructor(private container: HTMLElement) {
    this.director = new CinematicCameraDirector();
  }

  public getDirector(): CinematicCameraDirector {
    return this.director;
  }

  public getIsPlaying(): boolean {
    return this.director.getIsPlaying();
  }

  public play(
    shipPosition: THREE.Vector3,
    onComplete: () => void
  ): void {
    this.onCompleteCallback = onComplete;
    this.isFinished = false;

    // Build keyframes relative to ship position
    const kfs: CinematicKeyframe[] = [
      // 0s - 4.5s: SCENE 1 - The Quiet Expanse
      {
        timeSeconds: 0,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(120, 45, 180)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -50)),
        fov: 50,
        captionTitle: 'SECTOR QUIET-001 // THE LONG SURVEY',
        captionBody: 'Beyond the charted shipping lanes lies the unbroken calm of the outer arms.',
      },
      {
        timeSeconds: 4.5,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(80, 25, 120)),
        targetPosition: shipPosition.clone(),
        fov: 55,
      },

      // 4.5s - 9.5s: SCENE 2 - The Orbital Relay
      {
        timeSeconds: 4.51,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(-45, 18, 50)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 2, 0)),
        fov: 48,
        captionTitle: 'SURVEY MANDATE // UNCHARTED CONTACT',
        captionBody: 'Your task is not conquest or extraction. You are here to listen, map, and catalog life.',
      },
      {
        timeSeconds: 9.5,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(-25, 10, 30)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 1, 0)),
        fov: 52,
      },

      // 9.5s - 14.5s: SCENE 3 - The Survey Starfighter
      {
        timeSeconds: 9.51,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(14, -4, 18)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -2)),
        fov: 45,
        captionTitle: 'VESSEL STATUS // SURVEY CRAFT SC-1',
        captionBody: 'Vane articulators primed. Atmospheric shields synchronized. Field sensors online.',
      },
      {
        timeSeconds: 14.5,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(6, 2, 8)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, 0)),
        fov: 58,
      },

      // 14.5s - 18.0s: SCENE 4 - Departure
      {
        timeSeconds: 14.51,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(0, 4, 16)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -40)),
        fov: 65,
        captionTitle: 'SYSTEM READY // MANUAL CONTROL GRANTED',
        captionBody: 'Welcome to the quiet between stars, Explorer.',
      },
      {
        timeSeconds: 18.0,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(0, 4.5, 14)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -60)),
        fov: 60,
      },
    ];

    this.director.setKeyframes(kfs);

    // Create cinematic letterbox UI with title cards and skip hint
    this.createUI();

    this.director.play(() => {
      this.finish();
    });
  }

  private createUI(): void {
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'cinematic-overlay';
    this.overlayEl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 50;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
      transition: opacity 0.6s ease;
    `;

    this.overlayEl.innerHTML = `
      <!-- Top Letterbox Bar -->
      <div style="
        height: 10vh;
        background: rgba(3, 3, 7, 0.95);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 40px;
        box-sizing: border-box;
        border-bottom: 1px solid rgba(56, 189, 248, 0.15);
      ">
        <div style="
          font-size: 11px;
          letter-spacing: 0.35em;
          color: #38bdf8;
          font-weight: 600;
          text-transform: uppercase;
        ">THE QUIET BETWEEN STARS // PROLOGUE</div>
        
        <button id="btn-skip-cinematic" style="
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 9999px;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.15em;
          padding: 6px 18px;
          cursor: pointer;
          transition: all 0.2s ease;
        ">SKIP [SPACE / ESC]</button>
      </div>

      <!-- Center Narrative Subtitles -->
      <div style="
        align-self: center;
        text-align: center;
        max-width: 680px;
        padding: 24px 32px;
        background: rgba(3, 3, 7, 0.55);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        margin-bottom: 30px;
      ">
        <div id="cinematic-title" style="
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.25em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 8px;
          text-shadow: 0 0 15px rgba(56, 189, 248, 0.6);
        "></div>
        <div id="cinematic-body" style="
          font-size: 15px;
          font-weight: 300;
          letter-spacing: 0.04em;
          line-height: 1.65;
          color: #f1f5f9;
        "></div>
      </div>

      <!-- Bottom Letterbox Bar -->
      <div style="
        height: 10vh;
        background: rgba(3, 3, 7, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        border-top: 1px solid rgba(56, 189, 248, 0.15);
      ">
        <div style="
          font-size: 11px;
          font-family: ui-monospace, monospace;
          letter-spacing: 0.2em;
          color: #64748b;
        ">FLIGHT RECORDER ONLINE · ARCHIVE ACTIVE</div>
      </div>
    `;

    this.container.appendChild(this.overlayEl);

    this.captionTitleEl = this.overlayEl.querySelector('#cinematic-title');
    this.captionBodyEl = this.overlayEl.querySelector('#cinematic-body');

    const onSkip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.director.stop();
    };

    this.overlayEl.querySelector('#btn-skip-cinematic')?.addEventListener('click', onSkip);

    const keyListener = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') {
        window.removeEventListener('keydown', keyListener);
        this.director.stop();
      }
    };
    window.addEventListener('keydown', keyListener);
  }

  public update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (!this.director.getIsPlaying()) return;

    this.director.update(dt, camera);

    const caption = this.director.getCurrentCaption();
    if (caption && this.captionTitleEl && this.captionBodyEl) {
      if (this.captionTitleEl.textContent !== caption.title) {
        this.captionTitleEl.textContent = caption.title;
      }
      if (this.captionBodyEl.textContent !== caption.body) {
        this.captionBodyEl.textContent = caption.body;
      }
    }
  }

  private finish(): void {
    if (this.isFinished) return;
    this.isFinished = true;

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
      }, 600);
    } else if (this.onCompleteCallback) {
      this.onCompleteCallback();
      this.onCompleteCallback = null;
    }
  }
}
