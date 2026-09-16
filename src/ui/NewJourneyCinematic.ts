import * as THREE from 'three';
import { CinematicCameraDirector, type CinematicKeyframe } from './CinematicCameraDirector';

/**
 * NewJourneyCinematic.ts
 * 
 * High-octane cinematic sequence for New Journey:
 * Scene 1: The Cosmic Frontier (Camera speeds through asteroid debris with blazing shooting stars)
 * Scene 2: High Orbital Insertion (Flyby past Aurelia's shimmering atmosphere and ring system)
 * Scene 3: The Starfighter Reveal (Close dramatic orbit sweep around the aggressive 4-wing Survey Craft)
 * Scene 4: Engine Roar & Departure (Thrusters flare from idle into afterburner boost as the craft accelerates into hyperspace)
 */

export class NewJourneyCinematic {
  private director: CinematicCameraDirector;
  private overlayEl: HTMLElement | null = null;
  private captionTitleEl: HTMLElement | null = null;
  private captionBodyEl: HTMLElement | null = null;
  private isFinished = false;
  private onCompleteCallback: (() => void) | null = null;

  // In-engine cinematic shooting stars (Zero buffer re-upload)
  private cinematicMeteorsGroup: THREE.Group | null = null;
  private cinematicMeteorLines: THREE.Line[] = [];
  private sceneRef: THREE.Scene | null = null;

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
    onComplete: () => void,
    scene?: THREE.Scene
  ): void {
    this.onCompleteCallback = onComplete;
    this.isFinished = false;
    this.sceneRef = scene || null;

    // Create cinematic meteor streaks in the space scene
    if (this.sceneRef) {
      this.createCinematicMeteors(shipPosition);
    }

    // Dynamic camera keyframes for high-drama sweep
    const kfs: CinematicKeyframe[] = [
      // 0s - 4.5s: SCENE 1 - Deep Space Frontier & Meteor Field
      {
        timeSeconds: 0,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(140, 60, 210)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, -10, -60)),
        fov: 48,
        captionTitle: 'SECTOR QUIET-001 // THE DEEP FRONTIER',
        captionBody: 'Beyond the charted shipping lanes lies the uncharted abyss of the outer arms.',
      },
      {
        timeSeconds: 4.5,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(70, 30, 110)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, 0)),
        fov: 56,
      },

      // 4.5s - 9.0s: SCENE 2 - The Orbital Flyby
      {
        timeSeconds: 4.51,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(-65, 22, 55)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 4, 10)),
        fov: 46,
        captionTitle: 'AURELIA CORRIDOR // HIGH ORBITAL ENTRY',
        captionBody: 'Sensor beacons confirm bio-resonance harmonics across the equatorial expanse.',
      },
      {
        timeSeconds: 9.0,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(-30, 14, 25)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 2, 0)),
        fov: 52,
      },

      // 9.0s - 13.5s: SCENE 3 - The Survey Starfighter Power-Up
      {
        timeSeconds: 9.01,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(12, -3, 14)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -2)),
        fov: 44,
        captionTitle: 'VESSEL STATUS // SURVEY STARFIGHTER SC-1',
        captionBody: 'Four-vane vector articulation synchronized. Magnetoplasma drives at 100% readiness.',
      },
      {
        timeSeconds: 13.5,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(5, 1.8, 6.5)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0.4, 0)),
        fov: 58,
      },

      // 13.5s - 17.0s: SCENE 4 - Full Throttle Ignition & Departure
      {
        timeSeconds: 13.51,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(0, 3.8, 14.5)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -50)),
        fov: 68,
        captionTitle: 'ENGINES ENGAGED // HYPER-DRIVE ARMED',
        captionBody: 'All flight systems are yours, Explorer. Go make history.',
      },
      {
        timeSeconds: 17.0,
        cameraPosition: shipPosition.clone().add(new THREE.Vector3(0, 4.2, 11)),
        targetPosition: shipPosition.clone().add(new THREE.Vector3(0, 0, -80)),
        fov: 62,
      },
    ];

    this.director.setKeyframes(kfs);
    this.createUI();

    this.director.play(() => {
      this.finish();
    });
  }

  private createCinematicMeteors(shipPos: THREE.Vector3): void {
    if (!this.sceneRef) return;

    const count = 12;
    this.cinematicMeteorsGroup = new THREE.Group();
    this.cinematicMeteorLines = [];

    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < count; i++) {
      const len = 40 + Math.random() * 60;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-len * 0.8, -len * 0.3, len * 0.6),
      ]);

      const line = new THREE.Line(geo, mat);
      const spd = 220 + Math.random() * 260;
      line.userData = {
        vel: new THREE.Vector3(spd * 0.8, spd * 0.3, -spd * 0.6),
      };

      line.position.set(
        shipPos.x + (Math.random() - 0.5) * 350,
        shipPos.y + (Math.random() - 0.5) * 200,
        shipPos.z + (Math.random() - 0.5) * 250
      );

      this.cinematicMeteorLines.push(line);
      this.cinematicMeteorsGroup.add(line);
    }

    this.sceneRef.add(this.cinematicMeteorsGroup);
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
      <!-- Top Cinema Letterbox Bar -->
      <div style="
        height: 10vh;
        background: rgba(2, 2, 6, 0.96);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 40px;
        box-sizing: border-box;
        border-bottom: 1px solid rgba(56, 189, 248, 0.25);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
      ">
        <div style="
          font-size: 11px;
          letter-spacing: 0.35em;
          color: #38bdf8;
          font-weight: 700;
          text-transform: uppercase;
        ">THE QUIET BETWEEN STARS // FLIGHT PROLOGUE</div>
        
        <button id="btn-skip-cinematic" style="
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 9999px;
          color: #f8fafc;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          padding: 7px 22px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 0 15px rgba(56, 189, 248, 0.25);
        ">SKIP [SPACE / ESC]</button>
      </div>

      <!-- Center Narrative Subtitles with Anamorphic Line -->
      <div style="
        align-self: center;
        text-align: center;
        max-width: 720px;
        padding: 22px 34px;
        background: rgba(3, 7, 18, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85);
        margin-bottom: 35px;
        will-change: transform, opacity;
      ">
        <div id="cinematic-title" style="
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.28em;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 8px;
          text-shadow: 0 0 20px rgba(56, 189, 248, 0.8);
        "></div>
        <div id="cinematic-body" style="
          font-size: 16px;
          font-weight: 300;
          letter-spacing: 0.05em;
          line-height: 1.7;
          color: #f8fafc;
        "></div>
      </div>

      <!-- Bottom Cinema Letterbox Bar -->
      <div style="
        height: 10vh;
        background: rgba(2, 2, 6, 0.96);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 40px;
        box-sizing: border-box;
        border-top: 1px solid rgba(56, 189, 248, 0.25);
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.8);
      ">
        <div style="
          font-size: 11px;
          font-family: ui-monospace, monospace;
          letter-spacing: 0.2em;
          color: #4ade80;
        ">● TELEMETRY LINK ESTABLISHED</div>

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

    // Animate cinematic shooting stars (Zero buffer re-upload)
    for (let i = 0; i < this.cinematicMeteorLines.length; i++) {
      const line = this.cinematicMeteorLines[i];
      const vel = line.userData.vel as THREE.Vector3;
      line.position.addScaledVector(vel, dt);

      // Boundary reset
      if (Math.abs(line.position.x - camera.position.x) > 280) {
        line.position.set(
          camera.position.x - 220 - Math.random() * 100,
          camera.position.y - 120 - Math.random() * 80,
          camera.position.z - 100 + Math.random() * 200
        );
      }
    }

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

    if (this.cinematicMeteorsGroup && this.sceneRef) {
      this.cinematicMeteorsGroup.traverse((obj) => {
        if ((obj as THREE.Line).geometry) {
          (obj as THREE.Line).geometry.dispose();
        }
        if ((obj as THREE.Line).material) {
          ((obj as THREE.Line).material as THREE.Material).dispose();
        }
      });
      this.sceneRef.remove(this.cinematicMeteorsGroup);
      this.cinematicMeteorsGroup = null;
      this.cinematicMeteorLines = [];
    }

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
