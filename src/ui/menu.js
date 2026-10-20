import { JOBS, TOOLS, MAX_DEMOLITION, job as jobById } from '../data/catalog.js';
import { progress } from '../data/progress.js';
import { LEVELS, level as levelById } from '../data/difficulty.js';
import { openSettings } from './settings.js';
import { openAchievements } from './achievements.js';
import { openShop } from './shop.js';
import { wallet, dollars } from '../data/wallet.js';
import { SHOP } from '../data/shop.js';

// The menu you arrive in. Three pages:
//
//   0. Mode   — Deconstruction (the jobs, with guards, the police and the
//               crime meter) or Creative (every tool, nobody comes for you).
//   1. Jobs   — pick a job. One is open, the others are coming.
//   2. Tools  — pick up to three demolition tools you have unlocked; the
//               helper tools (spray can, extinguisher) always come along.
//
// Then `onStart(jobId, toolIds)`.

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class Menu {
  constructor(root, { onStart, onClick, quality }) {
    this.root = root;
    this.quality = quality;
    this.onStart = onStart;
    this.onClick = onClick;
    this.jobId = 'trump';
    this.level = 'normal';
    this.picked = new Set(['sledge']);
    this.mode = 'deconstruction';
    this.page = 'mode';
  }

  get creative() { return this.mode === 'creative'; }

  show(page = 'mode') {
    this.page = page;
    this.root.classList.add('open');
    this.render();
  }

  hide() { this.root.classList.remove('open'); }

  render() {
    this.root.innerHTML = '';
    const frame = el('div', 'menu-frame');
    const head = el('div', 'menu-head', `<h1>NUKE<span>IT</span></h1><div class="steps"><b class="${this.page === 'mode' ? 'on' : ''}">1 · Mode</b><b class="${this.page === 'jobs' ? 'on' : ''}">2 · Job</b>${this.creative ? '' : `<b class="${this.page === 'tools' ? 'on' : ''}">3 · Tools</b>`}</div>`);
    // Graphics: Auto, then each level in turn.
    if (this.quality) {
      const q = el('button', 'quality', `Graphics: ${this.quality.label}`);
      q.onclick = () => {
        const order = ['auto', '0', '1', '2', '3'];
        this.quality.set(order[(order.indexOf(this.quality.mode) + 1) % order.length]);
        this.onClick?.();
        this.render();
      };
      head.append(q);
    }
    const st = el('button', 'quality', 'Settings');
    st.style.marginLeft = '8px';
    st.onclick = () => { this.onClick?.(); openSettings(this.onClick); };
    const sh = el('button', 'quality', `Shop · ${dollars(wallet.cash)}`);
    sh.style.marginLeft = '8px';
    sh.onclick = () => { this.onClick?.(); openShop(this.onClick, () => this.render()); };
    head.append(sh);
    const ac = el('button', 'quality', 'Achievements');
    ac.style.marginLeft = '8px';
    ac.onclick = () => { this.onClick?.(); openAchievements(this.onClick); };
    head.append(ac, st);
    frame.append(head);
    frame.append(this.page === 'mode' ? this._mode() : this.page === 'jobs' ? this._jobs() : this._tools());
    this.root.append(frame);
  }

  _mode() {
    const page = el('div', 'menu-page');
    page.append(el('h2', null, 'How do you want to play?'));
    const grid = el('div', 'job-grid');
    const MODES = [
      { id: 'deconstruction', title: 'Deconstruction', art: '&#127959;', text: 'The job: bring the building down below the target. Guards, the police, and a record of every law you break.' },
      { id: 'creative', title: 'Creative', art: '&#127912;', text: 'No guards, no police, no crime meter, no dying. Every tool, and nothing runs out. Just have fun with your tools.' },
    ];
    for (const m of MODES) {
      const card = el('button', `job-card${m.id === this.mode ? ' picked' : ''}`);
      card.append(el('div', 'job-art', `<div style="height:150px;display:grid;place-items:center;font-size:64px;background:linear-gradient(#39506e,#c9a27a)">${m.art}</div>`));
      card.append(el('div', 'job-body', `<b>${m.title}</b><span>${m.text}</span>`));
      card.onclick = () => { this.mode = m.id; this.onClick?.(); this.show('jobs'); };
      grid.append(card);
    }
    page.append(grid);
    return page;
  }

  _jobs() {
    const page = el('div', 'menu-page');
    page.append(el('h2', null, 'Choose a job'));
    const grid = el('div', 'job-grid');
    for (const j of JOBS) {
      // A job that needs another finished first stays shut until it is (Creative opens them all).
      const shut = j.requires && !progress.done(j.requires) && !this.creative;
      const card = el('button', `job-card${j.locked || shut ? ' locked' : ''}${j.id === this.jobId ? ' picked' : ''}`);
      if (j.locked) {
        card.append(el('div', 'job-art locked-art', '<i>&#128274;</i>'));
        card.append(el('div', 'job-body', `<b>${j.title}</b><span>More jobs are on the way.</span>`));
        card.disabled = true;
      } else if (shut) {
        card.append(el('div', 'job-art locked-art', '<i>&#128274;</i>'));
        card.append(el('div', 'job-body', `<b>${j.title}</b><span>${j.where}</span><span>Finish ${jobById(j.requires)?.title} to open this job.</span>`));
        card.disabled = true;
      } else {
        const art = el('div', 'job-art');
        art.append(j.id === 'bank' ? bankArt() : towerArt());
        card.append(art);
        const done = progress.done(j.id) ? '<em class="done">Completed</em>' : '';
        card.append(el('div', 'job-body', `<b>${j.title}</b><span>${j.where}</span><span class="stat">${j.storeys} storeys · ${j.height} m · bring below ${j.heist ? j.target : levelById(this.level).target} m</span>${done}`));
        card.onclick = () => { this.jobId = j.id; this.onClick?.(); this.render(); };
      }
      grid.append(card);
    }
    page.append(grid);
    const j = jobById(this.jobId);
    page.append(el('p', 'brief', j.brief));
    const bar = el('div', 'menu-bar');
    const back = el('button', 'back', '&larr; Mode');
    back.onclick = () => { this.onClick?.(); this.show('mode'); };
    if (this.creative) {
      page.append(el('p', 'tool-note', 'Creative: every tool, endless charges and powder, nobody comes for you.'));
      const go = el('button', 'go', `Go to ${j.title} &rarr;`);
      go.onclick = () => {
        this.onClick?.();
        const all = TOOLS.filter((t) => !t.soon).map((t) => t.id);
        this.onStart(this.jobId, all, 'creative');
      };
      bar.append(back, go);
      page.append(bar);
      return page;
    }
    // How hard: five levels, Insane earned.
    page.append(el('h3', null, 'Difficulty'));
    const row = el('div', 'levels');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px';
    for (const L of LEVELS) {
      const locked = L.earned && !progress.earned(this.jobId);
      const on = L.id === this.level;
      const b = el('button', `level${on ? ' picked' : ''}`, `${locked ? '&#128274; ' : ''}${L.name}${progress.done(this.jobId, L.id) ? ' &#10003;' : ''}`);
      b.style.cssText = `padding:8px 14px;border-radius:8px;border:1px solid ${on ? '#c9a043' : '#ffffff33'};background:${on ? '#c9a04333' : '#00000044'};color:#fff;cursor:${locked ? 'not-allowed' : 'pointer'};opacity:${locked ? 0.5 : 1}`;
      if (locked) { b.disabled = true; b.title = 'Finish this job on Normal or Hard to unlock'; }
      else b.onclick = () => { this.level = L.id; this.onClick?.(); this.render(); };
      row.append(b);
    }
    page.append(row);
    const L = levelById(this.level);
    page.append(el('p', 'tool-note', `${L.blurb} Bring it below ${L.target} m.`));
    const next = el('button', 'go', 'Next: choose your tools &rarr;');
    next.onclick = () => { this.onClick?.(); this.show('tools'); };
    bar.append(back, next);
    page.append(bar);
    return page;
  }

  _tools() {
    const page = el('div', 'menu-page');
    const j = jobById(this.jobId);
    page.append(el('h2', null, `Tools for ${j.title} · ${levelById(this.level).name}`));
    page.append(el('div', 'tool-note', `Demolition: pick up to ${MAX_DEMOLITION}. Helpers always come with you.`));
    const grid = el('div', 'tool-grid');
    for (const t of TOOLS.filter((x) => x.kind === 'demolition')) {
      const open = progress.unlocked(t.id);
      const picked = this.picked.has(t.id);
      const card = el('button', `tool-card${open ? '' : ' locked'}${picked ? ' picked' : ''}`);
      const why = t.soon ? 'Unlocked by a job that is coming soon' : `Finish ${jobById(t.unlockedBy)?.title ?? 'a job'} to unlock`;
      card.innerHTML = `<i class="tool-icon ${t.id}"></i><b>${t.name}</b><span>${open ? t.desc : '&#128274; ' + why}</span>${picked ? '<em>Taking</em>' : ''}`;
      if (!open) card.disabled = true;
      else card.onclick = () => {
        if (picked) { if (this.picked.size > 1) this.picked.delete(t.id); }
        else if (this.picked.size < MAX_DEMOLITION) this.picked.add(t.id);
        this.onClick?.();
        this.render();
      };
      grid.append(card);
    }
    page.append(grid);
    // A disguise you own, worn from the start of the job.
    const disguises = SHOP.filter((i) => i.kind === 'disguises' && wallet.owns(i.id));
    if (disguises.length) {
      page.append(el('h3', null, 'Wear'));
      const row = el('div', null);
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
      for (const d of [{ id: null, name: 'Your own clothes' }, ...disguises]) {
        const on = wallet.wear === d.id;
        const b = el('button', null, d.name);
        b.style.cssText = `padding:8px 14px;border-radius:8px;border:1px solid ${on ? '#c9a043' : '#ffffff33'};background:${on ? '#c9a04333' : '#00000044'};color:#fff;cursor:pointer`;
        b.onclick = () => { wallet.setWear(d.id); this.onClick?.(); this.render(); };
        row.append(b);
      }
      page.append(row);
    }
    page.append(el('h3', null, 'Helpers'));
    const help = el('div', 'tool-grid');
    for (const t of TOOLS.filter((x) => x.kind === 'helper')) {
      help.append(el('div', 'tool-card helper picked', `<i class="tool-icon ${t.id}"></i><b>${t.name}</b><span>${t.desc}</span><em>Always</em>`));
    }
    page.append(help);
    const bar = el('div', 'menu-bar');
    const back = el('button', 'back', '&larr; Jobs');
    back.onclick = () => { this.onClick?.(); this.show('jobs'); };
    const go = el('button', 'go', `Go to ${j.title} &rarr;`);
    go.onclick = () => {
      this.onClick?.();
      const demolition = TOOLS.filter((t) => t.kind === 'demolition' && this.picked.has(t.id)).map((t) => t.id);
      const helpers = TOOLS.filter((t) => t.kind === 'helper').map((t) => t.id);
      this.onStart(this.jobId, [...demolition, ...helpers], this.level);
    };
    bar.append(back, go);
    page.append(bar);
    return page;
  }
}

