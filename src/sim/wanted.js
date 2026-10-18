// What you are wanted for: eight offences, one above the other, and the
// highest you have reached is your level. The owner's ladder:
//
//   1  walking about with the sledgehammer or the charges   watched, asked to put it away
//   2  chasing people with the sledgehammer                  they keep away from you
//   3  tagging: spray paint on the place                     the guards come to look
//   4  breaking things                                       the guards come
//   5  breaking something structural                         the guards come, all of them
//   6  knocking people over                                  the police are called
//   7  setting off explosives                                the police are called
//   8  bringing it down: a collapse, a tower going over,     SWAT, a helicopter, and the
//      a good part of the structure gone                     guards run out with the crowd
//
// Nothing counts unless someone sees it. A guard, an officer, or anyone
// standing near you has to see you at it; out of sight, you are just someone
// who was about when things broke. Charges are yours if somebody saw you plant
// one — or if they already know you as the vandal; otherwise a building
// coming down is a mystery, and the paper says so.
//
// Level 1 is only while you carry the tool: put it away and a few seconds
// later you are clean. The rest stay, and ebb a level at a time while nobody
// is after you — quicker on Easy, never on Insane. In the hi-vis vest and the
// hard hat, carrying, menacing and a bit of breaking do not count: a workman
// with a hammer belongs, and it looks like work. So does a mark sprayed on a
// column or a wall, marking out what comes down — but paint on the furniture,
// the glass, the marble, or spraying on and on, is tagging, vest or no vest. Die and you start again fresh, but they
// remember a level or two.
//
// On screen: a thermometer on the right edge that fills with the level and
// bursts at 8, and the charge sheet under it — every law you have broken, a
// new line each time. Both can be switched off in Settings. Creative has
// neither, nor does Super easy, which has nobody to break the law in front of.

export const LAWS = [
  null,
  { law: 'Carrying demolition tools in a public place', short: 'Carrying a sledgehammer', comic: ['Brought a sledgehammer on a shopping trip.', 'Said the hammer was "for a friend".', 'Walked into a jeweller with a detonator, "just looking".'] },
  { law: 'Menacing shoppers with a sledgehammer', short: 'Menacing shoppers', comic: ['Chased a man holding a latte for no reason at all.', 'Ran at a queue. The queue left.', 'Made a tourist drop a souvenir snow globe.'] },
  { law: 'Tagging', short: 'Tagging', comic: ['Signed the lobby. In red.', 'Improved the marble with a smiley face.', 'Left a review on a column, in paint.'] },
  { law: 'Vandalism', short: 'Vandalism', comic: ['Was very rude to a column.', 'Rearranged the furniture with a hammer.', 'Gave a desk "a bit of character".'] },
  { law: 'Heavy vandalism', short: 'Heavy vandalism', comic: ['Removed a load-bearing wall without asking.', 'Took a wall home in several pieces.', 'Turned an office into an open-plan office.'] },
  { law: 'Public menace', short: 'Public menace', comic: ['Knocked over a tourist mid-selfie.', 'Bowled over shoppers like skittles.', 'Interrupted a business lunch, sideways.'] },
  { law: 'Unlawful use of explosives', short: 'Explosives', comic: ['Said "fire in the hole" indoors.', 'Set off fireworks the wrong size.', 'Made the lift go down the quick way.'] },
  { law: 'Threat to New York City', short: 'Threat to New York City', comic: ['Made the skyline shorter.', 'Was chased by SWAT, a helicopter and half of Midtown.', 'Gave Fifth Avenue a new view.'] },
];

// The next morning's paper, by the worst you were wanted for. Never seen at
// it (level 2 or less): either nobody knows who, or nobody thinks anyone did.
const HEADLINES = {
  unseen: [['WHO DID THIS?', 'Police baffled as Fifth Avenue landmark comes apart'], ['MYSTERY ON FIFTH AVENUE', 'Nobody saw a thing, say shoppers'],
    ['INSPECTOR BLAMES "OLD CONCRETE"', "Officials insist it was nobody's fault"], ['PIGEONS QUESTIONED, RELEASED', 'Tower damage remains unexplained']],
  3: [['ART CRITICS DIVIDED', 'Mystery tagger "improves" Fifth Avenue lobby'], ['WHO PAINTED THE MARBLE?', 'Cleaners called in for the week']],
  4: [['VANDAL IN THE TOWER', 'Lobby left "a bit of a mess", say staff'], ['HAMMER TIME ON FIFTH AVE', 'Guards chase mystery smasher']],
  5: [['WALLS? WHAT WALLS?', 'Vandal knocks through landmark, one blow at a time'], ['OPEN PLAN, WHETHER YOU LIKE IT OR NOT', 'Tower offices "remodelled" without permission']],
  6: [['SHOPPERS BOWLED OVER', 'Literally, say witnesses'], ['MIDTOWN MENACE!', 'Tourists knocked flat by hammer-wielding stranger']],
  7: [['BANG! FIFTH AVENUE SHAKEN', 'Explosions rattle windows for blocks'], ['KA-BOOM IN MIDTOWN', 'Police: "Those were not fireworks"']],
  8: [['SKYLINE ONE TOWER SHORTER', 'SWAT, a helicopter and half of Midtown could not stop it'], ['TOWER DOWN!', 'Suspect still at large — city in shock'],
    ['THREAT TO NEW YORK CITY', 'Mayor: "We will rebuild. Bigger."']],
};

