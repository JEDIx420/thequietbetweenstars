import * as THREE from 'three';
import { PlanetEnvironmentGenerator } from '../game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator, type LandingRegionProfile } from '../game/planets/LandingRegionProfile';
import type { PlanetDescriptor } from '../game/systems/PlanetDescriptor';
import { SurfaceScene } from '../game/surface/SurfaceScene';
import type { LandingSite } from '../game/systems/LandingSiteGenerator';

export class WorldLabApp {
  private container: HTMLElement;
  private currentSurfaceScene: SurfaceScene | null = null;
  private animId: number | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div style="width: 100vw; height: 100vh; background: #07090e; color: #d0d7e6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; display: flex; flex-direction: column; overflow: hidden;">
        <header style="padding: 14px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(10,14,24,0.92); display: flex; justify-content: space-between; align-items: center; z-index: 10;">
          <div>
            <h1 style="margin: 0; font-size: 1.15rem; letter-spacing: 0.12em; text-transform: uppercase; color: #f0f4ff;">
              World Lab & Regional Biome QA
            </h1>
            <p style="margin: 3px 0 0 0; font-size: 0.78rem; color: #73809c;">
              Real-time procedural surface verification: Simplex/ridged morphology, regional palettes, instanced flora & living fauna telemetry.
            </p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span id="qa-stats" style="font-size: 0.8rem; color: #38bdf8; font-family: monospace;"></span>
            <a href="${window.location.pathname}" style="color: #64b5f6; font-size: 0.82rem; text-decoration: none; border: 1px solid rgba(100,181,246,0.3); padding: 5px 12px; border-radius: 4px;">&larr; Return to Game</a>
          </div>
        </header>

        <div style="flex: 1; display: flex; overflow: hidden; position: relative;">
          <!-- Left Control Panel -->
          <div style="width: 380px; border-right: 1px solid rgba(255,255,255,0.08); background: #0c101b; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; z-index: 5;">
            <div>
              <label style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 600;">Planet Preset / Seed</label>
              <select id="preset-select" style="width: 100%; margin-top: 6px; padding: 8px 10px; background: #161c2d; border: 1px solid rgba(255,255,255,0.12); color: #f1f5f9; border-radius: 4px; font-size: 0.85rem;">
                <option value="seed-desert-dunes-42|G">Desert Erg (Equatorial Dunes / Canyons / Salt Flat)</option>
                <option value="seed-terrestrial-lush-11|G">Temperate Verdant (Coast / Alpine Valley / Biome Canopy)</option>
                <option value="seed-cryo-ice-world-99|A">Cryogenic Ice (Crevasse Rift / Polar Plain / Cryo Vents)</option>
                <option value="seed-volcanic-rift-88|M">Volcanic Basalt (Pyroclastic Fissures / Caldera Rim)</option>
                <option value="seed-metallic-iron-64|K">Metallic Iron (Heavy Ore Ridges & Lowlands)</option>
                <option value="custom">Custom Seed...</option>
              </select>
            </div>

            <div id="custom-seed-container" style="display: none; flex-direction: column; gap: 6px;">
              <input type="text" id="custom-seed-input" placeholder="Enter arbitrary string seed" value="seed-custom-alpha-1" style="padding: 8px 10px; background: #161c2d; border: 1px solid rgba(255,255,255,0.12); color: #f1f5f9; border-radius: 4px; font-size: 0.85rem;" />
            </div>

            <div>
              <label style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 600;">Regional Biome Sites</label>
              <div id="regions-list" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
              </div>
            </div>

            <div id="region-details" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 14px; border-radius: 6px; font-size: 0.78rem; line-height: 1.5; color: #94a3b8;">
              Select a region above to inspect its morphology and inspect 3D flight.
            </div>

            <div style="margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.72rem; color: #64748b;">
              Controls: Click viewport & use <b>W/A/S/D</b> or Arrow Keys to pilot craft.
            </div>
          </div>

