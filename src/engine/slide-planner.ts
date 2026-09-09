/**
 * The shared planner for sliding-permutation games (Sixteen, Netslide).
 *
 * A sliding-permutation game is: a toroidal grid of pieces; a move slides one
 * whole line by some displacement, wrapping around; the board is finished when
 * the pieces show the right picture. Everything a *player* cares about — what
 * the pieces mean, what counts as finished, how to talk about a move — is the
 * game's. The search is not, and it is the hard part, so it lives here.
 *
 * The planner works on **the board as the player sees it**: one integer per
 * cell, whatever the game wants that integer to mean (Sixteen's tile numbers,
 * Netslide's wire masks). It never needs to know which *particular* piece is
 * which, and deliberately so — Netslide's tiles include many identical wires, so
 * two boards showing the same picture are the same position, and treating them
 * as different would have the search chasing arrangements no sequence of slides
 * can even produce.
 *
 * What it owns:
 *
 * - **A bucket-queue A\*** over the move set, with lazy node allocation. `f = g +
 *   h` is a small integer, so a bucket per `f` beats a comparison heap.
 * - **An exact bidirectional BFS** that returns a genuinely *shortest* path, and
 *   runs on every board before the heuristic does. A shortest plan is what makes
 *   a hint the player keeps re-asking for arrive rather than cycle; running it
 *   unconditionally is what makes that a guarantee rather than a hope. See
 *   `exactSearch`, which is also where the two gates that were tried and cycled
 *   are recorded.
 * - **A deeper last resort** for the boards that search cannot reach, bounded by
 *   depth rather than by stored states: a kept endgame database of the goal side
 *   and a depth-first walk of the board side, which costs time instead of
 *   memory. See `deepSearch`, and the one-ply rule that makes gating it safe.
 * - **Partial plans.** A search that improved on the starting board without
 *   reaching the goal returns the path to its best board. The plan runs out, the
 *   player is closer, and the next request recomputes.
 */

/**
 * One slide of a whole line, wrapping around.
 *
 * **`delta` is how far a piece travels**, not how far the line's contents are
 * read from: `{ axis: "row", index: 2, delta: +1 }` moves every piece of row 2
 * one cell to the right, and the rightmost piece wraps to the left. A game whose
 * own move type reads the other way round (Netslide's `dir` names the direction
 * the border *arrow* points, which shifts the contents the opposite way) negates
 * on the way in.
 */
export interface SlideMove {
  axis: "row" | "col";
  index: number;
  delta: number;
}

/** The problem the planner is handed. */
export interface SlidePuzzle {
  w: number;
  h: number;
  /** The board, row-major: one integer per cell, as the player sees it. */
  start: Int32Array;
  /** The finished board, in the same encoding. */
  goal: Int32Array;
  /** Every legal move. Both consumers have a state-independent move set — the
   * lines a game may slide never change mid-game — so this is a plain list. */
  moves: readonly SlideMove[];
  /**
   * How far a board is from finished. Nothing is assumed of it beyond being a
   * non-negative integer that is zero at `goal`; it steers the A\* and nothing
   * else, so a game is free to make it as sharp as it can afford.
   *
   * One warning, learned the hard way. It is tempting to fix a target *once* —
   * decide up front which piece is going to end up where, then measure the total
   * distance to that arrangement. For a game with interchangeable pieces this
   * quietly poisons the search: the further the board drifts from the one the
   * target was chosen on, the cheaper some *other* arrangement becomes, and the
   * frozen target starts reporting progress on moves that visibly make the
   * picture worse. Measure the board in front of you.
   */
  heuristic: (board: Int32Array) => number;
  /**
   * Finished? Defaults to "the board equals `goal`". A game whose win condition
   * is weaker (Netslide wins on *any* arrangement that powers every tile, not
   * only the one the generator drew) supplies its own, and the planner stops the
   * moment it holds.
   */
  isGoal?: (board: Int32Array) => boolean;
  /** Veto a candidate *first* move — used to refuse to undo the slide the player
   * just made, which is both useless advice and the shape a hint ping-pong
   * takes. */
  rejectFirstMove?: (m: SlideMove) => boolean;
  /** Forward-search budget, in nodes expanded. */
  maxStates?: number;
  /**
   * The exact bidirectional search, which runs on **every** board before the
   * heuristic does, falling through to it when the ends do not meet inside the
   * budget. Omit it to disable it; a game decides only whether it can afford
   * one, never when to spend it.
   *
   * The reason to want it is not that the plan comes out shorter. **A shortest
   * plan is what stops a recomputed plan from cycling:** its first move provably
   * shortens the true distance to the goal by one, so a hint recomputed after
   * every move walks a strictly decreasing distance and must arrive. A heuristic
   * plan carries no such guarantee, and near the finish it demonstrably loops —
   * Netslide was found sending a board five slides of the same row, each
   * separately scoring as progress, back to exactly where it started.
   *
   * **On every board is not a missing optimization — it is the guarantee.** It
   * is tempting to hold this search back for the boards that need it: run the
   * cheap heuristic first and reach for the exact search only where the
   * heuristic proves helpless, or arm it only once the board *looks* nearly
   * finished. Both break the guarantee in a way that is very hard to see, and
   * both were measured breaking it here.
   *
   * The reason is that **a shortest plan does not look like progress on the way
   * home**. Sixteen's endgame is the worked example: a 5×5 plan starting 9 tiles
   * out of place, with the tiles a total of 9 slides from their homes, peaks at
   * 17 and 30 on those two measures before it arrives. So a gate keyed on either
   * of them switches off partway down the descent it just opened, the heuristic
   * takes back over, and it walks the board straight back to where it started —
   * a period-4 cycle that no budget and no depth would have removed. **The
   * search that opens a descent must be the one that finishes it**, and the only
   * way to be sure of that is for it to be the one that always runs.
   *
   * What that costs is a search on boards far too far away to reach, which come
   * back empty having spent the whole budget. That is the price of the
   * guarantee, and it is why the budget wants to be the smallest one that still
   * crosses the game's worst endgame rather than the largest one affordable.
   */
  exactSearch?: {
    maxDepth: number;
    maxStates: number;
  };
  /**
   * A deeper last resort, for the boards `exactSearch` cannot reach.
   *
   * It runs **only where the heuristic search is helpless too** — a strict local
   * minimum, past `exactSearch`'s reach — which is a gate, and gating a search
   * is the defect the comment above exists to explain. So it is worth being
   * precise about why this gate is a different thing.
   *
   * **A gated search is safe when an ungated one covers everything it hands off
   * to.** This one reaches exactly one ply further than `exactSearch`, so a plan
   * it opens is at most one move longer than `exactSearch` can finish; play that
   * first move and the remainder is `exactSearch`'s, on every board, because
   * `exactSearch` is ungated. The old defect was the mirror image: the only
   * exact search *was* the gated one, so when the gate shut there was nothing
   * beneath it but the heuristic, and the heuristic walked the board back to
   * where it started.
   *
   * **Keep that one ply.** Reaching two plies further would leave a board the
   * ungated search cannot finish, the gate would shut on it, and the cycle would
   * be back — with a bigger budget making it harder to see rather than easier.
   *
   * **Why it is shaped differently.** `exactSearch` is bounded by states because
   * it stores every board it visits, and that is what stops it reaching further:
   * one more ply on a 5×5 Sixteen board is 18–24 million states, some 10 s and
   * the better part of a gigabyte. This one is bounded by *depth* because it
   * stores almost nothing — a breadth-first **endgame database** of every board
   * within `databaseDepth` of the goal, which is the same for every hint of a
   * given puzzle and is built once and kept, and then a plain depth-first walk
   * `forwardDepth` deep from the board, which holds one board and its path.
   * Memory stops being the constraint; time becomes it, and time is the one you
   * can spend once.
   *
   * It finds a shortest plan of up to `forwardDepth + databaseDepth` moves, and
   * nothing beyond. Choosing the split is a memory-for-time trade: the database
   * grows about 27× per ply and the walk about 36× per ply, so the deepest
   * affordable database and the shallowest walk that covers the gap is the shape
   * to want.
   */
  deepSearch?: {
    /** Plies walked forward from the board, depth-first, storing nothing. */
    forwardDepth: number;
    /** Plies of the goal-side database, held between hints. */
    databaseDepth: number;
  };
}