// How long a level takes to ebb away, by difficulty; Insane never forgets.
const COOL = { easy: 35, normal: 60, hard: 80, insane: Infinity };
const ARMED_CLEAR = 4;          // s after putting the tool away
// The building itself, not what is in it (furniture is marked structural too).
const BIG = new Set(['column', 'wall', 'core', 'slab']);

export class Wanted {
  constructor(fx) {
    this.fx = fx;               // { security, people, player, hud, audio, settings }
    this.on = false;
    this._dom();
    this.reset(null);
  }

  // A new job at `level` (difficulty).
  reset(level) {
    this.level = level;
    this.on = !!level && !level.creative && level.police !== null;
    this.base = 0;              // from what you have done
    this.armedT = 0;            // s you have been carrying, decaying once put away
    this.quiet = 0;             // s since anything new, with nobody after you
    this.broken = [];           // levels on the charge sheet, in the order broken
    this.worst = 0;
    this.burst = false;
    this.chargesSeen = false;
    this.marking = 0;
    this._shown = '';
    this.show(this.on);
  }

  // What you are now.
  get now() { return this.on ? Math.max(this.base, this.armedT > 0 ? 1 : 0) : 0; }

  // You did something at level n, at `at`; `sure`: whoever it was done to saw you.
  offend(n, at, sure = false) {
    if (!this.on) return;
    const { player } = this.fx;
    if ((n <= 2 || n === 4) && player?.disguised) return;
    // Explosives and a building down are yours if they saw you with the charges
    // or know you already; anything else, if somebody sees you now.
    if (n >= 7) { if (!this.chargesSeen && this.base < 3) return; }
    else if (!sure && !this.fx.seen?.()) return;
    this.quiet = 0;
    if (n === 1) { this.armedT = ARMED_CLEAR; this._sheet(1); return; }
    if (n <= this.base) { this._react(n, at, false); return; }
    this.base = n;
    this._sheet(n);
    this._react(n, at, true);
  }

  // A charge stuck on: seen doing it, every bang after is yours.
  placed() {
    if (!this.on || this.chargesSeen || !this.fx.seen?.()) return;
    this.chargesSeen = true;
    this.fx.hud?.flash('Someone saw you plant that!', 2);
  }

  // A sledge blow landed on piece p: breaking a wall, a slab or a column
  // through is heavy vandalism.
  struck(p, at) {
    const big = BIG.has(p.role);
    if (big && (p.hp <= 0 || p.state !== 'static')) this.offend(5, at);
  }

  // Spray paint landed on piece p. In the vest, a mark on the structure is
  // marking out the work — until it goes on too long.
  tagged(p, at, dt) {
    if (!this.on) return;
    const structure = BIG.has(p.role);
    if (this.fx.player?.disguised && structure && (this.marking = (this.marking ?? 0) + dt) < 6) return;
    this.offend(3, at);
  }

  _sheet(n) {
    if (!this.broken.includes(n)) this.broken.push(n);
    this.worst = Math.max(this.worst, n);
  }

  // What each level brings down on you. `fresh`: just reached it.
  _react(n, at, fresh) {
    const S = this.fx.security;
    if (!S) return;
    if (n >= 3 && n < 8) S.summon?.(at ?? this.fx.player.pos, n >= 5);
    if (n === 6 || n === 7) S.call?.(n === 6 ? 'People knocked over — someone is calling the police' : 'Explosions! The police are on their way');
    if (n === 8 && fresh) S.swat?.();
  }

  // Each frame. `armed`: carrying the sledge or the charges.
  update(dt, { armed, chased }) {
    if (!this.on) return;
    if (armed) this.offend(1);
    else this.armedT = Math.max(0, this.armedT - dt);
    // Ebbing away while nobody is after you.
    if (chased) this.quiet = 0;
    else this.quiet += dt;
    const cool = COOL[this.level.id] ?? 60;
    if (this.base > 1 && this.quiet > cool) { this.base--; this.quiet = 0; }
    this._show();
  }

  // Down and back at the door: a fresh start, though they remember a level or two.
  died() { this.base = Math.min(this.base, 2); this.quiet = 0; this.armedT = 0; }

  // For the end of the job.
  report() {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    this.lastUnseen = this.worst <= 2;
    return {
      worst: this.worst,
      wantedFor: this.worst ? LAWS[this.worst].law : 'Nothing at all',
      clean: this.on && this.worst <= 2,
      lines: [...this.broken].sort((a, b) => b - a).map((n) => pick(LAWS[n].comic)),
      headline: pick(this.worst <= 2 ? HEADLINES.unseen : HEADLINES[Math.min(8, this.worst)]),
    };
  }

