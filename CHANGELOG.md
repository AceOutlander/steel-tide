# Steel Tide: changelog and decisions

## Beta 0.3.4 (the heavy guns thunder)

- The ships' big guns no longer sound like a small drum. A heavy gun shot is now built from layers: a sharp crack (the
  muzzle blast), a deep boom with real sub-bass falling from 80 Hz to under 30, a gritty overdriven body, a rolling
  thunder tail of about four seconds with echoes coming back over the water, and, faintly, the breech, a clank, the shell
  hoist and the turret settling. Three CC0 recordings (a field gun, a deep blast, distant thunder) are mixed under the
  synthesized layers; they are in `assets/sfx/` and listed in `CREDITS.md`. Without them the synthesis plays alone.
- Size: the 380 mm guns of the Battlecruiser and the Super Destroyer are the loudest thing in the game (the Super
  Destroyer's a little deeper); the Corvette's 76 mm deck gun is a short sharp bang; machine guns and the close-in AA
  gun stay light. A triple turret fires as a ripple, barrel after barrel 75 ms apart (the shells too), and a ship's
  turrets no longer all fire in the same instant, so a broadside rolls.
- Distance: sound travels at 343 m/s. A gun 1 km away is heard 2.9 s after its flash, one 5 km away after 14.6 s. The
  crack fades within about a kilometre; what arrives from far off is a deep rumble. The same delay now applies to every
  sound in the battle (explosions, splashes, missiles). Your own guns are only slightly delayed, whatever the camera.
- Feel: your own heavy guns turn everything else and the music down for about 0.3 s, kick the camera (scaled by the
  Camera shake setting; a gun firing close to you kicks less), throw a white-hot flash and fireball that light the ship
  and the water around it for a moment, and leave a big puff of yellow-brown smoke that hangs and drifts with the wind.
- Shell impacts match: a heavy shell in the water is a deep thump with a taller, denser column; on a ship it is a heavy
  explosion with the struck steel ringing and debris coming down. The deck gun has lighter versions of both.
- The output now ends in a limiter and a soft ceiling, so it cannot clip however many guns fire. The big guns go round
  the mix compressor, which is why a gun beside you is far louder than one on the horizon.
- Settings: "Sound volume" is now "Effects volume" (it was already separate from Music volume).
- For checks: `dev.listen(fn, seconds)` in the debug tool renders what `fn` plays through the whole output chain
  without speakers and reports peak, start time, loudness over time and loudness per band. Measured: old heavy gun
  gone in 0.8 s; new one holds for 0.6 s and rolls for 4.5 s, strongest band 30 to 80 Hz; 80 heavy shots with a dozen
  explosions at once peak at 0.91 of full scale with no sample at full scale.

## Beta 0.3.3 (ready for the site-wide account; still switched off)

- Steel Tide now uses the HunterAceDev site account instead of a sign-in of its own: one sign-in on hunteracedev.com
  works in every game there. The page loads the site's account script (only on hunteracedev.com); that script holds the
  switch, the sign-in and the backend address. While it is switched off nothing changes: "Store coming soon", no
  prompt, no network request.
- When it is switched on: a signed-out player is asked to sign in or skip before the game starts (once per visit); the
  in-game Sign in button goes to the site's sign-in page and comes straight back.
- An account starts fresh. Nothing from a guest's local save is moved into an account any more (this closes the route
  by which Credits added to a local save could reach an account). A new account gets a one-time gift of 5,000 Credits
  from the server. A guest's own progress stays in the browser and comes back when playing signed out.

## Beta 0.3.2 (the battle HUD no longer shows behind menus)

- Bug: after Change Unit the whole battle HUD of the previous unit stayed on screen over the unit screen (score bar,
  feed, radar, status panel, weapon list, Credits meter, the PROTECTED badge, reticle, prompt and hint bar). The pause
  menu and the screens opened from it had the same HUD behind them. Cause: those two paths never hid it.
