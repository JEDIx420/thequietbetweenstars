import * as THREE from 'three';
import { SurveyCraft } from './spaceCraft';
import { CelestialPhysicsSystem, type CelestialBody } from '../core/celestialPhysics';
import { InfiniteBackground } from '../universe/InfiniteBackground';
import { PlanetVisualGenerator } from '../planets/PlanetVisualGenerator';
import { PlanetEnvironmentGenerator } from '../planets/PlanetEnvironmentProfile';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';

export class SpaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group;
  public surveyCraft: SurveyCraft;
  public physics: CelestialPhysicsSystem;
  public infiniteBackground: InfiniteBackground;

  // Local velocity motes
  private dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustCount = 800;
  private dustBoxSize = 300;

  // Solar illumination & corona
  private sunCore: THREE.Mesh;
  private sunCoronaInner: THREE.Mesh;
  private sunCoronaOuter: THREE.Mesh;
  private sunSpikes: THREE.Mesh;
  private sunLight: THREE.PointLight;

  // Primary System Planets (Aurelia & Zephyr)
  public aureliaDescriptor: PlanetDescriptor;
  public zephyrDescriptor: PlanetDescriptor;
  public activePlanetList: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }> = [];

  private planetAureliaMesh: THREE.Mesh;
  private atmosphereAureliaMesh: THREE.Mesh | null;
  private ringAureliaMesh: THREE.Mesh | null;
  private cloudAureliaMesh: THREE.Mesh | null;
  public planetAureliaPos = new THREE.Vector3(-1000, -300, -1800);

  private moonZephyrMesh: THREE.Mesh;
  public moonZephyrPos = new THREE.Vector3(-720, -180, -1550);

  private scanWave: THREE.Mesh;
  private scanRadius = 0;
  private isScanning = false;
  private clock = 0;

  constructor() {
    this.scene = new THREE.Scene();

    // 1. Camera-Centered Infinite Star & Nebula Background
    this.infiniteBackground = new InfiniteBackground();
    this.scene.add(this.infiniteBackground.group);

    // 2. Ambient and Key Directional Lighting
    const ambient = new THREE.AmbientLight(0x1a2236, 1.4);
    this.scene.add(ambient);

    const sunDirLight = new THREE.DirectionalLight(0xfff3d6, 2.2);
    sunDirLight.position.set(1200, 500, -2200);
    this.scene.add(sunDirLight);

    // 3. Local Space Velocity Dust Particles
    const dustObj = this.createCosmicDust();
    this.dustPoints = dustObj.points;
    this.dustPositions = dustObj.positions;
    this.scene.add(this.dustPoints);

    // 4. Primary Star Solara
    const sunData = this.createProceduralSun();
    this.sunCore = sunData.core;
    this.sunCoronaInner = sunData.coronaInner;
    this.sunCoronaOuter = sunData.coronaOuter;
    this.sunSpikes = sunData.spikes;
    this.sunLight = sunData.light;
    this.scene.add(sunData.group);

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
    aureliaVisual.group.position.copy(this.planetAureliaPos);
    this.planetAureliaMesh = aureliaVisual.planetMesh;
    this.atmosphereAureliaMesh = aureliaVisual.atmosphereMesh;
    this.ringAureliaMesh = aureliaVisual.ringMesh;
    this.cloudAureliaMesh = aureliaVisual.cloudMesh;
    this.scene.add(aureliaVisual.group);

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
    zephyrVisual.group.position.copy(this.moonZephyrPos);
    this.moonZephyrMesh = zephyrVisual.planetMesh;
    this.scene.add(zephyrVisual.group);

    this.activePlanetList = [
      { descriptor: this.aureliaDescriptor, position: this.planetAureliaPos },
      { descriptor: this.zephyrDescriptor, position: this.moonZephyrPos },
    ];

    // 7. Survey Spacecraft
    this.surveyCraft = new SurveyCraft();
    this.shipGroup = this.surveyCraft.group;
    this.scene.add(this.shipGroup);

    // 8. Holographic Scanner Pulse
    this.scanWave = this.createScanWave();
    this.scene.add(this.scanWave);

    // 9. Celestial Safety Physics Shells
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

    const coreGeo = new THREE.SphereGeometry(130, 48, 36);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff7ed });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const coronaInGeo = new THREE.SphereGeometry(148, 48, 48);
    const coronaInMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.55,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const coronaInner = new THREE.Mesh(coronaInGeo, coronaInMat);
    group.add(coronaInner);

    const coronaOutGeo = new THREE.SphereGeometry(195, 48, 48);
    const coronaOutMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const coronaOuter = new THREE.Mesh(coronaOutGeo, coronaOutMat);
    group.add(coronaOuter);

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

    const light = new THREE.PointLight(0xffedd5, 3.2, 7000, 0.4);
    group.add(light);

    return { group, core, coronaInner, coronaOuter, spikes, light };
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
    steeringYaw = 0,
    steeringPitch = 0
  ): void {
    this.clock += dt;

    // 1. Update Infinite Starfield & Nebula to follow camera
    this.infiniteBackground.update(cameraPos, this.clock);

    // 2. Survey Craft visual animations
    this.surveyCraft.update(dt, throttle, steeringYaw, steeringPitch);

    // 3. Solar Corona Multi-harmonic Pulsations
    const pulse1 = Math.sin(this.clock * 0.7) * 0.035;
    const pulse2 = Math.cos(this.clock * 1.4) * 0.02;
    const coronaScale = 1.0 + pulse1 + pulse2;
    this.sunCoronaInner.scale.set(coronaScale, coronaScale, coronaScale);
    this.sunCoronaOuter.scale.set(1.0 - pulse1 * 0.5, 1.0 - pulse1 * 0.5, 1.0 - pulse1 * 0.5);

    this.sunSpikes.rotation.z += dt * 0.015;
    this.sunCore.rotation.y += dt * 0.004;
    this.sunLight.intensity = 3.2 + Math.sin(this.clock * 2.1) * 0.25;

    // 4. Planetary & Lunar Orbital Rotations
    this.planetAureliaMesh.rotation.y += dt * 0.018;
    if (this.cloudAureliaMesh) this.cloudAureliaMesh.rotation.y += dt * 0.026;
    if (this.atmosphereAureliaMesh) this.atmosphereAureliaMesh.rotation.y += dt * 0.022;
    if (this.ringAureliaMesh) this.ringAureliaMesh.rotation.z += dt * 0.002;
    this.moonZephyrMesh.rotation.y += dt * 0.012;

    // 5. Cosmic Dust Particle Recycling around Ship
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
  }
}
