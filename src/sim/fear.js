import * as THREE from 'three';
import { FLOOR_H, T, PODIUM_FLOORS, HQ, RESIDENCES } from '../building/plan.js';

// How scared the people in the tower are: one meter for the whole building,
// 0 (calm) to 100 (panic), and a line under it that sums up the tower's mood.
//
// Fear rises with what you do near people — smashing things, chasing them with
// a sledgehammer — and with fire and smoke, the alarm, explosions, supports
// giving way, a floor coming down, a tower tipping. It falls when things go
// quiet, when a fire is put out, when guards or the police turn up, when a
// calm announcement comes over the speakers, and when the police search the
// whole building, do not find you, and leave.
//
// High fear changes what people do (sim/people.js): nervous, they walk quicker
// and look about; scared, they run from trouble with their hands up, a "!"
// over their heads; in a panic they make for the exits, hide behind counters,
// crowd round the lifts, or — a few — film it all on their phones. It brings
// the police sooner, and the guards out of their break room (sim/security.js).
// A children's game: nobody cries or screams.

const ZONES = [
  { name: 'the lower level', floors: (f) => f < 0 },
  { name: 'the lobby', floors: (f) => f === 0 },
  { name: 'the shops', floors: (f) => f >= 1 && f <= 2 },
  { name: 'the food court', floors: (f) => f === 3 },
  { name: 'the Grill', floors: (f) => f === 4 },
  { name: 'the offices', floors: (f) => f >= 5 && f < RESIDENCES },
  { name: 'the apartments', floors: (f) => f >= RESIDENCES },
];
const zoneOf = (y) => { const f = Math.floor((y - 0.3) / FLOOR_H); return Math.max(0, ZONES.findIndex((z) => z.floors(f))); };

const BANDS = ['Calm', 'Nervous', 'Scared', 'Panic'];
const band = (v) => (v < 25 ? 0 : v < 50 ? 1 : v < 75 ? 2 : 3);

// What the tower sounds like, by how scared it is. {z} is the most frightened
// part of it, {q} the calmest.
const LINES = [
  ['Shoppers drift between the boutiques.', 'A quiet afternoon at the tower.', 'Coffee orders and lift chimes.', 'Somebody is trying on shoes in {z}.',
    'The lounge music plays on.', 'Tourists photograph the waterfall.', 'All is well in {z}.', 'A waiter carries plates past the bar.',
    'The cafés are busy, the mood is easy.', 'Nobody suspects a thing.'],
  ['People in {z} keep looking over their shoulders.', '"Did you hear that?" — {z}.', 'A few shoppers in {z} put their bags down and listen.',
    'Whispers in {z}. Phones come out.', 'The staff in {z} glance at each other.', 'Conversation stops in {z}, then starts again, quieter.',
    'Someone asks a guard what that noise was.', '{q} is still calm. {z} is not.', 'People are walking a little faster in {z}.',
    'A tourist in {z} asks what the bang was.'],
  ['People in {z} are hurrying for the stairs.', '"Something is wrong!" — the word spreads through {z}.', 'Tables left half-finished in {z}.',
    'Shop staff in {z} pull down their shutters.', 'A crowd gathers by the lifts in {z}.', 'Everyone in {z} is on the phone at once.',
    '"Is that smoke?" — {z}.', 'Guards are trying to calm {z} down.', 'People in {q} wonder what is going on in {z}.', 'Bags and coats left behind in {z}.'],
  ['Everybody out! {z} is emptying.', 'The whole tower is heading for the doors.', 'People pour out onto Fifth Avenue.', 'A rush for the stairs in {z}.',
    'Some hide under tables in {z}; others run.', 'The lifts in {z} are mobbed.', 'A few people still filming it all in {z}.',
    'Alarms, running, shouting — {z} is in chaos.', 'Crowds on the pavement stare up at the tower.', 'Nobody is buying anything now.'],
];

// When the tower is badly broken, or has emptied.
const WRECK = ['Half the tower is gone. Nobody stays to watch from inside.', 'Dust hangs where {z} used to be.', 'Sirens all over Midtown. The tower is coming apart.',
  'People who got out stand on Fifth Avenue, staring up.', 'What is left of {z} creaks and groans.', 'The last stragglers run from {z}.'];
const EMPTY = ['The tower stands empty.', 'Everyone is out. Only the alarms are left inside.', 'Not a soul left in the building.', 'The crowds watch from across the avenue.'];

export class Fear {
  constructor(fx) {
    this.fx = fx;                // { people, fire, smoke, water, security, audio, player, tools }
    this.zone = ZONES.map(() => 0);
    this.level = 0;
    this.quiet = 0;              // s since anything raised it
    this.line = '';
    this._lineT = 0;
    this._pa = 30;
    this._fires = 0;
    this._dom();
  }

