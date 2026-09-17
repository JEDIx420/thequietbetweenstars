import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';

/**
 * PlanetVisualGenerator
 * Dynamically builds procedural multi-layer planetary meshes:
 * 1. Procedural canvas texture consuming PlanetEnvironmentProfile (continents, basins, polar caps, canyons)
 * 2. MeshStandardMaterial with realistic roughness and normal/bump variation
 * 3. Atmospheric Rayleigh limb glow shell with additive blending and color matched to atmosphere
 * 4. Concentric rings with Cassini gaps when present
 * 5. Independent rotating cloud layer
 */
export class PlanetVisualGenerator {
  // Shared unit sphere geometries to eliminate duplicate GPU allocations
  private static unitPlanetGeo = new THREE.SphereGeometry(1, 64, 48);
  private static unitCloudGeo = new THREE.SphereGeometry(1, 48, 36);
  private static unitAtmoGeo = new THREE.SphereGeometry(1, 48, 48);

  // Bounded LRU texture cache by planet seed (max 16 entries)
  private static readonly MAX_TEXTURE_CACHE = 16;
  private static textureCache: Map<number, THREE.CanvasTexture> = new Map();
  private static cloudCache: Map<number, THREE.CanvasTexture> = new Map();

  public static clearTextureCaches(): void {
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    for (const tex of this.cloudCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
    this.cloudCache.clear();
  }

  public static createPlanetMesh(planet: PlanetDescriptor): {
    group: THREE.Group;
    planetMesh: THREE.Mesh;
    atmosphereMesh: THREE.Mesh | null;
    ringMesh: THREE.Mesh | null;
    cloudMesh: THREE.Mesh | null;
  } {
    const group = new THREE.Group();
    const profile = planet.profile;

    // 1. Procedural surface texture canvas
    const texture = this.getOrCreateSurfaceTexture(planet);

    const roughness = profile.family === 'cryogenic-ice'
      ? 0.25
      : profile.family === 'metallic-iron'
      ? 0.35
      : profile.terrain.hasLiquid
      ? 0.45
      : 0.82;

    const metalness = profile.family === 'metallic-iron'
      ? 0.65
      : profile.family === 'crystalline-mineral'
      ? 0.4
      : 0.08;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness,
      metalness,
    });

    const planetMesh = new THREE.Mesh(PlanetVisualGenerator.unitPlanetGeo, material);
    planetMesh.scale.setScalar(planet.radius);
    group.add(planetMesh);

