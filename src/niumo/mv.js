// 火焰山 · 牛魔 — the opening cinematic: ONE continuous piece from the click to the fight (skippable: Enter / Esc).
//
//   prologue (on the score's clock, every cut on a drum or gong of 'niumo_opening'):
//    0    回目卡 on black, only wind and fire: 第一回　火焰山千年不熄　美猴王一棒问山
//    2.6  ash settling on the scorched ground                 「八百里火焰，四周围寸草不生。」
//    5.4  on a ridge, the monkey's silhouette, staff on his shoulder, against the burning skyline
//   10    the caldera, and at its end that "mountain" (key art A)  「人说，那不是山。」
//   13.6  the mountain's shoulder: it breathes out, ash slides off it
//   16.6  he walks in under the knee, seen from the ground (key art B); the giant's iron staff stands like a pillar
//   22    THE TITLE (the big hit): wide behind him as he walks on, 火焰山 · 牛魔 on the left
//   26.4  the bronze face in the dark; two lava-coloured points open (the gong)
//   parley (on its own clock: each beat waits for its spoken line — tools/gen_voice.sh, cutscenes.js VoiceLines):
//    牛魔王「……五百年。压在山下的七弟，也爬出来了。」          the face, telephoto, the eyes still opening
//    孙悟空「平天大圣好定力。一坐千年，连火都坐倦了。」        the masked face, close, the caldera soft behind him
//    牛魔王「又来借扇？上回钻我妻的肚子——这回，钻哪儿？」      over his shoulder, up at the bronze face
//    孙悟空「这回不借。来拿。」                                 low beside him; on 来拿 the staff comes up at the giant
//    牛魔王「红孩儿的账，铁扇的账……今日一并算。」              wide in profile: the speck and the mountain
//    孙悟空「正好。俺老孙压了五百年，骨头正痒。」              low behind him, pushing in; a held breath after
//   finale: the roar (fire into the sky; the first bar of the fight music lands on it), then the camera comes down to
//   exactly where the fight camera starts, behind the monkey — and the fight is on.
//
// Cut times are MV_CUES (seconds); the audio build exports the same as NIUMO_CUES.opening and main.js passes them in.
import * as THREE from 'three';
import { ShotTrack, AshFall, bullFrame, lendCineMoves, holdPose, safeSpot } from './cutscenes.js';

export const MV_CUES = {
  card: 0,         // chapter card on black (wind, the burning plain)
  ash: 2.6,        // ash on the scorched earth (fades in from black)
  ridge: 5.4,      // the silhouette on the ridge (a far temple bell)
  caldera: 10.0,   // the caldera and the mountain (the gong)
  breath: 13.6,    // the shoulder: it breathes (a drum)
  knee: 16.6,      // the walk in under his knee (drum, choked cymbal, the suona, a quickening heartbeat)
  title: 22.0,     // THE TITLE (drums, tam-tam, cymbal, choir)
  eyes: 26.4,      // the eyes open (bell, sinking gong, drum)
  parley: 27.6,    // the spoken lines begin (the score is a quiet bed from here)
  end: 60,
};
/** The spoken exchange, in order (ids of assets/audio/voice/voice.json). */
export const PARLEY = ['b1', 'm1', 'b2', 'm2', 'b3', 'm3'];

