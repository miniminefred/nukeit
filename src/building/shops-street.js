import { assembly } from './kit.js';
import * as S from './furniture-shop.js';
import * as F from './furniture.js';
import * as E from './furniture-food.js';
import * as H2 from './furniture-home.js';
import * as L2 from './furniture-lobby.js';
import { shell, frame, look, put, place, menu, styled, onWall, rugAt, SHOP_H as H } from './shops.js';

// The street's own kinds of shop, for the ground floors of the blocks along
// Fifth Avenue (building/street.js): New York food — a deli, a bagel shop,
// pizza by the slice — a bank with its cash machines, a hotel's lobby with a
// doorman under the canopy, an office building's lobby. Built like the mall's
// shops (building/shops.js): the unit's front at local +z, everything pieces.

const MENU_TINT = { deli: 0x1f5a3a, bagels: 0x7a4a1e, pizza: 0xb8261d };

// ---------------------------------------------------------------- a deli, or a bagel shop

// The counter across the shop, glass-fronted, cold cuts and salads in it; the
// sandwich board lit over the back counter; fridges of drinks down one wall;
// bread on the shelves; a counter along the window with stools.
export function deli(P, cx, y, cz, yaw, w, d, { name = 'MIDTOWN DELI', h = H, bagels = false } = {}) {
  const L = look(cx, cz, y);
  const fr = frame(cx, y, cz, yaw, L.mirror);
  return styled(L, () => {
    shell(P, fr, w, d, { name, h, door: w / 2 - 1.0, wallTint: L.wall, fascia: bagels ? 0x3a2416 : 0x163a26 });
    const back = -d / 2 + 0.1;
    const cw = Math.min(w - 2.8, 5);
    const counterZ = back + 2.0;
    put(P, fr, S.displayCounter, -0.6, counterZ, 0, cw);
    put(P, fr, S.till, -0.6 + cw / 2 + 0.35, counterZ, 0);
    // The back: a prep counter under the lit board, bread beside it.
    put(P, fr, F.counter, -0.8, back + 0.35, 0, Math.min(cw, 3));
    onWall(P, fr, S.menuBox, -0.8, back + 0.13, 0, 1.75, Math.min(cw, 3), MENU_TINT[bagels ? 'bagels' : 'deli']);
    put(P, fr, S.breadShelves, -w / 2 + 0.9, back + 0.4, 0, bagels ? 1.6 : 1.0);
    if (bagels) put(P, fr, S.breadShelves, w / 2 - 1.4, back + 0.4, 0, 1.4);
    menu(P, fr, w / 2 - 1.0, back + 0.03, 1.75, bagels ? 'BAGELS\nplain  1.80\neverything  2.10\nwith cream cheese +2' : 'SANDWICHES\npastrami on rye  12\nturkey club  10\nBLT  8.50');
    // Drinks down the wall by the door.
    for (let k = 0; k < 3; k++) put(P, fr, F.fridge, w / 2 - 0.42, d / 2 - 2.6 - k * 0.75, -Math.PI / 2);
    // Along the window, stools facing the street.
    const bl = Math.min(w / 2, 3.6);
    put(P, fr, S.windowBar, -w / 2 + bl / 2 + 0.3, d / 2 - 0.35, 0, bl);
    for (let sx = -bl / 2 + 0.35; sx < bl / 2 - 0.2; sx += 0.6) place('seat', fr, -w / 2 + bl / 2 + 0.3 + sx, d / 2 - 0.8, 0);
    place('staff', fr, -1.4, counterZ - 0.8, 0);
    place('staff', fr, -0.6 + cw / 2 + 0.35, counterZ - 0.7, 0);
    place('queue', fr, -0.2, counterZ + 0.9, Math.PI);
    place('queue', fr, 0.4, counterZ + 1.7, Math.PI);
    place('browse', fr, w / 2 - 1.2, d / 2 - 3.2, Math.PI / 2);
    return { yaw: fr.yaw() };
  });
}

// ---------------------------------------------------------------- pizza by the slice

