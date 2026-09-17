import * as THREE from 'three';

/**
 * InfiniteBackground
 * Renders multi-layer deep stars, twinkling beacons, ethereal cosmic nebulae,
 * and cinematic shooting stars/meteor trails locked to the camera position.
 */
export class InfiniteBackground {
  public group: THREE.Group;
  private deepStarfield: THREE.Points;
  private twinkleStarfield: THREE.Points;
  private nebulaPoints: THREE.Points;

  // Cosmic Shooting Stars (Batched single LineSegments draw call)
  private shootingStarsMesh: THREE.LineSegments;
  private shootingStarsGeo: THREE.BufferGeometry;
  private shootingStarsMat: THREE.LineBasicMaterial;
  private shootingStarPositions: Float32Array;
  private shootingStarCount = 14;
  private shootingStarData: Array<{
    x: number;
    y: number;
    z: number;
    dirX: number;
    dirY: number;
    dirZ: number;
    len: number;
    speed: number;
  }> = [];

  constructor() {
    this.group = new THREE.Group();
    this.deepStarfield = this.createDeepStarfield();
    this.twinkleStarfield = this.createTwinkleStarfield();
    this.nebulaPoints = this.createCosmicNebula();

    const { mesh, geo, mat, positions, data } = this.createShootingStars();
    this.shootingStarsMesh = mesh;
    this.shootingStarsGeo = geo;
    this.shootingStarsMat = mat;
    this.shootingStarPositions = positions;
    this.shootingStarData = data;

    this.group.add(this.deepStarfield);
    this.group.add(this.twinkleStarfield);
    this.group.add(this.nebulaPoints);
    this.group.add(this.shootingStarsMesh);
  }

