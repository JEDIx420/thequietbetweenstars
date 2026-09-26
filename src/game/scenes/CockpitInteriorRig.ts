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
 * First-person cockpit interior for the player's SurveyCraft.
 * Features an authentic sci-fi flight deck with:
 * - Detailed canopy framing and tinted glass sheen
 * - Angled instrument console with dual holographic MFDs (speed, throttle bar, artificial horizon gyro, shield status)
 * - Animated throttle quadrant with pilot's left arm physically sliding forward/back with throttle
 * - Articulated HOTAS flight stick with pilot's right arm dynamically pitching, yawing, and banking with flight controls
 * - Subtle idle breathing & inertial G-force responsiveness
 */
export class CockpitInteriorRig {
  public group: THREE.Group;

  // Frame & Glazing
  private frameGroup: THREE.Group;

  // Dash & Instruments
  private dashGroup: THREE.Group;
  private throttleBarSegments: THREE.Mesh[] = [];
  private artificialHorizonLine!: THREE.Mesh;
  private hudReticle!: THREE.Mesh;

  // Left Arm & Throttle
  private throttlePivot: THREE.Group;
  private throttleHandle!: THREE.Mesh;
  private leftArmGroup: THREE.Group;
  private leftForearm!: THREE.Mesh;
  private leftHandGlove!: THREE.Mesh;

  // Right Arm & Flight Stick
  private stickPivot: THREE.Group;
  private stickGrip!: THREE.Mesh;
  private rightArmGroup: THREE.Group;
  private rightForearm!: THREE.Mesh;
  private rightHandGlove!: THREE.Mesh;

  // Internal Animation State
  private currentThrottle = 0;
  private targetThrottle = 0;
  private stickPitchAngle = 0;
  private stickRollAngle = 0;
  private breathClock = 0;
  private isVisible = false;