export interface SlidePlan {
  /** The planned moves. Empty when the start is already the goal, or when the
   * search found nothing better than standing still. */
  moves: SlideMove[];
  /** Whether `moves` ends at the goal, as opposed to at the best board the
   * search reached inside its budget (a partial plan). */
  reachedGoal: boolean;
}

/** Shortest distance between two positions on a wrap-around axis of length
 * `len`. */
export function toroidalDist(from: number, to: number, len: number): number {
  const d = Math.abs(from - to);
  return Math.min(d, len - d);
}

/** Apply `move` to `src`, writing the result into `dest`. The two must not
 * alias. */
export function slidePieces(
  src: Int32Array,
  dest: Int32Array,
  w: number,
  h: number,
  move: SlideMove,
): void {
  const { axis, index, delta } = move;
  dest.set(src);

  if (axis === "row") {
    const offset = index * w;
    for (let x = 0; x < w; x++) {
      const from = (((x - delta) % w) + w) % w;
      dest[offset + x] = src[offset + from];
    }
  } else {
    for (let y = 0; y < h; y++) {
      const from = (((y - delta) % h) + h) % h;
      dest[y * w + index] = src[from * w + index];
    }
  }
}

/** How many bits one cell's value needs. */
function cellBits(maxValue: number): number {
  let bits = 1;
  while (1 << bits <= maxValue) bits++;
  return bits;
}

/**
 * A collision-free string key for a board of small integers, packed several cells
 * to a character.
 *
 * The search visits hundreds of thousands of boards for one hint and keys every
 * one of them, so this is genuinely the hot path: the obvious
 * one-character-per-cell version spends most of a hint building and hashing
 * 25-character strings. Packing to the cell's actual bit width (four bits for a
 * Netslide wire mask, five for a Sixteen tile) cuts that by roughly three.
 *
 * Fifteen bits per character, deliberately — it keeps every code unit well below
 * the surrogate range, so the string stays a plain sequence of BMP characters.
 */
function makeKeyFn(maxValue: number, cells: number): (arr: Int32Array) => string {
  const bits = cellBits(maxValue);
  const perChar = Math.max(1, Math.floor(15 / bits));

  return (arr: Int32Array): string => {
    let key = "";
    for (let i = 0; i < cells; ) {
      let packed = 0;
      for (let k = 0; k < perChar && i < cells; k++, i++) {
        packed |= arr[i] << (k * bits);
      }
      key += String.fromCharCode(packed);
    }
    return key;
  };
}

function invert(m: SlideMove): SlideMove {
  return { ...m, delta: -m.delta };
}