- Now one rule decides it, checked every frame and whenever a menu opens or closes: the HUD shows only during a battle
  with no menu open. Unit selection, redeploy, results, the main menu, settings, How to Play, Pay, the Hangar, the
  store and account screens and the pause menu all show only their own interface, with one Credits balance in the
  corner. On Deploy or Resume the HUD is rebuilt from nothing for the unit in hand.
- Change Unit hands the unit back to its own crew at once (before, it sat without anyone at the controls, still firing
  if the trigger was down, until another unit was deployed).
- Spawn protection starts at the moment of Deploy (it already did; the badge on the unit screen was the stale HUD).
- Found while testing: Back from How to Play, after looking at the Pay page, went to the Pay page again instead of the
  screen before (the two swapped for ever). Back now steps out properly.
- Checked: from every one of the 13 unit types, in both nations: pause, every screen reachable from pause, Change Unit,
  the redeploy screen after the unit is destroyed, the main menu and the Hangar: no HUD element visible in any of them;
  then Deploy: HUD back with the right reticle and a fresh 5-second protection timer.

## Beta 0.3.1 (developer Credits)

- With `?debugtest` in the address a small DEBUG panel appears bottom left with **Grant 50,000** and **Grant 500,000**.
  It adds Credits to the local save only. When signed in to an account the buttons are disabled: the server holds the
  Credits there and nothing in the game can add to them.
- A save that has used the grant is marked, and is not moved into an account at first sign-in (no Credits, no items).
- The server (not in this repository) has an owner-only way to add Credits to an account, protected by a secret that
  is never part of the game. The setup checklist says how to use it.
- `?debugtest` still runs the game muted: grant the Credits, then reload without it to play with sound.

## Beta 0.3.0 (the Super Destroyer)

**The ship**
- A new surface ship for both nations, the largest in the game: the Condor class (Aethia) and the Tempest class (Extro),
  360 m long, crew 5,000. Twelve triple 380 mm turrets (two superfiring pairs on the centre line, eight in the wings, so
  eight bear on either beam), ten SAM launchers, eight close-in guns, a helipad aft, hull sonar (2.8 km).
