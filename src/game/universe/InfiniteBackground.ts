import * as THREE from 'three';

/**
 * InfiniteBackground
 * Renders multi-layer deep stars, twinkling beacons, and ethereal cosmic nebulae
 * locked to the camera position so the player can fly indefinitely without ever hitting
 * a black edge or boundary.
 */
export class InfiniteBackground {
  public group: THREE.Group;
  private deepStarfield: THREE.Points;
  private twinkleStarfield: THREE.Points;
  private nebulaPoints: THREE.Points;

  constructor() {
    this.group = new THREE.Group();
    this.deepStarfield = this.createDeepStarfield();
    this.twinkleStarfield = this.createTwinkleStarfield();
    this.nebulaPoints = this.createCosmicNebula();

    this.group.add(this.deepStarfield);
    this.group.add(this.twinkleStarfield);
    this.group.add(this.nebulaPoints);
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

  /**
   * Update background position to perfectly follow the camera.
   * warpFactor > 0 stretches the background into hyperspace streaks along travel heading.
   */
  public update(cameraPos: THREE.Vector3, clock: number, warpFactor: number = 0, warpHeading?: THREE.Vector3): void {
    this.group.position.copy(cameraPos);

    // Subtle twinkling shimmer
    const twinkleMat = this.twinkleStarfield.material as THREE.PointsMaterial;
    twinkleMat.opacity = 0.65 + Math.sin(clock * 3.5) * 0.25;

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
}
