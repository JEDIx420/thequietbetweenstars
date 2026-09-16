import * as THREE from 'three';

export interface CinematicKeyframe {
  timeSeconds: number;
  cameraPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  fov?: number;
  roll?: number;
  captionTitle?: string;
  captionBody?: string;
}

export class CinematicCameraDirector {
  private keyframes: CinematicKeyframe[] = [];
  private currentTime = 0;
  private duration = 0;
  private isPlaying = false;
  private onCompleteCallback: (() => void) | null = null;
  private currentCaption: { title: string; body: string } | null = null;

  public setKeyframes(keyframes: CinematicKeyframe[]): void {
    this.keyframes = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
    this.duration = this.keyframes.length > 0 ? this.keyframes[this.keyframes.length - 1].timeSeconds : 0;
  }

  public play(onComplete?: () => void): void {
    this.currentTime = 0;
    this.isPlaying = true;
    this.onCompleteCallback = onComplete || null;
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.onCompleteCallback) {
      const cb = this.onCompleteCallback;
      this.onCompleteCallback = null;
      cb();
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getProgress(): number {
    return this.duration > 0 ? Math.min(1.0, this.currentTime / this.duration) : 1.0;
  }

  public getCurrentCaption(): { title: string; body: string } | null {
    return this.currentCaption;
  }

  private lookTarget = new THREE.Vector3();

  public update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (!this.isPlaying || this.keyframes.length === 0) return;

    this.currentTime += dt;

    if (this.currentTime >= this.duration) {
      this.stop();
      return;
    }

    // Find bounding keyframes
    let k0 = this.keyframes[0];
    let k1 = this.keyframes[0];

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.currentTime >= this.keyframes[i].timeSeconds && this.currentTime <= this.keyframes[i + 1].timeSeconds) {
        k0 = this.keyframes[i];
        k1 = this.keyframes[i + 1];
        break;
      }
    }

    const span = Math.max(0.001, k1.timeSeconds - k0.timeSeconds);
    const rawT = (this.currentTime - k0.timeSeconds) / span;
    // Smooth cubic Hermite interpolation
    const t = THREE.MathUtils.smoothstep(rawT, 0, 1);

    camera.position.lerpVectors(k0.cameraPosition, k1.cameraPosition, t);
    this.lookTarget.lerpVectors(k0.targetPosition, k1.targetPosition, t);
    camera.lookAt(this.lookTarget);

    if (k0.fov && k1.fov) {
      camera.fov = THREE.MathUtils.lerp(k0.fov, k1.fov, t);
      camera.updateProjectionMatrix();
    }

    if (k0.captionTitle && k0.captionBody) {
      this.currentCaption = { title: k0.captionTitle, body: k0.captionBody };
    }
  }
}
