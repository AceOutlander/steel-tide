# Steel Tide: credits

Steel Tide is made by HunterAceDev. The 3D engine is [three.js](https://threejs.org/) (MIT licence), in `vendor/`.

## Sound

Almost every sound in the game is synthesized in the browser. Three recordings are layered under the synthesized
sound of the ships' big guns and of heavy shells hitting. All three are **CC0 (Creative Commons Zero, public domain
dedication)**, from [Freesound](https://freesound.org/). The files in `assets/sfx/` are Freesound's MP3 versions of
them, unchanged; the game pitches, filters and fades them as it plays them.

| File | Recording | By | Licence | Used for |
| --- | --- | --- | --- | --- |
| `assets/sfx/fieldgun.mp3` | [GUNArtl_69thFieldArtilleryGun01_InMotionAudio_FREESampleSunday.wav](https://freesound.org/people/InMotionAudio/sounds/702245/) | InMotionAudio | CC0 1.0 | the sharp crack at the start of a gun shot |
| `assets/sfx/blast.mp3` | [Big Firecracker](https://freesound.org/people/Kinoton/sounds/414515/) | Kinoton | CC0 1.0 | the body of a heavy gun's boom and of a heavy shell hit |
| `assets/sfx/thunder.mp3` | [Distant Thunder 3](https://freesound.org/people/Fission9/sounds/581124/) | Fission9 | CC0 1.0 | the rolling tail after a heavy gun fires |

CC0 asks for no credit; these are listed so anyone can see where each file came from. Only CC0 recordings may be
added here.

## People

Every person in the game (marines, sailors, officers, pilots, flight-deck crew) is built on the **MakeHuman** human:
its base mesh, its body-shape targets and its rig weights, as shipped with the Blender add-on MPFB 2.0.18, and four
of its skin textures. All of these are **CC0**: MakeHuman released its assets as CC0 in September 2020 (copyright at
that point: Data Collection AB, Joel Palmius, Jonas Hauquier). MPFB itself (the program, GPL) is only used as a tool
on the developer's computer; nothing of it is in the game.

| File | Made from | Source | Licence |
| --- | --- | --- | --- |
| `assets/people/people.bin`, `people.json` | MakeHuman base mesh (`base.obj`), macro targets (male, young / middle-aged; caucasian, asian, african) and game-rig weights, fitted to the game's skeleton by `tools/people/build.py` in Blender 5.1 | [MPFB](https://extensions.blender.org/add-ons/mpfb/) (data from [MakeHuman](http://www.makehumancommunity.org/)) | CC0 1.0 |
| `assets/people/skin_0.webp` | `young_caucasian_male` skin (`young_lightskinned_male_diffuse.png`) | [MakeHuman system assets pack](http://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip) | CC0 1.0 |
| `assets/people/skin_1.webp` | `young_asian_male` skin (`young_lightskinned_male_diffuse3.png`) | same pack | CC0 1.0 |
| `assets/people/skin_2.webp` | `middleage_caucasian_male` skin (`middleage_lightskinned_male_diffuse.png`) | same pack | CC0 1.0 |
| `assets/people/skin_3.webp` | `young_african_male` skin (`young_darkskinned_male_diffuse.png`) | same pack | CC0 1.0 |

The skin files are the head and hands cut out of those textures and laid out again; the eyebrows, the darker cropped
hair, the lash line and the eyes are painted in by the build script. Uniforms, helmets, vests, boots and all other
kit are built by the game's own code. Only CC0 material may be added here.
