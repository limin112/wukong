// Sky over the caldera: heavy smoke with a dim red glow seeping through behind the giant, and the distant
// smoking volcanoes drawn as layered silhouettes in the dome itself (they are kilometres away: no parallax).
// Camera-centred, pinned to the far plane, so it works with any camera.far. Phase moods via uniforms:
// uGlow (red glow behind the seat), uErupt (the main volcano erupts, the clouds catch fire), uRain (grey rain).
import * as THREE from 'three';

// azimuth: 0 = towards -z (behind the giant), + towards +x; elevations in radians
export const VOLCANOES = [
  { az: 0.32, el: 0.30, w: 0.72, crater: 0.035, far: 0.55, main: 1 },   // the great one, right behind his shoulder
  { az: -0.62, el: 0.2, w: 0.55, crater: 0.025, far: 0.7, main: 0 },
  { az: 1.18, el: 0.22, w: 0.6, crater: 0.03, far: 0.62, main: 0 },
  { az: -1.55, el: 0.17, w: 0.5, crater: 0.02, far: 0.78, main: 0 },
  { az: 2.25, el: 0.15, w: 0.55, crater: 0.022, far: 0.8, main: 0 },
  { az: -2.55, el: 0.2, w: 0.6, crater: 0.028, far: 0.72, main: 0 },
];

function volcanoGLSL() {
  const n = VOLCANOES.length;
  const arr = (f) => VOLCANOES.map(f).map((v) => v.toFixed(4)).join(', ');
  return /* glsl */`
const int NV = ${n};
const float vAz[NV] = float[NV](${arr((v) => v.az)});
const float vEl[NV] = float[NV](${arr((v) => v.el)});
const float vW[NV] = float[NV](${arr((v) => v.w)});
const float vCr[NV] = float[NV](${arr((v) => v.crater)});
const float vFar[NV] = float[NV](${arr((v) => v.far)});
const float vMain[NV] = float[NV](${arr((v) => v.main)});
`;
}

