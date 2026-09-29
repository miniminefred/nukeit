import { buildTower, ENTRY as TOWER_ENTRY, SITE as TOWER_SITE } from '../building/tower.js';
import { buildNeighbour } from '../building/neighbour.js';

// Trump Tower, and the office block next door that it can be felled into.
function trumpAndNeighbour(P) {
  buildTower(P);
  buildNeighbour(P);
}

// The jobs and the tools, as data. The menus draw from this and nothing else.

export const JOBS = [
  {
    id: 'trump',
    title: 'Trump Tower',
    where: 'Fifth Avenue, New York',
    brief: 'Fifty metres of bronze glass on a six-storey podium: shops, restaurants, offices and a penthouse on top. The owner of the office block next door wants the view back, and so does the city: '
      + 'bring the tower above the podium down — and the block next door with it — to below the podium roof, 26 metres. The podium stays. '
      + 'The gas is still connected in the plant room and the kitchens, so mind the tanks — and if something catches, put it out before it spreads.',
    target: 26,
    storeys: 12,
    height: 52,
    build: trumpAndNeighbour,
    entry: TOWER_ENTRY,
    site: TOWER_SITE,
    unlocks: 'bomb',
  },
  { id: 'job2', title: 'Coming soon', locked: true },
  { id: 'job3', title: 'Coming soon', locked: true },
];

export const TOOLS = [
  { id: 'sledge', name: 'Sledgehammer', kind: 'demolition', desc: 'Twelve pounds on a yard of hickory. Splinters wood, crumbles plaster, chips concrete — slowly.' },
  { id: 'bomb', name: 'Remote charges', kind: 'demolition', desc: 'A dozen charges and a detonator. Left click to stick one on, right click to set them all off.', unlockedBy: 'trump' },
  { id: 'jackhammer', name: 'Jackhammer', kind: 'demolition', desc: 'Breaks concrete properly.', unlockedBy: 'job2', soon: true },
  { id: 'torch', name: 'Cutting torch', kind: 'demolition', desc: 'Cuts through steel.', unlockedBy: 'job3', soon: true },
  { id: 'spray', name: 'Spray can', kind: 'helper', desc: 'Mark what comes down first. Right click changes colour.' },
  { id: 'extinguisher', name: 'Fire extinguisher', kind: 'helper', desc: 'Puts out fires before they reach the gas.' },
];

export const MAX_DEMOLITION = 3;

export const job = (id) => JOBS.find((j) => j.id === id);
export const tool = (id) => TOOLS.find((t) => t.id === id);
