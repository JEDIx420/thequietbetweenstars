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

    const width = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const height = Math.max(1, container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720));

    this.renderer.setClearColor(0x030307, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.appendChild(this.renderer.domElement);

    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 8000);
    this.camera.position.set(0, 3, 10);

    this.setupListeners();
  }

  public handleResize = (): void => {
    const width = this.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const height = Math.max(1, this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleVisibilityChange = (): void => {
    this.isPaused = document.hidden;
  };

  private setupListeners(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(this.handleResize, 100);
    });
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.handleResize);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public render(scene: THREE.Scene, camera?: THREE.PerspectiveCamera): void {
    if (!this.isPaused) {
      this.renderer.render(scene, camera || this.camera);
    }
  }

  public setPixelRatio(dpr: number): void {
    this.renderer.setPixelRatio(dpr);
  }

  public getPixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
