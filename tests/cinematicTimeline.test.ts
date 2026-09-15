import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CinematicCameraDirector, type CinematicKeyframe } from '../src/ui/CinematicCameraDirector';

describe('Cinematic Camera Director & Keyframe Timeline', () => {
  it('smoothly interpolates camera position, target, and FOV across keyframes', () => {
    const director = new CinematicCameraDirector();
    const camera = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);

    const kfs: CinematicKeyframe[] = [
      {
        timeSeconds: 0,
        cameraPosition: new THREE.Vector3(0, 10, 100),
        targetPosition: new THREE.Vector3(0, 0, 0),
        fov: 50,
        captionTitle: 'INTRO',
        captionBody: 'Beginning',
      },
      {
        timeSeconds: 2.0,
        cameraPosition: new THREE.Vector3(0, 20, 50),
        targetPosition: new THREE.Vector3(0, 5, -10),
        fov: 70,
        captionTitle: 'APPROACH',
        captionBody: 'Closer',
      },
    ];

    director.setKeyframes(kfs);
    director.play();

    expect(director.getIsPlaying()).toBe(true);

    // Update to 1.0 second (halfway)
    director.update(1.0, camera);

    // Halfway Hermite smoothstep at t=0.5 is 0.5
    expect(camera.position.y).toBeCloseTo(15.0, 1);
    expect(camera.position.z).toBeCloseTo(75.0, 1);
    expect(camera.fov).toBeCloseTo(60.0, 1);

    // Update past duration
    director.update(1.5, camera);
    expect(director.getIsPlaying()).toBe(false);
  });
});