// Big Boy Bank for its card: the stone hall with its columns, the glass tower
// out of the middle of it, at dusk.
function bankArt() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#2e4560'); sky.addColorStop(1, '#d2a87c');
  g.fillStyle = sky; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#4a5260';
  for (let x = 0; x < 320; x += 24) g.fillRect(x, 110 - ((x * 29) % 40), 20, 100);
  // The tower: blue-green glass in bands.
  g.fillStyle = '#5f8296'; g.fillRect(122, 8, 76, 140);
  g.fillStyle = 'rgba(220,240,250,0.25)';
  for (let y = 12; y < 148; y += 5) g.fillRect(124, y, 72, 1);
  // The hall: limestone, a temple front.
  g.fillStyle = '#d6ccba'; g.fillRect(70, 140, 180, 60);
  g.fillStyle = '#c4b9a4'; g.fillRect(94, 146, 132, 8);
  g.fillStyle = '#e6ddcc';
  for (let i = 0; i < 6; i++) g.fillRect(100 + i * 22, 154, 8, 40);
  g.fillStyle = '#b8ad98'; g.fillRect(90, 194, 140, 6);
  g.fillStyle = '#c9a043'; g.font = 'bold 9px sans-serif';
  g.fillText('BIG BOY BANK', 128, 152);
  return c;
}

// A small drawing of the tower for its card: dusk sky, the stepped podium, the
// sawtooth shaft.
function towerArt() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#39506e'); sky.addColorStop(1, '#c9a27a');
  g.fillStyle = sky; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#4a5260';
  for (let x = 0; x < 320; x += 26) g.fillRect(x, 120 - ((x * 37) % 50), 22, 90);
  g.fillStyle = '#2a241d';
  g.beginPath();
  g.moveTo(125, 200); g.lineTo(125, 44);
  for (let y = 44, s = 0; y < 150; y += 9, s ^= 1) g.lineTo(s ? 190 : 196, y);
  g.lineTo(196, 150); g.lineTo(230, 150); g.lineTo(230, 200);
  g.lineTo(98, 200); g.lineTo(98, 150); g.lineTo(125, 150);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(210,170,110,0.35)';
  for (let y = 50; y < 150; y += 6) g.fillRect(128, y, 62, 1);
  g.fillStyle = '#c9a043';
  g.font = 'bold 9px sans-serif';
  g.fillText('TRUMP TOWER', 131, 172);
  return c;
}