/** The audio build's cue sheet (audio.js NIUMO_CUES.opening) mapped onto these shots. */
export function cuesFromScore(op) {
  if (!op || typeof op.parley !== 'number' || typeof op.title !== 'number') return null;
  const c = { ...MV_CUES };
  for (const k of Object.keys(MV_CUES)) if (typeof op[k] === 'number') c[k] = op[k];
  c.card = 0;
  return c;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * The splash screen's camera behind the click-to-start: wide over the caldera from behind the spawn — the seated giant
 * in the upper right, the dark on the left.
 */
export function titleCamera(camera, arena, time) {
  const S = arena.bullSeat || { x: 0, z: -30, yaw: 0 }, P = arena.playerSpawn || { x: 0, z: 40 };
  const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
  const rx = -fz, rz = fx;
  const a = Math.sin(time * 0.045);
  const back = 12 + a * 0.6, side = -1 + a * 0.4;
  const x = P.x + fx * back + rx * side, z = P.z + fz * back + rz * side;
  const gy = arena.groundY ? Math.max(0, arena.groundY(x, z)) : 0;
  camera.position.set(x, gy + 2.4 + a * 0.1, z);
  camera.lookAt(S.x + rx * 10, 9, S.z + rz * 10);
  if (Math.abs(camera.fov - 32) > 0.01) { camera.fov = 32; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ set pieces (built for the MV, removed after)

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * The ridge (shot 2) is staged high above the caldera, so nothing of the arena can stand in it: a jagged black crest,
 * and far behind it a band of burning sky with the cones of other volcanoes cut out of it.
 */
class RidgeSet {
  /** camLocal: where the shot's camera sits relative to the set (to put the burning band just above the crest). */
  constructor(scene, anchor, camLocal = V(-9, -4.5, 25)) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'mv-ridge';
    this.origin = anchor.clone();
    this.crest = x => 5.2 + 1.3 * Math.sin(x * 0.19) + 0.7 * Math.sin(x * 0.53 + 1.2) + 0.35 * Math.sin(x * 1.7 + 0.4);
    // the crest, extruded along z
    const shape = new THREE.Shape();
    shape.moveTo(-70, -40);
    for (let x = -70; x <= 70; x += 0.8) shape.lineTo(x, this.crest(x) + (Math.sin(x * 4.1) * 0.12));
    shape.lineTo(70, -40); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false });
    geo.translate(0, 0, -3);
    const rock = new THREE.MeshStandardMaterial({ color: 0x0b0807, roughness: 1, metalness: 0 });
    const ridge = new THREE.Mesh(geo, rock);
    ridge.receiveShadow = true;
    this.group.add(ridge);
    // the burning skyline: a smoky dark-red sky that burns hotter toward the horizon line behind the crest
    const sky = canvasTex(1024, 512, (g, w, h) => {
      const gy = g.createLinearGradient(0, 0, 0, h);
      gy.addColorStop(0, '#060303'); gy.addColorStop(0.35, '#180604'); gy.addColorStop(0.62, '#4a1306');
      gy.addColorStop(0.72, '#9a3610'); gy.addColorStop(0.79, '#e0621e'); gy.addColorStop(0.84, '#7a2009'); gy.addColorStop(1, '#120504');
      g.fillStyle = gy; g.fillRect(0, 0, w, h);
      // smoke banks
      for (let i = 0; i < 140; i++) {
        const x = Math.random() * w, y = h * (0.2 + Math.random() * 0.55), r = 30 + Math.random() * 110;
        const c = g.createRadialGradient(x, y, 0, x, y, r);
        c.addColorStop(0, `rgba(8,5,4,${0.25 + Math.random() * 0.3})`); c.addColorStop(1, 'rgba(8,5,4,0)');
        g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // distant volcano cones against the glow, one of them smoking
      g.fillStyle = '#0d0505';
      for (const [cx, base, hw, ht] of [[180, 0.86, 120, 0.1], [640, 0.86, 170, 0.15], [900, 0.86, 90, 0.07]]) {
        g.beginPath(); g.moveTo(cx - hw, h * base + 4); g.lineTo(cx - hw * 0.12, h * (base - ht)); g.lineTo(cx + hw * 0.12, h * (base - ht)); g.lineTo(cx + hw, h * base + 4); g.fill();
      }
      g.fillRect(0, h * 0.86, w, h * 0.14);
    });
    const skyMat = new THREE.MeshBasicMaterial({ map: sky, color: new THREE.Color(2.4, 1.9, 1.7), fog: false, depthWrite: false });   // bright enough to survive ACES: the silhouette needs it
    // place the hottest band (76% down the texture) a few degrees above the crest as the camera sees it
    const PH = 280, D = 160 + camLocal.z, crestEl = Math.atan2(this.crest(camLocal.x + 4) - camLocal.y, camLocal.z);
    const bandY = camLocal.y + D * Math.tan(crestEl + 0.035);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(700, PH), skyMat);
    back.position.set(camLocal.x, bandY - 0.24 * PH + PH / 2, -160);
    this.group.add(back);
    // a warm backlight from the burning horizon for the rim on the monkey
    const rim = new THREE.DirectionalLight(0xff7a3c, 4.0);
    rim.position.set(-10, 25, -60); rim.target.position.set(0, 6, 0);
    this.group.add(rim, rim.target);
    this.group.position.copy(this.origin);
    this.group.visible = false;
    scene.add(this.group);
  }
  /** World point on the crest at x (set-local). */
  crestAt(x, out = new THREE.Vector3()) { return out.set(this.origin.x + x, this.origin.y + this.crest(x), this.origin.z); }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.material) { o.material.map?.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); });
  }
}


// ------------------------------------------------------------------ the cinematic

