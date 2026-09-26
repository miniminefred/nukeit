// The heads-up display and the full-screen overlays: loading, click-to-begin,
// paused, down, and the results of a job.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.els = {
      health: $('hp-fill'), healthText: $('hp-text'),
      title: $('obj-title'), height: $('obj-height'), bar: $('obj-fill'), note: $('obj-note'),
      slots: $('slots'), tip: $('tip'), flash: $('flash'), hurt: $('hurt'), fires: $('fires'),
    };
    this._flashT = 0;
    this._hurt = 0;
    this._slotsKey = '';
  }

  show(on) { this.root.classList.toggle('on', on); }

  setJob(job) {
    this.els.title.textContent = job.title;
    this.target = job.target;
    this.start = null;
  }

  setSlots(tools, current) {
    const key = tools.map((t) => t.id).join() + '|' + current;
    if (key === this._slotsKey) return;
    this._slotsKey = key;
    this.els.slots.innerHTML = tools.map((t, i) => `<div class="slot${i === current ? ' on' : ''}"><b>${i + 1}</b>${t.name}</div>`).join('');
  }

  flash(text, seconds = 2.5) {
    this.els.flash.textContent = text;
    this.els.flash.classList.add('on');
    this._flashT = seconds;
  }

  hurt(amount) { this._hurt = Math.min(1, this._hurt + amount / 40); }

  update(dt, { health, height, tip, fires, done }) {
    this.els.health.style.width = `${Math.max(0, health)}%`;
    this.els.health.classList.toggle('low', health < 30);
    this.els.healthText.textContent = Math.ceil(health);
    if (height !== null) {
      if (this.start === null) this.start = height;
      const over = Math.max(0, height - this.target);
      const k = 1 - over / Math.max(1, this.start - this.target);
      this.els.height.textContent = done ? `${height.toFixed(1)} m — below ${this.target} m` : `${height.toFixed(1)} m standing`;
      this.els.note.textContent = done ? 'Target reached' : `Bring it below ${this.target} m`;
      this.els.bar.style.width = `${Math.min(100, Math.max(0, k * 100))}%`;
      this.els.bar.classList.toggle('done', !!done);
    }
    this.els.tip.textContent = tip ?? '';
    this.els.fires.textContent = fires > 0 ? `\u{1F525} ${fires} burning` : '';
    this.els.fires.classList.toggle('on', fires > 0);
    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0) this.els.flash.classList.remove('on');
    }
    this._hurt = Math.max(0, this._hurt - dt * 0.9);
    this.els.hurt.style.opacity = this._hurt.toFixed(3);
  }
}

// ---------------------------------------------------------------- screens

export const screens = {
  loading(text, frac) {
    const s = $('loading');
    s.classList.add('open');
    $('load-text').textContent = text;
    $('load-fill').style.width = `${Math.round(frac * 100)}%`;
  },
  loaded() { $('loading').classList.remove('open'); },

  begin(title, onClick) {
    const s = $('begin');
    $('begin-title').textContent = title;
    s.classList.add('open');
    s.onclick = () => { s.classList.remove('open'); onClick(); };
  },
  hideBegin() { $('begin').classList.remove('open'); },

  pause({ onResume, onRestart, onQuit }) {
    const s = $('pause');
    s.classList.add('open');
    $('p-resume').onclick = () => { s.classList.remove('open'); onResume(); };
    $('p-restart').onclick = () => { s.classList.remove('open'); onRestart(); };
    $('p-quit').onclick = () => { s.classList.remove('open'); onQuit(); };
  },
  hidePause() { $('pause').classList.remove('open'); },

  down(cause) {
    const text = { fall: 'You fell.', explosion: 'Caught in the blast.', fire: 'Burnt.', crushed: 'Crushed under the collapse.' }[cause] ?? 'You went down.';
    $('down-text').textContent = text;
    $('down').classList.add('open');
  },
  hideDown() { $('down').classList.remove('open'); },

  results({ title, rows, unlocked, onBack }) {
    const s = $('results');
    $('r-title').textContent = title;
    $('r-rows').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('r-unlock').innerHTML = unlocked ? `<b>Unlocked:</b> ${unlocked}` : '';
    s.classList.add('open');
    $('r-back').onclick = () => { s.classList.remove('open'); onBack(); };
  },
};