/**
 * Do two slides of the *same* line always compose into one legal slide?
 *
 * Where they do, a shortest path can never contain two slides of one line
 * inside a run of same-axis moves — the two would collapse into one move, or
 * cancel outright, and the path would not have been shortest. That lets the
 * canonical ordering below insist on *strictly* increasing indices within a run
 * rather than merely non-decreasing ones, which is worth about a third of the
 * search.
 *
 * **Derived from the move set the game already hands over, never declared.**
 * Sixteen offers every rotation of a line (deltas 1…w−1), which is closed under
 * addition, so the rule applies. Netslide offers single steps only, so `+1`
 * twice is a legitimate part of a shortest path and `+2` is not a move it could
 * be replaced by — the rule must not apply, and does not. A game that changed
 * its move set would change this answer in the same commit, with nothing to
 * remember to update.
 */
function sameLineMovesCompose(
  moves: readonly SlideMove[],
  w: number,
  h: number,
): boolean {
  const lines = new Map<string, { len: number; deltas: Set<number> }>();
  for (const m of moves) {
    const len = m.axis === "row" ? w : h;
    const key = `${m.axis}${m.index}`;
    let line = lines.get(key);
    if (!line) {
      line = { len, deltas: new Set() };
      lines.set(key, line);
    }
    line.deltas.add(((m.delta % len) + len) % len);
  }
  for (const { len, deltas } of lines.values()) {
    for (const a of deltas) {
      for (const b of deltas) {
        const sum = (a + b) % len;
        if (sum !== 0 && !deltas.has(sum)) return false;
      }
    }
  }
  return true;
}

/**
 * A board squeezed into a handful of 31-bit words, and hashed.
 *
 * The exact search below is the expensive half of a hint and it now runs on
 * *every* board rather than only on the ones the heuristic gave up on (see
 * `exactSearch`), so what it costs per board is the constraint on the whole
 * design. Measured on Sixteen 5×5, one board through the obvious
 * string-key-in-a-`Map` route costs about 2 µs, and a search that crosses the
 * endgame visits two million of them: four to six seconds, per hint. The same
 * search on the storage below is a little under one second, because a board
 * stops being an object at all — five words in a shared pool, addressed by
 * index.
 *
 * Thirty-one bits per word, not thirty-two: a cell is never allowed to straddle
 * a word boundary (the packing arithmetic is then a shift and a mask, with no
 * carry), and the top bit is left alone so a word never comes back negative.
 * Five bits a cell for a Sixteen tile, four for a Netslide wire mask.
 *
 * `pack` leaves the packed board in `buf`, which `SearchSide.find` and
 * `SearchSide.add` read from — **one buffer, no allocation per successor**,
 * which is the point. The two sides of the search share one packer, and never
 * hold a packed board across a `pack` call.
 */
class BoardPacker {
  /** How many words one board occupies. */
  readonly words: number;
  /** The board `pack` was last given. */
  readonly buf: Int32Array;
  private readonly perWord: number;
  private readonly mask: number;

  constructor(
    private readonly bits: number,
    cells: number,
  ) {
    this.perWord = Math.max(1, Math.floor(31 / bits));
    this.words = Math.ceil(cells / this.perWord);
    this.mask = (1 << bits) - 1;
    this.buf = new Int32Array(this.words);
  }

  /** Pack `board` into `buf` and return its hash (FNV-1a over the words). */
  pack(board: Int32Array): number {
    // Hoisted one by one rather than destructured: biome's unused-private-member
    // rule does not count a read through `const { … } = this`, and a suppression
    // to buy back the shorter line would be hiding the measurement rather than
    // satisfying it.
    const buf = this.buf;
    const bits = this.bits;
    const perWord = this.perWord;
    buf.fill(0);
    for (let i = 0; i < board.length; i++) {
      buf[(i / perWord) | 0] |= board[i] << ((i % perWord) * bits);
    }
    return hashWords(buf, 0, buf.length);
  }

  /** The reverse, out of a pool: `words[offset …]` back into `out`. */
  unpack(words: Int32Array, offset: number, out: Int32Array): void {
    const bits = this.bits;
    const perWord = this.perWord;
    const mask = this.mask;
    for (let i = 0; i < out.length; i++) {
      out[i] = (words[offset + ((i / perWord) | 0)] >>> ((i % perWord) * bits)) & mask;
    }
  }
}