export class OpeningMV {
  /**
   * voice: VoiceLines; fightPose(): { pos, look, fov } of the fight camera's first frame with the monkey where he stands
   * now (main.js); onDone(skipped): the fight begins.
   */
  constructor({ G, camera, scene, bull, monkey, actor, audio, arena, fx, ui, voice, cues, bullTick, fightPose, onDone }) {
    Object.assign(this, { G, camera, scene, bull, monkey, actor, audio, arena, fx, ui, voice, bullTick, fightPose, onDone });
    const c = this.c = { ...MV_CUES, ...(cues || {}) };
    this.t = 0; this.done = false; this.fired = new Set();
    this.dof = null; this.post = {}; this.black = 1;
    this.bf = bullFrame(bull, G.chars.bull);
    const bf = this.bf;
    const S = arena.bullSeat || { x: 0, z: -30, yaw: 0 }, P = arena.playerSpawn || { x: 0, z: 40 };
    this.S = S; this.P = P;
    this.F = bf.F.clone(); this.R = bf.R.clone();
    this.restoreMoves = lendCineMoves(actor);
    this.staff = G.staffs.monkey;
    this.titleEl = document.getElementById('title');
    this.ground = (x, z) => (arena.groundY ? Math.max(0, arena.groundY(x, z)) : 0);
    // set pieces
    this.ridge = new RidgeSet(scene, V(S.x, 260, S.z + 600));
    this.ash = new AshFall(scene, { count: 900, box: [16, 10, 16], ember: 0.06 });
    this.ash.visible = false;
    // where things happen: he walks in under the knee on the side of the giant's staff (the staff stands in the frame
    // like a pillar) and stops a stone's throw before it; that is where he talks, and where the fight starts
    const bstaff = G.staffs.bull, seatV = V(S.x, 0, S.z);
    this.staffSide = bstaff && bstaff.visible !== false ? Math.sign(bstaff.position.clone().sub(seatV).dot(this.R)) || 1 : 1;
    const knee = bf.knee(this.staffSide > 0 ? 'Right' : 'Left').setY(0);
    const toSpawn = V(P.x - knee.x, 0, P.z - knee.z).normalize();
    const st = safeSpot(arena, knee.x + toSpawn.x * 12, knee.z + toSpawn.z * 12);
    this.stand = V(st.x, this.ground(st.x, st.z), st.z);
    this.walkFrom = knee.clone().addScaledVector(toSpawn, 25);
    this.walkFrom.y = this.ground(this.walkFrom.x, this.walkFrom.z);
    this.d = V(S.x - this.stand.x, 0, S.z - this.stand.z).normalize();          // from where he stands to the seat
    this.side = V(-this.d.z, 0, this.d.x);
    this.lines = [
      [c.ash + 0.5, c.ridge + 0.4, '八百里火焰，四周围寸草不生。'],
      [c.caldera + 0.7, c.breath - 0.1, '人说，那不是山。'],
    ];
    this.track = this.buildShots();
    // the parley: one beat per line; then the roar and the camera coming down behind him
    this.beats = [
      ...PARLEY.map((id, i) => ({ line: id, shot: i === 0 ? 'eyes' : id, pre: i === 0 ? 0.3 : 0.28, post: id === 'm3' ? 0.95 : 0.4 })),
      { name: 'roar', shot: 'roar', fixed: 2.9 },
      { name: 'settle', shot: 'settle', fixed: 2.5 },
    ];
    this.bi = -1;
    ui.letterbox(true);
    ui.showChapter(false);
    ui.setHint('Enter 跳过');
    audio.setMusic('niumo_opening', { fade: 0.05 });
    voice?.load();
  }

  mPos() { return this.actor.root.position; }
  mHead() { return this.actor.bonePos ? this.actor.bonePos('Head', V()) : this.mPos().clone().setY(this.mPos().y + 1.35); }
  /** The bronze face, a little in front of the head bone. */
  face() {
    const e = this.bull.eyeSprites;
    if (e && e[0] && e[1]) return e[0].position.clone().lerp(e[1].position, 0.5);
    return this.bf.head().addScaledVector(this.bf.F, this.bf.H * 0.02);
  }

