// 火焰山 · 牛魔 HUD: the shared UI (src/ui.js: boss bar with chip damage, cards, subtitles, hint, reticle) plus the
// monkey's mana bar (芭蕉扇), the chapter card (回目) and the MV narration line. niumo.html provides the DOM.
import { UI } from '../ui.js';

const $ = s => document.querySelector(s);

export class NiumoUI extends UI {
  constructor() {
    super();
    this.mp = $('#mp .fill'); this.mpBar = $('#mp');
    this.chapter = $('#chapter');
    this.mvText = $('#mvtext');
    this.narr = '';
  }

  /** Player bars: hp (with chip), stamina, mana (the fan). The shared UI's flask counter does not exist here. */
  setPlayer(hp, hpMax, st, stMax, mp = 0, mpMax = 100) {
    const f = Math.max(0, hp / hpMax);
    if (f < this.vals.hp) this.vals.hpChipHold = 0.6;
    this.vals.hp = f;
    this.hp.style.width = (f * 100) + '%';
    this.st.style.width = (Math.max(0, st / stMax) * 100) + '%';
    const m = Math.max(0, Math.min(1, mp / (mpMax || 1)));
    if (Math.abs(m - (this.vals.mp ?? -1)) > 1e-3) {
      this.vals.mp = m;
      this.mp.style.width = (m * 100) + '%';
      this.mpBar.classList.toggle('low', m < 0.25);
    }
  }

  /** The chapter card (回目卡). */
  showChapter(on) { this.chapter.classList.toggle('on', !!on); }
  get chapterText() { return this.chapter.querySelector('.page')?.dataset.text || ''; }

  /** One narration line of the opening cinematic ('' hides it). */
  narrate(text) {
    if (text === this.narr) return;
    this.narr = text;
    if (text) {
      this.mvText.textContent = text; this.mvText.dataset.text = text; this.mvText.dataset.speaker = '';
      this.mvText.classList.remove('line'); this.mvText.classList.add('on');
    } else this.mvText.classList.remove('on');
  }

  /** A spoken line: the speaker's name small above it (same place as the narration; '' hides it). */
  speak(name, text, speaker = '') {
    const key = text ? name + '|' + text : '';
    if (key === this.narr) return;
    this.narr = key;
    const el = this.mvText;
    if (!text) { el.classList.remove('on'); return; }
    el.textContent = '';
    const who = document.createElement('span'); who.className = 'who'; who.textContent = name;
    el.append(who, document.createTextNode(text));
    el.dataset.text = text; el.dataset.speaker = speaker;
    el.classList.add('on', 'line');
  }

  letterbox(on) { document.getElementById('letterbox').classList.toggle('on', !!on); }
  clearCard() { this.card.classList.remove('on'); this.cardTimer = 0; }
}
