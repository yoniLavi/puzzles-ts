// biome-ignore-all lint/suspicious/noTemplateCurlyInString: every string here is
// a verbatim excerpt of another file's source, used as a search anchor. A `${…}`
// inside one is the template literal *being matched*, and interpolating it would
// stop the anchor matching — which is the one failure this harness must not have.

/**
 * The probe corpus for `scripts/feedback-probe.mjs` — one hand-chosen real
 * defect per case, run against **only** the module's own test file.
 *
 * ## How a case is chosen
 *
 * Each `find` is a line whose meaning a reader of the module can state in a
 * sentence, and each `why` is that sentence written as *the defect*: not
 * "conditional flipped" but "a placed digit is no longer ruled out of its
 * column". A case that survives the module's own tests names a claim the module
 * makes and its tests do not check.
 *
 * Three rules the corpus follows, each of which took a mistake to learn:
 *
 * 1. **Anchors are unique or the run aborts.** An edit that silently does not
 *    apply reports SURVIVED, which reads exactly like a finding.
 * 2. **No RNG draw-order cases.** Reordering a shuffle or a comparator changes
 *    *which boards exist*, which is a differential's guarantee by design, not a
 *    local test's. Probing for it here would manufacture "findings" that the
 *    `repo-layout` requirement explicitly says belong elsewhere. Where that
 *    boundary is load-bearing the module's own test file states it in prose and
 *    verifies it (`symmetric-blacks.test.ts` is the worked example).
 * 3. **The corpus includes a control group.** `wires.ts`, `divvy.ts` and
 *    `symmetric-blacks.ts` got purpose-written local tests in
 *    `audit-test-suite-strength`, so they should score near the top. If they do
 *    not, the instrument is wrong before any conclusion drawn from it is.
 *
 * A case may be marked `equivalent: true` with its `why` carrying the argument
 * for *why the defect is not one*. Those are excluded from the rate rather than
 * counted against it — the alternative is a test written to kill a mutation
 * that cannot fail, which is worse than no test — and the harness flags one
 * that starts being **caught**, because that means the argument has expired
 * under a code change and wants re-reading.
 *
 * Adding a case is cheap and welcome; adding one *because a module scores badly*
 * is the score-chasing this repository forbids. The number is a diagnostic.
 */

