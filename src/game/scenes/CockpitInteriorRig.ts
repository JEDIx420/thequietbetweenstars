import * as THREE from 'three';

export interface CockpitInputState {
  throttle: number;         // 0.0 to 1.0
  pitchInput: number;       // -1.0 (down) to +1.0 (up)
  yawInput: number;         // -1.0 (left) to +1.0 (right)
  rollInput: number;        // -1.0 (left) to +1.0 (right)
  speed: number;            // current speed in m/s
  maxSpeed: number;         // max cruise speed
  boostActive?: boolean;
}

/**
 * CockpitInteriorRig
 * 
 * First-person cockpit view model parented directly to the camera in camera-local space.
 * 
 * Camera-Local Coordinate Conventions:
 * - Camera eye is at (0, 0, 0).
 * - Forward look vector is along -Z.
 * - Up vector is along +Y.
 * - Right vector is along +X.
 * 
 * Composition & Screen Proportions (16:9 and mobile landscape):
 * - ~70%+ of screen area is completely clear windshield / outside universe.
 * - Lower ~25% contains the angled dashboard console and active holographic MFDs.
 * - Narrow titanium A-pillars frame the far left and right edges with no center roof obstruction.
 * - No giant tinted sphere geometry to avoid visual clipping, glare, or color distortion.
 * - Pilot arms and controls are positioned comfortably in the bottom corners (throttle left, stick right).
 * - Internal cockpit lighting ensures instruments and pilot hands remain legible in deep space.
 */
export class CockpitInteriorRig {
  public group: THREE.Group;

  // Structural Framing & Lighting
  private frameGroup: THREE.Group;

  // Instrument Console & MFDs
  private dashGroup: THREE.Group;
  private throttleBarSegments: THREE.Mesh[] = [];
  private speedBarMesh!: THREE.Mesh;
  private artificialHorizonLine!: THREE.Mesh;
  private hudReticle!: THREE.Mesh;

  // Left Arm & Throttle Lever (Bottom-Left Corner)
  private throttlePivot: THREE.Group;
  private leftArmGroup: THREE.Group;
  private leftHandGlove!: THREE.Mesh;

  // Right Arm & HOTAS Flight Stick (Bottom-Right Corner)
  private stickPivot: THREE.Group;
  private stickGrip!: THREE.Mesh;
  private rightArmGroup: THREE.Group;
  private rightHandGlove!: THREE.Mesh;

  // Internal Animation State
  private currentThrottle = 0;
  private targetThrottle = 0;
  private stickPitchAngle = 0;
  private stickRollAngle = 0;
  private breathClock = 0;
  private isVisible = false;

  // Static scratch objects for zero-allocation 60 FPS updates
  private static readonly scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CockpitInteriorRig';

    this.frameGroup = new THREE.Group();
    this.dashGroup = new THREE.Group();
    this.throttlePivot = new THREE.Group();
    this.leftArmGroup = new THREE.Group();
    this.stickPivot = new THREE.Group();
    this.rightArmGroup = new THREE.Group();

    this.group.add(this.frameGroup);
    this.group.add(this.dashGroup);

    // Build Cockpit Subsystems
    this.buildInternalLighting();
    this.buildCanopyFrame();
    this.buildInstrumentDashboard();
    this.buildThrottleQuadrant();
    this.buildFlightControlStick();
    this.buildPilotArms();

