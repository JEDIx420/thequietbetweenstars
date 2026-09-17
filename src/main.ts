import { storage } from './persistence/StorageManager';

async function bootstrap() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  // Initialize persistence layer
  await storage.init();

  // Route between Developer World Lab, Planet Gallery, and Full 3D Space Flight Experience
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') === 'world-lab') {
    const { WorldLabApp } = await import('./ui/WorldLabApp');
    new WorldLabApp(appContainer);
  } else if (urlParams.get('debug') === 'planet-gallery') {
    const { PlanetGalleryApp } = await import('./ui/PlanetGalleryApp');
    new PlanetGalleryApp(appContainer);
  } else {
    // Full 3D Space Flight Experience across Mobile, Tablet, and Desktop
    const { DesktopApp } = await import('./ui/DesktopApp');
    new DesktopApp(appContainer);
  }
}

bootstrap().catch((err) => {
  console.error('[TQBS] Bootstrap error:', err);
});
