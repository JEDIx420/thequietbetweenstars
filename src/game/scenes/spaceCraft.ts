import * as THREE from 'three';

export class SurveyCraft {
  public group: THREE.Group;

  // Visual module mount groups
  private hullGroup: THREE.Group;
  private wingGroup: THREE.Group;
  private engineGroup: THREE.Group;
  private scannerGroup: THREE.Group;
  private moduleVisualsGroup: THREE.Group;

  // Dynamic visual elements
  private leftThrusterCore: THREE.Mesh;
  private rightThrusterCore: THREE.Mesh;
  private leftThrusterInnerPlume: THREE.Mesh;
  private rightThrusterInnerPlume: THREE.Mesh;
  private leftThrusterOuterPlume: THREE.Mesh;
  private rightThrusterOuterPlume: THREE.Mesh;
  private sensorGlow: THREE.Mesh;
  private portStrobe: THREE.Mesh;
  private starStrobe: THREE.Mesh;

  // Installed upgrade visuals
  private installedModuleVisuals: Map<string, THREE.Object3D> = new Map();

  private clock = 0;

  constructor() {
    this.group = new THREE.Group();

    this.hullGroup = new THREE.Group();
    this.wingGroup = new THREE.Group();
    this.engineGroup = new THREE.Group();
    this.scannerGroup = new THREE.Group();
    this.moduleVisualsGroup = new THREE.Group();

    this.group.add(this.hullGroup);
    this.group.add(this.wingGroup);
    this.group.add(this.engineGroup);
    this.group.add(this.scannerGroup);
    this.group.add(this.moduleVisualsGroup);

    // Refined PBR Materials
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9, // Clean warm ceramic white
      roughness: 0.28,
      metalness: 0.35,
      flatShading: true,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // Survey orange
      roughness: 0.3,
      metalness: 0.4,
      flatShading: true,
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.85,
    });

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.05,
      metalness: 0.95,
    });

    const sensorMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });

    // 1. Sleek Faceted Fuselage
    // Nose Cone
    const noseGeo = new THREE.ConeGeometry(0.75, 2.4, 5);
    noseGeo.rotateX(Math.PI / 2);
    noseGeo.scale(1.15, 0.45, 1);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.position.set(0, 0, -1.9);
    this.hullGroup.add(nose);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.7, 3.4);
    const cabin = new THREE.Mesh(cabinGeo, hullMat);
    cabin.position.set(0, 0.05, 0.2);
    this.hullGroup.add(cabin);

    // Keel
    const keelGeo = new THREE.BoxGeometry(0.75, 0.35, 3.0);
    const keel = new THREE.Mesh(keelGeo, darkMetalMat);
    keel.position.set(0, -0.38, 0.3);
    this.hullGroup.add(keel);

    // Forward Canopy
    const canopyGeo = new THREE.SphereGeometry(0.55, 16, 12);
    canopyGeo.scale(0.85, 0.55, 1.9);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.38, -0.35);
    this.hullGroup.add(canopy);

    // Scanner Dome
    const sensorGeo = new THREE.SphereGeometry(0.2, 12, 8);
    this.sensorGlow = new THREE.Mesh(sensorGeo, sensorMat);
    this.sensorGlow.position.set(0, 0.02, -3.0);
    this.scannerGroup.add(this.sensorGlow);

    // 2. Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(2.8, 0.8);
    wingShape.lineTo(2.6, 2.0);
    wingShape.lineTo(0, 1.4);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);

    const leftWing = new THREE.Mesh(wingGeo, hullMat);
    leftWing.position.set(-0.65, 0.05, -0.4);
    leftWing.scale.set(-1, 1, 1);
    this.wingGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, hullMat);
    rightWing.position.set(0.65, 0.05, -0.4);
    this.wingGroup.add(rightWing);

    // Wingtips
    const tipGeo = new THREE.BoxGeometry(0.12, 0.7, 1.2);
    const leftTip = new THREE.Mesh(tipGeo, trimMat);
    leftTip.position.set(-3.25, 0.32, 0.6);
    this.wingGroup.add(leftTip);

    const rightTip = new THREE.Mesh(tipGeo, trimMat);
    rightTip.position.set(3.25, 0.32, 0.6);
    this.wingGroup.add(rightTip);

    // 3. Engine Nacelles & Layered Plumes
    const nacelleGeo = new THREE.CylinderGeometry(0.35, 0.42, 2.2, 8);
    nacelleGeo.rotateX(Math.PI / 2);

    const leftNacelle = new THREE.Mesh(nacelleGeo, darkMetalMat);
    leftNacelle.position.set(-0.85, 0.1, 1.4);
    this.engineGroup.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeo, darkMetalMat);
    rightNacelle.position.set(0.85, 0.1, 1.4);
    this.engineGroup.add(rightNacelle);

    // Layered Thruster Plume Setup
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const innerPlumeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const outerPlumeMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.45,
    });

    const coreGeo = new THREE.ConeGeometry(0.18, 0.8, 6);
    coreGeo.rotateX(-Math.PI / 2);

    const innerGeo = new THREE.ConeGeometry(0.3, 2.4, 8);
    innerGeo.rotateX(-Math.PI / 2);

    const outerGeo = new THREE.ConeGeometry(0.48, 3.8, 8);
    outerGeo.rotateX(-Math.PI / 2);

    // Left Thruster
    this.leftThrusterCore = new THREE.Mesh(coreGeo, coreMat);
    this.leftThrusterCore.position.set(-0.85, 0.1, 2.5);
    this.engineGroup.add(this.leftThrusterCore);

    this.leftThrusterInnerPlume = new THREE.Mesh(innerGeo, innerPlumeMat);
    this.leftThrusterInnerPlume.position.set(-0.85, 0.1, 2.6);
    this.engineGroup.add(this.leftThrusterInnerPlume);

    this.leftThrusterOuterPlume = new THREE.Mesh(outerGeo, outerPlumeMat);
    this.leftThrusterOuterPlume.position.set(-0.85, 0.1, 2.8);
    this.engineGroup.add(this.leftThrusterOuterPlume);

    // Right Thruster
    this.rightThrusterCore = new THREE.Mesh(coreGeo, coreMat);
    this.rightThrusterCore.position.set(0.85, 0.1, 2.5);
    this.engineGroup.add(this.rightThrusterCore);

    this.rightThrusterInnerPlume = new THREE.Mesh(innerGeo, innerPlumeMat);
    this.rightThrusterInnerPlume.position.set(0.85, 0.1, 2.6);
    this.engineGroup.add(this.rightThrusterInnerPlume);

    this.rightThrusterOuterPlume = new THREE.Mesh(outerGeo, outerPlumeMat);
    this.rightThrusterOuterPlume.position.set(0.85, 0.1, 2.8);
    this.engineGroup.add(this.rightThrusterOuterPlume);

    // Navigation Strobes
    const portGeo = new THREE.SphereGeometry(0.08, 6, 6);
    this.portStrobe = new THREE.Mesh(portGeo, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    this.portStrobe.position.set(-3.28, 0.65, 0.6);
    this.wingGroup.add(this.portStrobe);

    const starGeo = new THREE.SphereGeometry(0.08, 6, 6);
    this.starStrobe = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    this.starStrobe.position.set(3.28, 0.65, 0.6);
    this.wingGroup.add(this.starStrobe);
  }

  public setInstalledModules(moduleIds: string[]): void {
    // Clear previous visual attachments
    for (const obj of this.installedModuleVisuals.values()) {
      this.moduleVisualsGroup.remove(obj);
    }
    this.installedModuleVisuals.clear();

    const upgradeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.7,
    });

    for (const id of moduleIds) {
      if (id === 'mod_propulsion_ion_vector') {
        // Glowing cyan vectoring rings around engine exhausts
        const ringGeo = new THREE.TorusGeometry(0.44, 0.06, 6, 16);
        const leftRing = new THREE.Mesh(ringGeo, upgradeMat);
        leftRing.position.set(-0.85, 0.1, 2.45);
        const rightRing = new THREE.Mesh(ringGeo, upgradeMat);
        rightRing.position.set(0.85, 0.1, 2.45);

        const group = new THREE.Group();
        group.add(leftRing);
        group.add(rightRing);
        this.moduleVisualsGroup.add(group);
        this.installedModuleVisuals.set(id, group);
      } else if (id === 'mod_surface_grav_stabilizer') {
        // High-aspect wing extensions
        const extGeo = new THREE.BoxGeometry(0.6, 0.05, 1.4);
        const leftExt = new THREE.Mesh(extGeo, upgradeMat);
        leftExt.position.set(-3.5, 0.15, 0.6);
        const rightExt = new THREE.Mesh(extGeo, upgradeMat);
        rightExt.position.set(3.5, 0.15, 0.6);

        const group = new THREE.Group();
        group.add(leftExt);
        group.add(rightExt);
        this.moduleVisualsGroup.add(group);
        this.installedModuleVisuals.set(id, group);
      } else if (id === 'mod_scanner_deep_ecology') {
        // Crown sensor array on fuselage
        const crownGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.25, 6);
        const crown = new THREE.Mesh(crownGeo, upgradeMat);
        crown.position.set(0, 0.55, 0.4);
        this.moduleVisualsGroup.add(crown);
        this.installedModuleVisuals.set(id, crown);
      }
    }
  }

  public update(dt: number, throttle: number, yaw: number, pitch: number): void {
    this.clock += dt;

    // Layered Thruster Plume Scale & Modulation
    const t = Math.max(0.05, throttle);
    const flicker = 1.0 + Math.sin(this.clock * 25.0) * 0.08;

    this.leftThrusterCore.scale.set(1, 1, (0.5 + t * 1.5) * flicker);
    this.rightThrusterCore.scale.set(1, 1, (0.5 + t * 1.5) * flicker);

    this.leftThrusterInnerPlume.scale.set(1, 1, (0.3 + t * 2.8) * flicker);
    this.rightThrusterInnerPlume.scale.set(1, 1, (0.3 + t * 2.8) * flicker);

    this.leftThrusterOuterPlume.scale.set(1, 1, (0.2 + t * 3.4) * flicker);
    this.rightThrusterOuterPlume.scale.set(1, 1, (0.2 + t * 3.4) * flicker);

    // Strobe Blinking (1 Hz)
    const strobeOn = Math.sin(this.clock * 6.28) > 0.85;
    this.portStrobe.visible = strobeOn;
    this.starStrobe.visible = strobeOn;

    // Subtle Sensor Pulsing
    const sensorPulse = 0.6 + Math.sin(this.clock * 3.0) * 0.3;
    (this.sensorGlow.material as THREE.MeshBasicMaterial).opacity = sensorPulse;

    // Craft visual banking response to steering input
    const targetRoll = -yaw * 0.45;
    const targetPitch = pitch * 0.25;
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, targetRoll, dt * 6.0);
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, targetPitch, dt * 6.0);
  }
}
