// Scores for the Flame Mountain (niumo) scene. Same format as music.js: score.bar(i) ->
// { len, events: [{ at, inst, args, dur, sustain }] } (null ends a one-shot).
//
// Language: decayed myth, not festive folk music. A pedal of low throat chant on A, war drums that stay
// scattered until the fight boils over, opera gongs whose pitch sinks as they ring, a temple bell far off,
// and a suona that only cries out at the key moments. A yu-mode pentatonic (A C D E G) darkened by the
// flat second (Bb) against the drone; the ending moves to D (D F G A C) with rain and a guqin.

export const NIUMO_BPM = 68;
const BEAT = 60 / NIUMO_BPM, BAR = 4 * BEAT;
const FORM = 24;

const ev = (at, inst, args, dur = 0, sustain = false) => ({ at, inst, args, dur, sustain });
const B = (beats) => beats * BEAT;

/** Small deterministic PRNG per bar index (scores must not depend on the engine's PRNG order). */
function barRng(i, salt = 0) {
  let a = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Timeline of the opening cinematic (seconds from setMusic('niumo_opening')), for src/niumo/mv.js. Every cut of the
 * prologue lands on a drum or gong (`hits`); `title` is the big hit (the title card); `eyes` the gong as his eyes
 * open; from `parley` the score is a quiet bed under the spoken lines (their length is not fixed: the cinematic runs
 * on its own clock from there and closes with the roar and the first bar of 'niumo_phase1').
 */
export const NIUMO_CUES = {
  bpm: NIUMO_BPM, beat: BEAT, bar: BAR,
  opening: {
    black: 0, ash: 2.6, ridge: 5.4, caldera: 10.0, breath: 13.6, knee: 16.6, suona: 17.1, title: 22.0, eyes: 26.4, parley: 27.6, end: 60,
    hits: [5.4, 10.0, 11.8, 13.6, 16.6, 18.5, 19.8, 20.75, 21.45, 22.0, 24.6, 26.4],
  },
};

// ================================================================ the fight (niumo_phase1 / niumo_phase2)
// 68 BPM, 4/4, 24 bars = 84.7 s. A (0-7): the mountain sits. B (8-15): the chant and the cry.
// C (16-23): pressure, the turnaround. Phase 2 keeps the same bars (seamless switch on the beat grid)
// with the drums in double time, the choir singing the theme and the suona leading.
const CH = {
  A: { ch: [45, 52, 57] },            // open fifth on A
  Am: { ch: [45, 52, 57, 60] },
  Bb: { ch: [46, 53, 58] },           // the flat second grinding on the A drone
  G: { ch: [43, 50, 55] },
  F: { ch: [41, 48, 53, 57] },
  E: { ch: [40, 47, 52] },
  D: { ch: [38, 45, 50, 53] },
};
const PROG = [
  'A', 'A', 'A', 'A', 'Bb', 'Bb', 'G', 'A',
  'Am', 'Am', 'Am', 'Am', 'F', 'F', 'G', 'E',
  'A', 'A', 'Bb', 'Bb', 'D', 'Bb', 'E', 'E',
];
// the theme, sung by the low men's choir in phase 2: [midi, beats, vowel], 4 bars each
const THEME = {
  8: [[45, 3, 'o'], [48, 1, 'o'], [50, 2, 'a'], [48, 1, 'o'], [45, 1, 'a'], [43, 3, 'o'], [40, 1, 'u'], [45, 4, 'a']],
  12: [[48, 3, 'o'], [50, 1, 'a'], [53, 2, 'a'], [52, 1, 'o'], [50, 1, 'a'], [50, 3, 'o'], [48, 1, 'o'], [52, 4, 'a']],
  16: [[52, 3, 'a'], [55, 1, 'o'], [57, 2, 'a'], [55, 1, 'o'], [52, 1, 'a'], [50, 3, 'o'], [48, 1, 'o'], [50, 4, 'a']],
  20: [[57, 3, 'a'], [55, 1, 'o'], [53, 2, 'a'], [50, 2, 'o'], [52, 3, 'a'], [47, 1, 'u'], [52, 4, 'a']],
};
// suona cries: [midi | null, beats, opts]
const CRY = {
  // phase 1, bars 12-15 (F F G E): a lone wail out of the chant
  low: [[null, 1], [81, 3, { scoop: 5, vib: 1.1 }], [84, 1], [86, 2.5, { vib: 1.3, sob: 0.6 }], [84, 0.5],
    [81, 2, { fall: 2 }], [79, 1], [81, 0.6], [79, 0.4], [76, 3.5, { vib: 1.2, fall: 7 }]],
  // phase 1 alternate loops, bars 20-22 (D Bb E): a shorter, higher cry
  short: [[null, 2], [86, 2, { scoop: 4, vib: 1.2 }], [84, 1], [82, 1, { scoop: 1 }], [81, 3, { vib: 1.3, sob: 0.5 }], [77, 1], [76, 2, { fall: 5 }]],
  // phase 2, bars 16-19 (A A Bb Bb): descending from E6, the bitter Bb on the flat-second bars
  c1: [[88, 2, { scoop: 3, acc: 1.1 }], [86, 1], [84, 1], [81, 3, { vib: 1.2 }], [79, 1], [82, 2, { scoop: 2 }], [81, 1], [77, 1],
    [74, 3.5, { vib: 1.3, fall: 2 }], [null, 0.5]],
  // phase 2, bars 20-23 (D Bb E E): the climax
  c2: [[86, 1.5, { scoop: 4 }], [88, 0.5], [89, 2, { vib: 1.2 }], [88, 1], [86, 1], [86, 1], [82, 1],
    [88, 4, { vib: 1.5, sob: 0.4, acc: 1.15 }], [88, 1.5], [86, 0.5], [81, 2, { fall: 5 }]],
};
const cryNotes = (c, shift = 0) => c.map(([m, b, op]) => [m == null ? null : m + shift, B(b), op || {}]);
const themeNotes = (t, shift = 0) => t.map(([m, b, vw]) => [m + shift, B(b), vw]);
// throat-chant overtone melodies (harmonic numbers over A1), one per 2-bar phrase
const OT = [
  [[0, 8], [B(3), 7], [B(5), 6], [B(6.5), 8]],
  [[0, 6], [B(2), 8], [B(4), 9], [B(6), 8]],
  [[0, 8], [B(2.5), 10], [B(4.5), 9], [B(6), 8]],
  [[0, 7], [B(3), 6], [B(4.5), 8], [B(7), 7]],
];

function battleBar(i, I) {
  const n = i % FORM, loop = Math.floor(i / FORM), c = CH[PROG[n]];
  const sec = n < 8 ? 'A' : n < 16 ? 'B' : 'C';
  const p2 = I >= 2;
  const E = [];
  const drum = (beat, kind, g, x = {}) => E.push(ev(B(beat), 'wardrum', {
    kind, gain: g * (p2 ? 0.8 : 0.72), send: x.send ?? (kind === 'rim' ? 0.22 : 0.3), rate: x.rate ?? 1, len: x.len ?? 0,
    pan: x.pan ?? (kind === 'big' || kind === 'edge' ? -0.12 : kind === 'mid' ? 0.22 : 0.34),
  }));
  const gong = (beat, kind, g, x = {}) => E.push(ev(B(beat), 'gong', { kind, gain: g, rate: x.rate ?? 1, send: x.send ?? 0.55, len: x.len ?? 0, pan: x.pan ?? 0.08 }));
  const cym = (beat, kind, g, x = {}) => E.push(ev(B(beat), 'cymbal', { kind, gain: g, send: x.send ?? 0.4, pan: x.pan ?? 0.18, len: x.len ?? 0 }));
  // a reversed swell that peaks exactly on the downbeat of bar `target` (len = buffer length)
  const swellInto = (target, inst, kind, len, g) => {
    const at = (target - n) * BAR - len;
    if (at >= 0 && at < BAR) E.push(ev(at, inst, { kind, gain: g, send: 0.45, pan: inst === 'cymbal' ? -0.2 : 0.1 }));
  };

  // ---- the drone: monks chanting on A1, one phrase every two bars (with a breath between in section A)
  if (n % 2 === 0) {
    E.push(ev(0, 'monk', {
      midi: 33, voices: p2 ? 4 : 3, spread: 9, gain: p2 ? 0.05 : 0.046, growl: p2 ? 0.45 : 0.3, send: 0.55,
      vowels: sec === 'A' ? [[0, 'u'], [B(3), 'o'], [B(6.5), 'u']] : [[0, 'o'], [B(2), 'a'], [B(5), 'o'], [B(7), 'u']],
      overtones: OT[(n / 2 + loop) % OT.length], attack: sec === 'A' ? 1.3 : 0.9, release: sec === 'A' ? 1.2 : 1.6,
    }, 2 * BAR + (sec === 'A' ? -0.2 : 0.5), true));
  }
  if (sec !== 'A' && n % 2 === 1) { // a second group a fifth above, overlapping the breaths
    E.push(ev(0, 'monk', {
      midi: 40, voices: 2, spread: 11, gain: p2 ? 0.03 : 0.024, growl: 0.15, send: 0.6, vowels: [[0, 'o'], [B(4), 'u']],
      attack: 1.4, release: 1.4,
    }, 2 * BAR, true));
  }

  // ---- the low choir pad (men), darker in A, opening up in C
  E.push(ev(0, 'choir', {
    notes: c.ch, vowel: sec === 'A' ? 'u' : sec === 'B' ? 'o' : 'a', voices: 2, spread: 13, vib: 10,
    attack: p2 ? 0.5 : 1.0, release: 1.3, gain: p2 ? 0.034 : sec === 'C' ? 0.032 : 0.026, send: 0.55, breath: 0.05,
  }, BAR + 0.08, true));
  if (p2 && sec === 'C') { // the women join above the theme in the climax
    E.push(ev(0, 'choir', {
      notes: c.ch.slice(-2).map((m) => m + 12), vowel: 'a', voices: 2, vib: 18, attack: 0.5, release: 1.2, gain: 0.02, send: 0.65,
    }, BAR + 0.08, true));
  }

  // ---- lava underneath everything (8-bar segments, overlapping)
  if (n % 8 === 0) E.push(ev(0, 'lava', { gain: p2 ? 0.075 : 0.06, activity: p2 ? 0.6 : 0.3, fadeIn: 1.5, fadeOut: 1.5, send: 0.3 }, 8 * BAR + 1.5, true));

  // ---- percussion
  const P1 = () => {
    if (sec === 'A') {
      if (n === 7) { drum(0, 'big', 0.7); drum(2, 'big', 0.5); drum(3, 'mid', 0.3); drum(3.5, 'mid', 0.38); drum(3.75, 'mid', 0.46); }
      else if (n % 2 === 0) { drum(0, 'big', 0.85); drum(2.5, 'edge', 0.35); drum(3, 'big', 0.55); }
      else { drum(0, 'big', 0.7); drum(1.75, 'mid', 0.25); drum(2, 'big', 0.5); drum(3.5, 'rim', 0.22); }
      if (n === 0) gong(0, 'daluo', 0.34, { rate: 0.9 });
      if (n === 4) { gong(0, 'daluo', 0.3); E.push(ev(B(0.02), 'tbell', { midi: 33, gain: 0.16, lp: 1500, send: 0.85, pan: -0.3 })); }
      if (n === 6) gong(2, 'tamtamSoft', 0.18);
    } else if (sec === 'B') {
      drum(0, 'big', 0.8); drum(1, 'mid', 0.3); drum(2, 'big', 0.55); drum(2.75, 'mid', 0.25); drum(3, 'mid', 0.32);
      drum(1.5, 'rim', 0.15); drum(3.5, 'rim', 0.18);
      if (n <= 11) for (let k = 0; k < 4; k++) E.push(ev(B(k), 'muyu', { gain: k === 0 ? 0.17 : 0.12, send: 0.45, pan: 0.3 }));
      if (n === 8) gong(0, 'daluo', 0.34);
      if (n === 12) { gong(0, 'daluo', 0.4, { rate: 0.95 }); cym(0, 'crash', 0.22); }
      if (n === 15) { drum(3.25, 'mid', 0.3); drum(3.5, 'mid', 0.38); drum(3.75, 'mid', 0.46); }
      swellInto(12, 'cymbal', 'crashRev', 3.2, 0.16);
      swellInto(16, 'gong', 'tamtamRev', 7.5, 0.18);
    } else {
      drum(0, 'big', 0.85); drum(1.5, 'big', 0.45); drum(2, 'mid', 0.35); drum(2.5, 'big', 0.5); drum(3, 'mid', 0.32); drum(3.5, 'mid', 0.36);
      drum(0.5, 'rim', 0.12); drum(1, 'rim', 0.14); drum(2.75, 'rim', 0.12);
      if (n === 16 || n === 20) { gong(0, 'tamtamSoft', n === 20 ? 0.32 : 0.28); if (n === 20) cym(0, 'crash', 0.24); }
      if (n === 18 || n === 22) gong(0, 'daluo', 0.38, { rate: n === 22 ? 0.88 : 1 });
      if (n === 16) E.push(ev(B(0.02), 'tbell', { midi: 28, gain: 0.18, lp: 1300, send: 0.9, pan: 0.3 }));
      if (n === 22) E.push(ev(B(2), 'droll', { kind: 'mid', dur: B(5.5), hz0: 5, hz1: 15, g0: 0.035, g1: 0.32, send: 0.32, pan: 0.15 }));
      if (n === 23) { drum(3.5, 'big', 0.6); drum(3.5, 'edge', 0.35); }
      swellInto(FORM, 'cymbal', 'crashRev', 3.2, 0.18);
      swellInto(FORM, 'gong', 'tamtamRev', 7.5, 0.2);
    }
  };
  const P2 = () => {
    // quarters on the big drum (damped so they don't smear), eighths on the mid drum, sixteenth pickups
    for (let k = 0; k < 4; k++) drum(k, 'big', k === 0 ? 0.95 : k === 2 ? 0.78 : 0.58, { len: k === 0 ? 0 : 1.3 });
    for (let k = 0; k < 4; k++) drum(k + 0.5, 'mid', k === 3 ? 0.4 : 0.32);
    drum(3.75, 'mid', 0.3);
    if (sec !== 'A') { // the rushing sixteenths on the rim (急急风-like drive), accents on 3+3+2
      for (let k = 0; k < 16; k++) drum(k / 4, 'rim', [0, 3, 6, 8, 11, 14].includes(k) ? 0.17 : 0.09, { send: 0.18 });
    }
    if (sec === 'C') { drum(1.25, 'edge', 0.3); drum(1.75, 'edge', 0.34); drum(3.25, 'edge', 0.3); }
    if (n % 2 === 0) gong(0, 'daluo', n % 8 === 0 ? 0.42 : 0.34, { rate: n % 4 === 0 ? 0.92 : 1.02 });
    if (n % 8 === 0) { gong(0, 'tamtam', 0.34); cym(0, 'crash', 0.3); }
    else if (n % 4 === 0) cym(0, 'crash', 0.24);
    else if (n % 2 === 1) cym(3, 'choke', 0.16);
    if (n === 7 || n === 15) { drum(3, 'mid', 0.4); drum(3.25, 'mid', 0.44); drum(3.5, 'mid', 0.48); drum(3.75, 'mid', 0.52); }
    if (n === 22) E.push(ev(B(1), 'droll', { kind: 'mid', dur: B(6.75), hz0: 8, hz1: 22, g0: 0.05, g1: 0.36, send: 0.3, pan: 0.15 }));
    if (n === 23) { drum(3.5, 'big', 0.75); drum(3.5, 'edge', 0.4); }
    swellInto(n < 8 ? 8 : n < 16 ? 16 : FORM, 'cymbal', 'crashRev', 3.2, 0.2);
    if (n === 4 || n === 16) E.push(ev(B(0.02), 'tbell', { midi: 33, gain: 0.16, lp: 1700, send: 0.8, pan: -0.3 }));
  };
  if (p2) P2(); else P1();

  // ---- the voice of the scene
  if (!p2) {
    if (n === 12 && loop % 2 === 0) E.push(ev(0, 'suona', { notes: cryNotes(CRY.low), gain: 0.04, send: 0.5, pan: 0.12, vib: 34 }));
    if (n === 20 && loop % 2 === 1) E.push(ev(0, 'suona', { notes: cryNotes(CRY.short), gain: 0.038, send: 0.5, pan: 0.12, vib: 36 }));
  } else {
    const t = THEME[n];
    if (t && sec !== 'A') {
      E.push(ev(0, 'phrase', { notes: themeNotes(t), sex: 'male', voices: 4, spread: 14, vib: 9, vibRate: 4.6, gain: 0.05, send: 0.55,
        glide: 0.1, breath: 0.05, attack: 0.2, release: 0.8, dip: 0.15, pan: -0.1 }));
      if (sec === 'C') E.push(ev(0, 'phrase', { notes: themeNotes(t, 12), sex: 'female', voices: 3, spread: 12, vib: 18, gain: 0.026, send: 0.65,
        glide: 0.08, breath: 0.04, attack: 0.25, release: 0.9, dip: 0.12, pan: 0.15 }));
    }
    if (n === 12) E.push(ev(0, 'suona', { notes: cryNotes(CRY.low), gain: 0.05, send: 0.45, pan: 0.14, vib: 36 }));
    if (n === 16) E.push(ev(0, 'suona', { notes: cryNotes(CRY.c1), gain: 0.052, send: 0.45, pan: 0.14, vib: 36 }));
    if (n === 20) E.push(ev(0, 'suona', { notes: cryNotes(CRY.c2), gain: 0.056, send: 0.45, pan: 0.14, vib: 38 }));
  }
  return { len: BAR, events: E };
}

// ================================================================ opening (the merged opening cinematic, one-shot)
// One continuous piece from the click to the fight (src/niumo/mv.js):
// 0 black: wind and a burning plain | 2.6 ash | 5.4 the ridge: a far bell, one monk | 10 the caldera: the big gong
// sinks, the monks gather | 13.6 the mountain breathes | 16.6 the walk in under his knee: the suona's lonely cry over a
// quickening heartbeat, the swell | 22 THE TITLE: drums, tam-tam, cymbal, choir (the loudest moment) | 26.4 the eyes
// open: bell, sinking gong, drum | 27.6 the parley: a held breath of a bed (a low chant, lava, wind, a far drum now and
// then) under the spoken lines, fading out by ~53 s. The roar and the first bar of 'niumo_phase1' close it in the game.
function openingBar(i) {
  if (i > 0) return null;
  const C = NIUMO_CUES.opening, E = [];
  const drum = (at, kind, g, x = {}) => E.push(ev(at, 'wardrum', { kind, gain: g, send: x.send ?? 0.5, rate: x.rate ?? 1, pan: x.pan ?? -0.05, len: x.len ?? 0 }));
  const T = C.title;
  // 1 black -> ash: the wind carries the whole piece (and dies under the parley)
  E.push(ev(0, 'wind', {
    gain: 0.21, gust: 0.75, send: 0.25,
    levels: [[0, 0], [1.2, 0.75], [4.6, 1], [6, 0.7], [10, 0.45], [16, 0.32], [20.6, 0.4], [21.4, 0.1], [22.2, 0], [23.6, 0.3], [27, 0.42],
      [38, 0.36], [46, 0.26], [51, 0.1], [54, 0.03], [58, 0]],
  }, 58));
  E.push(ev(0.2, 'fire', { gain: 0.085, crackle: 0.65, lp: 3800, send: 0.35, levels: [[0, 0], [1.8, 1], [5, 1], [7, 0.5], [10.4, 0]] }, 10.4));
  E.push(ev(2.2, 'lava', { gain: 0.06, activity: 0.25, send: 0.35, levels: [[0, 0], [3, 0.7], [7.5, 1], [11, 1.1], [13.6, 0]] }, 13.6));
  // 2 the ridge: a temple bell far away on the cut, then one monk begins to chant
  E.push(ev(C.ridge, 'tbell', { midi: 33, gain: 0.17, lp: 1500, send: 0.95, pan: -0.2 }));
  E.push(ev(C.ridge + 0.3, 'monk', {
    midi: 33, voices: 1, gain: 0.017, growl: 0.22, send: 0.6, attack: 1.8, release: 1.4,
    vowels: [[0, 'u'], [2.4, 'o'], [5.5, 'u']], overtones: [[0, 6], [2.6, 8], [4.4, 7], [5.6, 8]],
  }, 6.4));
  // 3 the caldera: the gong falls, the far drum, the monks gather
  E.push(ev(C.caldera, 'gong', { kind: 'daluo', gain: 0.22, rate: 0.8, send: 0.7 }));
  drum(C.caldera, 'big', 0.42, { send: 0.65 });
  drum(C.caldera + 1.8, 'big', 0.22, { send: 0.75, rate: 0.97 });
  E.push(ev(C.caldera + 0.3, 'monk', {
    midi: 33, voices: 4, gain: 0.016, growl: 0.4, send: 0.55, attack: 2.6, release: 0.6,
    vowels: [[0, 'u'], [2.5, 'o'], [5, 'a'], [8, 'o']], overtones: [[0, 8], [2, 9], [3.6, 8], [5.4, 10], [7, 8], [8.6, 7]],
  }, 10.0));
  E.push(ev(C.caldera + 1.5, 'choir', { notes: [45, 52], vowel: 'u', voices: 2, gain: 0.018, attack: 3, release: 0.6, send: 0.7, breath: 0.05, vib: 8 }, 5.6));
  // 4 the mountain breathes: in, a held beat, out
  drum(C.breath, 'big', 0.45, { send: 0.55 });
  E.push(ev(C.breath + 0.2, 'breath', { inhale: 1.4, hold: 0.25, exhale: 1.6, gain: 0.11, send: 0.5 }));
  E.push(ev(C.breath - 0.4, 'lava', { gain: 0.08, activity: 0.7, send: 0.35, levels: [[0, 0], [0.8, 0.8], [3.4, 1], [6, 0.7], [8.4, 0.5], [9, 0]] }, 9));
  // 5 the walk in under his knee: a drum, a choked cymbal; the suona's cry over a quickening heartbeat
  drum(C.knee, 'big', 0.6);
  E.push(ev(C.knee, 'cymbal', { kind: 'choke', gain: 0.12, send: 0.5, pan: 0.2 }));
  for (const [at, g] of [[18.5, 0.22], [19.8, 0.27], [20.75, 0.32], [21.45, 0.36]]) drum(at, 'big', g, { send: 0.6 });
  E.push(ev(C.knee + 0.5, 'suona', {
    notes: [[76, 0.7, { scoop: 3 }], [81, 1.5, { scoop: 2, vib: 1.1 }], [79, 0.35], [81, 0.35], [84, 1.1, { vib: 1.25, sob: 0.5 }], [81, 1.2, { fall: 5, vib: 1 }]],
    gain: 0.06, send: 0.6, pan: 0.1, vib: 34,
  }));
  // the swell into the title
  E.push(ev(T - 7.5, 'gong', { kind: 'tamtamRev', gain: 0.3, send: 0.5 }));
  E.push(ev(T - 3.2, 'cymbal', { kind: 'crashRev', gain: 0.28, send: 0.45, pan: -0.15 }));
  E.push(ev(T - 5.0, 'droll', { kind: 'mid', dur: 4.85, hz0: 5, hz1: 17, g0: 0.02, g1: 0.25, send: 0.35 }));
  E.push(ev(T - 5.6, 'monk', {
    midi: 33, voices: 5, gain: 0.028, growl: 0.6, send: 0.5, envelope: 'swell', attack: 5.4, release: 0.12,
    vowels: [[0, 'u'], [2.4, 'o'], [4.4, 'a']], overtones: [[0, 6], [2, 8], [3.6, 10], [4.9, 12]],
  }, 5.45));
  E.push(ev(T - 4.6, 'choir', { notes: [45, 52, 57], vowel: 'o', vowelTo: 'a', morph: 4, voices: 3, gain: 0.046, envelope: 'swell', attack: 4.45, release: 0.12, send: 0.6, breath: 0.06, vib: 12 }, 4.45));
  // 6 the title
  drum(T, 'big', 0.95, { rate: 0.9, send: 0.45, pan: -0.15 });
  drum(T + 0.004, 'big', 0.75, { rate: 0.8, send: 0.45, pan: 0.18 });
  drum(T, 'edge', 0.45, { send: 0.4 });
  drum(T + 0.01, 'mid', 0.4, { send: 0.4, pan: 0.25 });
  E.push(ev(T, 'gong', { kind: 'tamtam', gain: 0.52, send: 0.6 }));
  E.push(ev(T, 'gong', { kind: 'daluo', gain: 0.36, rate: 0.75, send: 0.6, pan: -0.15 }));
  E.push(ev(T, 'cymbal', { kind: 'crash', gain: 0.42, send: 0.5, pan: 0.2 }));
  E.push(ev(T, 'boom', { f0: 62, f1: 26, glide: 0.5, tau: 0.75, gain: 0.5, send: 0.25 }));
  E.push(ev(T + 0.02, 'tbell', { midi: 33, gain: 0.26, send: 0.8 }));
  E.push(ev(T, 'choir', { notes: [45, 52, 57, 64, 69], vowel: 'a', voices: 3, gain: 0.06, attack: 0.05, release: 2.4, send: 0.75, vib: 14, breath: 0.06 }, 1.6));
  E.push(ev(T, 'lava', { gain: 0.1, activity: 0.5, send: 0.35, levels: [[0, 0.9], [3, 0.5], [4.4, 0.3]] }, 4.4));
  drum(T + 2.6, 'big', 0.26, { send: 0.75 });
  // 7 the eyes open: the bell, the sinking gong, one drum (well under the title)
  E.push(ev(C.eyes, 'tbell', { midi: 28, gain: 0.2, send: 0.85 }));
  E.push(ev(C.eyes, 'gong', { kind: 'daluo', gain: 0.2, rate: 0.66, send: 0.7 }));
  drum(C.eyes, 'big', 0.4, { rate: 0.9, send: 0.55 });
  E.push(ev(C.eyes, 'boom', { f0: 50, f1: 30, glide: 0.6, tau: 0.6, gain: 0.12, send: 0.3 }));
  // 8 the parley: a bed for the spoken lines (low, dark, no melody), fading out toward the end
  const P = C.parley;
  E.push(ev(P - 0.6, 'monk', {
    midi: 33, voices: 3, gain: 0.013, growl: 0.35, send: 0.65, attack: 3.5, release: 3.2,
    vowels: [[0, 'u'], [7, 'o'], [14, 'u'], [19, 'o']], overtones: [[0, 6], [5, 7], [9, 6], [13, 8], [18, 6]],
  }, 24));
  E.push(ev(P + 3, 'choir', { notes: [45, 52], vowel: 'u', voices: 2, gain: 0.009, attack: 5, release: 4, send: 0.75, breath: 0.04, vib: 7 }, 18));
  E.push(ev(P - 1, 'lava', { gain: 0.07, activity: 0.45, send: 0.35, levels: [[0, 0], [3, 0.8], [14, 0.9], [21, 0.55], [25, 0.15], [27, 0]] }, 27));
  // the mountain's heartbeat, far off, now and then
  for (const [at, g] of [[P + 6.2, 0.16], [P + 13.4, 0.15], [P + 19.6, 0.1]]) drum(at, 'big', g, { send: 0.85, rate: 0.94 });
  E.push(ev(P + 9.6, 'tbell', { midi: 28, gain: 0.06, lp: 1100, send: 1.0, pan: 0.3 }));
  return { len: C.end, events: E };
}

// ================================================================ ambient (title, approach, waiting)
// wind and lava, a far monk on alternate cycles, one temple bell, a few scattered far drums
function ambientBar(i) {
  const r = barRng(i, 3), L = 26, E = [];
  E.push(ev(0, 'wind', { gain: 0.045, gust: 0.55, fadeIn: 2, fadeOut: 2, send: 0.25 }, L + 2, true));
  E.push(ev(0, 'lava', { gain: 0.028, activity: 0.3, fadeIn: 2, fadeOut: 2, send: 0.35 }, L + 2, true));
  if (i % 2 === 1) E.push(ev(r() * 6, 'fire', { gain: 0.03, crackle: 0.5, lp: 2600, fadeIn: 3, fadeOut: 3, send: 0.4 }, 12));
  if (i % 2 === 0) {
    E.push(ev(2.5 + r() * 3, 'monk', {
      midi: 33, voices: 2, gain: 0.02, growl: 0.2, send: 0.8, attack: 3, release: 3,
      vowels: [[0, 'u'], [5, 'o'], [9, 'u']], overtones: [[0, 8], [4, 7], [7, 6], [9.5, 8]],
    }, 12));
  }
  E.push(ev(7 + r() * 11, 'tbell', { midi: r() < 0.5 ? 33 : 28, gain: 0.065, lp: 1200, send: 1.0, pan: r() * 0.8 - 0.4 }));
  const hits = 1 + Math.floor(r() * 3);
  for (let k = 0; k < hits; k++) E.push(ev(1 + r() * (L - 3), 'wardrum', { kind: 'big', gain: 0.045 + r() * 0.045, rate: 0.94 + r() * 0.06, send: 0.85, pan: r() * 1.2 - 0.6 }));
  return { len: L, events: E };
}

// ================================================================ ending (rain and a guqin)
// D yu mode (D F G A C). Each 48 s cycle: the rain bed (equal-power overlap), a guqin phrase set, a far bell.
// [seconds, midi, args]   h: harmonic (泛音)   s: slides [[after, semitones, glide]]   v: vibrato (cents)
const QIN = [
  [ // cycle 0: the rain settles, then the open strings, harmonics, a melody with slides, the low D again
    [6.0, 38, { dur: 6, gain: 0.26 }], [8.6, 45, { dur: 5, gain: 0.19 }],
    [10.8, 62, { h: 1, gain: 0.13 }], [11.6, 57, { h: 1, gain: 0.11 }],
    [13.2, 48, { dur: 3, gain: 0.2, s: [[0.35, 2, 0.28]], v: 12 }],
    [16.0, 48, { dur: 3, gain: 0.18, s: [[0.45, -3, 0.5]] }],
    [19.0, 53, { dur: 2, gain: 0.17 }], [20.6, 55, { dur: 1.4, gain: 0.16 }], [21.6, 57, { dur: 3, gain: 0.18, v: 22 }],
    [24.5, 60, { dur: 2.6, gain: 0.17, s: [[0.6, -3, 0.6]] }], [27.0, 55, { dur: 2, gain: 0.15 }], [28.8, 50, { dur: 6, gain: 0.2, v: 14 }],
    [33.5, 62, { h: 1, gain: 0.11 }], [34.3, 69, { h: 1, gain: 0.1 }], [35.0, 74, { h: 1, gain: 0.09 }], [35.9, 72, { h: 1, gain: 0.09 }],
    [36.6, 69, { h: 1, gain: 0.1 }], [37.6, 67, { h: 1, gain: 0.1 }], [38.8, 69, { h: 1, gain: 0.11 }],
    [41.0, 38, { dur: 6, gain: 0.24 }], [41.03, 45, { dur: 6, gain: 0.17 }],
  ],
  [ // cycle 1: the middle register, rising slides, then the low strings
    [4.0, 45, { dur: 3, gain: 0.18 }], [6.0, 50, { dur: 2.4, gain: 0.18, s: [[0.5, 3, 0.4]] }],
    [8.5, 55, { dur: 2, gain: 0.16 }], [10.0, 57, { dur: 3, gain: 0.17, v: 20 }],
    [12.5, 55, { dur: 2.5, gain: 0.15, s: [[0.5, -2, 0.45]] }], [15.0, 50, { dur: 5, gain: 0.19, v: 12 }],
    [20.0, 57, { h: 1, gain: 0.11 }], [20.9, 62, { h: 1, gain: 0.1 }], [21.7, 67, { h: 1, gain: 0.1 }], [22.6, 69, { h: 1, gain: 0.11 }],
    [26.0, 48, { dur: 3, gain: 0.19, s: [[0.4, 2, 0.3]], v: 14 }], [30.0, 41, { dur: 3, gain: 0.17 }], [31.2, 45, { dur: 3, gain: 0.16 }],
    [34.0, 38, { dur: 7, gain: 0.25 }],
  ],
  [ // cycle 2: almost nothing; harmonics like drops in the rain, one low D
    [8.0, 74, { h: 1, gain: 0.09 }], [9.1, 69, { h: 1, gain: 0.09 }], [10.6, 62, { h: 1, gain: 0.1 }],
    [21.0, 50, { dur: 4, gain: 0.16, v: 10 }], [24.0, 45, { dur: 4, gain: 0.15, s: [[0.5, -2, 0.6]] }],
    [36.0, 38, { dur: 7, gain: 0.22 }], [36.03, 50, { dur: 6, gain: 0.12 }],
  ],
];
export const NIUMO_GUQIN_NOTES = [...new Set(QIN.flat().filter(([, , a]) => !a.h).map(([, m]) => m))];

function endingBar(i) {
  const L = 48, E = [], first = i === 0;
  E.push(ev(0, 'rain', { gain: 0.3, fadeIn: first ? 5 : 3, fadeOut: 3, close: 0.6, low: 0.5, sizzle: first ? 1 : 0, sizzleFade: 22, send: 0.25 }, L + 3, true));
  if (first) E.push(ev(0, 'lava', { gain: 0.07, activity: 0.2, send: 0.35, levels: [[0, 0.7], [2, 1], [8, 0.5], [20, 0]] }, 20));
  for (const [at, midi, a] of QIN[i % QIN.length]) {
    E.push(ev(at, 'guqin', {
      midi, harmonic: !!a.h, dur: a.dur ?? 3, gain: a.gain, slides: a.s || null, vib: a.v || 0, send: 0.55,
      pan: (midi - 52) * 0.012, tau: a.h ? 1.4 : 1.3,
    }));
  }
  if (i % 2 === 0) E.push(ev(31.5, 'tbell', { midi: 38, gain: 0.09, lp: 1000, send: 1.0, pan: -0.35 }));
  return { len: L, events: E };
}

// ================================================================ defeat (one-shot)
function defeatBar(i) {
  if (i > 0) return null;
  return {
    len: 11,
    events: [
      ev(1.10, 'gong', { kind: 'daluo', gain: 0.4, rate: 0.72, send: 0.6, len: 6.2 }),
      ev(1.10, 'wardrum', { kind: 'big', gain: 0.5, rate: 0.88, send: 0.45 }),
      ev(1.10, 'boom', { f0: 50, f1: 26, glide: 0.8, tau: 0.6, gain: 0.3, send: 0.2 }),
      ev(1.35, 'monk', {
        midi: 33, voices: 3, gain: 0.05, growl: 0.35, send: 0.6, attack: 0.5, release: 2.0,
        vowels: [[0, 'o'], [1.5, 'u']], overtones: [[0, 8], [1.8, 6]], glide: { at: 0.8, to: -5, time: 2.6 },
      }, 3.3),
      ev(1.45, 'tbell', { midi: 28, gain: 0.18, lp: 1100, send: 0.85, len: 6.0 }),
    ],
  };
}

const GRID = { beat: BEAT, beats: 4 };
export const NIUMO_SCORES = {
  niumo_opening: { bar: openingBar },
  niumo_ambient: { bar: ambientBar },
  niumo_phase1: { bar: (i) => battleBar(i, 1), grid: GRID },
  niumo_phase2: { bar: (i) => battleBar(i, 2), grid: GRID },
  niumo_ending: { bar: endingBar },
  niumo_defeat: { bar: defeatBar },
};
export const NIUMO_STATES = Object.keys(NIUMO_SCORES);
export const NIUMO_LOOPING = ['niumo_ambient', 'niumo_phase1', 'niumo_phase2', 'niumo_ending'];
