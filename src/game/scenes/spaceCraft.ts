import * as THREE from 'three';

export type CraftFlightMode = 'space' | 'surface' | 'warp';

interface EngineMeshSet {
  housing: THREE.Mesh;
  core: THREE.Mesh;
  innerPlume: THREE.Mesh;
  outerPlume: THREE.Mesh;
  shockDiamonds: THREE.Mesh;
}

interface WingVaneSet {
  rootPivot: THREE.Group;
  vaneMesh: THREE.Mesh;
  sensorArray: THREE.Mesh;
  strobeLight?: THREE.Mesh;
}

export class SurveyCraft {
  public group: THREE.Group;

  // Visual module hierarchy
  private hullGroup: THREE.Group;
  private cockpitGroup: THREE.Group;
  private sensorGroup: THREE.Group;
  private moduleVisualsGroup: THREE.Group;

  // 4 Articulated Survey Vanes (Upper Left, Upper Right, Lower Left, Lower Right)
  private vaneUL!: WingVaneSet;
  private vaneUR!: WingVaneSet;
  private vaneLL!: WingVaneSet;
  private vaneLR!: WingVaneSet;

  // 4 Engine Thruster Clusters
  private engines: EngineMeshSet[] = [];

  // Strobes & Sensor Emitters
  private sensorDome!: THREE.Mesh;
  private sensorFieldRings: THREE.Mesh[] = [];
  private strobes: THREE.Mesh[] = [];

  // Installed upgrade attachments
  private installedModuleVisuals: Map<string, THREE.Object3D> = new Map();

  // Internal animation state
  private clock = 0;
  private currentMode: CraftFlightMode = 'space';
  private wingSpreadFactor = 1.0; // 1.0 = full X deployment in space, 0.25 = tucked in atmospheric/surface flight

