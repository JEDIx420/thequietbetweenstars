import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { AtmosphericEntrySequence } from '../src/game/surface/AtmosphericEntrySequence';
import { FaunaPopulationManager } from '../src/game/ecology/FaunaPopulationManager';
import { StructuredConversationProvider } from '../src/narrative/ConversationDirector';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { EcologyGenerator } from '../src/game/ecology/PlanetEcologyProfile';
import { SurfaceScene } from '../src/game/surface/SurfaceScene';
import type { PlanetDescriptor } from '../src/game/systems/PlanetDescriptor';
import { LandingSiteGenerator, type LandingSite } from '../src/game/systems/LandingSiteGenerator';

describe('Atmospheric Entry & Multi-Domain Giants Test Suite', () => {
  let container: HTMLElement;
  let planet: PlanetDescriptor;
  let site: LandingSite;

  beforeEach(() => {
    container = {
      appendChild: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLElement;

    const profile = PlanetEnvironmentGenerator.generateProfile(404, 'K', 'temperate-terrestrial');

    planet = {
      id: 'planet_titan',
      seed: 404,
      name: 'Titanus Prime',
      type: 'temperate-terrestrial',
      radius: 160,
      gravity: 9.8,
      hasAtmosphere: true,
      atmosphereDensity: 1.0,
      temperatureKelvin: 288,
      surfacePressureAtm: 1.0,
      oceanCoverage: 0.6,
      cloudCoverage: 0.4,
      biosignature: 'complex-ecosystem',
      hasRings: false,
      moonsCount: 0,
      palette: { primary: '#111', secondary: '#222', atmosphereGlow: '#333', cloudColor: '#fff' },
      shortDescription: 'Titanus Prime',
      isLandable: true,
      profile,
    };

    const sites = LandingSiteGenerator.generateSites(planet);
    site = sites[0];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs AtmosphericEntrySequence lifecycle and pre-warms shaders without hitch', () => {
    const sequence = new AtmosphericEntrySequence(container);
    const mockRenderer = {
      compile: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
    const testScene = new THREE.Scene();
    const testCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    let completed = false;
    sequence.start(planet, site, mockRenderer, testScene, testCamera, () => {
      completed = true;
    });

    expect(mockRenderer.compile).toHaveBeenCalled();

    // Finish sequence
    sequence.finish();
    expect(completed).toBe(true);
  });

  it('spawns Land, Water, and Air Giants with sentient NPC identities', () => {
    const ecology = EcologyGenerator.deriveEcology(planet.profile, planet.seed, planet.id);
    const faunaManager = new FaunaPopulationManager(ecology, site.region, null, []);

    const encounterSites = faunaManager.getEncounterSites();
    expect(encounterSites.length).toBe(3);

    const siteTypes = encounterSites.map((s) => s.type);
    expect(siteTypes).toContain('LAND_GIANT_SANCTUARY');
    expect(siteTypes).toContain('WATER_GIANT_SANCTUARY');
    expect(siteTypes).toContain('AIR_GIANT_SANCTUARY');

    // Verify each giant is talkable with isSentient = true and valid npcData
    for (const site of encounterSites) {
      expect(site.giantCreature.scanInfo.isSentient).toBe(true);
      expect(site.giantCreature.scanInfo.npcData).toBeDefined();
      expect(site.giantNPC.name).toBeDefined();
      expect(site.giantNPC.title).toBeDefined();
    }

    // Kinematics update test for ground, water, and aerial dynamics
    const craftPos = new THREE.Vector3(0, 30, 0);
    faunaManager.update(craftPos, 0.5, 0.016, () => 12.0);

    faunaManager.dispose();
  });

  it('provides domain-tailored dialogue for Land, Water, and Air Giants', () => {
    const ecology = EcologyGenerator.deriveEcology(planet.profile, planet.seed, planet.id);
    const faunaManager = new FaunaPopulationManager(ecology, site.region, null, []);
    const sites = faunaManager.getEncounterSites();

    const landGiant = sites.find((s) => s.type === 'LAND_GIANT_SANCTUARY')!.giantNPC;
    const waterGiant = sites.find((s) => s.type === 'WATER_GIANT_SANCTUARY')!.giantNPC;
    const airGiant = sites.find((s) => s.type === 'AIR_GIANT_SANCTUARY')!.giantNPC;

    // Start conversation test
    const turnLand = StructuredConversationProvider.startConversation(landGiant, 0);
    expect(turnLand.choices.length).toBeGreaterThan(0);

    // Ecology inquiries
    const ecoLand = StructuredConversationProvider.handleChoice(landGiant, 'ecology');
    expect(ecoLand.text).toContain('bedrock');

    const ecoWater = StructuredConversationProvider.handleChoice(waterGiant, 'ecology');
    expect(ecoWater.text).toContain('abyssal');

    const ecoAir = StructuredConversationProvider.handleChoice(airGiant, 'ecology');
    expect(ecoAir.text).toContain('sky');

    // 1420 kHz Resonance inquiries
    const resLand = StructuredConversationProvider.handleChoice(landGiant, 'the_resonance');
    expect(resLand.text).toContain('mantle');

    const resWater = StructuredConversationProvider.handleChoice(waterGiant, 'the_resonance');
    expect(resWater.text).toContain('saltwater');

    const resAir = StructuredConversationProvider.handleChoice(airGiant, 'the_resonance');
    expect(resAir.text).toContain('upper atmosphere');

    // Farewell
    const byeWater = StructuredConversationProvider.handleChoice(waterGiant, 'farewell');
    expect(byeWater.text).toContain('currents');

    faunaManager.dispose();
  });

  it('computes elevations for all 5 new morphologies on huge map', () => {
    const scene = new SurfaceScene(planet, site, [], { deferHeavyInitialization: true });

    const newMorphologies = [
      'bioluminescent_archipelago',
      'obsidian_caldera',
      'glacial_chasm',
      'floating_mesas',
      'spore_grotto',
    ] as const;

    for (const morph of newMorphologies) {
      site.region.terrainMorphologyOverride = morph;
      const h1 = scene.computeRawTerrainHeight(100, 100);
      const h2 = scene.computeRawTerrainHeight(350, -200);
      expect(h1).toBeGreaterThanOrEqual(0);
      expect(h2).toBeGreaterThanOrEqual(0);
      expect(typeof h1).toBe('number');
      expect(typeof h2).toBe('number');
    }

    scene.dispose();
  });
});
