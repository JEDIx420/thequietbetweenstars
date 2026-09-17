import * as THREE from 'three';
import { SurveyCraft } from './spaceCraft';
import { CelestialPhysicsSystem, type CelestialBody } from '../core/celestialPhysics';
import { InfiniteBackground } from '../universe/InfiniteBackground';
import { PlanetVisualGenerator } from '../planets/PlanetVisualGenerator';
import { PlanetEnvironmentGenerator } from '../planets/PlanetEnvironmentProfile';
import type { PlanetDescriptor, StarSystemDescriptor, StarDescriptor } from '../systems/PlanetDescriptor';
import { CourierPod } from '../flight/CourierPod';
import { SpaceTrafficDirector } from './SpaceTrafficDirector';
import { SpaceEncounterManager } from './SpaceEncounterManager';

export class SpaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group; // Aliased to shipPhysicsRoot for external access
  public shipPhysicsRoot: THREE.Group;
  public shipVisualRoot: THREE.Group;
  public surveyCraft: SurveyCraft;
  public physics: CelestialPhysicsSystem;
  public infiniteBackground: InfiniteBackground;

  public backgroundRoot: THREE.Group;
  public worldRoot: THREE.Group;
  public shipRoot: THREE.Group;

  // Active Courier Pod in current system
  public activeCourierPod: CourierPod | null = null;

  // Space Traffic & Cosmic Encounters
  public trafficDirector: SpaceTrafficDirector | null = null;
  public encounterManager: SpaceEncounterManager | null = null;
  public lastCommsHail: string | null = null;

  // Local velocity motes
  private dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustCount = 800;
  private dustBoxSize = 300;
  private lastDustShipPos = new THREE.Vector3(999999, 999999, 999999);

  // Solar illumination & corona
  public sunGroup: THREE.Group;
  public sunDirLight: THREE.DirectionalLight;
  public sunPos = new THREE.Vector3(1200, 500, -2200);
  private sunCore: THREE.Mesh;
  private sunSurfaceTexture: THREE.CanvasTexture | null = null;
  private sunCoronaInner: THREE.Sprite;
  private sunCoronaOuter: THREE.Sprite;
  private sunFlares: THREE.Sprite;
  private sunLight: THREE.PointLight;
  private currentStarRadius = 130;

  // Primary System Planets (Aurelia & Zephyr)
  public aureliaDescriptor: PlanetDescriptor;
  public zephyrDescriptor: PlanetDescriptor;
  public activePlanetList: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }> = [];

  public aureliaGroup: THREE.Group;
  private planetAureliaMesh: THREE.Mesh;
  private atmosphereAureliaMesh: THREE.Mesh | null;
  private ringAureliaMesh: THREE.Mesh | null;
  private cloudAureliaMesh: THREE.Mesh | null;
  public planetAureliaPos = new THREE.Vector3(-1000, -300, -1800);

  public zephyrGroup: THREE.Group;
  private moonZephyrMesh: THREE.Mesh;
  public moonZephyrPos = new THREE.Vector3(-720, -180, -1550);

  private scanWave: THREE.Mesh;
  private scanRadius = 0;
  private isScanning = false;
  private clock = 0;

  // Warp hyperspace effects
  // Warp hyperspace effects
  public warpFactor = 0;
  public warpHeading?: THREE.Vector3;
  public warpTunnelGroup = new THREE.Group();
  private warpStreakSegments: THREE.LineSegments;
  private warpStreakGeo: THREE.BufferGeometry;
  private warpStreakPositions: Float32Array;
  private warpStreakData: Array<{ baseRadius: number; baseAngle: number; length: number; zOffset: number; speed: number }> = [];
  private warpStreakMat: THREE.LineBasicMaterial;
  private warpShroudMesh: THREE.Mesh;

  // Static scratch vectors & texture caches
  private static readonly scratchForward = new THREE.Vector3(0, 0, -1);
  private static readonly scratchHeading = new THREE.Vector3();
  private static solarSurfaceTexCache: Map<string, THREE.CanvasTexture> = new Map();
  private static solarInnerCoronaCache: Map<number, THREE.CanvasTexture> = new Map();
  private static solarOuterCoronaCache: Map<number, THREE.CanvasTexture> = new Map();
  private static solarFlareCache: Map<number, THREE.CanvasTexture> = new Map();

  // Active Loaded Star System
  public currentSystem: StarSystemDescriptor | null = null;
  public planetGroups: THREE.Group[] = [];
  public planetMeshes: Array<{ mesh: THREE.Mesh; cloud?: THREE.Mesh | null; atmo?: THREE.Mesh | null; ring?: THREE.Mesh | null }> = [];

  constructor() {
    this.scene = new THREE.Scene();

    // Establish explicit 3-tier coordinate architecture:
    // Scene
    // ├── backgroundRoot (camera-relative / never world-rebased)
    // ├── worldRoot      (stars, planets, lights, cosmic particles)
    // └── shipRoot       (player craft, scan wave)
    this.backgroundRoot = new THREE.Group();
    this.worldRoot = new THREE.Group();
    this.shipRoot = new THREE.Group();

    this.scene.add(this.backgroundRoot);
    this.scene.add(this.worldRoot);
    this.scene.add(this.shipRoot);

    // 1. Camera-Centered Infinite Star & Nebula Background
    this.infiniteBackground = new InfiniteBackground();
    this.backgroundRoot.add(this.infiniteBackground.group);

    // Relativistic Hyperspace Warp Tunnel (batched single LineSegments draw call)
    this.warpStreakMat = new THREE.LineBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const streakCount = 64;
    this.warpStreakPositions = new Float32Array(streakCount * 6);
    this.warpStreakData = [];

    for (let i = 0; i < streakCount; i++) {
      const r = 12 + Math.random() * 55;
      const angle = Math.random() * Math.PI * 2;
      const length = 50 + Math.random() * 140;
      const zOffset = (Math.random() - 0.5) * 800;
      const speed = 900 + Math.random() * 1400;

      this.warpStreakData.push({
        baseRadius: r,
        baseAngle: angle,
        length,
        zOffset,
        speed,
      });

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      const idx = i * 6;
      this.warpStreakPositions[idx] = x;
      this.warpStreakPositions[idx + 1] = y;
      this.warpStreakPositions[idx + 2] = zOffset;
      this.warpStreakPositions[idx + 3] = x;
      this.warpStreakPositions[idx + 4] = y;
      this.warpStreakPositions[idx + 5] = zOffset - length;
    }

    this.warpStreakGeo = new THREE.BufferGeometry();
    this.warpStreakGeo.setAttribute('position', new THREE.BufferAttribute(this.warpStreakPositions, 3));
    this.warpStreakSegments = new THREE.LineSegments(this.warpStreakGeo, this.warpStreakMat);
    this.warpTunnelGroup.add(this.warpStreakSegments);

    const shroudGeo = new THREE.CylinderGeometry(30, 30, 800, 16, 1, true);
    shroudGeo.rotateX(Math.PI / 2);
    const shroudMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    this.warpShroudMesh = new THREE.Mesh(shroudGeo, shroudMat);
    this.warpTunnelGroup.add(this.warpShroudMesh);

    this.warpTunnelGroup.visible = false;
    this.backgroundRoot.add(this.warpTunnelGroup);

    // 2. Ambient and Key Directional Lighting
    const ambient = new THREE.AmbientLight(0x1a2236, 1.4);
    this.worldRoot.add(ambient);

    this.sunDirLight = new THREE.DirectionalLight(0xfff3d6, 2.2);
    this.sunDirLight.position.copy(this.sunPos);
    this.worldRoot.add(this.sunDirLight);

    // 3. Local Space Velocity Dust Particles
    const dustObj = this.createCosmicDust();
    this.dustPoints = dustObj.points;
    this.dustPositions = dustObj.positions;
    this.worldRoot.add(this.dustPoints);

    // 4. Primary Star Solara
    const sunData = this.createProceduralSun();
    this.sunGroup = sunData.group;
    this.sunCore = sunData.core;
    this.sunCoronaInner = sunData.coronaInner;
    this.sunCoronaOuter = sunData.coronaOuter;
    this.sunFlares = sunData.flares;
    this.sunLight = sunData.light;
    this.worldRoot.add(this.sunGroup);

    // 5. Procedurally Generated Planet Aurelia (Temperate-Terrestrial Profile)
    const aureliaProfile = PlanetEnvironmentGenerator.generateProfile(42077, 'G');
    this.aureliaDescriptor = {
      id: 'planet-aurelia',
      seed: 42077,
      name: 'Aurelia',
      type: aureliaProfile.family,
      radius: 160,
      gravity: aureliaProfile.gravity,
      hasAtmosphere: aureliaProfile.atmosphere.hasAtmosphere,
      atmosphereDensity: aureliaProfile.atmosphere.density,
      temperatureKelvin: aureliaProfile.temperatureKelvin,
      surfacePressureAtm: aureliaProfile.surfacePressureAtm,
      oceanCoverage: aureliaProfile.oceanCoverage,
      cloudCoverage: aureliaProfile.cloudCoverage,
      biosignature: aureliaProfile.biosignature,
      hasRings: aureliaProfile.hasRings,
      moonsCount: 1,
      palette: {
        primary: aureliaProfile.palette.surfaceMidland,
        secondary: aureliaProfile.palette.surfaceHighland,
        ocean: aureliaProfile.terrain.hasLiquid ? aureliaProfile.palette.surfaceLowland : undefined,
        atmosphereGlow: aureliaProfile.palette.atmosphereGlow,
        cloudColor: aureliaProfile.palette.cloudColor,
        ringColor: aureliaProfile.palette.ringColor,
      },
      shortDescription: aureliaProfile.description,
      isLandable: aureliaProfile.isLandable,
      profile: aureliaProfile,
    };

    const aureliaVisual = PlanetVisualGenerator.createPlanetMesh(this.aureliaDescriptor);
    this.aureliaGroup = aureliaVisual.group;
    this.aureliaGroup.position.copy(this.planetAureliaPos);
    this.planetAureliaMesh = aureliaVisual.planetMesh;
    this.atmosphereAureliaMesh = aureliaVisual.atmosphereMesh;
    this.ringAureliaMesh = aureliaVisual.ringMesh;
    this.cloudAureliaMesh = aureliaVisual.cloudMesh;
    this.worldRoot.add(this.aureliaGroup);

    // 6. Procedurally Generated Moon Zephyr (Barren-Moon Profile)
    const zephyrProfile = PlanetEnvironmentGenerator.generateProfile(8812, 'G');
    this.zephyrDescriptor = {
      id: 'moon-zephyr',
      seed: 8812,
      name: 'Zephyr',
      type: zephyrProfile.family,
      radius: 42,
      gravity: zephyrProfile.gravity,
      hasAtmosphere: zephyrProfile.atmosphere.hasAtmosphere,
      atmosphereDensity: zephyrProfile.atmosphere.density,
      temperatureKelvin: zephyrProfile.temperatureKelvin,
      surfacePressureAtm: zephyrProfile.surfacePressureAtm,
      oceanCoverage: zephyrProfile.oceanCoverage,
      cloudCoverage: zephyrProfile.cloudCoverage,
      biosignature: zephyrProfile.biosignature,
      hasRings: zephyrProfile.hasRings,
      moonsCount: 0,
      palette: {
        primary: zephyrProfile.palette.surfaceMidland,
        secondary: zephyrProfile.palette.surfaceHighland,
        atmosphereGlow: zephyrProfile.palette.atmosphereGlow,
        cloudColor: zephyrProfile.palette.cloudColor,
      },
      shortDescription: zephyrProfile.description,
      isLandable: zephyrProfile.isLandable,
      profile: zephyrProfile,
    };

    const zephyrVisual = PlanetVisualGenerator.createPlanetMesh(this.zephyrDescriptor);
    this.zephyrGroup = zephyrVisual.group;
    this.zephyrGroup.position.copy(this.moonZephyrPos);
    this.moonZephyrMesh = zephyrVisual.planetMesh;
    this.worldRoot.add(this.zephyrGroup);

    this.activePlanetList = [
      { descriptor: this.aureliaDescriptor, position: this.planetAureliaPos },
      { descriptor: this.zephyrDescriptor, position: this.moonZephyrPos },
    ];

    // 7. Survey Spacecraft & Explicit Transform Hierarchy
    // shipPhysicsRoot (position, physical quaternion)
    // └── shipVisualRoot (visual banking tilt)
    //     └── surveyCraft.group (internal mesh animations only)
    this.shipPhysicsRoot = new THREE.Group();
    this.shipVisualRoot = new THREE.Group();
    this.surveyCraft = new SurveyCraft();

    this.shipVisualRoot.add(this.surveyCraft.group);
    this.shipPhysicsRoot.add(this.shipVisualRoot);
    this.shipGroup = this.shipPhysicsRoot;
    this.shipRoot.add(this.shipPhysicsRoot);

    // 8. Holographic Scanner Pulse
    this.scanWave = this.createScanWave();
    this.shipRoot.add(this.scanWave);

    // 9. Celestial Safety Physics Shells
    const bodies: CelestialBody[] = [
      {
        id: 'star-solara',
        name: 'Solara',
        type: 'star',
        position: this.sunPos,
        physicalRadius: 130,
        exclusionRadius: 165,
        atmosphereRadius: 450,
        dangerRadius: 240,
      },
      {
        id: 'planet-aurelia',
        name: 'Aurelia',
        type: 'planet',
        position: this.planetAureliaPos,
        physicalRadius: 160,
        exclusionRadius: 178,
        atmosphereRadius: 360,
      },
      {
        id: 'moon-zephyr',
        name: 'Zephyr',
        type: 'moon',
        position: this.moonZephyrPos,
        physicalRadius: 42,
        exclusionRadius: 52,
        atmosphereRadius: 110,
      },
    ];

    this.physics = new CelestialPhysicsSystem(bodies);
    this.initSystemTrafficAndEncounters(1337, [this.planetAureliaPos, this.moonZephyrPos]);
  }

  private initSystemTrafficAndEncounters(seed: number, planetPositions: THREE.Vector3[]): void {
    if (this.trafficDirector) {
      this.worldRoot.remove(this.trafficDirector.group);
      this.trafficDirector.dispose();
      this.trafficDirector = null;
    }
    if (this.encounterManager) {
      this.worldRoot.remove(this.encounterManager.group);
      this.encounterManager.dispose();
      this.encounterManager = null;
    }

    this.trafficDirector = new SpaceTrafficDirector(seed, this.sunPos, planetPositions);
    this.worldRoot.add(this.trafficDirector.group);

    this.encounterManager = new SpaceEncounterManager(seed, this.sunPos, planetPositions);
    this.worldRoot.add(this.encounterManager.group);
  }

  /**
   * Properly traverses and disposes previous planet meshes, materials, and ring geometries.
   */
  private disposePlanetMeshes(): void {
    for (const group of this.planetGroups) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          // Dispose unique ring geometries (unit spheres are shared static singletons)
          if (obj.geometry instanceof THREE.RingGeometry) {
            obj.geometry.dispose();
          }
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      this.worldRoot.remove(group);
    }
    this.planetGroups = [];
    this.planetMeshes = [];
  }

  /**
   * Loads a procedural star system into the 3D space scene.
   * Cleans up any previously loaded planet groups, builds new planet meshes,
   * generates orbital distances, sets up celestial physics and lighting.
   */
  public loadSystem(system: StarSystemDescriptor): void {
    this.currentSystem = system;

    // 1. Remove and cleanly dispose previous dynamic planet groups from worldRoot
    this.disposePlanetMeshes();
    this.activePlanetList = [];

    // 2. Hide or show origin system meshes (Aurelia & Zephyr)
    const isOrigin = system.sectorX === 0 && system.sectorY === 0 && system.sectorZ === 0;
    if (isOrigin) {
      this.aureliaGroup.visible = true;
      this.zephyrGroup.visible = true;
      this.activePlanetList = [
        { descriptor: this.aureliaDescriptor, position: this.planetAureliaPos },
        { descriptor: this.zephyrDescriptor, position: this.moonZephyrPos },
      ];
    } else {
      this.aureliaGroup.visible = false;
      this.zephyrGroup.visible = false;

      // 3. Generate 3D planet meshes and orbital positions for target system
      const planetCount = system.planets.length;
      for (let i = 0; i < planetCount; i++) {
        const pDesc = system.planets[i];
        const visual = PlanetVisualGenerator.createPlanetMesh(pDesc);

        // Distribute planets in broad orbital arcs around the system center
        const angle = (i / Math.max(1, planetCount)) * Math.PI * 2 + 0.4;
        const orbitDist = 900 + i * 550;
        const planetPos = new THREE.Vector3(
          Math.cos(angle) * orbitDist,
          (Math.sin(angle * 2) * 120),
          Math.sin(angle) * orbitDist - 1200
        );

        visual.group.position.copy(planetPos);
        this.worldRoot.add(visual.group);
        this.planetGroups.push(visual.group);
        this.planetMeshes.push({
          mesh: visual.planetMesh,
          cloud: visual.cloudMesh,
          atmo: visual.atmosphereMesh,
          ring: visual.ringMesh,
        });

        this.activePlanetList.push({
          descriptor: pDesc,
          position: planetPos,
        });
      }
    }

    // 4. Update Celestial Physics Bodies
    const bodies: CelestialBody[] = [
      {
        id: `star-${system.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: system.star.name,
        type: 'star',
        position: this.sunPos,
        physicalRadius: system.star.radius || 130,
        exclusionRadius: (system.star.radius || 130) * 1.25,
        atmosphereRadius: (system.star.radius || 130) * 2.5,
      },
    ];

    for (const p of this.activePlanetList) {
      bodies.push({
        id: `planet-${p.descriptor.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: p.descriptor.name,
        type: (p.descriptor as any).isMoon ? 'moon' : 'planet',
        position: p.position,
        physicalRadius: p.descriptor.radius || 120,
        exclusionRadius: (p.descriptor.radius || 120) * 1.15,
        atmosphereRadius: p.descriptor.atmosphereDensity > 0 ? (p.descriptor.radius || 120) * 1.8 : (p.descriptor.radius || 120) * 1.15,
      });
    }

    if (this.physics) {
      this.physics.setBodies(bodies);
    } else {
      this.physics = new CelestialPhysicsSystem(bodies);
    }

    // 5. Update Star Color, Corona & Illumination
    if (system.star) {
      this.updateStarVisuals(system.star);
    }

    // 6. Initialize ambient space traffic and cosmic encounters for this system
    const planetPositions = this.activePlanetList.map(p => p.position);
    this.initSystemTrafficAndEncounters(system.seed || 1337, planetPositions);
  }

  /**
   * Floating-origin rebase handler
   * Shifts all celestial bodies, physics envelopes, lights, and particles by offset.
   */
  public onRebase(offset: THREE.Vector3): void {
    // 1. Shift celestial 3D groups directly
    this.sunGroup.position.add(offset);
    this.sunDirLight.position.add(offset);
    this.aureliaGroup.position.add(offset);
    this.zephyrGroup.position.add(offset);

    for (const group of this.planetGroups) {
      group.position.add(offset);
    }

    // 2. Shift logical positions for approach controller and physics
    this.sunPos.add(offset);
    this.planetAureliaPos.add(offset);
    this.moonZephyrPos.add(offset);

    for (const body of this.physics.bodies) {
      body.position.add(offset);
    }
    for (const planet of this.activePlanetList) {
      planet.position.add(offset);
    }

    // 3. Shift local dust particle positions
    const attr = this.dustPoints.geometry.attributes.position;
    for (let i = 0; i < this.dustCount; i++) {
      this.dustPositions[i * 3] += offset.x;
      this.dustPositions[i * 3 + 1] += offset.y;
      this.dustPositions[i * 3 + 2] += offset.z;
    }
    attr.needsUpdate = true;

    if (this.activeCourierPod) {
      this.activeCourierPod.position.add(offset);
      this.activeCourierPod.group.position.add(offset);
    }

    if (this.trafficDirector) {
      this.trafficDirector.onRebase(offset);
    }
    if (this.encounterManager) {
      this.encounterManager.onRebase(offset);
    }
  }

  public spawnCourierPod(order: any, spawnPos: THREE.Vector3): CourierPod {
    if (this.activeCourierPod) {
      this.worldRoot.remove(this.activeCourierPod.group);
    }
    this.activeCourierPod = new CourierPod(order, spawnPos);
    this.worldRoot.add(this.activeCourierPod.group);
    return this.activeCourierPod;
  }

  public removeCourierPod(): void {
    if (this.activeCourierPod) {
      this.worldRoot.remove(this.activeCourierPod.group);
      this.activeCourierPod = null;
    }
  }

  private createSolarSurfaceTexture(lightColorHex: number, coronaColorHex: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const lightCol = new THREE.Color(lightColorHex);
    const coronaCol = new THREE.Color(coronaColorHex);

    // 1. Base solar plasma background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 256);
    bgGrad.addColorStop(0, coronaCol.getStyle());
    bgGrad.addColorStop(0.25, '#ffffff');
    bgGrad.addColorStop(0.5, lightCol.getStyle());
    bgGrad.addColorStop(0.75, '#ffffff');
    bgGrad.addColorStop(1, coronaCol.getStyle());
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 256);

    // 2. High-density convective plasma granules
    for (let i = 0; i < 360; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const r = 5 + Math.random() * 18;
      const radGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      radGrad.addColorStop(0, '#ffffff');
      radGrad.addColorStop(0.35, lightCol.getStyle());
      radGrad.addColorStop(0.75, coronaCol.getStyle());
      radGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Turbulent magnetic filaments
    ctx.lineWidth = 2.5;
    for (let j = 0; j < 30; j++) {
      const y = Math.random() * 256;
      ctx.strokeStyle = Math.random() > 0.45 ? '#ffffff' : coronaCol.getStyle();
      ctx.globalAlpha = 0.25 + Math.random() * 0.35;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 16);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  private createInnerCoronaTexture(coronaColorHex: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const coronaCol = new THREE.Color(coronaColorHex);
    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    // Smooth, radiant limb: white-hot core transitioning into rich corona glow
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.28, '#ffffff');
    grad.addColorStop(0.44, coronaCol.getStyle());
    grad.addColorStop(0.68, `rgba(${Math.round(coronaCol.r * 255)}, ${Math.round(coronaCol.g * 255)}, ${Math.round(coronaCol.b * 255)}, 0.4)`);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    return new THREE.CanvasTexture(canvas);
  }

  private createOuterCoronaTexture(coronaColorHex: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const coronaCol = new THREE.Color(coronaColorHex);
    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grad.addColorStop(0, `rgba(${Math.round(coronaCol.r * 255)}, ${Math.round(coronaCol.g * 255)}, ${Math.round(coronaCol.b * 255)}, 0.55)`);
    grad.addColorStop(0.35, `rgba(${Math.round(coronaCol.r * 255)}, ${Math.round(coronaCol.g * 255)}, ${Math.round(coronaCol.b * 255)}, 0.25)`);
    grad.addColorStop(0.70, `rgba(${Math.round(coronaCol.r * 255)}, ${Math.round(coronaCol.g * 255)}, ${Math.round(coronaCol.b * 255)}, 0.08)`);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    return new THREE.CanvasTexture(canvas);
  }

  private createSolarFlareTexture(coronaColorHex: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const coronaCol = new THREE.Color(coronaColorHex);
    ctx.clearRect(0, 0, 512, 512);

    // Central soft glow
    const centerGrad = ctx.createRadialGradient(256, 256, 0, 256, 256, 70);
    centerGrad.addColorStop(0, '#ffffff');
    centerGrad.addColorStop(0.45, coronaCol.getStyle());
    centerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(256, 256, 70, 0, Math.PI * 2);
    ctx.fill();

    // 8 soft radial optical diffraction rays (no harsh polygon edges)
    const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
    for (const angle of angles) {
      ctx.save();
      ctx.translate(256, 256);
      ctx.rotate(angle);

      const isPrimary = angle === 0 || angle === Math.PI / 2;
      const rayLength = isPrimary ? 250 : 185;
      const rayWidth = isPrimary ? 8 : 4.5;

      const grad = ctx.createLinearGradient(0, 0, rayLength, 0);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.18, coronaCol.getStyle());
      grad.addColorStop(0.65, `rgba(${Math.round(coronaCol.r * 255)}, ${Math.round(coronaCol.g * 255)}, ${Math.round(coronaCol.b * 255)}, 0.15)`);
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.fillRect(0, -rayWidth / 2, rayLength, rayWidth);

      const gradNeg = ctx.createLinearGradient(0, 0, -rayLength, 0);
      gradNeg.addColorStop(0, '#ffffff');
      gradNeg.addColorStop(0.18, coronaCol.getStyle());
      gradNeg.addColorStop(0.65, `rgba(${Math.round(coronaCol.r * 255)}, ${Math.round(coronaCol.g * 255)}, ${Math.round(coronaCol.b * 255)}, 0.15)`);
      gradNeg.addColorStop(1, 'transparent');

      ctx.fillStyle = gradNeg;
      ctx.fillRect(-rayLength, -rayWidth / 2, rayLength, rayWidth);

      ctx.restore();
    }

    return new THREE.CanvasTexture(canvas);
  }

  private createProceduralSun(): {
    group: THREE.Group;
    core: THREE.Mesh;
    coronaInner: THREE.Sprite;
    coronaOuter: THREE.Sprite;
    flares: THREE.Sprite;
    light: THREE.PointLight;
  } {
    const group = new THREE.Group();
    group.position.set(1200, 500, -2200);

    // 1. High-Fidelity Photosphere Sphere (64x48 segments for perfectly round silhouette)
    this.sunSurfaceTexture = this.createSolarSurfaceTexture(0xfff3d6, 0xf59e0b);
    const coreGeo = new THREE.SphereGeometry(130, 64, 48);
    const coreMat = new THREE.MeshBasicMaterial({ map: this.sunSurfaceTexture });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // 2. Camera-Facing Inner Corona Billboard (seamless limb bloom, no clipping)
    const innerTex = this.createInnerCoronaTexture(0xf59e0b);
    const innerMat = new THREE.SpriteMaterial({
      map: innerTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const coronaInner = new THREE.Sprite(innerMat);
    const innerScale = 130 * 2.8;
    coronaInner.scale.set(innerScale, innerScale, 1);
    group.add(coronaInner);

    // 3. Camera-Facing Outer Atmospheric Corona Halo
    const outerTex = this.createOuterCoronaTexture(0xf59e0b);
    const outerMat = new THREE.SpriteMaterial({
      map: outerTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.65,
    });
    const coronaOuter = new THREE.Sprite(outerMat);
    const outerScale = 130 * 4.8;
    coronaOuter.scale.set(outerScale, outerScale, 1);
    group.add(coronaOuter);

    // 4. Camera-Facing Soft Anamorphic Solar Flares & Diffraction Rays
    const flareTex = this.createSolarFlareTexture(0xf59e0b);
    const flareMat = new THREE.SpriteMaterial({
      map: flareTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.45,
    });
    const flares = new THREE.Sprite(flareMat);
    const flareScale = 130 * 4.2;
    flares.scale.set(flareScale, flareScale, 1);
    group.add(flares);

    // 5. Point Light
    const light = new THREE.PointLight(0xffedd5, 3.4, 8000, 0.35);
    group.add(light);

    return { group, core, coronaInner, coronaOuter, flares, light };
  }

  /**
   * Dynamically updates the primary star's photosphere, corona halo,
   * solar flares, and lighting to match the star system's stellar class.
   */
  public updateStarVisuals(star: StarDescriptor): void {
    const starRadius = star.radius || 130;
    this.currentStarRadius = starRadius;

    // 1. Rescale and re-texture Photosphere Core
    this.sunCore.scale.setScalar(starRadius / 130);

    const lightColor = star.lightColor || 0xfff7ed;
    const coronaColor = star.coronaColor || 0xf59e0b;

    const surfKey = `${lightColor}_${coronaColor}`;
    let surfTex = SpaceScene.solarSurfaceTexCache.get(surfKey);
    if (!surfTex) {
      surfTex = this.createSolarSurfaceTexture(lightColor, coronaColor);
      SpaceScene.solarSurfaceTexCache.set(surfKey, surfTex);
    }
    this.sunSurfaceTexture = surfTex;
    (this.sunCore.material as THREE.MeshBasicMaterial).map = this.sunSurfaceTexture;
    (this.sunCore.material as THREE.MeshBasicMaterial).needsUpdate = true;

    // 2. Re-texture and rescale Corona Sprites
    let innerTex = SpaceScene.solarInnerCoronaCache.get(coronaColor);
    if (!innerTex) {
      innerTex = this.createInnerCoronaTexture(coronaColor);
      SpaceScene.solarInnerCoronaCache.set(coronaColor, innerTex);
    }
    this.sunCoronaInner.material.map = innerTex;
    this.sunCoronaInner.material.needsUpdate = true;
    const innerScale = starRadius * 2.8;
    this.sunCoronaInner.scale.set(innerScale, innerScale, 1);

    let outerTex = SpaceScene.solarOuterCoronaCache.get(coronaColor);
    if (!outerTex) {
      outerTex = this.createOuterCoronaTexture(coronaColor);
      SpaceScene.solarOuterCoronaCache.set(coronaColor, outerTex);
    }
    this.sunCoronaOuter.material.map = outerTex;
    this.sunCoronaOuter.material.needsUpdate = true;
    const outerScale = starRadius * 4.8;
    this.sunCoronaOuter.scale.set(outerScale, outerScale, 1);

    let flareTex = SpaceScene.solarFlareCache.get(coronaColor);
    if (!flareTex) {
      flareTex = this.createSolarFlareTexture(coronaColor);
      SpaceScene.solarFlareCache.set(coronaColor, flareTex);
    }
    this.sunFlares.material.map = flareTex;
    this.sunFlares.material.needsUpdate = true;
    const flareScale = starRadius * 4.2;
    this.sunFlares.scale.set(flareScale, flareScale, 1);

    // 3. Update Illumination Color and Intensity
    const starColor = new THREE.Color(lightColor);
    this.sunLight.color.copy(starColor);
    this.sunDirLight.color.copy(starColor);

    // Dynamic directional light intensity based on temperature
    const tempRatio = Math.min(2.5, Math.max(0.7, (star.temperature || 5778) / 5778));
    this.sunDirLight.intensity = 2.2 * tempRatio;
  }

  private createCosmicDust(): { points: THREE.Points; positions: Float32Array } {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dustCount * 3);

    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.dustBoxSize;
      positions[i * 3 + 1] = (Math.random() - 0.5) * this.dustBoxSize;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.dustBoxSize;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 1.6,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });

    return { points: new THREE.Points(geometry, material), positions };
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

  public update(
    dt: number,
    shipPos: THREE.Vector3,
    cameraPos: THREE.Vector3,
    throttle: number,
    _steeringYaw = 0,
    _steeringPitch = 0
  ): void {
    this.clock += dt;

    // 1. Update Infinite Starfield & Nebula to follow camera (with warp hyperspace stretch & shooting stars)
    this.infiniteBackground.update(cameraPos, this.clock, this.warpFactor, this.warpHeading, dt);

    // 2. Survey Craft internal animations (strictly never alters physics transform)
    const flightMode = this.warpFactor > 0.1 ? 'warp' : 'space';
    this.surveyCraft.updateVisuals(dt, throttle, flightMode);

    // 3. Solar Corona Multi-harmonic Pulsations & Flare Rotation
    const pulse1 = Math.sin(this.clock * 0.7) * 0.035;
    const pulse2 = Math.cos(this.clock * 1.3) * 0.02;
    const innerScale = this.currentStarRadius * 2.8 * (1.0 + pulse1);
    const outerScale = this.currentStarRadius * 4.8 * (1.0 - pulse1 * 0.6 + pulse2);
    this.sunCoronaInner.scale.set(innerScale, innerScale, 1);
    this.sunCoronaOuter.scale.set(outerScale, outerScale, 1);

    this.sunFlares.material.rotation += dt * 0.005;
    this.sunCore.rotation.y += dt * 0.004;
    if (this.sunSurfaceTexture) {
      this.sunSurfaceTexture.offset.x += dt * 0.004;
    }
    this.sunLight.intensity = 3.2 + Math.sin(this.clock * 2.1) * 0.25;

    // 4. Planetary & Lunar Orbital Rotations
    if (this.aureliaGroup.visible) {
      this.planetAureliaMesh.rotation.y += dt * 0.018;
      if (this.cloudAureliaMesh) this.cloudAureliaMesh.rotation.y += dt * 0.026;
      if (this.atmosphereAureliaMesh) this.atmosphereAureliaMesh.rotation.y += dt * 0.022;
      if (this.ringAureliaMesh) this.ringAureliaMesh.rotation.z += dt * 0.002;
      this.moonZephyrMesh.rotation.y += dt * 0.012;
    }

    // Dynamic Planets rotation
    for (const p of this.planetMeshes) {
      p.mesh.rotation.y += dt * 0.015;
      if (p.cloud) p.cloud.rotation.y += dt * 0.024;
      if (p.atmo) p.atmo.rotation.y += dt * 0.020;
      if (p.ring) p.ring.rotation.z += dt * 0.002;
    }

    // Active Delivery Pod update
    if (this.activeCourierPod) {
      this.activeCourierPod.update(dt, shipPos);
    }

    // Space Traffic & Cosmic Encounters
    if (this.trafficDirector) {
      this.lastCommsHail = this.trafficDirector.update(dt, shipPos);
    }
    if (this.encounterManager) {
      this.encounterManager.update(dt);
    }

    // 5. Cosmic Dust Particle Recycling around Ship (only when displaced > 0.5 units)
    if (this.lastDustShipPos.distanceToSquared(shipPos) > 0.5) {
      this.lastDustShipPos.copy(shipPos);
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
    }

    // 6. Scan Holographic Pulse Expansion
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

    // 7. Relativistic Warp Hyperspace Tunnel
    if (this.warpFactor > 0.05) {
      this.warpTunnelGroup.visible = true;
      this.warpTunnelGroup.position.copy(cameraPos);
      if (this.warpHeading && this.warpHeading.lengthSq() > 0.001) {
        SpaceScene.scratchHeading.copy(this.warpHeading).normalize();
        this.warpTunnelGroup.quaternion.setFromUnitVectors(SpaceScene.scratchForward, SpaceScene.scratchHeading);
      }

      const op = Math.min(1.0, this.warpFactor * 1.25);
      this.warpStreakMat.opacity = op * 0.9;
      (this.warpShroudMesh.material as THREE.MeshBasicMaterial).opacity = op * 0.16;

      const tunnelLength = 800;
      const halfLen = tunnelLength / 2;
      const posAttr = this.warpStreakGeo.attributes.position;
      const positions = this.warpStreakPositions;

      for (let i = 0; i < this.warpStreakData.length; i++) {
        const s = this.warpStreakData[i];
        s.zOffset += dt * s.speed * (0.6 + this.warpFactor * 1.8);
        if (s.zOffset > halfLen) {
          s.zOffset -= tunnelLength;
          s.baseAngle += 0.25;
        }
        const x = Math.cos(s.baseAngle) * s.baseRadius;
        const y = Math.sin(s.baseAngle) * s.baseRadius;
        const idx = i * 6;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = s.zOffset;
        positions[idx + 3] = x;
        positions[idx + 4] = y;
        positions[idx + 5] = s.zOffset - s.length;
      }
      posAttr.needsUpdate = true;
      this.warpShroudMesh.rotation.z += dt * 2.2;
    } else {
      this.warpTunnelGroup.visible = false;
    }
  }

  public dispose(): void {
    this.infiniteBackground.dispose();

    this.warpStreakGeo.dispose();
    this.warpStreakMat.dispose();
    this.warpShroudMesh.geometry.dispose();
    (this.warpShroudMesh.material as THREE.Material).dispose();

    this.dustPoints.geometry.dispose();
    (this.dustPoints.material as THREE.Material).dispose();

    this.sunCore.geometry.dispose();
    (this.sunCore.material as THREE.Material).dispose();
    this.sunCoronaInner.material.dispose();
    this.sunCoronaOuter.material.dispose();
    this.sunFlares.material.dispose();
    this.sunLight.dispose();
    this.sunDirLight.dispose();

    this.scanWave.geometry.dispose();
    (this.scanWave.material as THREE.Material).dispose();

    this.disposePlanetMeshes();

    if (this.activeCourierPod) {
      this.activeCourierPod.dispose();
      this.activeCourierPod = null;
    }
    if (this.trafficDirector) {
      this.trafficDirector.dispose();
      this.trafficDirector = null;
    }
    if (this.encounterManager) {
      this.encounterManager.dispose();
      this.encounterManager = null;
    }

    this.scene.clear();
  }
}
