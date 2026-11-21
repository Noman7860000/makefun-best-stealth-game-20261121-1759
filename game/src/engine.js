// engine.js — the rules of Gilded Shadow, with no DOM in it at all.
//
// A Game owns the player, the wardens, the relics and the clock. It steps in
// fixed slices, so the same inputs always play out the same way, and a test
// harness can drive it from Node. Rendering lives in render.js, sound in
// audio.js; this file only decides what happens.
//
// The stealth model, in one paragraph: a warden sees you only inside its
// lantern cone with a clear line of sight. While it sees you, its suspicion
// climbs — faster up close, slower when you sneak or stand in shadow. Lose
// its sight and suspicion drains; you recover. At full suspicion the warden
// raises the alarm and chases you until it loses you for a while, then it
// searches where it last saw you and goes back to its patrol. Running is
// loud: wardens nearby come to listen. Touch a warden while it chases you,
// or walk straight into one, and you are caught.

import {
  TILE, COLS, ROWS, LEVELS, tileAt, isSolidTile, blocksSightTile,
  isShadowTile, parseLevel,
} from './levels.js';

export const PLAYER_RADIUS = 11;
export const GUARD_RADIUS = 13;
export const WALK_SPEED = 150;
export const SNEAK_SPEED = 88;
export const VISION_RANGE = 190;
export const VISION_HALF_ANGLE = 0.66; // radians, ~38 degrees each side
export const NOISE_RADIUS = 115;

const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export function turnToward(angle, target, maxStep) {
  const d = angleDiff(target, angle);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

// Step along a segment and report whether any sight-blocking tile is crossed.
export function lineOfSightClear(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x0 + dx * t) / TILE);
    const ty = Math.floor((y0 + dy * t) / TILE);
    if (blocksSightTile(tileAt(level, tx, ty))) return false;
  }
  return true;
}

function circleHitsSolid(level, x, y, r) {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolidTile(tileAt(level, tx, ty))) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
  }
  return false;
}

export class Game {
  constructor(sound) {
    this.sound = sound || null;
    this.state = 'title'; // title | playing | caught | levelDone | won
    this.levelIndex = 0;
    this.score = 0;
    this.totalTime = 0;
    this.alerts = 0;
    this.muted = false;
    this.player = null;
    this.guards = [];
    this.relics = [];
    this.exit = null;
    this.levelTime = 0;
    this.levelScore = 0;
    this.levelAlerts = 0;
    this.message = '';
    this.messageAt = 0;
    this.paused = false; // P / Esc freezes the clock while playing
    this.noisePulse = null; // {x, y, ttl} — a fresh loud step, for the render
    this.loadLevel(0);
  }

  get level() {
    return LEVELS[this.levelIndex];
  }

  get relicsLeft() {
    return this.relics.filter((r) => !r.taken).length;
  }

  get exitOpen() {
    return this.relicsLeft === 0;
  }

  get maxSuspicion() {
    let m = 0;
    for (const g of this.guards) m = Math.max(m, g.suspicion);
    return m;
  }

  get anyAlerted() {
    return this.guards.some((g) => g.mode === 'alerted');
  }