  // Static scratch vectors for zero-allocation updates
  private static readonly scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor() {
    this.group = new THREE.Group();
    this.frameGroup = new THREE.Group();
    this.dashGroup = new THREE.Group();
    this.throttlePivot = new THREE.Group();
    this.leftArmGroup = new THREE.Group();
    this.stickPivot = new THREE.Group();
    this.rightArmGroup = new THREE.Group();

    this.group.add(this.frameGroup);
    this.group.add(this.dashGroup);

    // Build Cockpit Components
    this.buildCanopyFrame();
    this.buildInstrumentDashboard();
    this.buildThrottleQuadrant();
    this.buildFlightControlStick();
    this.buildPilotArms();

    // Default to hidden until cockpit view mode is enabled
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
   * 1. Canopy Frame & Struts
   */
  private buildCanopyFrame(): void {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark titanium aerospace alloy
      metalness: 0.85,
      roughness: 0.35,
      flatShading: true,
    });

    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.04,
      side: THREE.BackSide,
    });

    // Lower Cockpit Sill Rails (Left & Right)
    const sillGeo = new THREE.BoxGeometry(0.06, 0.08, 0.95);
    const leftSill = new THREE.Mesh(sillGeo, frameMat);
    leftSill.position.set(-0.42, 0.40, -0.55);
    leftSill.rotation.y = 0.08;
    this.frameGroup.add(leftSill);

    const rightSill = new THREE.Mesh(sillGeo, frameMat);
    rightSill.position.set(0.42, 0.40, -0.55);
    rightSill.rotation.y = -0.08;
    this.frameGroup.add(rightSill);

    // Forward Angled A-Pillars (Left & Right Struts)
    const strutGeo = new THREE.CylinderGeometry(0.022, 0.030, 0.62, 6);
    const leftStrut = new THREE.Mesh(strutGeo, frameMat);
    leftStrut.position.set(-0.32, 0.58, -0.66);
    leftStrut.rotation.set(0.48, 0, -0.42);
    this.frameGroup.add(leftStrut);

    const rightStrut = new THREE.Mesh(strutGeo, frameMat);
    rightStrut.position.set(0.32, 0.58, -0.66);
    rightStrut.rotation.set(0.48, 0, 0.42);
    this.frameGroup.add(rightStrut);

    // Longitudinal Top Roof Spar
    const roofSparGeo = new THREE.BoxGeometry(0.07, 0.05, 0.80);
    const roofSpar = new THREE.Mesh(roofSparGeo, frameMat);
    roofSpar.position.set(0, 0.72, -0.52);
    this.frameGroup.add(roofSpar);

    // Forward Canopy Top Arch
    const archGeo = new THREE.BoxGeometry(0.55, 0.05, 0.06);
    const arch = new THREE.Mesh(archGeo, frameMat);
    arch.position.set(0, 0.71, -0.74);
    this.frameGroup.add(arch);

    // Subtle Interior Tinted Glass Canopy Sheen
    const glassGeo = new THREE.SphereGeometry(0.53, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    glassGeo.scale(0.80, 0.50, 1.85);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 0.46, -0.52);
    this.frameGroup.add(glass);
  }

  /**
   * 2. Forward Instrument Dashboard & MFD Displays
   */
  private buildInstrumentDashboard(): void {
    const dashBodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Deep slate console body
      metalness: 0.65,
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

    // Main Dashboard Wedge Console
    const dashGeo = new THREE.BoxGeometry(0.78, 0.16, 0.32);
    const dash = new THREE.Mesh(dashGeo, dashBodyMat);
    dash.position.set(0, 0.34, -0.82);
    dash.rotation.x = 0.42; // Tilted toward pilot eyes
    this.dashGroup.add(dash);

    // Left Multi-Function Display (Throttle & Propulsion Telemetry)
    const leftMfdFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.02), dashBodyMat);
    leftMfdFrame.position.set(-0.23, 0.38, -0.78);
    leftMfdFrame.rotation.x = 0.42;
    this.dashGroup.add(leftMfdFrame);

    const leftMfdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), mfdScreenMat);
    leftMfdScreen.position.set(0, 0, 0.012);
    leftMfdFrame.add(leftMfdScreen);

    // Throttle segmented LED bar graph (5 segments)
    for (let i = 0; i < 5; i++) {
      const segMat = new THREE.MeshBasicMaterial({
        color: i < 3 ? 0x38bdf8 : i === 3 ? 0xf59e0b : 0xef4444,
        transparent: true,
        opacity: 0.25,
      });
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.045), segMat);
      seg.position.set(-0.07 + i * 0.035, -0.01, 0.002);
      leftMfdScreen.add(seg);
      this.throttleBarSegments.push(seg);
    }

    // Left MFD status header pip
    const leftPip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.012), glowCyanMat);
    leftPip.position.set(0, 0.036, 0.002);
    leftMfdScreen.add(leftPip);

    // Right Multi-Function Display (Attitude Gyro & Shield Status)
    const rightMfdFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.02), dashBodyMat);
    rightMfdFrame.position.set(0.23, 0.38, -0.78);
    rightMfdFrame.rotation.x = 0.42;
    this.dashGroup.add(rightMfdFrame);

    const rightMfdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), mfdScreenMat);
    rightMfdScreen.position.set(0, 0, 0.012);
    rightMfdFrame.add(rightMfdScreen);

    // Artificial Horizon Attitude Gyro Line
    const horizonGeo = new THREE.PlaneGeometry(0.14, 0.008);
    this.artificialHorizonLine = new THREE.Mesh(horizonGeo, glowCyanMat);
    this.artificialHorizonLine.position.set(0, 0, 0.003);
    rightMfdScreen.add(this.artificialHorizonLine);

    // Kinetic Shield Status Ring indicator
    const shieldRingGeo = new THREE.RingGeometry(0.035, 0.040, 16);
    const shieldRing = new THREE.Mesh(shieldRingGeo, glowGreenMat);
    shieldRing.position.set(0, 0, 0.002);
    rightMfdScreen.add(shieldRing);

    // Center Collimated HUD Reticle (Collimated Flight Sight)
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const reticleRing = new THREE.RingGeometry(0.016, 0.019, 16);
    this.hudReticle = new THREE.Mesh(reticleRing, reticleMat);
    this.hudReticle.position.set(0, 0.49, -0.92);
    this.dashGroup.add(this.hudReticle);

    // Reticle crosshair tick marks
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const tickH = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.003), tickMat);
    this.hudReticle.add(tickH);
    const tickV = new THREE.Mesh(new THREE.PlaneGeometry(0.003, 0.024), tickMat);
    this.hudReticle.add(tickV);
  }

  /**
   * 3. Left Throttle Quadrant (Console slider)
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

    // Throttle Console Housing
    const housingGeo = new THREE.BoxGeometry(0.10, 0.10, 0.28);
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(-0.26, 0.26, -0.56);
    housing.rotation.x = 0.15;
    this.dashGroup.add(housing);

    // Throttle Slot Rail
    const railGeo = new THREE.BoxGeometry(0.02, 0.005, 0.22);
    const rail = new THREE.Mesh(railGeo, glowBlueMat);
    rail.position.set(0, 0.052, 0);
    housing.add(rail);

    // Throttle Pivot / Sliding Lever
    this.throttlePivot.position.set(-0.26, 0.32, -0.54);
    this.dashGroup.add(this.throttlePivot);

    const leverStemGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8);
    const leverStem = new THREE.Mesh(leverStemGeo, housingMat);
    leverStem.position.set(0, 0.045, 0);
    this.throttlePivot.add(leverStem);

    // Throttle Ergonomic T-Grip Handle
    const handleGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.075, 10);
    handleGeo.rotateZ(Math.PI / 2);
    this.throttleHandle = new THREE.Mesh(handleGeo, handleMat);
    this.throttleHandle.position.set(0, 0.09, 0);
    this.throttlePivot.add(this.throttleHandle);
  }

  /**
   * 4. Right Flight Control Stick (HOTAS Side-stick)
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

    // Stick Base Mount
    const baseMount = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.06, 12), baseMat);
    baseMount.position.set(0.24, 0.24, -0.56);
    this.dashGroup.add(baseMount);

    // Stick Gimbal Pivot
    this.stickPivot.position.set(0.24, 0.27, -0.56);
    this.dashGroup.add(this.stickPivot);

    // Rubber Gimbal Boot
    const bootGeo = new THREE.ConeGeometry(0.045, 0.04, 10);
    const boot = new THREE.Mesh(bootGeo, baseMat);
    boot.position.set(0, 0.02, 0);
    this.stickPivot.add(boot);

    // Stick Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.12, 8);
    const shaft = new THREE.Mesh(shaftGeo, baseMat);
    shaft.position.set(0, 0.08, 0);
    this.stickPivot.add(shaft);

    // Ergonomic HOTAS Flight Stick Grip
    const gripGeo = new THREE.BoxGeometry(0.038, 0.11, 0.045);
    this.stickGrip = new THREE.Mesh(gripGeo, gripMat);
    this.stickGrip.position.set(0, 0.14, -0.005);
    this.stickPivot.add(this.stickGrip);

    // Hat Switch & Weapon / Scan Trigger Accents
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, 0.015), accentMat);
    trigger.position.set(0, 0.02, -0.025);
    this.stickGrip.add(trigger);

    const hatSwitch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.015, 8), accentMat);
    hatSwitch.position.set(0, 0.058, 0.01);
    this.stickGrip.add(hatSwitch);
  }

  /**
   * 5. Pilot Left & Right Arms & Articulated Gloves
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

    // LEFT ARM (Controls Throttle)
    this.leftArmGroup.position.set(-0.29, 0.22, -0.32);
    this.dashGroup.add(this.leftArmGroup);

    // Left Forearm
    const leftArmGeo = new THREE.CylinderGeometry(0.036, 0.042, 0.24, 8);
    leftArmGeo.rotateX(Math.PI / 2.3);
    this.leftForearm = new THREE.Mesh(leftArmGeo, suitMat);
    this.leftForearm.position.set(0, 0.05, -0.11);
    this.leftArmGroup.add(this.leftForearm);

    // Forearm telemetry seam strip
    const leftSeam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.22), seamPipingMat);
    leftSeam.position.set(0, 0.088, -0.11);
    leftSeam.rotation.x = 0.25;
    this.leftArmGroup.add(leftSeam);

    // Left Glove (Grasping Throttle Handle)
    const leftGloveGeo = new THREE.BoxGeometry(0.068, 0.045, 0.058);
    this.leftHandGlove = new THREE.Mesh(leftGloveGeo, gloveMat);
    this.leftHandGlove.position.set(0.02, 0.10, -0.22);
    this.leftHandGlove.rotation.set(-0.2, 0.15, 0.1);
    this.leftArmGroup.add(this.leftHandGlove);

    // RIGHT ARM (Controls Flight Stick)
    this.rightArmGroup.position.set(0.28, 0.22, -0.32);
    this.dashGroup.add(this.rightArmGroup);

    // Right Forearm
    const rightArmGeo = new THREE.CylinderGeometry(0.036, 0.042, 0.24, 8);
    rightArmGeo.rotateX(Math.PI / 2.3);
    this.rightForearm = new THREE.Mesh(rightArmGeo, suitMat);
    this.rightForearm.position.set(0, 0.05, -0.11);
    this.rightArmGroup.add(this.rightForearm);

    // Right Forearm telemetry seam strip
    const rightSeam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.22), seamPipingMat);
    rightSeam.position.set(0, 0.088, -0.11);
    rightSeam.rotation.x = 0.25;
    this.rightArmGroup.add(rightSeam);

    // Right Glove (Grip around Flight Stick)
    const rightGloveGeo = new THREE.BoxGeometry(0.058, 0.075, 0.052);
    this.rightHandGlove = new THREE.Mesh(rightGloveGeo, gloveMat);
    this.rightHandGlove.position.set(-0.02, 0.11, -0.22);
    this.rightHandGlove.rotation.set(-0.15, -0.15, -0.1);
    this.rightArmGroup.add(this.rightHandGlove);
  }

  /**
   * Updates animated pilot hands, control stick, throttle lever, and dashboard MFDs.
   * Runs at 60 FPS with zero object allocations.
   */
  public update(dt: number, state: CockpitInputState): void {
    if (!this.isVisible) return;

    this.breathClock += dt * 1.8;
    const breathOffset = Math.sin(this.breathClock) * 0.0025;

    // 1. Throttle Animation
    this.targetThrottle = THREE.MathUtils.clamp(state.throttle, 0.0, 1.0);
    this.currentThrottle += (this.targetThrottle - this.currentThrottle) * Math.min(1.0, dt * 10.0);

    // Throttle lever slides along Z between -0.48 (idle) and -0.62 (100% thrust)
    const throttleMinZ = -0.48;
    const throttleMaxZ = -0.62;
    const throttleZ = THREE.MathUtils.lerp(throttleMinZ, throttleMaxZ, this.currentThrottle);
    this.throttlePivot.position.z = throttleZ;

    // Left Arm follows throttle forward and backward
    this.leftArmGroup.position.z = -0.32 + (throttleZ - throttleMinZ) * 0.75 + breathOffset;
    this.leftArmGroup.position.y = 0.22 + breathOffset;

    // Update Left MFD Throttle LED Bar Graph
    const activeBars = Math.round(this.currentThrottle * 5);
    for (let i = 0; i < this.throttleBarSegments.length; i++) {
      const segMat = this.throttleBarSegments[i].material as THREE.MeshBasicMaterial;
      segMat.opacity = i < activeBars ? 0.95 : 0.18;
    }

    // 2. Flight Control Stick & Right Hand Steering Animation
    const targetPitchAngle = -state.pitchInput * 0.28; // Forward when pushing down, back when pulling up
    const targetRollAngle = -state.yawInput * 0.32;    // Tilt left/right with steering

    this.stickPitchAngle += (targetPitchAngle - this.stickPitchAngle) * Math.min(1.0, dt * 14.0);
    this.stickRollAngle += (targetRollAngle - this.stickRollAngle) * Math.min(1.0, dt * 14.0);

    // Articulate HOTAS flight stick pivot
    CockpitInteriorRig.scratchEuler.set(this.stickPitchAngle, 0, this.stickRollAngle);
    this.stickPivot.quaternion.setFromEuler(CockpitInteriorRig.scratchEuler);

    // Right Arm follows flight stick articulation
    this.rightArmGroup.position.y = 0.22 + breathOffset;
    this.rightArmGroup.position.z = -0.32 - this.stickPitchAngle * 0.15;
    this.rightArmGroup.position.x = 0.28 + this.stickRollAngle * 0.12;

    this.rightHandGlove.rotation.z = -0.1 + this.stickRollAngle * 0.6;
    this.rightHandGlove.rotation.x = -0.15 + this.stickPitchAngle * 0.7;

    // 3. Right MFD Artificial Horizon Gyro
    if (this.artificialHorizonLine) {
      // Tilts with roll and shifts vertically with pitch
      this.artificialHorizonLine.rotation.z = -state.rollInput * 0.65;
      this.artificialHorizonLine.position.y = THREE.MathUtils.clamp(state.pitchInput * 0.025, -0.035, 0.035);
    }

    // 4. Center Collimated Sight Micro-Inertia
    if (this.hudReticle) {
      this.hudReticle.position.x = -state.yawInput * 0.012;
      this.hudReticle.position.y = 0.49 - state.pitchInput * 0.010;
    }
  }
}