function hashWords(words: Int32Array, offset: number, count: number): number {
  let hash = 0x811c9dc5;
  for (let k = 0; k < count; k++) {
    hash ^= words[offset + k];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One end of the bidirectional search: every board it has reached, in the order
 * it reached them, with an open-addressed index for "have I seen this board?".
 *
 * Nodes are appended level by level, so a level's frontier is simply the
 * contiguous index range the previous level appended — there is no frontier
 * array, and no per-node object anywhere.
 *
 * `parent`, `move` and `depth` are read by the path reconstruction and are
 * deliberately public. `move` is an index into the puzzle's move list, `-1` at
 * the root; for the backward side it is the move as the *search* applied it,
 * which the reconstruction inverts to read the path forwards.
 *
 * Memory, since the caller's `maxStates` is what bounds it: a node costs
 * `words` + 3 words in the pools, plus up to two slots in the index, so a
 * 2.5-million-state Sixteen search peaks around 200 MB across both sides —
 * a third of what the same search cost as objects and string keys.
 */
class SearchSide {
  count = 0;
  parent: Int32Array;
  move: Int32Array;
  depth: Int32Array;
  private boards: Int32Array;
  private capacity = 1 << 12;
  /** Slot → node index + 1; 0 means empty. Linear probing, grown at half full. */
  private table = new Int32Array(1 << 13);
  private mask = this.table.length - 1;

  constructor(
    private readonly packer: BoardPacker,
    root: Int32Array,
  ) {
    this.boards = new Int32Array(this.capacity * packer.words);
    this.parent = new Int32Array(this.capacity);
    this.move = new Int32Array(this.capacity);
    this.depth = new Int32Array(this.capacity);
    this.add(packer.pack(root), -1, -1, 0);
  }

  /** The node holding the packer's current board, or -1. */
  find(hash: number): number {
    const { buf, words } = this.packer;
    for (let slot = hash & this.mask; ; slot = (slot + 1) & this.mask) {
      const entry = this.table[slot];
      if (entry === 0) return -1;
      const base = (entry - 1) * words;
      let same = true;
      for (let k = 0; k < words; k++) {
        if (this.boards[base + k] !== buf[k]) {
          same = false;
          break;
        }
      }
      if (same) return entry - 1;
    }
  }

  /** Append the packer's current board, and return its index. */
  add(hash: number, parent: number, move: number, depth: number): number {
    if (this.count === this.capacity) this.growPools();
    if (this.count * 2 >= this.table.length) this.growTable();

    const { buf, words } = this.packer;
    const index = this.count++;
    const base = index * words;
    for (let k = 0; k < words; k++) this.boards[base + k] = buf[k];
    this.parent[index] = parent;
    this.move[index] = move;
    this.depth[index] = depth;
    this.insert(hash, index);
    return index;
  }

  private insert(hash: number, index: number): void {
    let slot = hash & this.mask;
    while (this.table[slot] !== 0) slot = (slot + 1) & this.mask;
    this.table[slot] = index + 1;
  }

  /** Board `index` back into `out`. */
  unpack(index: number, out: Int32Array): void {
    this.packer.unpack(this.boards, index * this.packer.words, out);
  }

  private growPools(): void {
    this.capacity *= 2;
    const boards = new Int32Array(this.capacity * this.packer.words);
    boards.set(this.boards);
    this.boards = boards;
    this.parent = grown(this.parent, this.capacity);
    this.move = grown(this.move, this.capacity);
    this.depth = grown(this.depth, this.capacity);
  }

  private growTable(): void {
    this.table = new Int32Array(this.table.length * 2);
    this.mask = this.table.length - 1;
    const { words } = this.packer;
    for (let i = 0; i < this.count; i++) {
      this.insert(hashWords(this.boards, i * words, words), i);
    }
  }
}

function grown(from: Int32Array, length: number): Int32Array {
  const to = new Int32Array(length);
  to.set(from);
  return to;
}

/**
 * Exact bidirectional BFS from the board to the finished one: expand level by
 * level from both ends, always growing the smaller frontier, until the two
 * visited sets meet. Returns a **shortest** move path, or null when the ends do
 * not meet within the depth/state caps.
 *
 * *Shortest* is load-bearing, not a nicety, and it is the one thing here that is
 * easy to get subtly wrong: **finish the level before answering.** A meet
 * stumbled on midway through expanding a level is a path, but not necessarily
 * the cheapest one that level offers — the node it met may sit deeper in the
 * backward tree than another meet the same level would have turned up. A path
 * one move too long silently destroys the guarantee this search exists to
 * provide: its first move no longer has to shorten the distance to the goal, and
 * a plan recomputed after every move can then cycle for ever.
 */
function bidirectionalPlan(
  p: SlidePuzzle,
  caps: { maxDepth: number; maxStates: number },
): SlideMove[] | null {
  const { w, h, start, goal, moves } = p;
  const n = start.length;

  /**
   * Would this move, played after `prev`, only ever re-tread a board some other
   * ordering already reaches?
   *
   * Slides of the *same axis* commute — sliding row 0 and then row 3 lands
   * exactly where sliding row 3 and then row 0 does — so a plain breadth-first
   * search generates every permutation of a run of row-slides and throws all but
   * one away. Insisting that a run of same-axis moves goes in non-decreasing
   * index order keeps exactly one representative of each, and loses nothing: any
   * shortest path can be reordered into that form, because the moves it reorders
   * commute. It is a large saving — this search is the expensive half of a hint —
   * and it is what lets the budget reach far enough to cross an endgame with two
   * tiles swapped.
   *
   * The same-line immediate undo goes too. A shortest path never contains one:
   * it would be shorter without it.
   *
   * And where a game's slides of one line **compose** — Sixteen's do, Netslide's
   * do not, and `sameLineMovesCompose` reads which off the move set — the
   * ordering tightens from non-decreasing to strictly increasing, because two
   * slides of one line inside a run would collapse into a single move and the
   * path would not have been shortest. Worth about a third of the search, which
   * is what makes the deep search below affordable.
   *
   * **Both halves of the search may prune this way**, even though the rule reads
   * as a statement about a whole path. A run straddling the meet is split into
   * a prefix the forward side sees and a suffix the backward side sees reversed;
   * the run's moves all commute and now have distinct indices, so putting the
   * smallest of them in the prefix (ascending) and the rest in the suffix
   * (descending, which is ascending read backwards) is always possible. Neither
   * side ever looks across the meet, so neither is constrained by the other.
   */
  const strict = sameLineMovesCompose(moves, w, h);
  const redundant = (prevMove: number, mi: number): boolean => {
    if (prevMove < 0) return false;
    const prev = moves[prevMove];
    const m = moves[mi];
    if (prev.axis !== m.axis) return false;
    if (m.index < prev.index) return true;
    if (m.index !== prev.index) return false;
    return strict || m.delta === -prev.delta;
  };

  let maxValue = 0;
  for (let i = 0; i < n; i++) {
    if (start[i] > maxValue) maxValue = start[i];
    if (goal[i] > maxValue) maxValue = goal[i];
  }
  const packer = new BoardPacker(cellBits(maxValue), n);
  const fwd = new SearchSide(packer, start);
  const bwd = new SearchSide(packer, goal);

  const node = new Int32Array(n);
  const scratch = new Int32Array(n);
  let fwdFrom = 0;
  let bwdFrom = 0;
  let fwdDepth = 0;
  let bwdDepth = 0;

  /** The path start→goal through a board present on both sides: the forward
   * parent chain (reversed), then the backward chain's moves read the other way
   * round — read forward, a backward edge runs successor --inv(move)--> node. */
  const joinPaths = (meetFwd: number, meetBwd: number): SlideMove[] => {
    const path: SlideMove[] = [];
    for (let i = meetFwd; i >= 0 && fwd.move[i] >= 0; i = fwd.parent[i]) {
      path.push(moves[fwd.move[i]]);
    }
    path.reverse();
    for (let i = meetBwd; i >= 0 && bwd.move[i] >= 0; i = bwd.parent[i]) {
      path.push(invert(moves[bwd.move[i]]));
    }
    return path;
  };

  while (fwdDepth + bwdDepth < caps.maxDepth) {
    const fwdSize = fwd.count - fwdFrom;
    const bwdSize = bwd.count - bwdFrom;
    if (fwdSize === 0 || bwdSize === 0) break;

    const forward = fwdSize <= bwdSize;
    const side = forward ? fwd : bwd;
    const other = forward ? bwd : fwd;
    const from = forward ? fwdFrom : bwdFrom;
    // The frontier is the level just appended, so it is the contiguous index
    // range [from, count) — read once, before this level starts appending to it.
    const until = side.count;
    const depth = (forward ? fwdDepth : bwdDepth) + 1;

    // Collect every meet this level turns up, so the cheapest can be taken once
    // the level is done (see the note above — this is what makes it shortest).
    let bestFwd = -1;
    let bestBwd = -1;
    let bestTotal = Number.POSITIVE_INFINITY;

    for (let ni = from; ni < until; ni++) {
      // The budget is enforced *inside* the level, not merely between levels. One
      // level expands to many times the frontier, so a frontier already near the
      // cap balloons far past it before anyone looks again — a single hint was
      // measured taking 13.7 s against a nominal cap it had long since passed.
      // Abandoning mid-level means giving up rather than answering, because a meet
      // found before the level is finished is not guaranteed to be the cheapest,
      // and a path one move too long is worse than no path at all (see above).
      if (fwd.count + bwd.count >= caps.maxStates) return null;

      side.unpack(ni, node);
      const prevMove = side.move[ni];
      for (let mi = 0; mi < moves.length; mi++) {
        if (redundant(prevMove, mi)) continue;

        slidePieces(node, scratch, w, h, moves[mi]);
        const hash = packer.pack(scratch);
        if (side.find(hash) >= 0) continue;
        const added = side.add(hash, ni, mi, depth);

        const met = other.find(hash);
        if (met >= 0 && depth + other.depth[met] < bestTotal) {
          bestTotal = depth + other.depth[met];
          bestFwd = forward ? added : met;
          bestBwd = forward ? met : added;
        }
      }
    }

    if (bestFwd >= 0) return joinPaths(bestFwd, bestBwd);

    if (forward) {
      fwdFrom = until;
      fwdDepth = depth;
    } else {
      bwdFrom = until;
      bwdDepth = depth;
    }
  }
  return null;
}

/**
 * A Zobrist table: one random word per (cell, value).
 *
 * The deep search walks tens of millions of boards and slides each one **in
 * place**, undoing the move on the way back out, so it never copies a board at
 * all. A hash it can update the same way is what makes that pay: a slide
 * re-XORs only the cells of the line it moved, so keying a board costs a dozen
 * operations rather than a pass over every cell.
 */
function zobristTable(cells: number, values: number): Int32Array {
  // A fixed seed and a three-line xorshift, deliberately: a hash collision costs
  // time and never correctness (`find` compares the boards it matches), but a
  // *non-deterministic* one would make the same board produce different plans on
  // different runs, and a hint has to be reproducible. Nothing here needs the
  // project's bit-identical RNG, and reaching for it would tie a search to the
  // library that exists to keep shared game IDs stable.
  let state = 0x9e3779b9;
  const table = new Int32Array(cells * (values + 1));
  for (let i = 0; i < table.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    table[i] = state | 0;
  }
  return table;
}

/**
 * Every board within `depth` slides of the goal, with the way home from each.
 *
 * This is the half of the deep search that costs memory, and the half that is
 * worth keeping: it depends on the goal and the move set and not at all on the
 * board being solved, so one of these serves every hint of a puzzle for as long
 * as the tab is open. Sixteen's goal is the same board for ever, which is what
 * makes the arrangement pay there.
 *
 * Boards are stored packed; the Zobrist hash is stored beside each one so a
 * probe compares a word before it compares a board.
 */
class SlideEndgame {
  readonly zobrist: Int32Array;
  readonly stride: number;
  private readonly packer: BoardPacker;
  private boards: Int32Array;
  private depths: Int8Array;
  private moveOf: Int16Array;
  private parents: Int32Array;
  /** Interleaved [hash, index + 1]; 0 in the second slot means empty. */
  private table = new Int32Array(1 << 14);
  private mask = (1 << 13) - 1;
  private capacity = 1 << 12;
  private count = 0;

  constructor(
    private readonly moves: readonly SlideMove[],
    w: number,
    h: number,
    goal: Int32Array,
    depth: number,
    limit: number,
  ) {
    const n = goal.length;
    let maxValue = 0;
    for (let i = 0; i < n; i++) if (goal[i] > maxValue) maxValue = goal[i];
    this.packer = new BoardPacker(cellBits(maxValue), n);
    this.stride = maxValue + 1;
    this.zobrist = zobristTable(n, maxValue);

    this.boards = new Int32Array(this.capacity * this.packer.words);
    this.depths = new Int8Array(this.capacity);
    this.moveOf = new Int16Array(this.capacity);
    this.parents = new Int32Array(this.capacity);

    const strict = sameLineMovesCompose(moves, w, h);
    const redundant = (prevMove: number, mi: number): boolean => {
      if (prevMove < 0) return false;
      const prev = moves[prevMove];
      const m = moves[mi];
      if (prev.axis !== m.axis) return false;
      if (m.index < prev.index) return true;
      if (m.index !== prev.index) return false;
      return strict || m.delta === -prev.delta;
    };

    this.add(goal, this.hash(goal), -1, -1, 0);
    const node = new Int32Array(n);
    const scratch = new Int32Array(n);
    let from = 0;
    for (let d = 1; d <= depth; d++) {
      const until = this.count;
      for (let ni = from; ni < until; ni++) {
        this.unpack(ni, node);
        for (let mi = 0; mi < moves.length; mi++) {
          if (redundant(this.moveOf[ni], mi)) continue;
          slidePieces(node, scratch, w, h, moves[mi]);
          const hash = this.hash(scratch);
          if (this.find(scratch, hash) >= 0) continue;
          // The pools grow on demand, but a *bound* is still asserted: a
          // database that quietly stopped growing would make the search
          // incomplete while still reporting a plan, which is the failure mode
          // that looks like health. The caller derives the bound from the depth.
          if (this.count === limit) {
            throw new Error(
              `slide endgame database exceeded ${limit} boards at depth ${d}`,
            );
          }
          this.add(scratch, hash, ni, mi, d);
        }
      }
      from = until;
    }
  }

  /**
   * The board's Zobrist hash, as a **signed** 32-bit word.
   *
   * Signed deliberately, and it is not a detail. The hash is stored beside each
   * entry in an `Int32Array`, which narrows it; comparing that stored word
   * against an *unsigned* `>>> 0` form of the same hash then fails for every
   * value with the top bit set — half of them. What makes it worth this comment
   * is that the database does not break when that happens. It goes half blind,
   * and a search that cannot find a nine-move plan looks exactly like a search
   * that cannot reach nine moves. It produced a confident wrong conclusion about
   * this game's endgame until the answer was checked against a referee search
   * that had no hash table in it at all.
   */
  hash(board: Int32Array): number {
    let hash = 0;
    for (let i = 0; i < board.length; i++) {
      hash ^= this.zobrist[i * this.stride + board[i]];
    }
    return hash | 0;
  }

  /**
   * The entry holding `board`, or -1.
   *
   * The hash stored beside each entry is compared first and settles almost every
   * probe, so the board is only packed when a hash actually matches — which is
   * the difference between packing once and packing tens of millions of times.
   */
  find(board: Int32Array, hash: number): number {
    const { words, buf } = this.packer;
    let packed = false;
    for (let slot = hash & this.mask; ; slot = (slot + 1) & this.mask) {
      const entry = this.table[slot * 2 + 1];
      if (entry === 0) return -1;
      if (this.table[slot * 2] === hash) {
        if (!packed) {
          this.packer.pack(board);
          packed = true;
        }
        const base = (entry - 1) * words;
        let same = true;
        for (let k = 0; k < words; k++) {
          if (this.boards[base + k] !== buf[k]) {
            same = false;
            break;
          }
        }
        if (same) return entry - 1;
      }
    }
  }

  depthAt(index: number): number {
    return this.depths[index];
  }

  /** The moves that carry the board at `index` to the goal. */
  pathToGoal(index: number): SlideMove[] {
    const path: SlideMove[] = [];
    for (let at = index; at >= 0 && this.moveOf[at] >= 0; at = this.parents[at]) {
      path.push(invert(this.moves[this.moveOf[at]]));
    }
    return path;
  }

  private unpack(index: number, out: Int32Array): void {
    this.packer.unpack(this.boards, index * this.packer.words, out);
  }

  private add(
    board: Int32Array,
    hash: number,
    parent: number,
    move: number,
    depth: number,
  ): void {
    if (this.count === this.capacity) this.growPools();
    if (this.count * 2 >= this.mask + 1) this.growTable();

    const { words, buf } = this.packer;
    const index = this.count++;
    this.packer.pack(board);
    const base = index * words;
    for (let k = 0; k < words; k++) this.boards[base + k] = buf[k];
    this.depths[index] = depth;
    this.moveOf[index] = move;
    this.parents[index] = parent;
    this.insert(hash, index);
  }

  private insert(hash: number, index: number): void {
    let slot = hash & this.mask;
    while (this.table[slot * 2 + 1] !== 0) slot = (slot + 1) & this.mask;
    this.table[slot * 2] = hash;
    this.table[slot * 2 + 1] = index + 1;
  }

  private growPools(): void {
    this.capacity *= 2;
    const boards = new Int32Array(this.capacity * this.packer.words);
    boards.set(this.boards);
    this.boards = boards;
    const depths = new Int8Array(this.capacity);
    depths.set(this.depths);
    this.depths = depths;
    const moveOf = new Int16Array(this.capacity);
    moveOf.set(this.moveOf);
    this.moveOf = moveOf;
    this.parents = grown(this.parents, this.capacity);
  }

  private growTable(): void {
    const slots = (this.mask + 1) * 2;
    const old = this.table;
    this.table = new Int32Array(slots * 2);
    this.mask = slots - 1;
    for (let s = 0; s < old.length; s += 2) {
      if (old[s + 1] !== 0) this.insert(old[s], old[s + 1] - 1);
    }
  }
}

/**
 * The one database kept between hints, and what it was built for.
 *
 * A single slot rather than a map: both consumers ask about one puzzle at a
 * time, and a map keyed on the goal would hold a database per Netslide board
 * ever played. Re-derived when the question changes, which for Sixteen is when
 * the player picks a different size.
 */
let cachedEndgame: { key: string; endgame: SlideEndgame } | null = null;

function endgameFor(p: SlidePuzzle, depth: number, capacity: number): SlideEndgame {
  const key = `${p.w}x${p.h}:${depth}:${p.goal.join(",")}:${p.moves.length}`;
  if (cachedEndgame?.key !== key) {
    cachedEndgame = {
      key,
      endgame: new SlideEndgame(p.moves, p.w, p.h, p.goal, depth, capacity),
    };
  }
  return cachedEndgame.endgame;
}

/**
 * The deep search: walk forward depth-first, and stop as soon as the board is
 * one the database can finish.
 *
 * Returns a shortest path of at most `forwardDepth + databaseDepth` moves, or
 * null. It holds one board and one path, whatever the depth — the walk slides a
 * line in place and slides it back on the way out, so nothing is allocated per
 * node and nothing accumulates.
 */
function deepPlan(
  p: SlidePuzzle,
  caps: { forwardDepth: number; databaseDepth: number },
): SlideMove[] | null {
  const { w, h, start, moves } = p;

  // The database cannot hold more boards than there are paths of its depth —
  // that is the bound the constructor asserts against, capped so a badly-chosen
  // depth fails loudly rather than by exhausting the tab.
  let limit = 1;
  for (let d = 0; d < caps.databaseDepth; d++) limit *= moves.length;
  const db = endgameFor(p, caps.databaseDepth, Math.min(limit + 1, 4_000_000));

  const strict = sameLineMovesCompose(moves, w, h);
  const M = moves.length;
  const isRow = new Int32Array(M);
  const lineIndex = new Int32Array(M);
  const delta = new Int32Array(M);
  const inverseOf = new Int32Array(M);
  for (let i = 0; i < M; i++) {
    isRow[i] = moves[i].axis === "row" ? 1 : 0;
    lineIndex[i] = moves[i].index;
    delta[i] = moves[i].delta;
  }
  for (let i = 0; i < M; i++) {
    const len = isRow[i] === 1 ? w : h;
    inverseOf[i] = moves.findIndex(
      (_m, j) =>
        isRow[j] === isRow[i] &&
        lineIndex[j] === lineIndex[i] &&
        (((delta[j] + delta[i]) % len) + len) % len === 0,
    );
    // Without an inverse the walk cannot undo a move and so cannot run in
    // place. Every move set here has one; say so plainly if one ever does not.
    if (inverseOf[i] < 0) return null;
  }

  const board = Int32Array.from(start);
  const line = new Int32Array(Math.max(w, h));
  const zobrist = db.zobrist;
  const stride = db.stride;

  /** Slide one line of `board` in place, returning the updated hash. */
  const slideInPlace = (mi: number, hash: number): number => {
    const d = delta[mi];
    if (isRow[mi] === 1) {
      const off = lineIndex[mi] * w;
      for (let x = 0; x < w; x++) {
        const v = board[off + x];
        line[x] = v;
        hash ^= zobrist[(off + x) * stride + v];
      }
      for (let x = 0; x < w; x++) {
        const v = line[(((x - d) % w) + w) % w];
        board[off + x] = v;
        hash ^= zobrist[(off + x) * stride + v];
      }
    } else {
      const col = lineIndex[mi];
      for (let y = 0; y < h; y++) {
        const v = board[y * w + col];
        line[y] = v;
        hash ^= zobrist[(y * w + col) * stride + v];
      }
      for (let y = 0; y < h; y++) {
        const v = line[(((y - d) % h) + h) % h];
        board[y * w + col] = v;
        hash ^= zobrist[(y * w + col) * stride + v];
      }
    }
    // Signed, to match what the database stores — see `SlideEndgame.hash`.
    return hash | 0;
  };

  const redundant = (prevMove: number, mi: number): boolean => {
    if (prevMove < 0) return false;
    if (isRow[prevMove] !== isRow[mi]) return false;
    if (lineIndex[mi] < lineIndex[prevMove]) return true;
    if (lineIndex[mi] !== lineIndex[prevMove]) return false;
    return strict || delta[mi] === -delta[prevMove];
  };

  const path = new Int32Array(caps.forwardDepth);
  const bestPath = new Int32Array(caps.forwardDepth);
  let bestTotal = Number.POSITIVE_INFINITY;
  let bestLength = -1;
  let bestEntry = -1;

  const walk = (depth: number, prevMove: number, hash: number): void => {
    const hit = db.find(board, hash);
    if (hit >= 0 && depth + db.depthAt(hit) < bestTotal) {
      bestTotal = depth + db.depthAt(hit);
      bestLength = depth;
      bestEntry = hit;
      for (let i = 0; i < depth; i++) bestPath[i] = path[i];
    }
    // Nothing deeper can beat a total already found, since every remaining
    // board is at least `depth + 1` moves from here.
    if (depth === caps.forwardDepth || depth + 1 >= bestTotal) return;
    for (let mi = 0; mi < M; mi++) {
      if (redundant(prevMove, mi)) continue;
      const moved = slideInPlace(mi, hash);
      path[depth] = mi;
      walk(depth + 1, mi, moved);
      slideInPlace(inverseOf[mi], moved);
    }
  };
  walk(0, -1, db.hash(board));

  if (bestLength < 0) return null;
  const plan: SlideMove[] = [];
  for (let i = 0; i < bestLength; i++) plan.push(moves[bestPath[i]]);
  plan.push(...db.pathToGoal(bestEntry));
  return plan;
}

/**
 * Plan a sequence of slides from `start` toward the goal.
 *
 * Always returns *something* honest: the moves to the goal when it found them,
 * the moves to the best board it reached when it did not, or nothing at all when
 * standing still is already as good as the search could do.
 */
export function planSlides(p: SlidePuzzle): SlidePlan {
  const { w, h, start, moves, heuristic } = p;
  const n = start.length;
  const maxStates = p.maxStates ?? 4000;

  let maxValue = 0;
  for (let i = 0; i < n; i++) {
    if (start[i] > maxValue) maxValue = start[i];
    if (p.goal[i] > maxValue) maxValue = p.goal[i];
  }
  const arrayToKey = makeKeyFn(maxValue, n);
  const goalKey = arrayToKey(p.goal);
  const isGoal = p.isGoal ?? ((board: Int32Array) => arrayToKey(board) === goalKey);

  const startH = heuristic(start);
  if (startH === 0 || isGoal(start)) {
    return { moves: [], reachedGoal: true };
  }

  if (p.exactSearch) {
    const shortest = bidirectionalPlan(p, p.exactSearch);
    if (shortest && shortest.length > 0) {
      return { moves: shortest, reachedGoal: true };
    }
  }

  // Out of reach inside the budget: fall through to the heuristic, which at
  // least gets the board closer — and, past that, to the deep search below.

  interface SearchNode {
    board: Int32Array;
    g: number;
    h: number;
    f: number;
    parent: SearchNode | null;
    move: SlideMove | null;
  }

  // Bucket queue: `f` is a small integer, so a bucket per f-value gives O(1)
  // insert and (amortized) O(1) pop-min.
  const buckets: SearchNode[][] = [];
  let minF = startH;
  let queueSize = 0;

  const push = (node: SearchNode) => {
    let bucket = buckets[node.f];
    if (!bucket) {
      bucket = [];
      buckets[node.f] = bucket;
    }
    bucket.push(node);
    if (node.f < minF) minF = node.f;
    queueSize++;
  };

  const popMin = (): SearchNode | null => {
    while (minF < buckets.length) {
      const bucket = buckets[minF];
      if (bucket && bucket.length > 0) {
        queueSize--;
        return bucket.pop() as SearchNode;
      }
      minF++;
    }
    return null;
  };

  const startNode: SearchNode = {
    board: start,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
    move: null,
  };
  push(startNode);

  const visited = new Map<string, number>([[arrayToKey(start), 0]]);
  let bestNode = startNode;
  let goalNode: SearchNode | null = null;
  let expanded = 0;

  // Scratch buffer: generate a successor and test it against the visited set
  // *before* allocating anything for it.
  const scratch = new Int32Array(n);

  while (queueSize > 0 && expanded < maxStates) {
    const curr = popMin();
    if (!curr) break;
    expanded++;

    if (curr.h === 0 || isGoal(curr.board)) {
      goalNode = curr;
      break;
    }
    if (curr.h < bestNode.h) bestNode = curr;

    for (const move of moves) {
      if (curr.g === 0 && p.rejectFirstMove?.(move)) continue;

      slidePieces(curr.board, scratch, w, h, move);
      const key = arrayToKey(scratch);
      const nextG = curr.g + 1;

      const prevG = visited.get(key);
      if (prevG !== undefined && prevG <= nextG) continue;
      visited.set(key, nextG);

      const nextH = heuristic(scratch);
      push({
        board: new Int32Array(scratch),
        g: nextG,
        h: nextH,
        f: nextG + nextH,
        parent: curr,
        move,
      });
    }
  }

  const pathTo = (node: SearchNode): SlideMove[] => {
    const path: SlideMove[] = [];
    for (let at: SearchNode | null = node; at?.move != null; at = at.parent) {
      path.push(at.move);
    }
    return path.reverse();
  };

  if (goalNode) {
    return { moves: pathTo(goalNode), reachedGoal: true };
  }

  // `bestNode` is still the start node exactly when no expanded board beat the
  // start's heuristic — a strict local minimum, which no forward budget will
  // climb out of. The exact search has already run and come back empty, so the
  // board is past its reach; the deep search is the last thing there is to try.
  //
  // **This is a gate, and gating the search above is the defect this file
  // exists to explain, so it is worth saying exactly why this one is safe.** A
  // gated search is safe when an *ungated* one covers everything it hands off
  // to. The deep search reaches one ply further than `exactSearch` and no more,
  // so the plan it opens is at most one move longer than what `exactSearch` can
  // finish — and `exactSearch` runs on every board. Play the deep plan's first
  // move and the rest is `exactSearch`'s, every time. The old defect was the
  // opposite arrangement: the *only* exact search was the gated one, so when the
  // gate shut there was nothing underneath it but the heuristic, and the
  // heuristic walked the board back.
  //
  // The gate is worth having because this search is bounded by time rather than
  // by memory, and a board out of its reach costs the whole of it. Running it on
  // every board past `exactSearch`'s reach — which is most of a game — would
  // spend that on every hint.
  if (bestNode.move === null && p.deepSearch) {
    const shortest = deepPlan(p, p.deepSearch);
    if (shortest && shortest.length > 0) {
      return { moves: shortest, reachedGoal: true };
    }
  }

  // Nothing left: the empty plan says so, and the game turns it into a refusal.
  return { moves: pathTo(bestNode), reachedGoal: false };
}
