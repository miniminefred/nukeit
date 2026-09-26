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
- `dev.step(dt, n)` runs whole frames by hand. **The test tab is always hidden**, so
  `requestAnimationFrame` never fires. Pretend the pointer is locked with
  `dev.input.mouse.locked = true; dev.state = 'play'`, and hold a tool down with
  `dev.input.mouse.left = true`.
- `dev.select(i)` changes tool; `dev.measure()` gives the standing height.

Two traps in testing from a hidden tab:

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
- **The job is a height**: bring the building below 10 m. Height is the top of every
  *static* piece that is not debris. The job ends 3.5 s after the target is met with
  nothing still collapsing.
- **You can die**: falls, blasts, fire, being under a collapse. You come back at the door
  and the building stays as broken as you left it.

## The building is a place

Not a stack of offices — the owner asked for restaurants, shops and Trump's
house on top. `building/plan.js` holds the plan and `PROGRAMME`;
`building/interiors.js` furnishes each floor from it:

| floor | what it is |
|---|---|
| 0 | lobby: reception, waterfall, escalator, café bar, plant room with transformers and gas |
| 1 | fashion boutiques, changing rooms |
| 2 | jewellers: glass cases of gold and stones |
| 3 | food court: three counters with griddles, fridges and gas; seating |
| 4 | the Grill: white tablecloths, a bar, a walled kitchen with gas, a piano |
| 5 | café and bookshop |
| 6–13 | offices |
| 14 | penthouse living: fireplace, piano, sofas, dining for ten, kitchen |
| 15 | three bedrooms, each with a bathroom |
| 16 | master bedroom, dressing room, bathroom, study |

The tower is **70 m**: 17 storeys of 4 m, roof at 68 m, rooftop plant room to 72 m.
`TOP_FLOOR` in `plan.js` is the one number; the penthouse is always its top three.

Floors are finished to their use (marble, tile, oak, carpet), and furniture is
placed through `freePodium` so nothing stands in a column, the core or the atrium.
New furniture lives in `furniture-home.js` and `furniture-food.js`.

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
  building/            pieces (the store), support (what holds what), kit, furniture, tower
  damage/              damage (what a blow does), cutter (CSG), splinters, glass, paint
  sim/                 structure (support + weight + pancake), impacts, fire, blast
  fx/                  particles, chips, heap (rubble heightfield), shake
  tools/               tools (sledge, spray, extinguisher, charges), viewmodels
  ui/                  menu, hud (and every overlay screen)
  data/                catalog, progress
  scenery/city.js      Street, pavements and blocks — not breakable
```

### Pieces, and why most of the building is never a mesh

Everything breakable is a **piece** (`building/pieces.js`): parts (geometry and material
kind), a pose, a role (`slab`, `column`, `core`, `glass`, `mullion`, `spandrel`,
`furniture`, `lamp`, `tank`, `fragment`, …) and a state: `static`, `dynamic`, `falling`,
`rubble` or `dead`. The tower is about 10,000 pieces.

- **Untouched pieces are drawn in a `BatchedMesh` per material**, a couple of dozen draw
  calls for the whole tower. A piece is *promoted* to its own meshes only when something
  happens to it. A collapsing floor stays batched and moves by instance matrix.
- **Each static piece has fixed colliders** on one fixed body. A piece gets a dynamic body
  only when knocked loose. Resting debris is **frozen** (`freeze`): it leaves the
  simulation but keeps a collider, so a floor of rubble costs nothing.
- **Masses are real kilograms** (`setDensity(kind.density)`). They were tonnes once, so a
  desk weighed half a kilo and a sledge sent it across the room.

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

**Weight** (`sim/structure.js`): a column or core wall has `hp` and `load` (the storeys
above it), and fails when `hp <= hpMax · share / (share + 14)`, where share grows with the
supports already lost within 7.5 m. So a floor-1 column goes on the fourth blow and a
floor-20 one on the eighth. When one fails, its neighbours are rechecked a moment later;
an undamaged one carrying 8+ storeys with 3 lost neighbours (6 for core) gives way on its
own. That is the chain reaction, and it stops where the losses thin out.

What loses support falls:

- **A few pieces** become rigid bodies. `sim/impacts.js` watches for sudden stops: a
  heavy piece landing faster than 6 m/s smashes (CSG-split fragments), and the slab it hits
  breaks if it absorbs more than its own weight falling 3 m, which drops the next floor.
- **More than 150** comes down as a **pancake**. The whole mass drops at 0.7 g, and each
  floor it meets is ground up with it: into the rubble heap (`fx/heap.js`, a heightfield
  with lumps on it, walkable), dust and a few thrown chunks.

Every heavy landing throws a **dust cloud** (`cloud()` in `main.js`), big and dark enough
to hide in.

### Fire

`sim/fire.js`: burning pieces have fuel and heat, char towards black (instance colour on
batched pieces, so nothing is promoted), and **spread only to what they actually touch**.
The first version lit everything within a sphere of a burning 5 m carpet bay, so a desk
fire had a whole floor alight in eight seconds. Tanks in a fire cook off. The extinguisher
tests each burning piece's nearest point along the spray cone.

## Things already learned here

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
