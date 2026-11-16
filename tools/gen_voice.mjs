#!/usr/bin/env node
// 火焰山 · 牛魔 — render the spoken lines with a neural TTS through ZenMux (OpenAI-compatible /audio/speech) into
// assets/audio/voice/<id>.m4a, plus voice.json (id, speaker, text, duration in seconds of the file as rendered).
//
//   node tools/gen_voice.mjs               render every line
//   node tools/gen_voice.mjs b1 m2         render only these ids (the manifest is always rebuilt from every file present)
//   node tools/gen_voice.mjs --check b1    also transcribe what was rendered (ASR) and print it next to the script
//
// Key: ZENMUX_API_KEY in the environment, or a line ZENMUX_API_KEY=... in <project>/.env (git-ignored).
// Model / voices: VOICE_MODEL, BULL_VOICE, MONKEY_VOICE override the defaults below.
// The model is steered by a short direction in front of each line (how to say it); only the line itself is spoken.
// Needs macOS `afconvert` (PCM -> AAC). The old offline version (macOS `say`) is tools/gen_voice.sh.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/audio/voice');
const API = 'https://zenmux.ai/api/v1';

function setting(name) {
  if (process.env[name]) return process.env[name].trim();
  const env = path.join(ROOT, '.env');
  if (!fs.existsSync(env)) return '';
  for (const line of fs.readFileSync(env, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#') && line.slice(0, i).trim() === name) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const KEY = setting('ZENMUX_API_KEY');
if (!KEY) { console.error('No ZENMUX_API_KEY: export it, or put  ZENMUX_API_KEY=...  in ' + path.join(ROOT, '.env')); process.exit(2); }

const MODEL = setting('VOICE_MODEL') || 'google/gemini-3.1-flash-tts-preview';
const ASR = setting('VOICE_ASR') || 'qwen/qwen-audio-3.1-asr-flash';
const SPEAKERS = {
  // 牛魔王: an old giant, a thousand years seated; deep, slow, tired, dangerous
  bull: { voice: setting('BULL_VOICE') || 'Orus',
    how: 'You are voicing an ancient giant demon king in a Chinese mythological drama. Speak in Mandarin Chinese with a very deep, gravelly, weary but menacing voice, like a mountain talking. Speak at a brisk, natural conversational speed, like a film actor delivering a line in one breath: no slow drawl, no long pauses. No shouting. Say only this line:' },
  // 孙悟空: quick, dry, mocking, fearless
  monkey: { voice: setting('MONKEY_VOICE') || 'Fenrir',
    how: 'You are voicing Sun Wukong, the Monkey King, in a Chinese mythological drama. Speak in Mandarin Chinese with a bright, sharp, cocky, slightly mocking young male voice, quick and fearless. Natural acting. Say only this line:' },
};

// id | speaker | subtitle text | (optional) how this one line is said
const LINES = [
  ['b1', 'bull', '……五百年。压在山下的七弟，也爬出来了。'],
  ['m1', 'monkey', '平天大圣好定力。一坐千年，连火都坐倦了。'],
  ['b2', 'bull', '又来借扇？上回钻我妻的肚子——这回，钻哪儿？', 'with cold contempt'],
  ['m2', 'monkey', '这回不借。来拿。', 'flat and cold; a pause before the last two words'],
  ['b3', 'bull', '红孩儿的账，铁扇的账……今日一并算。', 'each debt weighed, the last words hard'],
  ['m3', 'monkey', '正好。俺老孙压了五百年，骨头正痒。', 'grinning'],
  ['p1', 'bull', '坐了一千年……也该站起来，看看这天了。', 'rising, as he stands up'],
  ['p2', 'monkey', '站起来好。倒下去，才响。'],
  ['p3', 'bull', '响的，是你。', 'quiet, amused'],
  ['p4', 'monkey', '……好。论大小，俺老孙也会。——法相天地！', 'low at first, getting up from the ground; the last four words shouted to the sky'],
  ['e0', 'bull', '好棍……七弟。这火，烧了一千年……也该熄了。', 'his last words as he falls: breathy, spent, almost relieved; keep it moving, no long pauses, under seven seconds'],
  // battle shouts (played over the blows, no subtitle: VoiceLines.shout)
  ['y1', 'monkey', '哈！', 'a single short explosive battle shout as he strikes, loud, from the belly, like a martial artist; under one second'],
  ['y2', 'monkey', '嘿——呀！', 'a fierce two-part battle cry swinging a heavy staff, loud and raw'],
  ['y3', 'monkey', '呀——！', 'a long rising war cry as he leaps and smashes down, loud, wild, monkey-like'],
  ['y4', 'monkey', '着！', 'one sharp shouted syllable as the blow lands, loud and triumphant'],
  ['e1', 'monkey', '大哥……下雨了。', 'very quiet, tired, almost tender; a long pause after the first word'],
];

// the English subtitle of each line (shown under the Chinese)
const EN = {
  b1: '…Five hundred years. So the seventh brother has crawled out from under his mountain.',
  m1: 'The Great Sage Who Levels Heaven sits well. A thousand years — even the fire has grown tired.',
  b2: 'Come to borrow the fan again? Last time you crawled into my wife\'s belly. This time — where?',
  m2: 'Not borrowing this time. Taking.',
  b3: 'Red Boy\'s debt. Iron Fan\'s debt… Today we settle them all.',
  m3: 'Good. Five hundred years under a mountain — my bones are itching.',
  p1: 'A thousand years seated… Time I stood, and had a look at this sky.',
  p2: 'Stand, then. The taller you stand, the louder you fall.',
  p3: 'The loud one… is you.',
  p4: '…Fine. Size? I can do size. — Stand as Heaven and Earth!',
  e0: 'A good blow… seventh brother. A thousand years this fire has burned… time it went out.',
  e1: 'Brother… it\'s raining.',
};

const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.filter(a => !a.startsWith('--'));

// (through curl, not fetch: curl honours the system's proxy settings)
function post(pathname, body) {
  const text = execFileSync('curl', ['-sS', '-m', '180', API + pathname, '-H', 'Content-Type: application/json', '-H', 'Authorization: Bearer ' + KEY, '--data-binary', '@-'],
    { input: JSON.stringify(body), maxBuffer: 256 << 20 }).toString();
  let j = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!j || j.error) throw new Error(`${pathname}: ${j && j.error ? j.error.message || JSON.stringify(j.error) : text.slice(0, 300)}`);
  return j;
}

/** 16-bit mono PCM -> WAV bytes. */
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** Cut the silence off both ends (keeping a short breath) and normalise the peak. */
function tidy(pcm, rate) {
  const n = pcm.length >> 1, s = i => pcm.readInt16LE(i * 2);
  let a = 0, b = n - 1, peak = 1;
  while (a < n && Math.abs(s(a)) < 500) a++;
  while (b > a && Math.abs(s(b)) < 500) b--;
  a = Math.max(0, a - Math.round(rate * 0.04)); b = Math.min(n - 1, b + Math.round(rate * 0.12));
  for (let i = a; i <= b; i++) peak = Math.max(peak, Math.abs(s(i)));
  const g = Math.min(4, 29000 / peak), out = Buffer.alloc((b - a + 1) * 2);
  for (let i = a; i <= b; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s(i) * g))), (i - a) * 2);
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'niumo-voice-'));
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const [id, who, text, note] of LINES) {
  if (only.length && !only.includes(id)) continue;
  const sp = SPEAKERS[who];
  const spoken = text.replace(/^……/, '').replace(/——/g, '，');
  try {
    const j = post('/audio/speech', { model: MODEL, voice: sp.voice, response_format: 'pcm', input: `${sp.how}${note ? ' (' + note + ')' : ''}\n${spoken}` });
    const rate = +(/rate=(\d+)/.exec(j.mime_type || '') || [0, 24000])[1];
    const pcm = tidy(Buffer.from(j.audio, 'base64'), rate);
    const w = path.join(tmp, id + '.wav');
    fs.writeFileSync(w, wav(pcm, rate));
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', w, path.join(OUT, id + '.m4a')]);
    let heard = '';
    if (check) {
      try {
        const t = JSON.parse(execFileSync('curl', ['-sS', '-m', '120', API + '/audio/transcriptions', '-H', 'Authorization: Bearer ' + KEY, '-F', 'model=' + ASR, '-F', 'file=@' + w]).toString());
        heard = '  heard: ' + (t.text || JSON.stringify(t).slice(0, 160));
      } catch (e) { heard = '  (transcription failed: ' + e.message + ')'; }
    }
    console.log(`  ${id}  ${who.padEnd(6)} ${(pcm.length / 2 / rate).toFixed(2)} s  ${text}${heard}`);
  } catch (e) { failed++; console.error(`  ${id}  FAILED: ${e.message}`); }
}

