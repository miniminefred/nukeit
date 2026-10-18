# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NukeIt

A realistic first-person demolition game in the browser, built with **Three.js**, **Rapier**
physics and **three-bvh-csg**, bundled by **Vite**. It is a new game: nothing in it comes
from the sibling projects, and nothing should be copied in from them.

**"Realistic" is the brief, and it has been spelled out more than once.** The owner has
rejected three things so far, and all three are worth remembering:

- **Blocks.** The first build was a 25 cm voxel engine. "Realistic means NOT cubic." It was
  thrown away for real geometry.
- **Box furniture and box debris.** Things are rounded boxes, tubes, cones and lumpy
  blobs (`render/geometry.js` `shape()`), and every broken piece is cut with CSG, so its
  broken faces are rough and show the material's inside.
- **"Realistic Minecraft".** Hitting a column has to knock a *piece* off it that falls,
  and weight has to matter. See **How things break** below.

Keep the code in small ES modules under `src/`. When a module gets large or mixes
concerns, split it.

## The one hard rule: AI-only development

Claude writes all of the code. There is **no visual/scene editor**: no Unity, no Godot
editor, no Blender in the loop. Build tools, bundlers, package managers and CLIs are fine.
Every model, texture and sound is made in code: textures are painted procedurally
(`render/textures.js`), sounds are synthesised (`audio.js`), there are no asset files.

## Launching a session

The desktop shortcut **Create NukeIt** runs `..\launch-nukeit.ps1`, a thin wrapper over
`C:\Users\alfred\projects\launch-claude.ps1 -Game nukeit`: Windows Terminal, PowerShell 7,
UTF-8, `npm install` if needed, then `claude`. The launchers live outside this repo.

## Rules for every session

### 1. Commit every change immediately
After **every** file edit, stage and commit before moving on (`git add -A` then
`git commit -m "…"`). One logical change per commit.

**Every commit is `miniminefred <315911906+miniminefred@users.noreply.github.com>` and
nothing else** — set globally and in this repo's local config. Never a work or personal
address, never a `Co-Authored-By: Claude …` trailer or a "Generated with Claude Code" line.
The repo is public. See `~/.claude/CLAUDE.md`.

### 2. Start the dev server on session start
`npm run dev` — **http://localhost:8093**. (Siblings: 8080 blobgame, 8090 fpsgame,
8091 medieval, 8092 destroy.)

### 3. Test after every change
Check it in the browser; keep `npm run build` green (it checks imports, not types).

In dev, `window.dev` has everything, including:

- `dev.start('trump', ['sledge', 'spray', 'extinguisher'])` loads a job without the menu.
- `dev.bench()` is the collapse bench; `dev.rig = { at, look }` holds the camera.
- `dev.step(dt, n)` runs whole frames by hand. Pretend the pointer is locked with
  `dev.input.mouse.locked = true; dev.state = 'play'`, and hold a tool down with
  `dev.input.mouse.left = true`.
- `dev.select(i)` changes tool; `dev.measure()` gives the standing height. `dev.water`,
  `dev.smoke`, `dev.powder`, `dev.security` are there too.

**Testing on screen without the browser extension**: start Chrome headless with a debugging
port — `chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch>
--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist http://localhost:8093/` — and drive it
over the DevTools protocol (a fifty-line Node script with the global `WebSocket`:
`Runtime.evaluate`, `Page.captureScreenshot`, `Profiler.start/stop`). It renders on the real
GTX 680, `document.hidden` is false and `requestAnimationFrame` runs, so `dev.bench()` times
real frames. This is how every number in "Keeping it smooth" since October was measured.
Vite reloads the page on every file edit: wait for `window.dev` again after one.

