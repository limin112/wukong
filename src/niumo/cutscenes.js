// 火焰山 · 牛魔 cutscenes and the cinematic helpers shared with the opening MV (src/niumo/mv.js).
//
//   (the walk-in and the awakening are part of the opening cinematic: src/niumo/mv.js)
//   CollapseScene  (~10.5) 山崩 at half health: he roars at the sky, the mountain behind him splits and the lava comes
//                          up, he plants his hands and tears himself out of the rock; the camera climbs from his hooves
//                          to the burning sky, his head lost in smoke. The arena turns into a lava lake (setPhase 2).
//                          Spoken: 牛魔王「坐了一千年……也该站起来，看看这天了。」 孙悟空「站起来好。倒下去，才响。」
//   EndingScene    (~26 s) he topples into the lava lake and sinks like a mountain; the volcano dies (setPhase 3); it
//                          rains for the first time in a thousand years; the monkey sits on the one horn still above
//                          the lake, rain on the golden mask; 孙悟空「大哥……下雨了。」; card 火焰山 · 熄.
//
//   VoiceLines             the spoken lines (assets/audio/voice/*.m4a from tools/gen_voice.sh), played through Web Audio
//                          on the AudioSystem's context (the bull slowed down, darkened and put in a cavern; the monkey
//                          dry and bright), the music ducked under them, the subtitle in sync. One line at a time.
//
// The bull is driven only through its contract (pos / yaw / phase / update / lockTargets / hurtZones) plus optional
// cinematic hooks it may implement: setEyes(k), roar(). Anything else (eye glow, the fall, the sinking) is done here
// on the character the main module loaded (char.bones / char.root), so the scenes work with any BullKing.
import * as THREE from 'three';
import { ease, PoseTrack } from '../pose.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
function noise1(t, seed) { return Math.sin(t * 1.9 + seed) * 0.5 + Math.sin(t * 4.3 + seed * 1.7) * 0.3 + Math.sin(t * 9.1 + seed * 2.3) * 0.2; }

// ------------------------------------------------------------------ anchors on the bull

/**
 * World anchors on the bull, read from the character the main module loaded (Mixamo-style bone names).
 * F / R / U: the bull's facing, right and up (from its root); at(r, u, f): a point in that frame from its feet.
 */
export function bullFrame(bull, char) {
  const root = char.root, q = new THREE.Quaternion();
  const F = V(0, 0, 1), R = V(-1, 0, 0), U = V(0, 1, 0);
  const H = char.height || 40;
  const bones = char.bones || {};
  const frame = () => {
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(q);
    F.set(0, 0, 1).applyQuaternion(q); F.y = 0; F.normalize();
    R.crossVectors(F, U).normalize();
    return f;
  };
  const bone = (name, out = new THREE.Vector3()) => {
    const b = bones[name];
    return b ? b.getWorldPosition(out) : null;
  };
  const pick = (...names) => { for (const n of names) { const p = bone(n); if (p) return p; } return null; };
  const at = (r, u, fw, out = new THREE.Vector3()) => out.copy(root.position).addScaledVector(R, r).addScaledVector(U, u).addScaledVector(F, fw);
  const zone = part => {
    const z = (bull.hurtZones ? bull.hurtZones() : []).find(x => x.part === part);
    return z ? z.a.clone().lerp(z.b, 0.5) : null;
  };
  const f = {
    F, R, U, H, root, frame, bone, at,
    head: () => pick('Head', 'Neck') || at(0, H * 0.53, H * 0.04),
    chest: () => pick('Spine2', 'Spine1') || at(0, H * 0.4, 0),
    hips: () => pick('Hips') || at(0, H * 0.1, 0),
    shoulder: side => pick(side + 'Shoulder', side + 'Arm') || at(side === 'Left' ? -H * 0.15 : H * 0.15, H * 0.44, 0),
    hand: side => zone(side === 'Left' ? 'handL' : 'handR') || pick(side + 'Hand') || at(side === 'Left' ? -H * 0.15 : H * 0.15, H * 0.15, H * 0.2),
    knee: side => zone(side === 'Left' ? 'kneeL' : 'kneeR') || pick(side + 'Leg') || at(side === 'Left' ? -H * 0.2 : H * 0.2, H * 0.12, H * 0.2),
    foot: side => pick(side + 'ToeBase', side + 'Foot') || at(side === 'Left' ? -H * 0.1 : H * 0.1, 0.5, H * 0.08),
    /** The knee nearest to a point. */
    nearKnee: p => { const a = f.knee('Left'), b = f.knee('Right'); return a.distanceToSquared(p) < b.distanceToSquared(p) ? a : b; },
  };
  return frame();
}

