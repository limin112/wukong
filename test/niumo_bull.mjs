#!/usr/bin/env node
// 牛魔王 test bench driver:  node test/niumo_bull.mjs [scenario ...]
//   pose     seated idle (asleep / awake) from several angles
//   attacks  every phase-one attack, key frames from the player's eyes and from the side, hit checks
//   weak     weak points: crack glow, break, doubled over, 牵牛鼻子 window, critical
//   phase2   山崩 transition, then every standing attack, the kneel, death
//   perf     frame time at 1280x720 while he breathes fire
//   all      everything
// Screenshots: test/out/niumo/bull/. Fails on any console error / warning (except the 404 probe for a missing model).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../serve.mjs';

const require = (await import('node:module')).createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out/niumo/bull');
fs.mkdirSync(OUT, { recursive: true });
let scenarios = process.argv.slice(2);
if (!scenarios.length || scenarios.includes('all')) scenarios = ['pose', 'attacks', 'weak', 'phase2', 'perf'];
const W = 1280, H = 720;

const server = await startServer(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const errors = [], failures = [];
const page = await browser.newPage();
const err = msg => { errors.push(msg); console.log('  PAGE', msg); };
page.on('pageerror', e => err('pageerror: ' + String(e && e.stack || e)));
page.on('console', m => {
  const t = m.text();
  if (['error', 'warning', 'warn'].includes(m.type()) && !/favicon/.test(t) && !(/404/.test(t) && /Failed to load resource/.test(t))) err(m.type() + ': ' + t);
});
page.on('requestfailed', r => { if (!/niumo_bull\.glb/.test(r.url())) errors.push('requestfailed: ' + r.url()); });
await page.setViewport({ width: W, height: H });

const E = (expr, ...args) => page.evaluate(expr, ...args);
const BT = fn => page.evaluate(`(() => { const bt = window.__bt, bull = bt.bull, player = bt.player, THREE = bt.THREE; ${fn} })()`);
const step = (sec, dt = 1 / 60) => E((s, d) => window.__bt.step(s, d), sec, dt);
const shot = async (name, view, look) => {
  await E((v, l) => { window.__bt.setView(v, l); window.__bt.render(); }, view, look || null);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  shot', name);
};
const check = (ok, msg) => { if (!ok) { failures.push(msg); console.log('  FAIL', msg); } else console.log('  ok  ', msg); };
/** Step until the bull's move reaches time t (or the attack ends). */
const until = async (t, dt = 1 / 60) => BT(`
  let n = 0; while (n++ < 2000) { const mv = bull.a.move; if (!mv || mv.t >= ${t}) break; bt.tick(${dt}); }
  return bt.status();`);

async function open() {
  await page.goto(`http://127.0.0.1:${port}/test/niumo_bull.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || window.__error', { timeout: 120000, polling: 200 });
  const e = await E('window.__error || null');
  if (e) throw new Error('bench failed to boot: ' + e);
}
async function fresh({ wake = true, px = 0, pz = 10 } = {}) {
  await BT(`bull.reset(); player.hits.length = 0; player.dodged.length = 0; player.iframes = false; player.guard = null; player.pos.set(${px}, 0, ${pz});
    bt.arena.colliders.length = 3; ${wake ? 'bull.wake();' : ''} bull.autoAttack = false; bull.cooldown = 1e9; bt.step(${wake ? 2.5 : 0.2}); return true;`);
}

try { await open(); } catch (e) { console.log(String(e)); console.log('console errors:', errors); await browser.close(); server.close(); process.exit(1); }
const info = await BT(`return { placeholder: bull.placeholder, url: bt.char.url, legLen: bull.legLen, armLen: bull.armLen, headSize: bull.headSize, hand: bull.hand.Left.len, bindToMeters: bull.bindToMeters, clips: Object.keys(bt.char.clips) };`);
console.log('bull:', JSON.stringify(info));

try {
  // -------------------------------------------------------------------------------------------- pose
  if (scenarios.includes('pose')) {
    console.log('[pose]');
    await fresh({ wake: false });
    await shot('pose_sleep_front', 'front');
    await BT(`bull.wake(); bt.step(3); return true;`);
    await shot('pose_seat_front', 'front');
    await shot('pose_seat_side', 'side');
    await shot('pose_seat_sideL', 'sideL');
    await shot('pose_seat_eye', 'eye');
    await BT(`player.pos.set(-14, 0, -12); bt.step(1); return true;`);
    await shot('pose_seat_knee_eye', 'eye', [-8, 4, -24]);
    await shot('pose_seat_close', 'close', { pos: [30, 9, -6], look: [0, 8, -26], fov: 50 });
    const b = await E(() => window.__bt.bones(['Hips', 'Head', 'HeadTop_End', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'LeftArm', 'RightArm']));
    console.log('  bones', JSON.stringify(b));
    check(b.HeadTop_End[1] > 18 && b.HeadTop_End[1] < 27, `seated height ~22 m (head top ${b.HeadTop_End[1]})`);
    check(b.LeftLeg[1] < 7 && b.RightLeg[1] < 7, `knees low enough to reach (${b.LeftLeg[1]}, ${b.RightLeg[1]})`);
  }
} catch (e) {
  failures.push('exception: ' + (e.stack || e));
  console.log(e);
}

console.log('\nconsole errors:', errors.length ? errors : 'none');
console.log('failures:', failures.length ? failures : 'none');
await browser.close(); server.close();
process.exit(errors.length || failures.length ? 1 : 0);
