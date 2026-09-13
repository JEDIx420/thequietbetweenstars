import * as THREE from 'three';
import { PlanetEnvironmentGenerator, type PlanetEnvironmentProfile } from '../game/planets/PlanetEnvironmentProfile';
import { PlanetVisualGenerator } from '../game/planets/PlanetVisualGenerator';
import type { PlanetDescriptor } from '../game/systems/PlanetDescriptor';

export class PlanetGalleryApp {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div style="width: 100vw; height: 100vh; background: #06080e; color: #c5cde0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; display: flex; flex-direction: column; overflow: hidden;">
        <header style="padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(10,14,24,0.85); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1 style="margin: 0; font-size: 1.25rem; letter-spacing: 0.15em; text-transform: uppercase; color: #f0f4ff;">Planet Identity & Diversity Gallery</h1>
            <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #73809c;">Deterministic inspection of procedural planet profiles, orbital visuals, and surface environments across seeds.</p>
          </div>
          <div>
            <a href="${window.location.pathname}" style="color: #64b5f6; font-size: 0.85rem; text-decoration: none; border: 1px solid rgba(100,181,246,0.3); padding: 6px 12px; border-radius: 4px;">&larr; Return to Game</a>
          </div>
        </header>
        <div id="gallery-grid" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; padding: 24px;">
        </div>
      </div>
    `;

    const grid = this.container.querySelector('#gallery-grid') as HTMLElement;
    if (!grid) return;

    // 16 representative deterministic seeds spanning diverse families and star classes
    const seeds = [
      'seed-barren-crater-01',
      'seed-cryo-ice-world-99',
      'seed-desert-dunes-42',
      'seed-volcanic-rift-88',
      'seed-ocean-archipelago-07',
      'seed-terrestrial-lush-11',
      'seed-toxic-chemical-73',
      'seed-crystal-lattice-31',
      'seed-biosignature-prime-55',
      'seed-metallic-iron-64',
      'seed-gas-giant-jovian-10',
      'seed-exotic-outlier-777',
      'seed-deep-permafrost-404',
      'seed-magma-forge-909',
      'seed-emerald-shallows-505',
      'seed-ringed-solitude-123',
    ];

    const starClasses = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

    seeds.forEach((seed, idx) => {
      const starClass = starClasses[idx % starClasses.length];
      const starTemp = starClass === 'O' ? 30000 : starClass === 'B' ? 18000 : starClass === 'A' ? 9500 : starClass === 'F' ? 7000 : starClass === 'G' ? 5700 : starClass === 'K' ? 4200 : 3000;
      const profile = PlanetEnvironmentGenerator.generateProfile(seed, starClass);

      const card = document.createElement('div');
      card.style.cssText = `
        background: #0d121f;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      `;

      card.innerHTML = `
        <div style="height: 220px; position: relative; background: #04060a;" id="canvas-container-${idx}"></div>
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <div style="font-weight: 600; font-size: 1rem; color: #e1e7f5;">Planet ${seed.slice(5, 18)}</div>
            <div style="font-size: 0.75rem; text-transform: uppercase; padding: 2px 6px; border-radius: 3px; background: rgba(255,255,255,0.06); color: #9ab;">
              ${profile.family}
            </div>
          </div>
          <div style="font-size: 0.75rem; color: #6b7794;">Seed: <code>${seed}</code> | Star: <b>${starClass}</b> (${starTemp}K)</div>
          <div style="font-size: 0.75rem; color: #a4b3d6; line-height: 1.4; margin: 4px 0;">${profile.description}</div>
          
          <div style="margin-top: 6px;">
            <div style="font-size: 0.7rem; color: #57627d; text-transform: uppercase; margin-bottom: 4px;">Palette</div>
            <div style="display: flex; height: 16px; border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
              <div style="flex: 1; background: ${profile.palette.surfaceLowland};" title="Lowland: ${profile.palette.surfaceLowland}"></div>
              <div style="flex: 1; background: ${profile.palette.surfaceMidland};" title="Midland: ${profile.palette.surfaceMidland}"></div>
              <div style="flex: 1; background: ${profile.palette.surfaceHighland};" title="Highland: ${profile.palette.surfaceHighland}"></div>
              <div style="flex: 1; background: ${profile.palette.surfacePeak};" title="Peak: ${profile.palette.surfacePeak}"></div>
              <div style="flex: 1; background: ${profile.palette.accentMineral};" title="Mineral: ${profile.palette.accentMineral}"></div>
              <div style="flex: 1; background: ${profile.palette.atmosphereGlow};" title="Glow: ${profile.palette.atmosphereGlow}"></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.72rem; color: #8896b3;">
            <div>Morphology: <b style="color: #cbd5e1;">${profile.terrain.morphology}</b></div>
            <div>Atmo Density: <b style="color: #cbd5e1;">${profile.atmosphere.density.toFixed(2)}</b></div>
            <div>Hydrosphere: <b style="color: #cbd5e1;">${(profile.oceanCoverage * 100).toFixed(0)}%</b></div>
            <div>Landmark: <b style="color: #cbd5e1;">${profile.landmark}</b></div>
          </div>
        </div>
      `;

      grid.appendChild(card);

      const containerElem = card.querySelector(`#canvas-container-${idx}`) as HTMLElement;
      if (containerElem) {
        this.mountPlanetPreview(containerElem, profile, seed);
      }
    });
  }

  private mountPlanetPreview(elem: HTMLElement, profile: PlanetEnvironmentProfile, seed: string) {
    const width = elem.clientWidth || 360;
    const height = 220;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    elem.appendChild(renderer.domElement);

    const dummyPlanet: PlanetDescriptor = {
      id: seed,
      name: `Planet ${seed.slice(5, 18)}`,
      seed: profile.seed,
      type: profile.family,
      radius: 1.2,
      gravity: profile.gravity,
      hasAtmosphere: profile.atmosphere.hasAtmosphere,
      atmosphereDensity: profile.atmosphere.density,
      temperatureKelvin: profile.temperatureKelvin,
      surfacePressureAtm: profile.surfacePressureAtm,
      oceanCoverage: profile.oceanCoverage,
      cloudCoverage: profile.cloudCoverage,
      biosignature: profile.biosignature,
      hasRings: profile.hasRings,
      moonsCount: 0,
      palette: {
        primary: profile.palette.surfaceMidland,
        secondary: profile.palette.surfaceHighland,
        ocean: profile.terrain.hasLiquid ? profile.palette.surfaceLowland : undefined,
        atmosphereGlow: profile.palette.atmosphereGlow,
        cloudColor: profile.palette.cloudColor,
        ringColor: profile.palette.ringColor,
      },
      shortDescription: profile.description,
      isLandable: profile.isLandable,
      profile,
    };

    const visual = PlanetVisualGenerator.createPlanetMesh(dummyPlanet);
    scene.add(visual.group);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(3, 2, 3);
    scene.add(dirLight);

    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      visual.planetMesh.rotation.y += 0.005;
      if (visual.cloudMesh) visual.cloudMesh.rotation.y += 0.006;
      renderer.render(scene, camera);
    };
    animate();

    const observer = new MutationObserver(() => {
      if (!document.body.contains(elem)) {
        cancelAnimationFrame(reqId);
        renderer.dispose();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