Two traps in testing from a hidden tab (the Chrome extension's tab always was):

- **Screenshots can go stale.** A background tab stops being composited after a while and
  every screenshot comes back identical. It is not the renderer (check
  `renderer.info.render.frame`); open a fresh tab.
- **Check where the camera is before believing a picture.** An hour went on a "stale"
  screenshot that was actually the inside face of the core wall, because the camera had
  been parked inside the core.

## Publishing

Public at **github.com/miniminefred/nukeit**, live at **https://miniminefred.github.io/nukeit/**.
`.github/workflows/deploy.yml` builds and publishes on every push to `master`.

- The Pages base path goes on the command line (`--base=/nukeit/`), not in `vite.config.js`.
- Runtime-built asset URLs need `import.meta.env.BASE_URL`; there are none yet.
- The `github-pages` environment's branch allowlist had to have `master` added by hand.
- In Git Bash, MSYS mangles `--base=/nukeit/`; use `MSYS_NO_PATHCONV=1` or PowerShell.

## The game

A menu (`ui/menu.js`) with two pages: **the job**, then **the tools**. Pick up to three
demolition tools from the ones you have unlocked; the helpers (spray can, extinguisher)
always come along. Then the job loads and you are put at the door.

- **Jobs and tools are data** in `data/catalog.js`. Trump Tower is open, and two more slots
  are shown locked as "coming soon". Tools unlock by finishing jobs (`data/progress.js`,
  `localStorage` with every access guarded): Trump Tower unlocks the remote charges.
- **Five difficulties**, chosen on the job page (`data/difficulty.js`): Super easy (a
  practice run, no guards, a weak building), Easy, Normal (the building as built, light
  security), Hard, and Insane — earned by finishing on Normal or Hard. Each sets the
  building's strength (`pieces.strength`, times every durability), the target height
  (40 / 32 / 26 / 20 / 12 m), the charges in the detonator, the seconds of powder in an
  extinguisher, how soon the police come, and how many guards there are and what they carry.
  Completions are remembered per difficulty.
- **The job is a height**: bring the tower above the podium, and the office block next
  door, below the difficulty's target (26 m on Normal: the podium roof). Height is the top
  of every *static* piece that is not debris, in **those two buildings only** — a city block
  woken by the fall does not count. The job ends 3.5 s after the target is met with nothing
  still collapsing. The podium is meant to be left standing.
- **It is a children's game.** Realism is for buildings, breaking, fire, water and the city;
  people are stylised, nobody bleeds, there are no harrowing screams, a police tackle is a
  comic heap. Real guns only on Insane, and a hit only costs health.
- **You can die**: falls, blasts, fire, being under a collapse. You come back at the door
  and the building stays as broken as you left it.

## The building is a place

Not a stack of offices — the owner asked for restaurants, shops and Trump's
house on top. `building/plan.js` holds the plan and `PROGRAMME`;
`building/interiors.js` furnishes each floor from it:

The programme is **the real tower's**, in its proportions on seventeen storeys (the owner
supplied it; more apartments than offices, as in the real one):

