#!/usr/bin/env node
// Audio verification (we cannot listen, so we measure).
//
//   node test/audio_check.mjs [--only sfx|music|realtime|calibrate|niumo] [--name hit_flesh] [--no-wav]
//                             [--baseline <dir of earlier WAVs>] [--no-spectro]
//
// 1. Renders every SFX and ~20 s of each music state with OfflineAudioContext in headless
//    Chrome, checks NaN/Inf, peak <= 0.99, RMS range, duration, and writes 16-bit WAV previews
//    to test/audio_preview/.
// 2. Extra renders: phase1->phase2 crossfade, phase1->defeat cut, ducking, spatial pan/distance,
//    per-call ±5% variation, limiter calibration.
// 3. Smoke-tests the realtime path (AudioContext, timer scheduler, every SFX, every music state,
//    voice limits, node cleanup, mp3-override streaming) and fails on console errors.
// 4. Flame Mountain (niumo_*): the same checks in the caldera space plus peaks < -1 dBFS, integrated
//    loudness (BS.1770 LUFS), the opening's per-second envelope against its cue sheet, phase1 -> phase2
//    landing on the same beat grid (drums-only dry render, onset times), a realtime niumo pass (voices
//    released, fire_breath stop(), main-thread cost of update()), buffer generation cost, spectrograms
//    in test/out/niumo/audio/, and (--baseline) a regression diff of every cathedral render.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUPPETEER = path.resolve(HERE, '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(HERE, 'audio_preview');
const SPECTRO_OUT = path.join(HERE, 'out/niumo/audio');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('only');
const NAME = opt('name');
const BASELINE = opt('baseline');
const WAV = !args.includes('--no-wav');
const SPECTRO = !args.includes('--no-spectro');
const want = (section) => !ONLY || ONLY === section;

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);

const CATHEDRAL_SFX = [
  'swing_light', 'swing_heavy', 'hit_flesh', 'hit_heavy', 'player_hurt', 'roll', 'step_water',
  'boss_step', 'boss_swing', 'boss_slam', 'sword_glint', 'sword_fly', 'sword_impact', 'pillar_charge',
  'pillar_blast', 'heal', 'lockon', 'ui', 'wax_crack', 'sword_draw', 'phase_shift', 'stagger',
  'boss_death', 'player_death', 'bell', 'block', 'parry', 'critical', 'heartbeat',
];
const NIUMO_SFX = [
  'staff_swing', 'staff_hit', 'staff_hit_heavy', 'bull_roar', 'bull_stomp', 'bull_slam', 'fire_breath',
  'fan_wind', 'lava_burst', 'rock_crack', 'rain',
];
const SFX_NAMES = [...CATHEDRAL_SFX, ...NIUMO_SFX];
const IS_NIUMO_SFX = new Set(NIUMO_SFX);

const SWELLS = { pillar_charge: 0.7, phase_shift: 1.4, rain: 0.5 };
const NIUMO_PEAK = 0.891; // -1 dBFS

// RMS windows are dBFS of the whole render; "active" = from onset to the last 10 ms window within 35 dB of the loudest.
const MUSIC = [
  { state: 'hymn', seconds: 20, rms: [-40, -16], alive: true },
  { state: 'tension', seconds: 20, rms: [-60, -28], alive: true },
  { state: 'phase1', seconds: 20, rms: [-30, -12], alive: true },
  { state: 'phase2', seconds: 20, rms: [-28, -10], alive: true },
  { state: 'finale', seconds: 20, rms: [-28, -10], alive: true },
  { state: 'opening', seconds: 58, rms: [-44, -16], fadesOut: true },
  { state: 'victory', seconds: 26, rms: [-42, -16], fadesOut: true },
  { state: 'defeat', seconds: 14, rms: [-50, -16], silentEnd: true },
  // Flame Mountain: phase1/phase2 render one full 24-bar loop, the ending one 48 s cycle
  { state: 'niumo_opening', seconds: 58, rms: [-44, -18], fadesOut: true, niumo: true },
  { state: 'niumo_ambient', seconds: 30, rms: [-58, -28], alive: true, niumo: true },
  { state: 'niumo_phase1', seconds: 86, rms: [-32, -15], alive: true, niumo: true },
  { state: 'niumo_phase2', seconds: 86, rms: [-28, -12], alive: true, niumo: true },
  { state: 'niumo_ending', seconds: 50, rms: [-50, -26], alive: true, niumo: true },
  { state: 'niumo_defeat', seconds: 14, rms: [-55, -18], silentEnd: true, niumo: true },
];
const TRANSITIONS = [
  { name: 'phase1_to_phase2', state: 'phase1', seconds: 22, script: [[10, 'setMusic', 'phase2', { fade: 3 }]], segs: [[6, 9.5], [16, 21]] },
  { name: 'phase2_to_finale', state: 'phase2', seconds: 22, script: [[10, 'setMusic', 'finale', { fade: 1.5 }]], segs: [[6, 9.5], [16, 21]] },
  { name: 'phase1_to_defeat', state: 'phase1', seconds: 16, script: [[5, 'setMusic', 'defeat', { fade: 2 }]], segs: [[4.2, 4.95], [5.45, 5.95], [13, 16]] },
  { name: 'phase1_duck', state: 'phase1', seconds: 12, script: [[6, 'duck', 0.7, 2]], segs: [[4.5, 5.9], [6.15, 6.75]], wav: false },
  { name: 'niumo_phase1_to_phase2', state: 'niumo_phase1', seconds: 40, script: [[30, 'setMusic', 'niumo_phase2', { fade: 0.6 }]], segs: [[22, 29.5], [32, 39.5]], niumo: true },
  { name: 'niumo_phase1_to_defeat', state: 'niumo_phase1', seconds: 16, script: [[5, 'setMusic', 'niumo_defeat', { fade: 2 }]], segs: [[4.2, 4.95], [5.45, 5.95], [13, 16]], niumo: true },
  { name: 'niumo_phase2_to_ending', state: 'niumo_phase2', seconds: 30, script: [[8, 'setMusic', 'niumo_ending', { fade: 4 }]], segs: [[3, 7.9], [20, 29]], niumo: true },
];

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-inf');
const f3 = (x) => x.toFixed(3);
const rows = [];
const failures = [];
const fail = (name, msg) => failures.push(`${name}: ${msg}`);
const niumoRenders = new Map(); // name -> decoded PCM (for loudness, envelopes, spectrograms)
let CUES = null; // NIUMO_CUES, read from the page

