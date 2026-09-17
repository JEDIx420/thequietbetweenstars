import * as THREE from 'three';
import type { PlanetEnvironmentProfile } from '../planets/PlanetEnvironmentProfile';
import type { LandingRegionProfile } from '../planets/LandingRegionProfile';
import type { ProceduralSky } from './ProceduralSky';

export type TimeOfDayPhase = 'DAWN' | 'MIDDAY' | 'DUSK' | 'NIGHT';

export type WeatherPattern =
  | 'CLEAR'
  | 'AURORA_STORM'
  | 'BIOLUMINESCENT_SPORE_GALE'
  | 'CRYSTAL_MIST'
  | 'ELECTROSTATIC_SQUALL';

export interface AtmosphereState {
  solarTime: number; // 0.0 to 1.0 (0.0 = midnight, 0.25 = dawn, 0.5 = midday, 0.75 = dusk)
  phase: TimeOfDayPhase;
  localTimeFormatted: string; // e.g. "14:32 LST"
  weather: WeatherPattern;
  sunDirection: THREE.Vector3;
  sunLightColor: THREE.Color;
  sunLightIntensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  starFade: number;
}

export class PlanetaryAtmosphereDirector {
  public profile: PlanetEnvironmentProfile;
  public region: LandingRegionProfile;
  public solarTime: number; // 0.0 to 1.0
  public dayDurationSec: number;
  public weather: WeatherPattern = 'CLEAR';
  public weatherTimer = 0;
  public weatherDurationSec = 90;

  // Cached base colors
  private baseSunColor: THREE.Color;
  private baseSkyZenith: THREE.Color;
  private baseSkyHorizon: THREE.Color;
  private baseLowland: THREE.Color;
  private baseFogColor: THREE.Color;
  private baseFogDensity: number;

  // Reusable vectors/colors to avoid per-frame allocations
  private currentSunDir = new THREE.Vector3();
  private currentSunColor = new THREE.Color();
  private currentZenith = new THREE.Color();
  private currentHorizon = new THREE.Color();
  private currentHemiSky = new THREE.Color();
  private currentHemiGround = new THREE.Color();
  private currentFogColor = new THREE.Color();

  constructor(
    profile: PlanetEnvironmentProfile,
    region: LandingRegionProfile,
    initialSolarTime = 0.38, // Start slightly before midday
    dayDurationSec = 240     // 4 minutes per planetary day
  ) {
    this.profile = profile;
    this.region = region;
    this.solarTime = initialSolarTime;
    this.dayDurationSec = dayDurationSec;

    this.baseSunColor = new THREE.Color(profile.palette.sunLightColor);
    this.baseSkyZenith = new THREE.Color(profile.atmosphere.skyZenith);
    this.baseSkyHorizon = new THREE.Color(profile.atmosphere.skyHorizon);
    this.baseLowland = new THREE.Color(region.localSurfacePalette.lowland);
    this.baseFogColor = new THREE.Color(region.fogModifier.color || profile.atmosphere.fogColor);
    this.baseFogDensity = profile.atmosphere.fogDensity * (region.fogModifier.densityMultiplier || 1.0);

    // Initial weather seed based on region seed
    const weatherList: WeatherPattern[] = [
      'CLEAR',
      'CLEAR',
      'AURORA_STORM',
      'BIOLUMINESCENT_SPORE_GALE',
      'CRYSTAL_MIST',
      'ELECTROSTATIC_SQUALL',
    ];
    this.weather = weatherList[Math.abs(region.regionSeed) % weatherList.length];
  }