export const MODULES = [
  {
    module: "src/native/engine/latin.ts",
    cases: [
      {
        why: "a placed digit is no longer ruled out of the rest of its column",
        find: "      if (i === x) continue;",
        replace: "      if (true) continue;",
      },
      {
        // EQUIVALENT. `row`/`col` are read in exactly one place — `diffSimple`'s
        // `if (!this.row[...])` guard, which skips an `elim` sweep over a line
        // whose digit is already placed. Run anyway, that sweep finds `m === 1`
        // at the placed cell, sees `grid[y*o+x]` already set, and returns 0. So
        // the ledger is a *scan-skipping optimisation* with no observable
        // behaviour of its own, and a test asserting `row[...] === 1` would be
        // asserting the mechanism rather than any claim the module makes.
        why: "placing a digit no longer marks its row as satisfied (ledger is a scan-skipping optimisation)",
        equivalent: true,
        find: "    this.row[y * o + n - 1] = 1;",
        replace: "    this.row[y * o + n - 1] = 0;",
      },
      {
        why: "the candidate cube is indexed transposed (x and y swapped)",
        find: "    return (x * this.o + y) * this.o + n - 1;",
        replace: "    return (y * this.o + x) * this.o + n - 1;",
      },
      {
        why: "elimination fires on two remaining candidates, not one",
        find: "    if (m === 1) {",
        replace: "    if (m === 2) {",
      },
      {
        why: "a cell with no candidates left is not reported as a contradiction",
        find: "    } else if (m === 0) {\n      return -1;",
        replace: "    } else if (m === 0) {\n      return 0;",
      },
      {
        why: "set elimination's over-count check no longer reports a contradiction",
        find: "        if (rows > n - count) return -1;",
        replace: "        if (rows > n - count) return 0;",
      },
      {
        why: "forcing chains start from three-candidate cells instead of two",
        find: "        if (count !== 2) continue;",
        replace: "        if (count !== 3) continue;",
      },
      {
        why: "a second solution is graded as solvable instead of ambiguous",
        find: "    else if (nsol > 1) diff = DIFF_AMBIGUOUS;",
        replace: "    else if (nsol > 1) diff = cfg.diffRecursive;",
      },
      {
        why: "the game's own validity check on a completed grid is skipped",
        find: "    !cfg.valid(solver, cfg.ctx)",
        replace: "    !true",
      },
      {
        why: "an unfilled cell no longer marks the solve unfinished",
        find: "        if (!solver.grid[y * o + x]) diff = DIFF_UNFINISHED;",
        replace: "        if (false) diff = DIFF_UNFINISHED;",
      },
      {
        why: "the generator lets a row reuse a digit already in its column",
        find: "      for (let k = 0; k < i; k++) present[sq[row[k] * o + j] - 1] = 1;",
        replace:
          "      for (let k = 0; k < i - 1; k++) present[sq[row[k] * o + j] - 1] = 1;",
      },
      {
        why: "a w×h rectangle is cropped from a min(w,h)-square, overrunning it",
        find: "  const o = Math.max(w, h);\n  const latin = latinGenerate(o, rs);",
        replace: "  const o = Math.min(w, h);\n  const latin = latinGenerate(o, rs);",
      },
      {
        why: "the seed hook (Salad's ball/cross clues) never runs",
        find: "  cfg.seed?.(solver);",
        replace: "  void cfg.seed;",
      },
      {
        why: "the final candidate cube is not written back to cubeOut",
        find: "  if (cfg.cubeOut) cfg.cubeOut.set(solver.cube);\n  return ret;",
        replace: "  return ret;",
      },
      {
        why: "an inconsistent set of givens is graded solvable, not impossible",
        find: "  if (!solver.alloc(grid)) {",
        replace: "  if (false) {",
      },
    ],
  },

  {
    module: "src/native/engine/grid.ts",
    cases: [
      {
        why: "the cairo tiling is unreachable through the dispatch",
        find: '    case "cairo":\n      return gridNewCairo(width, height);\n',
        replace: "",
      },
      {
        why: "kites and kagome are dispatched to each other",
        find: '    case "kites":\n      return gridNewKites(width, height);',
        replace: '    case "kites":\n      return gridNewKagome(width, height);',
      },
      {
        why: "a malformed or missing description reaches the generators unchecked",
        find: "  assertGridDescValid(type, width, height, desc);",
        replace: "  void assertGridDescValid;",
      },
      {
        why: "triangular ignores its version flag, so old game IDs rebuild wrong",
        find: "      return gridNewTriangular(width, height, desc);",
        replace: "      return gridNewTriangular(width, height, null);",
      },
      {
        why: "Penrose P2 (kite/dart) builds the P3 (rhomb) tiling",
        find: '      return gridNewPenrose("p2", width, height, desc as string);',
        replace: '      return gridNewPenrose("p3", width, height, desc as string);',
      },
      {
        why: "the promised extent is computed with width and height swapped",
        find: "  return gridSizeFor(type, width, height);",
        replace: "  return gridSizeFor(type, height, width);",
      },
    ],
  },

  {
    module: "src/native/engine/midend.ts",
    cases: [
      {
        why: "an undecodable params string in a game ID is accepted silently",
        find: "      params = this.game.decodeParams(paramsStr);\n    } catch (e) {\n      return `Invalid parameters: ${(e as Error).message}`;",
        replace:
          "      params = this.game.decodeParams(paramsStr);\n    } catch {\n      return undefined;",
      },
      {
        why: "an undecodable params string from the Custom dialog is accepted silently",
        find: "      decoded = this.game.decodeParams(params);\n    } catch (e) {\n      return `Invalid parameters: ${(e as Error).message}`;",
        replace:
          "      decoded = this.game.decodeParams(params);\n    } catch {\n      return undefined;",
      },
      {
        why: "a game ID whose params fail validation is accepted",
        find: "    const pErr = this.game.validateParams(params, true);\n    if (pErr) return pErr;",
        replace:
          "    const pErr = this.game.validateParams(params, true);\n    void pErr;",
      },
      {
        why: "a corrupt save is loaded instead of refused",
        find: "      return `Could not read save: ${(e as Error).message}`;",
        replace: "      return undefined;",
      },
      {
        why: "a save whose params no longer decode is loaded anyway",
        find: "      return `Invalid saved parameters: ${(e as Error).message}`;",
        replace: "      return undefined;",
      },
      {
        why: "a save from a different puzzle is loaded into this game",
        find: '      return `Save is for "${env.puzzleId}", not "${this.game.id}"`;',
        replace: "      return undefined;",
      },
      {
        why: "Solve on a game without a solver reports success instead of refusing",
        find: '      return "This game does not support solving";',
        replace: "      return undefined;",
      },
      {
        why: "Hint on a game without hints reports success instead of refusing",
        find: '      return "This game does not support hints";',
        replace: "      return undefined;",
      },
      {
        why: "a new move after an undo no longer truncates the redo branch",
        find: "    this.history = this.history.slice(0, this.pos + 1);\n    this.moveLog = this.moveLog.slice(0, this.pos);",
        replace:
          "    this.history = this.history.slice();\n    this.moveLog = this.moveLog.slice();",
      },
      {
        why: "undo walks off the start of history instead of stopping at state 0",
        find: "    if (this.pos === 0) return;",
        replace: "    if (this.pos < 0) return;",
      },
      {
        why: "redo runs past the end of history",
        find: "    if (this.pos >= this.history.length - 1) return;",
        replace: "    if (this.pos >= this.history.length) return;",
      },
      {
        why: "undo/restart adopt a superseded desc, un-generating Mines' first click",
        find: "    this.applySupersede();\n    this.game.changedState?.(this.ui, prev, next);",
        replace: "    this.game.changedState?.(this.ui, prev, next);",
      },
      {
        why: "a loaded save's undo position is not clamped to the replayed history",
        find: "    this.pos = Math.min(env.pos, this.history.length - 1);",
        replace: "    this.pos = env.pos;",
      },
      {
        why: "the save omits the timer, so a loaded game restarts its clock",
        find: "      timerElapsed: this.timerElapsed,",
        replace: "      timerElapsed: 0,",
      },
      {
        why: "a solved-with-help game forgets it was solved with help",
        find: "      usedSolve: this.usedSolve,",
        replace: "      usedSolve: false,",
      },
      {
        why: "the timer runs during animation but not for a timed game's clock",
        find: "    const want = this.timedClockActive() || this.animating;",
        replace: "    const want = this.animating;",
      },
      {
        why: "preferredSize ignores the game's preferred tile size",
        find: "    return this.game.computeSize(this.params, this.preferredTileSize);",
        replace: "    return this.game.computeSize(this.params, 1);",
      },
      {
        why: "getColourPalette swallows the frontend's background, flattening every derived colour",
        find: "    return this.game.colours(defaultBackground);",
        replace: "    return this.game.colours([1, 1, 1]);",
      },
      {
        why: "darkPalette claims an authored dark value for every colour, defeating per-token authoring",
        find: "      const dark = colour && darkValue(colour);",
        replace: "      const dark = colour;",
      },
      {
        why: "a deleted midend keeps its callbacks and goes on emitting to a torn-down adapter",
        find: "    this.notify = undefined;\n    this.notifyTimer = undefined;",
        replace: "    void this.notify;",
      },
    ],
  },

  {
    module: "src/native/engine/save.ts",
    cases: [
      {
        why: "a save whose undo position is not a number is accepted",
        find: '    typeof v["pos"] === "number" &&',
        replace: "    true &&",
      },
      {
        why: "a save whose move list is not an array is accepted",
        find: '    Array.isArray(v["moves"]) &&',
        replace: "    true &&",
      },
      {
        why: "a future save-format version is accepted as version 1",
        find: '    v["v"] === 1 &&',
        replace: "    true &&",
      },
      {
        why: "a non-string ui blob is accepted and handed to the game's decoder",
        find: '    (v["ui"] === undefined || typeof v["ui"] === "string")',
        replace: "    true",
      },
      {
        why: "a pre-pivot C-format save is silently treated as an empty game",
        find: '    throw new Error("not valid JSON (likely a pre-pivot C-format save)");',
        replace: "    return { v: 1 };",
      },
    ],
  },

  {
    module: "src/native/engine/dsf.ts",
    cases: [
      {
        why: "merge picks the smaller class as the root, breaking root identity",
        find: "    if (this.classSize[ra] > this.classSize[rb]) {",
        replace: "    if (this.classSize[ra] < this.classSize[rb]) {",
      },
      {
        why: "a merge of two already-equivalent elements double-counts the size",
        find: "    if (ra === rb) return;",
        replace: "    if (false) return;",
      },
      {
        why: "class sizes stop accumulating, so every class reports size 1",
        find: "      this.classSize[ra] += this.classSize[rb];",
        replace: "      this.classSize[ra] += 0;",
      },
      {
        why: "reinit leaves the old class sizes behind",
        find: "  /** Restore the singleton partition (every element its own root). */\n  reinit(): void {\n    for (let i = 0; i < this.parent.length; i++) {\n      this.parent[i] = i;\n      this.classSize[i] = 1;",
        replace:
          "  /** Restore the singleton partition (every element its own root). */\n  reinit(): void {\n    for (let i = 0; i < this.parent.length; i++) {\n      this.parent[i] = i;",
      },
      {
        why: "size() reports the queried element's own count, not its root's",
        find: "    return this.classSize[this.canonify(i)];",
        replace: "    return this.classSize[i];",
      },
    ],
  },

  {
    module: "src/native/engine/border-grid.ts",
    cases: [
      {
        why: "the y axis is not bounds-checked, so a click above the grid wraps",
        find: "  return x < 0 || x >= w || y < 0 || y >= h;",
        replace: "  return x < 0 || x >= w;",
      },
      {
        why: "clamp lets a value below the low bound through",
        find: "  v < lo ? lo : v > hi ? hi : v;",
        replace: "  v > hi ? hi : v;",
      },
      {
        why: "the half-tile margin is dropped, shifting every hit-test by half a cell",
        find: "export const margin = (ts: number): number => Math.floor(ts / 2);",
        replace: "export const margin = (ts: number): number => 0;",
      },
      {
        // EQUIVALENT, and finding out why corrected a comment. The three masks
        // are not independent: the first leaves one of {L,R}, the second one of
        // {U,D}, and the third clears exactly one of those two pairs. So one
        // bit always survives and `dir === 4` is unreachable — the guard is
        // defensive, not a corner rejection. The comment used to say a corner
        // or centre click "means nothing", which the module's own
        // tie-break-at-a-tile-centre test already contradicted.
        why: "the unreachable not-exactly-one-edge guard (a click always resolves to one edge)",
        equivalent: true,
        find: "  if (dir === 4) return null; // defensive: see above, unreachable",
        replace: "  if (dir === 4) dir = 0;",
      },
      {
        why: "a click on the outer border toggles a border with no neighbour",
        find: "  if (outOfBounds(hx, hy, w, h)) return null;",
        replace: "  if (false) return null;",
      },
      {
        why: "a toggle is applied to this cell but not mirrored on its neighbour",
        find: "    ((gdiff >> dir) << FLIP(dir)) | ((gdiff >> (dir + 4)) << (FLIP(dir) + 4));",
        replace: "    0;",
      },
      {
        why: "the cursor is not clamped, so it walks off the grid",
        find: "  ui.x = clamp(ui.x + d.dx, 1, 2 * w - 1);",
        replace: "  ui.x = ui.x + d.dx;",
      },
    ],
  },

  {
    module: "src/native/engine/deduction-fixpoint.ts",
    cases: [
      {
        why: "the grade regresses when a hard rung unlocks an easier one",
        find: "        grade = Math.max(grade, r);",
        replace: "        grade = r;",
      },
      {
        why: "the ladder does not restart from the top after a rung fires",
        find: "        fired = true;\n        break;",
        replace: "        fired = true;",
      },
      {
        why: "a rung's contradiction is treated as no progress",
        find: "      if (ret < 0) return { grade, impossible: true };",
        replace: "      if (ret < 0) continue;",
      },
      {
        why: "the difficulty cap is ignored, so every board is graded at the top rung",
        find: "  const cap = opts.maxRung ?? rungs.length - 1;",
        replace: "  const cap = rungs.length - 1;",
      },
      {
        why: "baseGrade is ignored, so an unfired ladder grades 0 instead of its floor",
        find: "  let grade = baseGrade;",
        replace: "  let grade = 0;",
      },
      {
        why: "the solved early-out never fires, so a rung runs on a finished board",
        find: "    if (solved?.()) break;",
        replace: "    void solved;",
      },
      {
        why: "the recording-path step budget is never ticked, so a runaway hangs",
        find: "    budget?.tick();",
        replace: "    void budget;",
      },
    ],
  },

  // --- control group -------------------------------------------------------
  // Purpose-written local tests landed for these three in
  // `audit-test-suite-strength`. They should score at or near the top; if they
  // do not, the instrument is wrong before any conclusion drawn from it is.

  {
    module: "src/native/engine/wires.ts",
    cases: [
      {
        why: "rotation by n quarter-turns drops the wrap, losing arms off the top",
        find: "export function rot(x: number, n: number): number {",
        replace: "export function rot(x: number, n: number): number {\n  n = 0;",
      },
      {
        why: "the spanning tree may close a loop by growing into a used tile",
        find: "      if (tiles[y3 * w + x3]) continue; // already used — would make a loop",
        replace: "      if (false) continue;",
      },
      {
        why: "on a non-wrapping grid the frontier steps off the top edge",
        find: "        if (d === U && y2 === 0) continue;",
        replace: "        if (false) continue;",
      },
      {
        why: "opposite() returns the arm itself, so connections match one-sided",
        find: "export function opposite(x: number): number {",
        replace: "export function opposite(x: number): number {\n  return x;",
      },
    ],
  },

  {
    module: "src/native/engine/divvy.ts",
    cases: [
      {
        why: "a region may be grown past its target size",
        find: "export function divvyRectangle(w: number, h: number, k: number, rng: RandomState): Dsf {",
        replace:
          "export function divvyRectangle(w: number, h: number, k: number, rng: RandomState): Dsf {\n  k = k + 1;",
      },
      {
        why: "the connectivity check that keeps every region 4-connected always passes",
        find: "  const neighbours = new Int32Array(8);\n  for (let dir = 0; dir < 8; dir++) {",
        replace:
          "  if (w) return true;\n  const neighbours = new Int32Array(8);\n  for (let dir = 0; dir < 8; dir++) {",
      },
    ],
  },

  {
    module: "src/native/engine/symmetric-blacks.ts",
    cases: [
      {
        why: "4-fold rotation places only the 2-fold image, breaking the symmetry",
        find: "    case SYMM_ROT4:",
        replace: "    case SYMM_MAX:",
      },
    ],
  },

  // --- second wave ---------------------------------------------------------
  // Chosen by blast radius rather than by size: `params.ts` has 90 importers
  // and `colour-mkhighlight.ts` 37, so a defect in either reaches most of the
  // collection at once — and both are small enough that a reader can check any
  // claim about them in a minute.

  {
    module: "src/native/engine/params.ts",
    cases: [
      {
        why: "a bare square params form (`7`) parses its height as 0 instead of 7",
        find: "  return { w, h: w, next: wParse.next };",
        replace: "  return { w, h: 0, next: wParse.next };",
      },
      {
        why: "the dimension parser consumes the `x` separator as part of the height",
        find: "    const hParse = parseLeadingInt(s, wParse.next + 1);",
        replace: "    const hParse = parseLeadingInt(s, wParse.next);",
      },
      {
        why: "`next` stops at the dimensions' start, so every trailing suffix is re-parsed",
        find: '  return {\n    value: Number.parseInt(s.slice(start, i) || "0", 10),\n    next: i,\n  };',
        replace:
          '  return {\n    value: Number.parseInt(s.slice(start, i) || "0", 10),\n    next: start,\n  };',
      },
      {
        why: "a non-numeric custom-params field yields NaN, which slips past every bound check",
        find: "export function atof(s: string): number {\n  const value = Number.parseFloat(s);\n  return Number.isNaN(value) ? 0 : value;",
        replace:
          "export function atof(s: string): number {\n  const value = Number.parseFloat(s);\n  return value;",
      },
      {
        why: "a float param is encoded with full double precision, so it re-reads as a different number",
        find: "  return stripTrailingZeros(value.toFixed(Math.max(0, 5 - exponent)));",
        replace: "  return String(value);",
      },
      {
        why: "%g never switches to exponential notation, so a tiny value encodes as 0.000000",
        find: "  if (exponent < -4 || exponent >= 6) {",
        replace: "  if (false) {",
      },
    ],
  },

  {
    module: "src/native/engine/colour-mkhighlight.ts",
    cases: [
      {
        why: "a near-white background is not shifted, so its highlight bevel vanishes",
        find: "  const dw = colourDistance(out, white);\n  if (dw < K) {",
        replace: "  const dw = colourDistance(out, white);\n  if (false) {",
      },
      {
        why: "a near-black background is not shifted, so its lowlight bevel vanishes",
        find: "  const db = colourDistance(out, black);\n  if (db < K) {",
        replace: "  const db = colourDistance(out, black);\n  if (false) {",
      },
      {
        why: "the exact-white epsilon is dropped, so K/dw overflows and shifts the background past white",
        find: "    if (dw < EPS) out = colourMix(white, black, K / Math.sqrt(3));\n    else out = colourMix(white, out, K / dw);",
        replace: "    out = colourMix(white, out, K / dw);",
      },
      {
        // EQUIVALENT, and measured rather than argued. `mkhighlightBackground`
        // shifts the background until it is *exactly* K from the extreme, so
        // `K / dw` is exactly 1 and `colourMix(bg, white, 1)` already yields
        // pure white — the `dw < K` arm only exists to absorb float drift.
        // Swept 9,261 backgrounds over the whole RGB cube at 1/20 steps: the
        // adjusted background was within K of white or black **zero** times.
        // Class (b) — unreachable in practice, so record it and keep the code.
        why: "the highlight's saturate-to-white arm (an unreachable float-drift guard)",
        equivalent: true,
        find: "  const highlight: Colour = dw < K ? [1, 1, 1] : colourMix(bg, white, K / dw);",
        replace: "  const highlight: Colour = colourMix(bg, white, K / dw);",
      },
      {
        why: "the completed-region shade equals the background, so a correct region reads as unfilled",
        find: "  return [background[0] * 0.75, background[1] * 0.75, background[2] * 0.75];",
        replace: "  return [background[0], background[1], background[2]];",
      },
    ],
  },

  {
    module: "src/native/engine/findloop.ts",
    cases: [
      {
        why: "a back-edge to an ancestor is not recorded, so no loop is ever found",
        find: "          shallowestReachable[u] = Math.min(shallowestReachable[u], depth[w]);\n          anyLoop = true;",
        replace: "          void depth[w];",
      },
      {
        why: "reachability is not folded into the parent, so every edge above a loop reads as a bridge",
        find: "        shallowestReachable[parent[u]] = Math.min(\n          shallowestReachable[parent[u]],\n          shallowestReachable[u],\n        );",
        replace: "        void shallowestReachable[u];",
      },
      {
        why: "subtree sizes stop accumulating, so a bridge reports 1 vertex on its far side",
        find: "        subtreeSize[parent[u]] += subtreeSize[u];",
        replace: "        subtreeSize[parent[u]] += 0;",
      },
      {
        why: "isBridge is only checked one way round, so half the queries answer null",
        find: "      const backward = isBridgeOneWay(w, u);",
        replace: "      const backward = null;",
      },
      {
        why: "isBridge reports the two sides swapped",
        find: "        return { uVertices: backward.vVertices, vVertices: backward.uVertices };",
        replace:
          "        return { uVertices: backward.uVertices, vVertices: backward.vVertices };",
      },
      {
        why: "the edge back to the parent is followed, so every tree edge looks like a loop",
        find: "        if (w === parent[u]) continue;",
        replace: "        if (false) continue;",
      },
    ],
  },

  {
    module: "src/native/engine/grid-core.ts",
    cases: [
      {
        why: "two faces sharing a dot pair get two edges instead of one shared edge",
        find: "      const found = edgeByDots.get(key);",
        replace: "      const found = undefined;",
      },
      {
        why: "the edge dedup key collides, so unrelated dot pairs share an edge",
        find: "      const key = lo * numDots + hi;",
        replace: "      const key = lo + hi;",
      },
      {
        why: "a dot's degree is counted from one endpoint only, halving its edge list",
        find: "    e.dot1.order++;\n    e.dot2.order++;",
        replace: "    e.dot1.order++;",
      },
      {
        why: "the anticlockwise walk is dropped, so a boundary dot's face list stays half-empty",
        find: "    // clockwise search",
        replace: "    if (d.order > 0) continue;\n    // clockwise search",
      },
    ],
  },
];
