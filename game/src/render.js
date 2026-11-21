// render.js — everything Gilded Shadow shows, drawn on one canvas.
//
// The look: a moonlit gallery at night. Cold blue floors, warm lantern cones
// from the wardens, and darkness you can read at a glance — shadow tiles are
// deep indigo, lit floor is slate blue, cover is solid and tall. The player
// is a small teal hood; the wardens are brass-trimmed navy. Nothing here
// loads a file: every shape is drawn from code.
//
// `drawGame(ctx, game, t)` draws the world for the game's current state; the
// title, caught, level-done and win screens are drawn over it.

import { TILE, COLS, ROWS, tileAt, isSolidTile, isShadowTile } from './levels.js';
import { VISION_RANGE, VISION_HALF_ANGLE } from './engine.js';

export const VIEW_W = 960;
export const VIEW_H = 640;

const FLOOR_A = '#232a3d';
const FLOOR_B = '#202635';
const SHADOW_FLOOR = '#141a2c';
const WALL_TOP = '#4a5468';
const WALL_FACE = '#2c3446';
const WALL_EDGE = '#171d2b';

// --- helpers ---------------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- the world -------------------------------------------------------------

function drawFloor(ctx, game, t) {
  const level = game.level;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = tileAt(level, x, y);
      const px = x * TILE;
      const py = y * TILE;
      if (ch === '#') continue;
      ctx.fillStyle = isShadowTile(ch) ? SHADOW_FLOOR : (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(px, py, TILE, TILE);
      if (isShadowTile(ch)) {
        // Moonlight dappling on the dark tiles.
        ctx.fillStyle = 'rgba(120, 150, 255, 0.05)';
        ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    }
  }
  // A faint moonbeam across the gallery, for mood.
  const beam = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
  beam.addColorStop(0, 'rgba(150,180,255,0.05)');
  beam.addColorStop(0.5, 'rgba(150,180,255,0.0)');
  beam.addColorStop(1, 'rgba(150,180,255,0.04)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawPatrolRoutes(ctx, game) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 214, 130, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 7]);
  for (const g of game.guards) {
    ctx.beginPath();
    g.path.forEach((wp, i) => {
      if (i === 0) ctx.moveTo(wp.x, wp.y);
      else ctx.lineTo(wp.x, wp.y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawExit(ctx, game, t) {
  const e = game.exit;
  const open = game.exitOpen;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.save();
  ctx.translate(e.x, e.y);
  // Door frame.
  ctx.fillStyle = open ? '#2f6b4f' : '#5a2e2e';
  rr(ctx, -18, -20, 36, 40, 6);
  ctx.fill();
  ctx.strokeStyle = open ? '#7fe0a8' : '#c96a5a';
  ctx.lineWidth = 2;
  ctx.stroke();
  // The doorway itself.
  ctx.fillStyle = open ? `rgba(140, 255, 190, ${0.55 + 0.3 * pulse})` : '#1a1214';
  rr(ctx, -11, -13, 22, 26, 4);
  ctx.fill();
  if (open) {
    ctx.fillStyle = '#eafff1';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', 0, 1);
  } else {
    // A little padlock.
    ctx.fillStyle = '#d8b25a';
    ctx.fillRect(-5, -2, 10, 8);
    ctx.strokeStyle = '#d8b25a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -2, 4, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
  if (open) {
    ctx.save();
    ctx.fillStyle = '#a9f5c6';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SKYLIGHT OPEN', e.x, e.y - 30);
    ctx.restore();
  }
}

function drawRelics(ctx, game, t) {
  for (const r of game.relics) {
    if (r.taken) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + r.x);
    ctx.save();
    ctx.translate(r.x, r.y);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26 + 6 * pulse);
    glow.addColorStop(0, 'rgba(120, 230, 255, 0.5)');
    glow.addColorStop(1, 'rgba(120, 230, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // The moonshard itself: a tilted diamond.
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#8fe8ff';
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 1.5;
    const s = 8 + 1.5 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

function drawCoverAndWalls(ctx, game) {
  const level = game.level;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = tileAt(level, x, y);
      const px = x * TILE;
      const py = y * TILE;
      if (ch === '#') {
        ctx.fillStyle = WALL_FACE;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = WALL_TOP;
        ctx.fillRect(px, py, TILE, 7);
        ctx.fillStyle = WALL_EDGE;
        ctx.fillRect(px, py + TILE - 3, TILE, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(px, py, 2, TILE);
      } else if (ch === 'C') {
        // A wooden crate, bound with iron.
        ctx.fillStyle = '#6b4a2a';
        rr(ctx, px + 3, py + 3, TILE - 6, TILE - 6, 3);
        ctx.fill();
        ctx.strokeStyle = '#3d2a16';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(61,42,22,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 3, py + 3);
        ctx.lineTo(px + TILE - 3, py + TILE - 3);
        ctx.moveTo(px + TILE - 3, py + 3);
        ctx.lineTo(px + 3, py + TILE - 3);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,220,150,0.12)';
        ctx.fillRect(px + 3, py + 3, TILE - 6, 5);
      } else if (ch === 'H') {
        // A pale marble statue on a plinth.
        ctx.fillStyle = '#3a4152';
        ctx.fillRect(px + 6, py + 20, TILE - 12, 8);
        ctx.fillStyle = '#c9cfdd';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + 13, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#aab2c4';
        ctx.fillRect(px + TILE / 2 - 5, py + 18, 10, 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + 13, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

// --- the people ------------------------------------------------------------

function drawVisionCone(ctx, g, t) {
  const flicker = 0.9 + 0.1 * Math.sin(t * 7 + g.x * 0.05);
  const grad = ctx.createRadialGradient(g.x, g.y, 8, g.x, g.y, VISION_RANGE * flicker);
  const hot = g.mode === 'alerted';
  grad.addColorStop(0, hot ? 'rgba(255, 90, 70, 0.34)' : 'rgba(255, 214, 130, 0.30)');
  grad.addColorStop(0.7, hot ? 'rgba(255, 90, 70, 0.14)' : 'rgba(255, 214, 130, 0.12)');
  grad.addColorStop(1, 'rgba(255, 214, 130, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y);
  ctx.arc(g.x, g.y, VISION_RANGE * flicker, g.angle - VISION_HALF_ANGLE, g.angle + VISION_HALF_ANGLE);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Cone rim, so the edge reads at a glance.
  ctx.save();
  ctx.strokeStyle = hot ? 'rgba(255, 110, 90, 0.5)' : 'rgba(255, 224, 150, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y);
  ctx.arc(g.x, g.y, VISION_RANGE * flicker, g.angle - VISION_HALF_ANGLE, g.angle + VISION_HALF_ANGLE);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawGuard(ctx, g, t) {
  const bob = Math.sin(g.stepPhase) * 1.2;
  ctx.save();
  ctx.translate(g.x, g.y + bob * 0.4);
  // Body: navy uniform with a brass collar.
  ctx.fillStyle = '#1d2a4a';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Lantern dot showing where the warden faces.
  const lx = Math.cos(g.angle) * 9;
  const ly = Math.sin(g.angle) * 9;
  ctx.fillStyle = g.mode === 'alerted' ? '#ff6a55' : '#ffd682';
  ctx.beginPath();
  ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Suspicion ring above the head.
  if (g.suspicion > 2) {
    const frac = g.suspicion / 100;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 18, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = frac < 0.55 ? '#ffd24d' : '#ff5a45';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
  // "?" while suspicious, "!" while chasing.
  if (g.mode === 'alerted') {
    ctx.fillStyle = '#ff5a45';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, -28);
  } else if (g.suspicion >= 55) {
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, -28);
  }
  ctx.restore();
}

function drawPlayer(ctx, game, t) {
  const p = game.player;
  const bob = p.moving ? Math.sin(p.stepPhase) * 1.5 : Math.sin(t * 2) * 0.8;
  ctx.save();
  ctx.translate(p.x, p.y + bob * 0.3);
  // Soft shadow under Wren.
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cloak: teal hood, darker when sneaking.
  ctx.fillStyle = p.sneaking ? '#0f5a52' : '#159a8c';
  ctx.beginPath();
  ctx.arc(0, 0, p.sneaking ? 9.5 : 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0b3d38';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Hood point and face shadow.
  ctx.fillStyle = '#0b3d38';
  ctx.beginPath();
  ctx.moveTo(Math.cos(p.angle) * 11, Math.sin(p.angle) * 11);
  ctx.lineTo(Math.cos(p.angle + 2.5) * 7, Math.sin(p.angle + 2.5) * 7);
  ctx.lineTo(Math.cos(p.angle - 2.5) * 7, Math.sin(p.angle - 2.5) * 7);
  ctx.closePath();
  ctx.fill();
  // Eyes: two pale dots that catch the light.
  const ex = Math.cos(p.angle);
  const ey = Math.sin(p.angle);
  const px = -ey;
  const py = ex;
  ctx.fillStyle = '#eafff1';
  ctx.beginPath();
  ctx.arc(ex * 3 + px * 3.5, ey * 3 + py * 3.5, 1.6, 0, Math.PI * 2);
  ctx.arc(ex * 3 - px * 3.5, ey * 3 - py * 3.5, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Sneak indicator: a dotted ring while crouched.
  if (p.sneaking) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 230, 255, 0.6)';
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Noise ring while running loud.
  if (game.noisePulse) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(game.noisePulse.x, game.noisePulse.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// --- HUD -------------------------------------------------------------------

function drawHud(ctx, game) {
  ctx.save();
  // Top bar.
  ctx.fillStyle = 'rgba(8, 11, 20, 0.85)';
  ctx.fillRect(0, 0, VIEW_W, 34);
  ctx.fillStyle = '#e8ecf5';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${game.levelIndex + 1}/3  ${game.level.name}`, 12, 18);
  // Relics.
  let rx = 300;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#9fb2d8';
  ctx.fillText('MOONSHARDS', rx, 18);
  rx += 92;
  game.relics.forEach((r, i) => {
    ctx.save();
    ctx.translate(rx + i * 22, 17);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = r.taken ? '#8fe8ff' : 'rgba(143,232,255,0.25)';
    ctx.strokeStyle = r.taken ? '#e8fbff' : 'rgba(232,251,255,0.4)';
    ctx.lineWidth = 1;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
  });
  // Detection meter.
  const mx = 560;
  ctx.fillStyle = '#9fb2d8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('SEEN', mx, 18);
  const s = game.maxSuspicion / 100;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  rr(ctx, mx + 46, 10, 130, 14, 7);
  ctx.fill();
  ctx.fillStyle = s < 0.55 ? '#4fc46a' : s < 0.85 ? '#ffd24d' : '#ff5a45';
  if (s > 0.01) {
    rr(ctx, mx + 46, 10, 130 * s, 14, 7);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  rr(ctx, mx + 46, 10, 130, 14, 7);
  ctx.stroke();
  // Time, score, alerts.
  ctx.fillStyle = '#e8ecf5';
  ctx.textAlign = 'right';
  ctx.fillText(`TIME ${fmtTime(game.totalTime)}`, 800, 18);
  ctx.fillText(`SCORE ${game.score}`, 948, 18);
  // Bottom hint bar.
  ctx.fillStyle = 'rgba(8, 11, 20, 0.75)';
  ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26);
  ctx.fillStyle = '#9fb2d8';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('WASD / arrows — move      SHIFT — sneak (slow, quiet, half as visible)      R — restart      M — mute      P — pause', 12, VIEW_H - 13);
  ctx.textAlign = 'right';
  ctx.fillText(game.exitOpen ? 'SKYLIGHT OPEN — GO!' : `${game.relicsLeft} moonshard${game.relicsLeft === 1 ? '' : 's'} to go`, VIEW_W - 12, VIEW_H - 13);
  // Message line, fading.
  if (game.message) {
    const age = game.totalTime - game.messageAt;
    const alpha = age < 4 ? 1 : Math.max(0, 1 - (age - 4) / 1.5);
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd682';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(game.message, VIEW_W / 2, 58);
      ctx.restore();
    }
  }
  ctx.restore();
}

// --- screens ---------------------------------------------------------------

function panel(ctx, title, lines, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 9, 17, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = accent;
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, VIEW_W / 2, 210);
  ctx.fillStyle = '#e8ecf5';
  ctx.font = '18px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, 280 + i * 30);
  });
  ctx.restore();
}

function drawTitle(ctx, game, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 9, 17, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // A moon.
  const glow = ctx.createRadialGradient(760, 110, 10, 760, 110, 90);
  glow.addColorStop(0, 'rgba(240, 244, 255, 0.9)');
  glow.addColorStop(0.25, 'rgba(220, 230, 255, 0.35)');
  glow.addColorStop(1, 'rgba(220, 230, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(760, 110, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f5ff';
  ctx.beginPath();
  ctx.arc(760, 110, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dfe6f5';
  ctx.beginPath();
  ctx.arc(748, 100, 7, 0, Math.PI * 2);
  ctx.arc(772, 122, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd682';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('A MOONLIT GALLERY HEIST', VIEW_W / 2, 150);
  ctx.fillStyle = '#f2f5ff';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('GILDED SHADOW', VIEW_W / 2, 215);
  ctx.fillStyle = '#b9c6de';
  ctx.font = '17px sans-serif';
  ctx.fillText('You are Wren, the whisper-thief. Three moonshards sleep in every gallery,', VIEW_W / 2, 268);
  ctx.fillText('and the night wardens walk their rounds with lanterns. Stay out of the light,', VIEW_W / 2, 292);
  ctx.fillText('hide behind crates and statues, and slip out through the skylight unseen.', VIEW_W / 2, 316);
  ctx.fillStyle = '#8fe8ff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('WASD / arrows — move      SHIFT — sneak      R — restart      M — mute      P — pause', VIEW_W / 2, 372);
  ctx.fillStyle = '#e8ecf5';
  ctx.font = '15px sans-serif';
  ctx.fillText('Sneaking is slow and quiet — wardens spot you half as fast,', VIEW_W / 2, 402);
  ctx.fillText('and shadow tiles hide you further. Running is loud: they will come and listen.', VIEW_W / 2, 424);
  const blink = 0.55 + 0.45 * Math.sin(t * 3);
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ffd682';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Press ENTER to begin the heist', VIEW_W / 2, 500);
  ctx.restore();
  ctx.fillStyle = '#7c8aa8';
  ctx.font = '13px sans-serif';
  ctx.fillText('3 galleries · steal every moonshard · reach the skylight · never get caught', VIEW_W / 2, 560);
  ctx.restore();
}

function drawCaught(ctx, game) {
  panel(ctx, 'CAUGHT!', [
    'A warden laid a hand on your shoulder.',
    `You had stolen ${game.relics.filter((r) => r.taken).length} of ${game.relics.length} moonshards in ${game.level.name}.`,
    '',
    'Press R to try this gallery again — or ENTER for the title screen.',
  ], '#ff5a45');
}

function drawLevelDone(ctx, game) {
  const bonus = game.levelScore - 1000 - game.relics.length * 250;
  panel(ctx, 'GALLERY CLEARED', [
    `${game.level.name} — slipped out unseen.`,
    `Gallery score: ${game.levelScore}   (time bonus ${bonus >= 0 ? '+' : ''}${bonus})`,
    `Total score: ${game.score}      Time: ${fmtTime(game.totalTime)}`,
    '',
    'Press ENTER for the next gallery.',
  ], '#7fe0a8');
}

function drawWon(ctx, game) {
  panel(ctx, 'THE HEIST IS DONE', [
    'Three galleries. Nine moonshards. Not once caught in the light.',
    `Final score: ${game.score}      Time: ${fmtTime(game.totalTime)}      Alarms raised: ${game.alerts}`,
    '',
    'Press ENTER to play again.',
  ], '#ffd682');
}

function drawPaused(ctx, game) {
  panel(ctx, 'PAUSED', [
    'The wardens wait. Take a breath.',
    '',
    'Press P or ESC to resume the heist.',
  ], '#ffd682');
}

// --- entry point -----------------------------------------------------------

export function drawGame(ctx, game, t) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (game.state === 'title') {
    drawFloor(ctx, game, t);
    drawCoverAndWalls(ctx, game);
    drawTitle(ctx, game, t);
    return;
  }
  drawFloor(ctx, game, t);
  drawPatrolRoutes(ctx, game);
  drawExit(ctx, game, t);
  drawRelics(ctx, game, t);
  for (const g of game.guards) drawVisionCone(ctx, g, t);
  drawCoverAndWalls(ctx, game);
  drawPlayer(ctx, game, t);
  for (const g of game.guards) drawGuard(ctx, g, t);
  drawHud(ctx, game);
  if (game.state === 'caught') drawCaught(ctx, game);
  else if (game.state === 'levelDone') drawLevelDone(ctx, game);
  else if (game.state === 'won') drawWon(ctx, game);
  if (game.paused) drawPaused(ctx, game);
}
