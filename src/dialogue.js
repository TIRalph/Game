import { DIALOGUES, SPEAKERS } from './story.js';
import { sfx } from './audio.js';

// Caixa de diálogo com efeito de máquina de escrever e escolhas.
export class DialogueUI {
  constructor() {
    this.el = document.getElementById('dialogue');
    this.nameEl = document.getElementById('dlg-name');
    this.textEl = document.getElementById('dlg-text');
    this.choicesEl = document.getElementById('dlg-choices');
    this.hintEl = document.getElementById('dlg-hint');
    this.active = false;
    this.typing = false;
    this.el.addEventListener('click', (e) => { if (!e.target.closest('button')) this.advance(); });
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); this.advance(); }
      const n = parseInt(e.key, 10);
      if (n >= 1 && this.choices && this.choices[n - 1]) this.pick(this.choices[n - 1]);
    });
  }

  // Roda um diálogo. onAction(action) é chamado para escolhas com action; onDone ao terminar.
  run(id, ctx = {}, onAction = () => {}, onDone = () => {}) {
    this.ctx = ctx;
    this.onAction = onAction;
    this.resolve = onDone;
    this.active = true;
    this.el.classList.remove('hidden');
    this.load(id);
  }

  load(id) {
    const lines = DIALOGUES[id];
    if (!lines) { console.warn('[diálogo] não existe:', id); return this.finish(); }
    this.lines = lines;
    this.idx = 0;
    this.show();
  }

  fill(text) {
    return text.replace(/\{(\w+)\}/g, (_, k) => {
      const v = this.ctx[k];
      return typeof v === 'function' ? v() : (v ?? '');
    });
  }

  show() {
    if (this.idx >= this.lines.length) return this.finish();
    const line = this.lines[this.idx];
    if (!line.t) { // salto puro
      if (line.next) return this.load(line.next);
      this.idx++; return this.show();
    }
    const sp = SPEAKERS[line.s] || SPEAKERS.narrador;
    this.nameEl.textContent = sp.name;
    this.nameEl.style.color = sp.color;
    this.nameEl.classList.toggle('hidden', !sp.name);
    this.textEl.classList.toggle('narration', line.s === 'narrador');
    this.full = this.fill(line.t);
    this.shown = 0;
    this.typing = true;
    this.choices = null;
    this.choicesEl.innerHTML = '';
    this.hintEl.classList.add('hidden');
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.shown += 2;
      this.textEl.textContent = this.full.slice(0, this.shown);
      if (this.shown >= this.full.length) this.endTyping();
    }, 16);
  }

  endTyping() {
    clearInterval(this.timer);
    this.typing = false;
    this.textEl.textContent = this.full;
    const line = this.lines[this.idx];
    if (line.choices) {
      this.choices = line.choices;
      this.choicesEl.innerHTML = '';
      line.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.textContent = `${i + 1}. ${this.fill(c.t)}`;
        b.onclick = () => this.pick(c);
        this.choicesEl.appendChild(b);
      });
    } else this.hintEl.classList.remove('hidden');
  }

  advance() {
    if (!this.active) return;
    if (this.typing) return this.endTyping();
    if (this.choices) return;
    sfx.parryWhiff();
    this.idx++;
    this.show();
  }

  pick(c) {
    sfx.pickup();
    this.choices = null;
    if (c.action) this.onAction(c.action);
    if (!this.active) return; // a ação pode ter encerrado o diálogo
    if (c.next === null) return this.finish();
    if (c.next) return this.load(c.next);
    this.idx++;
    this.show();
  }

  finish() {
    clearInterval(this.timer);
    this.active = false;
    this.el.classList.add('hidden');
    const r = this.resolve;
    this.resolve = null;
    if (r) r();
  }
}
