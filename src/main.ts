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
    const app = new DesktopApp(appContainer);
    (window as any).__desktopApp = app;

    if (urlParams.get('cam') === 'cockpit') {
      setTimeout(async () => {
        await app.enterFlightMode();
        app.flightModel.setCameraViewMode('COCKPIT');
        app.spaceScene.surveyCraft.setExteriorVisible(false);
        app.cockpitInterior.setVisible(true);
      }, 300);
    }
  }
}

bootstrap().catch((err) => {
  console.error('[TQBS] Bootstrap error:', err);
  if (typeof (window as any).__dismissPreloader === 'function') {
    (window as any).__dismissPreloader();
  }
});
