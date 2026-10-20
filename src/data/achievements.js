// The achievements: things you do, in Deconstruction only. Bronze is easy,
// silver hard, gold really hard; a secret one shows as ??? until earned.
// Which are earned, and the counters that run across jobs, are kept in this
// browser (every access guarded, as in progress.js).

export const TIERS = { bronze: '#c58a52', silver: '#c8ccd2', gold: '#e8c95a' };

export const ACHIEVEMENTS = [
  // Bronze
  { id: 'penthouse', name: 'Penthouse visit', tier: 'bronze', hint: 'Ride the lift to the top floor and smash the piano' },
  { id: 'sightseer', name: 'Sightseer', tier: 'bronze', hint: 'Stand on the roof by the crown' },
  { id: 'firefighter', name: 'Firefighter', tier: 'bronze', hint: 'Put out 20 fires with the extinguisher' },
  { id: 'glass', name: 'Glass breaker', tier: 'bronze', hint: 'Smash 100 windows' },
  { id: 'cars', name: 'Car crusher', tier: 'bronze', hint: 'Drop rubble on 5 cars in the street' },
  { id: 'lunch', name: 'Lunch break', tier: 'bronze', hint: 'Smash the pizza oven and the ice-cream freezer in the food court' },
  { id: 'flood', name: 'Flood', tier: 'bronze', hint: 'Break a water main and set off 20 sprinklers in one job' },
  { id: 'busted', name: 'Busted', tier: 'bronze', hint: 'Get arrested. Everyone does, once' },
  { id: 'mystery', name: 'Mystery headline', tier: 'bronze', hint: 'Make the paper ask "WHO DID THIS?"' },
  { id: 'waterfall', name: 'Waterfall', tier: 'bronze', hint: 'Break the pink marble wall in the atrium' },
  { id: 'boardroom', name: 'Boardroom', tier: 'bronze', hint: 'Smash the boardroom table on the Trump Organization floor' },
  // Silver
  { id: 'onebutton', name: 'One button', tier: 'silver', hint: 'Finish the job with a single press of the detonator' },
  { id: 'precision', name: 'Precision', tier: 'silver', hint: 'Finish with the podium still standing whole' },
  { id: 'gas', name: 'Gas leak', tier: 'silver', hint: 'Set off 5 gas bottles or transformers in one job' },
  { id: 'chain', name: 'Chain reaction', tier: 'silver', hint: 'Have 10 supports give way on their own in one collapse' },
  { id: 'smoke', name: 'Smoke screen', tier: 'silver', hint: 'Lose someone chasing you in dust or smoke' },
  { id: 'closecall', name: 'Close call', tier: 'silver', hint: 'Get away from an officer who was within 2 m of you' },
  { id: 'escape', name: 'Escape artist', tier: 'silver', hint: 'Get thrown out by the guards 3 times and still finish' },
  { id: 'nothere', name: 'Not here', tier: 'silver', hint: 'Have the police search every floor and leave' },
  { id: 'mostwanted', name: 'Most wanted', tier: 'silver', hint: 'Become a Threat to New York City' },
  { id: 'vault', name: 'Vault breaker', tier: 'silver', hint: 'Break through the round steel door on the lower level', secret: true },
  { id: 'pancake', name: 'Pancake', tier: 'silver', hint: 'Bring the tower straight down, floor by floor, without it tipping' },
  { id: 'liftop', name: 'Lift operator', tier: 'silver', hint: 'Escape a chase in the lift' },
  { id: 'tiger', name: 'Crouching tiger', tier: 'silver', hint: 'Crouch within 4 m of a guard without being seen' },
  { id: 'inferno', name: 'Inferno', tier: 'silver', hint: 'Have 30 things burning at once' },
  { id: 'taser', name: 'Taser proof', tier: 'silver', hint: 'Get tasered or netted and still finish the job' },
  { id: 'survivor', name: 'Survivor', tier: 'silver', hint: 'Be inside the tower when it comes down, and live' },
  { id: 'books', name: 'Paper trail', tier: 'silver', hint: 'Hand the bank’s secret books in at the van', secret: true },
  // Gold
  { id: 'ghost', name: 'Ghost', tier: 'gold', hint: 'Finish the job without anyone ever seeing you at it' },
  { id: 'hammer', name: 'Hammer only', tier: 'gold', hint: 'Finish the job with the sledgehammer alone, no charges' },
  { id: 'done', name: 'Done, done! IT IS DONE!', tier: 'gold', hint: 'Bring the tower below 10 m — more than the job asks', secret: true },
  { id: 'every', name: 'Every difficulty', tier: 'gold', hint: 'Finish the job on Easy, Normal, Hard and Insane' },
  { id: 'fullhouse', name: 'Full house', tier: 'gold', hint: 'Break all eight laws in one job' },
];

const KEY = 'nukeit.achievements.v1';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { earned: Array.isArray(v?.earned) ? v.earned : [], counts: v?.counts && typeof v.counts === 'object' ? v.counts : {} };
  } catch { return { earned: [], counts: {} }; }
}

const state = read();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing saved */ } };

export const record = {
  has: (id) => state.earned.includes(id),
  earn(id) { if (state.earned.includes(id)) return false; state.earned.push(id); save(); return true; },
  // A counter that runs across jobs; returns the new total.
  add(key, n = 1) { state.counts[key] = (state.counts[key] ?? 0) + n; save(); return state.counts[key]; },
  get count() { return state.earned.length; },
};
