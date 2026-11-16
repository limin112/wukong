#!/usr/bin/env node
// Screenshots of the game at chosen moments, for judging the cinematics and the look by eye.
//
//   node tools/cine_shot.mjs <outDir> <query> <step> [<step> ...]
//
// query: the page's URL flags, e.g. "autostart&debug&god" (the opening) or "autostart&skipmv&debug&god" (the fight).
// steps, run in order:
//   wait:<ms>              real time
//   state:<name>           wait until G.state === name
//   mv:<seconds>           seek the opening cinematic to that time (OpeningMV.seek) and hold there
//   beat:<name>+<seconds>  seek the opening to that long after one of its beats began (b1 m1 … roar raise strike skid settle)
//   cut:<seconds>          seek the running cutscene (G.cut) to that time
//   js:<expression>        evaluate in the page (G = window.__niumo)
//   shot:<name>            freeze the frame and save <outDir>/<name>.png
//   cam:x,y,z,lx,ly,lz,fov a fixed debug camera (cam:off removes it)
//   key:<code> / hold:<code> / release:<code>   keyboard (puppeteer key names: Space, KeyD, KeyJ ...)
// Uses a random port and the same Chrome flags as the smoke test.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer } from '../serve.mjs';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const [outDir, query = '', ...steps] = process.argv.slice(2);
if (!outDir) { console.error('usage: node tools/cine_shot.mjs <outDir> <query> <step>...'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);

const server = await startServer(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text() + (m.location()?.url || ''))) errors.push('console: ' + m.text()); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const G = expr => page.evaluate(`(() => { const G = window.__niumo; return ${expr}; })()`);

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${port}/index.html${query ? '?' + query : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || window.__error', { timeout: 120000, polling: 250 });
  const err = await page.evaluate('window.__error || null');
  if (err) throw new Error('boot failed: ' + err);
  for (const step of steps) {
    const i = step.indexOf(':'), op = i < 0 ? step : step.slice(0, i), arg = i < 0 ? '' : step.slice(i + 1);
    if (op === 'wait') await sleep(+arg);
    else if (op === 'state') await page.waitForFunction(s => window.__niumo && window.__niumo.state === s, { timeout: 120000, polling: 50 }, arg);
    else if (op === 'mv') { await G(`(G.paused = false, G.mv && G.mv.seek(${+arg}), true)`); await sleep(120); }
    else if (op === 'beat') { const [n, o = '0'] = arg.split('+'); await G(`(G.paused = false, G.mv && G.mv.seekBeat(${JSON.stringify(n)}, ${+o}), true)`); await sleep(120); }
    else if (op === 'cut') { await G(`(G.paused = false, G.cut && G.cut.seek && G.cut.seek(${+arg}), true)`); await sleep(120); }
    else if (op === 'js') { const r = await G(arg); if (r !== undefined && r !== true) console.log('  js ->', JSON.stringify(r)); }
    else if (op === 'cam') {
      if (arg === 'off') await G('(G.debugCam = null, true)');
      else { const [x, y, z, lx, ly, lz, fov] = arg.split(',').map(Number); await G(`(() => { const V = G.camera.position.constructor; G.debugCam = { pos: new V(${x}, ${y}, ${z}), look: new V(${lx}, ${ly}, ${lz}), fov: ${fov || 45} }; return true; })()`); await sleep(80); }
    } else if (op === 'key') await page.keyboard.press(arg);
    else if (op === 'hold') await page.keyboard.down(arg);
    else if (op === 'release') await page.keyboard.up(arg);
    else if (op === 'shot') {
      await G('(G.paused = true, true)'); await sleep(110);
      await page.screenshot({ path: `${outDir}/${arg}.png` });
      await G('(G.paused = false, true)');
      console.log('  shot', `${outDir}/${arg}.png`);
    } else throw new Error('unknown step ' + step);
  }
} catch (e) { failed = true; console.error(String(e && e.stack || e)); }
if (errors.length) { console.log('page errors:'); for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e); }
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
