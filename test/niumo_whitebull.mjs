#!/usr/bin/env node
// White bull test: node test/niumo_whitebull.mjs
// Poses the procedural gallop (bull.js gallopPose) at 8 phases from the side and saves test/out/niumo/whitebull/gallop.png
// (and one frame per phase); checks the hooves stay near the ground through the stride. Fails on console errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startServer } from '../serve.mjs';

const require = (await import('node:module')).createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out/niumo/whitebull');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(0);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [], fails = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (['error', 'warning', 'warn'].includes(m.type()) && !/favicon/.test(m.text())) errors.push(m.text()); });
await page.setViewport({ width: 800, height: 500 });
await page.goto(`http://127.0.0.1:${server.address().port}/test/niumo_whitebull.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready || window.__error', { timeout: 60000 });
const err = await page.evaluate('window.__error || null');
if (err) { console.log('boot failed:', err); process.exit(1); }
const L = await page.evaluate('window.__W.L');
await page.evaluate(() => window.__W.pose(0, 0, 'side'));
const hd = await page.evaluate('window.__W.heading()');
const hdOk = Math.abs(hd) < 4;
console.log((hdOk ? '  ok   ' : '  FAIL ') + `he faces straight down +Z, the way he runs (tail -> head ${hd.toFixed(1)}°)`);
if (!hdOk) fails.push('heading');
await page.evaluate('window.__W.top()'); await page.screenshot({ path: path.join(OUT, 'top.png') });
await page.evaluate(() => window.__W.pose(0, 1, 'front')); await page.screenshot({ path: path.join(OUT, 'front.png') });
const N = 8, files = [];
let lowMax = 0;
for (let i = 0; i < N; i++) {
  const ph = i / N * Math.PI * 2;
  await page.evaluate(p => window.__W.pose(p, 1, 'side'), ph);
  const h = await page.evaluate('window.__W.hooves()');
  lowMax = Math.max(lowMax, Math.min(...h));
  console.log(`  phase ${i}/${N}: hooves ${h.join(' ')}`);
  const f = path.join(OUT, `p${i}.png`); files.push(f);
  await page.screenshot({ path: f });
}
const ok = lowMax < L * 0.08;
console.log((ok ? '  ok   ' : '  FAIL ') + `a hoof on (or near) the ground at every phase (worst lowest hoof ${lowMax.toFixed(1)} m, L ${L.toFixed(0)} m)`);
if (!ok) fails.push('hooves');
try {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex',
    files.map((_, i) => `[${i}]scale=400:-1[s${i}];`).join('') + '[s0][s1][s2][s3]hstack=4[t];[s4][s5][s6][s7]hstack=4[u];[t][u]vstack', path.join(OUT, 'gallop.png')]);
  console.log('  sheet', path.join(OUT, 'gallop.png'));
} catch { console.log('  (no ffmpeg: frames only)'); }
console.log('console errors:', errors.length ? errors : 'none');
await browser.close(); server.close();
process.exit(errors.length || fails.length ? 1 : 0);