export function createSky({ noise }) {
  const uniforms = {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uGlow: { value: 0.7 },        // red glow seeping through the smoke behind the giant
    uErupt: { value: 0 },         // phase two: the sky is lit from below
    uRain: { value: 0 },          // the closing rain: grey, cold, the red dies
    uFlash: { value: 0 },         // short eruption / lightning flashes
    uFogCol: { value: new THREE.Color(0.02, 0.01, 0.008) },
    uGlowCol: { value: new THREE.Color(0.55, 0.09, 0.03) },
    uHotCol: { value: new THREE.Color(1.0, 0.35, 0.08) },
    uBright: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'volcano-sky',
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec3 v = mat3(viewMatrix) * position;
        gl_Position = projectionMatrix * vec4(v, 1.0);
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uNoise; uniform float uTime; uniform float uGlow; uniform float uErupt; uniform float uRain;
      uniform float uFlash; uniform vec3 uFogCol; uniform vec3 uGlowCol; uniform vec3 uHotCol; uniform float uBright;
      varying vec3 vDir;
      ${volcanoGLSL()}
      float n2(vec2 p) { return texture2D(uNoise, p).r; }
      float fbmS(vec2 p) { return texture2D(uNoise, p).r * 0.55 + texture2D(uNoise, p * 2.13 + 0.31).g * 0.3 + texture2D(uNoise, p * 4.7 + 0.73).b * 0.15; }
      void main() {
        vec3 dir = normalize(vDir);
        float el = asin(clamp(dir.y, -1.0, 1.0));
        float az = atan(dir.x, -dir.z);
        float t = uTime;
        // ---- base: near-black zenith, smoky red-brown horizon, the glow behind the giant ----
        float behind = exp(-pow(az / 0.7, 2.0));
        float low = exp(-max(el, 0.0) * 5.5);
        vec3 col = mix(uFogCol * 1.15, vec3(0.006, 0.0045, 0.0042), smoothstep(-0.02, 0.75, el));
        vec3 glow = uGlowCol * uGlow * low * (0.12 + 0.88 * behind);
        glow += uHotCol * uErupt * exp(-max(el, 0.0) * 3.0) * (0.25 + 0.75 * exp(-pow((az - 0.32) / 0.6, 2.0))) * 0.6;
        // ---- smoke: heavy rolls projected on a ceiling, darker and denser overhead ----
        vec2 cp = dir.xz / max(el + 0.16, 0.06) * 0.11;
        vec2 drift = vec2(t * 0.0021, t * 0.0012);
        float c1 = fbmS(cp + drift);
        float c2 = fbmS(cp * 2.6 - drift * 1.7 + 0.47);
        float dens = smoothstep(0.3, 0.75, c1 * 0.7 + c2 * 0.4);
        float thin = 1.0 - dens;
        vec3 smoke = vec3(0.011, 0.0095, 0.009) * (0.7 + 0.6 * c2);
        // the glow shows through the thin parts and lights the undersides of the rolls
        vec3 sky = col + glow * (0.35 + 0.95 * thin);
        vec3 lit = smoke + glow * (0.25 + 0.5 * smoothstep(0.55, 0.85, c2)) * (1.0 - dens * 0.55);
        col = mix(sky, lit, dens * smoothstep(-0.05, 0.08, el));
        // ---- distant volcanoes: silhouettes, plumes, crater glow and lava streaks ----
        for (int i = 0; i < NV; i++) {
          float da = az - vAz[i];
          da = atan(sin(da), cos(da));
          float ad = abs(da);
          if (ad > vW[i] * 1.6) continue;
          float rough = (texture2D(uNoise, vec2(da * 1.7 + float(i) * 0.37, 0.13 * float(i))).r - 0.5) * 0.025;
          float prof = vEl[i] * (1.0 - pow(clamp(ad / vW[i], 0.0, 1.0), 0.8)) - 0.012 + rough;
          float crater = vEl[i] - vCr[i] * 0.45 * smoothstep(vCr[i], 0.0, ad);
          float h = min(prof, crater);
          float far = vFar[i];
          float hot = mix(1.0, 2.6, vMain[i] * uErupt);
          // plume above the crater (drawn first, behind the cone)
          float pz = el - vEl[i];
          if (pz > -0.01) {
            float bend = pz * pz * 1.8 + pz * 0.25;
            float pw = vCr[i] * 0.8 + pz * 0.55;
            float px = (da - bend) / pw;
            float pn = fbmS(vec2(px * 0.12 + float(i), pz * 1.3 - t * 0.012 * (1.0 + vMain[i])));
            float plume = exp(-px * px * 1.6) * smoothstep(0.25, 0.65, pn + 0.15) * smoothstep(0.55, 0.05, pz) * smoothstep(-0.01, 0.01, pz);
            vec3 pc = mix(vec3(0.008, 0.007, 0.0065), uGlowCol * 0.45 * hot, exp(-pz * 16.0) * 0.55 * (0.5 + 0.5 * uGlow));
            col = mix(col, pc + uFogCol * far * 0.4, plume * (0.92 - far * 0.25));
          }
          if (el < h) {
            float below = vEl[i] - el;                          // angular depth under the peak
            float depth = clamp(below / max(vEl[i], 0.01), 0.0, 1.0);
            vec3 rock = mix(vec3(0.006, 0.0052, 0.005), uFogCol * 1.25, far * 0.75);
            rock += glow * 0.05 * far * (1.0 - depth);
            // a few lava streaks: lines through the apex (constant da / below), wiggling, broken, fading downhill
            float u = da / max(below, 0.004);
            float wig = (texture2D(uNoise, vec2(below * 6.0 + float(i) * 0.31, float(i) * 0.17)).r - 0.5) * 0.35;
            float q = fract((u + wig) * 0.9 + float(i) * 0.37);
            float line = smoothstep(0.035, 0.0, abs(q - 0.5) - 0.012);
            float brk = smoothstep(0.42, 0.62, texture2D(uNoise, vec2(floor((u + wig) * 0.9 + float(i) * 0.37) * 0.13, below * 3.0)).g);
            float streak = line * brk * exp(-depth * 3.5) * smoothstep(0.004, 0.02, below) * (0.7 + 0.3 * sin(t * 0.5 + float(i) * 2.0));
            float cr = smoothstep(vCr[i] * 1.1, 0.0, ad) * smoothstep(0.012, 0.0, below - vCr[i] * 0.15) * (0.55 + 0.45 * fbmS(vec2(da * 40.0, t * 0.05 + float(i))));
            rock += uGlowCol * (streak * 0.45 + cr * 0.9) * hot * (1.0 - far * 0.5) * (1.0 - uRain * 0.9);
            col = mix(col, rock, smoothstep(0.0, 0.0025, h - el));
          }
        }
        // ---- the eruption: fire fountains in the main crater, flicker ----
        if (uErupt > 0.01) {
          float da = atan(sin(az - VOLCANOES_MAIN_AZ), cos(az - VOLCANOES_MAIN_AZ));
          float pz = el - VOLCANOES_MAIN_EL;
          float f = exp(-pow(da / (0.03 + max(pz, 0.0) * 0.4), 2.0)) * smoothstep(0.22, 0.0, pz) * smoothstep(-0.02, 0.0, pz);
          float fl = 0.7 + 0.3 * sin(t * 13.0) * sin(t * 7.3 + 1.0);
          col += uHotCol * f * uErupt * fl * 3.0;
        }
        // ---- the closing rain: grey wash, the red dies, sheets of rain in the distance ----
        if (uRain > 0.001) {
          vec3 rainSky = mix(vec3(0.035, 0.038, 0.043), vec3(0.012, 0.013, 0.015), smoothstep(-0.05, 0.6, el));
          float sheets = texture2D(uNoise, vec2(az * 2.0 + t * 0.01, el * 0.4 - t * 0.05)).b;
          rainSky *= 0.85 + 0.3 * sheets * smoothstep(0.35, 0.0, el);
          float cl = fbmS(cp * 1.4 + drift * 3.0);
          rainSky = mix(rainSky, rainSky * 0.6, smoothstep(0.4, 0.7, cl));
          col = mix(col, rainSky + col * 0.25, uRain);
        }
        col += uFlash * vec3(1.0, 0.55, 0.3) * low * 0.4;
        gl_FragColor = vec4(col * uBright, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`.replaceAll('VOLCANOES_MAIN_AZ', VOLCANOES[0].az.toFixed(4)).replaceAll('VOLCANOES_MAIN_EL', VOLCANOES[0].el.toFixed(4)),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  mesh.name = 'volcano-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;   // after the opaques: early-z skips covered pixels
  return {
    mesh, material: mat, uniforms,
    update(time, s) {
      uniforms.uTime.value = time;
      if (s) {
        uniforms.uGlow.value = s.glow;
        uniforms.uErupt.value = s.erupt;
        uniforms.uRain.value = s.rain;
        uniforms.uFlash.value = s.flash || 0;
        if (s.fogCol) uniforms.uFogCol.value.copy(s.fogCol);
      }
    },
  };
}

/** Direction (world) towards the main volcano, for fog in-scatter and the warm back light. */
export function mainVolcanoDir(target = new THREE.Vector3()) {
  const v = VOLCANOES[0];
  return target.set(Math.sin(v.az) * Math.cos(v.el * 0.6), Math.sin(v.el * 0.6), -Math.cos(v.az) * Math.cos(v.el * 0.6)).normalize();
}
