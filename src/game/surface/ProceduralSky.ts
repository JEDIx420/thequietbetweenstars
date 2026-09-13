import * as THREE from 'three';
import type { AtmosphereProfile } from '../planets/PlanetEnvironmentProfile';

/**
 * ProceduralSky
 * Renders an atmospheric inverted sky dome with smooth zenith-to-horizon gradients,
 * twilight scattering, and an airless star-perforated mode for moons.
 */
export class ProceduralSky {
  public mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(atmosphere: AtmosphereProfile) {
    const geometry = new THREE.SphereGeometry(2800, 32, 24);

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      uniform float density;
      varying vec3 vWorldPosition;

      void main() {
        float h = normalize(vWorldPosition + offset).y;
        float factor = max(pow(max(h, 0.0), exponent), 0.0);
        vec3 skyColor = mix(bottomColor, topColor, factor);

        // If airless (density == 0), sky is nearly pitch black with subtle horizon rim
        if (density <= 0.05) {
          float rim = pow(1.0 - max(h, 0.0), 12.0) * 0.25;
          gl_FragColor = vec4(mix(vec3(0.01, 0.01, 0.02), bottomColor, rim), 1.0);
        } else {
          gl_FragColor = vec4(skyColor, 1.0);
        }
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color(atmosphere.skyZenith) },
        bottomColor: { value: new THREE.Color(atmosphere.skyHorizon) },
        offset: { value: 120 },
        exponent: { value: 0.75 },
        density: { value: atmosphere.density },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  public update(cameraPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
