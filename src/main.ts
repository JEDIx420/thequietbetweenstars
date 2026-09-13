import { storage } from './persistence/StorageManager';
import { isExplicitCompanionMode, isMobileOrPhoneDevice } from './companion/deviceDetection';

async function bootstrap() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  // Initialize persistence layer
  await storage.init();

  // Route between Developer Planet Gallery, Companion Controller, and Desktop 3D Experience
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') === 'planet-gallery') {
    const { PlanetGalleryApp } = await import('./ui/PlanetGalleryApp');
    new PlanetGalleryApp(appContainer);
  } else if (isExplicitCompanionMode() || isMobileOrPhoneDevice()) {
    // Dynamic code splitting: Companion controller doesn't load Three.js
    const { CompanionApp } = await import('./companion/companionApp');
    const companion = new CompanionApp(appContainer);
    companion.start();
  } else {
    // Desktop 3D Space Flight Experience
    const { DesktopApp } = await import('./ui/DesktopApp');
    new DesktopApp(appContainer);
  }
}

bootstrap().catch((err) => {
  console.error('[TQBS] Bootstrap error:', err);
});
