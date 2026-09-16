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
  private isHyperspaceJump = false;
  private warpStartTime = 0;
  private onCompleteCallback: (() => void) | null = null;

  // Visual objects (Zero-CPU-mutation GPU hierarchy)
  private starLayers: THREE.Points[] = [];
  private shootingStarsGroup: THREE.Group | null = null;
  private shootingStarMeshes: THREE.Line[] = [];
  private nebulaCloud: THREE.Points | null = null;
  private glowPlanet: THREE.Mesh | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
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
      contain: strict;
      transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1);
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
      contain: layout style;
    `;

    contentEl.innerHTML = `
      <style>
        @keyframes cinemaGlow {
          0% {
            opacity: 0;
            transform: scale(0.88) translateY(10px);
          }
          35% {
            opacity: 1;
            transform: scale(1.02) translateY(0);
          }
          85% {
            opacity: 1;
            transform: scale(1.0) translateY(0);
          }
          100% {
            opacity: 0.92;
            transform: scale(1.0) translateY(0);
          }
        }

        @keyframes flarePulse {
          0% { transform: scaleX(0.1); opacity: 0; }
          40% { transform: scaleX(1.0); opacity: 0.95; }
          80% { transform: scaleX(0.95); opacity: 0.7; }
          100% { transform: scaleX(0.9); opacity: 0.4; }
        }

        @keyframes badgeReveal {
          0% { opacity: 0; transform: translateY(-8px); }
          50% { opacity: 0.5; }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes subReveal {
          0% { opacity: 0; transform: translateY(10px); }
          45% { opacity: 0; }
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
        width: 100vw;
        height: 2px;
        background: linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.25) 25%, rgba(255, 255, 255, 0.95) 50%, rgba(56, 189, 248, 0.25) 75%, transparent 100%);
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.8);
        animation: flarePulse 3.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        will-change: transform, opacity;
      "></div>

      <!-- Sector Mandate Badge -->
      <div style="
        font-family: ui-monospace, monospace;
        font-size: clamp(10px, 1.4vw, 13px);
        font-weight: 700;
        letter-spacing: 0.28em;
        color: #38bdf8;
        text-transform: uppercase;
        margin-bottom: 14px;
        animation: badgeReveal 2.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        will-change: transform, opacity;
      ">
        ◈ DEEP SPACE EXPLORATION DIVISION ◈
      </div>

      <!-- Main Title -->
      <div style="
        font-size: clamp(26px, 6.2vw, 64px);
        font-weight: 200;
        letter-spacing: 0.35em;
        text-transform: uppercase;
        color: #f8fafc;
        text-shadow: 0 0 25px rgba(56, 189, 248, 0.8), 0 0 50px rgba(14, 165, 233, 0.4);
        animation: cinemaGlow 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        line-height: 1.25;
        white-space: nowrap;
        will-change: transform, opacity;
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
        animation: subReveal 3.0s ease-out forwards;
        will-change: transform, opacity;
      ">
        A Peaceful Space Odyssey
      </div>

      <!-- Begin Journey Prompt -->
      <div id="intro-begin-prompt" style="
        position: fixed;
        bottom: 34px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-family: ui-monospace, monospace;
        letter-spacing: 0.26em;
        text-transform: uppercase;
        animation: skipBlink 2.2s infinite ease-in-out;
        cursor: pointer;
        pointer-events: auto;
      ">
        <div style="
          font-size: clamp(11px, 1.4vw, 13px);
          font-weight: 600;
          color: #f8fafc;
          letter-spacing: 0.28em;
          text-shadow: 0 0 16px rgba(56, 189, 248, 0.8), 0 0 32px rgba(14, 165, 233, 0.5);
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          PRESS [SPACE] OR [ENTER] TO BEGIN
        </div>
        <div style="font-size: 10px; color: #64748b; letter-spacing: 0.22em;">
          OR CLICK ANYWHERE
        </div>
      </div>
    `;

    contentEl.id = 'title-reveal-content';
    this.overlayEl.appendChild(contentEl);
    this.container.appendChild(this.overlayEl);

    // Initialize 3D Space Scene
    this.init3D();

    // Event listeners for fast hyperspace transition to title screen
    const onTrigger = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerHyperspaceTransition();
    };

    this.overlayEl.addEventListener('click', onTrigger, { once: true });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        this.triggerHyperspaceTransition();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private init3D(): void {
    if (!this.canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2500);
    this.camera.position.set(0, 0, 100);

    // 1. Chunk-Shifted Starfield Layers (Zero CPU vertex buffer uploads)
    // 3 distinct layers distributed at Z: 0, -600, -1200
    const layerCount = 3;
    const starsPerLayer = 700;
    this.starLayers = [];

    for (let l = 0; l < layerCount; l++) {
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(starsPerLayer * 3);
      const starColors = new Float32Array(starsPerLayer * 3);

      for (let i = 0; i < starsPerLayer; i++) {
        starPos[i * 3] = (Math.random() - 0.5) * 800;
        starPos[i * 3 + 1] = (Math.random() - 0.5) * 600;
        starPos[i * 3 + 2] = (Math.random() - 0.5) * 600;

        const isCyan = Math.random() > 0.45;
        starColors[i * 3] = isCyan ? 0.22 : 1.0;
        starColors[i * 3 + 1] = isCyan ? 0.74 : 0.95;
        starColors[i * 3 + 2] = 1.0;
      }

      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

      const starMat = new THREE.PointsMaterial({
        size: 2.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
      });

      const points = new THREE.Points(starGeo, starMat);
      points.position.z = -l * 600;
      this.starLayers.push(points);
      this.scene.add(points);
    }

    // 2. High-Speed Shooting Stars Group (Transformed objects, zero buffer rebuilds)
    const meteorCount = 10;
    this.shootingStarsGroup = new THREE.Group();
    this.shootingStarMeshes = [];

    const meteorMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < meteorCount; i++) {
      const len = 40 + Math.random() * 70;
      // Head to tail in local space
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-len * 0.7, -len * 0.4, len * 0.5),
      ]);

      const line = new THREE.Line(lineGeo, meteorMat);
      const spd = 280 + Math.random() * 320;
      line.userData = {
        vel: new THREE.Vector3(spd * 0.7, spd * 0.4, -spd * 0.5),
        boundaryX: 450,
      };

      // Random initial position
      line.position.set(
        -300 + Math.random() * 600,
        -200 + Math.random() * 400,
        Math.random() * 300 - 150
      );

      this.shootingStarMeshes.push(line);
      this.shootingStarsGroup.add(line);
    }
    this.scene.add(this.shootingStarsGroup);

    // 3. Ethereal Cosmic Nebula Cloud (Lightweight 180 points)
    const nebCount = 180;
    const nebGeo = new THREE.BufferGeometry();
    const nebPos = new Float32Array(nebCount * 3);
    const nebCol = new Float32Array(nebCount * 3);

    for (let i = 0; i < nebCount; i++) {
      nebPos[i * 3] = (Math.random() - 0.5) * 600;
      nebPos[i * 3 + 1] = (Math.random() - 0.5) * 450;
      nebPos[i * 3 + 2] = (Math.random() - 0.5) * 350;

      const isViolet = i % 2 === 0;
      nebCol[i * 3] = isViolet ? 0.45 : 0.08;
      nebCol[i * 3 + 1] = isViolet ? 0.12 : 0.60;
      nebCol[i * 3 + 2] = 0.92;
    }

    nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPos, 3));
    nebGeo.setAttribute('color', new THREE.BufferAttribute(nebCol, 3));
    const nebMat = new THREE.PointsMaterial({
      size: 26.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.nebulaCloud = new THREE.Points(nebGeo, nebMat);
    this.scene.add(this.nebulaCloud);

    // 4. Distant Glowing Planet Silhouette with Atmospheric Rim
    const planetGeo = new THREE.SphereGeometry(70, 24, 24);
    const planetMat = new THREE.MeshBasicMaterial({ color: 0x050b18 });
    this.glowPlanet = new THREE.Mesh(planetGeo, planetMat);
    this.glowPlanet.position.set(150, -80, -220);
    this.scene.add(this.glowPlanet);

    // Atmospheric Rim
    const atmoGeo = new THREE.RingGeometry(69, 76, 32);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.position.set(150, -80, -219);
    this.scene.add(atmoMesh);

    // Start 60fps render loop
    this.animate();
  }

  private animate = (): void => {
    if (this.isFinished || !this.renderer || !this.scene || !this.camera) return;

    const elapsed = (performance.now() - this.startTime) * 0.001;
    const dt = 0.016;

    // 1. Camera forward hyperspace acceleration
    let forwardSpeed = Math.min(75.0, 35.0 + elapsed * 8.0);
    if (this.isHyperspaceJump) {
      const warpProgress = Math.min(1.0, (performance.now() - this.warpStartTime) / 380);
      forwardSpeed = 250.0 + warpProgress * 2400.0;
    }

    this.camera.position.z -= dt * forwardSpeed;
    this.camera.rotation.z = Math.sin(elapsed * 0.6) * 0.015;

    // 2. Animate Starfield Layers via Group Translation (ZERO vertex buffer uploads)
    for (let i = 0; i < this.starLayers.length; i++) {
      const layer = this.starLayers[i];
      // If camera has passed layer, cycle layer forward
      if (layer.position.z > this.camera.position.z + 100) {
        layer.position.z -= 1800;
      }
    }

    // 3. Animate Shooting Stars via Object Translation (ZERO buffer mutations)
    const speedMult = this.isHyperspaceJump ? 3.5 : 1.0;
    for (let i = 0; i < this.shootingStarMeshes.length; i++) {
      const streak = this.shootingStarMeshes[i];
      const vel = streak.userData.vel as THREE.Vector3;
      streak.position.addScaledVector(vel, dt * speedMult);

      // Boundary reset
      if (streak.position.x > streak.userData.boundaryX || streak.position.z < this.camera.position.z - 350) {
        streak.position.set(
          -380 - Math.random() * 150,
          -220 - Math.random() * 120,
          this.camera.position.z + (Math.random() * 250 - 100)
        );
      }
    }

    // 4. Subtle rotation on nebula
    if (this.nebulaCloud) {
      this.nebulaCloud.rotation.z += dt * (this.isHyperspaceJump ? 0.2 : 0.03);
    }

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(this.animate);
  };

  private triggerHyperspaceTransition(): void {
    if (this.isFinished || this.isHyperspaceJump) return;
    this.isHyperspaceJump = true;
    this.warpStartTime = performance.now();

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    // 1. Fast text scaling and dissolve (260ms)
    const contentEl = this.overlayEl?.querySelector('#title-reveal-content') as HTMLElement;
    if (contentEl) {
      contentEl.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s ease';
      contentEl.style.transform = 'scale(1.22)';
      contentEl.style.opacity = '0';
    }

    // 2. Anamorphic Warp Flash beam
    if (this.overlayEl) {
      const warpFlash = document.createElement('div');
      warpFlash.style.cssText = `
        position: absolute;
        inset: 0;
        z-index: 40;
        pointer-events: none;
        background: radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0%, rgba(56, 189, 248, 0.65) 30%, rgba(2, 6, 23, 0) 75%);
        opacity: 0;
        transform: scale(0.6);
        transition: opacity 0.15s ease-out, transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      `;
      this.overlayEl.appendChild(warpFlash);
      requestAnimationFrame(() => {
        warpFlash.style.opacity = '1';
        warpFlash.style.transform = 'scale(1.4)';
      });
    }

    // 3. Mount title screen at warp peak (~160ms)
    setTimeout(() => {
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
        this.onCompleteCallback = null;
      }
    }, 160);

    // 4. Fade out entire overlay
    setTimeout(() => {
      if (this.overlayEl) {
        this.overlayEl.style.transition = 'opacity 0.22s ease-out';
        this.overlayEl.style.opacity = '0';
        this.overlayEl.style.pointerEvents = 'none';
      }
    }, 180);

    // 5. Clean up WebGL resources and remove from DOM
    setTimeout(() => {
      this.finish();
    }, 400);
  }

  private finish(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Deep clean Three.js resources
    if (this.scene) {
      this.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
      this.scene.clear();
      this.scene = null;
    }

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
  }
}
