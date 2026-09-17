import * as THREE from 'three';
import { audio } from '../../audio/AudioEngine';
import type { SpaceTrafficDirector, TrafficVessel } from './SpaceTrafficDirector';

export type EmoteType = 'wave' | 'heart' | 'peace';

export interface FloatingEmoteParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
  rotationSpeed: number;
}

export class ShipEmoteDirector {
  public group = new THREE.Group();
  private particles: FloatingEmoteParticle[] = [];
  private textures = new Map<EmoteType, THREE.CanvasTexture>();

  constructor() {
    this.initTextures();
  }

  private initTextures(): void {
    const emotes: Record<EmoteType, string> = {
      wave: '👋',
      heart: '💖',
      peace: '✌️',
    };

    if (typeof document === 'undefined') return;

    for (const [type, char] of Object.entries(emotes) as [EmoteType, string][]) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 128, 128);

        // Soft radial glow aura behind emoji
        const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 60);
        if (type === 'heart') {
          grad.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
          grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        } else if (type === 'peace') {
          grad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
          grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        } else {
          grad.addColorStop(0, 'rgba(250, 204, 21, 0.45)');
          grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(64, 64, 60, 0, Math.PI * 2);
        ctx.fill();

        // High resolution centered emoji glyph
        ctx.font = '72px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, 64, 68);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      this.textures.set(type, texture);
    }
  }

  /**
   * Spawn a burst of floating 3D emoji particles around a target position
   */
  public spawnEmoteParticles(type: EmoteType, position: THREE.Vector3, count = 5): void {
    const texture = this.textures.get(type);
    if (!texture) return;

    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      // Offset slightly around ship hull
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        2 + Math.random() * 6,
        (Math.random() - 0.5) * 8
      );
      sprite.position.copy(position).add(offset);

      const scale = 3.5 + Math.random() * 2.0;
      sprite.scale.set(scale, scale, 1);

      // Float upwards and outwards
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        5 + Math.random() * 7,
        (Math.random() - 0.5) * 6
      );

      this.group.add(sprite);
      this.particles.push({
        sprite,
        velocity,
        life: 0,
        maxLife: 1.8 + Math.random() * 0.4,
        initialScale: scale,
        rotationSpeed: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  /**
   * Transmit an in-flight radio emote from player's ship.
   * Interacts with nearby traffic vessels if within radio range (480m).
   */
  public broadcastPlayerEmote(
    type: EmoteType,
    playerPos: THREE.Vector3,
    trafficDirector?: SpaceTrafficDirector | null
  ): { commNotice: string; responseReceived: boolean } {
    // 1. Play cheerful radio transmission audio
    audio.playBlip();

    // 2. Spawn 3D floating emoji particles around player ship
    this.spawnEmoteParticles(type, playerPos, 6);

    const emoteNames: Record<EmoteType, { name: string; emoji: string }> = {
      wave: { name: 'Friendly Wave', emoji: '👋' },
      heart: { name: 'Cosmic Warmth', emoji: '💖' },
      peace: { name: 'Peace Signal', emoji: '✌️' },
    };

    const info = emoteNames[type];

    // 3. Check for nearby traffic vessels
    if (trafficDirector && trafficDirector.vessels.length > 0) {
      let nearestVessel: TrafficVessel | null = null;
      let minDistance = Infinity;

      for (const vessel of trafficDirector.vessels) {
        const dist = vessel.position.distanceTo(playerPos);
        if (dist < minDistance) {
          minDistance = dist;
          nearestVessel = vessel;
        }
      }

      if (nearestVessel && minDistance <= 480) {
        // Trigger celebrative strobe flash & reaction on vessel
        nearestVessel.strobeFlashTimer = 1.6;

        // Vessel emits reciprocal emojis
        this.spawnEmoteParticles(type, nearestVessel.position, 6);

        // Friendly radio chatter response
        const responseText = this.generateRadioResponse(nearestVessel, type);

        return {
          commNotice: responseText,
          responseReceived: true,
        };
      }
    }

    return {
      commNotice: `[BROADCAST] ${info.emoji} ${info.name} beamed into the quiet void... (no vessels in comms range)`,
      responseReceived: false,
    };
  }

  private generateRadioResponse(vessel: TrafficVessel, emote: EmoteType): string {
    const name = vessel.name;
    switch (vessel.type) {
      case 'cargo_freighter':
        if (emote === 'wave') {
          return `[RADIO] ${name}: "Wave acknowledged, little starfighter! Clear lanes ahead." 👋`;
        } else if (emote === 'heart') {
          return `[RADIO] ${name}: "Long haul gets quiet out here—thanks for the cosmic warmth, pilot!" 💖`;
        } else {
          return `[RADIO] ${name}: "Peace sign logged. Keep your reactor running true and steady." ✌️`;
        }

      case 'scout_cutter':
        if (emote === 'wave') {
          return `[RADIO] ${name}: "Wave returned from the outer fringes! Beautiful day for flying." 👋`;
        } else if (emote === 'heart') {
          return `[RADIO] ${name}: "Right back at you! Keep that bright cosmic joy shining." 💖`;
        } else {
          return `[RADIO] ${name}: "Peace across the solar winds! Safe skies, traveler." ✌️`;
        }

      case 'science_corvette':
      default:
        if (emote === 'wave') {
          return `[RADIO] ${name}: "Visual greeting logged in observatory records. Greetings, fellow surveyor!" 👋`;
        } else if (emote === 'heart') {
          return `[RADIO] ${name}: "Resonance telemetry indicates pure affection! Warm wishes returned." 💖`;
        } else {
          return `[RADIO] ${name}: "Universal peace protocol confirmed. The quiet between stars is shared." ✌️`;
        }
    }
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const progress = p.life / p.maxLife;

      if (progress >= 1.0) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Move particle
      p.sprite.position.addScaledVector(p.velocity, dt);

      // Decelerate horizontal velocity
      p.velocity.x *= 0.96;
      p.velocity.z *= 0.96;

      // Scale: quick pop in, then gentle float out
      const scaleEase = progress < 0.2 ? progress / 0.2 : 1.0 + (progress - 0.2) * 0.3;
      const curScale = p.initialScale * scaleEase;
      p.sprite.scale.set(curScale, curScale, 1);

      // Fade out smoothly towards end
      const alpha = progress < 0.7 ? 0.95 : 0.95 * (1.0 - (progress - 0.7) / 0.3);
      p.sprite.material.opacity = Math.max(0, alpha);
    }
  }

  public onRebase(offset: THREE.Vector3): void {
    for (const p of this.particles) {
      p.sprite.position.add(offset);
    }
  }

  public dispose(): void {
    for (const p of this.particles) {
      this.group.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.particles = [];

    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();
  }
}
