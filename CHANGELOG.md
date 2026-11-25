# Steel Tide: changelog and decisions

## Beta 0.1.6 (plane controls)

- Planes fly on the keys: W nose down, S nose up, A / D a coordinated banked turn (the wings hold a bank angle, the
  nose is pulled round automatically, a touch of rudder goes in, and letting go levels the wings), Q / E gentle rudder,
  Shift throttle up, Ctrl throttle down. On the fighter, holding Shift past 100% lights the afterburner. Arrow keys
  also work for pitch and turn. The mouse only looks around and eases back to straight ahead after 2.5 seconds.
- New setting: "Invert aircraft pitch (W = nose up)", off by default.
- Each plane answers differently. From level flight at cruise speed, holding D for 8 seconds: fighter 81 degrees of
  turn at 75 degrees of bank and 4 g; recon plane 52 degrees at 62; bomber 32 degrees at 50. Holding D and S together
  the fighter comes round 150 degrees in 5 seconds at 9 g. Hands off, a plane holds its heading and height. The recon
  plane was retuned to sit between the other two (5.5 g, was 3.5).
- Stall, g limits and speed-dependent response are the flight model's own and are unchanged.
- HUD: the cross marker is where the nose and guns point; a new green winged circle is where the plane is actually
  going. Hints, How to Play and the key list in Settings show the new keys; the catapult prompt says Shift.
- Carrier work: the catapult fires at full throttle (hold Shift) and gives a little back-stick for the first second.
  A scripted approach flown only with these keys trapped the recon plane and the bomber; the same crude script
  overflew the deck in the fighter, so the fighter's landing is not proven by test.
- Ctrl+W closes a browser tab and a page cannot stop that, so the game now asks before leaving during a battle.
- Computer-flown planes are unchanged. There is no "F to exit" for planes in this game, so nothing was kept for it.

## Beta 0.1.5 (targeting feedback, aiming help, survivability)

