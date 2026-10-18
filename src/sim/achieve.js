import { ACHIEVEMENTS, TIERS, record } from '../data/achievements.js';
import { T, ROOF, TOP_FLOOR, PODIUM_FLOORS } from '../building/plan.js';
import { progress } from '../data/progress.js';

// Watching for the achievements (data/achievements.js) while you play, in
// Deconstruction only. Most are told by an event from the system that saw it
// happen (`event`); the rest are looked at a few times a second (`update`)
// or when the job ends (`finish`). Earned, a badge slides in at the bottom
// right with a chime.

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export class Achieve {
  constructor(fx) {
    this.fx = fx;                // { player, security, wanted, fire, water, lift, topple, structure, pieces, audio, fear, tool() }
    this.on = false;
    this.queue = [];
    this._dom();
  }

  reset(level, jobId) {
    this.on = !!level && !level.creative;
    this.jobId = jobId;
    this.n = { detonate: 0, gas: 0, own: 0, thrown: 0, sprinklers: 0 };
    this.flags = {};
    this._lastBlast = -99;
    this._lastOwn = -99;
    this._t = 0;
    this._tiger = 0;
    this._fires = 0;
    this.time = 0;
    const P = this.fx.pieces;
    this.tagged = {};
    for (const p of P.list) if (p.tag) (this.tagged[p.tag] ??= []).push(p);
    this.podium = P.list.filter((p) => p.building === 'tower' && p.floor < PODIUM_FLOORS && (p.role === 'column' || p.role === 'slab' || p.role === 'core'));
  }

  earn(id) {
    if (!this.on || !BY_ID[id] || !record.earn(id)) return;
    this.queue.push(BY_ID[id]);
  }

  // Something happened.
  event(name, data) {
    if (!this.on) return;
    const { lift, player, security, smoke, veil } = this.fx;
    switch (name) {
      case 'detonate': this.n.detonate++; break;
      case 'blast': this._lastBlast = this.time; if ((data ?? 1) < 1 && ++this.n.gas >= 5) this.earn('gas'); break;
      case 'failed':
        // A support giving way that you did not hit or blow up just now: the chain.
        if (security.time - security.lastBlow > 1 && this.time - this._lastBlast > 0.6) {
          if (this.time - this._lastOwn > 30) this.n.own = 0;
          this._lastOwn = this.time;
          if (++this.n.own >= 10) this.earn('chain');
        }
        break;
      case 'glass': if (record.add('glass') >= 100) this.earn('glass'); break;
      case 'car': if (record.add('cars') >= 5) this.earn('cars'); break;
      case 'thrown': this.n.thrown++; break;
      case 'zapped': this.flags.zapped = true; break;
      case 'busted': this.earn('busted'); break;
      case 'gaveup': this.earn('nothere'); break;
      case 'main': this.flags.main = true; break;
      case 'lost': {
        // Someone after you lost you: how?
        const a = data;
        if (lift?.inside(player.pos)) this.earn('liftop');
        const murk = Math.max(smoke?.at(this.fx.camera.position) ?? 0, Math.min(1, (veil?.thick ?? 0) / 2500));
        if (murk > 0.3) this.earn('smoke');
        if (a.kind === 'cop' && (a.minD ?? 99) < 2) this.earn('closecall');
        break;
      }
      case 'died': this.flags.inside = false; break;
    }
  }

  update(dt) {
    if (!this.on) return;
    this.time += dt;
    const { player, security, wanted, fire, water, lift, topple, structure } = this.fx;
    // Putting fires out: the count going down while the extinguisher is on.
    const fires = fire.count;
    if (this.fx.spraying?.() && fires < this._fires && record.add('fires', this._fires - fires) >= 20) this.earn('firefighter');
    this._fires = fires;
    if (fires >= 30) this.earn('inferno');
    if (wanted.now >= 8) this.earn('mostwanted');
    if (wanted.broken.length >= 8) this.earn('fullhouse');
    // Crouched within 4 m of a guard on duty, unseen, for a couple of seconds.
    const near = security.agents.some((a) => a.kind === 'guard' && a.mode !== 'rest' && !a.hidden && a.state !== 'down' && Math.abs(a.pos.y - player.pos.y) < 2 && a.pos.distanceTo(player.pos) < 4);
    this._tiger = player.crouch > 0.5 && near && !security.seesYou ? this._tiger + dt : 0;
    if (this._tiger > 2) this.earn('tiger');
    // In the lift at the top floor.
    if (lift?.inside(player.pos) && Math.abs(lift.y - T(TOP_FLOOR)) < 0.3) this.flags.rodeTop = true;
    // Inside the tower when it starts to come down; alive when it has.
    const falling = topple.active || structure.collapsing;
    if (falling && !this.flags.wasFalling) this.flags.inside = Math.abs(player.pos.x) < 22 && Math.abs(player.pos.z) < 14 && player.pos.y > 1 && !player.dead;
    if (!falling && this.flags.wasFalling && this.flags.inside && !player.dead) this.earn('survivor');
    if (topple.active) this.flags.toppled = true;
    if (structure.collapsing) this.flags.pancaked = true;
    this.flags.wasFalling = falling;
    // A few times a second: what has been broken, where you stand, the water.
    if ((this._t -= dt) > 0) return;
    this._t = 0.5;
    const gone = (tag) => (this.tagged[tag] ?? []).some((p) => p.state !== 'static');
    if (gone('vault')) this.earn('vault');
    if (gone('boardroom')) this.earn('boardroom');
    if (gone('waterfall')) this.earn('waterfall');
    if (gone('oven') && gone('freezer')) this.earn('lunch');
    if (this.flags.rodeTop && gone('penthousepiano')) this.earn('penthouse');
    if (player.pos.y > T(ROOF) - 0.5 && !player.dead && Math.abs(player.pos.x) < 22 && Math.abs(player.pos.z) < 14) this.earn('sightseer');
    if (this.flags.main && water.heads.filter((h) => h.open).length >= 20) this.earn('flood');
    // The tower alone below 10 m.
    let top = 0;
    for (const p of this.fx.pieces.list) {
      if (p.building !== 'tower' || p.state !== 'static' || p.role === 'shard' || p.role === 'fragment' || p.role === 'rebar' || p.role === 'stub') continue;
      if (p.box.max.y > top) { top = p.box.max.y; if (top >= 10) break; }
    }
    if (top < 10) this.earn('done');
  }

  // The job is over. `won`: the target was met.
  finish(won) {
    if (!this.on) return;
    const { wanted } = this.fx;
    if (wanted.lastUnseen && wanted.fx.fear?.wreck > 0.05) this.earn('mystery');
    if (!won) return;
    if (this.n.detonate === 1) this.earn('onebutton');
    if (this.n.detonate === 0) this.earn('hammer');
    if (wanted.worst <= 1) this.earn('ghost');
    if (this.n.thrown >= 3) this.earn('escape');
    if (this.flags.zapped) this.earn('taser');
    if (this.flags.pancaked && !this.flags.toppled) this.earn('pancake');
    if (this.podium.every((p) => p.state === 'static')) this.earn('precision');
    if (['easy', 'normal', 'hard', 'insane'].every((l) => progress.done(this.jobId, l))) this.earn('every');
  }

  // ---------------------------------------------------------------- on screen

  _dom() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:18px;bottom:90px;z-index:25;pointer-events:none;font:600 14px system-ui,sans-serif;color:#f2ece0;transition:transform .45s cubic-bezier(.2,1.4,.4,1),opacity .4s;transform:translateX(130%);opacity:0';
    document.body.append(el);
    this.el = el;
    this._showT = 0;
  }

  // Each frame, in any state: the next badge in, the last one out.
  badges(dt) {
    if (this._showT > 0) {
      this._showT -= dt;
      if (this._showT <= 0) { this.el.style.transform = 'translateX(130%)'; this.el.style.opacity = 0; }
      return;
    }
    const a = this.queue.shift();
    if (!a) return;
    this.el.innerHTML = badge(a, true) ;
    this.el.style.transform = 'none';
    this.el.style.opacity = 1;
    this._showT = 4;
    this.fx.audio?.chime?.();
  }
}

// One achievement's badge, earned (in its metal) or not (grey, its hint).
export function badge(a, earned) {
  const c = earned ? TIERS[a.tier] : '#6a6660';
  const secret = a.secret && !earned;
  return `<div style="display:flex;gap:12px;align-items:center;padding:10px 14px;background:#141210e8;border:1px solid ${c};border-radius:10px;box-shadow:0 4px 18px #0009;min-width:250px">`
    + `<div style="width:42px;height:42px;flex:none;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,${c} 45%,#0006);display:grid;place-items:center;font-size:20px">${secret ? '?' : earned ? '&#9733;' : '&#9734;'}</div>`
    + `<div style="text-align:left"><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${c}">${earned ? `${a.tier} achievement` : a.tier}</div>`
    + `<div style="font-size:15px">${secret ? '???' : a.name}</div><div style="font-size:12px;font-weight:400;opacity:.7">${secret ? 'A secret' : a.hint}</div></div></div>`;
}
