import * as THREE from 'three';

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private isPaused = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false,
    });

    const isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0) || window.innerWidth < 800);
    const maxDpr = isMobile ? 1.5 : 2;

    this.renderer.setClearColor(0x030307, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 8000);
    this.camera.position.set(0, 3, 10);

    this.setupListeners();
  }

  private setupListeners(): void {
    const handleResize = () => {
      const width = this.container.clientWidth;
      const height = Math.max(1, this.container.clientHeight);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    document.addEventListener('visibilitychange', () => {
      this.isPaused = document.hidden;
    });
  }

  public render(scene: THREE.Scene): void {
    if (!this.isPaused) {
      this.renderer.render(scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
