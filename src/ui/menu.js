import { JOBS, TOOLS, MAX_DEMOLITION, job as jobById } from '../data/catalog.js';
import { progress } from '../data/progress.js';

// The menu you arrive in. Two pages:
//
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
    this.picked = new Set(['sledge']);
    this.page = 'jobs';
  }

  show(page = 'jobs') {
    this.page = page;
    this.root.classList.add('open');
    this.render();
  }

  hide() { this.root.classList.remove('open'); }

  render() {
    this.root.innerHTML = '';
    const frame = el('div', 'menu-frame');
    const head = el('div', 'menu-head', `<h1>NUKE<span>IT</span></h1><div class="steps"><b class="${this.page === 'jobs' ? 'on' : ''}">1 · Job</b><b class="${this.page === 'tools' ? 'on' : ''}">2 · Tools</b></div>`);
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
    frame.append(head);
    frame.append(this.page === 'jobs' ? this._jobs() : this._tools());
    this.root.append(frame);
  }

  _jobs() {
    const page = el('div', 'menu-page');
    page.append(el('h2', null, 'Choose a job'));
    const grid = el('div', 'job-grid');
    for (const j of JOBS) {
      const card = el('button', `job-card${j.locked ? ' locked' : ''}${j.id === this.jobId ? ' picked' : ''}`);
      if (j.locked) {
        card.append(el('div', 'job-art locked-art', '<i>&#128274;</i>'));
        card.append(el('div', 'job-body', `<b>${j.title}</b><span>More jobs are on the way.</span>`));
        card.disabled = true;
      } else {
        const art = el('div', 'job-art');
        art.append(towerArt());
        card.append(art);
        const done = progress.done(j.id) ? '<em class="done">Completed</em>' : '';
        card.append(el('div', 'job-body', `<b>${j.title}</b><span>${j.where}</span><span class="stat">${j.storeys} storeys · ${j.height} m · bring below ${j.target} m</span>${done}`));
        card.onclick = () => { this.jobId = j.id; this.onClick?.(); this.render(); };
      }
      grid.append(card);
    }
    page.append(grid);
    const j = jobById(this.jobId);
    page.append(el('p', 'brief', j.brief));
    const bar = el('div', 'menu-bar');
    const next = el('button', 'go', 'Next: choose your tools &rarr;');
    next.onclick = () => { this.onClick?.(); this.show('tools'); };
    bar.append(next);
    page.append(bar);
    return page;
  }

  _tools() {
    const page = el('div', 'menu-page');
    const j = jobById(this.jobId);
    page.append(el('h2', null, `Tools for ${j.title}`));
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
      this.onStart(this.jobId, [...demolition, ...helpers]);
    };
    bar.append(back, go);
    page.append(bar);
    return page;
  }
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
