import * as THREE from 'three';

export class SpaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group;

  // Visual components
  private starfield: THREE.Points;
  private dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustCount = 700;
  private dustBoxSize = 250;

  private sunMesh: THREE.Mesh;
  private sunCorona: THREE.Mesh;
  private planetMesh: THREE.Mesh;
  private ringMesh: THREE.Mesh;

  private thrusterGlowLeft: THREE.Mesh;
  private thrusterGlowRight: THREE.Mesh;
  private scanWave: THREE.Mesh;
  private scanRadius = 0;
  private isScanning = false;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030307, 0.00035);

    // Ambient and directional lighting
    const ambient = new THREE.AmbientLight(0x222638, 1.2);
    this.scene.add(ambient);

    // Create celestial elements
    this.starfield = this.createStarfield();
    this.scene.add(this.starfield);

    const dustObj = this.createCosmicDust();
    this.dustPoints = dustObj.points;
    this.dustPositions = dustObj.positions;
    this.scene.add(this.dustPoints);

    const sunGroup = this.createProceduralSun();
    this.sunMesh = sunGroup.sun;
    this.sunCorona = sunGroup.corona;
    this.scene.add(sunGroup.group);

    const planetGroup = this.createDistantPlanet();
    this.planetMesh = planetGroup.planet;
    this.ringMesh = planetGroup.rings;
    this.scene.add(planetGroup.group);

    // Create player geometric craft
    const shipObj = this.createProceduralCraft();
    this.shipGroup = shipObj.group;
    this.thrusterGlowLeft = shipObj.glowLeft;
    this.thrusterGlowRight = shipObj.glowRight;
    this.scene.add(this.shipGroup);

    // Scan holographic pulse
    this.scanWave = this.createScanWave();
    this.scene.add(this.scanWave);
  }

  private createStarfield(): THREE.Points {
    const starCount = 3500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const colorPalette = [
      new THREE.Color(0xdbeafe), // icy blue
      new THREE.Color(0xfef3c7), // warm gold
      new THREE.Color(0xf3e8ff), // soft violet
      new THREE.Color(0xffffff), // white
      new THREE.Color(0xa7f3d0), // pastel mint
    ];

    for (let i = 0; i < starCount; i++) {
      const radius = 2500 + Math.random() * 2000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 3.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: false,
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
      opacity: 0.65,
      sizeAttenuation: true,
    });

    return { points: new THREE.Points(geometry, material), positions: this.dustPositions };
  }

  private createProceduralSun(): { group: THREE.Group; sun: THREE.Mesh; corona: THREE.Mesh } {
    const group = new THREE.Group();
    group.position.set(600, 350, -1200);

    const sunGeo = new THREE.SphereGeometry(75, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffe6a3,
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    group.add(sun);

    const coronaGeo = new THREE.SphereGeometry(95, 32, 32);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xff9944,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    group.add(corona);

    const sunLight = new THREE.PointLight(0xffe299, 2.5, 3500);
    group.add(sunLight);

    return { group, sun, corona };
  }

  private createDistantPlanet(): { group: THREE.Group; planet: THREE.Mesh; rings: THREE.Mesh } {
    const group = new THREE.Group();
    group.position.set(-800, -200, -1500);

    const planetGeo = new THREE.SphereGeometry(140, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0x6b8afd,
      roughness: 0.8,
      metalness: 0.1,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    group.add(planet);

    const ringGeo = new THREE.RingGeometry(180, 260, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc4b5fd,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const rings = new THREE.Mesh(ringGeo, ringMat);
    rings.rotation.x = Math.PI / 2.5;
    group.add(rings);

    return { group, planet, rings };
  }

  private createProceduralCraft(): {
    group: THREE.Group;
    glowLeft: THREE.Mesh;
    glowRight: THREE.Mesh;
  } {
    const group = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xededed,
      roughness: 0.4,
      metalness: 0.2,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.3,
      metalness: 0.3,
    });

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      roughness: 0.1,
      metalness: 0.9,
    });

    const fuselageGeo = new THREE.ConeGeometry(1.2, 4.5, 5);
    fuselageGeo.rotateX(Math.PI / 2);
    fuselageGeo.scale(1.2, 0.45, 1);
    const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
    group.add(fuselage);

    const canopyGeo = new THREE.SphereGeometry(0.55, 16, 16);
    canopyGeo.scale(0.8, 0.5, 1.8);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.28, -0.2);
    group.add(canopy);

    const wingGeo = new THREE.BoxGeometry(4.2, 0.08, 1.6);
    const wings = new THREE.Mesh(wingGeo, hullMat);
    wings.position.set(0, -0.05, 0.5);
    group.add(wings);

    const finGeo = new THREE.BoxGeometry(0.08, 0.9, 0.8);
    const leftFin = new THREE.Mesh(finGeo, accentMat);
    leftFin.position.set(-2.1, 0.35, 0.6);
    leftFin.rotation.z = -0.15;
    group.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, accentMat);
    rightFin.position.set(2.1, 0.35, 0.6);
    rightFin.rotation.z = 0.15;
    group.add(rightFin);

    const thrusterMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
    });

    const glowGeo = new THREE.ConeGeometry(0.3, 1.4, 12);
    glowGeo.rotateX(-Math.PI / 2);

    const glowLeft = new THREE.Mesh(glowGeo, thrusterMat);
    glowLeft.position.set(-0.65, -0.02, 2.4);
    group.add(glowLeft);

    const glowRight = new THREE.Mesh(glowGeo, thrusterMat);
    glowRight.position.set(0.65, -0.02, 2.4);
    group.add(glowRight);

    return { group, glowLeft, glowRight };
  }

  private createScanWave(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 32, 16);
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

  public update(dt: number, shipPos: THREE.Vector3, throttle: number): void {
    const t = Math.max(0.1, throttle);
    const scaleZ = 0.6 + t * 2.2;
    const scaleXY = 0.6 + t * 0.8;
    this.thrusterGlowLeft.scale.set(scaleXY, scaleXY, scaleZ);
    this.thrusterGlowRight.scale.set(scaleXY, scaleXY, scaleZ);

    const time = performance.now() * 0.001;
    const coronaScale = 1 + Math.sin(time * 0.8) * 0.03;
    this.sunCorona.scale.set(coronaScale, coronaScale, coronaScale);
    this.sunMesh.rotation.y += dt * 0.005;

    this.planetMesh.rotation.y += dt * 0.02;
    this.ringMesh.rotation.z += dt * 0.003;

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

    if (this.isScanning) {
      this.scanRadius += dt * 140;
      this.scanWave.scale.set(this.scanRadius, this.scanRadius, this.scanRadius);

      const maxScanRadius = 180;
      const progress = this.scanRadius / maxScanRadius;
      const mat = this.scanWave.material as THREE.MeshBasicMaterial;

      if (progress >= 1) {
        this.isScanning = false;
        this.scanWave.visible = false;
        mat.opacity = 0;
      } else {
        mat.opacity = (1 - progress) * 0.65;
      }
    }
  }
}