export function pizzeria(P, cx, y, cz, yaw, w, d, { name = "TONY'S PIZZA", h = H } = {}) {
  const L = look(cx, cz, y);
  const fr = frame(cx, y, cz, yaw, L.mirror);
  return styled(L, () => {
    shell(P, fr, w, d, { name, h, door: w / 2 - 1.0, wallTint: L.variant ? 0xf2ead8 : 0xe8dcc8, fascia: 0x5a1612 });
    const back = -d / 2 + 0.1;
    const cw = Math.min(w - 3, 4.2);
    const counterZ = back + 2.2;
    // The oven in the back corner, the slices under the lamp on the counter.
    put(P, fr, S.pizzaOven, w / 2 - 1.1, back + 0.9, 0);
    put(P, fr, S.stallCounter, -0.4, counterZ, 0, cw, 0x8a1c16);
    put(P, fr, S.pizzaDisplay, -0.6, counterZ, 0, Math.min(cw - 1, 2.4));
    put(P, fr, F.counter, -1.2, back + 0.35, 0, Math.min(cw, 2.6));
    onWall(P, fr, S.menuBox, -1.0, back + 0.13, 0, 1.75, Math.min(cw, 2.8), MENU_TINT.pizza);
    // Tables along the other wall, red chairs.
    for (let z = -d / 2 + 3.6; z < d / 2 - 1.0; z += 1.5) {
      put(P, fr, E.cafeTable, -w / 2 + 0.9, z, 0);
      put(P, fr, E.bistroChair, -w / 2 + 1.55, z, -Math.PI / 2, 0x9a1e18);
      place('seat', fr, -w / 2 + 1.55, z, -Math.PI / 2);
      if (L.rnd() < 0.6) put(P, fr, S.tray, -w / 2 + 0.9, z, L.rnd() * 6, 'pizza', 0.74);
    }
    onWall(P, fr, S.picture, -w / 2 + 0.1, -0.5, Math.PI / 2, 1.6, 1.0, 0.7, [0x2a5a3a, 0xf2e8d0, 0xb8261d]);
    place('staff', fr, -0.4, counterZ - 0.7, 0);
    place('staff', fr, w / 2 - 1.1, back + 1.9, Math.PI);
    place('queue', fr, 0, counterZ + 0.9, Math.PI);
    place('queue', fr, 0.5, counterZ + 1.7, Math.PI);
    return { yaw: fr.yaw() };
  });
}

// ---------------------------------------------------------------- a bank branch

// Cash machines in the wall by the door; tellers behind a counter with glass
// over it at the back; a rope line to wait in; a bench, a plant, a picture.
export function bank(P, cx, y, cz, yaw, w, d, { name = 'FIFTH NATIONAL BANK', h = H } = {}) {
  const L = look(cx, cz, y);
  const fr = frame(cx, y, cz, yaw, L.mirror);
  return styled(L, () => {
    shell(P, fr, w, d, { name, h, style: 'gold', door: w / 2 - 1.2, wallTint: 0xe8e2d4, fascia: 0x14243a });
    const back = -d / 2 + 0.1;
    // Two cash machines in the side wall.
    for (let k = 0; k < 2; k++) put(P, fr, atm, -w / 2 + 0.25, d / 2 - 1.6 - k * 1.1, Math.PI / 2);
    // The tellers' counter, glass over it.
    const tw = Math.min(w - 1.6, 5.4);
    put(P, fr, (P2, x, yy, z, a) => assembly(P2, x, yy, z, a, [
      { kind: 'wood', round: 0.02, boxes: [[-tw / 2, 0, -0.35, tw / 2, 1.05, 0.35]], tint: 0x5a3a24 },
      { kind: 'marble', boxes: [[-tw / 2 - 0.03, 1.05, -0.38, tw / 2 + 0.03, 1.1, 0.4]], tint: 0xece6dc },
      { kind: 'clearglass', boxes: [[-tw / 2, 1.1, 0.0, tw / 2, 2.2, 0.02]], tint: 0xe6f0ee },
    ], 'furniture', { colliders: [[-tw / 2, 0, -0.38, tw / 2, 2.2, 0.4]] }), 0, back + 1.4, 0);
    put(P, fr, L2.stanchions, 0.3, back + 3.4, Math.PI / 2, 3, 1.1);
    put(P, fr, L2.steelBench, w / 2 - 0.6, 0.2, -Math.PI / 2, 1.6);
    put(P, fr, F.plant, w / 2 - 0.5, back + 0.5, 0, true);
    onWall(P, fr, S.picture, w / 2 - 0.1, -0.8, -Math.PI / 2, 1.5, 1.2, 0.8, L.art);
    for (const tx of [-tw / 4, tw / 4]) place('staff', fr, tx, back + 0.7, 0);
    place('queue', fr, -tw / 4, back + 2.2, Math.PI);
    place('queue', fr, 0.6, back + 3.0, Math.PI);
    place('browse', fr, -w / 2 + 0.85, d / 2 - 1.6, -Math.PI / 2);
    return { yaw: fr.yaw() };
  });
}

// A cash machine: a steel box in the wall, its screen lit, keys, the slot.
function atm(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', round: 0.02, boxes: [[-0.38, 0, -0.15, 0.38, 1.75, 0.15]], tint: 0x6a7078 },
    { kind: 'screen', boxes: [[-0.22, 1.2, 0.15, 0.22, 1.5, 0.16]] },
    { kind: 'plastic', boxes: [[-0.2, 0.95, 0.12, 0.2, 1.05, 0.3], [-0.12, 1.12, 0.15, 0.12, 1.16, 0.17]], tint: 0x1a1a1a },
  ], 'cladding', { structural: false });
}

// ---------------------------------------------------------------- a hotel's lobby

