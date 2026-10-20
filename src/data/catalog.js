import { buildTower, ENTRY as TOWER_ENTRY } from '../building/tower.js';
import { buildNeighbour } from '../building/neighbour.js';
import { buildStreet } from '../building/street.js';
import { TRUMP } from '../building/plan.js';
import { FIFTH_AVENUE, WALL_STREET } from '../site.js';
import { BANK } from '../building/bank-plan.js';
import { buildBank, ENTRY as BANK_ENTRY } from '../building/bank.js';
import { buildWallStreetFurniture } from '../building/street.js';
import { buildWallStreet } from '../scenery/wallstreet.js';
import { buildCity } from '../scenery/city.js';

// Trump Tower, and the office block next door that it can be felled into.
function trumpAndNeighbour(P) {
  buildTower(P);
  buildNeighbour(P);
  buildStreet(P);
}

// Big Boy Bank, and Wall Street's lamps and bollards.
function bankAndStreet(P) {
  buildBank(P);
  buildWallStreetFurniture(P);
}

// The jobs and the tools, as data. The menus draw from this and nothing else.

export const JOBS = [
  {
    id: 'trump',
    title: 'Trump Tower',
    where: 'Fifth Avenue, New York',
    brief: 'Seventy metres of bronze glass on a six-storey podium: shops, restaurants, offices, apartments and a penthouse on top. The owner of the office block next door wants the view back, and so does the city: '
      + 'bring the tower above the podium down — and the block next door with it — below the height the difficulty sets. The podium stays. '
      + 'The gas is still connected in the plant room and the kitchens, so mind the tanks — and if something catches, put it out before it spreads.',
    target: 26,
    storeys: 17,
    height: 72,
    build: trumpAndNeighbour,
    plan: TRUMP,              // the building's floor plan (building/plan.js)
    site: FIFTH_AVENUE,       // where things are on the map (site.js)
    city: buildCity,          // the city round it
    entry: TOWER_ENTRY,
    unlocks: 'bomb',
  },
  {
    id: 'bank',
    title: 'Big Boy Bank',
    where: 'Wall Street, New York',
    brief: 'A stone banking hall of 1924 with a glass tower of 2008 rising out of it, 120 metres of it. The client liked the place as it was: '
      + 'bring the glass tower down to the old hall’s roof — the hall stays — and empty the vault, so there is no money to build it again. '
      + 'Carry the money out in bags to the van waiting in the street, and get in: that is the job done.',
    target: 31,               // the hall's roof and parapet: the tower below it
    storeys: 30,
    height: 120,
    build: bankAndStreet,
    plan: BANK,
    site: WALL_STREET,
    city: buildWallStreet,
    entry: BANK_ENTRY,
    strength: 1.8,            // much stronger than Trump Tower: more charges, better placed
    charges: 6,               // more in the detonator than the difficulty gives
    guards: 3,                // bank guards, more than the difficulty's
    requires: 'trump',        // finish Trump Tower first
    heist: true,              // money to the van, and the van ends the job
    unlocks: 'jackhammer',
  },
  { id: 'job3', title: 'Coming soon', locked: true },
];

export const TOOLS = [
  { id: 'sledge', name: 'Sledgehammer', kind: 'demolition', desc: 'Twelve pounds on a yard of hickory. Splinters wood, crumbles plaster, chips concrete — slowly.' },
  { id: 'bomb', name: 'Remote charges', kind: 'demolition', desc: 'A dozen charges and a detonator. Left click to stick one on, right click to set them all off.', unlockedBy: 'trump' },
  { id: 'jackhammer', name: 'Jackhammer', kind: 'demolition', desc: 'Breaks concrete properly.', unlockedBy: 'bank', soon: true },
  { id: 'torch', name: 'Cutting torch', kind: 'demolition', desc: 'Cuts through steel.', unlockedBy: 'job3', soon: true },
  { id: 'spray', name: 'Spray can', kind: 'helper', desc: 'Mark what comes down first. Right click changes colour.' },
  { id: 'extinguisher', name: 'Fire extinguisher', kind: 'helper', desc: 'Puts out fires before they reach the gas.' },
];

export const MAX_DEMOLITION = 3;

export const job = (id) => JOBS.find((j) => j.id === id);
export const tool = (id) => TOOLS.find((t) => t.id === id);