| floor | what it is |
|---|---|
| LL | the lower level, in a pit a storey deep under the podium: the vault behind a round steel door, goods receiving (pallets, a forklift, the roller door), the plant (transformers, gas, boiler, switchgear), the restaurants' kitchens |
| 0 | lobby: reception, the **18 m waterfall** of pink marble down the atrium wall, gold escalators, café |
| 1 | fashion boutiques, and the flagship store behind a gold portal (no real brand's name or logo) |
| 2 | jewellers: glass cases of gold and stones |
| 3 | food court: three counters with griddles, fridges and gas; seating |
| 4 | the Grill: white tablecloths, a bar, a piano; its kitchen is on the lower level |
| 5–8 | offices: glass-walled rooms either side of long corridors |
| 9 | the Trump Organization: the corner office, the boardroom for fourteen, reception (`HQ`) |
| 10–14 | condominiums: two apartments a floor (`RESIDENCES`) |
| 15 | penthouse living: fireplace, piano, sofas, dining for ten, kitchen (`PENTHOUSE`) |
| 16 | master bedroom, dressing room, bathroom, study |

**The gold escalators** criss-cross the atrium, one from each public floor to the next
(`ESCALATORS` in `interiors.js`); furniture keeps clear of their feet and heads, and the
atrium rail is open where they arrive. **The ground under the podium is the pit's floor**
(`groundAt` in `plan.js`): what stands on the ground there stands at −4 m, and the lobby
floor stands on the lower level's columns and retaining walls, not on the ground.

The tower is **70 m**: 17 storeys of 4 m, roof at 68 m, rooftop plant room to 72 m, and a
**crown** of glass carried on above the roof, rising to a point at every tooth of the
sawtooth, as in the photograph. It was 100 m, then 70, then 50; the owner then asked for it
"taller and slimmer" again. `TOP_FLOOR` in `plan.js` is the one number; the penthouse is
always its top two, the apartments the floors between `HQ` and it.

**It looks like the photographs** the owner supplied (in `~/Downloads`: `trump.webp`,
`trump 2.webp`, `trump 3.webp` inside, `Screenshot 2026-10-18 101610.png` outside):
dark bronze mirror glass outside (`glass`; glass indoors is `clearglass`); in the lobby a
cream marble floor polished to a mirror (`creammarble`), the core and columns in dark
veined stone (`darkmarble`), brass round the lift doors, the monogrammed brass desk, red
rope, black steel benches, two great flags inside the glass front, revolving doors that
turn (`sim/doors.js`); in the atrium, rough pink marble blocks stepped in and out down
its back wall with lights along their ledges (role `cladding`), brass escalators with glass
sides, black handrails and mirror undersides (`shear` shapes in `render/geometry.js`),
mirror-faced slab edges, a café of white marble tables. No real brand names or logos.
Polished things indoors reflect a warm `RoomEnvironment`, not the sky (`indoor` in
`render/materials.js`) — faked reflections, as the owner chose for the GTX 680.

Floors are finished to their use (marble, tile, oak, carpet), and furniture is
placed through `freePodium` so nothing stands in a column, the core or the atrium.
New furniture lives in `furniture-home.js` and `furniture-food.js`. The public floors
and the penthouse are warm (cream marble, warm plaster, warm-white lamps), with lounge
music and the murmur of the people about you (`audio.ambience`); the offices are grey.

**The office block next door** (`building/neighbour.js`) stands behind the tower across
a 4 m yard: twelve storeys of 3.6 m, a concrete frame and core, a glass curtain wall,
offices — built of pieces like the tower, and part of the same job. Every piece has a
`building` ('tower' | 'neighbour'): storeys, support failures and toppling are counted
per building.

**People** (`sim/people.js`): about a hundred — shoppers, diners, office workers, the
families upstairs — walk between free spots on their floor, a few instanced parts each
(a dozen draw calls in all). They stand on whatever is really under them and fall
when it goes; a blast, a support giving way or a building going over sends everyone in
earshot running; knocked down by a fall they lie still and later are gone. When you break
things near them they stop and stare, some film it on their phones, the close ones back away.

**Guards and police** (`sim/security.js`) are people too (`people.agent`), steered from
outside. Guards stand posts on the public floors, the lower level and the Trump
Organization's floor; each takes one of the difficulty's arms — shout and radio, tackle
(you are put out of the front door and carry on), net (tangled), taser (stunned), gun
(Insane only). They must **see** you: same floor, range, a clear line, less in dust and
smoke, much less crouched or in the hi-vis vest and hard hat from goods receiving (E). A
sledge or extinguisher on one knocks it down dazed (stars, a boing); up again angrier.
Break enough (`HEAVY`) and the police are called; a guard radioing brings them sooner.
They arrive with sirens and lit cars on the avenue, search floor by floor, change floors
only by the stairs (out of sight for a few seconds a floor), and one catching you is a
comic heap, "BUSTED", and the job failed.

**Shops are real places** (`building/shops.js`, fixtures in `furniture-shop.js`), after the
owner's photograph of a café-bakery (`~/Downloads/Screenshot 2026-10-18 122332.png`): "an
actual place, not just some random stuff sitting". A unit is its own walls (each wall a
piece, so what hangs on it is `cladding` fixed to its face), a glazed front with a door, a
fascia with the shop's name and chalkboard menus as decals (`signs`), and inside the layout
of a working shop: customers come in at the front, the counter faces them, staff work
behind it, stock is on the walls, seats are grouped. Types: café-bakery (display counter of
pastries, till, espresso bar on a patterned `tiles` wall, bread shelves, a black steel
frame, pendant bulbs, tables and a banquette), clothes boutique, shoes and bags, jeweller
and watches, souvenirs (neutral: caps, mugs, T-shirts, snow globes). The shop floors (1–2)
are a **mall** (`mall()`): units along both sides, a walkway round the core and atrium, a
flagship across the west end. The lobby café is one. **Street cafés**: the blocks either
side of the tower and across the avenue have a real ground floor at the front (`CAFES` in
`scenery/city.js`, built by `building/street.js`), split into units 8–10 m wide — one
26 m hall of tables looked like nothing real — and are never woken whole (`noWake`). The
shops record where people belong (`places`: staff, queue, browse, seat) and `people.js`
fills them, sitting people with thighs along the seat and shins down.

**Sprinklers, smoke and water** (`sim/water.js`, `sim/smoke.js`): heads every 3.5 m under
every ceiling of the tower (instanced, not pieces; each remembers its slab), fed by red
mains hung under the slabs (pieces, role `pipe`). A head opens over a fire after about a
second (its bulb bursts), sprays, and puts out most fires it reaches; where water falls
the floor is wet — a dark mirror you slide on (`player.wet`). A broken main pours from
both ends and its floor's heads go dry. The alarm sounds (soft: three tones, a pause) and
people leave. Smoke is a grid of two-metre cells per storey, fed by fires: it spreads
under the ceiling and banks down, pours out of broken windows and rises up the stair and
atrium. With your head in it you see a few metres (fog); crouching lowers your eyes under it.

### The lift

`sim/lift.js`: a car in the core's lift shaft, lobby to the top floor. Inside, E goes
up a floor and Q down, and holding either keeps it going. At the brass doors on
any floor, E calls it. The landing doors are pieces tagged `liftdoor`, slid open
with `Pieces.move`, and a brass sill bridges each doorway.

