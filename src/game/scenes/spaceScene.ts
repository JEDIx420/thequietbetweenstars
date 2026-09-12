import * as THREE from 'three';
import { SurveyCraft } from './spaceCraft';
import { CelestialPhysicsSystem, type CelestialBody } from '../core/celestialPhysics';

export class SpaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group;
  public surveyCraft: SurveyCraft;
  public physics: CelestialPhysicsSystem;

  // Visual components
  private starfieldDeep: THREE.Points;
  private starfieldTwinkle: THREE.Points;

  private dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustCount = 800;
  private dustBoxSize = 300;

  // Celestial bodies
  private sunCore: THREE.Mesh;
  private sunCoronaInner: THREE.Mesh;
  private sunCoronaOuter: THREE.Mesh;
  private sunSpikes: THREE.Mesh;
  private sunLight: THREE.PointLight;

  private planetMesh: THREE.Mesh;
  private planetAtmosphere: THREE.Mesh;
  private ringMesh: THREE.Mesh;

  private moonMesh: THREE.Mesh;

  private nebulaPoints: THREE.Points;
  private scanWave: THREE.Mesh;
  private scanRadius = 0;
  private isScanning = false;

  private clock = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020308, 0.00022);

    // 1. Ambient and Fill Lighting
    const ambient = new THREE.AmbientLight(0x1a2236, 1.4);
    this.scene.add(ambient);

    // Directional celestial key light from sun
    const sunDirLight = new THREE.DirectionalLight(0xfff3d6, 2.2);
    sunDirLight.position.set(1200, 500, -2200);
    this.scene.add(sunDirLight);

    // 2. Multi-layer Parallax Starfield & Nebula
    this.starfieldDeep = this.createDeepStarfield();
    this.scene.add(this.starfieldDeep);

    this.starfieldTwinkle = this.createTwinkleStarfield();
    this.scene.add(this.starfieldTwinkle);

    this.nebulaPoints = this.createCosmicNebula();
    this.scene.add(this.nebulaPoints);

    // 3. Local Cosmic Dust Stream
    const dustObj = this.createCosmicDust();
    this.dustPoints = dustObj.points;
    this.dustPositions = dustObj.positions;
    this.scene.add(this.dustPoints);

    // 4. Celestial Bodies
    const sunData = this.createProceduralSun();
    this.sunCore = sunData.core;
    this.sunCoronaInner = sunData.coronaInner;
    this.sunCoronaOuter = sunData.coronaOuter;
    this.sunSpikes = sunData.spikes;
    this.sunLight = sunData.light;
    this.scene.add(sunData.group);

    const planetData = this.createPlanetAurelia();
    this.planetMesh = planetData.planet;
    this.planetAtmosphere = planetData.atmosphere;
    this.ringMesh = planetData.rings;
    this.scene.add(planetData.group);

    const moonData = this.createMoonZephyr();
    this.moonMesh = moonData.mesh;
    this.scene.add(moonData.group);

    // 5. Survey Craft
    this.surveyCraft = new SurveyCraft();
    this.shipGroup = this.surveyCraft.group;
    this.scene.add(this.shipGroup);

    // 6. Holographic Scan Wave
    this.scanWave = this.createScanWave();
    this.scene.add(this.scanWave);

    // 7. Celestial Physics System setup
    const bodies: CelestialBody[] = [
      {
        id: 'star-solara',
        name: 'Solara',
        type: 'star',
        position: new THREE.Vector3(1200, 500, -2200),
        physicalRadius: 130,
        exclusionRadius: 165,
        atmosphereRadius: 450,
        dangerRadius: 240,
      },
      {
        id: 'planet-aurelia',
        name: 'Aurelia',
        type: 'planet',
        position: new THREE.Vector3(-1000, -300, -1800),
        physicalRadius: 160,
        exclusionRadius: 178,
        atmosphereRadius: 360,
      },
      {
        id: 'moon-zephyr',
        name: 'Zephyr',
        type: 'moon',
        position: new THREE.Vector3(-720, -180, -1550),
        physicalRadius: 42,
        exclusionRadius: 52,
        atmosphereRadius: 110,
      },
    ];

    this.physics = new CelestialPhysicsSystem(bodies);
  }

  private createDeepStarfield(): THREE.Points {
    const starCount = 5000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const colorPalette = [
      new THREE.Color(0xfde68a), // Warm amber (K-type)
      new THREE.Color(0xfef08a), // Pale golden (G-type)
      new THREE.Color(0xffffff), // Pure crystalline white (A-type)
      new THREE.Color(0x93c5fd), // Icy blue (B-type)
      new THREE.Color(0xe9d5ff), // Soft cosmic lavender
      new THREE.Color(0x67e8f9), // Bright cyan
    ];

    for (let i = 0; i < starCount; i++) {
      const radius = 3500 + Math.random() * 3000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      // Natural brightness variance
      const intensity = 0.5 + Math.random() * 0.5;
      colors[i * 3] = color.r * intensity;
      colors[i * 3 + 1] = color.g * intensity;
      colors[i * 3 + 2] = color.b * intensity;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: false,
    });

    return new THREE.Points(geometry, material);
  }

  private createTwinkleStarfield(): THREE.Points {
    const starCount = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const radius = 2800 + Math.random() * 2000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 3.8,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: false,
    });

    return new THREE.Points(geometry, material);
  }

  private createCosmicNebula(): THREE.Points {
    const count = 900;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // Deep space gaseous clusters
    const nebulaColors = [
      new THREE.Color(0x3b82f6), // Deep cobalt blue
      new THREE.Color(0x8b5cf6), // Mystic violet
      new THREE.Color(0x06b6d4), // Cyan nebula dust
      new THREE.Color(0xd946ef), // Warm magenta fringe
    ];

    for (let i = 0; i < count; i++) {
      // Clustered in wide ethereal clouds in distant sectors
      const clusterAngle = (i % 3) * (Math.PI * 2 / 3);
      const spread = 800;
      const centerDist = 4200;

      const cx = Math.cos(clusterAngle) * centerDist;
      const cy = (Math.random() - 0.5) * 1200;
      const cz = Math.sin(clusterAngle) * centerDist;

      positions[i * 3] = cx + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = cy + (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = cz + (Math.random() - 0.5) * spread;

      const c = nebulaColors[i % nebulaColors.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 45.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geometry, material);
  }

  private createCosmicDust(): { points: THREE.Points; positions: Float32Array } {
    const geometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);

    for (let i = 0; i < this.dustCount; i++) {
      this.dustPositions[i * 3] = (Math.random() - 0.5) * this.dustBoxSize;
      this.dustPositions[i * 3 + 1] = (Math.random() - 0.5) * this.dustBoxSize;
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * this.dustBoxSize;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 2.2,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    return { points: new THREE.Points(geometry, material), positions: this.dustPositions };
  }

  private createProceduralSun(): {
    group: THREE.Group;
    core: THREE.Mesh;
    coronaInner: THREE.Mesh;
    coronaOuter: THREE.Mesh;
    spikes: THREE.Mesh;
    light: THREE.PointLight;
  } {
    const group = new THREE.Group();
    group.position.set(1200, 500, -2200);

    // Inner Radiant Core
    const coreGeo = new THREE.SphereGeometry(130, 48, 48);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff7ed, // Radiant white-gold
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Inner Coronal Aura
    const coronaInGeo = new THREE.SphereGeometry(155, 36, 36);
    const coronaInMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24, // Amber-gold
      transparent: true,
      opacity: 0.45,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const coronaInner = new THREE.Mesh(coronaInGeo, coronaInMat);
    group.add(coronaInner);

    // Outer Expansive Coronal Haze
    const coronaOutGeo = new THREE.SphereGeometry(210, 36, 36);
    const coronaOutMat = new THREE.MeshBasicMaterial({
      color: 0xf97316, // Solar orange
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const coronaOuter = new THREE.Mesh(coronaOutGeo, coronaOutMat);
    group.add(coronaOuter);

    // Solar Rays / Spikes
    const spikesGeo = new THREE.RingGeometry(132, 280, 4);
    const spikesMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const spikes = new THREE.Mesh(spikesGeo, spikesMat);
    group.add(spikes);

    // PointLight
    const light = new THREE.PointLight(0xffedd5, 3.2, 7000, 0.4);
    group.add(light);

    return { group, core, coronaInner, coronaOuter, spikes, light };
  }

  private createPlanetAurelia(): {
    group: THREE.Group;
    planet: THREE.Mesh;
    atmosphere: THREE.Mesh;
    rings: THREE.Mesh;
  } {
    const group = new THREE.Group();
    group.position.set(-1000, -300, -1800);

    // 1. Planet Body — Shaded Sphere with subtle procedural texture
    const planetGeo = new THREE.SphereGeometry(160, 64, 48);

    // Create custom procedural banding canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Atmospheric oceanic background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.0, '#1e3a8a'); // Deep polar navy
      grad.addColorStop(0.2, '#2563eb');
      grad.addColorStop(0.35, '#38bdf8'); // Temperate cyan
      grad.addColorStop(0.5, '#60a5fa');  // Equatorial cloud band
      grad.addColorStop(0.65, '#0284c7');
      grad.addColorStop(0.8, '#1e40af');
      grad.addColorStop(1.0, '#172554');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Subtle atmospheric cloud swirls
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      for (let y = 30; y < 230; y += 18) {
        ctx.beginPath();
        ctx.ellipse(256 + Math.sin(y * 0.1) * 40, y, 220 + Math.cos(y * 0.05) * 60, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const planetTex = new THREE.CanvasTexture(canvas);
    planetTex.wrapS = THREE.RepeatWrapping;
    planetTex.wrapT = THREE.ClampToEdgeWrapping;

    const planetMat = new THREE.MeshStandardMaterial({
      map: planetTex,
      roughness: 0.75,
      metalness: 0.1,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    group.add(planet);

    // 2. Atmospheric Rayleigh Limb Glow Shell
    // Creates a luminous cyan atmosphere rim that glows along the horizon
    const atmoGeo = new THREE.SphereGeometry(168, 48, 48);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    group.add(atmosphere);

    // 3. Saturn-Style Majestic Rings with Cassini Division
    const ringGeo = new THREE.RingGeometry(210, 340, 96);
    // Gradient ring material
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xd8b4fe, // Soft lavender
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const rings = new THREE.Mesh(ringGeo, ringMat);
    rings.rotation.x = Math.PI / 2.3;
    rings.rotation.y = 0.12;
    group.add(rings);

    return { group, planet, atmosphere, rings };
  }

  private createMoonZephyr(): { group: THREE.Group; mesh: THREE.Mesh } {
    const group = new THREE.Group();
    group.position.set(-720, -180, -1550);

    const moonGeo = new THREE.SphereGeometry(42, 32, 24);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Crystalline lunar slate
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(moonGeo, moonMat);
    group.add(mesh);

    return { group, mesh };
  }

  private createScanWave(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 36, 18);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return mesh;
  }

  public triggerScan(origin: THREE.Vector3): void {
    this.scanWave.position.copy(origin);
    this.scanRadius = 1;
    this.isScanning = true;
    this.scanWave.visible = true;
  }

  public update(dt: number, shipPos: THREE.Vector3, throttle: number, steeringYaw = 0, steeringPitch = 0): void {
    this.clock += dt;

    // 1. Update Survey Craft visual animations
    this.surveyCraft.update(dt, throttle, steeringYaw, steeringPitch);

    // 2. Solar Corona Multi-harmonic Pulsations & Light shimmer
    const pulse1 = Math.sin(this.clock * 0.7) * 0.035;
    const pulse2 = Math.cos(this.clock * 1.4) * 0.02;
    const coronaScale = 1.0 + pulse1 + pulse2;
    this.sunCoronaInner.scale.set(coronaScale, coronaScale, coronaScale);
    this.sunCoronaOuter.scale.set(1.0 - pulse1 * 0.5, 1.0 - pulse1 * 0.5, 1.0 - pulse1 * 0.5);

    this.sunSpikes.rotation.z += dt * 0.015;
    this.sunCore.rotation.y += dt * 0.004;
    this.sunLight.intensity = 3.2 + Math.sin(this.clock * 2.1) * 0.25;

    // Twinkle starfield material opacity shimmer
    const twinkleMat = this.starfieldTwinkle.material as THREE.PointsMaterial;
    twinkleMat.opacity = 0.65 + Math.sin(this.clock * 3.5) * 0.25;

    // 3. Planetary & Lunar Orbital Rotations & Atmospheric Limb Pulse
    this.planetMesh.rotation.y += dt * 0.018;
    this.planetAtmosphere.rotation.y += dt * 0.022;
    const atmoMat = this.planetAtmosphere.material as THREE.MeshBasicMaterial;
    atmoMat.opacity = 0.35 + Math.sin(this.clock * 0.8) * 0.05;

    this.ringMesh.rotation.z += dt * 0.002;
    this.moonMesh.rotation.y += dt * 0.012;

    // 4. Cosmic Dust Particle Recycling around Ship
    const halfBox = this.dustBoxSize / 2;
    const attr = this.dustPoints.geometry.attributes.position;
    for (let i = 0; i < this.dustCount; i++) {
      let x = this.dustPositions[i * 3];
      let y = this.dustPositions[i * 3 + 1];
      let z = this.dustPositions[i * 3 + 2];

      if (x - shipPos.x > halfBox) x -= this.dustBoxSize;
      else if (x - shipPos.x < -halfBox) x += this.dustBoxSize;

      if (y - shipPos.y > halfBox) y -= this.dustBoxSize;
      else if (y - shipPos.y < -halfBox) y += this.dustBoxSize;

      if (z - shipPos.z > halfBox) z -= this.dustBoxSize;
      else if (z - shipPos.z < -halfBox) z += this.dustBoxSize;

      this.dustPositions[i * 3] = x;
      this.dustPositions[i * 3 + 1] = y;
      this.dustPositions[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;

    // 5. Scan Holographic Pulse Expansion
    if (this.isScanning) {
      this.scanRadius += dt * 160;
      this.scanWave.scale.set(this.scanRadius, this.scanRadius, this.scanRadius);

      const maxScanRadius = 220;
      const progress = this.scanRadius / maxScanRadius;
      const mat = this.scanWave.material as THREE.MeshBasicMaterial;

      if (progress >= 1) {
        this.isScanning = false;
        this.scanWave.visible = false;
        mat.opacity = 0;
      } else {
        mat.opacity = (1 - progress) * 0.75;
      }
    }
  }
}
