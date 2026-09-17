import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ShipEmoteDirector } from '../src/game/scenes/ShipEmoteDirector';
import { SpaceTrafficDirector } from '../src/game/scenes/SpaceTrafficDirector';

// Mock DOM canvas for Node environment
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 128,
          height: 128,
          getContext: () => ({
            clearRect: vi.fn(),
            createRadialGradient: () => ({
              addColorStop: vi.fn(),
            }),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            fillText: vi.fn(),
          }),
        };
      }
      return {};
    },
  };
}

describe('Ship Emotes & Radio Communications System', () => {
  let emoteDirector: ShipEmoteDirector;
  let trafficDirector: SpaceTrafficDirector;

  beforeEach(() => {
    emoteDirector = new ShipEmoteDirector();
    const sunPos = new THREE.Vector3(0, 0, 0);
    const planets = [new THREE.Vector3(300, 0, 0), new THREE.Vector3(-400, 0, 200)];
    trafficDirector = new SpaceTrafficDirector(12345, sunPos, planets);
  });

  it('initializes cleanly and has an empty particle group initially', () => {
    expect(emoteDirector).toBeDefined();
    expect(emoteDirector.group).toBeInstanceOf(THREE.Group);
    expect(emoteDirector.group.children.length).toBe(0);
  });

  it('spawns 3D floating emoji particles for wave, heart, and peace', () => {
    const playerPos = new THREE.Vector3(10, 20, 30);
    emoteDirector.spawnEmoteParticles('wave', playerPos, 5);
    expect(emoteDirector.group.children.length).toBe(5);

    emoteDirector.spawnEmoteParticles('heart', playerPos, 3);
    expect(emoteDirector.group.children.length).toBe(8);

    emoteDirector.spawnEmoteParticles('peace', playerPos, 4);
    expect(emoteDirector.group.children.length).toBe(12);
  });

  it('updates particle life and cleans up expired particles', () => {
    const playerPos = new THREE.Vector3(0, 0, 0);
    emoteDirector.spawnEmoteParticles('wave', playerPos, 3);
    expect(emoteDirector.group.children.length).toBe(3);

    // Simulate 3 seconds of flight time (particles maxLife is ~1.8-2.2s)
    emoteDirector.update(1.0);
    expect(emoteDirector.group.children.length).toBe(3);

    emoteDirector.update(2.5);
    expect(emoteDirector.group.children.length).toBe(0);
  });

  it('broadcasts player emote into void when no vessels are nearby', () => {
    const remotePos = new THREE.Vector3(99999, 99999, 99999);
    const result = emoteDirector.broadcastPlayerEmote('wave', remotePos, trafficDirector);

    expect(result.responseReceived).toBe(false);
    expect(result.commNotice).toContain('👋');
    expect(result.commNotice).toContain('no vessels in comms range');
  });

  it('receives reciprocal radio response and triggers strobe when a traffic vessel is in range', () => {
    // Position player right next to the first traffic vessel
    const targetVessel = trafficDirector.vessels[0];
    const playerPos = targetVessel.position.clone().add(new THREE.Vector3(50, 0, 50));

    const waveResult = emoteDirector.broadcastPlayerEmote('wave', playerPos, trafficDirector);
    expect(waveResult.responseReceived).toBe(true);
    expect(waveResult.commNotice).toContain(targetVessel.name);
    expect(waveResult.commNotice).toContain('👋');
    expect(targetVessel.strobeFlashTimer).toBeGreaterThan(0);

    const heartResult = emoteDirector.broadcastPlayerEmote('heart', playerPos, trafficDirector);
    expect(heartResult.responseReceived).toBe(true);
    expect(heartResult.commNotice).toContain('💖');

    const peaceResult = emoteDirector.broadcastPlayerEmote('peace', playerPos, trafficDirector);
    expect(peaceResult.responseReceived).toBe(true);
    expect(peaceResult.commNotice).toContain('✌️');
  });

  it('rebases particle positions on floating origin shift', () => {
    const playerPos = new THREE.Vector3(100, 0, 0);
    emoteDirector.spawnEmoteParticles('heart', playerPos, 2);

    const initialPos = emoteDirector.group.children[0].position.clone();
    const offset = new THREE.Vector3(-1000, 0, 0);
    emoteDirector.onRebase(offset);

    expect(emoteDirector.group.children[0].position.x).toBeCloseTo(initialPos.x - 1000);
  });
});
