// main.js — bootstrap for Gilded Shadow.
//
// Wires the canvas to the engine: keyboard input, the fixed-step loop, the
// sound engine, and two special modes driven by the URL so the game can be
// verified without a human at the keyboard:
//
//   ?shot=play|patrol|alert|win   — stage one fixed, reproducible scene and
//                                   render it once (screenshots come from this)
//   ?test=1                       — run the scripted play-test below and write
//                                   PASS/FAIL lines into #test-results

import { Game } from './engine.js';
import { SoundEngine } from './audio.js';
import { drawGame, VIEW_W, VIEW_H } from './render.js';
import { TILE } from './levels.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const sound = new SoundEngine();
const game = new Game(sound);
window.__game = game; // for debugging in the console

// --- canvas sizing: keep the 960x640 view fitted, never stretched ----------
function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// --- input -----------------------------------------------------------------
const keys = new Set();
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'sneak', ShiftRight: 'sneak',
};

function readInput() {
  return {
    up: keys.has('up'),
    down: keys.has('down'),
    left: keys.has('left'),
    right: keys.has('right'),
    sneak: keys.has('sneak'),
  };
}

window.addEventListener('keydown', (e) => {
  sound.unlock();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  const action = KEYMAP[e.code];
  if (action) keys.add(action);
  if (e.code === 'KeyM') {
    sound.enabled = !sound.enabled;
    game.showMessage(sound.enabled ? 'Sound on.' : 'Sound off.');
  }
  if (e.code === 'KeyR' && (game.state === 'playing' || game.state === 'caught')) {
    game.restartLevel();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.togglePause()) {
      statusEl.textContent = 'Gilded Shadow — paused. Press P to resume.';
    } else if (game.state === 'playing') {
      statusEl.textContent = 'Gilded Shadow — playing.';
    }
  }
  if (e.code === 'Enter') {
    if (game.state === 'title') game.startGame();
    else if (game.state === 'levelDone') game.nextLevel();
    else if (game.state === 'won') game.startGame();
    else if (game.state === 'caught') game.backToTitle();
  }
});
window.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (action) keys.delete(action);
});
window.addEventListener('pointerdown', () => sound.unlock());

// --- deterministic screenshot scenes ---------------------------------------
// Each scene sets exact positions, angles and suspicion values, then renders
// once with a fixed clock — so the same URL always paints the same frame.

function stageShot(name) {
  const t = 2.0; // fixed clock: every pulse and glow is reproducible
  if (name === 'play') {
    // Cover: level 1 mid-heist. Wren sneaks behind a crate while a warden's
    // lantern cone sweeps past; relics, patrol routes and the skylight show.
    game.startGame();
    game.player.x = 8.5 * TILE;
    game.player.y = 4.5 * TILE;
    game.player.angle = Math.PI / 2;
    game.player.sneaking = true;
    const g = game.guards[0];
    g.x = 11.5 * TILE;
    g.y = 1.5 * TILE;
    g.angle = Math.PI * 0.15;
    g.suspicion = 32;
    const g2 = game.guards[1];
    g2.x = 21 * TILE;
    g2.y = 15.5 * TILE;
    g2.angle = Math.PI;
    game.relics[0].taken = true;
    game.score = 250;
    game.showMessage('One moonshard down. Two to go — stay out of the light.');
  } else if (name === 'patrol') {
    // Level 2: three wardens on their rounds, cones crossing the courtyard.
    game.startGame();
    game.loadLevel(1);
    game.state = 'playing';
    game.player.x = 2.5 * TILE;
    game.player.y = 3.5 * TILE;
    game.player.angle = 0;
    game.player.sneaking = true;
    const [g0, g1, g2] = game.guards;
    g0.x = 8 * TILE; g0.y = 1.5 * TILE; g0.angle = 0; g0.suspicion = 0;
    g1.x = 21 * TILE; g1.y = 7.5 * TILE; g1.angle = Math.PI * 0.75; g1.suspicion = 12;
    g2.x = 7 * TILE; g2.y = 15.5 * TILE; g2.angle = Math.PI * 0.5; g2.suspicion = 0;
    game.showMessage('Three wardens now. Learn their walk before you move.');
  } else if (name === 'alert') {
    // A warden has spotted Wren and is closing in — the "!" and the red cone.
    // Both stand in the open southern hall (rows 13-17), clear sight between.
    game.startGame();
    game.player.x = 20.5 * TILE;
    game.player.y = 13.5 * TILE;
    game.player.angle = -Math.PI / 2;
    const g = game.guards[1];
    g.x = 20.5 * TILE;
    g.y = 16.5 * TILE;
    g.angle = -Math.PI / 2;
    g.mode = 'alerted';
    g.suspicion = 100;
    g.lastSeen = { x: game.player.x, y: game.player.y };
    game.alerts = 1;
    game.showMessage('SPOTTED! Break their line of sight!');
  } else if (name === 'win') {
    // The heist complete: final score over the third gallery.
    game.startGame();
    game.loadLevel(2);
    game.state = 'won';
    game.score = 6840;
    game.totalTime = 298;
    game.alerts = 2;
    game.relics.forEach((r) => { r.taken = true; });
  }
  return t;
}

