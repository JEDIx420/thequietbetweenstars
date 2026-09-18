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
import { HeightfieldCache } from './HeightfieldCache';
import { SpatialHash } from '../performance/SpatialHash';
import { FrameBudgetQueue } from '../performance/FrameBudgetQueue';
import { SurfaceGeneratorService } from './SurfaceGeneratorService';
import {
  generateChunkHeightsProgressive,
  type SurfaceGenerationTaskRequest,
} from '../workers/surfaceGeneration.worker';

export interface SurfaceSceneOptions {
  deferHeavyInitialization?: boolean;
}

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
  private chunkSize = 250;
  private chunkSegments = 32;
  private heightfieldCache: HeightfieldCache;
  private lastChunkX: number | null = null;
  private lastChunkZ: number | null = null;
  private isDisposed = false;
  private pendingWorkerChunks: Set<string> = new Set();
  private centerChunkKey: string | null = null;

  // Ocean / liquid plane
  private liquidGroup = new THREE.Group();
  private activeLiquidChunks: Map<string, THREE.Mesh> = new Map();

  // Environmental props, flora & landmarks
  private propsGroup = new THREE.Group();
  private floraGroup = new THREE.Group();
  private activeFloraChunks: Map<string, THREE.InstancedMesh[]> = new Map();
  private activePropChunks: Map<string, { meshes: THREE.Object3D[]; scannableIds: string[] }> = new Map();
  private scannableProps: Array<{ mesh: THREE.Object3D; name: string; info: string }> = [];
  private spatialHash = new SpatialHash<{ mesh: THREE.Object3D; name: string; info: string }>(60);

  // Living Ecology, Sentient Species & Resource Nodes
  public ecologyProfile: PlanetEcologyProfile;
  public sentientProfile: SentientSpeciesProfile | null;
  public notableNPCs: NPCIdentity[] = [];
  public faunaPopulationManager: FaunaPopulationManager;
  public resourceManager: ResourceNodeManager;

  // Coherent noise engine
  private noise: SimplexNoise2D;

  // Scratch vectors for zero allocation hot-loop
  private scratchForward = new THREE.Vector3();
  private scratchTargetVel = new THREE.Vector3();
  private scratchP1 = new THREE.Vector3();
  private scratchP2 = new THREE.Vector3();
  private scratchP3 = new THREE.Vector3();
  private scratchP4 = new THREE.Vector3();
  private scratchCamOffset = new THREE.Vector3();
  private scratchTargetCamPos = new THREE.Vector3();
  private scratchTargetCamLook = new THREE.Vector3();
  private scratchRight = new THREE.Vector3();
  private scratchDesiredUp = new THREE.Vector3();
  private scratchLookOffset = new THREE.Vector3(0, 0.6, 0);
  private boundGetHeight = (x: number, z: number): number => this.getTerrainHeight(x, z);

  // Cached scan / telemetry results for sim cadence gating
  private cachedScanTarget: { name: string; info: string; isSentient?: boolean; npcData?: NPCIdentity } | null = null;
  private cachedNearbyResource: SampleNode | null = null;
  private cachedCollectedCredits: Array<{ id: string; amount: number; tier: string }> = [];
  private cachedNearestPickups: Array<{ position: THREE.Vector3; amount: number }> = [];

  public get activeTerrainChunkCount(): number {
    return this.activeChunks.size;
  }
  public get activeFloraChunkCount(): number {
    return this.activeFloraChunks.size;
  }
  public get activePropChunkCount(): number {
    return this.activePropChunks.size;
  }

  public isCenterReady(): boolean {
    return this.centerChunkKey !== null && this.activeChunks.has(this.centerChunkKey);
  }

  constructor(
    planet: PlanetDescriptor,
    site: LandingSite,
    initialCollectedCreditIds: string[] = [],
    options?: SurfaceSceneOptions
  ) {
    this.planet = planet;
    this.site = site;
    const profile = planet.profile;
    const region = site.region;

    this.scene = new THREE.Scene();
    this.noise = new SimplexNoise2D(region.regionSeed || planet.seed);
    this.heightfieldCache = new HeightfieldCache(
      (x, z) => this.computeRawTerrainHeight(x, z),
      this.chunkSize,
      this.chunkSegments,
      64
    );

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
    this.scene.fog = new THREE.FogExp2(new THREE.Color(fogColorHex), Math.min(fogDensity, 0.0016));

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
    this.resourceManager = new ResourceNodeManager(
      region,
      this.shipPosition,
      options?.deferHeavyInitialization
        ? (x, z) => this.computeRawTerrainHeight(x, z)
        : (x, z) => this.getTerrainHeight(x, z)
    );
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
    const initGround = options?.deferHeavyInitialization
      ? this.computeRawTerrainHeight(0, 0)
      : this.getTerrainHeight(0, 0);
    this.pilotDesiredWorldAltitude = initGround + this.desiredAltitudeAGL;
    this.filteredTerrainSafetyFloor = initGround + this.minAltitudeAGL;
    this.shipPosition.set(0, this.pilotDesiredWorldAltitude, 0);
    this.shipPhysicsRoot.position.copy(this.shipPosition);
    this.scene.add(this.shipPhysicsRoot);

    // Initial terrain generation
    if (options?.deferHeavyInitialization) {
      const cx = Math.floor(this.shipPosition.x / this.chunkSize);
      const cz = Math.floor(this.shipPosition.z / this.chunkSize);
      this.lastChunkX = cx;
      this.lastChunkZ = cz;
      this.stageInitialChunks(cx, cz);
    } else {
      this.updateTerrain(this.shipPosition);
    }
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
    camera: THREE.PerspectiveCamera,
    schedulerTick?: { didSimTick: boolean; didAmbientTick: boolean; didTelemetryTick: boolean }
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
    this.scratchForward.set(0, 0, -1).applyAxisAngle(SurfaceScene.WORLD_UP, this.shipYaw);
    const speed = input.throttle * 65;
    this.scratchTargetVel.copy(this.scratchForward).multiplyScalar(speed);

    this.shipVelocity.lerp(this.scratchTargetVel, clampedDt * 3.5);
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

    this.scratchP1.copy(this.shipPosition).addScaledVector(this.scratchForward, d1);
    this.scratchP2.copy(this.shipPosition).addScaledVector(this.scratchForward, d2);
    this.scratchP3.copy(this.shipPosition).addScaledVector(this.scratchForward, d3);
    this.scratchP4.copy(this.shipPosition).addScaledVector(this.scratchForward, d4);

    const h1 = this.getTerrainHeight(this.scratchP1.x, this.scratchP1.z);
    const h2 = this.getTerrainHeight(this.scratchP2.x, this.scratchP2.z);
    const h3 = this.getTerrainHeight(this.scratchP3.x, this.scratchP3.z);
    const h4 = this.getTerrainHeight(this.scratchP4.x, this.scratchP4.z);

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

    const camDist = 13.5;
    const camHeight = 3.2;
    const lookDist = 7.0;
    const lookHeight = 0.8;

    this.scratchCamOffset.set(0, camHeight, camDist).applyAxisAngle(SurfaceScene.WORLD_UP, this.shipYaw);
    this.scratchTargetCamPos.copy(this.shipPosition).add(this.scratchCamOffset);
    this.scratchLookOffset.set(0, lookHeight, 0);
    this.scratchTargetCamLook.copy(this.shipPosition)
      .addScaledVector(this.scratchForward, lookDist)
      .add(this.scratchLookOffset);

    if (!this.isCamInitialized) {
      this.smoothedCamPos.copy(this.scratchTargetCamPos);
      this.smoothedCamLook.copy(this.scratchTargetCamLook);
      this.isCamInitialized = true;
    } else {
      this.smoothedCamPos.lerp(this.scratchTargetCamPos, clampedDt * 5.0);
      this.smoothedCamLook.lerp(this.scratchTargetCamLook, clampedDt * 6.5);
    }

    this.scratchRight.crossVectors(this.scratchForward, SurfaceScene.WORLD_UP).normalize();
    this.scratchDesiredUp.copy(SurfaceScene.WORLD_UP)
      .addScaledVector(this.scratchRight, -Math.sin(targetCameraBank))
      .normalize();

    const upAlignment = camera.up.dot(SurfaceScene.WORLD_UP);
    const recoveryRate = upAlignment < 0.2 ? 9.0 : 4.5;
    camera.up.lerp(this.scratchDesiredUp, clampedDt * recoveryRate).normalize();

    camera.position.copy(this.smoothedCamPos);
    camera.lookAt(this.smoothedCamLook);

    this.proceduralSky.update(camera.position);
    if (this.distantHorizonRing) {
      this.distantHorizonRing.position.set(camera.position.x, 0, camera.position.z);
    }

    if (this.particlePoints) {
      this.particlePoints.position.copy(this.shipPosition);
    }

    const shouldSim = !schedulerTick || schedulerTick.didSimTick;
    const shouldAmbient = !schedulerTick || schedulerTick.didAmbientTick;
    const shouldTelemetry = !schedulerTick || schedulerTick.didTelemetryTick;

    if (shouldAmbient && this.scene.fog instanceof THREE.FogExp2) {
      this.currentAtmosphereState = this.atmosphereDirector.update(
        clampedDt,
        this.sunLight,
        this.hemiLight,
        this.scene.fog,
        this.proceduralSky
      );
    }

    if (shouldSim) {
      // 7. Update Survey Credit Pickups (Fly-Through Auto-Collect & Magnetism)
      this.cachedCollectedCredits = this.creditPickupManager.update(
        this.shipPosition,
        clampedDt,
        this.boundGetHeight
      );
      this.cachedNearestPickups = this.creditPickupManager.getNearestPickups(this.shipPosition, 4);

      // 8. Update streamed living ecology & Giant encounters
      this.faunaPopulationManager.update(
        this.shipPosition,
        input.throttle,
        clampedDt,
        this.boundGetHeight
      );

      // 9. Terrain and liquid streaming updates
      this.updateTerrain(this.shipPosition);

      // 10. Check for nearby scannable landmark, fauna, sentient giant, or survey sample
      this.updateScanTargets();
    } else {
      this.cachedCollectedCredits = [];
    }

    const altitudeAGL = Math.max(0, Math.round(this.shipPosition.y - currentGround));
    const speedMps = Math.round(this.shipVelocity.length());

    // Record Telemetry at telemetry cadence
    if (shouldTelemetry) {
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
    }

    // Process queued terrain chunks progressively within frame budget (2.5ms max)
    FrameBudgetQueue.getInstance().process(2.5);

    return {
      activeScanTarget: this.cachedScanTarget,
      nearbyResource: this.cachedNearbyResource,
      altitudeAGL,
      speedMps,
      collectedCredits: this.cachedCollectedCredits,
      nearestCreditPickups: this.cachedNearestPickups,
    };
  }

  private updateScanTargets(): void {
    let scanTarget: { name: string; info: string; isSentient?: boolean; npcData?: NPCIdentity } | null = null;
    let minDist = 65;

    // Check props & landmarks via spatial hash
    const nearbyProps = this.spatialHash.queryRadius(this.shipPosition.x, this.shipPosition.z, minDist);
    for (const entry of nearbyProps) {
      const dist = Math.sqrt(entry.distSq);
      if (dist < minDist) {
        minDist = dist;
        scanTarget = { name: entry.data.name, info: entry.data.info };
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

    // Direct proximity to guaranteed giant encounter sites (up to 120m)
    for (const site of this.faunaPopulationManager.encounterSites) {
      const dist = this.shipPosition.distanceTo(site.position);
      if (dist < 120) {
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

    this.cachedScanTarget = scanTarget;
    this.cachedNearbyResource = nearbyResource;
  }

  public getTerrainHeight(x: number, z: number): number {
    return this.heightfieldCache.sample(x, z);
  }

  public computeRawTerrainHeight(x: number, z: number): number {
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

      case 'bioluminescent_archipelago': {
        // Island atolls and submerged reefs in warm alien shallows
        const seaFloor = this.noise.fbm2D(wx * 0.003, wz * 0.003, 3, 2.0, 0.5) * 8.0 - 6.0;
        const islandSpires = Math.pow(Math.max(0, this.noise.ridged2D(wx * 0.006, wz * 0.006, 3, 2.0, 0.55)), 1.8) * 36.0;
        const lagoon = this.noise.noise2D(wx * 0.012, wz * 0.012) * 4.0;
        elevation = seaFloor + islandSpires + lagoon;
        break;
      }

      case 'obsidian_caldera': {
        // Massive circular caldera basin bordered by high basalt rims and geyser mounds
        const calderaNoise = this.noise.fbm2D(wx * 0.004, wz * 0.004, 4, 2.0, 0.5);
        const rim = Math.sin(calderaNoise * Math.PI * 2) * 28.0;
        const craterDrop = Math.abs(this.noise.noise2D(wx * 0.007, wz * 0.007)) < 0.3 ? -35.0 : 0;
        const basaltPillars = Math.max(0, this.noise.noise2D(wx * 0.02, wz * 0.02)) * 12.0;
        elevation = rim + craterDrop + basaltPillars;
        break;
      }

      case 'glacial_chasm': {
        // Sheer ice rift walls and profound abyssal crevasses
        const glacier = this.noise.ridged2D(wx * 0.005, wz * 0.005, 4, 2.2, 0.5) * 34.0;
        const chasm = Math.abs(this.noise.noise2D(wx * 0.01, wz * 0.01));
        const chasmDrop = chasm < 0.16 ? -(0.16 - chasm) * 60.0 : 0;
        elevation = glacier + chasmDrop;
        break;
      }

      case 'floating_mesas': {
        // Soaring sheer-walled tablelands and giant step pillars
        const base = this.noise.fbm2D(wx * 0.004, wz * 0.004, 3, 2.0, 0.5);
        const stepped = SimplexNoise2D.terrace(base * 0.5 + 0.5, 3, 0.95) * 45.0 - 15.0;
        const sheer = this.noise.noise2D(wx * 0.018, wz * 0.018) * 4.0;
        elevation = stepped + sheer;
        break;
      }

      case 'spore_grotto': {
        // Undulating fungal mounds, crater basins, and subterranean cavern entrances
        const mounds = Math.sin(wx * 0.015) * Math.cos(wz * 0.015) * 14.0;
        const basin = this.noise.fbm2D(wx * 0.005, wz * 0.005, 3, 2.0, 0.5) * 18.0;
        elevation = mounds + basin;
        break;
      }

      case 'plasma_fractures': {
        // Electrified fault lines and tiered plateau shoulders
        const ridges = this.noise.ridged2D(wx * 0.007, wz * 0.007, 3, 2.2, 0.6) * 30.0;
        const rift = Math.abs(this.noise.noise2D(wx * 0.014, wz * 0.014));
        const plasmaDrop = rift < 0.15 ? -(0.15 - rift) * 58.0 : 0;
        elevation = ridges + plasmaDrop;
        break;
      }

      case 'fungal_canopy': {
        // Undulating bulbous mounds and stepped spore plateaus
        const bulbous = (Math.sin(wx * 0.018) + Math.cos(wz * 0.018)) * 12.0;
        const shelf = SimplexNoise2D.terrace(this.noise.fbm2D(wx * 0.004, wz * 0.004, 3) * 0.5 + 0.5, 4, 0.8) * 28.0 - 10.0;
        elevation = bulbous + shelf;
        break;
      }

      case 'shattered_monoliths': {
        // Sharp stepped anti-gravity monolith tablelands with vertical drop-offs
        const base = this.noise.fbm2D(wx * 0.005, wz * 0.005, 4, 2.0, 0.5);
        const stepped = SimplexNoise2D.terrace(base * 0.5 + 0.5, 5, 0.96) * 52.0 - 18.0;
        const fissure = Math.abs(this.noise.noise2D(wx * 0.015, wz * 0.015));
        const rift = fissure < 0.12 ? -(0.12 - fissure) * 65.0 : 0;
        elevation = stepped + rift;
        break;
      }

      case 'primordial_jungle': {
        // Meandering river valleys, organic undulating hills, and rounded limestone karsts
        const hills = this.noise.fbm2D(wx * 0.004, wz * 0.004, 4, 2.0, 0.5) * 22.0;
        const karsts = Math.pow(Math.max(0, this.noise.noise2D(wx * 0.008, wz * 0.008)), 2.0) * 32.0;
        const riverCut = Math.abs(this.noise.noise2D(wx * 0.005, wz * 0.005));
        const river = riverCut < 0.14 ? -(0.14 - riverCut) * 28.0 : 0;
        elevation = hills + karsts + river;
        break;
      }

      case 'neon_badlands': {
        // Supercritical radioactive eroded ridges, jagged peaks, and sinkhole vents
        const jagged = this.noise.ridged2D(wx * 0.008, wz * 0.008, 4, 2.3, 0.6) * 36.0;
        const craters = Math.sin(wx * 0.012) * Math.sin(wz * 0.012) * 10.0;
        elevation = jagged + craters;
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

    // Boundary check: skip re-evaluation if still inside current chunk
    if (cx === this.lastChunkX && cz === this.lastChunkZ) {
      return;
    }
    this.lastChunkX = cx;
    this.lastChunkZ = cz;

    const radius = 2; // 5x5 chunks around ship (1,250m huge map expanse)
    const activeKeys = new Set<string>();

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        activeKeys.add(key);

        if (!this.activeChunks.has(key)) {
          const chunkX = cx + dx;
          const chunkZ = cz + dz;
          this.buildChunk(chunkX, chunkZ, key);
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

        // Unload distant landmark props and prevent memory / array leaks
        const propData = this.activePropChunks.get(key);
        if (propData) {
          for (const pMesh of propData.meshes) {
            this.propsGroup.remove(pMesh);
            pMesh.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry?.dispose();
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((m) => m.dispose());
                } else if (obj.material) {
                  obj.material.dispose();
                }
              }
            });
          }
          for (const sId of propData.scannableIds) {
            this.spatialHash.remove(sId);
          }
          const removedMeshes = new Set(propData.meshes);
          this.scannableProps = this.scannableProps.filter((p) => !removedMeshes.has(p.mesh));
          this.activePropChunks.delete(key);
        }
      }
    }
  }

  private buildChunk(chunkX: number, chunkZ: number, key: string): void {
    if (this.activeChunks.has(key)) return;

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
      this.boundGetHeight
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

  private enqueueChunkConstruction(chunkX: number, chunkZ: number, key: string, priority: number): void {
    if (!this.activeChunks.has(key)) {
      FrameBudgetQueue.getInstance().enqueue(`surface-chunk-${chunkX}-${chunkZ}`, () => {
        if (!this.isDisposed && !this.activeChunks.has(key)) {
          this.buildChunk(chunkX, chunkZ, key);
        }
      }, priority);
    }
  }

  private requestAndStageChunk(chunkX: number, chunkZ: number, priority: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.activeChunks.has(key)) return;

    // If heightfield is already cached, enqueue construction immediately
    if (this.heightfieldCache.hasChunk(chunkX, chunkZ)) {
      this.enqueueChunkConstruction(chunkX, chunkZ, key, priority);
      return;
    }

    // Prevent duplicate worker requests
    if (this.pendingWorkerChunks.has(key)) return;
    this.pendingWorkerChunks.add(key);

    const task: SurfaceGenerationTaskRequest = {
      id: `${chunkX}:${chunkZ}`,
      cx: chunkX,
      cz: chunkZ,
      chunkSize: this.chunkSize,
      segments: this.chunkSegments,
      regionSeed: this.site.region.regionSeed || this.planet.seed,
      morphology: this.site.region.terrainMorphologyOverride,
      heightScale: this.site.region.heightScale,
      roughness: this.site.region.roughness,
      domainWarp: this.planet.profile.terrain.domainWarp,
      duneStrength: this.site.region.duneStrength,
      canyonStrength: this.site.region.canyonStrength,
      ridgeStrength: this.site.region.ridgeStrength,
    };

    const service = SurfaceGeneratorService.getInstance();
    service.requestChunkHeights(task).then((res) => {
      this.pendingWorkerChunks.delete(key);
      if (this.isDisposed) return;

      this.heightfieldCache.insertChunk(res.cx, res.cz, res.heights, res.minY, res.maxY);
      this.enqueueChunkConstruction(chunkX, chunkZ, key, priority);
    }).catch((err) => {
      console.warn(`[SurfaceScene] Worker generation failed for chunk (${chunkX}, ${chunkZ}), retrying via progressive fallback`, err);
      if (this.isDisposed) {
        this.pendingWorkerChunks.delete(key);
        return;
      }

      // Retry through progressive main-thread fallback rather than synchronous generation
      generateChunkHeightsProgressive(task).then((res) => {
        this.pendingWorkerChunks.delete(key);
        if (this.isDisposed) return;

        this.heightfieldCache.insertChunk(chunkX, chunkZ, res.heights, res.minY, res.maxY);
        this.enqueueChunkConstruction(chunkX, chunkZ, key, priority);
      }).catch((fallbackErr) => {
        this.pendingWorkerChunks.delete(key);
        console.error(`[SurfaceScene] Progressive fallback also failed for chunk (${chunkX}, ${chunkZ})`, fallbackErr);
      });
    });
  }

  private stageInitialChunks(cx: number, cz: number): void {
    this.centerChunkKey = `${cx},${cz}`;
    // Center chunk (highest priority 10)
    this.requestAndStageChunk(cx, cz, 10);

    // Immediate landing zone chunks (priority 5)
    const radius = 1;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue;
        this.requestAndStageChunk(cx + dx, cz + dz, 5);
      }
    }
  }

  public finishPreparation(): void {
    // Only finalize already-prepared state. Under no circumstances do we synchronously build missing chunks.
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

    // Read heights directly from precomputed heightfield grid
    const chunkData = this.heightfieldCache.getChunkHeightfield(cx, cz);
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, chunkData.heights[i]);
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
    const key = `${cx},${cz}`;
    const chunkSeed = SeededRandom.hashCoords(this.planet.seed, cx, 0, cz);
    const rng = new SeededRandom(chunkSeed);
    const profile = this.planet.profile;
    const region = this.site.region;

    const meshes: THREE.Object3D[] = [];
    const scannableIds: string[] = [];

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
      meshes.push(landmark.mesh);

      const propId = `landmark_${cx}_${cz}_${i}`;
      const propEntry = {
        mesh: landmark.mesh,
        name: landmark.name,
        info: landmark.info,
      };
      this.scannableProps.push(propEntry);
      this.spatialHash.insert(propId, px, pz, propEntry);
      scannableIds.push(propId);
    }

    this.activePropChunks.set(key, { meshes, scannableIds });
  }

  private createAtmosphericParticles(
    particleType: 'dust' | 'snow' | 'ash' | 'spores' | 'mist' | 'plasma_sparks' | 'geiger_glow',
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

    const isLuminescent = particleType === 'spores' || particleType === 'plasma_sparks' || particleType === 'geiger_glow';
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(atmo.particleColor || atmo.fogColor),
      size: particleType === 'snow' ? 3.0 : (particleType === 'plasma_sparks' ? 2.8 : 2.2),
      map: pTexture,
      transparent: true,
      opacity: isLuminescent ? 0.8 : 0.6,
      blending: isLuminescent ? THREE.AdditiveBlending : THREE.NormalBlending,
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
    this.isDisposed = true;
    this.pendingWorkerChunks.clear();
    FrameBudgetQueue.getInstance().clear();
    this.heightfieldCache.clear();
    this.proceduralSky.dispose();
    this.faunaPopulationManager.dispose();
    this.resourceManager.dispose();
    this.creditPickupManager.dispose();

    for (const [, mesh] of this.activeChunks) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const [, mesh] of this.activeLiquidChunks) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const [, floraList] of this.activeFloraChunks) {
      for (const f of floraList) {
        f.geometry.dispose();
        (f.material as THREE.Material).dispose();
      }
    }
    for (const [, propData] of this.activePropChunks) {
      for (const pMesh of propData.meshes) {
        pMesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else if (obj.material) {
              obj.material.dispose();
            }
          }
        });
      }
    }
    this.activePropChunks.clear();
    this.activeChunks.clear();
    this.activeLiquidChunks.clear();
    this.activeFloraChunks.clear();
    this.scannableProps = [];
    this.spatialHash.clear();

    if (this.distantHorizonRing) {
      this.distantHorizonRing.geometry.dispose();
      (this.distantHorizonRing.material as THREE.Material).dispose();
    }
    if (this.particlePoints) {
      this.particlePoints.geometry.dispose();
      (this.particlePoints.material as THREE.Material).dispose();
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
