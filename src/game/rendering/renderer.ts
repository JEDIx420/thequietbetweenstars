import * as THREE from 'three';

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private isPaused = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    const isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0) || window.innerWidth < 800);

    // Disable 4x MSAA on mobile/tablet and high-DPI screens to prevent massive fillrate overhead
    const shouldAntialias = !isMobile && (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) <= 1.25 : true);

    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: shouldAntialias,
      alpha: false,
      stencil: false,
      depth: true,
      preserveDrawingBuffer: true,
    });

    // Mobile/tablet devices with dense pixel pitch run optimally at 1.0 - 1.15 DPR
    const maxDpr = isMobile ? (typeof window !== 'undefined' && window.devicePixelRatio >= 2 ? 1.0 : 1.15) : 2.0;

    const width = typeof window !== 'undefined'
      ? Math.max(window.innerWidth, container.clientWidth || 0)
      : (container.clientWidth || 1280);
    const height = typeof window !== 'undefined'
      ? Math.max(1, Math.max(window.innerHeight, container.clientHeight || 0))
      : Math.max(1, container.clientHeight || 720);

    this.renderer.setClearColor(0x030307, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.renderer.domElement.style.cssText = 'position: absolute; inset: 0; width: 100% !important; height: 100% !important; display: block;';
    container.appendChild(this.renderer.domElement);

    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 8000);
    this.camera.position.set(0, 3, 10);

    this.setupListeners();
  }

  public handleResize = (): void => {
    const width = typeof window !== 'undefined'
      ? Math.max(window.innerWidth, this.container.clientWidth || 0)
      : (this.container.clientWidth || 1280);
    const height = typeof window !== 'undefined'
      ? Math.max(1, Math.max(window.innerHeight, this.container.clientHeight || 0))
      : Math.max(1, this.container.clientHeight || 720);
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

  public compileScene(scene: THREE.Scene, camera?: THREE.Camera): void {
    try {
      this.renderer.compile(scene, camera || this.camera);
    } catch {
      // Ignored if unsupported in headless test environments
    }
  }

  public captureFrame(): string {
    return this.renderer.domElement.toDataURL('image/png');
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