          <!-- 3D Surface Viewport -->
          <div id="viewport" style="flex: 1; position: relative; background: #020306;">
            <div id="scan-hud" style="position: absolute; bottom: 20px; left: 20px; background: rgba(10,16,28,0.85); border: 1px solid rgba(56,189,248,0.4); padding: 12px 18px; border-radius: 6px; color: #e0f2fe; font-size: 0.8rem; pointer-events: none; display: none; max-width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupViewport();
    this.setupLogic();
  }

  private setupViewport() {
    const viewport = this.container.querySelector('#viewport') as HTMLElement;
    if (!viewport) return;

    this.threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.threeRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewport.appendChild(this.threeRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(65, viewport.clientWidth / viewport.clientHeight, 0.5, 3500);

    window.addEventListener('resize', () => {
      if (!this.threeRenderer || !this.camera || !viewport) return;
      this.threeRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
      this.camera.aspect = viewport.clientWidth / viewport.clientHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  private setupLogic() {
    const presetSelect = this.container.querySelector('#preset-select') as HTMLSelectElement;
    const customContainer = this.container.querySelector('#custom-seed-container') as HTMLElement;
    const customInput = this.container.querySelector('#custom-seed-input') as HTMLInputElement;

    const loadPreset = () => {
      const val = presetSelect.value;
      if (val === 'custom') {
        customContainer.style.display = 'flex';
        this.loadPlanet(customInput.value || 'seed-default', 'G');
      } else {
        customContainer.style.display = 'none';
        const [seed, star] = val.split('|');
        this.loadPlanet(seed, star);
      }
    };

    presetSelect.addEventListener('change', loadPreset);
    customInput.addEventListener('input', () => {
      this.loadPlanet(customInput.value || 'seed-default', 'G');
    });

    loadPreset();
  }

  private loadPlanet(seed: string, starClass: string) {
    const profile = PlanetEnvironmentGenerator.generateProfile(seed, starClass);
    const regions = LandingRegionGenerator.generateRegions(profile, 1337);

    const regionsList = this.container.querySelector('#regions-list') as HTMLElement;
    regionsList.innerHTML = '';

    regions.forEach((r, idx) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        padding: 10px 14px;
        background: ${idx === 0 ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)'};
        border: 1px solid ${idx === 0 ? '#38bdf8' : 'rgba(255,255,255,0.1)'};
        border-radius: 5px;
        color: #f8fafc;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 3px;
        transition: all 0.15s ease;
      `;
      btn.innerHTML = `
        <div style="font-weight: 600; font-size: 0.85rem; color: #38bdf8;">${r.name}</div>
        <div style="font-size: 0.72rem; color: #94a3b8;">${r.regionType} &bull; <span style="color: #cbd5e1;">${r.terrainMorphologyOverride}</span></div>
      `;

      btn.addEventListener('click', () => {
        Array.from(regionsList.children).forEach((child) => {
          (child as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
          (child as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
        });
        btn.style.borderColor = '#38bdf8';
        btn.style.background = 'rgba(56,189,248,0.15)';
        this.selectRegion(profile, seed, r);
      });

      regionsList.appendChild(btn);
    });

    if (regions.length > 0) {
      this.selectRegion(profile, seed, regions[0]);
    }
  }

  private selectRegion(profile: any, seed: string, region: LandingRegionProfile) {
    const details = this.container.querySelector('#region-details') as HTMLElement;
    details.innerHTML = `
      <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 6px;">${region.name} (${region.biomeName})</div>
      <div style="margin-bottom: 8px; color: #94a3b8; font-style: italic;">"${region.loreSnippet}"</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.72rem;">
        <div>Morphology: <b style="color: #38bdf8;">${region.terrainMorphologyOverride}</b></div>
        <div>Relief (Height): <b style="color: #cbd5e1;">${region.heightScale.toFixed(2)}x</b></div>
        <div>Vegetation: <b style="color: #a7f3d0;">${region.vegetationArchetype} (${(region.vegetationDensity * 100).toFixed(0)}%)</b></div>
        <div>Fauna: <b style="color: #fbcfe8;">${region.faunaArchetypes.join(', ') || 'none'}</b></div>
        <div>Safety: <b style="color: #fef08a;">${region.safetyRating}</b></div>
        <div>Atmosphere: <b style="color: #e0e7ff;">${region.particleModifier.type || 'clear'}</b></div>
      </div>
    `;

    // Create synthetic PlanetDescriptor and LandingSite for SurfaceScene
    const dummyPlanet: PlanetDescriptor = {
      id: `lab-${seed}`,
      seed: 4242,
      profile,
      radius: 120,
      orbitRadius: 200,
      orbitSpeed: 0.01,
      orbitAngle: 0,
      rotationPeriod: 24,
      isLandable: true,
      hasAtmosphere: profile.atmosphere.hasAtmosphere,
    } as any;

    const dummySite: LandingSite = {
      id: `site-${region.id}`,
      name: region.name,
      latitude: 0,
      longitude: 0,
      biome: region.biomeName,
      terrainType: profile.family,
      safetyRating: region.safetyRating,
      interestingSignals: region.interestingSignals,
      localHeightScale: region.heightScale,
      localRoughness: region.roughness,
      region,
    };

    if (this.currentSurfaceScene) {
      this.currentSurfaceScene.dispose();
    }

    this.currentSurfaceScene = new SurfaceScene(dummyPlanet, dummySite);

    // Keyboard piloting input state
    const input = {
      throttle: 0.4,
      axes: { x: 0, y: 0 },
      isDown: false,
    };

    window.onkeydown = (e) => {
      if (e.key === 'w' || e.key === 'ArrowUp') input.throttle = Math.min(1.0, input.throttle + 0.15);
      if (e.key === 's' || e.key === 'ArrowDown') input.throttle = Math.max(0.0, input.throttle - 0.15);
      if (e.key === 'a' || e.key === 'ArrowLeft') input.axes.x = -1;
      if (e.key === 'd' || e.key === 'ArrowRight') input.axes.x = 1;
    };

    window.onkeyup = (e) => {
      if (e.key === 'a' || e.key === 'ArrowLeft' || e.key === 'd' || e.key === 'ArrowRight') {
        input.axes.x = 0;
      }
    };

    if (this.animId) cancelAnimationFrame(this.animId);

    let lastTime = performance.now();
    const scanHud = this.container.querySelector('#scan-hud') as HTMLElement;
    const stats = this.container.querySelector('#qa-stats') as HTMLElement;

    const loop = (t: number) => {
      const dt = Math.min((t - lastTime) / 1000, 0.06);
      lastTime = t;

      if (this.currentSurfaceScene && this.camera && this.threeRenderer) {
        const res = this.currentSurfaceScene.update(input as any, dt, this.camera);
        this.threeRenderer.render(this.currentSurfaceScene.scene, this.camera);

        if (res.activeScanTarget) {
          scanHud.style.display = 'block';
          scanHud.innerHTML = `
            <div style="font-weight: 600; color: #38bdf8; margin-bottom: 4px;">TARGET IN SCANNER RANGE</div>
            <div style="font-size: 0.95rem; font-weight: bold; color: #fff;">${res.activeScanTarget.name}</div>
            <div style="font-size: 0.75rem; color: #94a3b8; white-space: pre-line; margin-top: 4px;">${res.activeScanTarget.info}</div>
          `;
        } else {
          scanHud.style.display = 'none';
        }

        const alt = (this.currentSurfaceScene.shipPosition.y - this.currentSurfaceScene.getTerrainHeight(this.currentSurfaceScene.shipPosition.x, this.currentSurfaceScene.shipPosition.z)).toFixed(1);
        stats.textContent = `ALT: ${alt}m | SPD: ${(input.throttle * 65).toFixed(0)}m/s | REGION: ${region.terrainMorphologyOverride.toUpperCase()}`;
      }

      this.animId = requestAnimationFrame(loop);
    };

    this.animId = requestAnimationFrame(loop);
  }
}