**The car holds up its rider itself, and that was learned twice.** A kinematic
car floor made the character controller report a zero-distance contact and
refuse to walk off it; fixed colliders moved by hand were not always seen, and
the rider fell down the shaft. So the lift puts you on its floor while it moves
and will not let you sink below it while it stands; its colliders are only there
for the walls.

## Architecture

```
src/
  main.js              States (menu, loading, begin, play, paused, done) and the frame loop
  scene.js             Renderer, sky + environment map, sun and shadows, AO, bloom
  physics.js           Rapier: fixed colliders, bodies, rays, collision groups
  world.js             The city (scenery) and the job's pieces
  player.js            Kinematic character controller
  input.js, audio.js   Input with press edges; synthesised Web Audio
  render/              textures (procedural PBR), materials (the material table), geometry
  building/            pieces (the store), support (what holds what), kit, furniture, tower,
                       neighbour (the office block next door)
  damage/              damage (what a blow does), cutter (CSG), csg + csg.worker (breaking
                       in Web Workers), rebar (cages and bars), splinters, glass, paint
  sim/                 structure (support + weight + pancake), topple, rubble, impacts,
                       fire, blast, lift, people, doors, water (sprinklers, mains, wet
                       floors, alarm), smoke, security (guards, police)
  fx/                  particles (and the dust veil), chips, shake, powder
  dev/bench.js         the collapse bench: an automated demolition, timed (see below)
  tools/               tools (sledge, spray, extinguisher, charges), viewmodels
  ui/                  menu, hud (and every overlay screen)
  data/                catalog, progress, difficulty
  scenery/city.js      Street, pavements and blocks — solid (fixed colliders), not breakable
```

### Pieces, and why most of the building is never a mesh

Everything breakable is a **piece** (`building/pieces.js`): parts (geometry and material
kind), a pose, a role (`slab`, `column`, `core`, `glass`, `mullion`, `spandrel`,
`furniture`, `lamp`, `tank`, `fragment`, …), a `building`, and a state: `static`,
`dynamic` (a Rapier body), `falling` (in a pancake), `tipping` (riding a topple),
`flying` (in the air as rubble), `rubble` (come to rest) or `dead`. The job is about
6,600 pieces: 4,700 in the tower, 1,900 next door.

- **Untouched pieces are drawn in a `BatchedMesh` per material**, a couple of dozen draw
  calls for the whole tower. A piece is *promoted* to its own meshes only when something
  happens to it. A collapsing floor stays batched and moves by instance matrix.
- **Each static piece has fixed colliders** on one fixed body, in a collision group that
  names its building (`inBuilding` in `physics.js`). A piece gets a dynamic body only
  when knocked loose, and **at most 50 at once** (`maxBodies`): past that, a piece knocked
  loose falls as rubble instead. Resting debris is **frozen** (`freeze`): it leaves the
  simulation but keeps a collider, so a floor of rubble costs nothing.
- **Rubble goes back into batches** (`rejoin`): a piece that has come to rest is drawn in
  its own batch instance again, or, if it was made or cut since, in a *spare* batch per
  material — a fragment is two, its outside and its broken inside. Six thousand pieces of
  a fallen tower as meshes were thousands of draw calls and 30 ms of CPU a frame.
- **Masses are real kilograms** (`setDensity(kind.density)`). They were tonnes once, so a
  desk weighed half a kilo and a sledge sent it across the room.

### Durability, cracks, and falling things

This is the owner's model of destruction, in their words: a blow takes most of
what it hits and leaves the rest cracked; the more cracked, the weaker; weak
things carry less; big falling things break what they land on; small bits go.

- **Every piece has durability** (`hp`/`hpMax`): blows by material, from `HITS`
  in `render/materials.js`, scaled by the cube root of its size. A column takes
  about five, a plaster wall two, a desk one or two, a steel beam a dozen.
- **The weaker it is, the bigger the bite.** Soft materials lose most of what
  you hit; concrete loses a head-sized lump that falls; metal dents and sparks.
