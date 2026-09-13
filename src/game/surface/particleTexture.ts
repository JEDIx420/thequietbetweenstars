import * as THREE from 'three';

/**
 * Procedural Particle Alpha Textures
 * Generates soft radial circular falloffs on small offscreen canvases
 * to eliminate harsh rectangular WebGL points.
 */
export class ParticleTextureGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  public static getParticleTexture(type: 'snow' | 'dust' | 'ash' | 'spores' | 'mist' | 'default'): THREE.CanvasTexture {
    if (this.cache.has(type)) {
      return this.cache.get(type)!;
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const radius = size / 2;

    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(center, center, 0, center, center, radius);

    switch (type) {
      case 'snow':
        // Crisp soft core with rapid falloff
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.35, 'rgba(240, 248, 255, 0.8)');
        grad.addColorStop(0.7, 'rgba(220, 240, 255, 0.25)');
        grad.addColorStop(1.0, 'rgba(200, 230, 255, 0.0)');
        break;

      case 'spores':
        // Vibrant glowing core with luminous halo
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.2, 'rgba(120, 255, 230, 0.9)');
        grad.addColorStop(0.6, 'rgba(40, 200, 180, 0.4)');
        grad.addColorStop(1.0, 'rgba(0, 180, 160, 0.0)');
        break;

      case 'dust':
        // Warm subtle grain
        grad.addColorStop(0, 'rgba(255, 235, 190, 0.85)');
        grad.addColorStop(0.4, 'rgba(230, 190, 130, 0.4)');
        grad.addColorStop(1.0, 'rgba(180, 140, 90, 0.0)');
        break;

      case 'ash':
        // Soft mottled soot flake
        grad.addColorStop(0, 'rgba(220, 200, 190, 0.8)');
        grad.addColorStop(0.4, 'rgba(120, 100, 100, 0.4)');
        grad.addColorStop(1.0, 'rgba(50, 40, 40, 0.0)');
        break;

      case 'mist':
      default:
        // Ultra-soft diffuse haze
        grad.addColorStop(0, 'rgba(240, 245, 255, 0.45)');
        grad.addColorStop(0.5, 'rgba(220, 235, 255, 0.18)');
        grad.addColorStop(1.0, 'rgba(200, 220, 255, 0.0)');
        break;
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    this.cache.set(type, texture);
    return texture;
  }
}
