// levels.js — the three galleries of Gilded Shadow.
//
// Every level is a grid of tiles, 30 columns by 20 rows, written as strings.
// Legend:
//   '#'  wall — blocks movement and sight
//   '.'  floor
//   ','  shadow floor — darkness; wardens spot you half as fast here
//   'C'  crate — tall cover, blocks movement and sight
//   'H'  statue — tall cover, blocks movement and sight
//   'R'  moonshard relic (collect all three to unlock the exit)
//   'E'  skylight exit (locked until every relic is taken)
//   'P'  where Wren starts
//
// Guards are defined separately as patrol routes in tile coordinates; the
// engine checks every waypoint sits on walkable floor and that each leg of a
// route is a straight, unblocked walk.

export const TILE = 32;
export const COLS = 30;
export const ROWS = 20;

export const LEVELS = [
  {
    name: 'The Gilded Gallery',
    subtitle: 'Three moonshards. Two wardens. Learn their walk.',
    map: [
      '##############################',
      '#P....,.......#......R.......#',
      '#.....C.......#..............#',
      '#.............#......C.......#',
      '#..C.....,....#..............#',
      '#.............#......R.......#',
      '######..#######.########.#####',
      '#.............#..............#',
      '#..R....C.....#....C.....,...#',
      '#.............#..............#',
      '#..C.....,....#......C.......#',
      '#.............#..............#',
      '#.#############.########.#####',
      '#............................#',
      '#...C........C......C.....E..#',
      '#............................#',
      '#................,...........#',
      '#............................#',
      '#............................#',
      '##############################',
    ],
    guards: [
      { path: [[5, 1], [13, 1], [13, 5], [5, 5]], speed: 52, pause: 1.4 },
      { path: [[16, 15], [27, 15], [27, 17], [16, 17]], speed: 52, pause: 1.4 },
    ],
    par: 75,
  },
  {
    name: 'The Moonlit Courtyard',
    subtitle: 'Three wardens now, and the hedges have ears.',
    map: [
      '##############################',
      '#P....,......C.......R.......#',
      '#.....H.......#..............#',
      '#.............#......C...,...#',
      '#..C.....,....#..............#',
      '#.............#......R.......#',
      '#####.#########.#########.####',
      '#.............#......,.......#',
      '#..R....C.....#....C.........#',
      '#.............#..............#',
      '#..C.....,....#......C.......#',
      '#.............#..............#',
      '#.############.######.########',
      '#............................#',
      '#...C.....H........C....E....#',
      '#......,.....................#',
      '#.........C.............,....#',
      '#............................#',
      '#.....................C......#',
      '##############################',
    ],
    guards: [
      { path: [[5, 1], [12, 1], [12, 5], [5, 5]], speed: 58, pause: 1.1 },
      { path: [[16, 7], [27, 7], [27, 9], [16, 9]], speed: 58, pause: 1.1 },
      { path: [[2, 15], [13, 15], [13, 13], [2, 13]], speed: 58, pause: 1.1 },
    ],
    par: 95,
  },
  {
    name: 'The Vault of Echoes',
    subtitle: 'Four wardens, quick feet, and nowhere to linger.',
    map: [
      '##############################',
      '#P....,......C.......R.......#',
      '#.....H.......#..............#',
      '#.............#......C...,...#',
      '#..C.....,....#..............#',
      '#.............#......R.......#',
      '#####.#########.#########.####',
      '#.............#......,.......#',
      '#..R....C.....#....C....H....#',
      '#.............#..............#',
      '#..C.....,....#......C.......#',
      '#.............#..............#',
      '#.############.######.########',
      '#............................#',
      '#...C.....H........C....E....#',
      '#......,.....................#',
      '#.........C.............,....#',
      '#..H.........................#',
      '#.....................C......#',
      '##############################',
    ],
    guards: [
      { path: [[5, 1], [12, 1], [12, 5], [5, 5]], speed: 66, pause: 0.9 },
      { path: [[16, 7], [27, 7], [27, 9], [16, 9]], speed: 66, pause: 0.9 },
      { path: [[2, 15], [13, 15], [13, 13], [2, 13]], speed: 66, pause: 0.9 },
      { path: [[16, 15], [27, 15]], speed: 66, pause: 0.9 },
    ],
    par: 110,
  },
];

// Tile helpers shared by the engine and the renderer.

export function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return level.map[ty][tx];
}

export function isSolidTile(ch) {
  return ch === '#' || ch === 'C' || ch === 'H';
}

export function blocksSightTile(ch) {
  return ch === '#' || ch === 'C' || ch === 'H';
}

export function isShadowTile(ch) {
  return ch === ',';
}

// Parse a level's map into the pieces the engine works with.
export function parseLevel(level) {
  const relics = [];
  let playerStart = { x: 1.5 * TILE, y: 1.5 * TILE };
  let exit = { x: 28.5 * TILE, y: 14.5 * TILE };
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = level.map[y][x];
      if (ch === 'R') relics.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, taken: false });
      if (ch === 'P') playerStart = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
      if (ch === 'E') exit = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    }
  }
  return { relics, playerStart, exit };
}

// Flood fill from the player start over walkable tiles. Used by the test
// harness to prove every relic and the exit can actually be reached.
export function reachableTiles(level) {
  const { playerStart } = parseLevel(level);
  const sx = Math.floor(playerStart.x / TILE);
  const sy = Math.floor(playerStart.y / TILE);
  const seen = new Set([sx + ',' + sy]);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = nx + ',' + ny;
      if (seen.has(key)) continue;
      if (isSolidTile(tileAt(level, nx, ny))) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  return seen;
}