// A canopy out over the pavement on brass posts, its name along it, a doorman
// under it; inside, the desk at the back, sofas and armchairs on a rug, a
// chandelier, plants by the door.
export function hotel(P, cx, y, cz, yaw, w, d, { name = 'THE HARLAND', h = H } = {}) {
  const L = look(cx, cz, y);
  const fr = frame(cx, y, cz, yaw, false);
  return styled(L, () => {
    shell(P, fr, w, d, { name, h, style: 'gold', door: 0, wallTint: 0xe6d8c0, fascia: 0x1a1612 });
    const back = -d / 2 + 0.1;
    // The canopy: out from the front, over the pavement.
    const out = 3.2, cw = 2.6;
    put(P, fr, (P2, x, yy, z, a) => assembly(P2, x, yy, z, a, [
      { kind: 'fabric', boxes: [[-cw / 2, 2.9, 0, cw / 2, 3.1, out]], tint: 0x1a2a20 },
      { kind: 'brass', boxes: [{ cyl: [-cw / 2 + 0.08, 1.45, out - 0.1], r: 0.04, h: 2.9, seg: 8 }, { cyl: [cw / 2 - 0.08, 1.45, out - 0.1], r: 0.04, h: 2.9, seg: 8 }] },
    ], 'furniture', { structural: false, colliders: [[-cw / 2, 2.85, 0, cw / 2, 3.1, out]] }), 0, d / 2, 0);
    put(P, fr, F.receptionDesk, 0, back + 1.0, 0);
    put(P, fr, rugAt, -w / 4, 0.4, 0, 3.2, 2.4, 0x6a2a22);
    put(P, fr, F.sofa, -w / 4, -0.5, Math.PI, 0x2a3a2e);
    put(P, fr, H2.armchair, -w / 4 - 1.4, 0.9, -Math.PI / 2, 0x7a5a3a);
    put(P, fr, H2.armchair, -w / 4 + 1.4, 0.9, Math.PI / 2, 0x7a5a3a);
    put(P, fr, H2.coffeeTable, -w / 4, 0.8, 0);
    for (const sx of [-w / 2 + 0.5, w / 2 - 0.5]) put(P, fr, F.plant, sx, d / 2 - 0.5, 0, true);
    { const [lx, lz] = fr.at(0, 0); F.chandelier(P, lx, y + h, lz); }
    onWall(P, fr, S.roundMirror, w / 2 - 0.1, 0, -Math.PI / 2, 1.5, 0.5);
    place('staff', fr, 0, back + 0.45, 0);
    // The doorman, under the canopy.
    place('staff', fr, 0.9, d / 2 + 1.0, 0);
    place('seat', fr, -w / 4, -0.2, Math.PI);
    place('browse', fr, 0.5, back + 1.9, Math.PI);
    return { yaw: fr.yaw() };
  });
}

// ---------------------------------------------------------------- an office building's lobby

// The security desk, the turnstiles behind it, the lift doors in the back
// wall in brass, a bench, a planter, a picture: the way up into the offices.
export function officeLobby(P, cx, y, cz, yaw, w, d, { name = '510 FIFTH AVENUE', h = H } = {}) {
  const L = look(cx, cz, y);
  const fr = frame(cx, y, cz, yaw, L.mirror);
  return styled(L, () => {
    shell(P, fr, w, d, { name, h, door: 0, wallTint: 0xd8d4cc, fascia: 0x222428 });
    const back = -d / 2 + 0.1;
    // Lift doors in the back wall.
    for (const lx of [-1.4, 1.4]) put(P, fr, (P2, x, yy, z, a) => assembly(P2, x, yy, z, a, [
      { kind: 'brass', boxes: [[-0.75, 0, 0, 0.75, 2.3, 0.05], [-0.8, 2.3, 0, 0.8, 2.45, 0.06]] },
      { kind: 'steel', boxes: [[-0.01, 0, 0.05, 0.01, 2.3, 0.06]], tint: 0x3a3a3a },
    ], 'cladding', { structural: false }), lx, back + 0.01, 0);
    // The turnstiles across the way to the lifts.
    const gates = [];
    for (let k = -2; k <= 2; k++) gates.push([k * 0.75 - 0.08, 0, -0.35, k * 0.75 + 0.08, 1.0, 0.35]);
    put(P, fr, (P2, x, yy, z, a) => assembly(P2, x, yy, z, a, [{ kind: 'steel', round: 0.02, boxes: gates, tint: 0xa8acb0 }], 'furniture', { structural: false }), 0, back + 2.4, 0);
    put(P, fr, F.receptionDesk, -w / 2 + 1.6, 0.6, Math.PI / 2);
    put(P, fr, L2.steelBench, w / 2 - 0.6, 0.6, -Math.PI / 2, 1.8);
    put(P, fr, (P2, x, yy, z) => L2.planter(P2, x, yy, z, Math.min(3, w - 3)), 0, d / 2 - 1.0, 0);
    onWall(P, fr, S.picture, w / 2 - 0.1, -0.6, -Math.PI / 2, 1.6, 1.6, 1.0, L.art);
    place('staff', fr, -w / 2 + 0.9, 0.6, Math.PI / 2);
    place('browse', fr, 1.4, back + 0.9, Math.PI);
    place('seat', fr, w / 2 - 0.7, 0.6, -Math.PI / 2);
    return { yaw: fr.yaw() };
  });
}

