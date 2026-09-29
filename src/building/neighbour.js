import { buildBlock, offices } from './block.js';

// The office block next door, behind Trump Tower across a four-metre service
// yard: twelve storeys of 3.6 m on a 26 by 24 metre plan, concrete frame and
// core, blue-grey glass curtain wall pane by pane, open-plan offices. It is
// what the tower falls into when its north side goes. (Every other block in
// the city is built the same way when something reaches it: building/block.js.)
//
//          x -13                   13
//   z -40   +-----------------------+
//           |   .   .   .   .   .   |   columns on a 6.5 by 6 m grid
//           |   .  +--core--+   .   |
//           |   .  |        |   .   |
//           |   .  +--------+   .   |
//   z -16   +-----------------------+
//                  service yard
//   z -12   ===== Trump Tower's podium; its tower's north face at z = -9 =====

export const NEIGHBOUR = { x0: -13, x1: 13, z0: -40, z1: -16, storeys: 12, h: 3.6 };

export function buildNeighbour(P) {
  const { x0, x1, z0, z1 } = NEIGHBOUR;
  buildBlock(P, {
    ...NEIGHBOUR, building: 'neighbour', detail: true, tint: 0x4d545c, glass: 0x9fb2c4,
    offices: (Q, f, y) => offices(Q, f, y, x0, x1, z0, z1, 'neighbour'),
  });
}
