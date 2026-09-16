import * as THREE from 'three';

/**
 * TitleRevealSequence.ts
 * 
 * Wildly cinematic 3D space opening reveal sequence:
 * - Dynamic 3D WebGL background: Cosmic starfield with camera drift & acceleration
 * - Streaming shooting stars / hyperspace streaks flashing across the view
 * - Glowing celestial warp particles with motion blur streaks
 * - Shimmering planetary silhouette and nebula aurora
 * - Volumetric lens flare pulses and cinematic typography with particle burst
 * - Skippable via Space, Escape, or pointer click
 */

export class TitleRevealSequence {
  private overlayEl: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private animFrameId: number | null = null;
  private isFinished = false;
  private onCompleteCallback: (() => void) | null = null;
  private timeoutId: number | null = null;

  // Visual objects
  private stars: THREE.Points | null = null;
  private shootingStars: THREE.LineSegments | null = null;
  private shootingStarVelocities: THREE.Vector3[] = [];
  private shootingStarLines: Float32Array | null = null;
  private nebulaCloud: THREE.Points | null = null;
  private glowPlanet: THREE.Mesh | null = null;
  private startTime = performance.now();

  constructor(private container: HTMLElement) {}

  public play(onComplete: () => void): void {
    this.onCompleteCallback = onComplete;
    this.isFinished = false;
    this.startTime = performance.now();

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'title-reveal-overlay';
    this.overlayEl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: #020206;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer;
      user-select: none;
      opacity: 1;
      overflow: hidden;
      transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // 3D Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none;';
    this.overlayEl.appendChild(this.canvas);

    // HTML Content & Stylized Cinema HUD
    const contentEl = document.createElement('div');
    contentEl.style.cssText = `
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      pointer-events: none;
      padding: 0 24px;
    `;

    contentEl.innerHTML = `
      <style>
        @keyframes cinemaGlow {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(12px);
            letter-spacing: 0.22em;
            text-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
            filter: blur(8px);
          }
          35% {
            opacity: 1;
            transform: scale(1.02) translateY(0);
            letter-spacing: 0.38em;
            text-shadow: 0 0 40px rgba(56, 189, 248, 0.9), 0 0 90px rgba(14, 165, 233, 0.6), 0 0 140px rgba(99, 102, 241, 0.4);
            filter: blur(0px);
          }
          85% {
            opacity: 1;
            transform: scale(1.0) translateY(0);
            letter-spacing: 0.42em;
            text-shadow: 0 0 35px rgba(56, 189, 248, 0.8), 0 0 70px rgba(14, 165, 233, 0.5);
          }
          100% {
            opacity: 0.9;
            letter-spacing: 0.45em;
            text-shadow: 0 0 25px rgba(56, 189, 248, 0.6);
          }
        }

        @keyframes flarePulse {
          0% { transform: scaleX(0.1) scaleY(0.4); opacity: 0; }
          40% { transform: scaleX(1.4) scaleY(1.0); opacity: 0.95; }
          80% { transform: scaleX(1.1) scaleY(0.8); opacity: 0.7; }
          100% { transform: scaleX(0.9) scaleY(0.6); opacity: 0.4; }
        }

        @keyframes badgeReveal {
          0% { opacity: 0; transform: translateY(-8px); letter-spacing: 0.5em; }
          45% { opacity: 0.4; }
          100% { opacity: 1; transform: translateY(0); letter-spacing: 0.3em; }
        }

        @keyframes subReveal {
          0% { opacity: 0; transform: translateY(10px); }
          50% { opacity: 0; }
          100% { opacity: 0.85; transform: translateY(0); }
        }

        @keyframes skipBlink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      </style>

      <!-- Horizontal Cinematic Anamorphic Flare Beam -->
      <div style="
        position: absolute;
        width: 120vw;
        height: 3px;
        background: linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.2) 20%, rgba(255, 255, 255, 0.95) 50%, rgba(56, 189, 248, 0.2) 80%, transparent 100%);
        box-shadow: 0 0 35px rgba(56, 189, 248, 0.8), 0 0 70px rgba(14, 165, 233, 0.6);
        animation: flarePulse 3.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      "></div>

      <!-- Sector Mandate Badge -->
      <div style="
        font-family: ui-monospace, monospace;
        font-size: clamp(10px, 1.4vw, 13px);
        font-weight: 700;
        color: #38bdf8;
        text-transform: uppercase;
        margin-bottom: 14px;
        animation: badgeReveal 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      ">
        ◈ DEEP SPACE EXPLORATION DIVISION ◈
      </div>

      <!-- Main Title -->
      <div style="
        font-size: clamp(26px, 6.2vw, 64px);
        font-weight: 200;
        text-transform: uppercase;
        color: #f8fafc;
        animation: cinemaGlow 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        line-height: 1.25;
        white-space: nowrap;
      ">
        THE QUIET BETWEEN STARS
      </div>

      <!-- Subtitle -->
      <div style="
        font-size: clamp(12px, 1.8vw, 16px);
        font-weight: 300;
        letter-spacing: 0.25em;
        color: #94a3b8;
        text-transform: uppercase;
        margin-top: 18px;
        animation: subReveal 3.2s ease-out forwards;
      ">
        A Peaceful Space Odyssey
      </div>

      <!-- Skip Prompt -->
      <div style="
        position: fixed;
        bottom: 28px;
        font-family: ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.25em;
        color: #64748b;
        text-transform: uppercase;
        animation: skipBlink 2.2s infinite ease-in-out;
      ">
        [ CLICK OR PRESS SPACE TO SKIP ]
      </div>
    `;

    this.overlayEl.appendChild(contentEl);
    this.container.appendChild(this.overlayEl);

    // Initialize 3D Space Scene
    this.init3D();

    // Event listeners for skipping
    const onSkip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    };