// --- scripted play-test ----------------------------------------------------
// Drives the engine with synthetic input and checks the stealth rules hold.
// Results go into #test-results (and document.title) for headless runs.

function runTests() {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
  const step = (g, input, seconds, dt = 1 / 60) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) g.update(dt, input);
  };
  const idle = { up: false, down: false, left: false, right: false, sneak: false };
  const silent = { sound: null };

  // 1. Movement: the player walks right.
  {
    const g = new Game(null);
    g.startGame();
    const x0 = g.player.x;
    step(g, { ...idle, right: true }, 0.5);
    check('player moves right', g.player.x > x0 + 40, `x ${x0.toFixed(0)} -> ${g.player.x.toFixed(0)}`);
  }
  // 2. Walls block movement.
  {
    const g = new Game(null);
    g.startGame();
    g.player.x = 1.5 * TILE;
    g.player.y = 1.5 * TILE;
    step(g, { ...idle, left: true }, 1);
    check('wall blocks movement', g.player.x > TILE - 12, `x=${g.player.x.toFixed(1)}`);
  }
  // 3. Wardens patrol: a warden moves and reaches its next waypoint.
  {
    const g = new Game(null);
    g.startGame();
    const w = g.guards[0];
    const start = { x: w.x, y: w.y };
    step(g, idle, 3);
    const moved = Math.hypot(w.x - start.x, w.y - start.y);
    check('guard patrols', moved > 30, `moved ${moved.toFixed(0)}px in 3s`);
  }
  // 4. Detection: standing in a lit cone, suspicion climbs fast.
  {
    const g = new Game(null);
    g.startGame();
    const w = g.guards[0];
    w.x = 10 * TILE; w.y = 5 * TILE; w.angle = 0; w.mode = 'patrol';
    w.path = [{ x: w.x, y: w.y }]; w.waypoint = 0; // stand still for the test
    g.player.x = 12 * TILE; g.player.y = 5 * TILE; // 64px ahead, clear sight
    step(g, idle, 1);
    check('detection rises in cone', w.suspicion > 50, `suspicion=${w.suspicion.toFixed(0)} after 1s`);
  }
  // 5. Cover breaks detection: a crate between warden and player.
  {
    const g = new Game(null);
    g.startGame();
    const w = g.guards[0];
    // Level 1 row 2 holds a crate at tile (6,2). Warden west of it, player
    // east of it, same row: the crate must block the lantern's sight.
    w.x = 4 * TILE; w.y = 2.5 * TILE; w.angle = 0; w.mode = 'patrol';
    w.path = [{ x: w.x, y: w.y }]; w.waypoint = 0;
    g.player.x = 8 * TILE; g.player.y = 2.5 * TILE;
    step(g, idle, 1.5);
    check('cover blocks detection', w.suspicion < 5, `suspicion=${w.suspicion.toFixed(1)} behind crate`);
  }
  // 6. Sneaking and shadow slow detection.
  {
    const rates = [];
    for (const sneak of [false, true]) {
      const g = new Game(null);
      g.startGame();
      const w = g.guards[0];
      w.x = 10 * TILE; w.y = 5 * TILE; w.angle = 0; w.mode = 'patrol';
      w.path = [{ x: w.x, y: w.y }]; w.waypoint = 0;
      g.player.x = 12 * TILE; g.player.y = 5 * TILE;
      step(g, { ...idle, sneak }, 1);
      rates.push(w.suspicion);
    }
    check('sneaking halves detection', rates[1] < rates[0] * 0.6, `walk=${rates[0].toFixed(0)} sneak=${rates[1].toFixed(0)}`);
  }
  // 7. Full suspicion raises the alarm.
  {
    const g = new Game(null);
    g.startGame();
    const w = g.guards[0];
    w.x = 10 * TILE; w.y = 5 * TILE; w.angle = 0; w.mode = 'patrol';
    w.path = [{ x: w.x, y: w.y }]; w.waypoint = 0;
    g.player.x = 12 * TILE; g.player.y = 5 * TILE;
    step(g, idle, 2);
    check('alarm at full suspicion', w.mode === 'alerted' && g.alerts === 1, `mode=${w.mode} alerts=${g.alerts}`);
  }
  // 8. Recovery: break line of sight and suspicion drains.
  {
    const g = new Game(null);
    g.startGame();
    const w = g.guards[0];
    w.x = 10 * TILE; w.y = 5 * TILE; w.angle = 0; w.mode = 'patrol';
    w.path = [{ x: w.x, y: w.y }]; w.waypoint = 0;
    g.player.x = 12 * TILE; g.player.y = 5 * TILE;
    step(g, idle, 0.8);
    const peaked = w.suspicion;
    g.player.x = 2 * TILE; g.player.y = 18 * TILE; // far away, out of sight
    step(g, idle, 2);
    check('suspicion recovers out of sight', w.suspicion < peaked * 0.4, `peaked=${peaked.toFixed(0)} now=${w.suspicion.toFixed(0)}`);
  }
  // 9. Relic pickup and the exit unlocking.
  {
    const g = new Game(null);
    g.startGame();
    const relic = g.relics[0];
    g.player.x = relic.x; g.player.y = relic.y;
    step(g, idle, 0.1);
    check('relic collected', relic.taken && g.score >= 250, `score=${g.score}`);
    check('exit locked until all relics', !g.exitOpen, `left=${g.relicsLeft}`);
    for (const r of g.relics) { g.player.x = r.x; g.player.y = r.y; step(g, idle, 0.1); }
    check('exit opens after all relics', g.exitOpen, `left=${g.relicsLeft}`);
    g.player.x = g.exit.x; g.player.y = g.exit.y;
    step(g, idle, 0.1);
    check('reaching exit completes level', g.state === 'levelDone', `state=${g.state}`);
  }
  // 10. Being caught ends the run; restart restores it.
  {
    const g = new Game(null);
    g.startGame();
    const w = g.guards[0];
    w.x = 10 * TILE; w.y = 5 * TILE; w.angle = 0; w.mode = 'alerted'; w.suspicion = 100;
    g.player.x = 10.5 * TILE; g.player.y = 5 * TILE;
    step(g, idle, 0.2);
    check('caught when a chasing warden touches you', g.state === 'caught', `state=${g.state}`);
    g.restartLevel();
    check('restart restores the level', g.state === 'playing' && g.relics.every((r) => !r.taken), `state=${g.state}`);
  }
  // 11. Pause freezes the game: the clock and the player do not move.
  {
    const g = new Game(null);
    g.startGame();
    g.togglePause();
    const t0 = g.totalTime;
    const x0 = g.player.x;
    step(g, { ...idle, right: true }, 1);
    check('pause freezes the game', g.paused && g.totalTime === t0 && g.player.x === x0, `t ${t0} -> ${g.totalTime}, x ${x0.toFixed(0)} -> ${g.player.x.toFixed(0)}`);
    g.togglePause();
    step(g, { ...idle, right: true }, 0.5);
    check('unpause resumes the game', !g.paused && g.player.x > x0 + 40, `x=${g.player.x.toFixed(0)}`);
  }
  // 12. Every level: relics and exit reachable, patrol legs unblocked.
  {
    const { LEVELS, reachableTiles, tileAt, isSolidTile } = window.__levels;
    LEVELS.forEach((level, li) => {
      const reach = reachableTiles(level);
      const { parseLevel } = window.__levels;
      const parsed = parseLevel(level);
      const relicOk = parsed.relics.every((r) => reach.has(`${Math.floor(r.x / TILE)},${Math.floor(r.y / TILE)}`));
      const exitOk = reach.has(`${Math.floor(parsed.exit.x / TILE)},${Math.floor(parsed.exit.y / TILE)}`);
      check(`level ${li + 1} relics reachable`, relicOk);
      check(`level ${li + 1} exit reachable`, exitOk);
      level.guards.forEach((def, gi) => {
        let legsOk = true;
        for (let i = 0; i < def.path.length; i++) {
          const [x0, y0] = def.path[i];
          const [x1, y1] = def.path[(i + 1) % def.path.length];
          if (isSolidTile(tileAt(level, x0, y0)) || isSolidTile(tileAt(level, x1, y1))) legsOk = false;
          const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4;
          for (let s = 0; s <= steps; s++) {
            const tx = Math.round(x0 + ((x1 - x0) * s) / steps);
            const ty = Math.round(y0 + ((y1 - y0) * s) / steps);
            if (isSolidTile(tileAt(level, tx, ty))) legsOk = false;
          }
        }
        check(`level ${li + 1} guard ${gi + 1} patrol clear`, legsOk);
      });
    });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const el = document.getElementById('test-results');
  const text = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`).join('\n');
  if (el) el.textContent = `GILDED SHADOW PLAY-TEST: ${passed}/${results.length} passed\n${text}`;
  document.title = failed.length === 0 ? 'TESTS PASS' : 'TESTS FAIL';
  return failed.length === 0;
}

// --- boot ------------------------------------------------------------------

const shot = params.get('shot');
if (params.get('test') === '1') {
  // Levels are imported dynamically so the test can use their helpers.
  import('./levels.js').then((levels) => {
    window.__levels = levels;
    drawGame(ctx, game, 0);
    runTests();
    drawGame(ctx, game, 0);
  });
} else if (shot) {
  const t = stageShot(shot);
  drawGame(ctx, game, t);
  statusEl.textContent = `Gilded Shadow — staged shot: ${shot}`;
} else {
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game.state === 'playing' && !game.paused) {
      acc += dt;
      while (acc >= STEP) {
        game.update(STEP, readInput());
        acc -= STEP;
      }
      // Footsteps: the player's and the nearest warden's, panned by distance.
      if (game.player.moving && game.player.stepPhase % (Math.PI * 2) < 0.3) {
        sound.footstep(0, game.player.sneaking ? 0.05 : 0.1);
      }
      for (const g of game.guards) {
        const d = Math.hypot(g.x - game.player.x, g.y - game.player.y);
        if (d < 320 && Math.sin(g.stepPhase) > 0.98) {
          sound.footstep((g.x - game.player.x) / 320, Math.max(0.02, 0.14 * (1 - d / 320)));
        }
      }
    }
    drawGame(ctx, game, now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  statusEl.textContent = 'Gilded Shadow — a moonlit gallery heist. Press Enter to begin.';
}
