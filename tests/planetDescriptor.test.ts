import { describe, it, expect } from 'vitest';
import { StarSystemGenerator } from '../src/game/systems/StarSystemGenerator';
import { LandingSiteGenerator } from '../src/game/systems/LandingSiteGenerator';
import { SectorManager } from '../src/game/universe/SectorManager';

describe('Star System & Planet Generation Determinism', () => {
  it('generates identical star systems from the same sector seed', () => {
    const sys1 = StarSystemGenerator.generateSystem('QUIET-TEST-001', 3, -1, 5);
    const sys2 = StarSystemGenerator.generateSystem('QUIET-TEST-001', 3, -1, 5);

    expect(sys1.name).toEqual(sys2.name);
    expect(sys1.star.name).toEqual(sys2.star.name);
    expect(sys1.planets.length).toEqual(sys2.planets.length);
    expect(sys1.planets[0].name).toEqual(sys2.planets[0].name);
    expect(sys1.planets[0].temperatureKelvin).toEqual(sys2.planets[0].temperatureKelvin);
  });

  it('generates reproducible landing sites for landable planets', () => {
    const sys = StarSystemGenerator.generateSystem('QUIET-TEST-001', 0, 0, 0);
    const landable = sys.planets.find((p) => p.isLandable);
    expect(landable).toBeDefined();

    const sites1 = LandingSiteGenerator.generateSites(landable!);
    const sites2 = LandingSiteGenerator.generateSites(landable!);

    expect(sites1.length).toBeGreaterThan(0);
    expect(sites1).toEqual(sites2);
  });

  it('streams sectors deterministically around player coordinates', () => {
    const sm = new SectorManager('QUIET-TEST-001');
    const s1 = sm.generateSector(0, 0, 0);
    const s2 = sm.generateSector(0, 0, 0);

    expect(s1.hasSystem).toBe(true);
    expect(s1.system?.name).toEqual(s2.system?.name);
  });
});
