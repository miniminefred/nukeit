# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NukeIt

Browser-based 3D game built with **Three.js**, bundled by **Vite**. It is a new game.
Nothing in it comes from the sibling projects, and nothing should be copied in from them.

Right now the game is a starting point: a sky, flat ground, a few blocks, and a
first-person body that can walk, run and jump. The design has not been decided yet.

Keep the code in small ES modules under `src/`. When a module gets large or starts
mixing concerns, split it.

## The one hard rule: AI-only development

Claude writes all of the code. There is **no visual/scene editor**: no Unity, no Godot
editor, no Blender in the loop. Build tools, bundlers, package managers and CLIs are fine.
Everything lives in code, so an AI can write it and reason about all of it.

## Launching a session

The desktop shortcut **Create NukeIt** runs `..\launch-nukeit.ps1`, a thin wrapper over
`C:\Users\alfred\projects\launch-claude.ps1 -Game nukeit`. It opens a Windows Terminal tab
running PowerShell 7 with UTF-8 set, `cd`s here, runs `npm install` if `node_modules` is
missing, then starts `claude`. The launchers are in the parent directory, outside this repo.

## Rules for every session

### 1. Commit every change immediately
After **every** file edit, stage and commit before moving on:

```bash
git add -A
git commit -m "<short description of what changed>"
```

One logical change per commit. Never leave changes uncommitted at the end of a session.

**Every commit is authored as `miniminefred <315911906+miniminefred@users.noreply.github.com>`
and nothing else.** That identity is set globally in `~/.gitconfig` and again in this repo's
local config. Never commit as a work or personal email address, and never add a
`Co-Authored-By: Claude ...` trailer or a "Generated with Claude Code" line. The repo is
public. See `~/.claude/CLAUDE.md`.

### 2. Start the dev server on session start
Check whether it is already running, and start it if not:

```powershell
npm run dev
```

Vite serves at **http://localhost:8093** and opens the browser. The other games on this
machine use 8080 (blobgame), 8090 (fpsgame), 8091 (medieval) and 8092 (destroy).

### 3. Test after every change
Check the change in the browser before calling it done. `npm run build` must also stay
green. It resolves every import, which catches mistakes HMR hides. It does not type-check.

In the dev build, `window.dev` exposes `{ renderer, scene, camera, lights, world, input, player }`
for poking at the running game from the console. The loop runs on `requestAnimationFrame`,
so a backgrounded tab does not tick.

## Publishing: GitHub Pages

Public at **github.com/miniminefred/nukeit**, live at **https://miniminefred.github.io/nukeit/**.
`.github/workflows/deploy.yml` builds and publishes on every push to `master`, and can also
be run by hand.

- The Pages base path is passed on the command line (`npm run build -- --base=/nukeit/`),
  not set in `vite.config.js`, so dev and preview keep serving from `/`.
- Any asset URL built from a string at runtime has to add the base itself:
  `import.meta.env.BASE_URL + '…'`. Vite only rewrites URLs it can see in static imports,
  `href`s and `url()`s. Relative paths are easier.
- The `github-pages` environment has a deployment-branch allowlist. It was created
  allowing only `main`, and the first deploy from `master` was rejected until `master`
  was added (Settings → Environments → github-pages). Rename the branch and it needs
  doing again.
- In **Git Bash**, MSYS rewrites `--base=/nukeit/` into a Windows path. Set
  `MSYS_NO_PATHCONV=1`, or build from PowerShell.

## Project layout

```
index.html        Entry page: click-to-play overlay, crosshair
vite.config.js    Dev and preview server pinned to port 8093
src/
  main.js         Bootstrap and the frame loop
  scene.js        Renderer, scene, camera, lights, resize
  world.js        Ground and placeholder blocks
  input.js        Keyboard state, pointer lock, mouse deltas
  player.js       First-person look and movement
  style.css       UI styling
```

## Controls

| Key | Action |
|-----|--------|
| Mouse | Look (while the pointer is locked) |
| W A S D / arrows | Move |
| Shift | Run |
| Space | Jump |
| Click | Lock the pointer |
| Esc | Release the pointer |