/** Nearest walkable spot to (x, z) that is not lava (arena.lavaAt < 0.25) and inside the bounds. */
export function safeSpot(arena, x, z) {
  if (typeof arena.safeSpot === 'function') return arena.safeSpot(x, z);
  const b = arena.bounds, lava = arena.lavaAt || (() => 0);
  const ok = (px, pz) => px > b.minX + 1 && px < b.maxX - 1 && pz > b.minZ + 1 && pz < b.maxZ - 1 && lava(px, pz) < 0.25;
  if (ok(x, z)) return { x, z };
  for (let r = 2; r <= 40; r += 2) {
    const n = Math.max(8, Math.round(r * 2));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

// ------------------------------------------------------------------ camera shots

/**
 * A list of shots { t0, t1, dur?, from: { pos, look, fov }, to: {...}, e, ap, blur, shake, roll } where pos / look may be
 * Vector3s or functions (re-evaluated every frame, so a shot can follow a moving bone). apply() places the camera.
 */
export class ShotTrack {
  constructor(shots) { this.shots = shots; this.kick = 0; this.time = 0; }
  at(t) { return this.shots.find(s => t >= s.t0 && t < s.t1) || this.shots[this.shots.length - 1]; }
  /** Add a jolt to the handheld shake (decays over ~0.6 s). */
  jolt(k) { this.kick = Math.min(1.5, this.kick + k); }
  apply(camera, t, dt = 0) {
    const shot = this.at(t);
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 1.8);
    // shot.dur: the planned length of an open-ended shot (one that runs until something else ends it)
    const f = (ease[shot.e] || ease.linear)(clamp01((t - shot.t0) / (shot.dur ?? (shot.t1 - shot.t0))));
    const val = v => (typeof v === 'function' ? v(f) : v);
    const pos = val(shot.from.pos).clone().lerp(val(shot.to.pos), f);
    const look = val(shot.from.look).clone().lerp(val(shot.to.look), f);
    const s = (shot.shake || 0) + this.kick * this.kick;
    const dist = pos.distanceTo(look);
    if (s > 0) {
      const tt = this.time;
      pos.x += noise1(tt * 2, 1) * 0.05 * s * Math.max(1, dist * 0.05); pos.y += noise1(tt * 2, 2) * 0.04 * s * Math.max(1, dist * 0.05);
      look.x += noise1(tt * 2.6, 3) * 0.06 * s * Math.max(1, dist * 0.04); look.y += noise1(tt * 2.6, 4) * 0.05 * s * Math.max(1, dist * 0.04);
    }
    camera.position.copy(pos);
    camera.lookAt(look);
    if (shot.roll || s > 0.3) camera.rotateZ((shot.roll || 0) + noise1(this.time * 3, 5) * 0.01 * s);
    const fov = shot.from.fov + (shot.to.fov - shot.from.fov) * f;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return { shot, f, pos, look, dist, index: this.shots.indexOf(shot) };
  }
}

// ------------------------------------------------------------------ eyes

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Two dark-red points deep in the eye sockets (used when the BullKing has no setEyes of its own). Positioned in the
 * head's frame each update(); `offset` = [side, up, forward] in fractions of the bull's standing height.
 */
export class EyeGlow {
  constructor(scene, char, { offset = [0.016, 0.006, 0.03] } = {}) {
    this.scene = scene; this.char = char; this.offset = offset; this.k = 0; this.shown = 0;
    this.tex = glowTexture();
    const mk = (size, color, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
      s.scale.setScalar(size); s.renderOrder = 7; s.visible = false; scene.add(s); return s;
    };
    const H = char.height || 40;
    // small and deep red: embers at the back of the sockets, not lamps
    this.parts = [-1, 1].map(() => ({ core: mk(H * 0.0042, new THREE.Color(2.3, 0.3, 0.06), 1), halo: mk(H * 0.019, new THREE.Color(0.55, 0.05, 0.012), 0.4) }));
    this.q = new THREE.Quaternion(); this.F = V(0, 0, 1); this.R = V(); this.U = V(0, 1, 0); this.p = V();
  }
  set(k) { this.k = clamp01(k); }
  update(dt = 0.016, time = 0) {
    this.shown += (this.k - this.shown) * (1 - Math.exp(-6 * dt));
    const on = this.shown > 0.01;
    for (const e of this.parts) { e.core.visible = e.halo.visible = on; }
    if (!on) return;
    const head = this.char.bones && this.char.bones.Head;
    if (!head) return;
    const H = this.char.height || 40, [sx, uy, fz] = this.offset;
    // the head's facing: the root's forward tipped by the head's own pitch
    head.getWorldQuaternion(this.q);
    this.U.set(0, 1, 0).applyQuaternion(this.q);
    this.char.root.getWorldQuaternion(this.q);
    this.F.set(0, 0, 1).applyQuaternion(this.q);
    this.R.crossVectors(this.F, this.U).normalize();
    this.F.crossVectors(this.U, this.R).normalize();
    head.getWorldPosition(this.p);
    const flick = 0.92 + 0.08 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
    this.parts.forEach((e, i) => {
      const side = i ? 1 : -1;
      const at = this.p.clone().addScaledVector(this.R, side * sx * H).addScaledVector(this.U, uy * H).addScaledVector(this.F, fz * H);
      e.core.position.copy(at); e.halo.position.copy(at).addScaledVector(this.F, H * 0.004);
      e.core.material.opacity = this.shown * flick;
      e.halo.material.opacity = 0.4 * this.shown * this.shown * flick;
    });
  }
  dispose() {
    for (const e of this.parts) for (const s of [e.core, e.halo]) { this.scene.remove(s); s.material.dispose(); }
    this.tex.dispose();
  }
}

// ------------------------------------------------------------------ ash in the lens

/** Falling ash (and a few embers) in a box that follows a point: for the close shots, where the arena's own ash is too sparse. */
export class AshFall {
  constructor(scene, { count = 700, box = [14, 9, 14], ember = 0.04, size = 1.0 } = {}) {
    this.scene = scene; this.box = box; this.n = count; this.center = V();
    this.wind = V(0.35, 0, 0.1);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 4), sz = new Float32Array(count);
    this.seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      this.seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      const hot = Math.random() < ember;
      // grey-brown flakes that only catch the dim red light; a few embers still alive
      if (hot) col.set([2.0, 0.48, 0.1, 0.9], i * 4);
      else { const g = 0.1 + Math.random() * 0.1; col.set([g * 1.08, g, g * 0.92, 0.7], i * 4); }
      sz[i] = (hot ? 0.016 : 0.02 + Math.random() * 0.028) * size;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: innerHeight * 0.9 }, uFade: { value: 1 } },
      // capped size and a fade right at the lens: a flake drifting through the camera never becomes a grey moon
      vertexShader: `attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
          vC.a *= smoothstep(0.5, 1.6, d);
          gl_PointSize = min(aSize * uScale / max(0.2, d), 9.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; uniform float uFade;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c)) * vC.a * uFade; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this.t = 0;
    this.update(0);
  }
  update(dt) {
    this.t += dt;
    const p = this.points.geometry.attributes.position.array, [bx, by, bz] = this.box, s = this.seed, t = this.t;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4, fall = 0.35 + s[o + 3] * 0.5;
      const y = ((s[o + 1] * by - t * fall) % by + by) % by;
      const x = ((s[o] * bx + t * this.wind.x + Math.sin(t * 0.9 + i) * 0.25) % bx + bx) % bx;
      const z = ((s[o + 2] * bz + t * this.wind.z + Math.cos(t * 0.7 + i) * 0.25) % bz + bz) % bz;
      p[i * 3] = this.center.x + x - bx / 2; p[i * 3 + 1] = this.center.y + y - by / 2; p[i * 3 + 2] = this.center.z + z - bz / 2;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  set visible(v) { this.points.visible = v; }
  dispose() { this.scene.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ the horns (for the last shot)

/**
 * Find the two horn tips on the bull's mesh: among the vertices skinned (mostly) to the head, the ones furthest up and
 * out on either side, kept in the head bone's frame so they follow it. world(i) returns tip i in world space.
 */
export function hornTips(char) {
  const mesh = char.mesh, bones = char.bones || {};
  const head = bones.Head;
  if (!mesh || !head || !mesh.skeleton) return null;
  const sk = mesh.skeleton, hi = sk.bones.indexOf(head);
  if (hi < 0) return null;
  const headish = new Set();
  sk.bones.forEach((b, i) => { if (b === head || /HeadTop|Head_?End|Horn|Ear/i.test(b.name)) headish.add(i); });
  const geo = mesh.geometry, P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const toLocal = new THREE.Matrix4().multiplyMatrices(sk.boneInverses[hi], mesh.bindMatrix);
  const v = V(), best = [{ s: -Infinity, p: V() }, { s: -Infinity, p: V() }];
  const step = P.count > 200000 ? 3 : 1;
  for (let i = 0; i < P.count; i += step) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (headish.has(SI.getComponent(i, k))) w += SW.getComponent(i, k);
    if (w < 0.55) continue;
    v.fromBufferAttribute(P, i).applyMatrix4(toLocal);
    const side = v.x >= 0 ? 1 : 0;
    const score = v.y + Math.abs(v.x) * 0.9;
    if (score > best[side].s) { best[side].s = score; best[side].p.copy(v); }
  }
  if (!isFinite(best[0].s) || !isFinite(best[1].s)) return null;
  return {
    local: best.map(b => b.p.clone()),
    world(i, out = new THREE.Vector3()) { head.updateMatrixWorld(true); return out.copy(this.local[i]).applyMatrix4(head.matrixWorld); },
  };
}

/**
 * Horn tips on separate meshes that ride on the head (bull.js gives its stand-in model a bronze-banded pair in
 * bull.headParts): per mesh, the vertex furthest from the group's origin, kept in the group's frame.
 */
export function hornTipsFromGroup(group) {
  if (!group) return null;
  const tips = [], v = V();
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  group.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const P = o.geometry.attributes.position, toGroup = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let best = null, bd = -1;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(toGroup);
      const d = v.lengthSq();
      if (d > bd) { bd = d; best = v.clone(); }
    }
    if (best) tips.push({ local: best, len: Math.sqrt(bd) });
  });
  // the horns are the two longest reaches (a ring or a band is shorter)
  tips.sort((a, b) => b.len - a.len);
  const two = tips.slice(0, 2);
  if (two.length < 2) return null;
  return {
    local: two.map(t => t.local),
    world(i, out = new THREE.Vector3()) { group.updateMatrixWorld(true); return out.copy(this.local[i]).applyMatrix4(group.matrixWorld); },
  };
}

// ------------------------------------------------------------------ spoken lines

/**
 * How each speaker is played. rate < 1 lowers the pitch and slows the line (the bull: an enormous, slow voice from
 * inside a mountain); lp / shelf darken it; drive adds a little grit; wet / ir is a generated cave reverb.
 */
export const VOICE_STYLE = {
  bull: { name: '牛魔王', rate: 0.8, lp: 2400, shelf: 7, drive: 0.35, wet: 0.5, ir: 3.4, gain: 1.9, duck: 0.62 },
  monkey: { name: '孙悟空', rate: 1.04, lp: 9500, shelf: 0, drive: 0, wet: 0.16, ir: 1.4, gain: 1.35, duck: 0.5 },
};

/** Seconds of a buffer up to the end of the speech (the TTS leaves a tail of silence). */
function speechEnd(buf) {
  const d = buf.getChannelData(0);
  for (let i = d.length - 1; i > 0; i -= 32) if (Math.abs(d[i]) > 0.012) return Math.min(buf.duration, i / buf.sampleRate + 0.08);
  return buf.duration;
}

/** A stereo cave impulse response: decaying noise, darker as it rings. */
function caveIR(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n, k = 0.5 - 0.42 * x;                         // the one-pole closes as it decays
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - x, 2.4) * (i < 0.012 * ctx.sampleRate ? i / (0.012 * ctx.sampleRate) : 1);
    }
  }
  return ir;
}

/**
 * The spoken lines. load() fetches the manifest (assets/audio/voice/voice.json) and, once the AudioSystem has a
 * context (after unlock), decodes every line. play(id) starts a line (stopping any other: lines never overlap), shows
 * its subtitle and ducks the music while it lasts; busy is true until it has finished. Without audio (or a file that
 * failed to decode) the subtitle still runs for the line's length, so the cinematic timing stays the same.
 */
export class VoiceLines {
  constructor(audio, ui, { base = 'assets/audio/voice/' } = {}) {
    Object.assign(this, { audio, ui, base });
    this.lines = {}; this.buffers = {}; this.cur = null; this.log = []; this.chains = {}; this.duckT = 0;
    this.manifest = null; this.decoding = null;
  }
  loadManifest() {
    return this.manifest || (this.manifest = fetch(this.base + 'voice.json').then(r => (r.ok ? r.json() : { lines: {} }))
      .then(j => { this.lines = j.lines || {}; }).catch(() => { this.lines = {}; }));
  }
  /** Manifest + decode (call after audio.unlock()). */
  load() {
    if (this.decoding) return this.decoding;
    const ctx = this.audio.context;
    if (!ctx) return this.loadManifest();
    this.decoding = this.loadManifest().then(() => Promise.all(Object.entries(this.lines).map(async ([id, l]) => {
      try {
        const ab = await (await fetch(this.base + l.file)).arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        this.buffers[id] = { buf, end: speechEnd(buf) };
      } catch (e) { console.info(`[niumo] voice ${id}: not decoded (${e && e.message}), subtitle only`); }
    })));
    return this.decoding;
  }
  get decoded() { return Object.keys(this.buffers).length; }
  style(id) { return VOICE_STYLE[this.lines[id]?.speaker] || VOICE_STYLE.monkey; }
  /** How long a line runs in the game (after its playback rate). */
  duration(id) {
    const l = this.lines[id], b = this.buffers[id], st = this.style(id);
    if (b) return b.end / st.rate;
    return l ? (l.duration * 0.88) / st.rate : 0;
  }
  text(id) { return this.lines[id]?.text || ''; }
  /** The effect chain of a speaker (built once), into the engine's master (limiter, master volume). */
  chain(speaker) {
    if (this.chains[speaker]) return this.chains[speaker];
    const ctx = this.audio.context, st = VOICE_STYLE[speaker] || VOICE_STYLE.monkey;
    const eng = this.audio._eng;
    const dest = (eng && eng.masterIn) || ctx.destination;
    const input = ctx.createGain();
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 180; shelf.gain.value = st.shelf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = speaker === 'bull' ? 45 : 110;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = st.lp; lp.Q.value = 0.5;
    let last = lp;
    input.connect(hp); hp.connect(shelf); shelf.connect(lp);
    if (st.drive > 0) {
      const ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n), k = 1 + st.drive * 6;
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
      ws.curve = curve; lp.connect(ws); last = ws;
    }
    const out = ctx.createGain(); out.gain.value = st.gain;
    const dry = ctx.createGain(); dry.gain.value = 1;
    const conv = ctx.createConvolver(); conv.buffer = caveIR(ctx, st.ir);
    const wet = ctx.createGain(); wet.gain.value = st.wet;
    last.connect(dry); dry.connect(out);
    last.connect(conv); conv.connect(wet); wet.connect(out);
    out.connect(dest);
    return (this.chains[speaker] = { input, out });
  }
  /** Start a line now (any line still playing is cut). Returns its handle. */
  play(id) {
    this.stop();
    const l = this.lines[id];
    if (!l) return null;
    const st = this.style(id), b = this.buffers[id], ctx = this.audio.context;
    const h = { id, speaker: l.speaker, text: l.text, dur: this.duration(id), t: 0, audible: false, done: false };
    if (b && ctx && ctx.state !== 'closed') {
      try {
        const src = ctx.createBufferSource();
        src.buffer = b.buf; src.playbackRate.value = st.rate;
        src.connect(this.chain(l.speaker).input);
        src.start();
        src.onended = () => src.disconnect();
        h.src = src; h.t0 = ctx.currentTime; h.audible = ctx.state === 'running';
      } catch (e) { console.info('[niumo] voice play failed', e); }
    }
    this.ui.speak?.(st.name, l.text, l.speaker);
    this.cur = h; this.duckT = 0;
    this.log.push({ id, speaker: l.speaker, dur: +h.dur.toFixed(2), audible: h.audible, at: +(performance.now() / 1000).toFixed(2) });
    this.update(0);
    return h;
  }
  get busy() { return !!this.cur; }
  /** Cut the current line (a skip). */
  stop() {
    const h = this.cur;
    if (!h) return;
    try { h.src?.stop(); } catch { /* already stopped */ }
    this.finish(h);
  }
  finish(h) {
    h.done = true;
    if (this.cur === h) { this.cur = null; this.ui.speak?.('', ''); }
  }
  update(dt) {
    const h = this.cur;
    if (!h) return;
    const ctx = this.audio.context;
    h.t = h.src && ctx ? ctx.currentTime - h.t0 : h.t + dt;
    if (h.t >= h.dur) { this.finish(h); return; }
    // hold the music down under the voice (short ducks, renewed)
    if ((this.duckT -= dt) <= 0) { this.duckT = 0.25; this.audio.duck?.(this.style(h.id).duck, 0.9); }
  }
}

// ------------------------------------------------------------------ the monkey's cinematic poses

const k = (t, o) => ({ t, ...o });
// staff on the right shoulder (扛着铁棒): hand in front of the shoulder, the long end over it and behind
const CARRY = {
  armR: { at: [0.1, -0.2, 0.46], pole: [0.75, -0.65, 0.0] }, blade: [0.12, 0.5, -0.86], grip: 1,
  armL: { at: [-0.12, -0.9, 0.12], pole: [-0.5, -0.4, -0.6] },
};
// sitting on the horn: thighs forward, shins hanging, the staff across the lap, face lifted a little to the rain
const SIT = {
  hips: [0, -0.52, -0.1], spine: [12, 0, 0], head: [-14, 0, 0],
  legL: { at: [-0.16, -0.6, 0.52], pole: [0, 0.3, 1] }, legR: { at: [0.14, -0.8, 0.34], pole: [0, 0.3, 1] },
  armR: { at: [0.1, -0.6, 0.52], pole: [0.6, -0.6, -0.2] }, armL: { at: [-0.08, -0.64, 0.48], pole: [-0.6, -0.6, -0.2] },
  blade: [-0.97, -0.14, 0.18], grip: 1, gripL: 0.6,
};
// looking up at the giant, staff planted beside him
const LOOKUP = {
  armR: { at: [0.34, -0.52, 0.26], pole: [0.8, -0.4, -0.3] }, blade: [0.08, 1, 0.06], grip: 1,
  head: [-24, 0, 0], spine: [-5, 0, 0],
};
// 「来拿。」: the staff levelled up at the giant's face, the free hand back, chin up
const POINT = {
  armR: { at: [0.18, 0.12, 0.84], pole: [0.7, -0.6, 0.0] }, blade: [0.04, 0.42, 0.9], grip: 1,
  armL: { at: [-0.2, -0.82, -0.12], pole: [-0.6, -0.3, -0.6] },
  head: [-16, 0, 0], spine: [-4, 0, 0],
};
export const CINE_MOVES = {
  cineCarry: { blendIn: 0.25, blendOut: 0.2, keys: [k(0, CARRY), k(100, CARRY)] },
  cineSit: { blendIn: 0.01, blendOut: 0.01, keys: [k(0, SIT), k(100, SIT)] },
  cineLookUp: { blendIn: 0.6, blendOut: 0.3, keys: [k(0, LOOKUP), k(100, LOOKUP)] },
  cinePoint: { blendIn: 0.22, blendOut: 0.4, keys: [k(0, POINT), k(100, POINT)] },
};
for (const mv of Object.values(CINE_MOVES)) mv.track_ = new PoseTrack(mv.keys, {});

/** Let an actor use the cinematic poses (its own library stays underneath); returns the restore function. */
export function lendCineMoves(actor) {
  const own = actor.lib;
  actor.lib = Object.assign(Object.create(own || null), CINE_MOVES);
  return () => { if (actor.move && actor.move.name in CINE_MOVES) actor.stopMove(); actor.lib = own; };
}
/** Hold a cinematic pose (start it if needed and keep its clock in the middle so it never ends). */
export function holdPose(actor, name) {
  if (!actor.move || actor.move.name !== name) { actor.stopMove(); actor.startMove(name); }
  if (actor.move.t > 1) actor.move.t = Math.min(actor.move.t, 50);
}
const baseClip = (actor, ...names) => names.find(n => actor.actions[n]) || Object.keys(actor.actions)[0];

// ------------------------------------------------------------------ shared scene plumbing

class Scene {
  constructor(o) {
    Object.assign(this, o);
    this.t = 0; this.done = false; this.running = true; this.fired = new Set();
    this.bf = bullFrame(this.bull, this.G.chars.bull);
    this.dof = null; this.post = {}; this.black = 0;
    this.restoreMoves = lendCineMoves(this.actor);
    this.ui.letterbox(true);
    this.ui.setHint('Enter 跳过');
  }
  once(key, at, fn) { if (this.t >= at && !this.fired.has(key)) { this.fired.add(key); fn(); } }
  setEyes(k) { this.G.setEyes(k); }
  /**
   * The scene's spoken lines, this.script = [{ id, at }]: each starts at `at` at the earliest, and never before the
   * line before it has finished (plus a breath). talking is true until the last one has been spoken.
   */
  speak(t) {
    const v = this.G.voice, sc = this.script;
    if (!v || !sc) return;
    this.si = this.si || 0;
    if (v.busy) { this.quietT = 0; return; }
    this.quietT = (this.quietT ?? 1) + (t - (this.lastT ?? t));
    this.lastT = t;
    const next = sc[this.si];
    if (next && t >= next.at && this.quietT >= 0.35) { v.play(next.id); this.si++; this.quietT = 0; }
  }
  get talking() { return !!this.script && ((this.si || 0) < this.script.length || !!this.G.voice?.busy); }
  hush() { if (this.script && this.G.voice?.cur && this.script.some(l => l.id === this.G.voice.cur.id)) this.G.voice.stop(); }
  shake(k) { this.track?.jolt(k); this.arena.shake?.(k); }
  dofFor(info, ap = 0.002) {
    const s = info.shot;
    this.dof = { focus: s.focus ? (typeof s.focus === 'function' ? s.focus() : s.focus) : info.dist, aperture: s.ap ?? ap, maxblur: s.blur ?? 0.01 };
  }
  end(skipped) {
    if (this.done) return;
    this.done = true; this.running = false;
    if (skipped) this.hush();
    this.restoreMoves();
    this.ui.letterbox(false);
    this.ui.setHint('');
    this.dof = null; this.post = {}; this.black = 0;
    this.onDone?.(skipped);
  }
}

/** Push the monkey out of the giant's body circles (bull.colliders(): body, knees / feet, resting hands). */
function clearOfBull(monkey, bull) {
  const circles = typeof bull.colliders === 'function' ? bull.colliders() : [];
  for (let pass = 0; pass < 3; pass++) {
    for (const c of circles) {
      const dx = monkey.pos.x - c.x, dz = monkey.pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + 0.6;
      if (d < m) { const nx = d > 1e-4 ? dx / d : 0, nz = d > 1e-4 ? dz / d : 1; monkey.pos.x = c.x + nx * m; monkey.pos.z = c.z + nz * m; }
    }
  }
}

// ------------------------------------------------------------------ 山崩

export class CollapseScene extends Scene {
  // The beats follow bull.js's own 'rise' move (it plays its own sounds and bursts): roar ~0.6 s, the hands come down
  // ~3.6 s, the legs are drawn out of the rock 3.8-5.6 s, the deep squat 7.2 s, standing tall 8.6 s. This scene adds
  // the camera, the mountain splitting behind him (the arena's phase two), its lava fountains, the music change and
  // the smoke that swallows his head.
  constructor(o) {
    super(o);
    const { bf } = this;
    this.mpos = this.monkey.pos.clone();
    const F = bf.F.clone(), R = bf.R.clone(), seat = this.bull.pos.clone();
    const head = () => bf.head();
    const hand = () => bf.hand('Left');
    const foot = () => bf.foot('Left');
    const H = bf.H;
    this.duration = 10.6;
    // 4: from the hoof up to the burning sky, the head lost in smoke
    const climb = f => {
      const fo = foot(), hd = head();
      const lookY = THREE.MathUtils.lerp(fo.y + 1.5, hd.y + H * 0.45, ease.inOut(f));
      return V(THREE.MathUtils.lerp(fo.x, hd.x, f), lookY, THREE.MathUtils.lerp(fo.z, hd.z, f));
    };
    this.track = new ShotTrack([
      // 1 he throws his head back and roars at the sky
      { t0: 0, t1: 2.5, e: 'out', ap: 0.0006, shake: 0.4,
        from: { pos: seat.clone().addScaledVector(F, 30).addScaledVector(R, -6).setY(2.2), look: () => head().addScaledVector(bf.U, -2), fov: 40 },
        to: { pos: seat.clone().addScaledVector(F, 28).addScaledVector(R, -5).setY(2.0), look: () => head(), fov: 36 } },
      // 2 wide: the mountain behind him splits, the lava comes up; he bends and plants his hands
      { t0: 2.5, t1: 4.8, e: 'linear', ap: 0.0003, shake: 0.6,
        from: { pos: seat.clone().addScaledVector(F, 62).addScaledVector(R, -10).setY(6), look: seat.clone().addScaledVector(F, -18).setY(24), fov: 46 },
        to: { pos: seat.clone().addScaledVector(F, 58).addScaledVector(R, -9).setY(5.5), look: seat.clone().addScaledVector(F, -18).setY(27), fov: 44 } },
      // 3 a hand pressed into the ground as he tears his legs out of the rock
      { t0: 4.8, t1: 7.0, e: 'inOut', ap: 0.0014, shake: 0.5,
        from: { pos: () => hand().setY(0).addScaledVector(F, 13).addScaledVector(R, -6).setY(1.4), look: () => hand().lerp(head(), 0.15), fov: 38 },
        to: { pos: () => hand().setY(0).addScaledVector(F, 12).addScaledVector(R, -5).setY(1.1), look: () => hand().lerp(head(), 0.3), fov: 40 } },
      // 4 from the hooves to the burning sky: he stands
      { t0: 7.0, t1: 10.6, e: 'linear', ap: 0.0004, shake: 0.25,
        from: { pos: () => foot().addScaledVector(F, 30).addScaledVector(R, -9).setY(1.2), look: () => climb(0), fov: 48 },
        to: { pos: () => foot().addScaledVector(F, 34).addScaledVector(R, -10).setY(3.5), look: () => climb(1), fov: 54 } },
      // 5 the monkey, on rock again, low behind him: the standing giant towers into the smoke (「倒下去，才响。」)
      { t0: 10.6, t1: 15.5, e: 'out', ap: 0.0012, blur: 0.009, focus: () => this.camera.position.distanceTo(this.mpos) + 0.4,
        from: { pos: () => this.reactCam(0), look: () => this.reactLook(0), fov: 58 },
        to: { pos: () => this.reactCam(1), look: () => this.reactLook(1), fov: 52 } },
    ]);
    this.actor.playBase(baseClip(this.actor, 'idle'), { fade: 0.3 });
    // 牛魔王 as he tears himself out of the rock; the monkey answers when he stands
    this.script = [{ id: 'p1', at: 4.7 }, { id: 'p2', at: 9.8 }];
  }
  toBull() { return V(this.bull.pos.x - this.mpos.x, 0, this.bull.pos.z - this.mpos.z).normalize(); }
  reactCam(f) {
    const d = this.toBull(), side = V(-d.z, 0, d.x);
    return this.mpos.clone().addScaledVector(d, -THREE.MathUtils.lerp(3.0, 2.3, f)).addScaledVector(side, 0.9).setY(this.mpos.y + THREE.MathUtils.lerp(0.45, 0.6, f));
  }
  reactLook(f) {
    // a fixed tilt up past him (the giant is close and enormous: aiming at his head would lose the monkey)
    return this.mpos.clone().addScaledVector(this.toBull(), 8).setY(this.mpos.y + 1.3 + THREE.MathUtils.lerp(3.6, 4.4, f));
  }
  /** Before the last shot: the floor has fallen, put the monkey on rock (facing the giant) so the camera finds him there. */
  rehome() {
    clearOfBull(this.monkey, this.bull);
    const p = safeSpot(this.arena, this.monkey.pos.x, this.monkey.pos.z);
    this.monkey.pos.set(p.x, this.arena.groundY ? this.arena.groundY(p.x, p.z) : this.monkey.pos.y, p.z);
    this.mpos.copy(this.monkey.pos);
    const root = this.actor.root;
    root.position.copy(this.mpos);
    root.rotation.y = Math.atan2(this.bull.pos.x - this.mpos.x, this.bull.pos.z - this.mpos.z);
    holdPose(this.actor, 'cineLookUp');
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t, bf = this.bf, fx = this.G.fx, arena = this.arena;
    // the bull plays its own stand-up (blind to the monkey while the camera is away)
    this.bull.update(dt, this.G.ghost);
    bf.frame();
    this.actor.update(dt);
    const behind = (r, f) => bf.at(r, 0, f);
    this.once('crack', 2.5, () => {
      arena.setPhase(2);
      this.music?.('niumo_phase2', 0.5);
      this.audio.play('rock_crack', { pos: behind(0, -26), volume: 0.9, pitch: 0.55 });
      this.shake(0.9);
    });
    // the split mountain throws up lava behind him
    [[2.7, -8, -22, 1.2], [3.05, 10, -26, 1.0], [3.5, -2, -34, 1.6], [4.2, 16, -18, 0.9], [4.7, -16, -28, 1.2]].forEach(([at, r, f, s], i) => {
      this.once('erupt' + i, at, () => {
        const p = behind(r, f);
        arena.eruption?.(p.x, p.z, s);
        if (i % 2 === 0) this.audio.play('lava_burst', { pos: p, volume: 0.85, pitch: 0.8 + i * 0.05 });
        this.shake(0.45);
      });
    });
    this.once('flash', 3.45, () => { this.G.flash = Math.max(this.G.flash, 0.2); });
    // smoke closes over his head as the camera climbs
    if (t > 7.0 && t < 10.4 && (this.smokeAcc = (this.smokeAcc || 0) + dt) > 0.05) {
      this.smokeAcc = 0;
      const hd = bf.head();
      for (let i = 0; i < 3; i++) {
        fx.alpha.emit(hd.clone().add(V(rand(-9, 9), rand(-6, 8), rand(-9, 9))), V(rand(-1, 1), rand(0.5, 2), rand(-1, 1)),
          new THREE.Color(0.08, 0.06, 0.055), { size: rand(9, 16), life: rand(2.5, 4), drag: 0.4, grav: 0.2, alpha: 0.5, grow: 1.5 });
      }
    }
    this.once('rehome', 10.55, () => this.rehome());
    if (this.fired.has('rehome')) holdPose(this.actor, 'cineLookUp');
    this.speak(t);
    this.post = { warm: 0.1 * smooth(2.5, 4, t), exposure: 1 + 0.06 * smooth(2.5, 4.5, t) };
    const info = this.track.apply(this.camera, t, dt);
    this.dofFor(info, 0.0006);
    this.audio.setListener({ position: info.pos, forward: info.look.clone().sub(info.pos).normalize() });
    // the last shot holds until the monkey has had his word
    if (t >= this.duration && !this.talking) { this.tailT = (this.tailT || 0) + dt; if (this.tailT > 0.6) this.finish(false); }
  }
  finish(skipped) {
    if (this.done) return;
    // skipped: the floor is gone at once and he is on his feet
    if (skipped) {
      this.arena.setPhase(2, { instant: true }); if (!this.fired.has('crack')) this.music?.('niumo_phase2', 0.4);
      // he finishes standing up at once (blind to the monkey): the fight resumes with him on his feet, in phase two
      for (let i = 0; i < 200 && this.bull.state === 'transition'; i++) this.bull.update(0.1, this.G.ghost);
    }
    // the floor fell into the lava: put the monkey on rock, clear of the giant's feet
    clearOfBull(this.monkey, this.bull);
    const p = safeSpot(this.arena, this.monkey.pos.x, this.monkey.pos.z);
    this.monkey.pos.set(p.x, this.arena.groundY ? this.arena.groundY(p.x, p.z) : this.monkey.pos.y, p.z);
    this.G.cam.cut?.();
    this.end(skipped);
  }
  skip() { this.finish(true); }
}

// ------------------------------------------------------------------ ending

export class EndingScene extends Scene {
  // bull.js plays its own death (to its knees, a last roar, toppling back into the lake, sinking until only the horns
  // break the surface, the fire going out of him). When the bull does not animate a death of its own, this scene
  // topples and sinks the body itself. Either way it then kills the volcano, brings the rain and seats the monkey on
  // the highest horn tip above the lake for the last shot.
  constructor(o) {
    super(o);
    const { bf } = this;
    this.ui.setHint('');
    const root = bf.root;
    this.root0 = { pos: root.position.clone(), order: root.rotation.order, rx: root.rotation.x, rz: root.rotation.z };
    this.seat = this.bull.pos.clone();
    const F = bf.F.clone(), R = bf.R.clone(), seat = this.seat;
    this.F = F; this.R = R;
    this.horns = hornTipsFromGroup(this.bull.headParts) || hornTips(this.G.chars.bull);
    this.head0 = bf.head().y - this.root0.pos.y;
    this.selfFall = null;            // does the bull animate its own death? (decided in the first 1.3 s)
    this.fall = { tilt: 0, roll: 0, sink: 0, t0: 1.3 };
    this.finalSink = null;
    this.duration = 26;
    const mHead = () => this.actor.bonePos('Head', V());
    this.track = new ShotTrack([
      // 1 he goes down and topples back into the lava lake (slow motion at first)
      { t0: 0, t1: 6.0, e: 'out', ap: 0.0004, shake: 0.2,
        from: { pos: seat.clone().addScaledVector(F, 52).addScaledVector(R, 14).setY(3.5), look: seat.clone().setY(16), fov: 44 },
        to: { pos: seat.clone().addScaledVector(F, 58).addScaledVector(R, 16).setY(4.5), look: seat.clone().addScaledVector(F, -6).setY(7), fov: 47 } },
      // 2 the volcano dies: high and wide over the lake, the plumes go out
      { t0: 6.0, t1: 10.5, e: 'linear', ap: 0.0002,
        from: { pos: seat.clone().addScaledVector(F, 80).addScaledVector(R, -30).setY(26), look: seat.clone().addScaledVector(F, -40).setY(10), fov: 46 },
        to: { pos: seat.clone().addScaledVector(F, 74).addScaledVector(R, -26).setY(22), look: seat.clone().addScaledVector(F, -40).setY(12), fov: 44 } },
      // 3 the first rain: up into the falling drops, then down
      { t0: 10.5, t1: 15.0, e: 'inOut', ap: 0.0008,
        from: { pos: seat.clone().addScaledVector(F, 30).setY(2.0), look: seat.clone().addScaledVector(F, 22).setY(40), fov: 50 },
        to: { pos: seat.clone().addScaledVector(F, 30).setY(2.6), look: seat.clone().addScaledVector(F, 10).setY(12), fov: 46 } },
      // 4 the monkey on the horn above the lake, rain on the golden mask: a slow push
      { t0: 15.0, t1: 1e9, e: 'out', ap: 0.0028, blur: 0.012, focus: () => this.camera.position.distanceTo(mHead()),
        from: { pos: () => this.lastShotPos(0), look: () => mHead().add(V(0, -0.35, 0)), fov: 34 },
        to: { pos: () => this.lastShotPos(1), look: () => mHead().add(V(0, -0.1, 0)), fov: 26 } },
    ]);
    this.G.slowmo = 0.45; this.G.slowmoT = 2.2;
    this.audio.setMusic('off', { fade: 1.2 });
    // the monkey on the horn, to the drowned giant, as the rain comes down on the mask
    this.script = [{ id: 'e1', at: 16.9 }];
  }
  /** The final dolly, in front of the monkey on his horn and a little below him. */
  lastShotPos(f) {
    const m = this.actor.root.position, yaw = this.actor.root.rotation.y;
    const fw = V(Math.sin(yaw), 0, Math.cos(yaw)), side = V(fw.z, 0, -fw.x);
    const d = THREE.MathUtils.lerp(5.2, 2.6, f);
    return m.clone().addScaledVector(fw, d).addScaledVector(side, THREE.MathUtils.lerp(1.6, 0.7, f)).add(V(0, THREE.MathUtils.lerp(0.4, 0.75, f), 0));
  }
  /** Our own fall (only when the bull has none): applied on top of whatever the bull module set this frame. */
  applyFall() {
    const root = this.bf.root;
    root.rotation.order = 'YXZ';
    root.rotation.x = this.root0.rx - this.fall.tilt;
    root.rotation.z = this.root0.rz + this.fall.roll;
    root.position.y = this.root0.pos.y - this.fall.sink;
    root.updateMatrixWorld(true);
  }
  hornWorld() {
    if (this.horns) {
      const a = this.horns.world(0), b = this.horns.world(1);
      return a.y > b.y ? a : b;
    }
    return this.bf.head().addScaledVector(this.bf.U, this.bf.H * 0.08);
  }
  lakeY() { const g = this.arena.groundY ? this.arena.groundY(this.seat.x, this.seat.z) : 0; return Math.min(g, this.arena.lavaY ?? g); }
  update(dt) {
    if (this.done) { this.hold(dt); return; }
    this.t += dt;
    const t = this.t, bf = this.bf, fx = this.G.fx, arena = this.arena;
    // the bull's own death runs on its update; we watch whether it moves the body
    if (this.selfFall !== false) this.bull.update(dt, this.G.ghost);
    if (this.selfFall === null) {
      const root = bf.root, dropped = (this.root0.pos.y + this.head0) - bf.head().y;
      if (dropped > this.head0 * 0.05 || root.position.y < this.root0.pos.y - 0.3 || Math.abs(this.G.chars.bull.pivot.rotation.x) > 0.02) this.selfFall = true;
      else if (t >= this.fall.t0) this.selfFall = false;
    }
    if (this.selfFall === false) {
      const u = t - this.fall.t0;
      this.fall.tilt = THREE.MathUtils.degToRad(26) * ease.in(smooth(0, 2.8, u));
      this.fall.roll = THREE.MathUtils.degToRad(20) * ease.in(smooth(0.1, 2.9, u));
      if (this.finalSink === null && u >= 2.9) {
        // sink until only the higher horn's tip stands above the lake
        const save = this.fall.sink; this.fall.sink = 0; this.applyFall();
        this.finalSink = Math.max(4, this.hornWorld().y - this.lakeY() - 2.4);
        this.fall.sink = save;
      }
      const sinkTo = this.finalSink ?? 12;
      this.fall.sink = THREE.MathUtils.lerp(0, 6, ease.in(smooth(0.5, 2.9, u))) + (sinkTo - 6) * ease.inOut(smooth(2.9, 11, u));
      this.applyFall();
      this.setEyes(1 - smooth(1.6, 3.8, t));
      this.once('impact', this.fall.t0 + 2.7, () => {
        this.audio.play('lava_burst', { pos: this.seat, volume: 1.0, pitch: 0.6 });
        this.audio.play('bull_slam', { pos: this.seat, volume: 1.0, pitch: 0.6 });
        this.splash();
      });
    } else if (this.selfFall) {
      this.once('impact', 3.5, () => this.splash());       // bull.js's own lava_burst lands here
    }
    this.once('dying', 6.0, () => {
      arena.setPhase(3);
      this.music?.('niumo_ending', 4);
    });
    this.once('rain', 10.5, () => this.audio.play('rain', { volume: 0.9 }));
    // steam off the cooling lake where he went under
    if (t > 6 && t < 24 && (this.steamAcc = (this.steamAcc || 0) + dt) > 0.06) {
      this.steamAcc = 0;
      const k = 1 - smooth(14, 24, t);
      for (let i = 0; i < 3; i++) {
        const p = bf.at(rand(-16, 16), 0.5, rand(-22, 10));
        fx.alpha.emit(p, V(rand(-0.3, 0.3), rand(1.2, 3.2), rand(-0.3, 0.3)), new THREE.Color(0.5, 0.5, 0.52),
          { size: rand(4, 9), life: rand(3, 5), drag: 0.3, grav: 0.4, alpha: 0.22 * k, grow: 1.6 });
      }
    }
    // the last shot: the monkey sits on the horn that is still above the lake
    if (t >= 14.9) this.seatMonkey(dt);
    else if (!this.hidden) { this.hidden = true; this.actor.root.visible = false; this.G.staffs.monkey.visible = false; }
    this.speak(t);
    this.once('card', 19.8, () => this.ui.card_('火焰山 · 熄', 'ending', 3600, '八 百 里 火 焰 · 千 年 来 第 一 场 雨'));
    if (t > 15) this.rainOnMask(dt);
    this.post = { warm: -0.1 * smooth(6, 11, t), desat: 0.08 * smooth(6, 12, t) };
    const info = this.track.apply(this.camera, t, dt);
    this.dofFor(info, 0.0006);
    this.audio.setListener({ position: info.pos, forward: info.look.clone().sub(info.pos).normalize() });
    if (t >= this.duration) {
      this.running = false; this.done = true;
      this.onDone?.(false);
    }
  }
  splash() {
    const bf = this.bf;
    for (const [r, f, s] of [[0, -12, 1.6], [-12, -6, 1.1], [12, -8, 1.1], [-6, 4, 0.8], [8, 6, 0.8]]) {
      const p = bf.at(r, 0, f); this.arena.eruption?.(p.x, p.z, s);
    }
    this.shake(1.0); this.G.flash = Math.max(this.G.flash, 0.12);
  }
  rainOnMask(dt) {
    if ((this.dropAcc = (this.dropAcc || 0) + dt) < 0.05) return;
    this.dropAcc = 0;
    const h = this.actor.bonePos('Head', V()).add(V(rand(-0.08, 0.08), rand(0.02, 0.12), rand(-0.08, 0.08)));
    for (let i = 0; i < 2; i++) this.G.fx.add.emit(h, V(rand(-0.6, 0.6), rand(0.2, 0.9), rand(-0.6, 0.6)), new THREE.Color(0.5, 0.55, 0.62), { size: 0.012, life: 0.18, drag: 2, grav: -9, alpha: 0.6 });
  }
  seatMonkey(dt) {
    const a = this.actor, root = a.root, bullRoot = this.bf.root;
    if (!root.visible) { root.visible = true; this.G.staffs.monkey.visible = true; }
    // the highest horn tip must stand clear of the lake (whoever sank the body): lift the body if it does not
    let horn = this.hornWorld();
    const lake = this.lakeY();
    if (horn.y < lake + 1.2) { bullRoot.position.y += lake + 1.6 - horn.y; bullRoot.updateMatrixWorld(true); horn = this.hornWorld(); }
    // face out over the lake, toward where he came from
    root.rotation.y = Math.atan2(this.F.x, this.F.z) + 0.5;
    holdPose(a, 'cineSit');
    a.playBase(baseClip(a, 'idle'), { fade: 0 });
    root.position.copy(horn);
    root.updateMatrixWorld(true);
    a.update(dt);
    // put the pelvis on the horn tip
    const hips = a.bonePos('Hips', V());
    root.position.y += horn.y + 0.12 - hips.y;
    root.position.x += (horn.x - hips.x) * 0.9; root.position.z += (horn.z - hips.z) * 0.9;
    root.updateMatrixWorld(true);
    a.update(0);
    this.monkey.pos.copy(root.position);
  }
  /** After the card: hold the last shot (slow drift) until the player retries. */
  hold(dt) {
    this.t += dt;
    if (this.selfFall) this.bull.update(dt, this.G.ghost);
    else this.applyFall();
    this.seatMonkey(dt);
    this.rainOnMask(dt);
    const info = this.track.apply(this.camera, Math.min(this.t, 40), dt);
    this.dofFor(info, 0.0006);
  }
  skip() {
    if (this.done || this.t >= 15) return;
    // jump to the last shot: the fall complete, the volcano dead, the rain on
    this.fired.add('impact');
    if (!this.fired.has('dying')) { this.fired.add('dying'); this.arena.setPhase(3, { instant: true }); this.music?.('niumo_ending', 1.5); }
    if (!this.fired.has('rain')) { this.fired.add('rain'); this.audio.play('rain', { volume: 0.9 }); }
    this.setEyes(0);
    if (this.selfFall) { for (let i = 0; i < 80 && this.t < 15; i++) { this.bull.update(0.2, this.G.ghost); this.t += 0.2; } }
    else {
      this.selfFall = false;
      this.fall.tilt = THREE.MathUtils.degToRad(26); this.fall.roll = THREE.MathUtils.degToRad(20); this.fall.sink = 0; this.applyFall();
      this.finalSink = Math.max(4, this.hornWorld().y - this.lakeY() - 2.4);
      this.fall.sink = this.finalSink; this.applyFall();
    }
    this.t = 15;
    this.ui.card_('火焰山 · 熄', 'ending', 3600, '八 百 里 火 焰 · 千 年 来 第 一 场 雨');
    this.fired.add('card');
    this.G.slowmo = 1; this.G.slowmoT = 0;
  }
  /** Retry: give the body back to the bull module. */
  dispose() {
    this.hush();
    const root = this.bf.root;
    root.rotation.order = this.root0.order; root.rotation.x = this.root0.rx; root.rotation.z = this.root0.rz;
    root.position.y = this.root0.pos.y;
    this.actor.root.visible = true; this.G.staffs.monkey.visible = true;
    this.restoreMoves();
    this.ui.clearCard();
    this.ui.letterbox(false);
  }
}