    // Default to hidden until first-person cockpit mode is activated
    this.setVisible(false);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible;
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Internal Flight Deck Lighting
   * Ensures cockpit instruments, frame, and hands are consistently visible
   * regardless of the ship's heading relative to external stars.
   */
  private buildInternalLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.45);
    this.group.add(ambientLight);

    const cowlLight = new THREE.PointLight(0x38bdf8, 0.6, 2.2);
    cowlLight.position.set(0, -0.22, -0.55);
    this.group.add(cowlLight);

    const cabinFill = new THREE.PointLight(0xf1f5f9, 0.35, 2.5);
    cabinFill.position.set(0, 0.15, -0.25);
    this.group.add(cabinFill);
  }

  /**
   * 1. Canopy Structural Frame
   * Narrow A-pillars on far left/right edges with clean top header spar.
   * Leaves >70% of the screen completely unobstructed.
   */
  private buildCanopyFrame(): void {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark titanium aerospace composite
      metalness: 0.85,
      roughness: 0.35,
      flatShading: true,
    });

    // Left A-Pillar (Angled strut on far left edge of view)
    const leftPillarGeo = new THREE.CylinderGeometry(0.016, 0.022, 0.78, 6);
    const leftPillar = new THREE.Mesh(leftPillarGeo, frameMat);
    leftPillar.position.set(-0.74, 0.08, -0.65);
    leftPillar.rotation.set(0.05, 0, -0.16);
    this.frameGroup.add(leftPillar);

    // Left Sill Rail (Lower window boundary)
    const sillGeo = new THREE.BoxGeometry(0.035, 0.04, 0.45);
    const leftSill = new THREE.Mesh(sillGeo, frameMat);
    leftSill.position.set(-0.72, -0.26, -0.50);
    this.frameGroup.add(leftSill);

    // Right A-Pillar (Angled strut on far right edge of view)
    const rightPillarGeo = new THREE.CylinderGeometry(0.016, 0.022, 0.78, 6);
    const rightPillar = new THREE.Mesh(rightPillarGeo, frameMat);
    rightPillar.position.set(0.74, 0.08, -0.65);
    rightPillar.rotation.set(0.05, 0, 0.16);
    this.frameGroup.add(rightPillar);

    // Right Sill Rail
    const rightSill = new THREE.Mesh(sillGeo, frameMat);
    rightSill.position.set(0.72, -0.26, -0.50);
    this.frameGroup.add(rightSill);

    // Top Header Spar (Narrow horizontal frame bar across the upper screen edge)
    const headerGeo = new THREE.BoxGeometry(1.68, 0.028, 0.05);
    const header = new THREE.Mesh(headerGeo, frameMat);
    header.position.set(0, 0.44, -0.65);
    this.frameGroup.add(header);

    // Dashboard Forward Coaming Lip (Bottom edge of windshield)
    const coamingGeo = new THREE.BoxGeometry(1.50, 0.024, 0.06);
    const coaming = new THREE.Mesh(coamingGeo, frameMat);
    coaming.position.set(0, -0.24, -0.66);
    this.frameGroup.add(coaming);
  }

  /**
   * 2. Forward Instrument Dashboard & MFD Displays
   * Occupies lower ~25% of the screen.
   */
  private buildInstrumentDashboard(): void {
    const dashBodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Deep slate console body
      metalness: 0.7,
      roughness: 0.45,
    });

    const mfdScreenMat = new THREE.MeshBasicMaterial({
      color: 0x041322,
    });

    const glowCyanMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });

    const glowGreenMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
    });

    // Main Dashboard Wedge Console (Tilted back towards pilot)
    const dashGeo = new THREE.BoxGeometry(1.44, 0.18, 0.32);
    const dash = new THREE.Mesh(dashGeo, dashBodyMat);
    dash.position.set(0, -0.34, -0.70);
    dash.rotation.x = 0.42;
    this.dashGroup.add(dash);

    // Lower Cowl Skirt (Ensures clean bottom edge on wide or narrow aspects)
    const skirtGeo = new THREE.BoxGeometry(1.48, 0.16, 0.20);
    const skirt = new THREE.Mesh(skirtGeo, dashBodyMat);
    skirt.position.set(0, -0.46, -0.62);
    this.dashGroup.add(skirt);

    // ==========================================
    // LEFT MFD (Propulsion & Speed Telemetry)
    // ==========================================
    const leftMfdFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.02), dashBodyMat);
    leftMfdFrame.position.set(-0.32, -0.28, -0.68);
    leftMfdFrame.rotation.x = 0.42;
    this.dashGroup.add(leftMfdFrame);

    const leftMfdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), mfdScreenMat);
    leftMfdScreen.position.set(0, 0, 0.012);
    leftMfdFrame.add(leftMfdScreen);

    // Throttle segmented LED bar graph (6 segments)
    for (let i = 0; i < 6; i++) {
      const segMat = new THREE.MeshBasicMaterial({
        color: i < 3 ? 0x38bdf8 : i < 5 ? 0xf59e0b : 0xef4444,
        transparent: true,
        opacity: 0.25,
      });
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.040), segMat);
      seg.position.set(-0.075 + i * 0.030, 0.012, 0.002);
      leftMfdScreen.add(seg);
      this.throttleBarSegments.push(seg);
    }

    // Speed telemetry indicator bar below throttle
    const speedBgMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const speedBg = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.012), speedBgMat);
    speedBg.position.set(0, -0.025, 0.002);
    leftMfdScreen.add(speedBg);

    const speedMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.speedBarMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.010), speedMat);
    this.speedBarMesh.position.set(0, -0.025, 0.003);
    this.speedBarMesh.scale.x = 0.1;
    leftMfdScreen.add(this.speedBarMesh);

    // Left MFD status header pip
    const leftPip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.008), glowCyanMat);
    leftPip.position.set(0, 0.042, 0.002);
    leftMfdScreen.add(leftPip);

    // ==========================================
    // RIGHT MFD (Attitude Gyro & Deflector Shield)
    // ==========================================
    const rightMfdFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.02), dashBodyMat);
    rightMfdFrame.position.set(0.32, -0.28, -0.68);
    rightMfdFrame.rotation.x = 0.42;
    this.dashGroup.add(rightMfdFrame);

    const rightMfdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), mfdScreenMat);
    rightMfdScreen.position.set(0, 0, 0.012);
    rightMfdFrame.add(rightMfdScreen);

    // Artificial Horizon Attitude Gyro Line
    const horizonGeo = new THREE.PlaneGeometry(0.14, 0.008);
    this.artificialHorizonLine = new THREE.Mesh(horizonGeo, glowCyanMat);
    this.artificialHorizonLine.position.set(0, 0.005, 0.003);
    rightMfdScreen.add(this.artificialHorizonLine);

    // Kinetic Shield Status Ring indicator
    const shieldRingGeo = new THREE.RingGeometry(0.026, 0.032, 16);
    const shieldRing = new THREE.Mesh(shieldRingGeo, glowGreenMat);
    shieldRing.position.set(0, 0.005, 0.002);
    rightMfdScreen.add(shieldRing);

    // Right MFD status header pip
    const rightPip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.008), glowGreenMat);
    rightPip.position.set(0, 0.042, 0.002);
    rightMfdScreen.add(rightPip);

    // ==========================================
    // CENTER FLIGHT BORE SIGHT RETICLE
    // ==========================================
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const reticleRing = new THREE.RingGeometry(0.012, 0.015, 16);
    this.hudReticle = new THREE.Mesh(reticleRing, reticleMat);
    this.hudReticle.position.set(0, -0.06, -0.72);
    this.dashGroup.add(this.hudReticle);

    // Reticle crosshair tick marks
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const tickH = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.002), tickMat);
    this.hudReticle.add(tickH);
    const tickV = new THREE.Mesh(new THREE.PlaneGeometry(0.002, 0.018), tickMat);
    this.hudReticle.add(tickV);
  }

  /**
   * 3. Left Throttle Quadrant (Console slider in bottom-left corner)
   */
  private buildThrottleQuadrant(): void {
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.3,
    });

    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.25,
    });

    const glowBlueMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });

    // Throttle Console Housing in bottom-left corner
    const housingGeo = new THREE.BoxGeometry(0.09, 0.08, 0.24);
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(-0.38, -0.34, -0.52);
    housing.rotation.x = 0.15;
    this.dashGroup.add(housing);

    // Throttle Slot Rail
    const railGeo = new THREE.BoxGeometry(0.016, 0.004, 0.18);
    const rail = new THREE.Mesh(railGeo, glowBlueMat);
    rail.position.set(0, 0.042, 0);
    housing.add(rail);

    // Throttle Pivot / Sliding Lever
    this.throttlePivot.position.set(-0.38, -0.29, -0.52);
    this.dashGroup.add(this.throttlePivot);

    const leverStemGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.08, 8);
    const leverStem = new THREE.Mesh(leverStemGeo, housingMat);
    leverStem.position.set(0, 0.04, 0);
    this.throttlePivot.add(leverStem);

    // Throttle Ergonomic T-Grip Handle
    const handleGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.065, 10);
    handleGeo.rotateZ(Math.PI / 2);
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, 0.08, 0);
    this.throttlePivot.add(handleMesh);
  }

  /**
   * 4. Right Flight Control Stick (HOTAS Side-stick in bottom-right corner)
   */
  private buildFlightControlStick(): void {
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.35,
    });

    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.5,
      roughness: 0.4,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.6,
      roughness: 0.3,
    });

    // Stick Base Mount in bottom-right corner
    const baseMount = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), baseMat);
    baseMount.position.set(0.38, -0.34, -0.52);
    this.dashGroup.add(baseMount);

    // Stick Gimbal Pivot
    this.stickPivot.position.set(0.38, -0.30, -0.52);
    this.dashGroup.add(this.stickPivot);

    // Rubber Gimbal Boot
    const bootGeo = new THREE.ConeGeometry(0.04, 0.035, 10);
    const boot = new THREE.Mesh(bootGeo, baseMat);
    boot.position.set(0, 0.018, 0);
    this.stickPivot.add(boot);

    // Stick Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.010, 0.012, 0.10, 8);
    const shaft = new THREE.Mesh(shaftGeo, baseMat);
    shaft.position.set(0, 0.07, 0);
    this.stickPivot.add(shaft);

    // Ergonomic HOTAS Flight Stick Grip
    const gripGeo = new THREE.BoxGeometry(0.034, 0.095, 0.040);
    this.stickGrip = new THREE.Mesh(gripGeo, gripMat);
    this.stickGrip.position.set(0, 0.12, -0.005);
    this.stickPivot.add(this.stickGrip);

    // Weapon / Scan Trigger Accent
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.020, 0.012), accentMat);
    trigger.position.set(0, 0.015, -0.022);
    this.stickGrip.add(trigger);

    // Hat Switch
    const hatSwitch = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.007, 0.012, 8), accentMat);
    hatSwitch.position.set(0, 0.050, 0.008);
    this.stickGrip.add(hatSwitch);
  }

  /**
   * 5. Pilot Left & Right Arms & Articulated Gloves
   * Positioned naturally in bottom corners.
   */
  private buildPilotArms(): void {
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Charcoal slate flight suit fabric
      roughness: 0.65,
      metalness: 0.15,
    });

    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Armored titanium composite glove
      roughness: 0.38,
      metalness: 0.70,
    });

    const seamPipingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Luminescent blue seam piping
    });

    // ==========================================
    // LEFT ARM (Controls Throttle in bottom-left)
    // ==========================================
    this.leftArmGroup.position.set(-0.38, -0.30, -0.32);
    this.dashGroup.add(this.leftArmGroup);

    // Left Forearm
    const leftArmGeo = new THREE.CylinderGeometry(0.034, 0.040, 0.22, 8);
    leftArmGeo.rotateX(Math.PI / 2.3);
    const leftForearm = new THREE.Mesh(leftArmGeo, suitMat);
    leftForearm.position.set(0, 0.04, -0.10);
    this.leftArmGroup.add(leftForearm);

    // Forearm telemetry seam strip
    const leftSeam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.20), seamPipingMat);
    leftSeam.position.set(0, 0.075, -0.10);
    leftSeam.rotation.x = 0.25;
    this.leftArmGroup.add(leftSeam);

    // Left Glove (Grasping Throttle Handle)
    const leftGloveGeo = new THREE.BoxGeometry(0.065, 0.044, 0.056);
    this.leftHandGlove = new THREE.Mesh(leftGloveGeo, gloveMat);
    this.leftHandGlove.position.set(0, 0.09, -0.20);
    this.leftHandGlove.rotation.set(-0.15, 0.08, 0.05);
    this.leftArmGroup.add(this.leftHandGlove);

    // ==========================================
    // RIGHT ARM (Controls Flight Stick in bottom-right)
    // ==========================================
    this.rightArmGroup.position.set(0.38, -0.28, -0.32);
    this.dashGroup.add(this.rightArmGroup);

    // Right Forearm
    const rightArmGeo = new THREE.CylinderGeometry(0.034, 0.040, 0.22, 8);
    rightArmGeo.rotateX(Math.PI / 2.3);
    const rightForearm = new THREE.Mesh(rightArmGeo, suitMat);
    rightForearm.position.set(0, 0.04, -0.10);
    this.rightArmGroup.add(rightForearm);

    // Right Forearm telemetry seam strip
    const rightSeam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.20), seamPipingMat);
    rightSeam.position.set(0, 0.075, -0.10);
    rightSeam.rotation.x = 0.25;
    this.rightArmGroup.add(rightSeam);

    // Right Glove (Grip around Flight Stick)
    const rightGloveGeo = new THREE.BoxGeometry(0.056, 0.072, 0.052);
    this.rightHandGlove = new THREE.Mesh(rightGloveGeo, gloveMat);
    this.rightHandGlove.position.set(0, 0.10, -0.20);
    this.rightHandGlove.rotation.set(-0.15, -0.10, -0.05);
    this.rightArmGroup.add(this.rightHandGlove);
  }

  /**
   * Updates animated pilot hands, control stick, throttle lever, and dashboard MFDs.
   * Runs at 60 FPS with zero object allocations.
   */
  public update(dt: number, state: CockpitInputState): void {
    if (!this.isVisible) return;

    this.breathClock += dt * 1.8;
    const breathOffset = Math.sin(this.breathClock) * 0.0018;

    // 1. Throttle Animation & Left Arm
    this.targetThrottle = THREE.MathUtils.clamp(state.throttle, 0.0, 1.0);
    this.currentThrottle += (this.targetThrottle - this.currentThrottle) * Math.min(1.0, dt * 10.0);

    // Throttle lever slides along Z between -0.46 (idle) and -0.58 (100% thrust)
    const throttleMinZ = -0.46;
    const throttleMaxZ = -0.58;
    const throttleZ = THREE.MathUtils.lerp(throttleMinZ, throttleMaxZ, this.currentThrottle);
    this.throttlePivot.position.z = throttleZ;

    // Left Arm follows throttle forward and backward in bottom-left corner
    this.leftArmGroup.position.z = -0.32 + (throttleZ - throttleMinZ) * 0.70 + breathOffset;
    this.leftArmGroup.position.y = -0.30 + breathOffset;

    // Update Left MFD Throttle LED Bar Graph
    const activeBars = Math.round(this.currentThrottle * 6);
    for (let i = 0; i < this.throttleBarSegments.length; i++) {
      const segMat = this.throttleBarSegments[i].material as THREE.MeshBasicMaterial;
      segMat.opacity = i < activeBars ? 0.95 : 0.20;
    }

    // Update Speed Bar on Left MFD
    if (this.speedBarMesh) {
      const maxSpd = Math.max(1, state.maxSpeed || 160);
      const speedRatio = THREE.MathUtils.clamp(state.speed / maxSpd, 0.05, 1.0);
      this.speedBarMesh.scale.x = speedRatio;
    }

    // 2. Flight Control Stick & Right Hand Steering Animation
    const targetPitchAngle = -state.pitchInput * 0.20; // Forward when pushing down, back when pulling up
    const targetRollAngle = -state.yawInput * 0.22;    // Tilt left/right with steering

    this.stickPitchAngle += (targetPitchAngle - this.stickPitchAngle) * Math.min(1.0, dt * 14.0);
    this.stickRollAngle += (targetRollAngle - this.stickRollAngle) * Math.min(1.0, dt * 14.0);

    // Articulate HOTAS flight stick pivot
    CockpitInteriorRig.scratchEuler.set(this.stickPitchAngle, 0, this.stickRollAngle);
    this.stickPivot.quaternion.setFromEuler(CockpitInteriorRig.scratchEuler);

    // Right Arm follows flight stick articulation in bottom-right corner
    this.rightArmGroup.position.y = -0.28 + breathOffset;
    this.rightArmGroup.position.z = -0.32 - this.stickPitchAngle * 0.12;
    this.rightArmGroup.position.x = 0.38 + this.stickRollAngle * 0.08;

    this.rightHandGlove.rotation.z = -0.08 + this.stickRollAngle * 0.5;
    this.rightHandGlove.rotation.x = -0.15 + this.stickPitchAngle * 0.6;

    // 3. Right MFD Artificial Horizon Gyro
    if (this.artificialHorizonLine) {
      this.artificialHorizonLine.rotation.z = -state.rollInput * 0.50;
      this.artificialHorizonLine.position.y = THREE.MathUtils.clamp(0.005 + state.pitchInput * 0.020, -0.025, 0.035);
    }

    // 4. Center Collimated Sight Micro-Inertia
    if (this.hudReticle) {
      this.hudReticle.position.x = -state.yawInput * 0.008;
      this.hudReticle.position.y = -0.06 - state.pitchInput * 0.006;
    }
  }
}
