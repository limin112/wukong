#!/usr/bin/env node
// Record the 火焰山 · 牛魔 demo (?demo) to a webm with the game's sound — no ffmpeg needed: the page records itself.
//
//   node tools/record_demo.mjs [--seconds 120] [--out test/out/demo/fight_demo.webm] [--query demo&skipmv]
//                              [--until-end] [--size 1280x720] [--mbps 4] [--stills 0] [--game <game folder>]
//
// How: headless Chrome (puppeteer-core from node_modules) opens index.html on a private port (never 5173). The
// video is the whole tab — the WebGL canvas *and* the HTML HUD (health bars, the boss bar, cards, the 演示 tag) — via
// getDisplayMedia on the current tab (auto-accepted); if the browser refuses tab capture, it falls back to the canvas
// alone (canvas.captureStream(30), no HUD). The sound is tapped from the game's own mix (the AudioSystem's master
// output -> a MediaStreamDestination), so it is exactly what a player hears. MediaRecorder (VP9/VP8 + Opus) hands its
// chunks to node every second; they are appended to the file as they come.
// --until-end keeps recording until the ending card (or --seconds as a cap). --stills N also saves N screenshots
// spread over the recording (each costs a frame or two of hitch, so the default is none).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv0 = process.argv;
const gi = argv0.indexOf('--game');
// --game <dir>: serve another copy of the game folder (e.g. one holding other model files)
const GAME = gi > 0 ? path.resolve(argv0[gi + 1]) : ROOT;
const require = createRequire(import.meta.url);
const puppeteer = require(path.join(ROOT, 'node_modules/puppeteer-core'));
const { startServer } = await import(path.join(GAME, 'serve.mjs'));

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SECONDS = +arg('seconds', 120);
const UNTIL_END = !!arg('until-end', false);
const OUT = path.resolve(ROOT, arg('out', 'test/out/demo/fight_demo.webm'));
const QUERY = String(arg('query', 'demo&skipmv'));
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number);
const MBPS = +arg('mbps', 4);
const STILLS = +arg('stills', 0);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const server = await startServer(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 1800000,
  defaultViewport: { width: W, height: H },
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required',
    `--window-size=${W},${H}`, '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=火焰山',
    '--enable-usermedia-screen-capturing', '--allow-http-screen-capture'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.on('pageerror', e => console.log('pageerror:', String(e)));
page.on('console', m => { if (m.type() === 'error') console.log('console error:', m.text()); });

const out = fs.openSync(OUT, 'w');
let bytes = 0;
await page.exposeFunction('__recChunk', b64 => { const b = Buffer.from(b64, 'base64'); fs.writeSync(out, b); bytes += b.length; });
let finished = null;
const done = new Promise(r => { finished = r; });
await page.exposeFunction('__recDone', () => finished());

const url = `http://127.0.0.1:${port}/index.html?${QUERY}${QUERY.includes('autostart') ? '' : '&autostart'}`;
console.log('recording', url, '->', path.relative(ROOT, OUT));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true || window.__error', { timeout: 120000, polling: 250 });
const err = await page.evaluate('window.__error || null');
if (err) throw new Error('boot failed: ' + err);
// the sound has to exist before it can be tapped: wait for the unlocked mix
await page.waitForFunction('window.__niumo && window.__niumo.audio && window.__niumo.audio._eng', { timeout: 30000, polling: 100 });
await page.bringToFront();

const how = await page.evaluate(async ({ mbps }) => {
  const G = window.__niumo, eng = G.audio._eng, ctx = eng.ctx;
  try { await ctx.resume(); } catch { /* already running */ }
  const dest = ctx.createMediaStreamDestination();
  (eng.output || eng.masterVol).connect(dest);                    // the game's master mix, post limiter and volume
  let video = null, how = 'tab';
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: innerWidth, height: innerHeight }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' });
    video = s.getVideoTracks()[0];
  } catch (e) {
    how = 'canvas (no HUD: ' + (e && e.message) + ')';
    video = document.getElementById('game').captureStream(30).getVideoTracks()[0];
  }
  const stream = new MediaStream([video, ...dest.stream.getAudioTracks()]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: mbps * 1e6, audioBitsPerSecond: 160000 });
  let pending = Promise.resolve();
  rec.ondataavailable = e => {
    if (!e.data || !e.data.size) return;
    pending = pending.then(async () => {
      const buf = new Uint8Array(await e.data.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      await window.__recChunk(btoa(s));
    });
  };
  rec.onstop = () => { pending.then(() => window.__recDone()); };
  rec.start(1000);
  window.__rec = rec;
  return how + ' / ' + mime;
}, { mbps: MBPS });
console.log('capture:', how);

const t0 = Date.now();
const stillsDir = path.join(path.dirname(OUT), 'stills');
if (STILLS) fs.mkdirSync(stillsDir, { recursive: true });
let stillN = 0, lastLog = 0;
while (true) {
  await new Promise(r => setTimeout(r, 500));
  const t = (Date.now() - t0) / 1000;
  const s = await page.evaluate(() => { const G = window.__niumo; return { state: G.state, bull: Math.round(G.bull.hp), phase: G.bull.phase, monkey: Math.round(G.monkey.hp), card: document.getElementById('card').classList.contains('on') && document.getElementById('card').textContent }; });
  if (t - lastLog > 10) { lastLog = t; console.log(`  ${t.toFixed(0)} s  ${s.state}  bull ${s.bull} p${s.phase}  monkey ${s.monkey}  ${(bytes / 1e6).toFixed(1)} MB`); }
  if (STILLS && stillN < STILLS && t > (stillN + 0.5) * (SECONDS / STILLS)) {
    await page.screenshot({ path: path.join(stillsDir, `still_${String(stillN).padStart(2, '0')}_${s.state}.png`) });
    stillN++;
  }
  if (t >= SECONDS) break;
  if (UNTIL_END && s.state === 'ending' && s.card && s.card.includes('熄')) { await new Promise(r => setTimeout(r, 5000)); break; }
}
await page.evaluate(() => window.__rec.stop());
await done;
fs.closeSync(out);
console.log(`saved ${path.relative(ROOT, OUT)} (${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
await browser.close();
server.close();
