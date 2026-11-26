# Steel Tide

A 3D modern naval warfare game for PC browsers (keyboard and mouse), served at https://hunteracedev.com/steel-tide/.
The home page entry lives in the site repo (`aceoutlander.github.io`, `index.html` plus `assets/steel-tide-cover-*`).

## How it is built

- No build step. `index.html` loads `js/main.js` as an ES module; an import map points `three` at the copy vendored in
  `vendor/three/` (r180, with the few add-ons the game uses). Nothing is loaded from a CDN.
- Everything is generated in code: models (`js/units/`), textures and materials (`js/gfx/materials.js`), sound
  (`js/audio/audio.js`). There are no model, texture or audio files. The only image is the share picture in `assets/`.
- Module map: `js/core` (config, input, save, maths), `js/gfx` (renderer + quality presets, materials, ocean, effects),
  `js/units` (one model module per unit class + the shared builders), `js/sim` (ship/sub, jet, heli, soldier, weapons, rearming in `rearm.js`,
  AI, crew, player controls and cameras), `js/world` (islands, detection, battle flow), `js/ui` (HUD, menus).
- The Super Destroyer (`js/units/v2/superdestroyer.js`) is the one unit with rooms inside: `js/units/v2/sdinterior.js`
  builds them and adds their floors and walls to the ship's `decks` and `blocks` lists (marked `in: 1`). It is also the
  one unit that has to be unlocked (`unlock` in `js/core/config.js`, owned as `unit.superdestroyer` in the save).
- All paths are relative, so the game works from `/steel-tide/` on the live domain and from any local folder.
- Phones and tablets get a "made for PC" screen from an inline script in `index.html`; the engine is never loaded there.
- Saves: one localStorage key, `steelTide.save.v1` (settings, last nation and unit, lifetime stats). Bump the key's version
  if the shape changes, and never rename the repo: the address is part of where saves live.

## Rules

- Never call the computer-controlled forces NPCs, bots or AI anywhere a player can see. They are sailors, crew, pilots,
  marines, or a unit name and nation.
- Fictional nations only (Aethia, Extro). No real flags, insignia or military designations as unit names.
- Nothing personal in the repo: no local paths, no personal email addresses. Commits use the owner's GitHub no-reply address.
- No service worker.

## Previewing locally

Serve the repo folder with any static file server and open `index.html` (ES modules need http, not file://).
Useful URL switches: `?auto=<unit>&nation=<aethia|extro>` starts straight in a battle (units: patrol, corvette,
battlecruiser, carrier, superdestroyer (only once it is unlocked), reconsub, attacksub, fighter, bomber, recon,
transport, attackheli, marine; add `&dock=1` to start a submarine in the battlecruiser dock), and `?nolock=1` plays without pointer lock for automated checks.
`window.__steelTide.app.advance(seconds)` runs the simulation forward synchronously.

## Push to live

1. Preview locally: title screen, a battle in at least one ship, one aircraft and the marine, Fast Graphics on and off,
   no console errors, and the "made for PC" screen at a phone size.
2. Commit on `main`.
3. `git push origin main`.
   Sound: test pages must be silent (`?devtest=1` mutes the game). To check a sound, measure it with
   `await __steelTide.dev.listen(() => __steelTide.audio.gun('heavy', { pos, own: true }), 6)` instead of playing it.
4. The push starts the `Deploy to GitHub Pages` workflow (`.github/workflows/pages.yml`), which publishes exactly
   that commit. Wait for it: `gh run list -R AceOutlander/steel-tide -L 1` until it says `completed success`.
   (Pages is set to deploy from GitHub Actions, not from a branch: the branch build skipped or mis-built pushes.)
   If no run appears for the commit, start one by hand: `gh workflow run pages.yml -R AceOutlander/steel-tide`.
5. Load https://hunteracedev.com/steel-tide/ (add `?v=<something>` to skip caches) and check it starts.

## People (since Beta 0.5.0)

Every figure is built by `js/units/v2/human.js` on the MakeHuman base in `assets/people/` (`js/units/v2/people.js` loads
it at start-up, before anything is built). The files are made by `tools/people/build.py`, run in Blender 5.1 with the
MPFB extension installed:

    blender -b --python tools/people/build.py -- assets/people <folder of MakeHuman skins> [folder for preview pictures]

`tools/people/fit.py` holds the game's skeleton (keep it the same as `SK` in human.js) and moves the MakeHuman body
onto it: arms and legs straight down, joints on the skeleton's joints. Cloth (shirt, trousers) is exported as the bare
body surface; human.js pushes it out and creases it per uniform (`clothShape`, `U.fit`). Helmets, vests, boots and
accessories are still built in code; gear written for the old head goes through `headFix`. To look at a figure:
`dev.person({ role, nation, skin, helmet, uniform, acc, state })` and `dev.lineup([...])` save pictures through the
local test server. Only CC0 sources (see CREDITS.md).

## Interiors (since Beta 0.6.0)

Every ship model may carry `model.interior = { group, mats, zones, hole }`: the group is drawn only while the camera
is at the ship (`Ship.updateLod`), `zones` say when a person or camera is inside, `hole` is where the sea is not drawn.
The Super Destroyer builds its own (`js/units/v2/sdinterior.js`, which also holds the shared interior materials and
their steel and deck textures). Every other ship gets compartments from `js/units/v2/cabins.js`, called by
`finishShip()`: it finds the biggest deckhouse block on the main deck, puts a door on the side with more deck, lays
out a passage and rooms from the block's size, and carves the walk-in space out of that block. A builder can opt out
with `S.cabins = false`. To look: `dev.cabins(type, nation)` saves six views to `C:\dev\steel-tide-covers\interiors\`.
