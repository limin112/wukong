// Image-based lighting for the PBR characters (bronze, tarnished gold, iron): a crude proxy of the caldera —
// smoke-dark sky with the red glow behind the giant, a cool patch of open sky high up, a black floor crossed by
// the two glowing rivers — prefiltered with PMREM. One map per mood; the arena swaps them by phase.
import * as THREE from 'three';

function envScene(m) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uHor: { value: new THREE.Color(...m.horizon) }, uZen: { value: new THREE.Color(...m.zenith) },
      uGlow: { value: new THREE.Color(...m.glow) }, uCool: { value: new THREE.Color(...m.cool) },
      uGround: { value: new THREE.Color(...m.ground) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uHor, uZen, uGlow, uCool, uGround; varying vec3 vP;
      void main() {
        float el = vP.y;
        float az = atan(vP.x, -vP.z);
        vec3 c = mix(uHor, uZen, smoothstep(0.0, 0.7, el));
        c += uGlow * exp(-max(el, 0.0) * 4.0) * (0.3 + 0.7 * exp(-az * az * 1.2)) * step(-0.02, el);
        c += uCool * smoothstep(0.55, 0.95, dot(vP, normalize(vec3(-0.45, 0.8, -0.4))));
        c = mix(c, uGround, smoothstep(0.0, -0.08, el));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  s.add(dome);
  // the rivers: two long glowing strips below the horizon, converging behind the giant
  const lava = new THREE.MeshBasicMaterial({ color: new THREE.Color(...m.lava), side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(4, 90), lava);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = sx * 0.28;
    strip.position.set(sx * 24, -3.5, 0);
    s.add(strip);
  }
  const moat = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), lava);
  moat.rotation.x = -Math.PI / 2;
  moat.position.set(0, -3.5, -45);
  s.add(moat);
  return s;
}

const MOODS = {
  ember: { horizon: [0.05, 0.016, 0.01], zenith: [0.006, 0.005, 0.005], glow: [0.3, 0.05, 0.015], cool: [0.05, 0.06, 0.08], ground: [0.01, 0.008, 0.007], lava: [1.6, 0.25, 0.04] },
  erupt: { horizon: [0.16, 0.04, 0.012], zenith: [0.02, 0.01, 0.008], glow: [1.4, 0.3, 0.06], cool: [0.03, 0.035, 0.045], ground: [0.02, 0.01, 0.006], lava: [3.0, 0.6, 0.1] },
  rain: { horizon: [0.05, 0.052, 0.058], zenith: [0.02, 0.022, 0.026], glow: [0.04, 0.012, 0.006], cool: [0.08, 0.09, 0.11], ground: [0.012, 0.012, 0.013], lava: [0.25, 0.04, 0.01] },
};

export function buildVolcanoEnvMaps(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const maps = {};
  for (const [k, m] of Object.entries(MOODS)) {
    const s = envScene(m);
    maps[k] = pmrem.fromScene(s, 0.02, 0.1, 200, { size: 256, position: new THREE.Vector3(0, 2, 0) }).texture;
    s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  pmrem.dispose();
  return maps;
}
