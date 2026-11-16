#!/usr/bin/env node
// Monkey test driver (player row): drives test/niumo_monkey.html with real key events and the page's deterministic
// stepper, screenshots every move at its key frames (side view + AutoCam), and asserts the gameplay contract.
//
//   node test/niumo_monkey.mjs [scenario ...]      (run from game/, or anywhere)
//   scenarios: sheets  moves  combo  charge  parry  iframes  fan  execute  run  hazards  hurt  grab  camera  perf
//   (not in the default set) bakestaff: export the procedural staff (createStaff) to assets/models/niumo_staff.glb
//   default: everything. Screenshots: test/out/niumo/player/. Exit code 1 on any failed check or console error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out/niumo/player');
fs.mkdirSync(OUT, { recursive: true });
const require = (await import('node:module')).createRequire(import.meta.url);
const puppeteer = require(path.join(HERE, '../node_modules/puppeteer-core'));
const ALL = ['sheets', 'moves', 'combo', 'charge', 'parry', 'iframes', 'fan', 'execute', 'run', 'hazards', 'hurt', 'grab', 'camera', 'perf'];
const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ALL);
const W = 1280, H = 720;

const server = await startServer(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-webgl', `--window-size=${W},${H}`],
});
const errors = [], fails = [], passes = [];
let expected404 = 0, console404 = 0;            // HEAD probes for art still in production: expected, reconciled at the end
const check = (ok, what, detail = '') => {
  (ok ? passes : fails).push(what + (detail ? ' — ' + detail : ''));
  console.log((ok ? '  ok   ' : '  FAIL ') + what + (detail ? '  ' + detail : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let page = null;

// the HEAD probe for art that is still in production is an expected 404 while it is missing
const EXPECTED_404 = /niumo_monkey\.glb|niumo_staff\.glb/;
async function open(query = '') {
  page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  page.on('response', r => { if (r.status() === 404) { if (EXPECTED_404.test(r.url())) expected404++; else errors.push('404 ' + r.url()); } });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('console', m => {
    if (!['error', 'warning', 'warn'].includes(m.type())) return;
    const t = m.text();
    if (/status of 404/.test(t)) { console404++; return; }        // matched against the expected probes at the end
    errors.push(m.type() + ': ' + t);
  });
  await page.goto(`http://127.0.0.1:${port}/test/niumo_monkey.html?${query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__T && window.__T.ready', { timeout: 120000, polling: 200 });
  return page;
}
const T = (expr, arg) => page.evaluate(new Function('arg', `const T = window.__T; return (${expr});`), arg);
const step = sec => T('T.step(arg)', sec);
const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); };
const view = v => T('T.setView(arg)', v);
const tap = async code => { await page.keyboard.down(code); await page.keyboard.up(code); };
const state = () => T('T.state()');
const events = () => T('T.events.splice(0)');
/** reset the monkey in front of a giant pose; returns the state */
async function setup({ x = 0, z = -2, yaw = Math.PI, pose = 'slamL', settle = 0.8, fight = true } = {}) {
  await T(`(T.fight = ${fight}, T.giant.setPose('${pose}', 0), T.giant.hits.length = 0, T.giant.results.length = 0, T.giant.crits.length = 0,
    T.giant.pending.length = 0, T.giant.camHint = null, T.giant.dormant = false, T.place(${x}, ${z}, ${yaw}), T.events.length = 0, T.hitstop = 0, T.input.clearHeld(), true)`);
  await step(settle);
  await T('(T.events.length = 0, true)');
}

// ====================================================================================================== scenarios

async function sheets() {
  console.log('\n[sheets] pose sheets for every move');
  const SHEETS = {
    light1: [0, 0.085, 0.155, 0.22, 0.3], light2: [0.08, 0.15, 0.22, 0.3], light3: [0.13, 0.22, 0.29, 0.5],
    finisher: [0.12, 0.3, 0.6, 0.7, 0.86], heavy: [0.34, 0.47, 0.55], runAttack: [0.18, 0.36, 0.44],
    roll: [0.07, 0.21, 0.36, 0.46], backflip: [0.06, 0.2, 0.34], blockHit: [0, 0.06], parry: [0.05, 0.2],
    fan: [0.14, 0.33, 0.43, 0.51], critical: [0.2, 0.36, 0.6, 0.82, 0.92], hurt: [0.07], knockdown: [0.12, 0.4, 1.25],
    death: [0.75, 1.3, 1.65], held: [0.5], land: [0.12], vault: [0.12],
  };
  for (const [mv, times] of Object.entries(SHEETS)) {
    const p = await browser.newPage();
    await p.setViewport({ width: 300 * 3, height: 340 * times.length });
    p.on('pageerror', e => errors.push('pageerror: ' + String(e)));
    p.on('response', r => { if (r.status() === 404) { if (EXPECTED_404.test(r.url())) expected404++; else errors.push('404 ' + r.url()); } });
    p.on('console', m => { if (!['error', 'warning', 'warn'].includes(m.type())) return; if (/status of 404/.test(m.text())) console404++; else errors.push(m.type() + ': ' + m.text()); });
    await p.goto(`http://127.0.0.1:${port}/test/niumo_monkey.html?mode=sheet&move=${mv}&times=${times.join(',')}&views=side,front,q`, { waitUntil: 'load' });
    await p.waitForFunction('window.__T && window.__T.ready', { timeout: 60000, polling: 200 });
    await p.screenshot({ path: path.join(OUT, `sheet_${mv}.png`) });
    await p.close();
  }
  check(true, 'pose sheets rendered', Object.keys(SHEETS).length + ' moves');
}

async function moves() {
  console.log('\n[moves] every move at its key frames, side view + AutoCam, in front of the giant');
  const KEY = {
    light1: [0.085, 0.155, 0.22], light2: [0.08, 0.15, 0.22], light3: [0.13, 0.22, 0.29], finisher: [0.12, 0.3, 0.7],
    heavy: [0.34, 0.47], runAttack: [0.18, 0.36], roll: [0.21], backflip: [0.2], parry: [0.05], fan: [0.33, 0.45],
    hurt: [0.07], knockdown: [0.4], death: [1.65],
  };
  await setup({ z: -5, pose: 'slamL' });
  await T(`(T.place(5.0, -8.6, Math.PI * 0.98), T.step(0.6), true)`);
  for (const [mv, times] of Object.entries(KEY)) {
    for (const t of times) {
      await T(`T.preview('${mv}', ${t})`);
      await view('side'); await shot(`move_${mv}_${t}_side`);
      await view('auto'); await shot(`move_${mv}_${t}_auto`);
    }
  }
  await setup({ pose: 'slamL', z: -5 });
  await view('side'); await shot('move_block_side');
  await T('(T.input.press("block"), true)'); await page.keyboard.down('KeyL'); await step(0.3);
  await view('side'); await shot('move_block_hold_side'); await view('auto'); await shot('move_block_hold_auto');
  await page.keyboard.up('KeyL'); await step(0.3);
  // critical against the bowed head
  await setup({ pose: 'bow', z: -9, settle: 1.0 });
  for (const t of [0.36, 0.6, 0.82, 0.92, 1.2]) {
    await T(`T.preview('critical', ${t})`);
    await view('side'); await shot(`move_critical_${t}_side`);
    await view('auto'); await shot(`move_critical_${t}_auto`);
  }
  check(true, 'move key frames captured', Object.values(KEY).flat().length + 5 + ' frames x2 views');
}

async function combo() {
  console.log('\n[combo] J x4 -> light1, light2, light3, finisher, then a new string');
  // ~3 m from the hand's surface: beyond the rod's own reach, inside the step into the blow (monkey.stepIn)
  await setup({ x: 5.6, z: -8.6, yaw: Math.PI, pose: 'slamL' });
  const seq = [];
  for (let i = 0; i < 5; i++) {
    await tap('KeyJ');
    let s = await step(1 / 60);
    seq.push(s.move);
    const name = s.move;
    // wait for the cancel window (or the end) of this hit before the next press
    const cancel = await T(`T.MONKEY['${name}'] ? T.MONKEY['${name}'].cancel : 0`);
    let guard = 0;
    while ((s.move === name && s.mt < cancel + 0.02) && guard++ < 200) {
      s = await step(1 / 60);
      if (i === 4 && s.move === name && s.mt >= 0.155 && !(await T('T._shotC'))) { await T('(T._shotC = 1, true)'); }
    }
    if (i < 3) { await view('auto'); await shot(`combo_${i + 1}_${name}`); await view('auto'); }
    if (i === 3) {   // let the finisher play out, then a press long after it ends starts a new string
      while ((await state()).move === 'finisher') await step(0.05);
      await step(0.6);
    }
  }
  const evs = await events();
  const hits = await T('T.giant.hits.slice()');
  console.log('    sequence', seq.join(' > '), '| hits', hits.map(h => h.part + ':' + h.kind).join(' '));
  check(JSON.stringify(seq) === JSON.stringify(['light1', 'light2', 'light3', 'finisher', 'light1']), 'combo order J J J J (J)', seq.join(','));
  const kinds = new Set(hits.map(h => h.kind));
  check(['light1', 'light2', 'light3', 'finisher'].every(k => kinds.has(k)), 'every combo hit landed on the giant', [...kinds].join(','));
  check(hits.some(h => h.part === 'handL'), 'the staff found the weak point (hand on the ground)', hits.map(h => h.part).join(','));
  check(hits.filter(h => h.kind === 'finisher').length === 2, 'finisher lands twice (spin + thrust)', String(hits.filter(h => h.kind === 'finisher').length));
  check(evs.filter(e => e.type === 'hit').every(e => e.hitstop > 0), 'hit events carry hitstop', evs.filter(e => e.type === 'hit').map(e => e.hitstop).join(','));
  // a press long after the string ended does not continue it (already in seq[4]); a press inside the grace does
  await setup({ x: 5.6, z: -7.2, yaw: Math.PI, pose: 'slamL' });
  await tap('KeyJ'); await step(1 / 60);
  while ((await state()).move === 'light1') await step(1 / 60);
  await step(0.1); await tap('KeyJ');
  const s2 = await step(1 / 60);
  check(s2.move === 'light2', 'J within the grace after a hit continues the string', s2.move);
}

async function charge() {
  console.log('\n[charge] K hold to charge, release to smash');
  await setup({ x: 6.0, z: -10.2, yaw: Math.PI, pose: 'slamL' });
  await page.keyboard.down('KeyK');
  let s = await step(0.2);
  check(s.move === 'heavy', 'K starts the heavy', s.move);
  s = await step(0.4);
  const mid = s.charge;
  await view('auto'); await shot('charge_mid_auto'); await view('side'); await shot('charge_mid_side'); await view('auto');
  check(s.mt <= 0.341 && s.move === 'heavy', 'the pose waits at the top while K is held', 'mt=' + s.mt);
  check(mid > 0.15 && mid < 0.6, 'charge builds while held', 'charge=' + mid);
  s = await step(0.85);          // the wind-up reaches the top at 0.34 s, then a full second of charge
  let evs = await events();
  check(evs.some(e => e.type === 'charge-full'), 'charge-full event at max', evs.map(e => e.type).join(','));
  check(s.charge >= 0.999, 'charge reaches 1', String(s.charge));
  await view('auto'); await shot('charge_full_auto');
  await page.keyboard.up('KeyK');
  for (let i = 0; i < 20; i++) { s = await step(1 / 60); if (s.mt >= 0.5) break; }
  await view('auto'); await shot('charge_smash_auto'); await view('side'); await shot('charge_smash_side'); await view('auto');
  await step(0.5);
  evs = await events();
  const hits = await T('T.giant.hits.slice()');
  console.log('    hits', JSON.stringify(hits));
  check(hits.some(h => h.kind === 'heavy' && h.full && h.charge >= 0.999), 'fully charged smash lands as full', JSON.stringify(hits.map(h => [h.part, h.full, h.charge])));
  check(evs.some(e => e.type === 'impact' && e.strength === 1), 'full smash cracks the ground (impact 1)', evs.filter(e => e.type === 'impact').map(e => e.strength).join(','));
  // a tap: no charge
  await setup({ x: 6.0, z: -10.2, yaw: Math.PI, pose: 'slamL' });
  await tap('KeyK');
  s = await step(0.9);
  const hits2 = await T('T.giant.hits.slice()');
  check(hits2.length > 0 && hits2.every(h => h.charge < 0.1 && !h.full), 'tapped K smashes at once, uncharged', JSON.stringify(hits2.map(h => [h.part, h.charge])));
  const dmgFull = hits.find(h => h.kind === 'heavy')?.dmg, dmgTap = hits2[0]?.dmg;
  check(dmgFull > dmgTap * 1.8, 'charged smash hits much harder', `${dmgFull} vs ${dmgTap}`);
}

async function parry() {
  console.log('\n[parry] L: hold to block, press just before the blow to parry');
  const run = async (label, { press, hold, before, blockable = true }) => {
    await setup({ x: 0, z: 0, yaw: Math.PI, pose: 'rest' });
    if (press) await page.keyboard.down('KeyL');
    if (!hold && press) await page.keyboard.up('KeyL');
    await T(`(T.giant.strike({ delay: ${before}, dmg: 20, kind: 'heavy', blockable: ${blockable}, label: '${label}' }), true)`);
    await step(before + 2 / 60);
    const r = (await T('T.giant.results.slice()')).pop();
    if (hold) await page.keyboard.up('KeyL');
    return r;
  };
  let r = await run('parry 0.1s', { press: true, hold: true, before: 0.1 });
  await view('side'); await shot('parry_side'); await view('auto'); await shot('parry_auto');
  check(r && r.result === 'parry', 'L pressed 0.1 s before the blow parries', JSON.stringify(r));
  check(r && r.hp1 === r.hp0, 'parry costs no health', `${r?.hp0} -> ${r?.hp1}`);
  r = await run('parry tap 0.15s', { press: true, hold: false, before: 0.15 });
  check(r && r.result === 'parry', 'a tapped L (released) still parries inside the window', JSON.stringify(r));
  r = await run('late 0.42s', { press: true, hold: true, before: 0.42 });      // (the parry window is 0.3 s)
  check(r && r.result === 'block', 'L held 0.42 s before the blow only blocks', JSON.stringify(r));
  check(r && r.hp1 < r.hp0 && r.hp0 - r.hp1 < 5, 'block chips a little health', `${r?.hp0} -> ${r?.hp1}`);
  await view('side'); await shot('block_side');
  r = await run('held 0.6s', { press: true, hold: true, before: 0.6 });
  check(r && r.result === 'block', 'L held long blocks', JSON.stringify(r));
  r = await run('tap expired 0.35s', { press: true, hold: false, before: 0.35 });
  check(r && r.result === true, 'a tap that expired before the blow does nothing', JSON.stringify(r));
  r = await run('unblockable', { press: true, hold: true, before: 0.1, blockable: false });
  check(r && r.result === true, 'unblockable blows ignore the guard', JSON.stringify(r));
  r = await run('no guard', { press: false, hold: false, before: 0.2 });
  check(r && r.result === true && r.hp1 < r.hp0, 'no guard: hit', JSON.stringify(r));
  const s = await state();
  check(s.move === 'knockdown', 'a heavy blow knocks him down', s.move);
  // window edge (sim time, deterministic): 0.26 parries, 0.36 does not (the window is 0.3 s)
  r = await run('edge 0.26', { press: true, hold: true, before: 0.26 });
  check(r.result === 'parry', 'parry window edge: 0.26 s parries', r.result);
  r = await run('edge 0.36', { press: true, hold: true, before: 0.36 });
  check(r.result === 'block', 'parry window edge: 0.36 s blocks', r.result);
}

async function iframes() {
  console.log('\n[iframes] roll / backflip invulnerability');
  for (const kind of ['roll', 'backflip']) {
    await setup({ x: 0, z: 0, yaw: Math.PI, pose: 'rest' });
    if (kind === 'roll') await page.keyboard.down('KeyW');
    await tap('Space');
    let s = await step(1 / 60);
    if (kind === 'roll') await page.keyboard.up('KeyW');
    check(s.move === kind, `Space tap -> ${kind}`, s.move);
    s = await step(0.15);
    await T(`(T.giant.strike({ delay: 0, dmg: 25, kind: 'heavy', blockable: false, label: '${kind} mid' }), true)`);
    s = await step(1 / 60);
    let r = (await T('T.giant.results.slice()')).pop();
    check(r.result === false && r.hp1 === r.hp0, `${kind}: blow at t=${r.mt} passes through (i-frames)`, JSON.stringify(r));
    if (kind === 'roll') { await view('side'); await shot('roll_iframe_side'); await view('auto'); await shot('roll_iframe_auto'); }
    while ((await state()).mt >= 0 && (await state()).mt < 0.42) await step(1 / 60);
    await T(`(T.giant.strike({ delay: 0, dmg: 25, kind: 'heavy', blockable: false, label: '${kind} late' }), true)`);
    await step(1 / 60);
    r = (await T('T.giant.results.slice()')).pop();
    check(r.result === true && r.hp1 < r.hp0, `${kind}: blow after the i-frames (t=${r.mt}) lands`, JSON.stringify(r));
  }
  // rolling costs stamina; at zero stamina there is no roll
  await setup({ x: 0, z: 0, yaw: Math.PI, pose: 'rest' });
  await T('(T.monkey.st = 0, T.monkey.stDelay = 5, true)');
  await page.keyboard.down('KeyW'); await tap('Space'); const s = await step(1 / 60); await page.keyboard.up('KeyW');
  check(s.move !== 'roll', 'no stamina, no roll', String(s.move));
}

async function fan() {
  console.log('\n[fan] the banana-leaf fan: cone test, mana, gust');
  // pure cone geometry
  const g = await T(`(() => {
    const V = (x, y, z) => new T.THREE.Vector3(x, y, z), o = V(0, 1, 0), d = V(0, 0, 1), A = 34 * Math.PI / 180, R = 13;
    const s = (c, r = 0) => T.coneHitsSphere(o, d, R, A, c, r);
    return {
      ahead: s(V(0, 1, 6)), edgeIn: s(V(Math.tan(A) * 8 * 0.95, 1, 8)), edgeOut: s(V(Math.tan(A) * 8 * 1.15, 1, 8)),
      edgeOutFat: s(V(Math.tan(A) * 8 * 1.15, 1, 8), 1.0), behind: s(V(0, 1, -3)), tooFar: s(V(0, 1, 14.5)), farFat: s(V(0, 1, 14.5), 2),
      side: s(V(6, 1, 1)), capCross: T.coneHitsCapsule(o, d, R, A, { a: V(-20, 1, 9), b: V(20, 1, 9), r: 0.5 }),
      capBehind: T.coneHitsCapsule(o, d, R, A, { a: V(-5, 1, -2), b: V(5, 1, -2), r: 0.5 }),
    };
  })()`);
  check(g.ahead && g.edgeIn && !g.edgeOut && g.edgeOutFat && !g.behind && !g.tooFar && g.farFat && !g.side && g.capCross && !g.capBehind,
    'cone hit test (inside / edge / outside / behind / range / fat spheres / capsules)', JSON.stringify(g));
  // in play: facing the left hand on the ground; the right hand is 12 m to the side
  await setup({ x: 6.0, z: -4.5, yaw: Math.PI, pose: 'slamL' });
  const s0 = await state();
  await tap('KeyI');
  let s = await step(1 / 60);
  check(s.move === 'fan', 'I -> fan', s.move);
  s = await step(0.3); await view('side'); await shot('fan_windup_side'); await view('auto'); await shot('fan_windup_auto');
  s = await step(0.16); await view('auto'); await shot('fan_gust_auto'); await view('side'); await shot('fan_gust_side');
  s = await step(0.25); await view('auto'); await shot('fan_gust2_auto');
  const evs = await events();
  const fe = evs.find(e => e.type === 'fan');
  const fans = await T('T.giant.fans.splice(0)');
  const gusts = await T('T.arena.gusts.splice(0)');
  console.log('    fan parts', fe && fe.parts, 'boss.fanned', JSON.stringify(fans));
  check(!!fe, 'fan event fires at the release', evs.map(e => e.type).join(','));
  check(fe && fe.parts.includes('handL') && !fe.parts.includes('handR') && !fe.parts.includes('kneeR'), 'gust catches the hand ahead, not the parts outside the cone', fe && fe.parts.join(','));
  check(fans.length === 1 && fans[0].via === 'fanned' && Math.abs(fans[0].dir[1]) < 1e-6 && fans[0].range > 10, 'boss.fanned({ from, dir (horizontal), range, angle }) called once', JSON.stringify(fans[0]));
  check(gusts.length === 1, 'arena.fanGust called (put out fires)', String(gusts.length));
  const mpAfter = (await state()).mp;
  check(s0.mp - mpAfter > 25, 'fan costs mana', `${s0.mp} -> ${mpAfter}`);
  await step(0.6);
  await T('(T.monkey.mp = 5, true)');
  await tap('KeyI'); s = await step(1 / 60);
  const e2 = await events();
  check(s.move !== 'fan' && e2.some(e => e.type === 'fan-empty'), 'no mana: no fan', `${s.move} ${e2.map(e => e.type)}`);
}

async function execute() {
  console.log('\n[execute] 牵牛鼻子 on the bowed head');
  await setup({ x: 0, z: -9, yaw: Math.PI, pose: 'bow', settle: 1.0 });
  const can = await T('T.monkey.canExecute(T.giant)');
  check(can, 'canExecute when the head is down and near', String(can));
  await tap('KeyJ');
  let s = await step(1 / 60);
  check(s.move === 'critical' && s.inv, 'J -> critical, invulnerable', `${s.move} inv=${s.inv}`);
  for (const t of [0.3, 0.45, 0.7, 0.9, 0.96, 1.3, 1.8]) {
    while ((s = await state()).move === 'critical' && s.mt < t) await step(1 / 60);
    await view('auto'); await shot(`exec_${t}_auto`);
    if ([0.45, 0.9].includes(t)) { await view('side'); await shot(`exec_${t}_side`); await view('auto'); }
    if (t === 0.7) {
      const hand = await T(`(() => { const p = T.actor.bonePos('LeftHand', new T.THREE.Vector3()); return p.distanceTo(T.giant.noseRing()); })()`);
      check(hand < 0.35, 'left fist holds the nose ring', hand.toFixed(3) + ' m');
    }
  }
  while ((await state()).move === 'critical') await step(0.05);
  const crits = await T('T.giant.crits.slice()');
  const evs = await events();
  check(crits.length === 1 && crits[0].dmg >= 300, 'takeCritical once, heavy', JSON.stringify(crits));
  check(evs.some(e => e.type === 'critical'), 'critical event for main (hitstop / slow motion)', evs.map(e => e.type).join(','));
  check(!(await T('T.monkey.canExecute(T.giant)')), 'no second execution in the same bow', '');
  s = await state();
  check(s.baseY < 0.05 && !s.airborne, 'he drops back to the ground', JSON.stringify({ y: s.pos[1], baseY: s.baseY }));
}

async function runs() {
  console.log('\n[run] Space hold runs; J out of a run leaps');
  await setup({ x: 20, z: 30, yaw: Math.PI, pose: 'rest', fight: false });
  await page.keyboard.down('KeyW');
  let s = await step(0.6);
  const walk = s.speed;
  await page.keyboard.down('Space'); await sleep(320);
  s = await step(0.9);
  check(s.speed > 6, 'holding Space runs', `walk ${walk} -> run ${s.speed}`);
  await view('auto'); await shot('run_auto'); await view('side'); await shot('run_side'); await view('auto');
  check(s.move === null, 'held Space never rolls', String(s.move));
  await tap('KeyJ'); s = await step(1 / 60);
  check(s.move === 'runAttack', 'J out of a run -> running leap', s.move);
  s = await step(0.2); await view('side'); await shot('run_attack_side');
  check(s.pos[1] > 0.3, 'the leap leaves the ground', String(s.pos[1]));
  await page.keyboard.up('Space');
  s = await step(0.05);
  check(s.move === 'runAttack', 'releasing a held Space does not roll', String(s.move));
  await page.keyboard.up('KeyW');
  await step(1.0);
}

async function hazards() {
  console.log('\n[hazards] ledges, lava, colliders');
  // walk at the stone platform (1.2 m): he hops up
  await setup({ x: -11.5, z: 18, yaw: Math.PI, pose: 'rest', fight: false });
  await page.keyboard.down('KeyW');
  let s; for (let i = 0; i < 40; i++) { s = await step(0.05); if (s.baseY > 1.18) break; }     // (the hop eases up over 0.24 s)
  check(s.baseY > 1.15, 'walks / hops up onto a 1.2 m platform', 'baseY ' + s.baseY);
  for (let i = 0; i < 60; i++) { s = await step(0.05); if (s.pos[2] < 7) break; }
  await page.keyboard.up('KeyW');
  s = await step(1.0);
  check(s.baseY < 0.05 && !s.airborne, 'steps off the far edge and lands', 'baseY ' + s.baseY);
  // lava
  await setup({ x: 13, z: 21, yaw: Math.PI, pose: 'rest', fight: false });
  s = await step(1.0);
  const evs = await events();
  check(s.hp < 80 && evs.some(e => e.type === 'burn'), 'lava burns', `hp ${s.hp}`);
  // basalt pillar
  await setup({ x: 7, z: 19, yaw: Math.PI, pose: 'rest', fight: false });
  await page.keyboard.down('KeyW'); s = await step(1.5); await page.keyboard.up('KeyW');
  const d = Math.hypot(s.pos[0] - 7, s.pos[2] - 16);
  check(d >= 1.1 + 0.3, 'cannot walk through a pillar', d.toFixed(2));
  // the giant's limbs are solid
  // walking at it he stops against it or slides round it, never into it: his capsule stays outside the hand's
  await setup({ x: 6.1, z: -9, yaw: Math.PI, pose: 'slamL' });
  let worst = Infinity;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 30; i++) {
    s = await step(0.05);
    const gap = await T(`(() => { const z = T.giant.hurtZones().find(q => q.name === 'handL'), p = T.monkey.pos, V = T.THREE.Vector3;
      const a = new V(p.x, p.y + 0.25, p.z), b = new V(p.x, p.y + 1.35, p.z);
      let best = Infinity; for (let k = 0; k <= 20; k++) { const q = z.a.clone().lerp(z.b, k / 20); for (let j = 0; j <= 10; j++) { const m = a.clone().lerp(b, j / 10); best = Math.min(best, m.distanceTo(q)); } }
      return best - z.r - T.MONKEY_TUNING.radius; })()`);
    worst = Math.min(worst, gap);
  }
  await page.keyboard.up('KeyW');
  check(worst > -0.12, 'cannot walk into the hand on the ground', 'deepest overlap ' + worst.toFixed(3) + ' m, ended at z ' + s.pos[2]);
}

async function hurt() {
  console.log('\n[hurt] reactions and death');
  await setup({ x: 0, z: 0, yaw: Math.PI, pose: 'rest' });
  await T(`(T.giant.strike({ delay: 0, dmg: 10, kind: 'light', blockable: false, label: 'light' }), true)`);
  let s = await step(2 / 60);
  check(s.move === 'hurt', 'light blow: flinch', s.move);
  let evs = await events();
  check(evs.some(e => e.type === 'hurt' && e.hitstop > 0), 'hurt event with hitstop', '');
  await step(1.0);
  await T(`(T.giant.strike({ delay: 0, dmg: 20, kind: 'sweep', blockable: false, label: 'sweep' }), true)`);
  s = await step(0.4);
  check(s.move === 'knockdown' && s.inv, 'big blow: knocked down, invulnerable on the ground', `${s.move} inv=${s.inv}`);
  await view('side'); await shot('knockdown_side');
  for (let i = 0; i < 60 && (s = await state()).move === 'knockdown'; i++) await step(0.05);
  check(s.state === 'idle' || s.state === 'move', 'gets back up', s.state);
  await T('(T.monkey.hp = 5, true)');
  await T(`(T.giant.strike({ delay: 0, dmg: 30, kind: 'heavy', blockable: false, label: 'kill' }), true)`);
  s = await step(2.2);
  evs = await events();
  check(s.dead && evs.some(e => e.type === 'dead'), 'death: dead event', JSON.stringify(evs.map(e => e.type)));
  await view('side'); await shot('death_side'); await view('auto'); await shot('death_auto');
  await T('(T.monkey.god = true, true)');
  await setup({ x: 0, z: 0, yaw: Math.PI, pose: 'rest' });
  await T(`(T.giant.strike({ delay: 0, dmg: 500, kind: 'heavy', blockable: false }), true)`);
  s = await step(0.2);
  check(!s.dead && s.hp >= 1, 'god mode keeps 1 hp', String(s.hp));
  await T('(T.monkey.god = false, true)');
}

async function grab() {
  console.log("\n[grab] caught in the giant's fist, slammed down");
  await setup({ x: 0, z: -4, yaw: Math.PI, pose: 'rest' });
  await T(`(T._hand = new T.THREE.Vector3(0, 1.4, -6), T.monkey.grab(() => T._hand), true)`);
  let s = await step(0.3);
  check(s.state === 'held', 'grab -> held', s.state);
  await T('(T._hand.set(1, 9, -12), true)');
  s = await step(0.5);
  check(Math.abs(s.pos[1] - (9 - 0.85)) < 0.05, 'held: follows the fist', JSON.stringify(s.pos));
  await view('auto'); await shot('grab_held_auto');
  const r = await T(`T.monkey.takeHit({ dmg: 50, from: T.giant.pos, kind: 'heavy' })`);
  check(r === false, 'no other hits while held', String(r));
  const hp0 = s.hp;
  await T(`(T.monkey.release({ dmg: 30, from: T.giant.pos, slam: true }), true)`);
  for (let i = 0; i < 60 && (s = await state()).airborne; i++) await step(1 / 60);
  s = await step(0.1);
  check(!s.airborne && s.baseY < 0.05 && s.hp < hp0 - 20, 'slammed onto the ground: damage on landing', `hp ${hp0} -> ${s.hp}`);
  check(s.move === 'knockdown', 'and knocked down', String(s.move));
  // a roll dodges the grab
  await setup({ x: 0, z: -4, yaw: Math.PI, pose: 'rest' });
  await page.keyboard.down('KeyW'); await tap('Space'); await step(0.15); await page.keyboard.up('KeyW');
  const g2 = await T(`T.monkey.takeHit({ dmg: 10, from: T.giant.pos, kind: 'grab' })`);
  check(g2 === false, 'a roll slips the grab (i-frames)', String(g2));
}

async function camera() {
  console.log('\n[camera] AutoCam framing');
  const lowerThird = f => f.mid[1] < -0.05 && f.mid[1] > -0.85 && f.feet[1] > -1.0;
  const onScreen = p => p && Math.abs(p[0]) < 1.02 && Math.abs(p[1]) < 1.02 && p[2] < 1;
  // walking in: the giant asleep, a low looming shot
  await setup({ x: 0, z: 30, yaw: Math.PI, pose: 'rest' });
  await T('(T.giant.dormant = true, true)');
  await page.keyboard.down('KeyW'); await step(2.0); await page.keyboard.up('KeyW');
  let f = await T('T.framing()');
  await shot('cam_approach');
  console.log('    approach', JSON.stringify(f));
  check(f.part === 'giant' && lowerThird(f) && f.pitch > 0.1, 'approach: monkey low in frame, camera looks up at the giant', JSON.stringify(f));
  await T('(T.giant.dormant = false, true)');
  // near the hand on the ground: the hand is the focus (his lock target)
  await setup({ x: 5.4, z: -6.5, yaw: Math.PI, pose: 'slamL', settle: 1.5 });
  f = await T('T.framing()');
  await shot('cam_hand');
  console.log('    hand', JSON.stringify(f));
  check(f.part === 'handL' && lowerThird(f) && onScreen(f.focus), 'fight: frames the monkey and the hand he works on', JSON.stringify(f));
  // the boss hints a high threat (his head): pull back / tilt up to fit both
  const d0 = f.dist;
  await T(`(T.giant.camHint = { focus: 'head', pull: 0 }, true)`);
  await step(2.0);
  f = await T('T.framing()');
  await shot('cam_head_threat');
  console.log('    head', JSON.stringify(f));
  check(f.part === 'head' && onScreen(f.focus) && f.feet[1] > -1.0, 'threat high above: both still in frame', JSON.stringify(f));
  check(f.dist > d0 + 1.5 || f.pitch > 0.3, 'pulls back / tilts up for the 20 m head', `dist ${d0} -> ${f.dist}, pitch ${f.pitch}`);
  // a big attack: pull back
  await T(`(T.giant.camHint = { focus: 'handR', pull: 1 }, true)`);
  await step(1.5);
  const f2 = await T('T.framing()');
  await shot('cam_big_attack');
  check(f2.part === 'handR' && f2.dist > f.dist - 0.5 && f2.fov > 50, 'big attack: pulls back and widens', JSON.stringify(f2));
  await T(`(T.giant.camHint = null, true)`);
  // W walks toward the focus (camera-relative movement)
  await setup({ x: 0, z: 2, yaw: 0.6, pose: 'slamL', settle: 1.5 });
  const a = await state();
  await page.keyboard.down('KeyW'); const b = await step(0.8); await page.keyboard.up('KeyW');
  const lock = await T(`(() => { const t = T.giant.lockTargets().find(q => q.part === T.cam.focus.part); return t.pos.toArray(); })()`);
  const before = Math.hypot(a.pos[0] - lock[0], a.pos[2] - lock[2]), after = Math.hypot(b.pos[0] - lock[0], b.pos[2] - lock[2]);
  check(after < before - 2, 'W walks toward what the camera frames', `${before.toFixed(1)} -> ${after.toFixed(1)}`);
  // behind a pillar: the camera does not go through it
  await setup({ x: 7, z: 13.2, yaw: Math.PI, pose: 'rest', settle: 1.5 });
  const cp = await T('T.cam.cam.position.toArray()');
  const dc = Math.hypot(cp[0] - 7, cp[2] - 16);
  await shot('cam_pillar');
  check(dc > 1.1 || cp[2] < 16, 'camera stays out of the pillar', dc.toFixed(2));
  // the chase camera with no enemy follows behind
  await setup({ x: 20, z: 20, yaw: Math.PI, pose: 'rest', fight: false });
  await page.keyboard.down('KeyD'); await step(2.5); await page.keyboard.up('KeyD');
  const yaw = await T('[T.cam.yaw, T.monkey.yaw]');
  await page.keyboard.down('KeyW'); await step(1.6); await page.keyboard.up('KeyW');
  const yaw2 = await T('[T.cam.yaw, T.monkey.yaw]');
  const gap = Math.abs(Math.atan2(Math.sin(yaw2[0] - yaw2[1]), Math.cos(yaw2[0] - yaw2[1])));
  check(gap < 0.5, 'chase camera swings in behind a running monkey', `cam ${yaw2[0].toFixed(2)} monkey ${yaw2[1].toFixed(2)} (was ${yaw[0].toFixed(2)})`);
}

async function perf() {
  console.log('\n[perf] frame cost at 1280x720 (GPU-synced), and the real-time loop');
  await setup({ x: 5.6, z: -7.2, yaw: Math.PI, pose: 'slamL' });
  // keep him busy: a combo while measuring
  await T('(T.monkey.god = true, true)');
  const p = await T(`(() => { const r = []; for (let i = 0; i < 4; i++) { T.input.press('light'); r.push(T.perf(60)); } return r; })()`);
  const upd = p.reduce((a, b) => a + b.updateMs, 0) / p.length, frame = p.reduce((a, b) => a + b.frameMs, 0) / p.length;
  console.log('    stepped', JSON.stringify(p));
  check(frame < 16.7, 'frame (update + render, GPU-synced) under 16.7 ms', frame.toFixed(2) + ' ms');
  check(upd < 2.5, 'monkey + camera + stand-in update under 2.5 ms', upd.toFixed(3) + ' ms');
  // real-time loop
  await T('(T.paused = false, true)');
  await page.keyboard.down('KeyJ'); await sleep(200); await page.keyboard.up('KeyJ');
  await sleep(3000);
  const fps = await T('T.fps');
  await T('(T.paused = true, T.monkey.god = false, true)');
  console.log('    real-time fps', fps.toFixed(1));
  check(fps > 50, 'real-time loop ~60 fps', fps.toFixed(1));
}

/** Bake the procedural 金箍棒 (monkey.js createStaff: one rod, gold bands) into assets/models/niumo_staff.glb, so any
 * loader of the file (main.js's own fallback path, ?staff=glb here) gets the same single rod, not Tripo's two bars. */
async function bakestaff() {
  console.log('\n[bakestaff] procedural staff -> assets/models/niumo_staff.glb');
  await open('mode=sheet&move=light1&times=0&views=side');
  const b64 = await page.evaluate(async () => {
    const { createStaff } = await import('../src/niumo/monkey.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const holder = createStaff();
    const rod = holder.children[0];
    rod.position.set(0, 0, 0);                 // butt at the origin, +Y to the head end
    rod.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
    const buf = await new GLTFExporter().parseAsync(rod, { binary: true, maxTextureSize: 512 });
    let s = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const file = path.join(HERE, '../assets/models/niumo_staff.glb');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  check(fs.statSync(file).size > 10000, 'niumo_staff.glb written', (fs.statSync(file).size / 1e3).toFixed(0) + ' kB');
}

// ====================================================================================================== run

try {
  if (want.has('bakestaff')) await bakestaff();
  if (want.has('sheets')) await sheets();
  const scen = { moves, combo, charge, parry, iframes, fan, execute, run: runs, hazards, hurt, grab, camera, perf };
  const need = Object.keys(scen).filter(k => want.has(k));
  if (need.length) {
    await open('paused');
    const info = await T('({ model: T.model, staffGlb: T.staffGlb })');
    console.log('model', info.model, 'staff', info.staffGlb ? 'niumo_staff.glb' : 'procedural');
    for (const k of need) await scen[k]();
  }
} catch (e) {
  fails.push('exception: ' + (e && e.stack || e));
  console.error(e);
}
if (console404 > expected404) errors.push(`${console404 - expected404} unexpected 404 console error(s)`);
if (expected404) console.log(`(${expected404} expected 404 probe(s) for art still in production: niumo_staff.glb / niumo_monkey.glb)`);
if (errors.length) { console.log('\nconsole / page errors:'); for (const e of errors) console.log('  ' + e); }
check(errors.length === 0, 'no console errors or warnings', errors.length + '');
console.log(`\n${passes.length} passed, ${fails.length} failed`);
await browser.close();
server.close();
process.exit(fails.length ? 1 : 0);