function writeWav(file, b64) {
  if (!WAV || !b64) return;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, 'base64'));
}

function basicChecks(name, r, expectSeconds) {
  if (r.nan) fail(name, `${r.nan} NaN/Inf samples`);
  if (r.peak > 0.99) fail(name, `peak ${f3(r.peak)} > 0.99`);
  if (Math.abs(r.seconds - expectSeconds) > 1e-3) fail(name, `rendered ${r.seconds}s, expected ${expectSeconds}s`);
  if (r.clipFrac > 0.001) fail(name, `crushed: ${(r.clipFrac * 100).toFixed(2)}% of samples above 0.97`);
  if (Math.abs(r.dc[0]) > 0.01) fail(name, `DC offset ${r.dc[0].toFixed(4)}`);
}

function row(kind, r, note = '') {
  rows.push({ kind, name: r.name, seconds: r.seconds, active: r.activeDur, peak: r.peak, rms: r.rms, rmsActive: r.rmsActive, ms: r.renderMs, note });
}

// ---------------------------------------------------------------- PCM helpers (Node side)
function decodeWav(b64) {
  const b = Buffer.from(b64, 'base64');
  const ch = b.readUInt16LE(22), sr = b.readUInt32LE(24), n = (b.length - 44) / (2 * ch);
  const data = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) data[c][i] = b.readInt16LE(o) / 32768;
  return { sr, ch, n, data };
}

function biquad(x, [b0, b1, b2, a0, a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** ITU-R BS.1770-4 loudness: integrated (gated), max momentary (400 ms), max short-term (3 s). */
function loudness({ sr, data }) {
  const shelf = (() => {
    const G = 3.999843853973347, Q = 0.7071752369554196, fc = 1681.974450955533, A = 10 ** (G / 40);
    const w = 2 * Math.PI * fc / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q), s = 2 * Math.sqrt(A) * al;
    return [A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s),
      (A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s];
  })();
  const hp = (() => {
    const Q = 0.5003270373238773, fc = 38.13547087602444, w = 2 * Math.PI * fc / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q);
    return [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
  })();
  const k = data.map((d) => biquad(biquad(d, shelf), hp));
  const ms = (from, len) => { let s = 0; for (const d of k) for (let i = from; i < from + len; i++) s += d[i] * d[i]; return s / len; };
  const L = (z) => (z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity);
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), n = k[0].length;
  const z = [];
  for (let s = 0; s + blk <= n; s += hop) z.push(ms(s, blk));
  const abs = z.filter((v) => L(v) > -70);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((v) => L(v) > rel);
  const st = [];
  const blk3 = Math.round(3 * sr);
  for (let s = 0; s + blk3 <= n; s += Math.round(sr)) st.push(L(ms(s, blk3)));
  return { integrated: L(mean(gated)), momentaryMax: Math.max(...z.map(L)), shortTermMax: st.length ? Math.max(...st) : -Infinity };
}

/** RMS and peak (dBFS) per second. */
function perSecond({ sr, data, n }) {
  const out = [];
  for (let s = 0; s + sr <= n; s += sr) {
    let sum = 0, pk = 0;
    for (const d of data) for (let i = s; i < s + sr; i++) { const x = d[i]; sum += x * x; if (Math.abs(x) > pk) pk = Math.abs(x); }
    out.push({ t: s / sr, rms: db(Math.sqrt(sum / (sr * data.length))), peak: db(pk) });
  }
  return out;
}