  buildShots() {
    const c = this.c, bf = this.bf, F = this.F, R = this.R, S = this.S, P = this.P;
    const seat = V(S.x, 0, S.z);
    const head = () => bf.head();
    const ridgeM = () => this.ridgeMonkey || this.ridge.crestAt(-6);
    const mPos = () => this.mPos();
    const stand = this.stand, d = this.d, side = this.side;
    const at = (o, fd, fs, y) => () => V(o.x + d.x * fd + side.x * fs, o.y + y, o.z + d.z * fd + side.z * fs);
    // key art A: far behind the monkey at the caldera's rim, almost level; he is small, the giant fills the frame
    const gA = k => this.ground(P.x + F.x * k, P.z + F.z * k);
    const camA = (k, s, h) => V(P.x + F.x * k + R.x * s, gA(k) + h, P.z + F.z * k + R.z * s);
    // key art B: on the ground a few steps behind him as he walks in, looking up past him at the knee and the giant
    const walkDir = this.stand.clone().sub(this.walkFrom).setY(0).normalize();
    const wSide = V(-walkDir.z, 0, walkDir.x).multiplyScalar(this.staffSide);
    const camB = back => () => mPos().clone().addScaledVector(walkDir, -back).addScaledVector(wSide, -0.9).setY(this.ground(mPos().x, mPos().z) + 0.32);
    const lookB = up => () => mPos().clone().addScaledVector(walkDir, 20).setY(up);
    // the title: behind him and above, the giant right of centre (the title sits on the left)
    const tRight = V(-walkDir.z, 0, walkDir.x);
    const camT = (back, h, s) => () => mPos().clone().addScaledVector(walkDir, -back).addScaledVector(tRight, s).setY(this.ground(mPos().x, mPos().z) + h);
    const lookT = y => seat.clone().setY(y).addScaledVector(tRight, -9);
    const away = -this.staffSide;
    const mHead = () => this.mHead();
    const focusM = () => this.camera.position.distanceTo(this.mHead()) + 0.1;
    const focusB = () => this.camera.position.distanceTo(this.face());
    const OPEN = 1e9;
    return new ShotTrack([
      // the chapter card on black (the camera already rests on the first frame)
      { name: 'card', t0: -1, t1: c.ash, e: 'linear', ap: 0.006,
        from: { pos: V(P.x + 2.4, 0.42, P.z - 6), look: V(P.x + 1.2, 0.1, P.z - 8.6), fov: 34 }, to: { pos: V(P.x + 2.4, 0.42, P.z - 6), look: V(P.x + 1.2, 0.1, P.z - 8.6), fov: 34 } },
      // macro over the scorched ground, ash settling, a slow push
      { name: 'ash', t0: c.ash, t1: c.ridge, e: 'linear', ap: 0.007, blur: 0.014,
        from: { pos: V(P.x + 2.4, 0.42, P.z - 6), look: V(P.x + 1.2, 0.1, P.z - 8.6), fov: 34 },
        to: { pos: V(P.x + 2.05, 0.35, P.z - 7.4), look: V(P.x + 0.9, 0.12, P.z - 9.8), fov: 31 } },
      // the ridge: long lens from below, the silhouette walking across the burning sky
      { name: 'ridge', t0: c.ridge, t1: c.caldera, e: 'linear', ap: 0.0004,
        from: { pos: () => this.ridge.crestAt(-9).add(V(0, -8.5, 25)), look: () => ridgeM().clone().add(V(0.9, 1.0, 0)), fov: 15 },
        to: { pos: () => this.ridge.crestAt(-4.5).add(V(0, -8.3, 24.5)), look: () => ridgeM().clone().add(V(0.9, 1.0, 0)), fov: 13.5 } },
      // the caldera (key art A): far behind the monkey, a slow push toward the mountain
      { name: 'caldera', t0: c.caldera, t1: c.breath, e: 'inOut', ap: 0.00025,
        from: { pos: camA(21, 2.5, 3.2), look: seat.clone().setY(8.2), fov: 30 },
        to: { pos: camA(18.5, 2.1, 3.0), look: seat.clone().setY(8.6), fov: 29 } },
      // the shoulder of the mountain: it breathes out, ash slides off it
      { name: 'breath', t0: c.breath, t1: c.knee, e: 'inOut', ap: 0.0009,
        from: { pos: () => bf.shoulder('Left').addScaledVector(F, 22).addScaledVector(R, -12).addScaledVector(bf.U, -5), look: () => bf.shoulder('Left').addScaledVector(bf.U, 1), fov: 21 },
        to: { pos: () => bf.shoulder('Left').addScaledVector(F, 21).addScaledVector(R, -11.4).addScaledVector(bf.U, -4.3), look: () => bf.shoulder('Left').addScaledVector(bf.U, 1.5), fov: 19.5 } },
      // under his knee (key art B): low behind the monkey as he walks in, the giant's staff a pillar beside the knee
      { name: 'knee', t0: c.knee, t1: c.title, e: 'linear', ap: 0.0007, shake: 0.12, focus: () => this.camera.position.distanceTo(mPos()) + 0.5,
        from: { pos: camB(3.8), look: lookB(8.5), fov: 64 },
        to: { pos: camB(3.3), look: lookB(10.5), fov: 61 } },
      // THE TITLE on the big hit: a crane up and back behind him as he walks on, the giant right of centre
      { name: 'title', t0: c.title, t1: c.eyes, e: 'out', ap: 0.0003, shake: 0.05,
        from: { pos: camT(24, 2.2, -2), look: lookT(6.8), fov: 40 },
        to: { pos: camT(30, 3.6, -3), look: lookT(7.8), fov: 38 } },
      // the bronze face in the dark, telephoto from low and far in front; the eyes open; 牛魔王 speaks first
      { name: 'eyes', t0: c.eyes, t1: OPEN, dur: 9, e: 'linear', ap: 0.0016, blur: 0.012,
        from: { pos: () => seat.clone().addScaledVector(F, 32).addScaledVector(R, away * 3).setY(head().y * 0.6), look: () => this.face(), fov: 24 },
        to: { pos: () => seat.clone().addScaledVector(F, 29.5).addScaledVector(R, away * 2.5).setY(head().y * 0.62), look: () => this.face(), fov: 17 } },
      // 孙悟空: the masked face, close and a little low, the caldera soft behind him
      { name: 'm1', t0: OPEN, t1: OPEN, e: 'inOut', ap: 0.0045, blur: 0.014, focus: focusM,
        from: { pos: at(stand, 2.5, 1.15, 1.02), look: () => mHead().addScaledVector(side, 0.12).add(V(0, -0.04, 0)), fov: 30 },
        to: { pos: at(stand, 2.15, 0.8, 1.08), look: () => mHead().addScaledVector(side, 0.08).add(V(0, -0.03, 0)), fov: 27 } },
      // 牛魔王: over the monkey's shoulder, up at the bronze face (the monkey a soft dark shape in the corner)
      { name: 'b2', t0: OPEN, t1: OPEN, e: 'inOut', ap: 0.0011, blur: 0.012, focus: focusB,
        from: { pos: at(stand, -1.15, 0.38, 0.5), look: () => mHead().lerp(this.face(), 0.6), fov: 40 },
        to: { pos: at(stand, -0.95, 0.32, 0.46), look: () => mHead().lerp(this.face(), 0.63), fov: 36 } },
      // 孙悟空「这回不借。来拿。」: low beside him; the staff comes up on 来拿
      { name: 'm2', t0: OPEN, t1: OPEN, e: 'out', ap: 0.0026, blur: 0.012, focus: focusM,
        from: { pos: at(stand, 0.9, 1.75, 0.3), look: () => mPos().clone().addScaledVector(d, 0.35).setY(mPos().y + 1.05), fov: 42 },
        to: { pos: at(stand, 1.0, 1.45, 0.24), look: () => mPos().clone().addScaledVector(d, 0.5).setY(mPos().y + 1.12), fov: 38 } },
      // 牛魔王: high and wide behind him — the speck on the cracked floor, the mountain that talks (a slow crane down)
      { name: 'b3', t0: OPEN, t1: OPEN, e: 'inOut', ap: 0.0003,
        from: { pos: () => this.twoShot(0), look: () => this.twoLook(0.3), fov: 66 },
        to: { pos: () => this.twoShot(1), look: () => this.twoLook(0.32), fov: 62 } },
      // 孙悟空: low behind him, pushing in; the giant towers over the staff
      { name: 'm3', t0: OPEN, t1: OPEN, e: 'inOut', ap: 0.0009, blur: 0.01, focus: focusM,
        from: { pos: at(stand, -3.0, -0.8, 0.9), look: () => mHead().lerp(head(), 0.17), fov: 54 },
        to: { pos: at(stand, -2.1, -0.6, 0.8), look: () => mHead().lerp(head(), 0.2), fov: 48 } },
      // the roar: low in front, the monkey a speck before him, fire going up behind
      { name: 'roar', t0: OPEN, t1: OPEN, e: 'out', ap: 0.0005, shake: 0.7,
        from: { pos: seat.clone().addScaledVector(F, 36).addScaledVector(R, away * 5).setY(1.4), look: () => head().addScaledVector(bf.U, 2), fov: 44 },
        to: { pos: seat.clone().addScaledVector(F, 38).addScaledVector(R, away * 5.5).setY(1.2), look: () => head().addScaledVector(bf.U, 4), fov: 47 } },
      // down behind the monkey, into the fight camera's first frame
      { name: 'settle', t0: OPEN, t1: OPEN, e: 'inOut', ap: 0.0004,
        from: { pos: at(stand, -8, 2.6, 6.0), look: () => mHead().lerp(head(), 0.6), fov: 40 },
        to: { pos: () => this.fightCam.pos.clone(), look: () => this.fightCam.look.clone(), fov: 40 } },
    ]);
  }

