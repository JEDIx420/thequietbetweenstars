import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';
import type { LandingSite } from '../systems/LandingSiteGenerator';
import { SurveyCraft } from '../scenes/spaceCraft';
import type { NormalizedInputState } from '../input/InputSource';
import { ProceduralSky } from './ProceduralSky';
import { PlanetaryAtmosphereDirector, type AtmosphereState } from './PlanetaryAtmosphereDirector';
import { LandmarkGenerator } from './LandmarkGenerator';
import { SimplexNoise2D } from './noise';
import { ParticleTextureGenerator } from './particleTexture';
import { FloraGenerator } from './FloraGenerator';
import { EcologyGenerator, type PlanetEcologyProfile } from '../ecology/PlanetEcologyProfile';
import { SentientSpeciesGenerator, type SentientSpeciesProfile, type NPCIdentity } from '../ecology/SentientSpeciesProfile';
import { FaunaPopulationManager } from '../ecology/FaunaPopulationManager';
import { ResourceNodeManager, type SampleNode } from './ResourceNodeManager';
import { SurveyCreditPickupManager } from './SurveyCreditPickupManager';

export class SurfaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group;
  public surveyCraft: SurveyCraft;
  public planet: PlanetDescriptor;
  public site: LandingSite;

  // Surface flight dynamics & altitude control
  public shipPhysicsRoot: THREE.Group;
  public shipVisualRoot: THREE.Group;
  public shipPosition = new THREE.Vector3(0, 18, 0);
  public shipVelocity = new THREE.Vector3(0, 0, 0);
  public shipYaw = 0;
  public shipPitch = 0;
  public shipRoll = 0;

  // Separated pilot-desired world altitude vs terrain safety envelope
  public pilotDesiredWorldAltitude = 18.0;
  public desiredAltitudeAGL = 18.0; // Dynamic pilot-controlled height AGL
  public minAltitudeAGL = 7.0;
  public maxAltitudeAGL = 45.0; // Extensible with upgrades

  // Filtered terrain safety envelope (rises quickly, falls slowly)
  private filteredTerrainSafetyFloor = 0.0;
  private postCrestHoldTimer = 0.0;

  // Jerk-limited vertical dynamics
  public verticalVelocity = 0.0;
  public verticalAcceleration = 0.0;
  public springStrength = 4.2;
  public damping = 3.6;
  public maxClimbAcceleration = 24.0; // m/s²
  public maxDescentAcceleration = 16.0; // m/s²
  public maxVerticalJerk = 45.0; // m/s³
  public climbRate = 30.0; // m/s maximum climb
  public descentRate = 18.0; // m/s maximum descent
  public terrainAssistActive = false;

  // Smoothed camera tracking
  private smoothedCamPos = new THREE.Vector3();
  private smoothedCamLook = new THREE.Vector3();
  private isCamInitialized = false;

  // Survey Credit Pickup Manager
  public creditPickupManager: SurveyCreditPickupManager;

  // Real-time telemetry for F3 overlay & QA
  public debugTelemetry = {
    shipPos: new THREE.Vector3(),
    groundHeight: 0,
    anticipatedGround: 0,
    actualAGL: 0,
    desiredAGL: 18,
    verticalVelocity: 0,
    verticalAcceleration: 0,
    speedMps: 0,
    terrainAssistActive: false,
    dt: 0,
  };

  // Atmospheric sky, lighting & dynamic weather
  public atmosphereDirector: PlanetaryAtmosphereDirector;
  public currentAtmosphereState: AtmosphereState | null = null;
  private proceduralSky: ProceduralSky;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private particlePoints: THREE.Points | null = null;
  private distantHorizonRing: THREE.Mesh | null = null;

  // Terrain streaming
  private terrainGroup = new THREE.Group();
  private activeChunks: Map<string, THREE.Mesh> = new Map();
  private chunkSize = 200;
  private chunkSegments = 32;

  // Ocean / liquid plane
  private liquidGroup = new THREE.Group();
  private activeLiquidChunks: Map<string, THREE.Mesh> = new Map();

  // Environmental props, flora & landmarks
  private propsGroup = new THREE.Group();
  private floraGroup = new THREE.Group();
  private activeFloraChunks: Map<string, THREE.InstancedMesh[]> = new Map();
  private scannableProps: Array<{ mesh: THREE.Object3D; name: string; info: string }> = [];

  // Living Ecology, Sentient Species & Resource Nodes
  public ecologyProfile: PlanetEcologyProfile;
  public sentientProfile: SentientSpeciesProfile | null;
  public notableNPCs: NPCIdentity[] = [];
  public faunaPopulationManager: FaunaPopulationManager;
  public resourceManager: ResourceNodeManager;

  // Coherent noise engine
  private noise: SimplexNoise2D;

  constructor(planet: PlanetDescriptor, site: LandingSite, initialCollectedCreditIds: string[] = []) {
    this.planet = planet;
    this.site = site;
    const profile = planet.profile;
    const region = site.region;

    this.scene = new THREE.Scene();
    this.noise = new SimplexNoise2D(region.regionSeed || planet.seed);

    // 1. Derive deterministic planetary ecology & sentient giants
    this.ecologyProfile = EcologyGenerator.deriveEcology(profile, planet.seed, planet.id);
    this.sentientProfile = SentientSpeciesGenerator.generateSpecies(profile, planet.seed, planet.id, this.ecologyProfile);
    if (this.sentientProfile) {
      this.notableNPCs = SentientSpeciesGenerator.generateNotableNPCs(this.sentientProfile, 3, planet.seed);
    }

    this.faunaPopulationManager = new FaunaPopulationManager(
      this.ecologyProfile,
      region,
      this.sentientProfile,
      this.notableNPCs
    );

    // 2. Procedural Atmospheric Sky Dome & Volumetric Fog
    this.proceduralSky = new ProceduralSky(profile.atmosphere);
    this.scene.add(this.proceduralSky.mesh);

    const fogColorHex = region.fogModifier.color || profile.atmosphere.fogColor;
    const fogDensity = profile.atmosphere.fogDensity * (region.fogModifier.densityMultiplier || 1.0);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(fogColorHex), fogDensity);

    // 3. Dynamic Star Lighting & Celestial Atmosphere Director
    this.hemiLight = new THREE.HemisphereLight(
      new THREE.Color(profile.atmosphere.skyHorizon),
      new THREE.Color(region.localSurfacePalette.lowland),
      profile.atmosphere.hasAtmosphere ? 1.6 : 0.6
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      profile.palette.sunLightColor,
      profile.atmosphere.hasAtmosphere ? 2.8 : 3.6
    );
    this.sunLight.position.set(400, 600, 300);
    this.scene.add(this.sunLight);

    this.atmosphereDirector = new PlanetaryAtmosphereDirector(profile, region);

    // 4. Environmental Atmosphere Particles
    const particleType = region.particleModifier.type || profile.atmosphere.particleType;
    if (particleType !== 'none') {
      this.particlePoints = this.createAtmosphericParticles(particleType, region.particleModifier.densityMultiplier || 1.0);
      this.scene.add(this.particlePoints);
    }

    // 5. Distant Horizon Mountain Silhouette Ring
    this.distantHorizonRing = this.createDistantHorizon();
    this.scene.add(this.distantHorizonRing);

    // 6. Groups for Terrain, Liquid, Props, Flora, Fauna & Resources
    this.scene.add(this.terrainGroup);
    this.scene.add(this.liquidGroup);
    this.scene.add(this.propsGroup);
    this.scene.add(this.floraGroup);
    this.scene.add(this.faunaPopulationManager.faunaGroup);

    // Resource Node Manager
    this.resourceManager = new ResourceNodeManager(region, this.shipPosition, (x, z) => this.getTerrainHeight(x, z));
    this.scene.add(this.resourceManager.resourceGroup);

    // Survey Credit Pickup Manager
    this.creditPickupManager = new SurveyCreditPickupManager(
      region,
      planet.id,
      planet.seed,
      initialCollectedCreditIds
    );
    this.scene.add(this.creditPickupManager.pickupGroup);

    // 7. Survey Craft Hierarchy Separation
    // shipPhysicsRoot holds the true world translation and horizontal yaw
    // shipVisualRoot holds pitch, roll banking, and thruster vibration without distorting movement
    this.shipPhysicsRoot = new THREE.Group();
    this.shipVisualRoot = new THREE.Group();
    this.surveyCraft = new SurveyCraft();
    this.shipGroup = this.shipPhysicsRoot;

    this.shipVisualRoot.add(this.surveyCraft.group);
    this.shipPhysicsRoot.add(this.shipVisualRoot);

    // Initialize position directly above ground
    const initGround = this.getTerrainHeight(0, 0);
    this.pilotDesiredWorldAltitude = initGround + this.desiredAltitudeAGL;
    this.filteredTerrainSafetyFloor = initGround + this.minAltitudeAGL;
    this.shipPosition.set(0, this.pilotDesiredWorldAltitude, 0);
    this.shipPhysicsRoot.position.copy(this.shipPosition);
    this.scene.add(this.shipPhysicsRoot);

    // Initial terrain generation
    this.updateTerrain(this.shipPosition);
  }

  public static readonly WORLD_UP = new THREE.Vector3(0, 1, 0);

  public adjustAltitude(delta: number): void {
    this.desiredAltitudeAGL = THREE.MathUtils.clamp(
      this.desiredAltitudeAGL + delta,
      this.minAltitudeAGL,
      this.maxAltitudeAGL
    );
    this.pilotDesiredWorldAltitude += delta;
  }

  public update(
    input: NormalizedInputState,
    dt: number,
    camera: THREE.PerspectiveCamera
  ): {
    activeScanTarget: { name: string; info: string; isSentient?: boolean; npcData?: NPCIdentity } | null;
    nearbyResource: SampleNode | null;
    altitudeAGL: number;
    speedMps: number;
    collectedCredits: Array<{ id: string; amount: number; tier: string }>;
    nearestCreditPickups: Array<{ position: THREE.Vector3; amount: number }>;
  } {
    const clampedDt = Math.min(dt, 0.05);

    // Handle roll-based altitude keys (Q: descend, E: ascend)
    if (input.roll !== 0) {
      this.adjustAltitude(input.roll * clampedDt * 18.0);
    }

    // 1. Horizontal Flight Dynamics & Heading Control
    this.shipYaw += -input.axes.x * clampedDt * 1.8;
    this.shipPitch = input.axes.y * 0.45;
    this.shipRoll = -input.axes.x * 0.35;

    // Apply orientation:
    // Yaw applied to physics root (world space forward)
    this.shipPhysicsRoot.rotation.set(0, 0, 0);
    this.shipPhysicsRoot.rotateY(this.shipYaw);

    // Visual bank and pitch applied ONLY to visual root
    this.shipVisualRoot.rotation.set(0, 0, 0);
    this.shipVisualRoot.rotateX(this.shipPitch);
    this.shipVisualRoot.rotateZ(this.shipRoll);

    // Forward propulsion in horizontal XZ plane
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(SurfaceScene.WORLD_UP, this.shipYaw);
    const speed = input.throttle * 65;
    const targetVel = forward.clone().multiplyScalar(speed);

    this.shipVelocity.lerp(targetVel, clampedDt * 3.5);
    const currentSpeed = this.shipVelocity.length();
    this.shipPosition.x += this.shipVelocity.x * clampedDt;
    this.shipPosition.z += this.shipVelocity.z * clampedDt;

    // 2. Speed-Dependent Multi-Point Forward Corridor Sampling
    // Sample distances scale dynamically with speed (15m to 140m)
    const currentGround = this.getTerrainHeight(this.shipPosition.x, this.shipPosition.z);
    const corridorLength = THREE.MathUtils.clamp(15.0 + currentSpeed * 2.0, 15.0, 140.0);
    const d1 = corridorLength * 0.18;
    const d2 = corridorLength * 0.42;
    const d3 = corridorLength * 0.70;
    const d4 = corridorLength;

    const p1 = this.shipPosition.clone().addScaledVector(forward, d1);
    const p2 = this.shipPosition.clone().addScaledVector(forward, d2);
    const p3 = this.shipPosition.clone().addScaledVector(forward, d3);
    const p4 = this.shipPosition.clone().addScaledVector(forward, d4);

    const h1 = this.getTerrainHeight(p1.x, p1.z);
    const h2 = this.getTerrainHeight(p2.x, p2.z);
    const h3 = this.getTerrainHeight(p3.x, p3.z);
    const h4 = this.getTerrainHeight(p4.x, p4.z);

    // Dynamic slope analysis: calculate highest slope angle ahead
    const maxSlopeHeight = Math.max(h1, h2, h3, h4);
    const maxSlopeDist = maxSlopeHeight === h1 ? d1 : maxSlopeHeight === h2 ? d2 : maxSlopeHeight === h3 ? d3 : d4;
    const heightDiff = maxSlopeHeight - currentGround;
    const slopeAngleRad = Math.atan2(Math.max(0, heightDiff), Math.max(1.0, maxSlopeDist));

    // Detect steep terrain (> 45 degrees) for anticipatory climb and speed moderation
    if (slopeAngleRad > 0.785) { // ~45 deg
      this.terrainAssistActive = true;
      // Gentle speed moderation so the craft has time to clear the crest
      this.shipVelocity.multiplyScalar(Math.max(0.7, 1.0 - clampedDt * 1.5));
      // Subtle visual pitch up
      this.shipVisualRoot.rotation.x -= 0.15 * Math.sin(slopeAngleRad);
    } else {
      this.terrainAssistActive = false;
    }

    // Weighted anticipated ground height for forward planning
    const anticipatedGround = Math.max(
      currentGround,
      h1 * 0.35 + h2 * 0.30 + h3 * 0.20 + h4 * 0.15
    );

    // 3. Asymmetric Envelope Filter: Fast Rise, Slow Fall, Post-Crest Hold
    const rawSafetyFloor = Math.max(currentGround, anticipatedGround) + this.minAltitudeAGL;

    if (rawSafetyFloor > this.filteredTerrainSafetyFloor) {
      // Rapid upward adaptation to meet upcoming ridges without lag
      const riseRate = 28.0; // m/s
      this.filteredTerrainSafetyFloor = Math.min(
        rawSafetyFloor,
        this.filteredTerrainSafetyFloor + riseRate * clampedDt
      );
      // Reset post-crest hold timer (0.8s) when climbing
      this.postCrestHoldTimer = 0.8;
    } else {
      // Downward slope: hold altitude briefly after cresting before gently descending
      if (this.postCrestHoldTimer > 0) {
        this.postCrestHoldTimer -= clampedDt;
      } else {
        const fallRate = 4.5; // m/s slow, elegant descent
        this.filteredTerrainSafetyFloor = Math.max(
          rawSafetyFloor,
          this.filteredTerrainSafetyFloor - fallRate * clampedDt
        );
      }
    }

    // Target world altitude: pilot desire takes precedence unless safety floor requires lift
    const targetWorldAltitude = Math.max(
      this.pilotDesiredWorldAltitude,
      this.filteredTerrainSafetyFloor
    );

    // 4. Jerk-Limited Spring-Damper Dynamics
    const altitudeError = targetWorldAltitude - this.shipPosition.y;
    const rawTargetAccel = altitudeError * this.springStrength - this.verticalVelocity * this.damping;

    // Apply acceleration limits based on climb vs descent
    const clampedTargetAccel = rawTargetAccel > 0
      ? Math.min(rawTargetAccel, this.maxClimbAcceleration)
      : Math.max(rawTargetAccel, -this.maxDescentAcceleration);

    // Rate-limit acceleration changes by max vertical jerk (m/s³)
    const maxDeltaAccel = this.maxVerticalJerk * clampedDt;
    const accelDiff = clampedTargetAccel - this.verticalAcceleration;
    this.verticalAcceleration += THREE.MathUtils.clamp(accelDiff, -maxDeltaAccel, maxDeltaAccel);

    this.verticalVelocity += this.verticalAcceleration * clampedDt;
    this.verticalVelocity = THREE.MathUtils.clamp(
      this.verticalVelocity,
      -this.descentRate,
      this.climbRate
    );

    this.shipPosition.y += this.verticalVelocity * clampedDt;

    // Hard floor safety: ship can NEVER penetrate terrain + minAltitudeAGL
    const hardFloor = currentGround + this.minAltitudeAGL;
    if (this.shipPosition.y < hardFloor) {
      this.shipPosition.y = hardFloor;
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = 0;
      }
    }

    // 5. Sentient Giant Soft-Collision Repulsion Field (14m radius)
    for (const site of this.faunaPopulationManager.encounterSites) {
      const xDiff = this.shipPosition.x - site.position.x;
      const zDiff = this.shipPosition.z - site.position.z;
      const horizDistSq = xDiff * xDiff + zDiff * zDiff;
      const minDistance = 14.0;
      if (horizDistSq < minDistance * minDistance && horizDistSq > 0.001) {
        const horizDist = Math.sqrt(horizDistSq);
        const pushMag = (minDistance - horizDist) * 12.0 * clampedDt;
        this.shipPosition.x += (xDiff / horizDist) * pushMag;
        this.shipPosition.z += (zDiff / horizDist) * pushMag;
      }
    }

    this.shipPhysicsRoot.position.copy(this.shipPosition);
    this.surveyCraft.updateVisuals(clampedDt, input.throttle, 'surface');

    // 6. Horizon-Stabilized Camera with Decoupled Target Smoothing
    const maxCameraBankRad = 0.10;
    const targetCameraBank = THREE.MathUtils.clamp(this.shipRoll * 0.25, -maxCameraBankRad, maxCameraBankRad);

    const camOffset = new THREE.Vector3(0, 5.5, 14.5).applyAxisAngle(SurfaceScene.WORLD_UP, this.shipYaw);
    const targetCamPos = this.shipPosition.clone().add(camOffset);
    const targetCamLook = this.shipPosition.clone().addScaledVector(forward, 16.0);

    if (!this.isCamInitialized) {
      this.smoothedCamPos.copy(targetCamPos);
      this.smoothedCamLook.copy(targetCamLook);
      this.isCamInitialized = true;
    } else {
      this.smoothedCamPos.lerp(targetCamPos, clampedDt * 5.0);
      this.smoothedCamLook.lerp(targetCamLook, clampedDt * 6.5);
    }

    const right = new THREE.Vector3().crossVectors(forward, SurfaceScene.WORLD_UP).normalize();
    const desiredUp = SurfaceScene.WORLD_UP.clone()
      .addScaledVector(right, -Math.sin(targetCameraBank))
      .normalize();

    const upAlignment = camera.up.dot(SurfaceScene.WORLD_UP);
    const recoveryRate = upAlignment < 0.2 ? 9.0 : 4.5;
    camera.up.lerp(desiredUp, clampedDt * recoveryRate).normalize();

    camera.position.copy(this.smoothedCamPos);
    camera.lookAt(this.smoothedCamLook);

    this.proceduralSky.update(camera.position);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.currentAtmosphereState = this.atmosphereDirector.update(
        clampedDt,
        this.sunLight,
        this.hemiLight,
        this.scene.fog,
        this.proceduralSky
      );
    }
    if (this.distantHorizonRing) {
      this.distantHorizonRing.position.set(camera.position.x, 0, camera.position.z);
    }

    if (this.particlePoints) {
      this.particlePoints.position.copy(this.shipPosition);
    }

    // 7. Update Survey Credit Pickups (Fly-Through Auto-Collect & Magnetism)
    const collectedCredits = this.creditPickupManager.update(
      this.shipPosition,
      clampedDt,
      (x, z) => this.getTerrainHeight(x, z)
    );
    const nearestCreditPickups = this.creditPickupManager.getNearestPickups(this.shipPosition, 4);

    // 8. Update streamed living ecology & Giant encounters
    const getHeightFn = (x: number, z: number) => this.getTerrainHeight(x, z);
    this.faunaPopulationManager.update(this.shipPosition, input.throttle, clampedDt, getHeightFn);

    // 9. Terrain and liquid streaming updates
    this.updateTerrain(this.shipPosition);

    // 10. Check for nearby scannable landmark, fauna, sentient giant, or survey sample
    let scanTarget: { name: string; info: string; isSentient?: boolean; npcData?: NPCIdentity } | null = null;
    let minDist = 65;

    // Check props & landmarks
    for (const prop of this.scannableProps) {
      const dist = this.shipPosition.distanceTo(prop.mesh.position);
      if (dist < minDist) {
        minDist = dist;
        scanTarget = { name: prop.name, info: prop.info };
      }
    }

    // Check fauna & giants
    for (const creature of this.faunaPopulationManager.getActiveCreatures()) {
      const dist = this.shipPosition.distanceTo(creature.group.position);
      if (dist < minDist) {
        minDist = dist;
        const info = `${creature.scanInfo.behaviour}\nDiet: ${creature.scanInfo.diet}\nTemperament: ${creature.scanInfo.temperament}\nAdaptation: ${creature.scanInfo.adaptation}`;
        scanTarget = {
          name: creature.scanInfo.name,
          info,
          isSentient: creature.scanInfo.isSentient,
          npcData: creature.scanInfo.npcData,
        };
      }
    }

    // Direct proximity to guaranteed giant encounter sites (up to 55m)
    for (const site of this.faunaPopulationManager.encounterSites) {
      const dist = this.shipPosition.distanceTo(site.position);
      if (dist < 55) {
        scanTarget = {
          name: site.giantNPC.name,
          info: `Sentient Giant Elder: ${site.giantNPC.title}\nTemperament: ${site.giantNPC.personality}\nObserving: ${site.giantNPC.currentConcern}`,
          isSentient: true,
          npcData: site.giantNPC,
        };
        break;
      }
    }

    // Check nearby collectible survey sample node
    let nearbyResource: SampleNode | null = null;
    for (const node of this.resourceManager.nodes) {
      if (!node.collected && this.shipPosition.distanceTo(node.mesh.position) < 28) {
        nearbyResource = node;
        break;
      }
    }

    const altitudeAGL = Math.max(0, Math.round(this.shipPosition.y - currentGround));
    const speedMps = Math.round(this.shipVelocity.length());

    // Record Telemetry
    this.debugTelemetry.shipPos.copy(this.shipPosition);
    this.debugTelemetry.groundHeight = currentGround;
    this.debugTelemetry.anticipatedGround = anticipatedGround;
    this.debugTelemetry.actualAGL = this.shipPosition.y - currentGround;
    this.debugTelemetry.desiredAGL = this.desiredAltitudeAGL;
    this.debugTelemetry.verticalVelocity = this.verticalVelocity;
    this.debugTelemetry.verticalAcceleration = this.verticalAcceleration;
    this.debugTelemetry.speedMps = speedMps;
    this.debugTelemetry.terrainAssistActive = this.terrainAssistActive;
    this.debugTelemetry.dt = clampedDt;

    return {
      activeScanTarget: scanTarget,
      nearbyResource,
      altitudeAGL,
      speedMps,
      collectedCredits,
      nearestCreditPickups,
    };
  }

  public getTerrainHeight(x: number, z: number): number {
    const region = this.site.region;
    const morph = region.terrainMorphologyOverride;
    const hScale = region.heightScale * 32.0;
    const rough = region.roughness;
    const warp = this.planet.profile.terrain.domainWarp;

    // Coherent domain warping via Simplex noise
    const warpAngle = this.noise.noise2D(x * 0.003, z * 0.003) * Math.PI * 2;
    const warpDist = this.noise.noise2D(x * 0.004 + 100, z * 0.004 + 100) * 35.0 * warp;
    const wx = x + Math.cos(warpAngle) * warpDist;
    const wz = z + Math.sin(warpAngle) * warpDist;

    let elevation = 0;

    switch (morph) {
      case 'dunes': {
        // Sweeping wind-blown sand dunes with directional crests using ridged + fBm
        const duneAngle = 0.4;
        const dCoord = wx * Math.cos(duneAngle) + wz * Math.sin(duneAngle);
        const crossCoord = -wx * Math.sin(duneAngle) + wz * Math.cos(duneAngle);
        const wave = Math.sin(dCoord * 0.025) * 0.7 + this.noise.noise2D(dCoord * 0.015, crossCoord * 0.005) * 0.3;
        const sharpCrest = Math.pow(Math.abs(wave), 1.6) * Math.sign(wave);
        const swell = this.noise.fbm2D(wx * 0.004, wz * 0.004, 3, 2.0, 0.5) * 16.0;
        elevation = sharpCrest * 14.0 * region.duneStrength + swell;
        break;
      }

      case 'canyons': {
        // Deep carved canyons and flat mesas
        const baseNoise = this.noise.fbm2D(wx * 0.006, wz * 0.006, 4, 2.0, 0.5);
        const terraced = SimplexNoise2D.terrace(baseNoise * 0.5 + 0.5, 5, 0.85) * 2.0 - 1.0;
        const canyonCut = Math.abs(this.noise.noise2D(wx * 0.008, wz * 0.008));
        const rift = canyonCut < 0.22 ? -(0.22 - canyonCut) * 65.0 * region.canyonStrength : 0;
        elevation = terraced * 22.0 + rift;
        break;
      }

      case 'salt_flat': {
        // Blindingly flat crystalline expanse with subtle micro-relief
        const saltCrust = this.noise.noise2D(wx * 0.03, wz * 0.03) * 0.8;
        elevation = saltCrust;
        break;
      }

      case 'mesa_terrace': {
        // Stepped horizontal geological terraces
        const base = this.noise.fbm2D(wx * 0.005, wz * 0.005, 4, 2.0, 0.5);
        const stepped = SimplexNoise2D.terrace(base * 0.5 + 0.5, 4, 0.9) * 2.0 - 1.0;
        elevation = stepped * 26.0;
        break;
      }

      case 'alpine': {
        // Precipitous mountain peaks and sharp ridges using ridged multifractal
        const ridges = this.noise.ridged2D(wx * 0.007, wz * 0.007, 4, 2.1, 0.55);
        const peaks = Math.pow(ridges, 1.4) * 32.0 * region.ridgeStrength;
        const valley = this.noise.fbm2D(wx * 0.003, wz * 0.003, 3) * 10.0;
        elevation = peaks + valley;
        break;
      }

      case 'coastal': {
        // Rolling plains dipping into coastal shallows
        const broad = this.noise.fbm2D(wx * 0.005, wz * 0.005, 3, 2.0, 0.5) * 20.0;
        elevation = broad;
        break;
      }

      case 'volcanic_rift':
      case 'caldera_rim': {
        // Jagged basalt plateaus with deep fissure canyons
        const plateau = this.noise.fbm2D(wx * 0.006, wz * 0.006, 4, 2.0, 0.5);
        const stepped = SimplexNoise2D.terrace(plateau * 0.5 + 0.5, 3, 0.8) * 2.0 - 1.0;
        const fissure = Math.abs(this.noise.noise2D(wx * 0.012, wz * 0.012));
        const drop = fissure < 0.18 ? -(0.18 - fissure) * 55.0 : 0;
        elevation = stepped * 24.0 + drop;
        break;
      }

      case 'glacier_rift': {
        // Glacial shelves and sharp cryo-crevasses
        const glacier = this.noise.fbm2D(wx * 0.005, wz * 0.005, 3, 2.0, 0.5) * 22.0;
        const crevasse = Math.abs(this.noise.noise2D(wx * 0.015, wz * 0.015));
        const drop = crevasse < 0.14 ? -(0.14 - crevasse) * 50.0 : 0;
        elevation = glacier + drop;
        break;
      }

      case 'polar_plateau': {
        // Vast smooth permafrost plain
        elevation = this.noise.fbm2D(wx * 0.003, wz * 0.003, 2, 2.0, 0.5) * 6.0;
        break;
      }

      default: {
        // Coherent rolling hills and highland ridges
        const f1 = this.noise.fbm2D(wx * 0.005, wz * 0.005, 4, 2.0, 0.5) * 20.0;
        const f2 = this.noise.noise2D(wx * 0.015, wz * 0.015) * 5.0;
        elevation = f1 + f2;
        break;
      }
    }

    // High frequency micro-roughness via fast noise
    const micro = this.noise.noise2D(x * 0.06, z * 0.06) * 1.8 * rough;

    return Math.max(0, (elevation * (hScale / 25.0)) + micro + 6.0);
  }

  private updateTerrain(center: THREE.Vector3): void {
    const cx = Math.floor(center.x / this.chunkSize);
    const cz = Math.floor(center.z / this.chunkSize);
    const radius = 1; // 3x3 chunks around ship
    const activeKeys = new Set<string>();

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        activeKeys.add(key);

        if (!this.activeChunks.has(key)) {
          const chunkX = cx + dx;
          const chunkZ = cz + dz;
          const mesh = this.createTerrainChunk(chunkX, chunkZ);
          this.terrainGroup.add(mesh);
          this.activeChunks.set(key, mesh);

          // Liquid plane chunk if applicable
          if (this.planet.profile.terrain.hasLiquid) {
            const liquidMesh = this.createLiquidChunk(chunkX, chunkZ);
            this.liquidGroup.add(liquidMesh);
            this.activeLiquidChunks.set(key, liquidMesh);
          }

          // Spawn procedural flora
          const floraMeshes = FloraGenerator.createFloraInstances(
            this.site.region,
            chunkX,
            chunkZ,
            this.chunkSize,
            (x, z) => this.getTerrainHeight(x, z)
          );
          if (floraMeshes.length > 0) {
            for (const fMesh of floraMeshes) {
              this.floraGroup.add(fMesh);
            }
            this.activeFloraChunks.set(key, floraMeshes);
          }

          // Spawn procedural landmark props
          this.spawnChunkProps(chunkX, chunkZ);
        }
      }
    }

    // Unload distant chunks
    for (const [key, mesh] of this.activeChunks) {
      if (!activeKeys.has(key)) {
        this.terrainGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.activeChunks.delete(key);

        const lMesh = this.activeLiquidChunks.get(key);
        if (lMesh) {
          this.liquidGroup.remove(lMesh);
          lMesh.geometry.dispose();
          (lMesh.material as THREE.Material).dispose();
          this.activeLiquidChunks.delete(key);
        }

        const floraList = this.activeFloraChunks.get(key);
        if (floraList) {
          for (const fMesh of floraList) {
            this.floraGroup.remove(fMesh);
            fMesh.geometry.dispose();
            (fMesh.material as THREE.Material).dispose();
          }
          this.activeFloraChunks.delete(key);
        }
      }
    }
  }

  /**
   * Multi-material surface chunk with dynamic vertex colors based on height, slope, and regional palette
   */
  private createTerrainChunk(cx: number, cz: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(
      this.chunkSize,
      this.chunkSize,
      this.chunkSegments,
      this.chunkSegments
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const palette = this.site.region.localSurfacePalette;

    const colLow = new THREE.Color(palette.lowland);
    const colMid = new THREE.Color(palette.midland);
    const colHigh = new THREE.Color(palette.highland);
    const colPeak = new THREE.Color(palette.peak);
    const colRock = new THREE.Color(palette.rock);

    // Calculate heights first
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + cx * this.chunkSize;
      const vz = pos.getZ(i) + cz * this.chunkSize;
      const vy = this.getTerrainHeight(vx, vz);
      pos.setY(i, vy);
    }
    geo.computeVertexNormals();
    const normals = geo.attributes.normal;

    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const ny = normals.getY(i); // Vertical component of surface normal (steep slopes have ny < 0.7)

      // Elevation blending:
      let elevationColor: THREE.Color;
      if (vy < 8.5) {
        const t = Math.max(0, vy / 8.5);
        elevationColor = colLow.clone().lerp(colMid, t);
      } else if (vy < 20.0) {
        const t = (vy - 8.5) / 11.5;
        elevationColor = colMid.clone().lerp(colHigh, t);
      } else {
        const t = Math.min(1.0, (vy - 20.0) / 14.0);
        elevationColor = colHigh.clone().lerp(colPeak, t);
      }

      // Slope blending: steep cliffs expose darker rock / bedrock
      const slopeFactor = THREE.MathUtils.clamp((0.82 - ny) / 0.35, 0.0, 1.0);
      const finalColor = elevationColor.lerp(colRock, slopeFactor * 0.85);

      colors[i * 3] = finalColor.r;
      colors[i * 3 + 1] = finalColor.g;
      colors[i * 3 + 2] = finalColor.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: this.planet.profile.family === 'metallic-iron' ? 0.6 : 0.1,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
    return mesh;
  }

  private createLiquidChunk(cx: number, cz: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, 8, 8);
    geo.rotateX(-Math.PI / 2);

    const terrain = this.planet.profile.terrain;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(terrain.liquidColor),
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.82,
    });

    const mesh = new THREE.Mesh(geo, mat);
    const seaLevel = terrain.seaLevel + this.site.region.waterLevelOffset;
    mesh.position.set(cx * this.chunkSize, seaLevel, cz * this.chunkSize);
    return mesh;
  }

  private spawnChunkProps(cx: number, cz: number): void {
    const chunkSeed = SeededRandom.hashCoords(this.planet.seed, cx, 0, cz);
    const rng = new SeededRandom(chunkSeed);
    const profile = this.planet.profile;
    const region = this.site.region;

    // Spawn 1-2 landmarks from planet's specific landmark family
    const count = rng.rangeInt(1, 2);
    for (let i = 0; i < count; i++) {
      const px = cx * this.chunkSize + rng.range(-this.chunkSize * 0.4, this.chunkSize * 0.4);
      const pz = cz * this.chunkSize + rng.range(-this.chunkSize * 0.4, this.chunkSize * 0.4);
      const py = this.getTerrainHeight(px, pz);

      // Do not place landmarks underwater
      if (profile.terrain.hasLiquid && py < profile.terrain.seaLevel + region.waterLevelOffset + 0.5) {
        continue;
      }

      const landmarkFamily = region.landmarkFamilies.length > 0 ? rng.pick(region.landmarkFamilies) : profile.landmark;
      const landmark = LandmarkGenerator.createLandmark(
        landmarkFamily,
        profile.palette,
        rng,
        region.biomeName
      );

      landmark.mesh.position.set(px, py, pz);
      this.propsGroup.add(landmark.mesh);

      this.scannableProps.push({
        mesh: landmark.mesh,
        name: landmark.name,
        info: landmark.info,
      });
    }
  }

  private createAtmosphericParticles(
    particleType: 'dust' | 'snow' | 'ash' | 'spores' | 'mist',
    densityMultiplier: number
  ): THREE.Points {
    const count = Math.floor(650 * densityMultiplier);
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const box = 180;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * box;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * box;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pTexture = ParticleTextureGenerator.getParticleTexture(particleType);
    const atmo = this.planet.profile.atmosphere;

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(atmo.particleColor || atmo.fogColor),
      size: particleType === 'snow' ? 3.0 : 2.2,
      map: pTexture,
      transparent: true,
      opacity: particleType === 'spores' ? 0.75 : 0.6,
      blending: particleType === 'spores' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });

    return new THREE.Points(geo, mat);
  }

  /**
   * Creates a distant mountainous horizon cylinder/ring to provide true planetary scale
   */
  private createDistantHorizon(): THREE.Mesh {
    const radius = 1800;
    const height = 320;
    const segments = 64;
    const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true);

    // Modulate top vertices to form jagged peaks
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const peakHeight = Math.abs(this.noise.noise2D(x * 0.003, z * 0.003)) * 140;
        pos.setY(i, y + peakHeight);
      }
    }
    geo.computeVertexNormals();

    const horizonColor = new THREE.Color(this.site.region.localSurfacePalette.midland).lerp(
      new THREE.Color(this.planet.profile.atmosphere.fogColor),
      0.85
    );

    const mat = new THREE.MeshBasicMaterial({
      color: horizonColor,
      side: THREE.BackSide,
      fog: true,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    return mesh;
  }

  public dispose(): void {
    this.proceduralSky.dispose();
    for (const [, mesh] of this.activeChunks) {
      mesh.geometry.dispose();
    }
    for (const [, mesh] of this.activeLiquidChunks) {
      mesh.geometry.dispose();
    }
    for (const [, floraList] of this.activeFloraChunks) {
      for (const f of floraList) {
        f.geometry.dispose();
      }
    }
    if (this.distantHorizonRing) {
      this.distantHorizonRing.geometry.dispose();
    }
    this.terrainGroup.clear();
    this.liquidGroup.clear();
    this.propsGroup.clear();
    this.floraGroup.clear();
    this.faunaPopulationManager.faunaGroup.clear();
    this.resourceManager.resourceGroup.clear();
    this.creditPickupManager.pickupGroup.clear();
  }
}