  private createDeepStarfield(): THREE.Points {
    const starCount = 6000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const palette = [
      new THREE.Color(0xfde68a), // K-type amber
      new THREE.Color(0xfef08a), // G-type yellow-white
      new THREE.Color(0xffffff), // A-type crisp white
      new THREE.Color(0x93c5fd), // B-type ice blue
      new THREE.Color(0x67e8f9), // Bright cyan
      new THREE.Color(0xf472b6), // Soft rose
    ];

    const sphereRadius = 3800;

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = sphereRadius + (Math.random() - 0.5) * 800;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const col = palette[Math.floor(Math.random() * palette.length)];
      const brightness = 0.4 + Math.random() * 0.6;
      colors[i * 3] = col.r * brightness;
      colors[i * 3 + 1] = col.g * brightness;
      colors[i * 3 + 2] = col.b * brightness;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: false,
      depthWrite: false,
    });

    return new THREE.Points(geometry, material);
  }

  private createTwinkleStarfield(): THREE.Points {
    const starCount = 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    const sphereRadius = 3500;
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = sphereRadius + (Math.random() - 0.5) * 600;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 3.8,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: false,
      depthWrite: false,
    });

    return new THREE.Points(geometry, material);
  }

  private createCosmicNebula(): THREE.Points {
    const count = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const nebulaColors = [
      new THREE.Color(0x3b82f6), // Cobalt
      new THREE.Color(0x8b5cf6), // Violet
      new THREE.Color(0x06b6d4), // Cyan
      new THREE.Color(0xd946ef), // Magenta
    ];

    for (let i = 0; i < count; i++) {
      const cluster = i % 4;
      const clusterAngle = cluster * (Math.PI / 2) + 0.3;
      const centerDist = 3600;
      const spread = 700;

      const cx = Math.cos(clusterAngle) * centerDist;
      const cy = Math.sin(clusterAngle * 1.5) * 600;
      const cz = Math.sin(clusterAngle) * centerDist;

      positions[i * 3] = cx + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = cy + (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = cz + (Math.random() - 0.5) * spread;

      const col = nebulaColors[cluster];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 55.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geometry, material);
  }

  private createShootingStars(): {
    mesh: THREE.LineSegments;
    geo: THREE.BufferGeometry;
    mat: THREE.LineBasicMaterial;
    positions: Float32Array;
    data: Array<{
      x: number;
      y: number;
      z: number;
      dirX: number;
      dirY: number;
      dirZ: number;
      len: number;
      speed: number;
    }>;
  } {
    const count = this.shootingStarCount;
    const spawnRadius = 2200;
    const data: Array<{
      x: number;
      y: number;
      z: number;
      dirX: number;
      dirY: number;
      dirZ: number;
      len: number;
      speed: number;
    }> = [];

    // Each segment has 2 vertices = 6 floats
    const positions = new Float32Array(count * 6);

    for (let i = 0; i < count; i++) {
      const len = 120 + Math.random() * 200;
      const rawX = 0.7 + (Math.random() - 0.5) * 0.4;
      const rawY = 0.3 + (Math.random() - 0.5) * 0.3;
      const rawZ = -0.6 + (Math.random() - 0.5) * 0.4;
      const norm = Math.hypot(rawX, rawY, rawZ) || 1;
      const dirX = rawX / norm;
      const dirY = rawY / norm;
      const dirZ = rawZ / norm;
      const speed = 400 + Math.random() * 500;

      const x = (Math.random() - 0.5) * spawnRadius;
      const y = (Math.random() - 0.5) * spawnRadius * 0.7;
      const z = (Math.random() - 0.5) * spawnRadius;

      data.push({ x, y, z, dirX, dirY, dirZ, len, speed });

      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x - dirX * len;
      positions[idx + 4] = y - dirY * len;
      positions[idx + 5] = z - dirZ * len;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.LineSegments(geo, mat);
    return { mesh, geo, mat, positions, data };
  }

  /**
   * Update background position to perfectly follow the camera.
   * warpFactor > 0 stretches the background into hyperspace streaks along travel heading.
   */
  public update(cameraPos: THREE.Vector3, clock: number, warpFactor: number = 0, warpHeading?: THREE.Vector3, dt: number = 0.016): void {
    this.group.position.copy(cameraPos);

    // Subtle twinkling shimmer
    const twinkleMat = this.twinkleStarfield.material as THREE.PointsMaterial;
    twinkleMat.opacity = 0.65 + Math.sin(clock * 3.5) * 0.25;

    // Animate shooting stars via single batched typed array update
    const limit = 2200;
    const speedMult = 1.0 + warpFactor * 3.0;
    const posAttr = this.shootingStarsGeo.attributes.position;
    const positions = this.shootingStarPositions;

    for (let i = 0; i < this.shootingStarData.length; i++) {
      const s = this.shootingStarData[i];
      s.x += s.dirX * s.speed * dt * speedMult;
      s.y += s.dirY * s.speed * dt * speedMult;
      s.z += s.dirZ * s.speed * dt * speedMult;

      if (Math.abs(s.x) > limit || Math.abs(s.y) > limit || Math.abs(s.z) > limit) {
        s.x = (Math.random() - 0.5) * limit;
        s.y = (Math.random() - 0.5) * limit * 0.6;
        s.z = -limit * 0.8 + Math.random() * (limit * 1.6);
      }

      const idx = i * 6;
      positions[idx] = s.x;
      positions[idx + 1] = s.y;
      positions[idx + 2] = s.z;
      positions[idx + 3] = s.x - s.dirX * s.len;
      positions[idx + 4] = s.y - s.dirY * s.len;
      positions[idx + 5] = s.z - s.dirZ * s.len;
    }
    posAttr.needsUpdate = true;

    if (warpFactor > 0 && warpHeading) {
      // Warp stretch: scale points along velocity vector
      const deepMat = this.deepStarfield.material as THREE.PointsMaterial;
      deepMat.size = 2.0 + warpFactor * 5.5;
      twinkleMat.size = 3.5 + warpFactor * 8.0;
      this.deepStarfield.scale.set(
        1 + Math.abs(warpHeading.x) * warpFactor * 1.5,
        1 + Math.abs(warpHeading.y) * warpFactor * 1.5,
        1 + Math.abs(warpHeading.z) * warpFactor * 1.5
      );
    } else {
      const deepMat = this.deepStarfield.material as THREE.PointsMaterial;
      deepMat.size = 2.0;
      twinkleMat.size = 3.5;
      this.deepStarfield.scale.set(1, 1, 1);
    }
  }

  public dispose(): void {
    this.deepStarfield.geometry.dispose();
    (this.deepStarfield.material as THREE.Material).dispose();

    this.twinkleStarfield.geometry.dispose();
    (this.twinkleStarfield.material as THREE.Material).dispose();

    this.nebulaPoints.geometry.dispose();
    (this.nebulaPoints.material as THREE.Material).dispose();

    this.shootingStarsGeo.dispose();
    this.shootingStarsMat.dispose();

    this.group.clear();
  }
}
