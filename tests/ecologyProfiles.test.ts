import { describe, it, expect } from 'vitest';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { EcologyGenerator } from '../src/game/ecology/PlanetEcologyProfile';
import { SentientSpeciesGenerator } from '../src/game/ecology/SentientSpeciesProfile';
import { StructuredConversationProvider } from '../src/narrative/ConversationDirector';
import { FaunaPopulationManager } from '../src/game/ecology/FaunaPopulationManager';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import * as THREE from 'three';

describe('Planet Ecology, Motifs & Sentient Species', () => {
  it('deterministically generates ecology profiles and evolutionary motifs', () => {
    const planetEnv = PlanetEnvironmentGenerator.generateProfile(42, 'G', 'temperate-terrestrial');
    const ecologyA = EcologyGenerator.deriveEcology(planetEnv, 42, 'planet_42');
    const ecologyB = EcologyGenerator.deriveEcology(planetEnv, 42, 'planet_42');

    expect(ecologyA.tier).toBe(ecologyB.tier);
    expect(ecologyA.motif.name).toBe(ecologyB.motif.name);
    expect(ecologyA.motif.limbCount).toBe(ecologyB.motif.limbCount);
    expect(ecologyA.motif.eyeCount).toBe(ecologyB.motif.eyeCount);
    expect(ecologyA.groundSpecies.length).toBe(ecologyB.groundSpecies.length);
  });

  it('generates sentient giants and causal worldview when tier is SENTIENT_BIOSPHERE', () => {
    // Generate an anomalous profile
    const planetEnv = PlanetEnvironmentGenerator.generateProfile(777, 'G', 'high-biosignature');
    planetEnv.biosignature = 'anomalous';
    planetEnv.atmosphere.hasAtmosphere = true;
    planetEnv.temperatureKelvin = 295;
    planetEnv.oceanCoverage = 0.5;

    const ecology = EcologyGenerator.deriveEcology(planetEnv, 777, 'planet_sentient');
    expect(ecology.tier).toBe('SENTIENT_BIOSPHERE');
    expect(ecology.sentientSpecies.length).toBeGreaterThan(0);

    const sentientSpecies = SentientSpeciesGenerator.generateSpecies(planetEnv, 777, 'planet_sentient', ecology);
    expect(sentientSpecies).not.toBeNull();
    if (sentientSpecies) {
      expect(sentientSpecies.name).toBeTruthy();
      expect(sentientSpecies.averageHeightMeters).toBeGreaterThanOrEqual(14);
      expect(sentientSpecies.interpretationOfResonance).toBeTruthy();

      const npcs = SentientSpeciesGenerator.generateNotableNPCs(sentientSpecies, 3, 777);
      expect(npcs.length).toBe(3);
      expect(npcs[0].name).toBeTruthy();
      expect(npcs[0].loreFactTitle).toBeTruthy();
      expect(npcs[0].loreFactText).toBeTruthy();

      // Verify StructuredConversationProvider generates valid dialogue trees
      const turn1 = StructuredConversationProvider.startConversation(npcs[0], 0);
      expect(turn1.text).toContain(npcs[0].greeting);
      expect(turn1.choices.length).toBeGreaterThan(0);

      // Verify selecting a lore option
      const turn2 = StructuredConversationProvider.handleChoice(npcs[0], 'history');
      expect(turn2.revealedLoreTitle).toBe(npcs[0].loreFactTitle);
      expect(turn2.revealedLoreContent).toBe(npcs[0].loreFactText);
    }
  });

  it('streams fauna populations across spatial cells without errors', () => {
    const planetEnv = PlanetEnvironmentGenerator.generateProfile(101, 'G', 'temperate-terrestrial');
    planetEnv.biosignature = 'complex-ecosystem';
    planetEnv.atmosphere.hasAtmosphere = true;
    planetEnv.temperatureKelvin = 285;
    planetEnv.oceanCoverage = 0.4;

    const regions = LandingRegionGenerator.generateRegions(planetEnv, 101);
    const region = regions[0];
    const ecology = EcologyGenerator.deriveEcology(planetEnv, 101, 'planet_101');
    const sentient = SentientSpeciesGenerator.generateSpecies(planetEnv, 101, 'planet_101', ecology);

    const faunaMgr = new FaunaPopulationManager(ecology, region, sentient);

    // Initial position
    faunaMgr.update(new THREE.Vector3(0, 10, 0), 0.5, 0.016, () => 15);
    const initialCreatures = faunaMgr.getActiveCreatures();
    expect(initialCreatures.length).toBeGreaterThan(0);

    // Move to adjacent cell
    faunaMgr.update(new THREE.Vector3(250, 10, 250), 0.2, 0.016, () => 15);
    expect(faunaMgr.getActiveCreatures().length).toBeGreaterThan(0);
  });
});