- **Cracks show it** (`damage/cracks.js`): a crack decal at every blow, bigger
  the weaker the piece, drawn only on faces that point at the blow (a decal box
  also catches a column's sides, and cracks seen edge-on float in the air).
- **Cracked supports carry nothing** below a quarter of their durability (`WEAK`
  in `support.js`).
- **Falling things deal blows** (`sim/impacts.js`): energy / 560 J (one swing)
  goes to whatever they land on, which cracks and may break, and what broke
  falls in turn. A 1.6 t lump dropped 6 m broke a slab bay and itself. Rubble
  landing on standing structure goes through `impacts.absorb`: a floor, column
  or wall breaks only when it has taken, all told, **more than its own weight
  falling 3 m** — sledge durability is far too little for a tonne of debris,
  and judged by it the podium fell storey by storey under the tower's rubble.
- **Weight at rest** (`rubble._bear`): each piece of rubble adds half its box's
  mass to the standing slab that carries it, down through the pile and through
  carpets and desks. A slab carrying more than **three times its own weight**
  breaks, and what lay on it lands on the floor below. That is how a tower's
  worth of rubble on an office roof takes the block down floor by floor.
- **Small bits go.** Fragments under 25 kg fade about four seconds after they
  break off, by simulation time (a heap of them jostles for ever and never
  counts as resting); chips fade four seconds after they land.

### How things break

`damage/damage.js` is the only thing that turns a blow into damage:

- **Wood, plaster, fabric**: a CSG hole deeper than it is wide, through anything thin;
  splinters round the rim of wood (`splinters.js`), longer on the exit side; chips and dust.
- **Concrete and stone**: **a real lump comes off and falls** (`cutter.chunkOff`, the piece
  intersected with a jagged blob), leaving the matching scar. It must start slightly proud
  of the face and moving away, or it sits in its own hole held by friction.
- **Glass**: the first blow draws a spider-web crack (`glass.js`); the next shatters it
  into shards along the same web, and some of the edge shards stay in the frame.
- **Metal**: sparks and a ring; nothing comes away.
- **Gas tanks**: a puncture hisses for a second, then goes off (`sim/blast.js`).

### What holds what up, and weight

`building/support.js` links pieces once: *rests on*, *hangs from*, and *tied to* for slab
bays. It then answers which standing pieces have lost their support. The rules:

- **Only structure carries structure.** Concrete, steel and marble; never glass,
  partitions or furniture. **Mark decorative stone `structural: false`**: a marble
  waterfall wall held four storeys of podium up by itself until it was.
- **Non-structural chains are at most three deep.** Without that, glass on spandrel on
  mullion on glass formed a curtain wall that held itself up from the first floor after
  everything behind it had gone.
- **A slab bay stands while anything is still under it.** A small bay (tooth, landing)
  may cantilever off a neighbour with at least two supports of its own.
- **Anything that only touches its supports at the edges rests on nothing.** Lintels and
  the core walls were both caught by this; the core walls now run full storey height and
  the door heads are one band over piers. **Run `unsupported(dev.pieces.list)` right after
  a load: it must return nothing.** For a long time it returned 123 core pieces, which fell
  on the first frame, and nobody noticed.

- **What stands within 0.45 m of the ground stands on it** (`GROUND`): a column's base is
  on its foundation, broken floor slab or not, and a floor laid on the ground cracks but
  never breaks away. Breaking the lobby slab once sent every ground-floor column flying.

**Weight** (`sim/structure.js`): a column or core wall has `hp` and a load: **the storeys
still standing over it**, measured by a ray down its line (`loadOf`), not what stood over
it when it was built — a podium column carries the tower until the tower has gone. It
fails when `hp <= hpMax · share / (share + 14)`, where share grows with the supports
already lost within 7.5 m. When one fails, its neighbours are rechecked a moment later;
an undamaged one gives way on its own when **three** supports beside it have (five for
core walls), within 6.2 m, at any height — a frame has redundancy. That is the chain
reaction, and it stops where the losses thin out. A gas bottle or transformer has a
quarter of a charge's power against concrete.

**Blasts are shielded** (`blast._shielded`): a slab, wall or column between a charge and a
piece takes the blast instead — a charge on a column does not bring down the one on the
storey below, through a floor.

What loses support falls:

- **A few pieces** become rigid bodies. `sim/impacts.js` watches for sudden stops: a
  heavy piece landing faster than 6 m/s smashes (CSG-split fragments), and the slab it hits
  breaks if it absorbs more than its own weight falling 3 m, which drops the next floor.
- **More than 80** comes down as a **pancake**. The whole mass drops at 0.7 g, and each
  floor it meets breaks up with it: its real pieces spill out and land as rubble. It goes
  on **only as long as it has the energy**: falling gains its weight times the drop, and
  every piece of floor it meets takes its own weight falling 3 m to break. A tower's worth
  reaches the street; three storeys of slab dropping onto a podium roof stop there, and
  what is still falling lands as rubble on the floor that held. Without that, a hundred
  pieces of slab ground the whole podium to the ground.

**The rubble is the building** (`sim/rubble.js`). There is no generic rubble: every slab,
column, wall and chair of a collapse keeps its shape, flies on from how it was moving,
and lands on whatever is under it — found by rays down nine columns of its footprint,
dropping it until its own underside touches, and settling into loose rubble until three
columns touch (never into the street). Big pieces landing hard break into chunks where
they land (CSG, in the workers), which land again propped at angles; that is what makes
a pile of voids and not a crust. Each piece remembers what it rests on and falls again
when that goes; a sweep every half second catches anything whose support moved. It rests
only on pieces, the street and the city — never the lift car, and never a collider
removed this frame, which Rapier's queries still find until it steps; new colliders are
invisible to queries until then too, so this frame's landings are tested by hand.
`dev.bench`'s `floaters()` checks physically that nothing lies on air.

Every heavy landing throws a **dust cloud** (`cloud()` in `main.js`), big and dark enough
to hide in.

### Toppling: a tower cut on one side goes over, not down

`sim/topple.js`. When a column or core wall fails, `structure.failed()` asks
`topple.check(floor, building)` first. It tips when the weight above is off what is left:
its centre of mass outside the rectangle round the surviving supports, or **a third of the
storey's strength gone** with the weight more than 3 m off the centre of what is left —
and only if what is above is **tall for its base** (at least 0.8 of the remaining width
along the fall): a podium with a corner crushed does not tip, its broken part comes down
alone. Struck hard in the last 12 s (`blows`), a building tips the way the blow drove it,
away from what hit it, not back onto it. Cut every support on a storey evenly and nothing
is off-centre: it drops straight down as the pancake.

- **One Rapier body, a box per floor of slabs and per storey of core.** The pieces ride on
  it, drawn at body × where they stood. Anything already loose inside it rides too.
- **The hinge is a revolute joint behind the weight.** It is pinned along the fall-side
  edge of what is left — but never in front of the centre of mass: supports in front of
  the weight are what the off-centre load crushes, so the pivot moves back until the
  weight is past it. A hinge in front of the weight stood the tower back up.
- **While hinged it meets only the city** (`G_MASS_HINGED`). Anything in its own footprint
  — the lift car, a stair, the core fallen down its shaft — it passes through. Colliding
  with those, the solver threw it off them at 40 m/s and it seemed to burst in mid-air.
  Whatever of it swings below what is really under it (a height map taken as it starts:
  the podium roof, the yard, the building next door) is **ground off** as rubble. So a
  tower on a wide podium crushes its low side and goes on over, not stopping at 5°.
- **At 26° the hinge goes** and its boxes are rebuilt from what is left. Now it meets its
  own building (it lands on its podium roof and slides off; it may crush only the storey
  it stood on — crushing further, it sank through the podium to the street), the street
  and the city (`massGroups`). **Another building it ploughs into**: what it sweeps through
  there is smashed out of the way (`_smash`), losing it momentum per tonne, and supports
  smashed count as lost. Colliding with the office block, it bounced off it upright.
- **At 5 m/s on the street or the city it breaks**; come to rest — leaning on a
  neighbour, say — it overloads the supports under where it leans and breaks anyway: a
  dozen storeys of rubble that has lost its footing is not a building that can lean.
  Breaking adds nothing: every piece carries on as the mass carried it at that point,
  turning as it turned. Scattered at random, with an explosion's sound, it looked as if
  it had blown up in mid-air.
- **The shock** (`topple.fx.quake`) knocks over furniture, brings down lamps and bursts
  windows in what still stands nearby. The structure stands; its contents do not.
- **Wreckage is not structure.** Stubs, rebar, shards and fragments made after the building
  was linked have no support links (`WRECKAGE` in `building/support.js`); they remember
  what they sit on (`rubble.anchor`) and fall with it.

**The reference demolition** (`REFERENCE` in `dev/bench.js`): the detonator's twelve
charges on storey 6 — the whole north column line, the ends of the next, the core's north
and side walls. Ten do not fell it. It tips north, crushes the storey it stood on, goes
over the podium's north edge and into the office block, which comes down floor by floor
under it. The podium stands, its furniture thrown about.

### Fire

`sim/fire.js`: burning pieces have fuel and heat, char towards black (instance colour on
batched pieces, so nothing is promoted), and **spread only to what they actually touch**.
The first version lit everything within a sphere of a burning 5 m carpet bay, so a desk
fire had a whole floor alight in eight seconds. Tanks in a fire cook off. Furniture burnt
half through gives way; glass by a big fire cracks, then breaks. Fires feed the smoke.
`fire.douse(point, radius, amount)` is how water and powder put fires out; a doused spot
must not regrow heat before it is cleared, or it flickers on for ever.

**The extinguisher** (`tools/tools.js`) holds about fourteen seconds of powder (by
difficulty), its jet weakening as the pressure goes, coughing when nearly empty. A few
rays a frame find where the jet lands — the first thing in its way, never through a wall —
and that is where it douses and leaves white powder (`fx/powder.js`). Spares hang by the
lifts on every third floor (role `cladding`, fixed to the core wall) and stand in the
kitchens, plant room, vault, a pantry and the penthouse kitchen; E takes one.

### Reinforced concrete

A column that fails (`damage.fail`) leaves a stub at its foot and, if the slab it carried
is still there, another hanging under it (`fx.hang` → `rubble._rest` on the slab). Between
them it goes one of two ways: it **bursts** — the concrete falls out in lumps and the bars
are left bowed outward between the stubs, a birdcage — or it **shears** along a rough
diagonal (the CSG `split`, so the break shows aggregate) and the top slides off down the
slope. Walls show their bars. A blow on concrete knocks out a shallow jagged **cone**, the
shape a spall has. Before a warned column goes, its crack climbs the face with grit and
sharp reports (`audio.snap`); a slab with nothing under it tilts on its bars along the edge
still tied to a neighbour, then swings off them. **Destroy the column before putting its
stub and bars in its place**: spawned first, they anchored on the column about to go and
flew off with it.

## Keeping it smooth — without losing the collapse

**The game is for the satisfaction of watching a structure fall and a chain
reaction travel.** Performance work must cut the small stuff and never the big
collapse. A cap once turned breaking slabs into dust when the simulation was
busy, and the owner stopped it at once. So now: big pieces always break into a
few big chunks; the smallest loose bits are faded early to make room; breakage
from falls and chain reactions is queued at 4 ms a frame; small fragments of
fragments crumble. And the chain has a rhythm (`WARN`/`SAG` in
`sim/structure.js`): a failing column cracks, groans and sheds grit before it
goes, a slab with nothing under it hangs and sifts dust before it drops.

Measured: a bay whose four columns were broken sagged, dropped, and broke on
the floor below with the worst frame at 19 ms. Before the queue and the caps,
the same kind of event put three thousand bodies into the simulation and took
45 s to compute four seconds of.

Two things that made it feel "like the moon": frame time was clamped to 50 ms
and physics to three steps, so below 20 fps everything ran in slow motion. The
clamp is 100 ms and six steps now. The sky is baked into a cube map once; its
scattering shader used to run on every sky pixel every frame.

Measured on the tower, a frame went from 25–32 ms to 5–8 ms by fixing three
things, in this order of size:

- **BatchedMesh's per-instance culling and sorting** ran on the CPU over every
  one of ten thousand instances on every render pass, shadows included: 9 ms of
  a 10.8 ms frame. Both are off (`perObjectFrustumCulled`, `sortObjects`).
- **Ambient occlusion** was 10–20 ms on its own. It is only on at Ultra.
- **Lights are paid for on every lit pixel, lit or not.** The fire had six point
  lights sitting at intensity 0 for the whole game; it has two.

`render/quality.js` has four levels (resolution, bloom, AO, shadow size); the
menu's Graphics button picks one or Auto, which drops a level when frames run
over 22 ms and climbs back when they run under 13 ms.

What a collapse costs, and what was done about each, in order of size:

- **Rigid bodies**: six hundred at once took 150 ms a frame. At most 50 now; the rest
  fall as rubble, two solver iterations, no CCD on debris, Rapier's SIMD build.
- **CSG**: breaking a column was 26 ms on the main thread. It runs in Web Workers now
  (`damage/csg.js`); lumps take the piece's place a frame or two later.
- **Draw calls**: rubble goes back into batches (above); small debris casts no shadow.
- **Shader compiles**: the first blast compiled a dozen programs in one 125 ms frame.
  `render/warmup.js` draws one of everything, every way, on the loading screen.
- **Pieces in the air** are spheres until close to landing; landings are paced at a few
  ms a frame; pieces waiting to land do not look again.
- **The dust is an occluder** (`fx/particles.js`, the veil): a coarse grid of dust
  density; a piece hidden in the cloud is not redrawn, and the fog closes in with the
  dust in the air, so the city beyond a collapse fades out. Concrete landing throws up
  dust.

**The collapse bench** (`dev/bench.js`): `await dev.bench({ quality: 1, profile: true })`
loads the job, puts the reference charges on, holds the camera over the avenue where it
sees both buildings, fires, and times every frame until everything has stopped. It
reports half-second frame rates, the worst frame, each system's CPU per frame, what became
of every piece, the pile, and `floaters` — and passes only on screen, at 30 fps or more
throughout, with nothing hanging. **Run it in a tab that is on screen**: a hidden tab has no
`requestAnimationFrame`, and there the bench times frames by CPU and GPU (timer queries) —
Chrome runs hidden pages at low priority, 3–10× slower, so that is only a sketch.
`trial(dev, charges)` runs a demolition without drawing, for choosing charges. Neither
survives a file edit: Vite reloads the page.

## Things already learned here

- **Rapier's `World.step` wrapper walks every collider twice after each step** (a call out
  of WebAssembly per handle to map new ones, a call in per collider to forget removed
  ones). With a collapse's twenty-five thousand colliders that was the whole cost of a
  step, 7 ms. `physics.js` steps the pipeline directly; colliders made and removed through
  the World keep its maps right themselves. A step with the job loaded: 3.8 ms → 0.06 ms.