    this.overlayEl.addEventListener('click', onSkip, { once: true });
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') {
        window.removeEventListener('keydown', keyHandler);
        this.finish();
      }
    };
    window.addEventListener('keydown', keyHandler);

    // Auto-advance after 4.2 seconds
    this.timeoutId = window.setTimeout(() => {
      this.finish();
    }, 4200);
  }

  private init3D(): void {
    if (!this.canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 3000);
    this.camera.position.set(0, 0, 100);

    // 1. Deep Warp Starfield (4,000 stars flying forward)
    const starCount = 3500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 800;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 600;
      starPos[i * 3 + 2] = Math.random() * 1000 - 500;

      const isCyan = Math.random() > 0.4;
      starColors[i * 3] = isCyan ? 0.22 : 1.0;
      starColors[i * 3 + 1] = isCyan ? 0.74 : 0.95;
      starColors[i * 3 + 2] = 1.0;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 2.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);

    // 2. High-Speed Shooting Stars & Meteor Trails (18 concurrent shooting stars)
    const meteorCount = 18;
    const meteorLineGeo = new THREE.BufferGeometry();
    this.shootingStarLines = new Float32Array(meteorCount * 6); // 2 vertices per line (head, tail)
    this.shootingStarVelocities = [];

    for (let i = 0; i < meteorCount; i++) {
      const x = (Math.random() - 0.5) * 600;
      const y = (Math.random() - 0.5) * 400;
      const z = Math.random() * 400 - 200;
      const len = 40 + Math.random() * 80;

      // Head
      this.shootingStarLines[i * 6] = x;
      this.shootingStarLines[i * 6 + 1] = y;
      this.shootingStarLines[i * 6 + 2] = z;

      // Tail
      this.shootingStarLines[i * 6 + 3] = x - len * 0.7;
      this.shootingStarLines[i * 6 + 4] = y - len * 0.4;
      this.shootingStarLines[i * 6 + 5] = z + len * 0.5;

      const spd = 250 + Math.random() * 400;
      this.shootingStarVelocities.push(new THREE.Vector3(spd * 0.7, spd * 0.4, -spd * 0.5));
    }

    meteorLineGeo.setAttribute('position', new THREE.BufferAttribute(this.shootingStarLines, 3));
    const meteorMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
    });
    this.shootingStars = new THREE.LineSegments(meteorLineGeo, meteorMat);
    this.scene.add(this.shootingStars);

    // 3. Ethereal Cosmic Nebula Cloud (Violet & Cyan additive dust)
    const nebCount = 600;
    const nebGeo = new THREE.BufferGeometry();
    const nebPos = new Float32Array(nebCount * 3);
    const nebCol = new Float32Array(nebCount * 3);

    for (let i = 0; i < nebCount; i++) {
      nebPos[i * 3] = (Math.random() - 0.5) * 700;
      nebPos[i * 3 + 1] = (Math.random() - 0.5) * 500;
      nebPos[i * 3 + 2] = (Math.random() - 0.5) * 400;

      const isViolet = i % 2 === 0;
      nebCol[i * 3] = isViolet ? 0.5 : 0.05;
      nebCol[i * 3 + 1] = isViolet ? 0.15 : 0.65;
      nebCol[i * 3 + 2] = 0.95;
    }

    nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPos, 3));
    nebGeo.setAttribute('color', new THREE.BufferAttribute(nebCol, 3));
    const nebMat = new THREE.PointsMaterial({
      size: 28.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.nebulaCloud = new THREE.Points(nebGeo, nebMat);
    this.scene.add(this.nebulaCloud);

    // 4. Distant Glowing Planet Silhouette with Atmospheric Rim
    const planetGeo = new THREE.SphereGeometry(75, 32, 32);
    const planetMat = new THREE.MeshBasicMaterial({
      color: 0x050b18,
    });
    this.glowPlanet = new THREE.Mesh(planetGeo, planetMat);
    this.glowPlanet.position.set(160, -90, -220);
    this.scene.add(this.glowPlanet);

    // Atmospheric Glow Ring
    const atmoGeo = new THREE.RingGeometry(74, 82, 48);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.position.set(160, -90, -219);
    this.scene.add(atmoMesh);

    // Start render loop
    this.animate();
  }

  private animate = (): void => {
    if (this.isFinished || !this.renderer || !this.scene || !this.camera) return;

    const elapsed = (performance.now() - this.startTime) * 0.001;
    const dt = 0.016;

    // 1. Camera forward hyperspace acceleration
    this.camera.position.z -= dt * (35.0 + elapsed * 45.0);
    this.camera.rotation.z = Math.sin(elapsed * 0.5) * 0.02;

    // 2. Animate Starfield wrap
    if (this.stars) {
      const posAttr = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        // Move stars toward camera
        arr[i * 3 + 2] += dt * 140.0;
        if (arr[i * 3 + 2] > this.camera.position.z + 50) {
          arr[i * 3 + 2] -= 800;
        }
      }
      posAttr.needsUpdate = true;
    }

    // 3. Animate Shooting Stars / Meteors
    if (this.shootingStars && this.shootingStarLines) {
      const posAttr = this.shootingStars.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = this.shootingStarLines;

      for (let i = 0; i < this.shootingStarVelocities.length; i++) {
        const vel = this.shootingStarVelocities[i];
        arr[i * 6] += vel.x * dt;
        arr[i * 6 + 1] += vel.y * dt;
        arr[i * 6 + 2] += vel.z * dt;

        arr[i * 6 + 3] += vel.x * dt;
        arr[i * 6 + 4] += vel.y * dt;
        arr[i * 6 + 5] += vel.z * dt;

        // Reset when shooting star flies out of bounds
        if (arr[i * 6] > 450 || arr[i * 6 + 1] > 300 || arr[i * 6 + 2] < this.camera.position.z - 400) {
          const x = -350 - Math.random() * 200;
          const y = -250 - Math.random() * 150;
          const z = this.camera.position.z + (Math.random() * 300 - 150);
          const len = 50 + Math.random() * 110;

          arr[i * 6] = x;
          arr[i * 6 + 1] = y;
          arr[i * 6 + 2] = z;

          arr[i * 6 + 3] = x - len * 0.7;
          arr[i * 6 + 4] = y - len * 0.4;
          arr[i * 6 + 5] = z + len * 0.5;
        }
      }
      posAttr.needsUpdate = true;
    }

    // 4. Subtle rotation on nebula
    if (this.nebulaCloud) {
      this.nebulaCloud.rotation.z += dt * 0.04;
    }

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(this.animate);
  };

  private finish(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0';
      this.overlayEl.style.pointerEvents = 'none';

      setTimeout(() => {
        if (this.renderer) {
          this.renderer.dispose();
          this.renderer = null;
        }
        if (this.overlayEl && this.overlayEl.parentNode) {
          this.overlayEl.parentNode.removeChild(this.overlayEl);
          this.overlayEl = null;
        }
        if (this.onCompleteCallback) {
          this.onCompleteCallback();
          this.onCompleteCallback = null;
        }
      }, 850);
    } else if (this.onCompleteCallback) {
      this.onCompleteCallback();
      this.onCompleteCallback = null;
    }
  }
}