// --- spectrogram PNG (log-frequency, dB), with optional cue markers
function fftMag(re, im) { // in-place radix-2, returns |X| for the first half
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const m = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  return m;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function png(w, h, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function spectrogram(file, { sr, data, n }, { marks = [], height = 320, maxWidth = 1600, fmin = 30, fmax = 16000, title = '' } = {}) {
  if (!SPECTRO) return;
  const N = 4096, seconds = n / sr;
  const W = Math.min(maxWidth, Math.max(400, Math.round(seconds * 60)));
  const env = 24, H = height + env; // the bottom strip draws the RMS envelope
  const img = Buffer.alloc(W * H * 3);
  const mono = new Float32Array(n);
  for (const d of data) for (let i = 0; i < n; i++) mono[i] += d[i] / data.length;
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const color = (v) => { // 0..1 -> dark ember palette
    const r = Math.min(1, v * 1.6), g = Math.max(0, Math.min(1, (v - 0.35) * 1.7)), b = Math.max(0, Math.min(1, (v - 0.75) * 3)) * 0.9 + 0.12 * (1 - v);
    return [Math.round(r * 255), Math.round(g * 235), Math.round(b * 255)];
  };
  const lf0 = Math.log(fmin), lf1 = Math.log(fmax);
  for (let x = 0; x < W; x++) {
    const c = Math.round((x / W) * n) - N / 2;
    const re = new Float32Array(N), im = new Float32Array(N);
    let s2 = 0;
    for (let i = 0; i < N; i++) { const j = c + i; const v = j >= 0 && j < n ? mono[j] : 0; re[i] = v * win[i]; s2 += v * v; }
    const m = fftMag(re, im);
    for (let y = 0; y < height; y++) {
      const f = Math.exp(lf1 - ((lf1 - lf0) * y) / (height - 1)), bin = f * N / sr;
      const b0 = Math.floor(bin), fr = bin - b0;
      const mag = (m[b0] || 0) * (1 - fr) + (m[b0 + 1] || 0) * fr;
      const dbv = 20 * Math.log10(mag / (N / 4) + 1e-9);
      const v = Math.pow(Math.max(0, Math.min(1, (dbv + 92) / 72)), 1.5);
      const [r, g, b] = color(v);
      const o = (y * W + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
    const rms = Math.sqrt(s2 / N), e = Math.max(0, Math.min(1, (db(rms) + 60) / 60));
    for (let y = 0; y < env; y++) {
      const on = env - 1 - y < e * env;
      const o = ((height + y) * W + x) * 3; img[o] = on ? 200 : 18; img[o + 1] = on ? 170 : 16; img[o + 2] = on ? 110 : 14;
    }
  }
  for (const [t] of marks) { // cue markers
    const x = Math.round((t / seconds) * W);
    if (x < 0 || x >= W) continue;
    for (let y = 0; y < H; y += 2) { const o = (y * W + x) * 3; img[o] = 90; img[o + 1] = 200; img[o + 2] = 255; }
  }
  // frequency gridlines at 100 Hz, 1 kHz, 10 kHz
  for (const f of [100, 1000, 10000]) {
    const y = Math.round(((lf1 - Math.log(f)) / (lf1 - lf0)) * (height - 1));
    for (let x = 0; x < W; x += 3) { const o = (y * W + x) * 3; img[o] = 60; img[o + 1] = 60; img[o + 2] = 60; }
  }
  fs.mkdirSync(SPECTRO_OUT, { recursive: true });
  fs.writeFileSync(path.join(SPECTRO_OUT, file), png(W, H, img));
  void title;
}

/** Onset times (s) of percussive hits in a dry render: rises of a 1 ms energy envelope. */
function onsets({ sr, data, n }, from, to) {
  const hop = Math.round(sr * 0.001), out = [];
  const e = [];
  for (let s = 0; s + hop <= n; s += hop) { let v = 0; for (const d of data) for (let i = s; i < s + hop; i++) v += d[i] * d[i]; e.push(Math.sqrt(v / hop)); }
  let last = -1;
  for (let i = 12; i < e.length; i++) {
    const t = (i * hop) / sr;
    if (t < from || t > to) continue;
    let prev = 0; for (let k = 3; k <= 12; k++) prev = Math.max(prev, e[i - k]);
    if (e[i] > 0.004 && e[i] > prev * 2.2 && (last < 0 || t - last > 0.06)) {
      // refine: first sample in this hop region that exceeds 30 % of the local peak
      let pk = 0; for (let k = 0; k < 4; k++) pk = Math.max(pk, e[i + k] || 0);
      let j = (i - 2) * hop;
      while (j < (i + 4) * hop && Math.max(...data.map((d) => Math.abs(d[j]))) < pk * 0.3) j++;
      out.push(j / sr); last = t;
    }
  }
  return out;
}

const server = await startServer(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check'],
});
const consoleErrors = [];
let exitCode = 0;
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const url = (m.location() && m.location().url) || '';
    // the engine catches failures inside instruments / recipes and only warns: treat those as errors
    if (m.type() === 'warning' && /\[audio\]/.test(m.text())) { consoleErrors.push(`${m.text()} ${url}`); return; }
    if (m.type() !== 'error') return;
    // HEAD probes for optional assets/audio/<state>.mp3 are expected to 404 when no file exists
    if (/Failed to load resource/.test(m.text()) && /\/assets\/audio\//.test(url)) return;
    consoleErrors.push(`${m.text()} ${url}`);
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + (e && e.message)));
  page.setDefaultTimeout(600000);
  await page.goto(`http://127.0.0.1:${port}/test/audio_check.html`);
  await page.waitForFunction('window.__ready === true');
  // test-only hooks: render in a chosen reverb space, mute instruments, drop the reverb (window.__space/__mute/__dry)
  await page.evaluate(async () => {
    const { AudioSystem } = await import('/src/audio.js');
    const unlock = AudioSystem.prototype.unlock;
    AudioSystem.prototype.unlock = async function hooked() {
      const ok = await unlock.call(this);
      if (this._eng) {
        if (window.__space) this.setSpace(window.__space, { fade: 0 });
        if (window.__mute) this._eng.mute = new Set(window.__mute);
        if (window.__dry) this._eng.revOut.gain.value = 0;
      }
      return ok;
    };
  });
  const setHooks = (h) => page.evaluate((x) => { window.__space = x.space || null; window.__mute = x.mute || null; window.__dry = !!x.dry; }, h);
  CUES = await page.evaluate(async () => (await import('/src/audio.js')).NIUMO_CUES);

  if (want('calibrate') || want('sfx')) {
    const cal = await page.evaluate(() => window.calibrate());
    console.log('master chain (sine into masterIn): ' + Object.entries(cal)
      .map(([a, c]) => `in ${a} -> steady ${c.steadyPeak.toFixed(3)} (gain ${c.gain.toFixed(3)}), max ${c.overallPeak.toFixed(3)}`).join(' | '));
    if (Math.abs(cal['0.1'].gain - 1) > 0.05) fail('calibration', `small-signal gain ${cal['0.1'].gain.toFixed(3)} (expected ~1; adjust COMP_TRIM)`);
    if (cal['2'].overallPeak > 0.99) fail('calibration', `limiter lets ${cal['2'].overallPeak.toFixed(3)} through`);
  }

  if (want('sfx')) {
    for (const name of SFX_NAMES) {
      if (NAME && NAME !== name) continue;
      const niumo = IS_NIUMO_SFX.has(name);
      await setHooks({ space: niumo ? 'caldera' : null });
      const r = await page.evaluate((n) => window.renderSfx(n), name);
      const nominal = await page.evaluate((n) => window.SFX_DURATION[n], name);
      basicChecks(name, r, nominal + 4.5);
      if (r.peak < 0.05) fail(name, `too quiet: peak ${f3(r.peak)}`);
      if (niumo && r.peak >= NIUMO_PEAK) fail(name, `peak ${f1(db(r.peak))} dBFS, must stay under -1 dBFS`);
      if (db(r.rmsActive) < -48 || db(r.rmsActive) > -9) fail(name, `active RMS ${f1(db(r.rmsActive))} dBFS outside [-48, -9]`);
      if (r.activeDur < nominal * 0.5 || r.activeDur > nominal + 4.2) fail(name, `active duration ${r.activeDur.toFixed(2)}s vs nominal ${nominal}s`);
      const onsetMax = SWELLS[name] ?? 0.05; // crescendos start from silence on purpose
      if (r.onset == null || r.onset > onsetMax) fail(name, `late onset ${r.onset}s`);
      row('sfx', r, `nominal ${nominal}s` + (niumo ? ' (caldera)' : ''));
      writeWav(`${name}.wav`, r.wav);
      if (niumo && r.wav) niumoRenders.set(name, decodeWav(r.wav));
    }
    await setHooks({});
    if (!NAME) {
      const listener = { position: { x: 0, y: 1.6, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
      const R = await page.evaluate((l) => window.renderSfx('boss_step', { pos: { x: 10, y: 0, z: 0 }, listener: l, seed: 5, wav: false }), listener);
      const L = await page.evaluate((l) => window.renderSfx('boss_step', { pos: { x: -10, y: 0, z: 0 }, listener: l, seed: 5, wav: false }), listener);
      const near = await page.evaluate((l) => window.renderSfx('boss_step', { pos: { x: 0, y: 0, z: -4 }, listener: l, seed: 5, wav: false }), listener);
      const far = await page.evaluate((l) => window.renderSfx('boss_step', { pos: { x: 0, y: 0, z: -40 }, listener: l, seed: 5, wav: false }), listener);
      const lr = (r) => db(r.rmsCh[1]) - db(r.rmsCh[0]);
      console.log(`spatial: source at +x -> R-L ${f1(lr(R))} dB, at -x -> R-L ${f1(lr(L))} dB; 4 m vs 40 m: ${f1(db(near.rms) - db(far.rms))} dB (peak ${f3(near.peak)} vs ${f3(far.peak)})`);
      if (lr(R) < 3 || lr(L) > -3) fail('spatial', 'stereo panning does not follow the listener');
      if (db(near.rms) - db(far.rms) < 8) fail('spatial', 'distance attenuation too small');
      // the bull's voice carries: 60 m away it is still clearly there, but quieter than at 20 m
      await setHooks({ space: 'caldera' });
      const roar20 = await page.evaluate((l) => window.renderSfx('bull_roar', { pos: { x: 0, y: 10, z: -20 }, listener: l, seed: 5, wav: false }), listener);
      const roar60 = await page.evaluate((l) => window.renderSfx('bull_roar', { pos: { x: 0, y: 10, z: -60 }, listener: l, seed: 5, wav: false }), listener);
      await setHooks({});
      console.log(`spatial (bull_roar, ref 30 m): 20 m peak ${f1(db(roar20.peak))} dBFS, 60 m peak ${f1(db(roar60.peak))} dBFS, drop ${f1(db(roar20.rms) - db(roar60.rms))} dB`);
      if (db(roar60.peak) < -20 || !(db(roar20.rms) - db(roar60.rms) > 2)) fail('spatial', 'bull_roar distance model (SFX_REF) not applied');
      const vr = await page.evaluate(() => window.variation('hit_flesh', 40));
      console.log(`variation (40 calls, pitch=1): pitch ${vr.pitch.map(f3).join('..')}, timing ${vr.timeScale.map(f3).join('..')}, ${vr.distinctPitches} distinct`);
      if (vr.pitch[0] < 0.949 || vr.pitch[1] > 1.051 || vr.distinctPitches < 30) fail('variation', 'pitch variation not within ±5% / not random');
    }
  }

  if (want('music')) {
    for (const m of MUSIC) {
      if (NAME && NAME !== m.state) continue;
      const r = await page.evaluate((s, sec) => window.renderMusic(s, { seconds: sec, segs: [[sec - 5, sec], [2, sec - 5]] }), m.state, m.seconds);
      basicChecks(r.name, r, m.seconds);
      const [tail, body] = r.segs.map((s) => db(s.rms));
      if (db(r.rms) < m.rms[0] || db(r.rms) > m.rms[1]) fail(r.name, `RMS ${f1(db(r.rms))} dBFS outside [${m.rms}]`);
      if (m.alive && tail < db(r.rms) - 12) fail(r.name, `music dies out (last 5 s at ${f1(tail)} dBFS)`);
      if (m.fadesOut && !(tail < body - 10)) fail(r.name, `does not fade out (tail ${f1(tail)} vs body ${f1(body)} dBFS)`);
      if (m.silentEnd && tail > -60) fail(r.name, `does not end in silence (last 5 s at ${f1(tail)} dBFS)`);
      if (m.niumo && r.peak >= NIUMO_PEAK) fail(r.name, `peak ${f1(db(r.peak))} dBFS, must stay under -1 dBFS`);
      if (m.niumo && r.stats && r.stats.stolen > 0) fail(r.name, `${r.stats.stolen} music voices stolen (polyphony limit hit)`);
      row('music', r, `last 5 s ${f1(tail)} dBFS, max voices ${r.maxMusicVoices}` + (m.niumo ? `, ${(m.seconds * 1000 / r.renderMs).toFixed(1)}x realtime` : ''));
      writeWav(`${r.name}.wav`, r.wav);
      if (m.niumo && r.wav) niumoRenders.set(r.name, decodeWav(r.wav));
    }
    for (const tr of TRANSITIONS) {
      if (NAME && NAME !== tr.name) continue;
      const r = await page.evaluate((t) => window.renderMusic(t.state, { seconds: t.seconds, script: t.script, segs: t.segs }), tr);
      r.name = 'music_' + tr.name;
      basicChecks(r.name, r, tr.seconds);
      const s = r.segs.map((x) => db(x.rms));
      let note = r.segs.map((x, i) => `${x.from}-${x.to}s ${f1(s[i])}`).join(', ');
      if (tr.name === 'phase1_duck' && !(s[1] < s[0] - 5)) fail(r.name, `duck(0.7) only lowered the mix ${f1(s[0] - s[1])} dB`);
      if (/phase1_to_defeat$/.test(tr.name) && !(s[1] < s[0] - 6)) fail(r.name, `defeat does not cut the music (${f1(s[0] - s[1])} dB)`);
      if (/phase1_to_phase2$/.test(tr.name) && !(s[1] > s[0])) fail(r.name, 'phase2 is not more intense than phase1');
      if (tr.name === 'niumo_phase2_to_ending' && !(s[1] < s[0] - 6)) fail(r.name, `the ending is not quieter than the fight (${f1(s[0] - s[1])} dB)`);
      if (tr.niumo && r.peak >= NIUMO_PEAK) fail(r.name, `peak ${f1(db(r.peak))} dBFS, must stay under -1 dBFS`);
      row('music', r, note);
      if (tr.wav !== false) writeWav(`${r.name}.wav`, r.wav);
      if (tr.niumo && r.wav) {
        const pcm = decodeWav(r.wav);
        niumoRenders.set(r.name, pcm);
        if (/phase1_to_phase2$/.test(tr.name)) { // no hole in the music around the switch (100 ms windows)
          const at = tr.script[0][0], w = Math.round(pcm.sr * 0.1);
          const win = (t0) => { let v = 0; const s0 = Math.round(t0 * pcm.sr); for (const d of pcm.data) for (let i = s0; i < s0 + w; i++) v += d[i] * d[i]; return db(Math.sqrt(v / (w * pcm.data.length))); };
          const around = []; for (let t0 = at - 1.5; t0 < at + 2.5; t0 += 0.1) around.push(win(t0));
          const sorted = [...around].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
          console.log(`${r.name}: 100 ms RMS around the switch min ${f1(sorted[0])} / median ${f1(median)} dBFS`);
          if (sorted[0] < median - 14) fail(r.name, `drop-out at the switch (${f1(sorted[0])} vs median ${f1(median)} dBFS)`);
        }
      }
    }
  }

  if (want('niumo') && !NAME) {
    // ---- phase1 -> phase2 stays on the beat grid: drums only, no reverb, onset times vs the phase1 grid
    await setHooks({ mute: ['monk', 'choir', 'lava', 'gong', 'cymbal', 'tbell', 'muyu', 'suona', 'phrase', 'droll', 'boom'], dry: true });
    const g = await page.evaluate(() => window.renderMusic('niumo_phase1', { seconds: 37, script: [[30, 'setMusic', 'niumo_phase2', { fade: 0.6 }]] }));
    await setHooks({});
    const pcm = decodeWav(g.wav);
    const BEAT = 60 / 68, t0 = 0.03, sixteenth = BEAT / 4;
    const errs = (list) => list.map((t) => { const k = Math.round((t - t0) / sixteenth); return Math.abs(t - (t0 + k * sixteenth)) * 1000; });
    const before = onsets(pcm, 20, 29.9), after = onsets(pcm, 30.2, 36.5);
    const eb = errs(before), ea = errs(after);
    const max = (a) => (a.length ? Math.max(...a) : NaN);
    if (process.env.GRIDDBG) console.log('after', after.map((t, i) => t.toFixed(3) + ':' + ea[i].toFixed(0)).join(' '));
    console.log(`grid: phase1 ${before.length} drum onsets (max ${max(eb).toFixed(1)} ms off the 16th grid), phase2 after the switch ${after.length} onsets (max ${max(ea).toFixed(1)} ms off the same grid)`);
    // the onset detector double-triggers on the big drum's slow attack, so judge phase 2 against phase 1's own spread
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    if (after.length < 12 || !(med(ea) <= 40 && max(ea) <= max(eb) + 30)) fail('niumo grid', `phase2 drifts off phase1's beat grid (median ${med(ea).toFixed(1)} vs ${med(eb).toFixed(1)} ms, max ${max(ea).toFixed(1)} vs ${max(eb).toFixed(1)} ms)`);
    if (!(after.length / 6.3 > (before.length / 9.9) * 1.25)) fail('niumo grid', `phase2 drums are not denser (${before.length} in 9.9 s vs ${after.length} in 6.3 s)`);

    // ---- buffer generation cost (main thread, once per scene) and the IR
    const bank = await page.evaluate(async () => {
      const { AudioSystem } = await import('/src/audio.js');
      const { NIUMO_GUQIN_NOTES } = await import('/src/audio/niumo_music.js');
      const ctx = new OfflineAudioContext(2, 48000, 48000);
      const sys = new AudioSystem({ context: ctx, seed: 1 });
      await sys.unlock();
      const nb = sys._eng.nbank, out = {};
      for (const k of ['fire', 'blorp', 'tbell', 'gong', 'drum', 'cymbal', 'muyu', 'rain']) { const t = performance.now(); void nb[k]; out[k] = +(performance.now() - t).toFixed(1); }
      let t = performance.now(); for (const m of NIUMO_GUQIN_NOTES) nb.guqin(m); out[`guqin x${NIUMO_GUQIN_NOTES.length}`] = +(performance.now() - t).toFixed(1);
      t = performance.now(); sys.setSpace('caldera', { fade: 0 }); out.calderaIR = +(performance.now() - t).toFixed(1);
      let bytes = 0;
      const walk = (v) => { if (!v) return; if (v instanceof AudioBuffer) bytes += v.length * v.numberOfChannels * 4; else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.values(v).forEach(walk); };
      for (const k of ['fire', 'blorp', 'tbell', 'gong', 'drum', 'cymbal', 'muyu', 'rain']) walk(nb[k]);
      for (const m of NIUMO_GUQIN_NOTES) walk(nb.guqin(m));
      out.megabytes = +(bytes / 1048576).toFixed(1);
      return out;
    });
    console.log('niumo bank generation (ms, main thread, each category is one idle tick when warmed): ' + JSON.stringify(bank));
    if (Object.entries(bank).some(([k, v]) => k !== 'megabytes' && v > 250)) fail('niumo bank', 'a buffer category takes over 250 ms to generate');

    // ---- realtime: every niumo state and sfx on a real AudioContext, cleanup, fire_breath stop(), main-thread cost
    const rt = await page.evaluate(async (names) => {
      const { AudioSystem } = await import('/src/audio.js');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const res = { steps: [] };
      const step = (k, v) => res.steps.push([k, v]);
      const sys = new AudioSystem();
      await sys.unlock();
      const ctx = sys.context;
      const an = ctx.createAnalyser(); an.fftSize = 2048; sys._eng.output.connect(an);
      const buf = new Float32Array(an.fftSize);
      const cost = [];
      const level = async (ms) => {
        let m = 0; const end = performance.now() + ms;
        while (performance.now() < end) {
          an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; m = Math.max(m, Math.sqrt(s / buf.length));
          const t0 = performance.now(); sys.update(0.016); cost.push(performance.now() - t0);
          await sleep(16);
        }
        return +m.toFixed(5);
      };
      sys.setListener({ position: { x: 0, y: 1.8, z: 28 }, forward: { x: 0, y: 0, z: -1 } });
      for (const [state, ms] of [['niumo_opening', 3500], ['niumo_ambient', 2500], ['niumo_phase1', 4000]]) {
        sys.setMusic(state, { fade: 0.4 });
        step(state, { level: await level(ms), space: sys._eng.space, time: +(sys.musicTime() || 0).toFixed(2), stats: sys.stats() });
      }
      const at = {
        staff_swing: { x: 0, y: 1, z: 22 }, staff_hit: { x: 0.5, y: 2, z: 20 }, staff_hit_heavy: { x: 0.5, y: 1, z: 20 },
        bull_roar: { x: 0, y: 18, z: -30 }, bull_stomp: { x: -6, y: 0, z: -12 }, bull_slam: { x: 4, y: 0, z: 10 },
        fire_breath: { x: 0, y: 14, z: -24 }, fan_wind: null, lava_burst: { x: 8, y: 0, z: 6 }, rock_crack: { x: -5, y: 0, z: 14 }, rain: null,
      };
      let fired = 0;
      for (const n of names) { if (sys.play(n, { pos: at[n] ?? null, volume: 0.8 })) fired++; sys.update(0.016); await sleep(160); }
      step('niumo sfx fired', { fired, of: names.length, level: await level(700), stats: sys.stats() });
      const h = sys.play('fire_breath', { pos: { x: 0, y: 14, z: -20 } });
      await level(900);
      const before = sys.stats().live;
      h.stop(0.25);
      await level(700);
      step('fire_breath stop', { before, after: sys.stats().live });
      sys.setMusic('niumo_phase2', { fade: 0.6 });
      await level(300);
      step('niumo_phase2', { level: await level(3500), beat: sys.musicBeat(), stats: sys.stats() });
      sys.setMusic('niumo_ending', { fade: 3 });
      step('niumo_ending', { level: await level(4500), stats: sys.stats() });
      sys.setMusic('niumo_defeat', { fade: 0.3 });
      step('niumo_defeat', { level: await level(1500), stats: sys.stats() });
      sys.setMusic('off', { fade: 0.5 });
      await level(15000); // let every tail finish (rain is ~10 s)
      step('off (after tails)', { level: await level(500), stats: sys.stats() });
      cost.sort((a, b) => a - b);
      step('update() cost', { calls: cost.length, meanMs: +(cost.reduce((a, b) => a + b, 0) / cost.length).toFixed(3), p99Ms: +cost[Math.floor(cost.length * 0.99)].toFixed(3), maxMs: +cost[cost.length - 1].toFixed(3) });
      if (ctx.playoutStats) {
        const p = ctx.playoutStats;
        step('playout', { fallbackFramesEvents: p.fallbackFramesEvents, fallbackDurationMs: p.fallbackFramesDuration, totalDurationMs: p.totalFramesDuration });
      }
      await sys.close();
      return res;
    }, NIUMO_SFX);
    for (const [k, v] of rt.steps) console.log(`realtime niumo ${k}: ${JSON.stringify(v)}`);
    const get = (k) => (rt.steps.find((s) => s[0] === k) || [])[1] || {};
    for (const k of ['niumo_opening', 'niumo_ambient', 'niumo_phase1', 'niumo_phase2', 'niumo_ending', 'niumo_defeat']) if (!(get(k).level > 0.002)) fail('realtime niumo', `${k} silent in realtime (level ${get(k).level})`);
    if (get('niumo_opening').space !== 'caldera') fail('realtime niumo', 'niumo music did not switch the reverb to the caldera');
    if (get('niumo sfx fired').fired !== NIUMO_SFX.length) fail('realtime niumo', 'not every niumo SFX could be fired');
    const fb = get('fire_breath stop');
    if (!(fb.after < fb.before)) fail('realtime niumo', `fire_breath handle.stop() did not end it (${fb.before} -> ${fb.after} live voices)`);
    if (!get('niumo_phase2').beat || Math.abs(get('niumo_phase2').beat.bpm - 68) > 0.01) fail('realtime niumo', 'musicBeat() does not report the 68 BPM grid');
    const off = get('off (after tails)').stats || {};
    if (off.live > 0) fail('realtime niumo', `${off.live} voices still alive after music off + 15 s (node leak?)`);
    if (off.musicPlayers > 0) fail('realtime niumo', `${off.musicPlayers} music players not disposed`);
    const uc = get('update() cost');
    if (!(uc.p99Ms < 4)) fail('realtime niumo', `update() p99 ${uc.p99Ms} ms on the main thread (budget 4 ms)`);
  }
  if (consoleErrors.length) for (const e of consoleErrors) fail('console', e);
} finally {
  await browser.close();
  server.close();
}

if (rows.length) {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log('\n' + pad('name', 30) + lpad('len s', 7) + lpad('active s', 9) + lpad('peak', 7) + lpad('peak dB', 8) + lpad('RMS dB', 8) + lpad('actRMS dB', 10) + lpad('render ms', 10) + '  note');
  for (const r of rows) {
    console.log(pad(r.name, 30) + lpad(r.seconds.toFixed(2), 7) + lpad(r.active.toFixed(2), 9) + lpad(r.peak.toFixed(3), 7)
      + lpad(f1(db(r.peak)), 8) + lpad(f1(db(r.rms)), 8) + lpad(f1(db(r.rmsActive)), 10) + lpad(Math.round(r.ms), 10) + '  ' + r.note);
  }
}

// ---------------------------------------------------------------- Flame Mountain report
if (niumoRenders.size) {
  console.log('\nFlame Mountain loudness (ITU-R BS.1770: integrated LUFS, max momentary 400 ms, max short-term 3 s; sample peak)');
  for (const [name, pcm] of niumoRenders) {
    const L = loudness(pcm);
    let pk = 0; for (const d of pcm.data) for (let i = 0; i < pcm.n; i++) pk = Math.max(pk, Math.abs(d[i]));
    console.log(`  ${name.padEnd(34)} ${f1(L.integrated).padStart(6)} LUFS   M max ${f1(L.momentaryMax).padStart(6)}   S max ${f1(L.shortTermMax).padStart(6)}   peak ${f1(db(pk)).padStart(6)} dBFS`);
  }
  const op = niumoRenders.get('music_niumo_opening');
  if (op) {
    const cues = CUES ? CUES.opening : {};
    const label = (t) => Object.entries(cues).filter(([k, v]) => typeof v === 'number' && v >= t && v < t + 1 && k !== 'end').map(([k]) => k).join(' ');
    console.log('\nniumo_opening per-second envelope (RMS / peak dBFS; | = 2 dB of RMS above -60)');
    for (const s of perSecond(op)) {
      const bar = '|'.repeat(Math.max(0, Math.round((s.rms + 60) / 2)));
      console.log(`  ${String(s.t).padStart(2)}-${String(s.t + 1).padStart(2)} s  ${f1(s.rms).padStart(6)} / ${f1(s.peak).padStart(6)}  ${bar.padEnd(30)} ${label(s.t)}`);
    }
    const ps = perSecond(op), at = (t) => ps[Math.floor(t)];
    if (cues.title != null) {
      const hit = at(cues.title), swell = at(cues.title - 1), early = ps.slice(0, 6).reduce((m, s) => Math.max(m, s.rms), -Infinity);
      if (!(hit.peak > early + 15)) fail('niumo_opening', 'the title hit does not stand out from the opening');
      if (!(hit.rms >= Math.max(...ps.map((s) => s.rms)) - 1.5)) fail('niumo_opening', 'the title hit is not the loudest moment');
      void swell;
    }
    spectrogram('music_niumo_opening.png', op, { marks: Object.entries(cues).filter(([k, v]) => typeof v === 'number' && k !== 'black' && k !== 'end').map(([, v]) => [v]) });
  }
  for (const [name, pcm] of niumoRenders) if (name !== 'music_niumo_opening') spectrogram(`${name}.png`, pcm);
  if (SPECTRO) console.log(`spectrograms: ${SPECTRO_OUT}`);
}

// ---------------------------------------------------------------- cathedral regression (--baseline <dir>)
if (BASELINE) {
  const read = (f) => decodeWav(fs.readFileSync(f).toString('base64'));
  let worst = -Infinity, n = 0;
  for (const f of fs.readdirSync(BASELINE).filter((x) => x.endsWith('.wav') && !/niumo/.test(x) && !NIUMO_SFX.includes(x.replace('.wav', '')))) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) continue;
    const a = read(path.join(BASELINE, f)), b = read(p);
    if (a.n !== b.n) { fail('regression', `${f}: length changed ${a.n} -> ${b.n}`); continue; }
    let se = 0, ss = 0;
    for (let c = 0; c < a.ch; c++) for (let i = 0; i < a.n; i++) { const d = a.data[c][i] - b.data[c][i]; se += d * d; ss += a.data[c][i] ** 2; }
    const rel = se ? 10 * Math.log10(se / Math.max(ss, 1e-12)) : -Infinity;
    worst = Math.max(worst, rel); n++;
    if (rel > -60) fail('regression', `${f} differs from the baseline (diff/signal ${f1(rel)} dB)`);
  }
  console.log(`\ncathedral regression vs ${BASELINE}: ${n} renders compared, worst diff/signal ${f1(worst)} dB (run-to-run noise is ~ -78..-110 dB)`);
}

if (failures.length) {
  exitCode = 1;
  console.log(`\nFAIL (${failures.length})`);
  for (const f of failures) console.log('  - ' + f);
} else {
  console.log('\nOK: all audio checks passed' + (WAV && rows.length ? ` (WAVs in ${OUT})` : ''));
}
process.exit(exitCode);
