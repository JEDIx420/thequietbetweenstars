import * as THREE from 'three';

export class SurveyCraft {
  public group: THREE.Group;

  // Dynamic visual elements
  private leftThrusterCore: THREE.Mesh;
  private rightThrusterCore: THREE.Mesh;
  private leftThrusterPlume: THREE.Mesh;
  private rightThrusterPlume: THREE.Mesh;
  private portStrobe: THREE.Mesh;
  private starStrobe: THREE.Mesh;
  private sensorGlow: THREE.Mesh;

  private clock = 0;

  constructor() {
    this.group = new THREE.Group();

    // 1. Materials with refined physical-based rendering (PBR)
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Clean warm eggshell ceramic
      roughness: 0.32,
      metalness: 0.25,
      flatShading: true,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // 1970s warm survey orange
      roughness: 0.3,
      metalness: 0.35,
      flatShading: true,
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Deep graphite titanium
      roughness: 0.45,
      metalness: 0.8,
    });

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x090d16, // Tinted observatory glass
      roughness: 0.05,
      metalness: 0.95,
    });

    const sensorMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
    });

    // 2. Main Fuselage — Sleek faceted explorer glider
    // Nose Chisel
    const noseGeo = new THREE.ConeGeometry(0.7, 2.2, 5);
    noseGeo.rotateX(Math.PI / 2);
    noseGeo.scale(1.1, 0.45, 1);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.position.set(0, 0, -1.8);
    this.group.add(nose);

    // Main Cabin Body
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.65, 3.2);
    const cabin = new THREE.Mesh(cabinGeo, hullMat);
    cabin.position.set(0, 0.05, 0.2);
    this.group.add(cabin);

    // Underside Survey Keel
    const keelGeo = new THREE.BoxGeometry(0.7, 0.3, 2.8);
    const keel = new THREE.Mesh(keelGeo, darkMetalMat);
    keel.position.set(0, -0.35, 0.3);
    this.group.add(keel);

    // Forward Observation Canopy
    const canopyGeo = new THREE.SphereGeometry(0.52, 16, 12);
    canopyGeo.scale(0.85, 0.55, 1.9);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.36, -0.3);
    this.group.add(canopy);

    // Nose Sensor Dome
    const sensorGeo = new THREE.SphereGeometry(0.18, 12, 8);
    this.sensorGlow = new THREE.Mesh(sensorGeo, sensorMat);
    this.sensorGlow.position.set(0, 0.02, -2.8);
    this.group.add(this.sensorGlow);

    // 3. Glider Wings & Dihedral Wingtip Stabilizers
    // Main Survey Wings (Swept forward/outward)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(2.8, 0.8);
    wingShape.lineTo(2.6, 2.0);
    wingShape.lineTo(0, 1.4);
    wingShape.closePath();

    const wingExtrudeSettings = { depth: 0.08, bevelEnabled: false };
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);
    wingGeo.rotateX(Math.PI / 2);

    // Right Wing
    const rightWing = new THREE.Mesh(wingGeo, hullMat);
    rightWing.position.set(0.6, 0.02, 0.2);
    this.group.add(rightWing);

    // Left Wing (Mirrored)
    const leftWing = rightWing.clone();
    leftWing.scale.set(-1, 1, 1);
    leftWing.position.set(-0.6, 0.02, 0.2);
    this.group.add(leftWing);

    // Dihedral Wingtip Fins with Trim Accent
    const finGeo = new THREE.BoxGeometry(0.08, 0.75, 1.2);
    const leftFin = new THREE.Mesh(finGeo, trimMat);
    leftFin.position.set(-3.3, 0.32, 1.4);
    leftFin.rotation.z = -0.22;
    this.group.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, trimMat);
    rightFin.position.set(3.3, 0.32, 1.4);
    rightFin.rotation.z = 0.22;
    this.group.add(rightFin);

    // Strobe lights on wingtips
    const strobeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    this.portStrobe = new THREE.Mesh(
      strobeGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    this.portStrobe.position.set(-3.35, 0.7, 1.4);
    this.group.add(this.portStrobe);

    this.starStrobe = new THREE.Mesh(
      strobeGeo,
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    this.starStrobe.position.set(3.35, 0.7, 1.4);
    this.group.add(this.starStrobe);

    // 4. Twin Reaction Engine Nacelles
    const nacelleGeo = new THREE.CylinderGeometry(0.32, 0.38, 1.8, 16);
    nacelleGeo.rotateX(Math.PI / 2);

    const leftNacelle = new THREE.Mesh(nacelleGeo, darkMetalMat);
    leftNacelle.position.set(-0.85, 0.02, 1.7);
    this.group.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeo, darkMetalMat);
    rightNacelle.position.set(0.85, 0.02, 1.7);
    this.group.add(rightNacelle);

    // Nacelle Trim Rings
    const ringGeo = new THREE.TorusGeometry(0.38, 0.04, 8, 16);
    const leftRing = new THREE.Mesh(ringGeo, trimMat);
    leftRing.position.set(-0.85, 0.02, 2.5);
    this.group.add(leftRing);

    const rightRing = new THREE.Mesh(ringGeo, trimMat);
    rightRing.position.set(0.85, 0.02, 2.5);
    this.group.add(rightRing);

    // 5. Thruster Reaction Chambers & Plasma Plumes
    // Inner Glow Cores
    const coreGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.2, 12);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd });

    this.leftThrusterCore = new THREE.Mesh(coreGeo, coreMat);
    this.leftThrusterCore.position.set(-0.85, 0.02, 2.55);
    this.group.add(this.leftThrusterCore);

    this.rightThrusterCore = new THREE.Mesh(coreGeo, coreMat);
    this.rightThrusterCore.position.set(0.85, 0.02, 2.55);
    this.group.add(this.rightThrusterCore);

    // Plasma Exhaust Plumes (Cone with additive glow)
    const plumeGeo = new THREE.ConeGeometry(0.32, 2.4, 16);
    plumeGeo.rotateX(-Math.PI / 2);
    plumeGeo.translate(0, 0, 1.2); // Pivot at thruster nozzle

    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });

    this.leftThrusterPlume = new THREE.Mesh(plumeGeo, plumeMat);
    this.leftThrusterPlume.position.set(-0.85, 0.02, 2.58);
    this.group.add(this.leftThrusterPlume);

    this.rightThrusterPlume = new THREE.Mesh(plumeGeo, plumeMat);
    this.rightThrusterPlume.position.set(0.85, 0.02, 2.58);
    this.group.add(this.rightThrusterPlume);
  }

  public update(dt: number, throttle: number, yawInput = 0, pitchInput = 0): void {
    this.clock += dt;

    // 1. Dynamic Engine Plume Scaling & Flicker
    const t = Math.max(0.08, throttle);
    // Micro-flicker: high-frequency subtle oscillation
    const flicker = 1.0 + Math.sin(this.clock * 45) * 0.04 + Math.cos(this.clock * 70) * 0.03;
    const scaleZ = (0.5 + t * 2.8) * flicker;
    const scaleXY = (0.6 + t * 0.9) * (0.95 + flicker * 0.05);

    this.leftThrusterPlume.scale.set(scaleXY, scaleXY, scaleZ);
    this.rightThrusterPlume.scale.set(scaleXY, scaleXY, scaleZ);

    // Plume brightness & opacity
    const plumeMat = this.leftThrusterPlume.material as THREE.MeshBasicMaterial;
    plumeMat.opacity = Math.min(0.95, 0.35 + t * 0.6);

    // 2. Thrust Vectoring: Plumes tilt slightly in response to steering
    const vectorYaw = -yawInput * 0.18;
    const vectorPitch = pitchInput * 0.15;
    this.leftThrusterPlume.rotation.set(vectorPitch, vectorYaw, 0);
    this.rightThrusterPlume.rotation.set(vectorPitch, vectorYaw, 0);

    // 3. Navigation Strobes Alternating Flash
    const portFlash = Math.sin(this.clock * 5.0) > 0.7;
    const starFlash = Math.cos(this.clock * 5.0) > 0.7;
    (this.portStrobe.material as THREE.MeshBasicMaterial).color.setHex(portFlash ? 0x7dd3fc : 0x0369a1);
    (this.starStrobe.material as THREE.MeshBasicMaterial).color.setHex(starFlash ? 0xfde047 : 0x854d0e);

    // 4. Sensor Dome Breathing Glow
    const sensorBreathing = (Math.sin(this.clock * 2.5) + 1) * 0.5;
    (this.sensorGlow.material as THREE.MeshBasicMaterial).opacity = 0.5 + sensorBreathing * 0.5;
  }
}