- Reticle: red over an enemy, green over one of your own, white over nothing. The catch area is generous (about 2.4
  degrees past the target's edge), so a corvette on the horizon registers. Over an enemy it shows name, type, range
  and a health bar. Over one of your own it shows "HOLD FIRE" and the trigger is locked.
- Hit feedback: a white X and a tick on every hit, a bigger red X and a heavier sound on a heavy hit or a kill, and
  "+damage" or "TARGET DESTROYED" under the reticle.
- Shell fall: each of your salvoes is called where it lands, against the target it was fired at: "SHORT 250 m",
  "OVER 230 m", "LEFT", "RIGHT", "CLOSE" or "HIT".
- Aim assistance (Settings, saved): FULL (default) the guns set range and lead on the target under the reticle, and a
  yellow marker shows the aim-off point with "Impact in 6.2 s"; the same marker serves aircraft cannon, the chin gun,
  deck guns and the rifle. PARTIAL sets the range only (the aim point is on your sight line at the target's range, so
  lead is yours). OFF aims wherever the sight line meets the sea.
- The 380 mm guns scatter a little less (0.005 rad, was 0.0065). In the test a battlecruiser sank a corvette crossing
  at 4.6 km in 17 seconds with full assistance.
- Under fire: red arcs round the reticle point at whoever is hitting you, with a warning naming them. Incoming
  torpedoes (inside 1.7 km) give bearing and distance, an amber arc and the warning sound; incoming missiles get an
  amber arc too.
- Spawn protection is 5 seconds (was 3), shown as "PROTECTED".
- Difficulty (Settings, saved): Easy, Normal (default), Hard. It changes the other side's gun scatter (x2.1, x1.7, x1),
  the time a crew takes to open fire on a new target (2.6 s, 1.3 s, 0.5 s), missile lock time, how many missiles they
  keep in the air at you, and the damage you take (70%, 90%, 115%). Before this every crew shot like Hard with no
  reaction time. Measured on a corvette sitting still 3 km from the enemy for a minute: 466 damage on Easy, 1448 on
  Normal (before the last softening of Normal), sunk on Hard.
- Balance left alone on purpose: a corvette's 76 mm shells do 12% damage to a battlecruiser's armour (about a thousand
  hits to sink one), while four 380 mm hits sink a corvette.
- Radar and map: green = yours, red = theirs, white = you.
- Not done: the colour-blind option and the earlier "radar fix" this request refers to were never received. Full
  battles on each difficulty were not played by hand; the numbers above are from scripted runs.

## Beta 0.1.4 (detection: submarines stay hidden)

One routine (`world.detects` in `js/world/world.js`) now decides every contact. The radar and map, target boxes and
labels, the aim point, missile and gun lock, and the crews and pilots choosing targets all read the one result
(`unit.seen`), so none of them can know about a unit its side has not detected.

- What was wrong: a sub at periscope depth counted as "not submerged" below 6 m and was picked up by ordinary radar at
  40% strength, and a sub that pinged was shown to every enemy on the map, sonar or not.
- Surfaced (0 to 3 m): seen like a small ship.
- Periscope depth (3 to 18 m): by eye inside 1.5 km; by radar only while the mast is up and only at short range
  (12% of the radar's range, 2.5 km at most); otherwise by sonar only.
- Deep: sonar only. Aircraft, the recon plane, patrol boats and marines cannot find it.
- Sonar is carried by submarines, corvettes and battlecruisers. A sub at full speed is heard about four times as far
  as one creeping; below 60 m it is 30% quieter.
- Active ping: finds subs out to 1.5 times sonar range, and gives the pinging boat away to every enemy sonar within
  9 km (not to units without sonar).
- Lost contacts leave a fading "?" on the radar and map for 13 seconds.
- Cloaked bomber: radar range a tenth of normal, still seen by eye up close (about 1 km). The stealth fighter's
  smaller signature shortens radar range the same way.
- Contacts are shared within a side, and exist only while one of its units really detects the target.
- Checked with the detection table in `?devtest`: an enemy sub surfaced, at periscope depth with the mast down and up,
  and deep, slow and fast, watched from a helicopter, a fighter, the recon plane, a corvette, a patrol boat, a sub
  listening, a sub pinging and a marine; and the reported case (Attack Helicopter, sub 3.3 km away) now shows no box,
  no label and no aim lock at periscope depth or deep.

## Beta 0.1.3 (steady, sharp flying)

- The cause of the shake and the smeared look: the simulation runs in fixed 1/60 s steps, and a drawn frame could
  contain no step or two. At 190 m/s that moved the aircraft 0 or 6.6 m in a frame while the chase camera eased toward
  it by frame time, so the two fought. Measured before: the camera's travel per frame was wrong by 2 m on average and
  3.2 m at worst. Measured now (0.1.2 smoothing plus a chase camera that keeps a smoothed offset from the aircraft
  instead of chasing a world position): within 4 mm, at 60 Hz and 144 Hz, with uneven frame times, on every preset,
  for all five aircraft, in chase and cockpit views.
- No floating origin was added, on purpose: the map is 18 km across, three.js works out each object's position
  relative to the camera in double precision, and the same test at the map edge (8.9 km out, 3 km up and at 40 m)
  gives the same 4 mm. There is nothing for one to fix at this size.
- Camera shake now exists only for real events: taking a hit, an explosion close by, the player's own heavy guns,
  and buffet above 6.5 g. Nothing shakes while cruising, at any speed. New setting: Camera shake, 0 to 100%, default 50%.
- There never was a motion blur pass; the blur was the judder above. New setting: Motion blur, off by default (it
  blends each frame into the next, on High and Ultra only).
- Speed no longer widens the view as much (5 degrees at most, was 8).
- Shadows: the shadow box now moves in whole shadow-map pixels, so shadow edges do not crawl as the camera moves.
- Frame pacing: removed the objects created every frame (wake list, aim lead vectors) and the HUD no longer rewrites
  its status panel unless a number changed. Simulation takes about 0.3 ms a step and submitting a frame about 0.6 ms
  on the test machine; graphics-card time could not be measured in the hidden test browser.
- Resolution is never lowered automatically while flying. The only automatic change is the existing one-time switch
  to Fast Graphics when the first seconds of a battle run under 27 fps.
- `?devtest` now runs with the sound off.

## Beta 0.1.2 (cameras)

No camera sits inside a model any more.

- What was wrong: every ship's bridge view was inside the solid bridge block (a wall of black glass), every cockpit
  view was inside the aircraft's own canopy and armour (the dark rectangle in the Attack Helicopter), an orbit camera
  could end up inside a long ship's stern or dock arms, and a chase camera could sit inside a neighbouring aircraft on
  a crowded flight deck.
- Bridge view: the viewpoint is found once per ship by looking forward from the bridge through the real meshes and
  stopping just outside the front wall, at window height. Looking aft from there shows the outside of the bridge.
- Cockpit view (jets and helicopters): the outside model is hidden and a simple cockpit frame is drawn instead, with a
  near plane of 0.1 m.
- Orbit camera (ships, subs): pushed out until it is clear of the box that holds the whole ship, masts and dock arms
  included; it rises over island ground and over other ships. A submerged sub's camera stays cleanly below the
  surface, a surfaced one stays above it.
- Chase cameras (aircraft, marine, helicopter passengers): pulled in at once, and eased back out, when a ship's hull,
  deck, superstructure or turret, or island ground, is in the way. On a busy flight deck the camera rises to look
  down over the neighbours. A marine's third-person camera squeezed against a wall switches to their eyes.
- Gunner view: higher and further back for the big turrets, and pulled forward if the superstructure is behind it.
- Marines keep a body's width (0.35 m) away from walls. A swimmer's eyes stay above the water.
- Drawing is now smoothed between physics steps: each unit is drawn part-way between its last two simulated
  positions, and the camera reads the same smoothed position, so the two never disagree.
- Changing camera mode or unit dips to black for a fifth of a second instead of cutting through geometry.
- Insignia decals are single-sided, so they cannot be seen from inside a hull.
- The showroom camera stands far enough back that the whole unit fits between the two panels.
- New aircraft spawn on a free catapult or helipad (or in the hover if both pads are taken) instead of on top of one
  already there.
- HUD crew numbers are the real crew for every unit (the Attack Helicopter showed 0); the transport also shows troops.
- Checked with `?devtest`: every unit, both nations, every camera mode, with rays cast from the camera against the real
  meshes to prove it is not inside one and nothing is closer than the near plane; plus the dock, periscope, deep dive,
  catapult launch, hard turns, low flight, boarding and flying a helicopter, manning a gun, walking into a wall,
  swimming, and the death views. There are no below-deck spaces, doors or ladders in the game, so those were not tested.

## Beta 0.1.1 (water)

The sea no longer shows white blotches or a repeating pattern.

- Cause of the blotches: the sun's disc, a few pixels wide in the small sky image the water reflects, came back as hard
  white patches; and the ripple and foam textures were 8-bit images tiled across the whole sea.
- The water now uses no textures at all. Ripples, glitter and foam are worked out from world position in the shader, so
  nothing can repeat. Every layer fades out before it gets smaller than a pixel, and what is faded is added to the
  surface roughness instead, so the far sea is smooth and the sun's path is soft, with no shimmer.
- Foam appears only on the steepest wave crests (with a short fading trail), along hulls, in wakes, on beaches, and
  where shells, bombs and aircraft hit the water. In open water it covers a few percent of the surface.
- Colour: dark blue-green looking straight down, sky reflection growing toward the horizon, a green glow through thin
  crests seen against the sun, and a sun glitter path drawn by the shader (the reflected sky has no sun disc).
- The swell is now eight waves loosely lined up with the wind instead of five crossing at wide angles. The hulls use the
  same eight, so ships still ride exactly on the waves drawn. In the shading only, the shorter waves are bent and made
  uneven so they never form straight rows seen from high up.
- Three water levels: Fast Graphics (three ripple layers, simple sky reflection), Low (four), Medium and up (five, plus
  foam trails). All of them have no tiling.
- Other textures: anisotropic filtering is now 16x on Medium and up, 8x on Low, 4x in Fast Graphics.
- Fixed: in Fast Graphics the water mesh ended 3.5 km out, which showed as a hard edge from the air.
- `?devtest` in the address loads `js/debug.js` (developer checks: several camera views in one picture). Nothing in it
  is reachable without that flag.

## Beta 0.1.0 (first release)

A complete single-player battle: two fictional fleets (Aethia and Extro), twelve playable unit types per side, a living
battle around the player, menus, saving, and a Fast Graphics mode.

### Decisions made while building

Where the brief left a choice open, this is what was chosen and why.

**Site and repo**
- The game lives in its own repo (`steel-tide`), served by GitHub Pages at `/steel-tide/`, because that is how the
  site's other games are set up (one repo per game). No build step: plain ES modules with an import map.
- Three.js r180 (minified build) and only the add-ons the game uses are vendored in `vendor/three/`.
- Only the Library entry was added to the home page. Nothing else on it was changed.

**Controls**
- Jets use mouse-aim: the mouse points where you want to go and the aircraft flies itself there, within its g limit and
  stall speed. Arrow keys fly pitch and roll directly. Raw mouse-as-joystick was too hard to fly with a locked pointer.
- Helicopters use the mouse as a cyclic stick (shown as a dot in a ring on the HUD); Space levels the aircraft.
- Ship throttle stays where you set it (W/S move it up and down), like a real engine telegraph.
- AA guns and SAM launchers are always worked by the crew. The player aims main guns and machine guns.
- Key remapping is included (one key per action).

**Scale and realism**
- Models are true scale (the carrier is 330 m long) and ships use real speeds, slow acceleration and wide turning circles.
- Jet top speeds are held to about Mach 1.2 and the battle area is 18 km across, so fights happen in view instead of
  beyond it. Missile and gun ranges are scaled to match.
- Battlecruiser main guns reload in about 8 seconds and crews only open fire inside about 5.6 km, so a carrier cannot be
  sunk from across the map in the first minute. An unattended battle lasts roughly ten minutes.

**Fleet and battle rules**
- Choosing a ship or submarine puts you in command of one of your fleet's existing ships of that class (a new one
  arrives if none is afloat). Aircraft and the marine are extra units that start on the carrier.
- Sinking the enemy carrier wins; losing yours loses. A new battle starts either way. Everything except the carrier is
  reinforced after a delay: ships arrive from the home edge, aircraft launch from the catapults.
- The carrier's air wing (ten jets, two helicopters) is shown parked on deck. Reinforcement jets launch from the
  catapult. Only the player's deck landings are simulated (gear down, slow, touch down on the deck to trap and re-arm);
  the other pilots do not land.
- The battlecruiser's submarine dock is a pair of stern dock arms with a gantry. Each side's recon sub starts in it.
  From the battlecruiser, U boards and launches the docked sub; a surfaced sub astern of the dock presses E to dock.
- Marines fight over the centre island. A transport helicopter shuttles them from the carrier helipad; the player can
  ride along (E) and take the controls (T).
- There are no dedicated anti-submarine weapons. Submarines can be hit by torpedoes, bombs and shell bursts when near
  the surface, and they must come to periscope depth to attack.

**Graphics**
- Water reflects the sky (a cube rendered once from the sky) plus sun glitter. It does not reflect ships: a full planar
  reflection doubles the render cost.
- The same wave function runs in the water shader and on the CPU, so hulls ride the waves you see.
- Underwater there is depth-coloured fog, a bright window overhead, light shafts and bubbles. Caustics were left out.
- Quality is picked from the graphics card's name on first run. If the frame rate stays under about 27 fps for most of
  the first seconds of a battle, Fast Graphics turns itself on once and says so in a notice with a button to turn it off.
- The cover and share images are an Ultra-quality render of an Extro battle group, with the title drawn on top.

**Names**
- Aethia uses bird names, Extro uses storm names, with made-up class names and model numbers. No real designations.

**PC only**
- Touch-only devices, mobile and tablet browsers, and small screens get the "made for PC" screen from a small inline
  script, and the engine is never requested.

### Known issues and ideas for later

- Checked in a Chromium browser only. Firefox and Safari have not been tried.
- No ship-to-ship collisions; ships steer around each other and the islands but can overlap if forced.
- Shells and turrets do not check for your own superstructure in the line of fire.
- Computer-flown jets never return to land, and helicopters other than the marine shuttle do not land.
- Balance is tuned from simulated battles, not from many hours of play.
- Ideas: depth charges and sonar buoys, weather and time of day, a second map, carrier deck crew directing launches,
  key remapping with several keys per action, gamepad and flight-stick support.
