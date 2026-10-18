// How hard a job is. Chosen with the job; the harder, the stronger the
// building, the lower it has to come, the fewer charges and the less powder,
// the sooner the police come, and the more guards there are and the better
// they are armed (sim/security.js). Insane is earned: finish a job on Normal
// or Hard first.
//
//   strength   times the durability of everything (render/materials.js HITS)
//   target     metres the job's buildings have to come below
//   charges    in the detonator
//   discharge  seconds of powder in an extinguisher
//   police     seconds after heavy destruction until they arrive (null: never)
//   guards     how many, and what they may carry (each guard picks one)

export const LEVELS = [
  { id: 'supereasy', name: 'Super easy', blurb: 'A practice run: no guards, no police, a weak old building. Just knock it down.',
    strength: 0.45, target: 40, charges: 20, discharge: 22, police: null, guards: 0, arms: [] },
  { id: 'easy', name: 'Easy', blurb: 'A couple of guards who shout. The police take their time.',
    strength: 0.7, target: 32, charges: 16, discharge: 18, police: 150, guards: 2, arms: ['shout'] },
  { id: 'normal', name: 'Normal', blurb: 'The building as built, light security: guards who shout, chase you and carry nets.',
    strength: 1, target: 26, charges: 12, discharge: 14, police: 90, guards: 3, arms: ['shout', 'tackle', 'net'] },
  { id: 'hard', name: 'Hard', blurb: 'A stronger building, a lower target, fewer charges. Guards with tasers; the police are quick.',
    strength: 1.4, target: 20, charges: 10, discharge: 11, police: 50, guards: 5, arms: ['shout', 'tackle', 'net', 'taser'] },
  { id: 'insane', name: 'Insane', blurb: 'Very hard to finish. Armed guards, police almost at once, a building that will not come down easily.',
    strength: 2, target: 12, charges: 8, discharge: 8, police: 25, guards: 8, arms: ['tackle', 'net', 'taser', 'gun'], earned: true },
];

export const level = (id) => LEVELS.find((l) => l.id === id) ?? LEVELS[2];