// the manifest (every line that has a file)
const lines = {};
for (const [id, who, text] of LINES) {
  const f = path.join(OUT, id + '.m4a');
  if (!fs.existsSync(f)) continue;
  const d = +(/estimated duration: ([\d.]+)/.exec(execFileSync('afinfo', [f]).toString()) || [0, 0])[1];
  lines[id] = { speaker: who, text, en: EN[id] || '', file: id + '.m4a', duration: +d.toFixed(3) };
  if (/^y\d/.test(id)) lines[id].shout = true;
}
fs.writeFileSync(path.join(OUT, 'voice.json'), JSON.stringify({ note: `generated by tools/gen_voice.mjs (${MODEL} through ZenMux); durations are of the files, before the game's playbackRate`, lines }, null, 2)
  .replace(/\{\n\s+"speaker": ("[^"]+"),\n\s+"text": ("[^"]*"),\n\s+"en": ("(?:[^"\\\\]|\\\\.)*"),\n\s+"file": ("[^"]+"),\n\s+"duration": ([\d.]+)\n\s+\}/g, '{ "speaker": $1, "text": $2, "en": $3, "file": $4, "duration": $5 }') + '\n');
console.log('wrote ' + path.relative(ROOT, path.join(OUT, 'voice.json')) + (failed ? `  (${failed} line(s) failed)` : ''));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
