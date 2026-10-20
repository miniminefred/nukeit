// What you can buy with what you take (data/wallet.js), in four kinds:
// tools, upgrades, disguises and fun. A tool bought is yours without
// finishing the job that unlocks it; an upgrade works on every job; a
// disguise is worn from the start of a job (chosen on the tools page) and
// works like the workman's vest — they see you less, and a little breaking
// looks like your job; the fun things are just for fun.

export const SHOP = [
  { id: 'bomb', kind: 'tools', name: 'Remote charges', price: 250000, desc: 'The detonator and its charges, without finishing Trump Tower first.' },
  { id: 'jackhammer', kind: 'tools', name: 'Jackhammer', price: 600000, desc: 'Chews through concrete: loud, slow to walk with, shakes you to the teeth.' },
  { id: 'heavySledge', kind: 'upgrades', name: 'Heavier sledge', price: 150000, desc: 'A sixteen-pound head: every blow does 40% more.' },
  { id: 'bigCharges', kind: 'upgrades', name: 'Bigger charges', price: 250000, desc: 'A quarter wider a blast, a third more power against concrete.' },
  { id: 'moreCharges', kind: 'upgrades', name: 'Four more charges', price: 120000, desc: 'Four more in the detonator, every job.' },
  { id: 'bigExtinguisher', kind: 'upgrades', name: 'Big extinguisher', price: 80000, desc: 'Half as much powder again.' },
  { id: 'strongBack', kind: 'upgrades', name: 'Strong back', price: 200000, desc: 'Carry money faster: one bag at 65% of your speed, two at 35%.' },
  { id: 'suit', kind: 'disguises', name: "Banker's suit", price: 150000, desc: 'Grey, pinstriped, a tie. In a bank, nobody looks twice.' },
  { id: 'uniform', kind: 'disguises', name: "Guard's uniform", price: 300000, desc: 'Navy, a cap, a radio. The guards take you for one of them.' },
  { id: 'overalls', kind: 'disguises', name: "Cleaner's overalls", price: 80000, desc: 'Nobody ever notices the cleaner.' },
  { id: 'goldSledge', kind: 'fun', name: 'Golden sledge', price: 400000, desc: 'The same sledgehammer, in gold. Because you can.' },
  { id: 'paints', kind: 'fun', name: 'More paint', price: 40000, desc: 'Gold, hot pink, cyan and lime for the spray can.' },
  { id: 'horn', kind: 'fun', name: 'Party horn', price: 20000, desc: 'Press H. Everyone looks. The pigeons do not like it.' },
];

export const item = (id) => SHOP.find((i) => i.id === id);

// What finishing a job pays you, on top of any money you took: the fee.
export const FEE = { supereasy: 20000, easy: 50000, normal: 100000, hard: 150000, insane: 250000 };
export const HALL_BONUS = 250000;          // the bank's stone hall left standing