  public update(
    dt: number,
    sunLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    fog: THREE.FogExp2,
    sky: ProceduralSky
  ): AtmosphereState {
    // 1. Advance Solar Time
    this.solarTime = (this.solarTime + dt / this.dayDurationSec) % 1.0;

    // 2. Advance Weather
    this.weatherTimer += dt;
    if (this.weatherTimer >= this.weatherDurationSec) {
      this.weatherTimer = 0;
      this.weatherDurationSec = 60 + Math.random() * 90;
      const weatherPool: WeatherPattern[] = [
        'CLEAR',
        'AURORA_STORM',
        'BIOLUMINESCENT_SPORE_GALE',
        'CRYSTAL_MIST',
        'ELECTROSTATIC_SQUALL',
      ];
      this.weather = weatherPool[Math.floor(Math.random() * weatherPool.length)];
    }

    // 3. Determine Phase
    let phase: TimeOfDayPhase = 'MIDDAY';
    if (this.solarTime >= 0.20 && this.solarTime < 0.32) {
      phase = 'DAWN';
    } else if (this.solarTime >= 0.32 && this.solarTime < 0.68) {
      phase = 'MIDDAY';
    } else if (this.solarTime >= 0.68 && this.solarTime < 0.80) {
      phase = 'DUSK';
    } else {
      phase = 'NIGHT';
    }

    // 4. Calculate Celestial Solar Mechanics
    // Sun elevation ranges from -1.0 (midnight) to +1.0 (noon)
    const sunAngle = (this.solarTime - 0.25) * Math.PI * 2;
    const elevation = Math.sin(sunAngle);
    const azimuth = (this.solarTime * Math.PI * 2);

    this.currentSunDir.set(
      Math.cos(azimuth) * 0.7,
      Math.max(-0.25, elevation),
      Math.sin(azimuth) * 0.7
    ).normalize();

    // 5. Lighting and Palette Interpolation
    const dayFactor = Math.max(0.0, Math.min(1.0, (elevation + 0.1) / 0.5));
    const nightFactor = 1.0 - dayFactor;
    const starFade = Math.max(0.0, Math.min(1.0, (-elevation + 0.15) / 0.45));

    // Sun intensity drops to 0 below horizon
    let sunIntensity = Math.max(0.0, elevation * 3.2);
    if (!this.profile.atmosphere.hasAtmosphere) {
      sunIntensity *= 1.25;
    }

    // Sun color shifts to warm amber at dawn/dusk
    if (phase === 'DAWN' || phase === 'DUSK') {
      const dawnT = phase === 'DAWN'
        ? 1.0 - Math.abs((this.solarTime - 0.26) / 0.06)
        : 1.0 - Math.abs((this.solarTime - 0.74) / 0.06);
      const warmFactor = Math.max(0, Math.min(1, dawnT));
      this.currentSunColor.copy(this.baseSunColor).lerp(new THREE.Color(0xf97316), warmFactor * 0.65);
      this.currentHorizon.copy(this.baseSkyHorizon).lerp(new THREE.Color(0xf43f5e), warmFactor * 0.55);
      this.currentZenith.copy(this.baseSkyZenith).lerp(new THREE.Color(0x312e81), warmFactor * 0.45);
    } else if (phase === 'NIGHT') {
      this.currentSunColor.setHex(0x38bdf8); // Moonlight tone
      this.currentZenith.setHex(0x020617);
      this.currentHorizon.setHex(0x0f172a);
    } else {
      this.currentSunColor.copy(this.baseSunColor);
      this.currentZenith.copy(this.baseSkyZenith);
      this.currentHorizon.copy(this.baseSkyHorizon);
    }

    // Weather modifications
    let fogDensityMult = 1.0;
    if (this.weather === 'CRYSTAL_MIST') {
      fogDensityMult = 2.4;
      this.currentFogColor.setHex(0x93c5fd);
    } else if (this.weather === 'AURORA_STORM') {
      fogDensityMult = 1.2;
      this.currentHorizon.lerp(new THREE.Color(0x10b981), 0.4);
      this.currentFogColor.lerp(new THREE.Color(0x065f46), 0.35);
    } else if (this.weather === 'BIOLUMINESCENT_SPORE_GALE') {
      fogDensityMult = 1.6;
      this.currentHorizon.lerp(new THREE.Color(0xc084fc), 0.35);
      this.currentFogColor.lerp(new THREE.Color(0x581c87), 0.35);
    } else if (this.weather === 'ELECTROSTATIC_SQUALL') {
      fogDensityMult = 1.5;
      this.currentFogColor.lerp(new THREE.Color(0x3b82f6), 0.3);
    } else {
      this.currentFogColor.copy(this.baseFogColor).lerp(new THREE.Color(0x020617), nightFactor * 0.7);
    }

    // Hemisphere light colors
    this.currentHemiSky.copy(this.currentHorizon).lerp(new THREE.Color(0x0f172a), nightFactor * 0.85);
    this.currentHemiGround.copy(this.baseLowland).lerp(new THREE.Color(0x020617), nightFactor * 0.9);
    const hemiIntensity = Math.max(0.25, 0.4 + dayFactor * 1.2);

    // Apply to 3D scene objects
    sunLight.position.copy(this.currentSunDir).multiplyScalar(800);
    sunLight.color.copy(this.currentSunColor);
    sunLight.intensity = sunIntensity;

    hemiLight.color.copy(this.currentHemiSky);
    hemiLight.groundColor.copy(this.currentHemiGround);
    hemiLight.intensity = hemiIntensity;

    fog.color.copy(this.currentFogColor);
    fog.density = this.baseFogDensity * fogDensityMult * (phase === 'NIGHT' ? 1.2 : 1.0);

    sky.setSkyColors(this.currentZenith, this.currentHorizon);
    sky.setSunUniforms(this.currentSunDir, this.currentSunColor, starFade);

    // Format local planetary clock (24-hour cycle)
    const totalMinutes = Math.floor(this.solarTime * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const localTimeFormatted = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} LST`;

    return {
      solarTime: this.solarTime,
      phase,
      localTimeFormatted,
      weather: this.weather,
      sunDirection: this.currentSunDir,
      sunLightColor: this.currentSunColor,
      sunLightIntensity: sunIntensity,
      hemiSkyColor: this.currentHemiSky,
      hemiGroundColor: this.currentHemiGround,
      hemiIntensity,
      fogColor: this.currentFogColor,
      fogDensity: fog.density,
      starFade,
    };
  }
}
