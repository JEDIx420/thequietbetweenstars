import * as THREE from 'three';
import type { AtmosphereProfile } from '../planets/PlanetEnvironmentProfile';

/**
 * ProceduralSky
 * Renders an atmospheric inverted sky dome with smooth zenith-to-horizon gradients,
 * dynamic solar disc projection, twilight scattering, and a celestial starfield.
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
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float offset;
      uniform float exponent;
      uniform float density;
      uniform float starFade;
      varying vec3 vWorldPosition;

      // Pseudo-random star noise
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = normalize(vWorldPosition + offset).y;
        float factor = max(pow(max(h, 0.0), exponent), 0.0);
        vec3 skyColor = mix(bottomColor, topColor, factor);

        // Sun disc & atmospheric solar corona
        float cosSun = dot(dir, normalize(sunDirection));
        float sunDisc = smoothstep(0.9975, 0.9995, cosSun);
        float sunCorona = pow(max(cosSun, 0.0), 32.0) * 0.45;
        vec3 solarGlow = (sunDisc * 2.5 + sunCorona) * sunColor;

        // Starfield contribution at night or airless
        float stars = 0.0;
        if (starFade > 0.01) {
          vec3 starCoord = floor(dir * 280.0);
          float n = hash(starCoord);
          if (n > 0.985) {
            float brightness = pow((n - 0.985) / 0.015, 3.0);
            stars = brightness * starFade;
          }
        }

        // Airless or deep night sky blending
        if (density <= 0.05) {
          float rim = pow(1.0 - max(h, 0.0), 12.0) * 0.25;
          vec3 baseSky = mix(vec3(0.005, 0.005, 0.012), bottomColor, rim);
          gl_FragColor = vec4(baseSky + solarGlow + vec3(stars), 1.0);
        } else {
          vec3 finalSky = mix(skyColor, skyColor * 0.15 + vec3(0.01, 0.015, 0.03), starFade);
          gl_FragColor = vec4(finalSky + solarGlow + vec3(stars), 1.0);
        }
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color(atmosphere.skyZenith) },
        bottomColor: { value: new THREE.Color(atmosphere.skyHorizon) },
        sunColor: { value: new THREE.Color(0xfff7ed) },
        sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        offset: { value: 120 },
        exponent: { value: 0.75 },
        density: { value: atmosphere.density },
        starFade: { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  public setSkyColors(zenith: THREE.Color, horizon: THREE.Color): void {
    (this.material.uniforms.topColor.value as THREE.Color).copy(zenith);
    (this.material.uniforms.bottomColor.value as THREE.Color).copy(horizon);
  }

  public setSunUniforms(sunDir: THREE.Vector3, sunColor: THREE.Color, starFade: number): void {
    (this.material.uniforms.sunDirection.value as THREE.Vector3).copy(sunDir);
    (this.material.uniforms.sunColor.value as THREE.Color).copy(sunColor);
    this.material.uniforms.starFade.value = starFade;
  }

  public update(cameraPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