  _dom() {
    const hud = document.getElementById('hud');
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);width:min(440px,70vw);text-align:center;font:500 13px system-ui,sans-serif;color:#f2ece0;text-shadow:0 1px 3px #000c;pointer-events:none';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.85"><span>Scared</span><b data-band>Calm</b></div>'
      + '<div style="height:7px;margin:4px 0 6px;border-radius:4px;background:#0007;overflow:hidden"><i data-fill style="display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#7ec98a,#e8c95a 45%,#e8833a 70%,#d8452e);transition:width .4s"></i></div>'
      + '<div data-line style="opacity:.92;min-height:1.3em"></div>';
    hud?.appendChild(el);
    this.el = { root: el, band: el.querySelector('[data-band]'), fill: el.querySelector('[data-fill]'), line: el.querySelector('[data-line]') };
  }

  reset() {
    this.zone.fill(0); this.level = 0; this.quiet = 0; this._lineT = 0; this._pa = 30; this._fires = 0;
    this.whole = null; this.wreck = 0; this._wreckT = 0;
  }

  // How much of the tower's structure is gone, 0..1, looked at now and then.
  _wrecked(dt) {
    if ((this._wreckT -= dt) > 0) return this.wreck;
    this._wreckT = 2;
    const P = this.fx.pieces;
    if (!P) return 0;
    let n = 0;
    for (const p of P.inBuilding('tower')) if ((p.structural || p.role === 'slab') && p.state === 'static') n++;
    this.whole ??= n;
    this.wreck = this.whole ? 1 - n / this.whole : 0;
    return this.wreck;
  }

  // Something frightening at `at`: `amount` of fear, more the more people are near.
  scare(at, amount, spread = 0.25) {
    const z = zoneOf(at.y);
    const near = this.fx.people ? this.fx.people.crowdAt(at, 14) : 0.5;
    this.zone[z] = Math.min(100, this.zone[z] + amount * (0.4 + near));
    for (let i = 0; i < this.zone.length; i++) if (i !== z) this.zone[i] = Math.min(100, this.zone[i] + amount * spread * 0.5);
    if (amount > 0.5) this.quiet = 0;
  }

  // Something reassuring: everywhere a little calmer.
  calm(amount) { for (let i = 0; i < this.zone.length; i++) this.zone[i] = Math.max(0, this.zone[i] - amount); }

  update(dt) {
    const { fire, smoke, water, security, player, audio } = this.fx;
    // What keeps going: fire, smoke, the alarm, a sledge running at people.
    if (fire?.count) for (const s of fire.spots.slice(0, 40)) this.scare(s.p, dt * 0.25 * s.heat, 0.1);
    if (smoke?.worst?.() > 0.2) this.scare(new THREE.Vector3(0, T(3), 0), dt * smoke.worst() * 2, 0.6);
    if (water?.alarm > 0) this.scare(new THREE.Vector3(0, T(2), 0), dt * 0.8, 1);
    if (player && this.fx.chasing?.()) this.scare(player.pos, dt * 4, 0.1);
    // A fire put out is a weight off everyone's mind.
    const fires = fire?.count ?? 0;
    if (fires < this._fires) this.calm((this._fires - fires) * 2);
    this._fires = fires;
    // Quiet: it ebbs away.
    this.quiet += dt;
    if (this.quiet > 6) this.calm(dt * (this.fx.lounge?.() ? 1.6 : 0.8));
    // Over the speakers, now and then, while people are worried.
    this._pa -= dt;
    if (this._pa <= 0 && this.level > 35) {
      this._pa = 40;
      audio?.chime?.();
      this.fx.hud?.flash('"Please remain calm. Everything is under control."', 3.5);
      if (this.quiet > 4) this.calm(8);
    }
    // The meter is the most frightened part of the tower, and a share of the
    // rest — and never calm in a tower that is falling to pieces: a tenth of it
    // gone is nervous, a quarter scared, a third and more panic.
    const max = Math.max(...this.zone), mean = this.zone.reduce((a, b) => a + b, 0) / this.zone.length;
    const wreck = this._wrecked(dt);
    this.level = Math.min(100, Math.max(max * 0.7 + mean * 0.3, Math.min(100, wreck * 250)));
    // The line under it, now and then — and at once when the mood changes.
    this._lineT -= dt;
    if (band(this.level) !== this._band) { this._band = band(this.level); this._lineT = 0; }
    if (this._lineT <= 0) {
      this._lineT = 6;
      let hi = 0, lo = 0;
      this.zone.forEach((v, i) => { if (v > this.zone[hi]) hi = i; if (v < this.zone[lo]) lo = i; });
      const empty = (this.fx.people?.list ?? []).every((p) => p.state === 'gone' || p.agent || p.street);
      const list = empty && this.wreck > 0.05 ? EMPTY : this.wreck > 0.3 ? WRECK : LINES[band(this.level)];
      const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      this.line = list[(Math.random() * list.length) | 0].replace(/\{z\}/g, ZONES[hi].name).replace(/\{q\}/g, cap(ZONES[lo].name)).replace(/^(\w)/, (m) => m.toUpperCase());
    }
    this.fx.people && (this.fx.people.fear = this.level);
    this._show();
  }

  _show() {
    const b = band(this.level);
    this.el.fill.style.width = `${Math.round(this.level)}%`;
    this.el.band.textContent = BANDS[b];
    this.el.band.style.color = ['#9ed8a6', '#f0d878', '#f0a060', '#ff7058'][b];
    if (this.el.line.textContent !== this.line) this.el.line.textContent = this.line;
  }

  show(on) { this.el.root.style.display = on ? '' : 'none'; }
}
