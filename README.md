# Lamput: Escape the Docs

**Play it: https://nookhbah.github.io/lamput-escape/**

A browser platformer starring a shapeshifting orange blob. 15 wards, a boss
fight, and four morph forms. Works on desktop (keyboard) and on phones
(on-screen controls, landscape).

- **`index.html`** — the game.
- **`mischief.html`** — an abandoned puzzle prototype, kept for reference.

## Running locally

```
node tools/serve.mjs
```

A no-cache dev server; a plain static server will hand you stale ES modules.

---

# Lamput's Mischief

Drag a thing off the shelf. Drop it where it fits. Press play. Watch.

There is no tutorial and no instruction text anywhere in the game, on purpose.
Level 1 gives you one bucket, one hook, and a doctor whose path stops directly
under it — you cannot get it wrong, and by the time it lands you know the whole
interface. Every level after that adds exactly one idea:

| | teaches |
| --- | --- |
| 1 | drag, drop, play |
| 2 | two hooks, one path — read where he walks |
| 3 | nothing hangs over him, so build a chain |
| 4 | a puddle makes him slip, and a slip shoves what rolls |
| 5 | the trolley has to be within reach of where he falls |
| 6 | two of them |

Three stars per level, scored on chain length. Stars persist. `R` retries with
your rig intact, arrow keys skip levels.

### How it works

**Deterministic** — fixed timestep, seeded RNG, no wall-clock, so the same rig
replays identically. Instant retry depends on it, and so would rewind.

**Interactions are authored against traits, not objects.** `js/mischief/sim.js`
holds the whole rule table: `WET + LIVE` sparks, `spark + HANGS` swings,
`ROLLING + TALL` topples. Add a new prop by giving it traits and it inherits
every rule that already exists.

**Levels are data.** `js/mischief/levels.js` — props, slots, the doctor's route,
and star pars. A new level is one object in that array.

`node tools/check-levels.mjs` still validates the old platformer's grids.

---

# Lamput — Escape the Docs (earlier direction)

A blobby, cartoon-flavoured chase platformer. You are Lamput, an orange goo who
keeps escaping the lab. Two doctors want you back in a specimen jar. Collect
every goo orb, dodge the docs, and ooze out of the hatch.

**Play:** open `index.html` through any static server.

```bash
npm run dev      # python3 -m http.server 4321
# then visit http://localhost:4321
```

There is no build step and no dependencies — plain ES modules, one canvas, and
everything (art, sound, levels) generated in code.

## Controls

| Action | Keys |
| --- | --- |
| Move | ◀ ▶ / A D |
| Jump (press twice to blob-bounce) | Space / ▲ / W |
| Drop through a platform | ▼ / S |
| Morph into a prop | Shift |
| Goo dash | X / Ctrl |
| Pause · mute · retry level | P · M · R |

Touch controls appear automatically on phones and tablets.

## How it plays

Each ward is a single screen. Grab all the goo orbs to unlock the hatch, then
reach it without getting grabbed. Doctors see you inside their vision cone and
only in a straight line — break line of sight, or stand on a prop and press
Shift to disguise yourself, and they will wander right past.

Every ward opens with a grace period: the docs spawn well away from you, facing
the other way, and stay oblivious for ~1.8s, so you always get a head start.

Three lives per attempt. Getting caught costs a life and 100 points, and sends
you back to the start of the ward with your collected orbs intact. Clearing a
ward pays 500, plus a time bonus against par and 400 more if you were never
caught.

## Progress is saved

Clearing a ward checkpoints the run to `localStorage` — the ward you reached,
your score and your remaining lives. Reopen the game and the menu lands on that
ward with **PRESS ENTER TO CONTINUE**; your score and lives carry straight on.
Pick any earlier ward with the arrows and it starts a clean run instead, so
replaying a favourite never corrupts the checkpoint. Your best score and the
furthest ward you reached persist independently of the current run.

## The eleven wards

Each one introduces something new rather than just adding more enemies:

1. **Wake Up, Goo** — movement and the double jump.
2. **Hide and Sneak** — morphing into props.
3. **Double Trouble** — Spec joins: slower, but a much wider cone.
4. **Goo Dash** — the dash, plus zap-nets on the floor.
5. **Rise and Shine** — moving lifts that docs can ride too.
6. **Sticky Situation** — sludge that slows anything standing on it; wall cling.
7. **Laser Ward** — security beams that blink on and off.
8. **Conveyor Chaos** — belts that drag you sideways.
9. **Lights Out** — a blackout; the docs carry torches.
10. **The Specimen Lab** — everything at once, and a third doc.
11. **The Goo-Vac 5000** — the boss.

## The boss

The docs stop chasing on foot and roll out a machine, with both of them riding
it. You have no attack, so you never hit it directly — you make it hurt itself.

It lines up above you, winds up, then drops its hose and **sucks**. Standing
still gets you lifted off the floor and swallowed, so either sprint out of the
cone or morph: a heavy prop is too much for the vacuum and it gives up. Running
the vacuum overheats it, and it sinks down with its **core exposed** — that is
your window. Land on the core to wreck it and bounce clear.

Three hits, three phases:

1. Suction only, slow and well telegraphed.
2. It drops **zap-bolts** that leave live puddles on the floor.
3. Faster, meaner, and the two docs **bail out** and chase you on foot while the
   machine keeps firing.

Touching the chassis at any other time hurts. While it is cooling, the whole
machine is inert — only the core matters.

## Code layout

| File | What's in it |
| --- | --- |
| `js/main.js` | Input mapping, DPI-aware canvas, fixed-timestep loop |
| `js/game.js` | World parsing, state machine, rendering, HUD, overlays |
| `js/entities.js` | Tilemap physics, Lamput, doctor AI, lifts |
| `js/levels.js` | The ten level grids and their tuning |
| `js/art.js` | Every character and tile, drawn with canvas paths |
| `js/audio.js` | WebAudio synth — sound effects and the chase music |
| `js/fx.js` | Particles, screen shake, floating text |
| `tools/check-levels.mjs` | Reachability check for every ward (see below) |

Levels are plain 24×14 character grids in `js/levels.js`, so a new ward is just
another string array. The legend is documented at the top of that file.

## Checking levels

```bash
node tools/check-levels.mjs
```

Hand-drawn grids make it easy to park an orb somewhere no jump can reach. This
script reads the real physics constants out of `js/entities.js`, builds a graph
of every standable surface (including the swept path of moving lifts), floods it
from Lamput's spawn using a deliberately conservative jump envelope, and fails if
any orb, prop or exit falls outside it. Run it after editing any grid or any
jump constant — it exits non-zero on failure.
