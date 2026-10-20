// Where things are on a job's map, for every system that needs a place
// rather than a piece: where you arrive, the street and its lanes, the front
// doors, where the guards stand their shifts, where the police park and SWAT
// come in, where the crowd watches from, where the pigeons are. Each job has
// its own (FIFTH_AVENUE below; Wall Street's with the bank), and `useSite`
// puts one in force before the job is built. The building's own plan —
// floors, core, lift — is building/plan.js.
//
// The street always runs along x in front of the building (+z), traffic going
// −x; the building stands about the origin.

export const SITE = {};

export function useSite(s) {
  for (const k of Object.keys(SITE)) delete SITE[k];
  Object.assign(SITE, s);
}

// Fifth Avenue, in front of Trump Tower.
export const FIFTH_AVENUE = {
  name: 'Fifth Avenue',
  entry: { x: 0, z: 20, yaw: 0 },                  // where you arrive, facing the door
  street: {
    z: 34, width: 16,                              // the asphalt
    lanes: [28.3, 31.8, 35.6, 39.2],               // traffic, all going −x
    kerbs: [25.2, 42.8],                           // our kerb, the far one
    pavements: [21.5, 46.5],                       // down the middle of each
    stop: 8,                                       // the stop line before the crossing
    walkers: 26,                                   // people on the pavements
  },
  // The front doors: the revolving doors' x, and the line through them —
  // outside the glass, inside it — that anyone coming in walks.
  doors: { x: [-1.4, 1.4], approach: 13.4, outside: 12.8, through: 10.6, inside: 9.8, exit: 13.5 },
  // Out of the stairwell on the ground floor, after coming down it.
  stairOut: { x: -3.3, z: 4.6 },
  liftCrowd: { x: 1.2, z: 4.8 },
  // Guards' posts: [floor, x, z]; floors may name the plan's: 'lower', 'hq'.
  posts: [[0, -8, 8], [0, 8, -4], ['lower', -14, 4], [1, -10, 0], [2, -6, -9], ['hq', -2, 6], [3, 6, -8], [4, -12, -6], [0, 16, 6]],
  // The police cars: along the kerb lane, parking from x `park`, the officers out at `out`.
  police: { lane: 27.8, park: -10, out: 25.6, from: 140 },
  // SWAT's van: down the lane, over the kerb to `stop`; the helicopter patrols over the street.
  swat: { from: 160, lane: 27.8, turn: 16, stop: [1.5, 17.5], kerb: [24.4, 26], heli: { z: 36, y: 80, reach: 45 } },
  // Out of the building: across the street to watch from here, filming it.
  evacuate: { out: 14, watch: { x0: -14, x1: 14, z0: 44.5, z1: 47.5 }, look: [0, 0] },
  spectacle: [0, 30, -4],                          // what the street watches when it comes down
  pigeons: [
    [-12, 17], [9, 18], [-26, 22], [24, 21], [-50, 22], [46, 23], [-80, 22], [75, 21],
    [-18, 46], [14, 45], [-42, 46], [38, 47], [-70, 45], [66, 46],
  ],
  menuCamera: { at: [19, 2.2, 31], look: [0, 42, 0] },
  respawn: [0, 1, 20],
};

useSite(FIFTH_AVENUE);

// Wall Street, in front of Big Boy Bank (scenery/wallstreet.js): one way, a
// parking lane on our side where the getaway van waits.
export const WALL_STREET = {
  name: 'Wall Street',
  entry: { x: 0, z: 21, yaw: 0 },
  street: { z: 28, width: 10, lanes: [27.5, 30.5], kerbs: [23, 33], pavements: [21, 35], stop: -999, walkers: 22 },
  // Up the bank's steps and in at the bronze doors.
  doors: { x: [-1.1, 1.1], approach: 14.6, outside: 14.4, through: 13.0, inside: 12.4, exit: 14.8 },
  stairOut: { x: -3.3, z: 4.6 },
  liftCrowd: { x: 1.2, z: 4.8 },
  posts: [[0, -8, 10], [0, 8, 10], ['lower', -12, -3], [0, -18, 0], [1, -18, -6], [3, 18, 0], ['hq', 0, 6], [7, -8, -1], [0, 18, 11]],
  police: { lane: 24.5, park: -16, out: 22.4, from: 140 },
  swat: { from: 160, lane: 27.5, turn: 18, stop: [2, 21.2], kerb: [22.6, 23.4], heli: { z: 28, y: 112, reach: 40 } },
  evacuate: { out: 19.8, watch: { x0: -16, x1: 16, z0: 33.6, z1: 36.4 }, look: [0, 0] },
  spectacle: [0, 60, -2],
  pigeons: [[-10, 21], [12, 21.5], [-32, 21], [34, 20.5], [-55, 21], [50, 21], [-24, 35], [20, 35.5], [-45, 35], [42, 34.5]],
  menuCamera: { at: [26, 2.2, 31], look: [0, 70, 0] },
  respawn: [0, 1, 21],
  // The getaway van, parked in the bay east of the bank, its back doors open.
  van: { x: 34, z: 24.6, yaw: -Math.PI / 2 },
};