  // The report's extra part, as HTML: the clipping, the charges, the medal.
  reportHtml() {
    if (!this.on) return '';
    const r = this.report();
    const [head, sub] = r.headline;
    const paper = `<div style="margin:14px auto 10px;max-width:420px;padding:12px 16px 14px;background:#efe8d6;color:#1d1a15;transform:rotate(-1.4deg);box-shadow:0 4px 14px #0008;font-family:Georgia,'Times New Roman',serif;text-align:left">`
      + `<div style="display:flex;justify-content:space-between;font-size:10px;letter-spacing:.12em;border-bottom:2px solid #1d1a15;padding-bottom:3px">THE MIDTOWN HERALD<span>MORNING EDITION</span></div>`
      + `<div style="font-size:24px;font-weight:900;line-height:1.05;margin:8px 0 4px">${head}</div><div style="font-size:13px;font-style:italic">${sub}</div></div>`;
    const sheet = r.lines.length ? `<div style="text-align:left;margin:6px 0;font-size:13px"><span style="opacity:.6">Charge sheet</span>${r.lines.map((l) => `<div style="margin:3px 0">— ${l}</div>`).join('')}</div>` : '';
    const medal = r.clean ? '<div style="margin:8px 0;font-weight:700;color:#e8c95a">&#127941; Clean job — nobody ever saw you at it</div>' : '';
    return paper + sheet + medal;
  }

  // ---------------------------------------------------------------- on screen

  _dom() {
    const hud = document.getElementById('hud');
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:58px;right:18px;display:flex;gap:12px;align-items:flex-start;pointer-events:none;font:500 12px system-ui,sans-serif;color:#f2ece0;text-shadow:0 1px 3px #000c';
    el.innerHTML = '<ol data-sheet style="list-style:none;margin:0;padding:8px 10px;max-width:240px;background:#0006;border-radius:6px;display:none"></ol>'
      + '<div data-thermo style="position:relative;width:26px;height:190px">'
      + '<div style="position:absolute;left:7px;top:0;width:12px;height:160px;border-radius:6px 6px 0 0;background:#0008;border:2px solid #e8e2d0;border-bottom:0;overflow:hidden"><i data-fill style="position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(0deg,#d8452e,#ff8040);transition:height .5s"></i></div>'
      + '<div data-bulb style="position:absolute;left:0;top:156px;width:26px;height:26px;border-radius:50%;background:#d8452e;border:2px solid #e8e2d0;box-sizing:border-box"></div>'
      + '<b data-n style="position:absolute;left:0;top:161px;width:26px;text-align:center;font-size:12px">0</b>'
      + '<div data-steam style="position:absolute;left:-6px;top:-30px;width:38px;font-size:22px;opacity:0;transition:opacity .4s">&#9729;&#65039;</div>'
      + '</div>';
    hud?.appendChild(el);
    this.el = { root: el, sheet: el.querySelector('[data-sheet]'), thermo: el.querySelector('[data-thermo]'), fill: el.querySelector('[data-fill]'), n: el.querySelector('[data-n]'), steam: el.querySelector('[data-steam]'), bulb: el.querySelector('[data-bulb]') };
  }

  _show() {
    const s = this.fx.settings;
    const n = this.now;
    const key = `${n}|${this.broken.join()}|${s?.crimeMeter !== false}|${s?.lawsList !== false}`;
    if (key === this._shown) { if (n >= 8) this._boil(); return; }
    this._shown = key;
    this.el.thermo.style.display = s?.crimeMeter === false ? 'none' : '';
    this.el.sheet.style.display = s?.lawsList === false || !this.broken.length ? 'none' : '';
    this.el.fill.style.height = `${Math.round((n / 8) * 100)}%`;
    this.el.n.textContent = n;
    // The charge sheet, the worst at the top.
    this.el.sheet.innerHTML = '<li style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.75;margin-bottom:4px">Laws broken</li>'
      + [...this.broken].sort((a, b) => b - a).map((k) => `<li style="margin:2px 0;opacity:${k <= this.base || (k === 1 && n >= 1) ? 1 : 0.55};animation:lawin .5s"><b style="color:#ff9a70">§ ${k}</b> ${LAWS[k].law}</li>`).join('');
    if (n < 8) { this.el.steam.style.opacity = 0; this.el.bulb.style.transform = ''; }
  }

  // Level 8: the top pops off in a puff of steam and it flashes red.
  _boil() {
    const on = Math.floor(performance.now() / 250) % 2;
    this.el.steam.style.opacity = 1;
    this.el.bulb.style.background = on ? '#ff2a10' : '#d8452e';
    this.el.bulb.style.transform = `scale(${on ? 1.15 : 1})`;
    if (!this.burst) { this.burst = true; this.fx.audio?.snap?.(this.fx.player.pos.x, this.fx.player.pos.y, this.fx.player.pos.z); }
  }

  show(on) { this.el.root.style.display = on && this.on ? 'flex' : 'none'; }
}