  loadLevel(index) {
    this.levelIndex = index;
    const level = LEVELS[index];
    const parsed = parseLevel(level);
    this.player = {
      x: parsed.playerStart.x,
      y: parsed.playerStart.y,
      angle: 0,
      sneaking: false,
      moving: false,
      stepPhase: 0,
    };
    this.relics = parsed.relics.map((r) => ({ ...r }));
    this.exit = { ...parsed.exit };
    this.guards = level.guards.map((def) => {
      const start = def.path[0];
      return {
        path: def.path.map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE })),
        waypoint: 1 % def.path.length,
        speed: def.speed,
        pause: def.pause,
        x: (start[0] + 0.5) * TILE,
        y: (start[1] + 0.5) * TILE,
        angle: 0,
        suspicion: 0,
        mode: 'patrol',
        wait: 0,
        lastSeen: null,
        loseSightFor: 0,
        searchFor: 0,
        stepPhase: 0,
        wasSuspicious: false,
      };
    });
    // Face each warden along its first patrol leg.
    for (const g of this.guards) {
      const next = g.path[g.waypoint];
      g.angle = Math.atan2(next.y - g.y, next.x - g.x);
    }
    this.levelTime = 0;
    this.levelScore = 0;
    this.levelAlerts = 0;
  }

  startGame() {
    this.score = 0;
    this.totalTime = 0;
    this.alerts = 0;
    this.loadLevel(0);
    this.state = 'playing';
    this.showMessage('Steal the three moonshards. Reach the skylight unseen.');
  }

  restartLevel() {
    this.loadLevel(this.levelIndex);
    this.state = 'playing';
    this.showMessage('Again — quieter this time.');
  }

  backToTitle() {
    this.loadLevel(0);
    this.state = 'title';
  }

  showMessage(text) {
    this.message = text;
    this.messageAt = this.totalTime;
  }

  // Pause only makes sense mid-heist; returns the new paused state.
  togglePause() {
    if (this.state !== 'playing') return this.paused;
    this.paused = !this.paused;
    return this.paused;
  }

  playerOnShadow() {
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor(this.player.y / TILE);
    return isShadowTile(tileAt(this.level, tx, ty));
  }

  // One fixed step. `input` is {up, down, left, right, sneak}.
  update(dt, input) {
    if (this.state !== 'playing') return;
    if (this.paused) return; // the clock, the player and the wardens all wait
    this.totalTime += dt;
    this.levelTime += dt;
    this.updatePlayer(dt, input);
    this.updateGuards(dt);
    this.updatePickups();
    if (this.noisePulse) {
      this.noisePulse.ttl -= dt;
      if (this.noisePulse.ttl <= 0) this.noisePulse = null;
    }
  }

  updatePlayer(dt, input) {
    const p = this.player;
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    p.moving = moving;
    p.sneaking = !!input.sneak;
    if (!moving) return;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const speed = p.sneaking ? SNEAK_SPEED : WALK_SPEED;
    const level = this.level;
    const nx = p.x + dx * speed * dt;
    if (!circleHitsSolid(level, nx, p.y, PLAYER_RADIUS)) p.x = nx;
    const ny = p.y + dy * speed * dt;
    if (!circleHitsSolid(level, p.x, ny, PLAYER_RADIUS)) p.y = ny;
    p.angle = Math.atan2(dy, dx);
    p.stepPhase += dt * (p.sneaking ? 5 : 9);
    // Running is loud: wardens within earshot come to listen.
    if (!p.sneaking) {
      this.noisePulse = { x: p.x, y: p.y, ttl: 0.25 };
      for (const g of this.guards) {
        if (g.mode !== 'patrol') continue;
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < NOISE_RADIUS && g.suspicion < 100) {
          g.mode = 'investigate';
          g.investigateTarget = { x: p.x, y: p.y };
          g.suspicion = Math.max(g.suspicion, 25);
        }
      }
    }
  }

  guardSeesPlayer(g) {
    const p = this.player;
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VISION_RANGE) return { sees: false, dist };
    if (dist > 4) {
      const toPlayer = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(toPlayer, g.angle)) > VISION_HALF_ANGLE) return { sees: false, dist };
    }
    if (!lineOfSightClear(this.level, g.x, g.y, p.x, p.y)) return { sees: false, dist };
    return { sees: true, dist };
  }

  updateGuards(dt) {
    const level = this.level;
    for (const g of this.guards) {
      const { sees, dist } = this.guardSeesPlayer(g);
      // --- suspicion ---
      if (sees) {
        let rate = dist < 60 ? 95 : dist < 120 ? 55 : 32;
        if (this.player.sneaking) rate *= 0.5;
        if (this.playerOnShadow()) rate *= 0.5;
        if (this.player.moving && !this.player.sneaking) rate *= 1.25;
        g.suspicion = Math.min(100, g.suspicion + rate * dt);
        g.lastSeen = { x: this.player.x, y: this.player.y };
        g.loseSightFor = 0;
      } else {
        g.suspicion = Math.max(0, g.suspicion - 30 * dt);
        if (g.mode === 'alerted') g.loseSightFor += dt;
      }
      if (g.suspicion >= 55 && g.suspicion < 100 && !g.wasSuspicious) {
        if (this.sound) this.sound.suspiciousBlip();
      }
      g.wasSuspicious = g.suspicion >= 55 && g.suspicion < 100;

      // --- alarm ---
      if (g.suspicion >= 100 && g.mode !== 'alerted') {
        g.mode = 'alerted';
        g.loseSightFor = 0;
        this.alerts += 1;
        this.levelAlerts += 1;
        this.showMessage('SPOTTED! Break their line of sight!');
        if (this.sound) this.sound.alertSting();
      }

      // --- behaviour ---
      if (g.mode === 'alerted') {
        this.chasePlayer(g, dt);
        if (g.loseSightFor > 2.5) {
          g.mode = 'search';
          g.searchFor = 3;
          g.searchTarget = g.lastSeen ? { ...g.lastSeen } : { x: g.x, y: g.y };
        }
        if (Math.hypot(this.player.x - g.x, this.player.y - g.y) < 22) {
          this.caught();
          return;
        }
      } else if (g.mode === 'search') {
        if (this.moveToward(g, g.searchTarget, g.speed * 1.4, dt)) {
          g.searchFor -= dt;
          g.angle += dt * 2.2; // look around
          if (g.searchFor <= 0) {
            g.mode = 'patrol';
            g.suspicion = 30;
            g.waypoint = this.nearestWaypoint(g);
          }
        } else {
          g.angle = turnToward(g.angle, Math.atan2(g.searchTarget.y - g.y, g.searchTarget.x - g.x), dt * 5);
        }
      } else if (g.mode === 'investigate') {
        if (this.moveToward(g, g.investigateTarget, g.speed * 1.4, dt)) {
          g.wait -= dt;
          g.angle += dt * 2.2;
          if (g.wait <= -2) {
            g.mode = 'patrol';
            g.waypoint = this.nearestWaypoint(g);
            g.wait = 0;
          }
        } else {
          g.wait = 0;
          g.angle = turnToward(g.angle, Math.atan2(g.investigateTarget.y - g.y, g.investigateTarget.x - g.x), dt * 5);
        }
      } else {
        // Patrol: walk the route, pausing at each waypoint. A suspicious
        // warden stops and stares at you instead of walking on.
        const suspiciousHold = g.suspicion >= 55;
        if (suspiciousHold) {
          const toPlayer = Math.atan2(this.player.y - g.y, this.player.x - g.x);
          g.angle = turnToward(g.angle, toPlayer, dt * 6);
        } else if (g.wait > 0) {
          g.wait -= dt;
        } else {
          const target = g.path[g.waypoint];
          if (this.moveToward(g, target, g.speed, dt)) {
            g.waypoint = (g.waypoint + 1) % g.path.length;
            g.wait = g.pause;
          }
        }
        // Walking into a patrolling warden is being caught.
        if (Math.hypot(this.player.x - g.x, this.player.y - g.y) < 20) {
          this.caught();
          return;
        }
      }
      g.stepPhase += dt * 6;
    }
  }

  nearestWaypoint(g) {
    let best = 0;
    let bestD = Infinity;
    g.path.forEach((wp, i) => {
      const d = Math.hypot(wp.x - g.x, wp.y - g.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  // Move a guard toward a point with wall sliding. Returns true when it
  // arrives (within 6 px).
  moveToward(g, target, speed, dt) {
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return true;
    const nx = g.x + (dx / dist) * speed * dt;
    if (!circleHitsSolid(this.level, nx, g.y, GUARD_RADIUS)) g.x = nx;
    const ny = g.y + (dy / dist) * speed * dt;
    if (!circleHitsSolid(this.level, g.x, ny, GUARD_RADIUS)) g.y = ny;
    g.angle = turnToward(g.angle, Math.atan2(dy, dx), dt * 8);
    return Math.hypot(target.x - g.x, target.y - g.y) < 6;
  }

  chasePlayer(g, dt) {
    const p = this.player;
    const speed = g.speed * 3.0;
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const nx = g.x + (dx / dist) * speed * dt;
    if (!circleHitsSolid(this.level, nx, g.y, GUARD_RADIUS)) g.x = nx;
    const ny = g.y + (dy / dist) * speed * dt;
    if (!circleHitsSolid(this.level, g.x, ny, GUARD_RADIUS)) g.y = ny;
    g.angle = turnToward(g.angle, Math.atan2(dy, dx), dt * 10);
  }

  updatePickups() {
    const p = this.player;
    for (const r of this.relics) {
      if (r.taken) continue;
      if (Math.hypot(p.x - r.x, p.y - r.y) < 24) {
        r.taken = true;
        this.score += 250;
        this.levelScore += 250;
        if (this.sound) this.sound.pickup();
        if (this.relicsLeft === 0) {
          this.showMessage('All moonshards taken — the skylight is open!');
          if (this.sound) this.sound.unlockDoor();
        } else {
          this.showMessage(`${this.relicsLeft} moonshard${this.relicsLeft === 1 ? '' : 's'} left.`);
        }
      }
    }
    if (this.exitOpen && Math.hypot(p.x - this.exit.x, p.y - this.exit.y) < 26) {
      this.completeLevel();
    }
  }

  completeLevel() {
    const timeBonus = Math.max(0, Math.round((this.level.par - this.levelTime) * 10));
    const alertPenalty = this.levelAlerts * 150;
    const bonus = timeBonus - alertPenalty;
    this.score += 1000 + bonus;
    this.levelScore += 1000 + bonus;
    if (this.levelIndex >= LEVELS.length - 1) {
      this.state = 'won';
      if (this.sound) this.sound.winFanfare();
    } else {
      this.state = 'levelDone';
      if (this.sound) this.sound.levelClear();
    }
  }

  nextLevel() {
    this.loadLevel(this.levelIndex + 1);
    this.state = 'playing';
    this.showMessage(`${this.level.name} — ${this.level.subtitle}`);
  }

  caught() {
    this.state = 'caught';
    if (this.sound) this.sound.caughtDrone();
  }
}
