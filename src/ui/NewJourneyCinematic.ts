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

  // In-engine cinematic shooting stars
  private cinematicMeteors: THREE.LineSegments | null = null;
  private meteorPositions: Float32Array | null = null;
  private meteorVelocities: THREE.Vector3[] = [];
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

    const count = 30;
    const geo = new THREE.BufferGeometry();
    this.meteorPositions = new Float32Array(count * 6);
    this.meteorVelocities = [];

    for (let i = 0; i < count; i++) {
      const x = shipPos.x + (Math.random() - 0.5) * 400;
      const y = shipPos.y + (Math.random() - 0.5) * 250;
      const z = shipPos.z + (Math.random() - 0.5) * 300;
      const len = 35 + Math.random() * 65;

      this.meteorPositions[i * 6] = x;
      this.meteorPositions[i * 6 + 1] = y;
      this.meteorPositions[i * 6 + 2] = z;

      this.meteorPositions[i * 6 + 3] = x - len * 0.8;
      this.meteorPositions[i * 6 + 4] = y - len * 0.3;
      this.meteorPositions[i * 6 + 5] = z + len * 0.6;

      const spd = 200 + Math.random() * 300;
      this.meteorVelocities.push(new THREE.Vector3(spd * 0.8, spd * 0.3, -spd * 0.6));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.meteorPositions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    this.cinematicMeteors = new THREE.LineSegments(geo, mat);
    this.sceneRef.add(this.cinematicMeteors);
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
        padding: 24px 36px;
        background: rgba(3, 7, 18, 0.72);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 16px;
        box-shadow: 0 10px 45px rgba(0, 0, 0, 0.75), 0 0 25px rgba(56, 189, 248, 0.15);
        margin-bottom: 35px;
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

    // Animate cinematic shooting stars
    if (this.cinematicMeteors && this.meteorPositions) {
      const posAttr = this.cinematicMeteors.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = this.meteorPositions;

      for (let i = 0; i < this.meteorVelocities.length; i++) {
        const vel = this.meteorVelocities[i];
        arr[i * 6] += vel.x * dt;
        arr[i * 6 + 1] += vel.y * dt;
        arr[i * 6 + 2] += vel.z * dt;

        arr[i * 6 + 3] += vel.x * dt;
        arr[i * 6 + 4] += vel.y * dt;
        arr[i * 6 + 5] += vel.z * dt;

        // Reset if flying too far
        if (Math.abs(arr[i * 6] - camera.position.x) > 300) {
          arr[i * 6] = camera.position.x - 200 - Math.random() * 100;
          arr[i * 6 + 1] = camera.position.y - 100 - Math.random() * 80;
          arr[i * 6 + 2] = camera.position.z - 100 + Math.random() * 200;
          arr[i * 6 + 3] = arr[i * 6] - 40;
          arr[i * 6 + 4] = arr[i * 6 + 1] - 15;
          arr[i * 6 + 5] = arr[i * 6 + 2] + 30;
        }
      }
      posAttr.needsUpdate = true;
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

    if (this.cinematicMeteors && this.sceneRef) {
      this.sceneRef.remove(this.cinematicMeteors);
      this.cinematicMeteors.geometry.dispose();
      (this.cinematicMeteors.material as THREE.Material).dispose();
      this.cinematicMeteors = null;
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
