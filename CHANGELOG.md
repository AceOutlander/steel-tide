# Steel Tide: changelog and decisions

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
