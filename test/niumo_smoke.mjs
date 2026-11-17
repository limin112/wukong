#!/usr/bin/env node
// 火焰山 · 牛魔 smoke test:  node test/niumo_smoke.mjs <scenario|all> [outDir]
//   boot     splash ready, no console errors / warnings, the real scene loaded (no module fell back), ?autostart&skipmv
//            goes straight to the fight + fps
//   mv       the opening cinematic in one piece: the chapter card, every shot, the narration, the title card, the
//            spoken exchange (each line audible, in order, never overlapping, subtitles in sync), the roar, the camera
//            landing on the fight camera, the fight with its music; then a second run skipped with Enter
//   fight    weak points take damage from the monkey's staff; his moves land on the monkey; every key works
//   phase2   the seated prologue is over (a few blows): the 山崩 cutscene (he stands, sweeps the monkey off his feet, the
//            monkey answers with 法相天地), phase two as a duel of giants
//   ending   he falls into the lake, the volcano dies, rain, the card 火焰山 · 熄; R retries
//   demo     ?demo: the splash offers the demo and starts the cinematic by itself; with ?skipmv the demo player
//            fights (3x speed): it hurts him, dodges, attacks, survives
//   perf     frames per second in the fight at W×H (default 1280×720)
// Fails on any console error or warning, on any module fallback (a stub in use) and on failed checks.
// STUB=bull,arena forces those modules to their stubs (development aid; implies a fallback, so use with ALLOW_STUBS).
// ALLOW_STUBS=1 tolerates module fallbacks (and the 404s of the missing module files) while the other builders' modules
// are not in yet; they are still listed. Placeholder art (missing niumo_*.glb) is allowed and listed.
// Screenshots: test/out/niumo/main/<scenario>_<name>.png. Never uses port 5173 (random port).
import fs from 'node:fs';
import { startServer } from '../serve.mjs';