  constructor() {
    this.group = new THREE.Group();

    this.hullGroup = new THREE.Group();
    this.cockpitGroup = new THREE.Group();
    this.sensorGroup = new THREE.Group();
    this.moduleVisualsGroup = new THREE.Group();

    this.group.add(this.hullGroup);
    this.group.add(this.cockpitGroup);
    this.group.add(this.sensorGroup);
    this.group.add(this.moduleVisualsGroup);

    // Modern Sci-Fi Materials
    const primaryMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // Off-white aerospace ceramic
      roughness: 0.32,
      metalness: 0.25,
      flatShading: true,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Scientific cerulean blue accent
      roughness: 0.28,
      metalness: 0.45,
      flatShading: true,
    });

    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark titanium alloy
      roughness: 0.38,
      metalness: 0.88,
    });

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x020617, // Deep tinted obsidian glass
      roughness: 0.04,
      metalness: 0.95,
      envMapIntensity: 1.5,
    });

    const glowCyanMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });

    // 1. Sleek Long Fuselage & Nose Probe
    this.buildFuselage(primaryMat, accentMat, titaniumMat);

    // 2. High-Tech Canopy & Cockpit Frame
    this.buildCockpit(canopyMat, titaniumMat);

    // 3. Nose Sensor Boom & Resonance Array
    this.buildSensorSuite(titaniumMat, glowCyanMat);

    // 4. Four Articulated Survey Vanes
    this.buildFourVanes(primaryMat, accentMat, titaniumMat);

    // 5. Four Ion Engines & Exhaust Plumes
    this.buildFourEngines(titaniumMat);
  }

  private buildFuselage(
    primaryMat: THREE.Material,
    accentMat: THREE.Material,
    darkMat: THREE.Material
  ): void {
    // Slender forward fuselage
    const noseShape = new THREE.ConeGeometry(0.7, 3.2, 6);
    noseShape.rotateX(Math.PI / 2);
    noseShape.scale(1.2, 0.55, 1.0);
    const nose = new THREE.Mesh(noseShape, primaryMat);
    nose.position.set(0, 0.05, -2.4);
    this.hullGroup.add(nose);

    // Mid-section main fuselage
    const midGeo = new THREE.BoxGeometry(1.6, 0.85, 3.2);
    const mid = new THREE.Mesh(midGeo, primaryMat);
    mid.position.set(0, 0.08, 0.3);
    this.hullGroup.add(mid);

    // Ventral reinforcement keel
    const keelGeo = new THREE.BoxGeometry(0.85, 0.38, 3.4);
    const keel = new THREE.Mesh(keelGeo, darkMat);
    keel.position.set(0, -0.42, 0.4);
    this.hullGroup.add(keel);

    // Lateral aerospace intake chamfers
    const intakeGeo = new THREE.BoxGeometry(0.35, 0.55, 1.8);
    const leftIntake = new THREE.Mesh(intakeGeo, accentMat);
    leftIntake.position.set(-0.92, 0.04, 0.6);
    this.hullGroup.add(leftIntake);

    const rightIntake = new THREE.Mesh(intakeGeo, accentMat);
    rightIntake.position.set(0.92, 0.04, 0.6);
    this.hullGroup.add(rightIntake);

    // Rear engine mounting bulkhead
    const bulkheadGeo = new THREE.BoxGeometry(1.7, 0.95, 0.6);
    const bulkhead = new THREE.Mesh(bulkheadGeo, darkMat);
    bulkhead.position.set(0, 0.1, 2.0);
    this.hullGroup.add(bulkhead);
  }

  private buildCockpit(canopyMat: THREE.Material, darkMat: THREE.Material): void {
    // Elongated canopy dome
    const canopyGeo = new THREE.SphereGeometry(0.55, 16, 12);
    canopyGeo.scale(0.82, 0.52, 2.1);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.46, -0.5);
    this.cockpitGroup.add(canopy);

    // Longitudinal cockpit rib
    const ribGeo = new THREE.BoxGeometry(0.12, 0.1, 2.2);
    const rib = new THREE.Mesh(ribGeo, darkMat);
    rib.position.set(0, 0.72, -0.5);
    this.cockpitGroup.add(rib);
  }

  private buildSensorSuite(darkMat: THREE.Material, glowMat: THREE.Material): void {
    // Forward survey needle probe
    const needleGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.6, 8);
    needleGeo.rotateX(Math.PI / 2);
    const needle = new THREE.Mesh(needleGeo, darkMat);
    needle.position.set(0, 0.05, -4.6);
    this.sensorGroup.add(needle);

    // Luminous sensor dome node
    const domeGeo = new THREE.SphereGeometry(0.22, 12, 8);
    this.sensorDome = new THREE.Mesh(domeGeo, glowMat);
    this.sensorDome.position.set(0, 0.05, -3.85);
    this.sensorGroup.add(this.sensorDome);

    // Sensor emitter ring
    const ringGeo = new THREE.TorusGeometry(0.32, 0.03, 6, 16);
    const ring = new THREE.Mesh(ringGeo, glowMat);
    ring.position.set(0, 0.05, -4.1);
    this.sensorGroup.add(ring);
    this.sensorFieldRings.push(ring);
  }

  private buildFourVanes(
    primaryMat: THREE.Material,
    accentMat: THREE.Material,
    darkMat: THREE.Material
  ): void {
    const createVane = (
      name: string,
      xSide: number,
      ySide: number,
      strobeColor?: number
    ): WingVaneSet => {
      const rootPivot = new THREE.Group();
      rootPivot.name = name;
      // Position pivots on the rear fuselage corners
      rootPivot.position.set(xSide * 0.78, ySide * 0.28, 0.8);

      // Swept geometric vane shape
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(2.4, 0.55);
      shape.lineTo(2.2, 1.4);
      shape.lineTo(0, 1.1);
      shape.closePath();

      const vaneGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
      vaneGeo.rotateX(Math.PI / 2);

      const vaneMesh = new THREE.Mesh(vaneGeo, primaryMat);
      // Flip X for left side
      if (xSide < 0) {
        vaneMesh.scale.set(-1, 1, 1);
      }
      rootPivot.add(vaneMesh);

      // Edge sensory fairing / antenna boom at wingtip
      const sensorGeo = new THREE.BoxGeometry(0.1, 0.25, 1.2);
      const sensorArray = new THREE.Mesh(sensorGeo, accentMat);
      sensorArray.position.set(xSide * 2.3, 0, 0.95);
      rootPivot.add(sensorArray);

      // Trailing antenna needle
      const antGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.9, 6);
      antGeo.rotateX(Math.PI / 2);
      const ant = new THREE.Mesh(antGeo, darkMat);
      ant.position.set(xSide * 2.3, 0, 1.8);
      rootPivot.add(ant);

      let strobeLight: THREE.Mesh | undefined;
      if (strobeColor !== undefined) {
        const strobeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const strobeMat = new THREE.MeshBasicMaterial({ color: strobeColor });
        strobeLight = new THREE.Mesh(strobeGeo, strobeMat);
        strobeLight.position.set(xSide * 2.32, 0.14, 0.95);
        rootPivot.add(strobeLight);
        this.strobes.push(strobeLight);
      }

      this.group.add(rootPivot);
      return { rootPivot, vaneMesh, sensorArray, strobeLight };
    };

    // Upper-Left & Upper-Right (Port/Starboard Strobes)
    this.vaneUL = createVane('vaneUL', -1, 1, 0xef4444); // Red port
    this.vaneUR = createVane('vaneUR', 1, 1, 0x22c55e);  // Green starboard

    // Lower-Left & Lower-Right (White trailing strobes)
    this.vaneLL = createVane('vaneLL', -1, -1, 0xf8fafc);
    this.vaneLR = createVane('vaneLR', 1, -1, 0xf8fafc);
  }

  private buildFourEngines(darkMat: THREE.Material): void {
    // 4 distinct engine cluster positions corresponding to the X silhouette
    const engineOffsets = [
      { x: -0.65, y: 0.42, z: 2.1 },  // Upper Left
      { x: 0.65, y: 0.42, z: 2.1 },   // Upper Right
      { x: -0.65, y: -0.32, z: 2.1 }, // Lower Left
      { x: 0.65, y: -0.32, z: 2.1 },  // Lower Right
    ];

    const coreHeight = 0.6;
    const coreGeo = new THREE.CylinderGeometry(0.08, 0.20, coreHeight, 12);
    coreGeo.translate(0, coreHeight / 2, 0);
    coreGeo.rotateX(Math.PI / 2);

    const innerHeight = 2.4;
    const innerGeo = new THREE.ConeGeometry(0.24, innerHeight, 12);
    innerGeo.translate(0, innerHeight / 2, 0);
    innerGeo.rotateX(Math.PI / 2);

    const outerHeight = 3.6;
    const outerGeo = new THREE.ConeGeometry(0.36, outerHeight, 12);
    outerGeo.translate(0, outerHeight / 2, 0);
    outerGeo.rotateX(Math.PI / 2);

    // Shock diamond supersonic expansion disc
    const shockHeight = 2.0;
    const shockGeo = new THREE.CylinderGeometry(0.03, 0.16, shockHeight, 8);
    shockGeo.translate(0, shockHeight / 2, 0);
    shockGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < 4; i++) {
      const pos = engineOffsets[i];
      // Housing is length 1.1 centered at pos.z; rear exhaust rim is at pos.z + 0.55
      const nozzleZ = pos.z + 0.55;

      // Cylindrical engine housing
      const housingGeo = new THREE.CylinderGeometry(0.26, 0.28, 1.1, 12);
      housingGeo.rotateX(Math.PI / 2);
      const housing = new THREE.Mesh(housingGeo, darkMat);
      housing.position.set(pos.x, pos.y, pos.z);
      this.hullGroup.add(housing);

      // Hot white emission core anchored right at nozzle exit
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(pos.x, pos.y, nozzleZ);
      this.hullGroup.add(core);

      // Cyan energetic inner plume extending purely backward (+Z)
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const innerPlume = new THREE.Mesh(innerGeo, innerMat);
      innerPlume.position.set(pos.x, pos.y, nozzleZ);
      this.hullGroup.add(innerPlume);

      // Translucent deep electric blue outer plume extending purely backward (+Z)
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      });
      const outerPlume = new THREE.Mesh(outerGeo, outerMat);
      outerPlume.position.set(pos.x, pos.y, nozzleZ);
      this.hullGroup.add(outerPlume);

      // Shock diamonds glowing filament anchored at nozzle exit
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const shockDiamonds = new THREE.Mesh(shockGeo, shockMat);
      shockDiamonds.position.set(pos.x, pos.y, nozzleZ);
      this.hullGroup.add(shockDiamonds);

      this.engines.push({ housing, core, innerPlume, outerPlume, shockDiamonds });
    }
  }

  public setInstalledModules(moduleIds: string[]): void {
    // Clear existing module visuals
    for (const obj of this.installedModuleVisuals.values()) {
      this.moduleVisualsGroup.remove(obj);
    }
    this.installedModuleVisuals.clear();

    const upgradeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.75,
    });

    for (const id of moduleIds) {
      if (id === 'mod_propulsion_ion_vector') {
        // 4 glowing ion vector rings at each of the 4 engine nozzles
        const ringGeo = new THREE.TorusGeometry(0.32, 0.04, 6, 16);
        const group = new THREE.Group();
        const positions = [
          [-0.65, 0.42, 2.65],
          [0.65, 0.42, 2.65],
          [-0.65, -0.32, 2.65],
          [0.65, -0.32, 2.65],
        ];
        for (const [px, py, pz] of positions) {
          const ring = new THREE.Mesh(ringGeo, upgradeMat);
          ring.position.set(px, py, pz);
          group.add(ring);
        }
        this.moduleVisualsGroup.add(group);
        this.installedModuleVisuals.set(id, group);
      } else if (id === 'mod_surface_grav_stabilizer') {
        // Gravitic field coils integrated at the wing roots
        const coilGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8);
        coilGeo.rotateX(Math.PI / 2);
        const group = new THREE.Group();
        const leftCoil = new THREE.Mesh(coilGeo, upgradeMat);
        leftCoil.position.set(-1.1, -0.1, 0.8);
        const rightCoil = new THREE.Mesh(coilGeo, upgradeMat);
        rightCoil.position.set(1.1, -0.1, 0.8);
        group.add(leftCoil);
        group.add(rightCoil);
        this.moduleVisualsGroup.add(group);
        this.installedModuleVisuals.set(id, group);
      } else if (id === 'mod_scanner_deep_ecology') {
        // Crown sensor array mounted behind canopy
        const crownGeo = new THREE.CylinderGeometry(0.3, 0.42, 0.25, 6);
        const crown = new THREE.Mesh(crownGeo, upgradeMat);
        crown.position.set(0, 0.62, 0.8);
        this.moduleVisualsGroup.add(crown);
        this.installedModuleVisuals.set(id, crown);
      } else if (id === 'mod_field_warp_stabilizer') {
        // Dorsal resonance spine
        const spineGeo = new THREE.BoxGeometry(0.12, 0.35, 2.2);
        const spine = new THREE.Mesh(spineGeo, upgradeMat);
        spine.position.set(0, 0.6, 1.4);
        this.moduleVisualsGroup.add(spine);
        this.installedModuleVisuals.set(id, spine);
      }
    }
  }

  public setFlightMode(mode: CraftFlightMode): void {
    this.currentMode = mode;
  }

  /**
   * Updates craft internal animations ONLY.
   * STRICT RULE: Never modifies this.group.rotation or this.group.quaternion.
   */
  public updateVisuals(
    dt: number,
    throttle: number,
    mode: CraftFlightMode = 'space'
  ): void {
    this.clock += dt;
    this.currentMode = mode;

    // 1. Articulated Survey Vane Positioning
    // In SPACE: full X configuration (spread factor 1.0)
    // In SURFACE/ATMOSPHERE: folded/narrowed configuration (spread factor 0.25)
    // In WARP: tightened inline configuration (spread factor 0.55)
    let targetSpread = 1.0;
    if (this.currentMode === 'surface') {
      targetSpread = 0.28;
    } else if (this.currentMode === 'warp') {
      targetSpread = 0.55;
    }

    this.wingSpreadFactor += (targetSpread - this.wingSpreadFactor) * Math.min(1, dt * 3.5);

    // Deploy angle: ~22 degrees in full X
    const spreadAngle = this.wingSpreadFactor * 0.38;

    // Upper vanes tilt upward (+Z roll), Lower vanes tilt downward (-Z roll)
    this.vaneUL.rootPivot.rotation.z = -spreadAngle;
    this.vaneUR.rootPivot.rotation.z = spreadAngle;
    this.vaneLL.rootPivot.rotation.z = spreadAngle * 0.9;
    this.vaneLR.rootPivot.rotation.z = -spreadAngle * 0.9;

    // 2. Dynamic 4-Engine Powerful Afterburner Plumes
    const t = Math.max(0.06, throttle);
    const flicker = 1.0 + Math.sin(this.clock * 42.0) * 0.12 + Math.cos(this.clock * 74.0) * 0.06;
    const boostMult = t > 0.85 ? 1.45 : 1.0;

    for (const eng of this.engines) {
      eng.core.scale.set(0.9 + t * 0.5, 0.9 + t * 0.5, (0.6 + t * 2.2) * flicker * boostMult);
      eng.innerPlume.scale.set(0.8 + t * 0.8, 0.8 + t * 0.8, (0.5 + t * 4.2) * flicker * boostMult);
      eng.outerPlume.scale.set(0.9 + t * 1.1, 0.9 + t * 1.1, (0.4 + t * 5.0) * flicker * boostMult);
      eng.shockDiamonds.scale.set(1.0 + t * 0.6, 1.0 + t * 0.6, (0.3 + t * 3.8) * flicker);
      (eng.shockDiamonds.material as THREE.MeshBasicMaterial).opacity = 0.2 + t * 0.75;
    }

    // 3. Sensor Suite Pulsing
    const pulse = 0.65 + Math.sin(this.clock * 3.5) * 0.3;
    (this.sensorDome.material as THREE.MeshBasicMaterial).opacity = pulse;
    for (const r of this.sensorFieldRings) {
      r.scale.setScalar(0.95 + pulse * 0.12);
    }

    // 4. Strobe Flashing (1.2 Hz)
    const strobeState = Math.sin(this.clock * 7.54) > 0.88;
    for (const s of this.strobes) {
      s.visible = strobeState;
    }
  }

  // Backward compatibility alias for legacy callers
  public update(dt: number, throttle: number, _steeringYaw = 0, _steeringPitch = 0): void {
    this.updateVisuals(dt, throttle, this.currentMode);
  }
}