  shot(name) { return this.track.shots.find(s => s.name === name); }
  /** High behind the monkey, a little toward the giant's centre line (the b3 wide). */
  twoShot(f) {
    const inward = this.R.clone().multiplyScalar(-this.staffSide);
    return this.stand.clone().addScaledVector(this.d, -THREE.MathUtils.lerp(16, 14, f)).addScaledVector(inward, THREE.MathUtils.lerp(6, 5.5, f))
      .setY(this.stand.y + THREE.MathUtils.lerp(6, 5, f));
  }
  twoLook(k) { return this.mPos().clone().setY(this.mPos().y + 1).lerp(this.face(), k).addScaledVector(this.R, -this.staffSide * 5); }
  once(key, at, fn) { if (this.t >= at && !this.fired.has(key)) { this.fired.add(key); fn(); } }

  /** Put the monkey somewhere (or hide him) for the current shot. */
  placeMonkey(pos, yaw, { walk = false, visible = true, pose = 'cineCarry' } = {}) {
    const a = this.actor;
    a.root.visible = visible; this.staff.visible = visible;
    if (!visible) return;
    a.root.position.copy(pos); a.root.rotation.y = yaw;
    this.monkey.pos.copy(pos);
    const clip = walk ? (a.actions.walk ? 'walk' : 'idle') : (a.actions.idle ? 'idle' : Object.keys(a.actions)[0]);
    a.playBase(clip, { fade: 0.3 });
    if (walk && a.actions.walk) {
      const natural = a.clipSpeed('walk') || 1.2;
      a.setBaseTimeScale(THREE.MathUtils.clamp(1.25 / natural, 0.5, 1.5));
    } else a.setBaseTimeScale?.(1);
    if (pose) holdPose(a, pose);
    else if (a.move && a.move.name?.startsWith('cine')) a.stopMove();
  }