- **An idle world is not stepped** (`physics.step`): nothing dynamic awake, no collider
  added or removed (`physics.dirty`) — no step. Slow frames take 1/30 s steps, three at
  most, not six of 1/60. Resting debris freezes after creeping four seconds, any role.
- **Fixed colliders have no body.** All on one fixed body, adding any marked it changed.
- **A material object must never be shared by a BatchedMesh and a Mesh**, nor by batches
  with and without instance colours, nor drawn into the shadow map by both: three switches
  shader programs between them object by object (6% of a collapse). Meshes get a twin
  (`pieces._solo`), every batch gets colours (`_initColorsTexture`), batched and instanced
  casters have their own depth materials (`BATCH_DEPTH`, `INSTANCE_DEPTH`).
- **The sun's shadow map is cached**: drawn when its box moves, every other frame while
  things fall, every sixth otherwise (`shadowsDue` in `main.js`). It was a third of the
  GPU's frame. Never toggle `castShadow` to test it: that recompiles every material.
- **Ray filters are calls out of WebAssembly per candidate collider.** Rubble's rays take
  none: the first hit, its own collider left out by Rapier, a second look under anything
  that is not to rest on. A piece in the air looks down when it could next reach the
  ground, not every frame.
- **The support grid is three-dimensional** (`link`): in two, a forty-storey block's cells
  held all forty storeys — 785 ms to link the job, now 69.