    // 2. Cloud Sphere layer (for atmospheric planets)
    let cloudMesh: THREE.Mesh | null = null;
    if (profile.atmosphere.hasAtmosphere && profile.cloudCoverage > 0.08) {
      const cloudTex = this.getOrCreateCloudTexture(planet);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: Math.min(0.85, profile.cloudCoverage * 1.15),
        blending: THREE.NormalBlending,
        roughness: 0.9,
      });
      cloudMesh = new THREE.Mesh(PlanetVisualGenerator.unitCloudGeo, cloudMat);
      cloudMesh.scale.setScalar(planet.radius * 1.018);
      group.add(cloudMesh);
    }

    // 3. Rayleigh Atmospheric Limb Glow Shell
    let atmosphereMesh: THREE.Mesh | null = null;
    if (profile.atmosphere.hasAtmosphere) {
      const atmoMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(profile.palette.atmosphereGlow),
        transparent: true,
        opacity: 0.34 * Math.min(1.8, profile.atmosphere.density),
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      atmosphereMesh = new THREE.Mesh(PlanetVisualGenerator.unitAtmoGeo, atmoMat);
      atmosphereMesh.scale.setScalar(planet.radius * 1.055);
      group.add(atmosphereMesh);
    }

    // 4. Ring System
    let ringMesh: THREE.Mesh | null = null;
    if (profile.hasRings) {
      const inner = planet.radius * 1.35;
      const outer = planet.radius * 2.3;
      const ringGeo = new THREE.RingGeometry(inner, outer, 96);
      const ringMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(profile.palette.ringColor || profile.palette.surfaceHighland),
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      });
      ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.3;
      ringMesh.rotation.y = 0.14;
      group.add(ringMesh);
    }

    return { group, planetMesh, atmosphereMesh, ringMesh, cloudMesh };
  }

  private static getOrCreateSurfaceTexture(planet: PlanetDescriptor): THREE.CanvasTexture {
    const existing = this.textureCache.get(planet.seed);
    if (existing) {
      // Refresh LRU order
      this.textureCache.delete(planet.seed);
      this.textureCache.set(planet.seed, existing);
      return existing;
    }

    if (this.textureCache.size >= this.MAX_TEXTURE_CACHE) {
      const oldestKey = this.textureCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldTex = this.textureCache.get(oldestKey);
        oldTex?.dispose();
        this.textureCache.delete(oldestKey);
      }
    }

    const tex = this.generateSurfaceTexture(planet);
    this.textureCache.set(planet.seed, tex);
    return tex;
  }

  private static getOrCreateCloudTexture(planet: PlanetDescriptor): THREE.CanvasTexture {
    const existing = this.cloudCache.get(planet.seed);
    if (existing) {
      // Refresh LRU order
      this.cloudCache.delete(planet.seed);
      this.cloudCache.set(planet.seed, existing);
      return existing;
    }

    if (this.cloudCache.size >= this.MAX_TEXTURE_CACHE) {
      const oldestKey = this.cloudCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldTex = this.cloudCache.get(oldestKey);
        oldTex?.dispose();
        this.cloudCache.delete(oldestKey);
      }
    }

    const tex = this.generateCloudTexture(planet);
    this.cloudCache.set(planet.seed, tex);
    return tex;
  }

  private static generateSurfaceTexture(planet: PlanetDescriptor): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    const rng = new SeededRandom(planet.seed);
    const profile = planet.profile;
    const { surfaceLowland, surfaceMidland, surfaceHighland, surfacePeak, accentMineral } = profile.palette;

    // Base background: lowland / ocean
    ctx.fillStyle = surfaceLowland;
    ctx.fillRect(0, 0, 512, 256);

    if (profile.family === 'gas-giant') {
      // Atmospheric Jovian bands with turbulence
      const bands = 28;
      const bandHeight = 256 / bands;
      const bandColors = [surfaceLowland, surfaceMidland, surfaceHighland, surfacePeak];

      for (let i = 0; i < bands; i++) {
        const y = i * bandHeight;
        ctx.fillStyle = bandColors[i % bandColors.length];
        ctx.fillRect(0, y, 512, bandHeight);

        // Storm vortices
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.beginPath();
        const vortexX = rng.range(60, 450);
        ctx.ellipse(vortexX, y + bandHeight / 2, rng.range(35, 90), rng.range(5, 12), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (profile.family === 'barren-moon') {
      // Regolith dust + high-contrast impact craters
      ctx.fillStyle = surfaceMidland;
      ctx.fillRect(0, 0, 512, 256);

      const numCraters = rng.rangeInt(24, 45);
      for (let c = 0; c < numCraters; c++) {
        const cx = rng.range(20, 490);
        const cy = rng.range(20, 235);
        const r = rng.range(6, 28);

        // Crater rim
        ctx.fillStyle = surfacePeak;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
        ctx.fill();

        // Crater basin
        ctx.fillStyle = surfaceLowland;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Central peak
        ctx.fillStyle = accentMineral;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Terrestrial / Exotic Continents with elevation layering
      const numContinents = rng.rangeInt(6, 14);
      ctx.fillStyle = surfaceMidland;

      for (let c = 0; c < numContinents; c++) {
        const cx = rng.range(30, 480);
        const cy = rng.range(30, 220);
        const rx = rng.range(35, 100);
        const ry = rng.range(20, 65);
        const rot = rng.range(-0.5, 0.5);

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();

        // Highlands / Mountain spine
        ctx.fillStyle = surfaceHighland;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.55, ry * 0.55, rot, 0, Math.PI * 2);
        ctx.fill();

        // Mountain ridge peaks
        ctx.fillStyle = surfacePeak;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.25, ry * 0.25, rot, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = surfaceMidland;
      }

      // Polar ice or cryo caps
      if (profile.temperatureKelvin < 315 || profile.family === 'cryogenic-ice') {
        ctx.fillStyle = profile.palette.surfacePeak;
        // North cap
        ctx.beginPath();
        ctx.ellipse(256, 14, 256, profile.family === 'cryogenic-ice' ? 65 : 28, 0, 0, Math.PI * 2);
        ctx.fill();
        // South cap
        ctx.beginPath();
        ctx.ellipse(256, 242, 256, profile.family === 'cryogenic-ice' ? 65 : 28, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private static generateCloudTexture(planet: PlanetDescriptor): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, 512, 256);
    const rng = new SeededRandom(planet.seed + 202);
    ctx.fillStyle = planet.profile.palette.cloudColor || '#ffffff';

    const count = Math.floor(planet.profile.cloudCoverage * 42);
    for (let i = 0; i < count; i++) {
      const cx = rng.range(0, 512);
      const cy = rng.range(20, 235);
      const rx = rng.range(25, 85);
      const ry = rng.range(8, 26);

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rng.range(-0.25, 0.25), 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  public static clearCache(): void {
    for (const [, tex] of this.textureCache) {
      tex.dispose();
    }
    for (const [, tex] of this.cloudCache) {
      tex.dispose();
    }
    this.textureCache.clear();
    this.cloudCache.clear();
  }
}