  /**
   * The prologue runs on the score's clock (audio.musicTime() since 'niumo_opening' started), so every cut stays on its
   * drum even when frames drop; from the parley on (and without audio) it runs on the frame clock.
   */
  clock(dt) {
    if (this.t < this.c.parley) {
      const mt = this.audio.musicState === 'niumo_opening' && this.audio.musicTime ? this.audio.musicTime() : null;
      if (mt !== null && mt !== undefined && isFinite(mt)) { this.synced = true; return Math.max(this.t, mt); }
      this.waitAudio = (this.waitAudio || 0) + dt;
      return this.synced || this.waitAudio > 1 ? this.t + dt : 0;
    }
    return this.t + dt;
  }

  // -------------------------------------------------------------- the parley and the finale (event-driven beats)

  startBeat(i) {
    const prev = this.beats[this.bi], b = this.beats[i];
    this.bi = i; this.bt = 0;
    if (!b) return;
    b.started = true;
    const s = this.shot(b.shot);
    b.dur = b.line ? b.pre + (this.voice ? this.voice.duration(b.line) : 3) + b.post : b.fixed;
    if (prev && prev.shot !== b.shot) { const ps = this.shot(prev.shot); if (ps) ps.t1 = this.t; }
    if (s) {
      if (s.t0 > this.t) { s.t0 = this.t; s.t1 = 1e9; s.dur = b.dur; }      // a new shot for this beat
      else s.dur = this.t - s.t0 + b.dur;                                     // the shot already running (the face)
    }
    if (b.name === 'roar') this.roar();
    if (b.name === 'settle') this.settle();
  }

  updateBeats(dt) {
    if (this.bi < 0) { if (this.t >= this.c.parley) this.startBeat(0); else return; }
    const b = this.beats[this.bi];
    if (!b) return;
    this.bt += dt;
    if (b.line && !b.spoken && this.bt >= b.pre) {
      b.spoken = true;
      this.voice?.play(b.line);
      b.heard = this.voice?.cur;
      // his voice comes out of a mountain: the ground hums, ash shakes off his brow
      if (this.voice?.lines[b.line]?.speaker === 'bull') {
        this.track.jolt(0.18); this.arena.shake?.(0.12);
        this.fx.motes?.(this.bf.head(), 3, 14, new THREE.Color(0.55, 0.22, 0.08));
      }
    }
    const talking = b.heard && !b.heard.done;
    if (this.bt >= b.dur && !talking) {
      if (this.bi + 1 < this.beats.length) this.startBeat(this.bi + 1);
      else this.finish(false);
    }
  }