- **A city block wakes only when the falling mass reaches it** (`topple._wakeAhead`), not
  when the tower starts to tip: waking five at once was a 1.2 s frame, most never touched.
- **Rigid-body debris landing on structure goes through `impacts.absorb`** like rubble,
  and the shock a slab has taken fades (half-life about 1.4 s). Judged by sledge blows,
  every lump that bounced off the podium roof broke a bay of it.
- **A CSG split was 30–60 ms on a 40-triangle lump**: two evaluations, each against a
  rough face 12 × 12 subdivisions fine. It is one evaluation now (`[INTERSECTION,
  SUBTRACTION]` in one pass), and pieces past their first generation get a 5 × 5 face.
  Nobody can count facets on a piece that size, and this was what made a falling tower
  stutter.

- **Clear a geometry's groups before it becomes a piece.** Box, cylinder and
  extrude geometries carry one group per face, each naming a material slot.
  A cut kept them and handed CSG a one-material list, so five faces of every
  box rendered with no material: things went invisible the moment they were
  hit. `Pieces.add` clears them; only a cut adds groups, with a material each.
- **The extinguisher is also a fan.** `particles.blow` pushes and thins every
  dust and smoke particle in its cone (foam and paint are exempt), which is the
  way to see through a collapse cloud.

- **`Color.set()` already converts sRGB to linear.** Converting again turned everything black.
- **Toggling a light's visibility recompiles every material.** Fire lights stay in the
  scene and switch off by intensity.
- **One huge ground collider loses precision.** The player sank 3 cm into a 2 km box
  and stuck fast; the ground is now a grid of 40 m tiles. (Rapier JS has no half-space here.)
- **The character controller measures from the collider's position**, which only moves
  when physics steps, and it does not step every frame. Set the collider's translation
  yourself before `computeColliderMovement`, or on frames with no step the same move is
  applied twice.
- **`RoundedBoxGeometry` and `mergeVertices` are slow.** They made loading take 35 s.
  Rounded boxes are cached by size (already indexed); blobs are built on indexed spheres.
- **Particles are not lit.** Their colour is what they look like; a dust colour that looks
  right outside glows white in an office.
- **`node -e` with template literals in Git Bash eats the backticks.** Put edits in a
  script file with a quoted heredoc.

## Controls

| Key | Action |
|-----|--------|
| Mouse | Look |
| W A S D / arrows | Move · Shift run · Ctrl/C crouch-walk · Space jump |
| 1–5 / wheel | Tools |
| Left click | Swing / spray / foam / place a charge |
| Right click | Spray colour / detonate the charges |
| Esc | Pause (resume, restart, quit to jobs) |