- The toughest ship there is (60,000 hull points against the carrier's 22,000) and the slowest to answer: 24 knots,
  about twice the battlecruiser's time to gather way and half its rate of turn.
- All three weapon groups can be picked with 1, 2 and 3. The SAM group needs an aircraft under the reticle and a lock, and
  launches one launcher at a time while the button is held; with nothing in the sights the crew keeps working it.
- Works with every paint scheme. The far-distance model keeps the hull, citadel, funnels, tower and the twelve turrets.

**Inside**
- A marine can walk through it. The hatch forward of the helipad leads down to the upper deck: a long corridor with the
  mess, two bunk rooms, the armoury and a briefing room. A stair tower joins the lower deck (engine room, generator
  room, pump room) to the bridge six levels up, which has real windows. A 58-step stair goes down under the waterline to
  the submarine dock bay, with walkways either side of the berth.
- Lit from inside with its own lamps; the lighting turns red at battle stations (the ship hit in the last 40 seconds, or
  an enemy in sight within 4 km). Crew stand, walk and work in the rooms. Tables, bunks, lockers and machinery are solid.
- The inside is drawn only while the camera is on or in the ship. Below the waterline the view is dry and the sea is not
  drawn through the rooms. Inside, the view is always from the marine's eyes.

**The submarine dock**
- One attack submarine lives in a dock under the waterline. It leaves and returns through two doors in the stern, about
  9 m down, without surfacing: the ship carries it along a fixed path through the doors and then lets it go.
- From the ship: U boards the submarine and launches it. From the dock bay on foot: E boards it, E again launches.
- In the submarine, B hands it to its own crew and puts you back on the ship (slow ahead, so the sub can catch up). The
  crew brings the submarine home and docks it, or fights first if an enemy ship is close. Sailing it back yourself: come
  up astern on the ship's heading at dock depth; it docks by itself when lined up, or E from a little further off.
- If the ship sinks while you are in the submarine you stay in the submarine. If the submarine is lost while its ship is
  afloat you are back aboard the ship, not on the redeploy screen.
- The battlecruiser's stern dock works the same way now: B returns to the ship and the submarine comes home.

**Unlocking, battles, pay**
- The only unit that has to be unlocked: 50,000 Credits, once, for both nations. The unit screen shows it with a lock,
  its stats and preview, and "Unlock for 50,000" with a confirm step, or "Need X more" when short (with Get Credits, or
  "Store coming soon" while the store is off). Kept in the save like a cosmetic, and by the account when signed in.
- Each side brings its Super Destroyer to about four battles in ten, never more than one, and a sunk one is not
  replaced. Sinking one pays 2,500; its crew counts toward the 1,000 infantry limit like any other.
- A marine can start on the Super Destroyer when their side has one afloat. It has its own outlined marker on the radar
  and map, and entries in How to Play and on the Pay page.

**How it was checked**
- Every unit, both nations, Fast, Low, Medium, High and Ultra, firing and switching cameras: 130 runs, no errors, no
  camera inside a model. Each weapon group fired; a helicopter landed on the pad and took off; the whole inside walked
  in both nations (every room, the tower to the bridge, the dock stair, the bay); the submarine launched from the ship
  and from the bay, returned with B, docked by hand and by itself; the submarine lost while away; the ship lost while the
  submarine was leaving; two Super Destroyers fought each other.
- Not checked: none of it has been played with a real mouse, and no sound was listened to (tests run muted).

## Beta 0.2.1 (fixes found while checking 0.2.0 on the live site)

- Planes: holding A or D no longer lifts the nose. Before, a held turn in the fighter raised the nose about one degree
  a second, so a long turn became a climb. Now the nose stays at the height it had when the turn began (W/S still
  change it during the turn); the correction is shared between pitch and rudder by the bank angle.
- Shark-mouth paint: the jaws and eye are now laid onto the real skin of the nose on both sides, so they show on all
  five new aircraft. The old version was a cone that ended up inside the new nose shapes and could not be seen.
- Hangar: the Get Credits button in the top bar is hidden while the store is switched off.

## Beta 0.2.0 (new models, soldiers, HUD, Credits, Hangar)

**Models**
- Every vehicle is rebuilt in code with smooth shapes, real detail and painted textures without a tile grid: the
  gunship (rotary chin cannon that spins when firing, nose sensors, tandem cockpit with pilots, rotor hub, rocket pods),
  the tandem-rotor transport, the fighter, the swing-wing bomber, the radar-dome recon plane; the patrol boat,
  corvette, battlecruiser (stern dock), carrier (catapult tracks, wires, elevators, island) and both submarines; all
  five deck mounts; missiles, bombs and torpedoes at true size. Two detail levels, thinner detail below Medium.
- Built in code rather than in Blender or from outside assets, so paint schemes can repaint them and wreckage can cut
  them. Known weak spots: the far-distance models have no windows or deck paint, so the switch shows in Fast Graphics;
  the carrier hull under the deck overhang is plain; stairs and ladders are decoration.

**Soldiers and crew**
- One code-built human with a skeleton replaces the box figure and the pill-shaped sailors: marines, sailors, pilots
  and flight-deck crew in job-coloured jerseys, with a real-size rifle held in the shoulder, and animations for idle,
  walk, sprint, crouch, aim, fire, reload, jump and land, swim, manning a gun, deck tasks and death. Crowds are baked
  poses drawn instanced, with contact shadows, and feet on the deck.
- First person: arms, gloved hands and the rifle in their own pass (they cannot clip into walls), with sway, bob,
  sprint lowering, recoil, casings, muzzle flash, a reload that matches the reload time, and aiming down the sights on
  the right button (a slight zoom). Hidden when swimming, in vehicles, on a gun or dead.
- Not there: ladders and doors (the game has none), seated passengers are not drawn, faces are simple.

**HUD, score, radar**
- One reticle per kind of control: marine (opens when moving or firing, closes and fades when aiming), ship guns,
  mounted guns, submarine, periscope, plane (the centre dot is only where you look; the gunsight is the nose marker),
  helicopter. A line under it gives range and the state of the weapon in hand.
- The whole HUD starts clean whenever control changes: another unit, a seat or a gun, a camera mode, the periscope,
  death, redeploy, back to the menu. No marker, box, label or warning carries over.
- Score bar: your side on the left, "KILLS" counted per side, each carrier's health as a labelled bar with a
  percentage, the goal in the middle. A carrier's bar flashes when it is hit, with a call at 50% and 25%. Holding Tab
  shows the map and what each side has lost (ships, submarines, aircraft, marines).
- Radar: green is your side, red the enemy, white you (always centred, always pointing up). Shapes by type: hulls for
  ships (longer for bigger ships, carriers boxed), diamond for submarines, a plane for aircraft, an X for helicopters,
  dots for people inside 1 km. Islands are dim grey. A ring marks what you are aiming at; incoming missiles flash.
  The = and - keys zoom between 1, 3, 7 and 15 km. A legend shows for the first three battles (and from Settings).
  Settings has a colour-blind option (blue and orange) that changes the radar, reticle, labels and kill feed together.

**Aircraft wreckage**
- A destroyed aircraft is cut into pieces of its own model, in its own paint, scorched. Machine-gun kills leave it
  whole, burning and spiralling down until it hits; AA and cannon kills break off wings, nose and tail; a direct
  missile hit or a bomber with bombs aboard shatters it. Pieces keep the aircraft's speed, are thrown by the blast,
  tumble (flat pieces flutter, rotors spin away), trail fire and smoke, splash and sink leaving burning fuel, or
  bounce, slide and burn on decks and islands, hurting what they hit. A slow ditching floats and burns before it sinks.
  Pilots sometimes eject. A shot-down player watches the wreck fall before the redeploy screen.
- Limits: about 50 pieces at once (20 in Fast Graphics), fewer and simpler far from the camera.
- Not there: mid-air collisions do not exist in the game; no debris whistle sound.

**Sound**
- Battle sounds and menu sounds are on separate buses. On every menu the battle fades to silence in half a second and
  nothing from the battle starts playing, so nothing piles up; it fades back in on return. Menus have their own calm
  music, quiet click and hover sounds, and a soft harbour ambience in the unit showroom.
- The fight now keeps running, silently, behind the unit-select and redeploy screens. Only the pause menu stops it.

**Credits**
- Credits (written with an anchor, never a dollar sign) are earned from your own kills: marine or sailor 25, aircraft
  150, patrol boat 100, corvette 250, submarine 400, battlecruiser 800, carrier 2,000; an assist (a fifth of the
  target's health in damage) pays half; 300 for taking part and 1,000 more for a win.
- Infantry pay limit: everyone lost counts at 25 each (marines shot, crews lost with ships and aircraft), up to 1,000
  a battle. The HUD shows the wallet and an "Infantry pay" meter; the kill feed shows the breakdown; a notice appears
  once when the limit is reached; the results screen after each battle lists ships, aircraft, infantry, participation
  and win bonus; How to Play has a Pay page.

**Hangar and cosmetics (looks only)**
- New Hangar screen: Paint, Helmets, Uniforms, Accessories, with a 3D try-on preview (drag to turn, wheel to zoom),
  tiers by colour, buy with a confirm step, equip per nation, at most four accessories and one per slot.
- Five paint schemes repaint any unit: Battle-Worn, Shark-mouth (aircraft), Ceremonial White, Stealth Black, Gold Trim.
  About one unit in six on either side wears one. Wreckage keeps its paint.

**Accounts and the Credit store (switched off)**
- The game can sign players in by emailed code, keep the wallet on a server, check battle results there, and sell
  Credit packs through Stripe. All of it is off until `js/core/storeconfig.js` is filled in: the menu says "Store
  coming soon" and the game makes no request to any server.

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