const require = (await import('node:module')).createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const [which = 'all', outDir = 'test/out/niumo/main'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const ALLOW_STUBS = !!process.env.ALLOW_STUBS;
const OPTIONAL_ASSET = /\/assets\/(models|textures)\/niumo_[^/]*$/;
const MODULE_FILE = /\/src\/niumo\/(arena|bull|monkey|input|camera|moves_monkey|moves_bull)\.js$/;

const server = await startServer(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 900000,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const errors = [], notes = [];
page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
page.on('console', m => {
  const type = m.type(), text = m.text(), url = (m.location() && m.location().url) || '';
  if (!['error', 'warning', 'warn'].includes(type)) return;
  if (/favicon/.test(text + url)) return;
  if (/404/.test(text) && OPTIONAL_ASSET.test(url)) { notes.push('placeholder art: ' + url.replace(/^.*\/assets\//, 'assets/')); return; }
  if (/404/.test(text) && MODULE_FILE.test(url) && ALLOW_STUBS) { notes.push('module missing (stub): ' + url.replace(/^.*\/src\//, 'src/')); return; }
  if (/fonts\.(googleapis|gstatic)\.com/.test(text + url)) { notes.push('web font unavailable (offline?)'); return; }
  errors.push(`${type}: ${text}${url ? ' @ ' + url.replace(/^.*\/game\//, '') : ''}`);
});
page.on('requestfailed', r => { if (/fonts\.g/.test(r.url())) notes.push('web font request failed'); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let scenario = '';
const shot = async name => { await page.screenshot({ path: `${outDir}/${scenario}_${name}.png` }); console.log('  shot', `${scenario}_${name}.png`); };
const G = expr => page.evaluate(`(() => { const G = window.__niumo; return ${expr}; })()`);
const key = async (code, ms = 60) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
const failures = [];
const check = (ok, what) => { if (!ok) { failures.push(`${scenario}: ${what}`); console.log('  FAIL', what); } else console.log('  ok  ', what); };
const status = () => G(`({ state: G.state, bull: Math.round(G.bull.hp) + '/' + G.bull.maxHp + ' p' + G.bull.phase + ' ' + G.bull.state,
  monkey: Math.round(G.monkey.hp) + ' st' + Math.round(G.monkey.st) + ' mp' + Math.round(G.monkey.mp ?? 0) + ' ' + G.monkey.state,
  music: G.audio.musicState, arena: G.arenaPhase, fps: Math.round(G.fps), ms: +G.frameMs.toFixed(1) })`);
/** Pause the game loop while a screenshot is taken (so the frame is the one asked for). */
const frozenShot = async name => { await G('(G.paused = true, true)'); await sleep(90); await shot(name); await G('(G.paused = false, true)'); };

async function open(q) {
  if (process.env.STUB) q = (q ? q + '&' : '') + 'stub=' + process.env.STUB;     // dev: force stubs (needs ALLOW_STUBS)
  await page.goto(`http://127.0.0.1:${port}/index.html${q ? '?' + q : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || window.__error', { timeout: 120000, polling: 250 });
  const err = await page.evaluate('window.__error || null');
  if (err) throw new Error('boot failed: ' + err);
  const fb = await G('G.fallbacks.map(f => f.what + " (" + f.why.slice(0, 90) + ")")');
  const ph = await G('G.assetFallbacks');
  if (fb.length) {
    const list = [...new Set(fb)];
    if (ALLOW_STUBS) notes.push(...list.map(f => 'fallback: ' + f));
    else throw new Error('module fallback in use (a stub replaced a real module):\n    ' + list.join('\n    '));
  }
  for (const p of ph) notes.push('placeholder: ' + p);
}
/** Stand-ins picked up after boot (e.g. an audio state the audio build does not have yet) count as fallbacks too. */
async function lateFallbacks() {
  const fb = await G('G.fallbacks.map(f => f.what + " (" + f.why.slice(0, 90) + ")")').catch(() => []);
  const list = [...new Set(fb)];
  if (!list.length) return;
  if (ALLOW_STUBS) notes.push(...list.map(f => 'fallback: ' + f));
  else check(false, 'no module / audio fallback in use: ' + list.join('; '));
}
const waitState = (s, timeout = 30000) => page.waitForFunction(s => window.__niumo && window.__niumo.state === s, { timeout, polling: 50 }, s);
const fps = ms => page.evaluate(ms => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }), ms);

// ---------------------------------------------------------------- scenarios

const SCEN = {
  async boot() {
    await open('');
    check(await G('G.state') === 'splash', 'splash state on load');
    check(await page.evaluate(() => document.getElementById('splash').classList.contains('ready')), 'splash shows 点击开始');
    check(await G('Object.keys(G.voice.lines).length') >= 9, 'voice manifest loaded: ' + await G('Object.keys(G.voice.lines).join(",")'));
    await sleep(600); await shot('splash');
    await open('autostart&skipmv&debug');
    await waitState('fight', 20000);
    check(true, 'autostart&skipmv goes straight to the fight');
    check(await G('!!(G.arena && G.arena.group && G.arena.bounds && G.arena.lavaAt && G.arena.gradeHints)'), 'arena contract present');
    check(await G('!G.arena.stub') || ALLOW_STUBS, 'the real arena is loaded (not the stub)');
    await sleep(2000); await shot('fight');
    await page.keyboard.down('KeyS'); await sleep(1500); await page.keyboard.up('KeyS');
    await shot('walking');
    const f = await fps(3000);
    console.log('  fight fps', f.toFixed(1), JSON.stringify(await status()));
  },

  async mv() {
    await open('debug&god');
    await page.click('#splash');
    await waitState('mv', 20000);
    const cues = await G('G.cues');
    const seen = new Set();
    let chapter = null, chapterOn = false, titleShown = false;
    const sample = async () => {
      const s = await page.evaluate(() => { const el = document.getElementById('mvtext');
        return { narr: el.classList.contains('on') && !el.classList.contains('line') ? el.dataset.text : '',
          chapterOn: document.getElementById('chapter').classList.contains('on'), chapter: document.querySelector('#chapter .page').dataset.text,
          title: !document.getElementById('title').classList.contains('hide') }; });
      if (s.narr) seen.add(s.narr);
      if (s.chapterOn) { chapterOn = true; chapter = s.chapter; }
      if (s.title) titleShown = true;
    };
    const times = process.env.MVT ? process.env.MVT.split(',').map(Number) : [
      1.5, cues.ash + 1.6, cues.caldera + 2.2, cues.breath + 1.6, cues.knee + 1.4, cues.knee + 4.2,
      cues.title + 1.4, cues.title + 3.6, cues.eyes + 0.9];
    const t0 = Date.now();
    for (const t of times) {
      await page.waitForFunction(t => { const G = window.__niumo; return G.state !== 'mv' || (G.mv && G.mv.t >= t); }, { timeout: 90000, polling: 8 }, t);
      if (await G('G.state') !== 'mv') break;
      await sample();
      await frozenShot('t' + t.toFixed(1).replace('.0', '') + '_' + await G('G.mv.shotName'));
    }
    // the parley: one shot per line, in the middle of it (with its subtitle)
    const subs = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForFunction(i => { const G = window.__niumo; const v = G.voice.cur;
        return G.state !== 'mv' || (G.mv && G.mv.bi === i && v && v.t > v.dur * 0.55); }, { timeout: 60000, polling: 8 }, i);
      if (await G('G.state') !== 'mv') break;
      subs.push(await page.evaluate(() => { const el = document.getElementById('mvtext'); return el.classList.contains('on') ? el.dataset.speaker + ':' + el.dataset.text : ''; }));
      await frozenShot(`line${i + 1}_${await G('G.voice.cur.id')}`);
    }
    for (const [bi, bt, name] of [[6, 0.9, 'roar'], [7, 0.5, 'settle_a'], [7, 1.6, 'settle_b']]) {
      await page.waitForFunction((bi, bt) => { const G = window.__niumo; return G.state !== 'mv' || (G.mv && G.mv.bi === bi && G.mv.bt >= bt); }, { timeout: 30000, polling: 8 }, bi, bt);
      if (await G('G.state') !== 'mv') break;
      await frozenShot(name);
    }
    await waitState('fight', 20000);
    const dur = (Date.now() - t0) / 1000;
    await sleep(120);
    const jump = await G('G.cineEnd ? +G.cineEnd.pos.distanceTo(G.camera.position).toFixed(2) : -1');
    await shot('fight_start');
    check(chapterOn && chapter === '第一回　火焰山千年不熄　美猴王一棒问山', 'chapter card 第一回　火焰山千年不熄　美猴王一棒问山');
    for (const line of ['八百里火焰，四周围寸草不生。', '人说，那不是山。']) check(seen.has(line), 'narration 「' + line + '」');
    check(titleShown, 'the title card 火焰山 · 牛魔 appears inside the cinematic');
    const log = await G('G.voice.log');
    const ids = log.map(l => l.id);
    check(JSON.stringify(ids) === JSON.stringify(['b1', 'm1', 'b2', 'm2', 'b3', 'm3']), 'the six lines are spoken in order: ' + ids.join(' '));
    check(log.length && log.every(l => l.audible), 'every line is audible (decoded voice played): ' + log.map(l => l.id + (l.audible ? '' : '(silent)')).join(' '));
    check(log.every((l, i) => i === 0 || l.at >= log[i - 1].at + log[i - 1].dur - 0.05), 'lines never overlap');
    check(subs.length === 6 && subs.every(s => s && s.includes(':')), 'subtitles show with each line: ' + subs.join(' / '));
    check(subs.filter(s => s.startsWith('bull:')).length === 3 && subs.filter(s => s.startsWith('monkey:')).length === 3, 'both of them speak');
    // (the fight camera is already moving when the fight starts: it reframes the staff he has just brought down)
    check(jump >= 0 && jump < 1.0, `the cinematic ends on the fight camera (jump ${jump} m)`);
    check(await G('G.audio.musicState') === 'niumo_phase1', 'fight music on: ' + await G('G.audio.musicState'));
    check(await G('G.eyeK') >= 0.99, 'his eyes are open when the fight starts');
    check(await G('document.getElementById("title").classList.contains("hide")'), 'no title screen / menu between the cinematic and the fight');
    console.log('  cinematic ran', dur.toFixed(1), 's (incl. screenshot pauses); cues from audio:', await G('G.cuesFromAudio'), ' lines:', log.map(l => l.id + ' ' + l.dur + 's').join(', '));
    // skip: Enter goes straight to the fight
    await open('debug&god');
    await page.click('#splash');
    await page.waitForFunction(() => { const G = window.__niumo; return G.state === 'mv' && G.mv && G.mv.t > 4; }, { timeout: 30000, polling: 50 });
    await key('Enter');
    await waitState('fight', 4000).then(() => check(true, 'Enter skips straight to the fight'), () => check(false, 'Enter skips straight to the fight'));
    await sleep(1500); await shot('skipped_fight');
    check(await G('G.audio.musicState === "niumo_phase1" && !G.voice.busy'), 'after a skip: fight music, no voice left playing');
  },

  async fight() {
    await open('autostart&skipintro&god&debug');
    await waitState('fight', 20000);
    await sleep(800); await shot('start');
    await page.waitForFunction(() => { const G = window.__niumo; return G.btLast?.done && !G.input.locked && ['idle', 'move'].includes(G.monkey.state); }, { timeout: 20000, polling: 30 });     // (the opening's scripted bullet time: the controls are locked till his roll is done)
    check(await G('!!(G.btLast.auto && G.btLast.rolled && !G.btLast.hit)'), 'the opening bullet time plays by itself: he rolls out from under the staff, no key pressed');
    const chains = await G('G.bull.char?.droppedChains || 0');
    check(chains >= 10, `the chains at his wrists are gone (${chains} links dropped)`);
    // (this scenario is about the seated prologue: keep him seated however many blows land)
    await G('(G.bull.T.preludeHits = 999, G.bull.T.preludeHp = 0, true)');
    // stand before the nearest weak point and work it with the staff
    const hp0 = await G('G.bull.hp');
    await G(`(() => { const t = G.nearestWeakPoint(); if (t) { const s = G.arena.bullSeat; const d = Math.hypot(t.pos.x - s.x, t.pos.z - s.z);
      G.monkey.pos.set(t.pos.x + (t.pos.x - s.x) / d * 1.2, 0, t.pos.z + (t.pos.z - s.z) / d * 1.2 + 1.0); } return true; })()`);
    await sleep(400);
    for (let i = 0; i < 8; i++) { await key('KeyJ', 50); await sleep(330); if (i === 1) await shot('combo'); }
    await sleep(500);
    const hp1 = await G('G.bull.hp');
    check(hp1 < hp0, `the staff hurts him (${Math.round(hp0)} → ${Math.round(hp1)})`);
    await key('KeyK', 700); await sleep(500); await shot('heavy');
    await key('KeyL', 600); await key('KeyI', 80); await sleep(500); await shot('fan');
    await key('Space', 60); await sleep(400);
    await page.keyboard.down('Space'); await page.keyboard.down('KeyS'); await sleep(900); await page.keyboard.up('KeyS'); await page.keyboard.up('Space');
    // let him attack: one of his moves has to land on the monkey
    const php0 = await G('G.monkey.hp');
    let hurt = false;
    for (let i = 0; i < 60 && !hurt; i++) { await sleep(500); hurt = (await G('G.monkey.hp')) < php0; if (i === 10) await shot('his_move'); }
    check(hurt, 'his moves land on the monkey');
    await shot('after');
    check(await page.evaluate(() => document.getElementById('hud').classList.contains('on') && document.getElementById('boss').classList.contains('on')), 'HUD and the 牛魔王 bar are up');
    console.log('  ', JSON.stringify(await status()));
  },

  async phase2() {
    await open('autostart&skipintro&god&debug');
    await waitState('fight', 20000);
    await sleep(800);
    await G('(G.bull.hp = G.bull.maxHp * 0.505, true)');
    await G('G.hitBull(G.bull.maxHp * 0.02, "kneeL")');
    await waitState('transition', 8000);
    for (let i = 0; i < 26; i++) {       // (the stand-up, then the sweep that throws him and 法相天地: about 45 s with its four lines)
      await page.waitForFunction(t => { const G = window.__niumo; return G.state !== 'transition' || (G.cut && G.cut.t >= t); }, { timeout: 30000, polling: 8 }, 0.6 + i * 2);
      if (await G('G.state') !== 'transition') break;
      await frozenShot('t' + (0.6 + i * 2).toFixed(1));
    }
    await waitState('fight', 40000);
    await sleep(1500); await shot('after');
    check(await G('G.bull.phase') === 2, 'the bull is in phase two');
    check(await G('G.arenaPhase') === 2, 'the arena erupted (phase 2)');
    check(await G('G.audio.musicState') === 'phase2' || await G('G.audio.musicState') === 'niumo_phase2', 'phase-two music: ' + await G('G.audio.musicState'));
    check(await G('G.monkey.giant && G.monkey.S > 15 && G.monkey.S * 1.5 < G.bull.T.height'), '法相天地: the monkey is a giant, a little smaller than the bull (' + await G('(G.monkey.S * 1.5).toFixed(0)') + ' m)');
    check(await G('G.monkey.hp === G.monkey.maxHp && G.bull.duel'), 'he is whole again and the duel is on');
    const said = await G('G.voice.log.map(l => l.id + (l.audible ? "" : "(silent)")).join(" ")');
    check(said === 'p1 p2 p3 p4', 'the 山崩 lines are spoken (牛魔王, 孙悟空, 牛魔王, 孙悟空): ' + said);
    // 金身: every 20% of his health lost he turns gold for 3 s; a blow on it does nothing and the monkey reels
    await G('(G.bull.autoAttack = false, G.bull.goldPending = false, G.bull.goldNext = 0.4, G.bull.hp = G.bull.maxHp * 0.41, true)');
    await page.waitForFunction(() => window.__niumo.bull.state === 'idle', { timeout: 15000, polling: 50 });
    await G('G.hitBull(G.bull.maxHp * 0.02, "body")');
    await page.waitForFunction(() => window.__niumo.bull.goldK > 0.9, { timeout: 5000, polling: 20 }).catch(() => {});
    const gold = await G('({ t: G.bull.goldT, k: G.bull.goldK })');
    check(gold.t > 1.5 && gold.k > 0.9, `金身: under 40% he turns gold (${gold.t.toFixed(2)} s left, glow ${gold.k.toFixed(2)})`);
    await shot('gold');
    const hpG = await G('G.bull.hp');
    await G('G.hitBull(50, "body")');
    await sleep(100);
    const reb = await G('({ hp: G.bull.hp, gold: G.bull.goldT, bull: G.bull.state, monkey: G.monkey.state, move: G.monkey.a.move && G.monkey.a.move.def.name })');
    check(reb.hp === hpG && reb.gold > 0, `a blow on the gold does nothing to him (hp ${Math.round(hpG)} -> ${Math.round(reb.hp)}, still gold)`);
    check(reb.monkey === 'hurt' && reb.bull !== 'stagger', `the monkey reels (${reb.monkey}, bull ${reb.bull})`);
    // 组合技: the gold ends and at once he runs at the monkey as the white bull
    await page.waitForFunction(() => window.__niumo.bull.goldT <= 0, { timeout: 6000, polling: 20 });
    await page.waitForFunction(() => window.__niumo.bull.beastOn, { timeout: 1500, polling: 16 }).catch(() => {});
    check(await G('!!(G.bull.atk && G.bull.atk.name === "charge" && G.bull.atk.combo && G.bull.beastOn)'), '组合技: the gold ends and he charges as the white bull at once');
    await shot('gold_combo');
    // 冲撞 as the white bull: a step aside when the coach says 现在闪 takes nothing
    await page.waitForFunction(() => { const G = window.__niumo; return G.bull.goldT <= 0 && G.bull.state === 'idle' && G.monkey.state === 'idle'; }, { timeout: 15000, polling: 50 });
    await G('(() => { const b = G.bull, m = G.monkey, f = b.fwd(); m.pos.x = b.pos.x + f.x * 150; m.pos.z = b.pos.z + f.z * 150; b.forceAttack("charge", m); return true; })()');
    await page.waitForFunction(() => window.__niumo.bull.beastOn, { timeout: 8000, polling: 16 });
    await shot('beast');
    check(await G('G.bull.beast.root.visible && !G.chars.bull.root.visible'), '冲撞: he runs as the white bull');
    await page.waitForFunction(() => { const at = window.__niumo.bull.atk; return !at || at.dodgeNow; }, { timeout: 8000, polling: 8 });
    const hpM = await G('G.monkey.hp');
    await key('Space');
    await page.waitForFunction(() => { const at = window.__niumo.bull.atk; return !at || at.fired.has('skid'); }, { timeout: 8000, polling: 20 });
    check(await G('G.monkey.hp') === hpM, `a step aside at 现在闪 dodges the charge (hp ${hpM} -> ${await G('G.monkey.hp')})`);
    await page.waitForFunction(() => !window.__niumo.bull.beastOn, { timeout: 8000, polling: 20 });
    check(await G('G.chars.bull.root.visible'), 'he is the bull king again after the skid');
    await G('(G.bull.autoAttack = true, true)');
    console.log('  ', JSON.stringify(await status()));
  },

  async ending() {
    await open('autostart&skipintro&god&debug');
    await waitState('fight', 20000);
    await sleep(600);
    await G('(G.bull.hp = G.bull.maxHp * 0.505, true)');
    await G('G.hitBull(G.bull.maxHp * 0.02, "kneeL")');
    await waitState('transition', 8000);
    await sleep(500); await key('Enter');          // skip the 山崩
    await waitState('fight', 20000);
    await sleep(1000);
    await G('(G.bull.hp = 10, true)');
    await G('G.hitBull(100, "head")');
    await waitState('ending', 8000);
    let card = '';
    for (const t of [1.2, 3.4, 6, 9, 12, 15.5, 19.5, 23, 25.5]) {
      await page.waitForFunction(t => { const G = window.__niumo; return !G.cut || G.cut.t >= t; }, { timeout: 60000, polling: 8 }, t);
      if (t > 19) card = await page.evaluate(() => document.getElementById('card').classList.contains('on') ? document.querySelector('#card .t').textContent : '');
      await frozenShot('t' + t);
    }
    check(card === '火焰山 · 熄', 'the card 火焰山 · 熄 (got "' + card + '")');
    const said = await G('G.voice.log.map(l => l.id + (l.audible ? "" : "(silent)")).join(" ")');
    check(said.endsWith('e1'), 'the ending line 「大哥……下雨了。」 is spoken: ' + said);
    check(await G('G.arenaPhase') === 3, 'the volcano died (arena phase 3)');
    const music = await G('G.audio.musicState');
    check(['niumo_ending', 'victory'].includes(music), 'ending music: ' + music);
    const horn = await G('(() => { const m = G.actor.root.position; return { y: +m.y.toFixed(2), visible: G.actor.root.visible }; })()');
    check(horn.visible && await G('G.monkey.S > 15'), 'the monkey stands by his rod in the last picture, the giant he ended the fight as');
    await page.waitForFunction(() => window.__niumo.cut && !window.__niumo.cut.running, { timeout: 30000, polling: 100 });
    await sleep(500); await shot('end');
    await key('KeyR');
    await page.waitForFunction(() => ['fight-wait', 'fight'].includes(window.__niumo.state), { timeout: 10000 });
    await sleep(1800);
    check(await G('G.bull.phase === 1 && !G.bull.dead && G.bull.hp === G.bull.maxHp'), 'R retries: the bull is whole again');
    check(await G('Math.abs(G.chars.bull.root.rotation.x) < 1e-6 && Math.abs(G.chars.bull.root.position.y - G.bull.seat.y) < 1e-3'), 'the body is back on its seat (altar height)');
    await shot('retry');
  },

  async demo() {
    // ?demo alone: the splash says 点击观看演示 and the opening cinematic starts by itself
    await open('demo');
    check(await page.evaluate(() => document.querySelector('#splash .go').textContent.replace(/\s/g, '')) === '点击观看演示', 'the splash offers the demo');
    await waitState('mv', 8000).then(() => check(true, '?demo starts the opening cinematic by itself'), () => check(false, '?demo starts the opening cinematic by itself'));
    check(await page.evaluate(() => getComputedStyle(document.getElementById('demotag')).display !== 'none'), 'the 演示 tag shows');
    await shot('mv');
    // ?demo&skipmv: the bot plays the fight through the input (sped up 3x for the test)
    await open('demo&skipmv&autostart&turbo=3');
    await waitState('fight', 20000);
    const hp0 = await G('G.bull.hp');
    const t0 = Date.now();
    let s = null, shots = 0;
    while (Date.now() - t0 < 45000) {
      await sleep(3000);
      s = await G('({ t: G.bot.stats.t, dealt: G.bot.stats.dmgDealt, taken: G.bot.stats.dmgTaken, rolls: G.bot.stats.rolls, lights: G.bot.stats.lights, heavies: G.bot.stats.heavies, deaths: G.deaths, state: G.state, hp: G.bull.hp, mhp: G.monkey.hp, active: G.bot.active })');
      if (shots < 3 && s.t > 20 * (shots + 1)) { await shot('fight_' + shots); shots++; }
      if (s.state === 'ending') break;
    }
    console.log('  ', JSON.stringify(s));
    check(s.t > 60 || s.state === 'ending', `the demo played ${s.t.toFixed(0)} s of fight${s.state === 'ending' ? ' and won it' : ''}`);
    check(s.dealt > 300 && s.hp < hp0, `the demo player hurts him (${Math.round(s.dealt)} damage, ${Math.round(hp0)} → ${Math.round(s.hp)})`);
    check(s.rolls >= 1 && s.lights + s.heavies > 5, `it dodges and attacks (${s.rolls} rolls, ${s.lights} light, ${s.heavies} heavy)`);
    check(s.deaths === 0, `it survives (deaths ${s.deaths}, hp ${Math.round(s.mhp)}, took ${Math.round(s.taken)})`);
  },

  async perf() {
    await open('autostart&skipintro&god&debug');
    await waitState('fight', 20000);
    await sleep(1500);
    await G(`(() => { const t = G.nearestWeakPoint(); if (t) G.monkey.pos.set(t.pos.x, 0, t.pos.z + 3.5); return true; })()`);
    const bot = (async () => { for (let i = 0; i < 18; i++) { await key(['KeyJ', 'KeyJ', 'KeyK', 'Space', 'KeyJ', 'KeyI'][i % 6], 60); await sleep(280); } })();
    const f = await fps(6000);
    await bot;
    const ms = await G('G.frameMs');
    console.log(`  fight: ${f.toFixed(1)} fps at ${W}x${H}, ${ms.toFixed(2)} ms CPU per frame`);
    check(f >= 50, `frame rate ≥ 50 fps (aim 60): ${f.toFixed(1)}`);
    await shot('fight');
  },

  // a phone in landscape (touch.js): tap to start, skip the cinematic with its button, walk with the stick, strike, roll
  async touch() {
    await page.emulate({ viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    try {
      await open('touch&god');
      check(await page.evaluate(() => document.body.classList.contains('touch') && !!document.getElementById('touch')), 'touch controls are on');
      check(await G('G.renderer ? G.renderer.getPixelRatio() <= 1.25 : true'), 'phone: pixel ratio capped');
      await page.waitForFunction(() => document.getElementById('splash').classList.contains('ready'), { timeout: 30000 });
      await page.touchscreen.tap(422, 200);
      await waitState('mv', 15000);
      await sleep(1500);
      const skip = await page.evaluate(() => { const b = document.querySelector('#touch .b-skip'); const r = b.getBoundingClientRect(); return getComputedStyle(b).display !== 'none' ? [r.x + r.width / 2, r.y + r.height / 2] : null; });
      check(!!skip, 'the cinematic shows 跳过');
      await shot('mv');
      if (skip) await page.touchscreen.tap(skip[0], skip[1]);
      await page.waitForFunction(() => ['fight', 'fight-wait'].includes(window.__niumo.state), { timeout: 20000, polling: 50 });
      check(true, '跳过 skips to the fight');
      await page.waitForFunction(() => window.__niumo.state === 'fight', { timeout: 20000, polling: 50 });
      await sleep(800);
      const btn = cls => page.evaluate(c => { const r = document.querySelector('#touch .' + c).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; }, cls);
      const L = await btn('b-atk');
      check(L[2] > 40 && await page.evaluate(() => document.querySelectorAll('#touch .btns button').length === 2), `two buttons, like a MOBA (攻 ${Math.round(L[2])} px)`);
      await shot('fight');
      // the stick: drag from the left half
      const p0 = await G('[G.monkey.pos.x, G.monkey.pos.z]');
      const cdp = await page.target().createCDPSession();
      const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await tp('touchStart', 150, 280); await tp('touchMove', 150, 250); await tp('touchMove', 150, 220);
      await sleep(900);
      const mv = await G('[G.input ? G.input.touchMove.y : null, G.monkey.state]');
      await shot('stick');
      await tp('touchEnd');
      const p1 = await G('[G.monkey.pos.x, G.monkey.pos.z]');
      check(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1, `the stick walks him (${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1)} m, stick y ${mv[0]})`);
      await sleep(300);
      await page.waitForFunction(() => { const G = window.__niumo; return G.btLast?.done && !G.input.locked && ['idle', 'move'].includes(G.monkey.state); }, { timeout: 20000, polling: 30 });     // (the opening's scripted bullet time: the controls are locked till his roll is done)
      // 攻: a tap strikes
      await page.touchscreen.tap(L[0], L[1]);
      await sleep(120);
      const st = await G('[G.monkey.state, G.monkey.a.move && G.monkey.a.move.def.name]');
      check(st[0] === 'attack', `攻 tap strikes (${st.join(' ')})`);
      await sleep(900);
      const R = await btn('b-dodge');
      // held: 攻 charges the heavy blow, 闪 guards
      await page.waitForFunction(() => ['idle', 'move'].includes(window.__niumo.monkey.state), { timeout: 15000, polling: 30 });
      await tp('touchStart', L[0], L[1]); await sleep(500);
      const hv = await G('[G.input.isHeld("heavy"), G.monkey.a.move && G.monkey.a.move.name, G.monkey.state, Math.round(G.monkey.st)]');
      await tp('touchEnd'); await sleep(900);
      check(hv[0] && hv[1] === 'heavy', `攻 held charges the heavy blow (${hv.join(' ')})`);
      await page.waitForFunction(() => ['idle', 'move'].includes(window.__niumo.monkey.state), { timeout: 15000, polling: 30 });
      await tp('touchStart', R[0], R[1]); await sleep(500);
      const gd = await G('[G.input.isHeld("block"), G.monkey.state]');
      await tp('touchEnd'); await sleep(400);
      check(gd[0], `闪 held guards (${gd.join(' ')})`);
      await page.waitForFunction(() => ['idle', 'move'].includes(window.__niumo.monkey.state), { timeout: 15000, polling: 30 });     // (the opening's bullet time slows his blow)
      const pre = await G('G.monkey.state');
      await page.touchscreen.tap(R[0], R[1]);
      const seen = [];
      for (let i = 0; i < 12; i++) { seen.push(await G('G.monkey.state + (G.input.spaceDownAt >= 0 ? "*" : "")')); await sleep(30); }
      check(seen.includes('roll'), `闪 rolls (before ${pre}: ${seen.join(' ')})`);
      const f = await fps(3000);
      console.log(`  phone 844x390@3x: ${f.toFixed(1)} fps (headless desktop GPU; a real phone is slower)`);
      // portrait: the rotate card
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await sleep(300);
      check(await page.evaluate(() => getComputedStyle(document.querySelector('#touch .rotate')).display === 'flex'), 'portrait asks to turn the phone');
      await shot('portrait');
    } finally {
      await page.emulate({ viewport: { width: W, height: H }, userAgent: await browser.userAgent() });
    }
  },
};

const order = which === 'all' ? Object.keys(SCEN) : which.split(',');
try {
  for (const s of order) {
    scenario = s;
    console.log(`== ${s}`);
    if (!SCEN[s]) throw new Error('unknown scenario ' + s);
    try { await SCEN[s](); await lateFallbacks(); } catch (e) { failures.push(`${s}: ${e.message}`); console.log('  ERROR', e.message); await shot('error').catch(() => {}); }
  }
} finally {
  const uniq = [...new Set(notes)];
  if (uniq.length) console.log('notes:\n  ' + uniq.join('\n  '));
  if (errors.length) console.log('console errors / warnings:\n  ' + [...new Set(errors)].slice(0, 25).join('\n  '));
  await browser.close(); server.close();
  const bad = failures.length + errors.length;
  console.log(bad ? `FAILED (${failures.length} checks, ${errors.length} console errors/warnings)` : 'PASSED');
  if (failures.length) console.log('  ' + failures.join('\n  '));
  process.exit(bad ? 1 : 0);
}