  roar() {
    const bf = this.bf;
    // he wakes (bull.js roars itself) — the AI stays blind to the monkey: the cinematic feeds him the ghost
    if (this.bull.state === 'dormant') this.bull.wake?.();
    this.audio.play('bull_roar', { pos: bf.head(), volume: 1, pitch: 0.6 });
    // the fight music's first downbeat (big drum, gong) lands on the roar
    this.audio.setMusic('niumo_phase1', { fade: 0.2 });
    this.track.jolt(0.9);
    this.G.flash = Math.max(this.G.flash, 0.12);
    for (const [r, f, s] of [[-14, -16, 1.4], [12, -20, 1.2], [0, -30, 1.8]]) { const p = bf.at(r, 0, f); this.arena.eruption?.(p.x, p.z, s); }
    this.arena.shake?.(0.8);
    this.roarT = this.t;
  }

  settle() {
    // the monkey takes his place for the fight; the camera comes down to where the fight camera will start
    this.restoreMoves();
    this.restoreMoves = () => {};
    this.monkey.reset?.({ x: this.stand.x, z: this.stand.z, yaw: this.standYaw() });
    this.placeMonkey(this.stand, this.standYaw(), { pose: null });
    this.fightCam = this.fightPose?.() || { pos: this.stand.clone().addScaledVector(this.d, -4.5).setY(this.stand.y + 2.2), look: this.bf.head(), fov: 50 };
    const s = this.shot('settle');
    s.to.fov = this.fightCam.fov || 50;
    this.ui.letterbox(false);
    this.ui.setHint('');
  }

  standYaw() { return Math.atan2(this.S.x - this.stand.x, this.S.z - this.stand.z); }

