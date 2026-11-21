# Gilded Shadow — a moonlit gallery heist

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/Noman7860000/makefun-best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/Noman7860000/makefun-best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

An original top-down stealth game that runs offline in a desktop browser.
You are **Wren, the whisper-thief**. Three moonshards sleep in every gallery,
and the night wardens walk their rounds with lanterns. Stay out of the light,
hide behind crates and statues, and slip out through the skylight unseen.

## How to play

Serve `game/` with any static server (or `node serve.mjs` from this repo)
and open it in desktop Chrome. No network requests, no build step.

- **WASD / arrow keys** — move
- **Shift** — sneak: slower and quieter, wardens spot you half as fast
- **R** — restart the gallery
- **P / Esc** — pause (the wardens wait while you take a breath)
- **M** — mute
- **Enter** — start / continue

## The stealth

- **Vision cones** — a warden only sees you inside its lantern cone with a
  clear line of sight. Crates, statues and walls break it.
- **Suspicion, not instant death** — being seen fills a warden's suspicion
  meter. Break line of sight and it drains; you get a chance to recover.
  At full suspicion the warden raises the alarm and chases you until it loses
  you, then searches where it last saw you and returns to its patrol.
- **Shadow tiles** hide you further; **running is loud** — wardens nearby
  come to listen, and their footsteps are panned by direction and distance.
- **Three galleries**, each with its own patrols to learn: 2, then 3, then
  4 wardens, faster and less patient. Steal all three moonshards in a gallery
  to unlock its skylight exit. Score rewards speed and silence; alarms cost
  you.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` + `game/src/` — the game itself, plain ES modules:
  `main.js` (bootstrap, input, loop, screenshot staging, play-test),
  `engine.js` (rules: movement, vision, suspicion, warden AI),
  `levels.js` (the three galleries), `render.js` (canvas drawing),
  `audio.js` (synthesized WebAudio sounds, no audio files).
- `screenshots/` — real renders of the game's own code in a browser.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

Built for the make.fun bounty
[best-stealth-game-20261121-1759](https://make.fun/bounty/best-stealth-game-20261121-1759)
— play it here: https://make.fun/r/9y40b2n3
