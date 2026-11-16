#!/usr/bin/env node
// Lighting / sky look-dev shots:  node tools/shot.mjs [outDir] [names,comma] [query-extra]
// Boots the fight (?autostart&skipmv&debug&god), places debug cameras, switches arena phases, saves PNGs.
import fs from 'node:fs';
import { startServer } from '../serve.mjs';
const require = (await import('node:module')).createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const [outDir = 'test/out/look', only = '', extra = ''] = process.argv.slice(2);
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
page.on('pageerror', e => errors.push('pageerror: ' + e));
page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/favicon|fonts\.g/.test(m.text() + (m.location()?.url || ''))) errors.push(m.type() + ': ' + m.text()); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const G = expr => page.evaluate(`(() => { const G = window.__niumo; return ${expr}; })()`);
await page.goto(`http://127.0.0.1:${port}/index.html?autostart&skipmv&debug&god${extra ? '&' + extra : ''}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true || window.__error', { timeout: 120000, polling: 250 });
await page.waitForFunction('window.__niumo.state === "fight"', { timeout: 30000 });
// freeze the bull's AI so the frames are comparable
await G('(G.bull.autoAttack = false, G.bull.cooldown = 1e9, true)');
const cam = c => G(`(G.debugCam = ${c ? `{ pos: new (G.camera.position.constructor)(${c.pos}), look: new (G.camera.position.constructor)(${c.look}), fov: ${c.fov || 50} }` : 'null'}, true)`);
const SHOTS = [
  { name: 'p1_fight', phase: 1 },                                                         // the auto camera
  { name: 'p1_low', phase: 1, cam: { pos: '3, 0.7, 10', look: '-2, 14, -30', fov: 55 } },  // worm's eye up at him
  { name: 'p1_wide', phase: 1, cam: { pos: '14, 5, 46', look: '-6, 16, -30', fov: 62 } },  // wide: the sky
  { name: 'p1_sun', phase: 1, cam: { pos: '10, 3, 20', look: '-60, 22, -70', fov: 60 } },  // toward the sun
  { name: 'p1_face', phase: 1, cam: { pos: '6, 12, 6', look: '0, 17, -28', fov: 30 } },    // his face and chest
  { name: 'p1_rev', phase: 1, cam: { pos: '-3, 1.6, -6', look: '2, 1.2, 8', fov: 45 } },   // back toward the monkey (front-lit side)
  { name: 'p2_fight', phase: 2, wait: 9000 },
  { name: 'p2_wide', phase: 2, cam: { pos: '14, 5, 46', look: '-6, 20, -30', fov: 62 } },
  { name: 'p3_wide', phase: 3, wait: 6000, cam: { pos: '14, 5, 46', look: '-6, 16, -30', fov: 62 } },
  { name: 'p3_fight', phase: 3 },
];
let phase = 1;
for (const s of SHOTS) {
  if (only && !only.split(',').some(o => s.name.startsWith(o))) continue;
  if (s.phase !== phase) { phase = s.phase; await G(`(G.arena.setPhase(${phase}), true)`); await sleep(s.wait || 5000); }
  await cam(s.cam || null);
  await sleep(s.cam ? 500 : 1500);
  await G('(G.paused = true, true)'); await sleep(120);
  await page.screenshot({ path: `${outDir}/${s.name}.png` });
  await G('(G.paused = false, true)');
  console.log('shot', s.name, JSON.stringify(await G('({ fps: Math.round(G.fps), ms: +G.frameMs.toFixed(1), exp: +G.renderer.toneMappingExposure.toFixed(2) })')));
}
if (errors.length) console.log('ERRORS\n' + [...new Set(errors)].join('\n'));
await browser.close(); server.close();
