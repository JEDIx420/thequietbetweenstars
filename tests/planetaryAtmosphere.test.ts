import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlanetaryAtmosphereDirector } from '../src/game/surface/PlanetaryAtmosphereDirector';
import { ProceduralSky } from '../src/game/surface/ProceduralSky';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';

describe('Planetary Atmosphere & Weather System Suite', () => {
  const profile = PlanetEnvironmentGenerator.generateProfile('seed-atmo', 'G');
  const regions = LandingRegionGenerator.generateRegions(profile, 777);
  const region = regions[0];

  it('cycles through solar phases: dawn, midday, dusk, and night', () => {
    const director = new PlanetaryAtmosphereDirector(profile, region, 0.25, 240);
    const sunLight = new THREE.DirectionalLight();
    const hemiLight = new THREE.HemisphereLight();
    const fog = new THREE.FogExp2(0x000000, 0.002);
    const sky = new ProceduralSky(profile.atmosphere);

    // Test DAWN phase
    director.solarTime = 0.26;
    const dawnState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(dawnState.phase).toBe('DAWN');
    expect(dawnState.localTimeFormatted).toMatch(/\d{2}:\d{2} LST/);
    expect(sunLight.intensity).toBeGreaterThan(0);

    // Test MIDDAY phase
    director.solarTime = 0.50;
    const middayState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(middayState.phase).toBe('MIDDAY');
    expect(sunLight.intensity).toBeGreaterThan(dawnState.sunLightIntensity);

    // Test DUSK phase
    director.solarTime = 0.74;
    const duskState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(duskState.phase).toBe('DUSK');

    // Test NIGHT phase
    director.solarTime = 0.05;
    const nightState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(nightState.phase).toBe('NIGHT');
    expect(nightState.sunLightIntensity).toBe(0);
    expect(nightState.starFade).toBeGreaterThan(0);
  });

  it('modulates atmospheric fog and light colors during weather patterns', () => {
    const director = new PlanetaryAtmosphereDirector(profile, region, 0.5, 240);
    const sunLight = new THREE.DirectionalLight();
    const hemiLight = new THREE.HemisphereLight();
    const fog = new THREE.FogExp2(0x000000, 0.002);
    const sky = new ProceduralSky(profile.atmosphere);

    director.weather = 'CRYSTAL_MIST';
    const mistState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(mistState.weather).toBe('CRYSTAL_MIST');
    expect(fog.density).toBeGreaterThan(0.001);

    director.weather = 'AURORA_STORM';
    const auroraState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(auroraState.weather).toBe('AURORA_STORM');

    director.weather = 'BIOLUMINESCENT_SPORE_GALE';
    const sporeState = director.update(0.016, sunLight, hemiLight, fog, sky);
    expect(sporeState.weather).toBe('BIOLUMINESCENT_SPORE_GALE');
  });
});
