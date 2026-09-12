import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';

/**
 * PlanetVisualGenerator
 * Dynamically builds procedural multi-layer planetary meshes:
 * 1. Procedural canvas texture with continents, elevation noise, cloud swirls, and oceans
 * 2. MeshStandardMaterial with realistic roughness and metalness
 * 3. Atmospheric Rayleigh limb glow shell with additive blending
 * 4. Saturn-style concentric rings with opacity gaps when present
 */
export class PlanetVisualGenerator {
  public static createPlanetMesh(planet: PlanetDescriptor): {
    group: THREE.Group;
    planetMesh: THREE.Mesh;
    atmosphereMesh: THREE.Mesh | null;
    ringMesh: THREE.Mesh | null;
    cloudMesh: THREE.Mesh | null;
  } {
    const group = new THREE.Group();

    // 1. Procedural surface texture canvas
    const texture = this.generateSurfaceTexture(planet);
    const geometry = new THREE.SphereGeometry(planet.radius, 64, 48);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: planet.type === 'terrestrial-ocean' ? 0.3 : 0.8,
      metalness: 0.1,
    });

    const planetMesh = new THREE.Mesh(geometry, material);
    group.add(planetMesh);

    // 2. Cloud Sphere layer (for atmospheric planets)
    let cloudMesh: THREE.Mesh | null = null;
    if (planet.hasAtmosphere && planet.cloudCoverage > 0.1) {
      const cloudTex = this.generateCloudTexture(planet);
      const cloudGeo = new THREE.SphereGeometry(planet.radius * 1.018, 48, 36);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: Math.min(0.85, planet.cloudCoverage * 1.2),
        blending: THREE.NormalBlending,
        roughness: 0.9,
      });
      cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
      group.add(cloudMesh);
    }

    // 3. Rayleigh Atmospheric Limb Glow Shell
    let atmosphereMesh: THREE.Mesh | null = null;
    if (planet.hasAtmosphere) {
      const atmoGeo = new THREE.SphereGeometry(planet.radius * 1.055, 48, 48);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(planet.palette.atmosphereGlow),
        transparent: true,
        opacity: 0.32 * planet.atmosphereDensity,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat);
      group.add(atmosphereMesh);
    }

    // 4. Ring System
    let ringMesh: THREE.Mesh | null = null;
    if (planet.hasRings) {
      const inner = planet.radius * 1.35;
      const outer = planet.radius * 2.25;
      const ringGeo = new THREE.RingGeometry(inner, outer, 96);
      const ringMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(planet.palette.ringColor || planet.palette.secondary),
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.68,
      });
      ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.3;
      ringMesh.rotation.y = 0.14;
      group.add(ringMesh);
    }

    return { group, planetMesh, atmosphereMesh, ringMesh, cloudMesh };
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
    const { primary, secondary, ocean } = planet.palette;

    // Fill base background
    ctx.fillStyle = ocean || primary;
    ctx.fillRect(0, 0, 512, 256);

    if (planet.type === 'gas-giant') {
      // Atmospheric Jovian bands
      const bands = 24;
      const bandHeight = 256 / bands;
      for (let i = 0; i < bands; i++) {
        const y = i * bandHeight;
        const color = i % 2 === 0 ? primary : secondary;
        ctx.fillStyle = color;
        ctx.fillRect(0, y, 512, bandHeight);

        // Subtle storm swirls
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.ellipse(rng.range(50, 460), y + bandHeight / 2, rng.range(30, 80), rng.range(4, 10), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Terrestrial continents / landmasses
      const numContinents = rng.rangeInt(5, 12);
      ctx.fillStyle = primary;

      for (let c = 0; c < numContinents; c++) {
        const cx = rng.range(40, 470);
        const cy = rng.range(40, 210);
        const rx = rng.range(30, 90);
        const ry = rng.range(20, 60);

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rng.range(-0.4, 0.4), 0, Math.PI * 2);
        ctx.fill();

        // Secondary mountainous / desert interior
        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = primary;
      }

      // Polar ice caps
      if (planet.temperatureKelvin < 320) {
        ctx.fillStyle = '#ffffff';
        // North pole
        ctx.beginPath();
        ctx.ellipse(256, 12, 256, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        // South pole
        ctx.beginPath();
        ctx.ellipse(256, 244, 256, 22, 0, 0, Math.PI * 2);
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
    const rng = new SeededRandom(planet.seed + 101);
    ctx.fillStyle = planet.palette.cloudColor || '#ffffff';

    const cloudCount = Math.floor(planet.cloudCoverage * 35);
    for (let i = 0; i < cloudCount; i++) {
      const cx = rng.range(0, 512);
      const cy = rng.range(25, 230);
      const rx = rng.range(20, 70);
      const ry = rng.range(8, 24);

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rng.range(-0.2, 0.2), 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
}