  update(dt) {
    if (this.done) return;
    const prev = this.t;
    this.t = this.clock(dt);
    dt = Math.max(0, Math.min(0.25, this.t - prev));
    const t = this.t, c = this.c, bf = this.bf, fx = this.fx;
    this.bullTick(dt);
    bf.frame();
    this.updateBeats(dt);
    if (this.done) return;
    const beat = this.beats[this.bi];
    // ---- the chapter card on black
    this.once('card-on', 0.3, () => this.ui.showChapter(true));
    this.once('card-off', c.ash - 0.2, () => this.ui.showChapter(false));
    this.black = t < c.ash ? 1 : 1 - smooth(c.ash, c.ash + 1.4, t);
    // ---- the title card on the big hit
    this.once('title-on', c.title, () => { this.titleEl?.classList.remove('hide'); this.titleEl?.classList.add('nomenu'); this.G.flash = Math.max(this.G.flash, 0.08); this.track.jolt(0.35); });
    this.once('title-off', c.eyes - 0.9, () => this.titleEl?.classList.add('hide'));
    // ---- cast
    const shot = this.track.at(t), name = shot.name;
    this.shotName = name;
    const yaw = this.standYaw();
    if (name === 'ridge') {             // walking right along the crest (screen right is +x from the camera)
      const x = -7.5 + (t - c.ridge) * 1.2;
      const p = this.ridge.crestAt(x).add(V(0, -0.05, 2.6));       // on the near edge of the crest, against the sky
      this.ridgeMonkey = p;
      this.placeMonkey(p, Math.PI / 2, { walk: true });
    } else if (name === 'caldera') {    // standing small at the rim, looking at the mountain
      this.placeMonkey(V(this.P.x, this.ground(this.P.x, this.P.z), this.P.z), Math.atan2(this.S.x - this.P.x, this.S.z - this.P.z));
    } else if (name === 'knee' || name === 'title') {   // walking in under the knee, on through the title
      const f = clamp01((t - c.knee) / (c.eyes - 0.3 - c.knee));
      const p = this.walkFrom.clone().lerp(this.stand, f);
      p.y = this.ground(p.x, p.z);
      this.placeMonkey(p, Math.atan2(this.stand.x - this.walkFrom.x, this.stand.z - this.walkFrom.z), { walk: f < 1 });
    } else if (beat && this.bi >= 0) {  // the parley: he stands his ground
      const pose = beat.name === 'settle' ? null
        : this.bi < 1 ? 'cineLookUp' : this.bi < 3 ? 'cineCarry'
        : this.bi === 3 ? (this.bt > beat.pre + 1.08 ? 'cinePoint' : 'cineCarry') : 'cinePoint';
      if (pose === 'cinePoint') this.once('point', 0, () => { this.track.jolt(0.25); this.audio.play('staff_swing', { pos: this.stand, volume: 0.5, pitch: 0.8 }); fx.dust?.(this.stand.clone(), 0.8, 14); });
      this.placeMonkey(this.stand, yaw, { pose });
    } else if (name === 'eyes') {
      this.placeMonkey(this.stand, yaw, { pose: 'cineLookUp' });
    } else this.placeMonkey(null, 0, { visible: false });
    if (this.actor.root.visible) this.actor.update(dt);
    // ---- set pieces
    this.ridge.group.visible = name === 'ridge';
    // the ridge set lives far outside the caldera's sky dome: hide the arena for that shot or the dome swallows the sky
    if (this.arena?.group) this.arena.group.visible = name !== 'ridge';
    const ashShot = ['card', 'ash', 'ridge', 'knee', 'eyes', 'm1', 'm2', 'm3'].includes(name);
    this.ash.visible = ashShot;
    if (ashShot) { this.ash.center.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(V()), 5); this.ash.update(dt); }
    // ---- beats of the score
    // the mountain breathes out; ash slides off the shoulder in a slow fall
    if (name === 'breath' && (this.slideAcc = (this.slideAcc || 0) + dt) > 0.04) {
      this.slideAcc = 0;
      const sh = bf.shoulder('Left'), k = 0.5 + 0.5 * Math.sin((t - c.breath) / (c.knee - c.breath) * Math.PI);
      for (let i = 0; i < 4 * k; i++) {
        const p = sh.clone().add(V(rand(-2.5, 2.5), rand(1.5, 3), rand(-2, 2)));
        const v = this.R.clone().multiplyScalar(-rand(0.3, 1.0)).add(V(rand(-0.2, 0.2), rand(-0.9, -0.2), rand(-0.3, 0.3)));
        fx.alpha.emit(p, v, new THREE.Color(0.2, 0.19, 0.18), { size: rand(0.15, 0.55), life: rand(2.2, 3.6), drag: 0.35, grav: -1.1, alpha: 0.6, grow: 0.8 });
      }
    }
    // the eyes open with the gong, and stay open
    this.G.setEyes(smooth(c.eyes + 0.5, c.eyes + 2.4, t));
    this.once('brow-dust', c.eyes + 0.8, () => fx.motes(bf.head(), 2.2, 18, new THREE.Color(0.8, 0.28, 0.08)));
    // the head comes up a little with every line (bull.js lifts it the rest of the way when he wakes on the roar)
    if ('wakeK' in this.bull && this.bull.state === 'dormant') {
      const want = this.bi < 0 ? 0 : Math.min(0.75, 0.2 + this.bi * 0.11);
      this.bull.wakeK += (want - this.bull.wakeK) * (1 - Math.exp(-0.9 * dt));
    }
    // the roar: fire goes up behind him
    if (this.roarT !== undefined && t - this.roarT < 3.5 && (this.fireAcc = (this.fireAcc || 0) + dt) > 0.03) {
      this.fireAcc = 0;
      const k = 1 - smooth(this.roarT + 1.5, this.roarT + 3.5, t);
      for (let i = 0; i < 6 * k; i++) {
        const p = bf.at(rand(-24, 24), rand(0, 6), rand(-34, -14));
        fx.add.emit(p, V(rand(-2, 2), rand(14, 34), rand(-2, 2)), new THREE.Color(2.2, 0.55, 0.12), { size: rand(0.3, 0.9), life: rand(1.2, 2.4), drag: 0.25, grav: -3, alpha: 0.9 });
      }
    }
    // ---- narration (the prologue); the spoken lines show their own subtitles
    if (this.bi < 0) {
      const line = this.lines.find(([a, z]) => t >= a && t < z);
      this.ui.narrate(line ? line[2] : '');
    }
    // ---- camera
    const info = this.track.apply(this.camera, t, dt);
    const settleK = name === 'settle' ? smooth(0.2, 0.85, this.bt / (beat?.dur || 1)) : 0;
    this.dof = settleK >= 0.999 ? null : { focus: shot.focus ? shot.focus() : info.dist, aperture: (shot.ap ?? 0.001) * (1 - settleK), maxblur: shot.blur ?? 0.01 };
    this.audio.setListener({ position: info.pos, forward: info.look.clone().sub(info.pos).normalize() });
    this.post = { warm: name === 'ridge' ? 0.1 : 0, vignette: name === 'm1' || name === 'b2' ? 0.12 : 0 };
  }

  skip() { if (!this.done) this.finish(true); }

  finish(skipped = false) {
    if (this.done) return;
    this.done = true;
    if (skipped) this.voice?.stop();
    this.black = 0; this.dof = null; this.post = {};
    this.ridge.dispose(); this.ash.dispose();
    if (this.arena?.group) this.arena.group.visible = true;
    this.restoreMoves();
    this.actor.root.visible = true; this.staff.visible = true;
    this.actor.setBaseTimeScale?.(1);
    this.ui.narrate(''); this.ui.showChapter(false); this.ui.letterbox(false); this.ui.setHint('');
    this.titleEl?.classList.add('hide');
    this.G.setEyes(1);
    this.monkey.reset?.({ x: this.stand.x, z: this.stand.z, yaw: this.standYaw() });
    this.onDone?.(skipped);
  }
}
