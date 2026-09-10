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
 * 1. **Anchors are unique *within the declaration the case names*, or the run
 *    aborts.** Each case carries `within` — the function, `Class.method`, class
 *    or module-level constant it perturbs (`feedback-probe-locate.mjs` finds
 *    the span without a parser) — and `find` must match exactly once inside
 *    it. An edit that silently does not apply reports SURVIVED, which reads
 *    exactly like a finding. Scoping the search to the declaration is what
 *    keeps an unrelated edit elsewhere in the module from breaking a case that
 *    never touched it; the `why` was always a claim about one function.
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
    module: "src/engine/latin.ts",
    cases: [
      {
        within: "LatinSolver.place",
        why: "a placed digit is no longer ruled out of the rest of its column",
        find: "      if (i === x) continue;",
        replace: "      if (true) continue;",
      },
      {
        // Was EQUIVALENT while the ledger was a scan-skipping optimization
        // (`diffSimple` skips a line whose digit is placed; run anyway, the
        // sweep places nothing). `add-latin-repeats-support` made it
        // load-bearing: for the repeated symbol the row count is what decides
        // when the line is full and the symbol is struck from the rest of it,
        // so a count that never grows leaves every hole line unstruck.
        within: "LatinSolver.place",
        why: "placing a symbol no longer counts towards its row, so a repeated symbol's line is never struck once full",
        find: "    const inRow = ++this.row[y * s + n - 1];",
        replace: "    const inRow = this.row[y * s + n - 1];",
      },
      {
        within: "LatinSolver.cubepos",
        why: "the candidate cube is indexed transposed (x and y swapped)",
        find: "    return (x * this.o + y) * this.symbols + n - 1;",
        replace: "    return (y * this.o + x) * this.symbols + n - 1;",
      },
      {
        within: "LatinSolver.elim",
        why: "elimination fires with one candidate too many left (two for a digit, times+1 for the repeated symbol)",
        find: "    if (m === need) {",
        replace: "    if (m === need + 1) {",
      },
      {
        within: "LatinSolver.elim",
        why: "a cell with no candidates left (or a line short of its repeated symbol) is not reported as a contradiction",
        find: "    } else if (m < need) {\n      return -1;",
        replace: "    } else if (m < need) {\n      return 0;",
      },
      {
        within: "LatinSolver.elim",
        why: "the repeated symbol is placed as soon as one cell can take it, instead of once exactly `times` can",
        find: "    const need = positional ? this.multiplicity(1 + (start % s)) : 1;",
        replace: "    const need = 1;",
      },
      {
        within: "LatinSolver.set",
        why: "set elimination's over-count check no longer reports a contradiction",
        find: "        if (rows > n - count) return -1;",
        replace: "        if (rows > n - count) return 0;",
      },
      {
        within: "LatinSolver.forcing",
        why: "forcing chains start from three-candidate cells instead of two",
        find: "        if (count !== 2) continue;",
        replace: "        if (count !== 3) continue;",
      },
      {
        within: "latinSolverTop",
        why: "a second solution is graded as solvable instead of ambiguous",
        find: "    else if (nsol > 1) diff = DIFF_AMBIGUOUS;",
        replace: "    else if (nsol > 1) diff = cfg.diffRecursive;",
      },
      {
        within: "finish",
        why: "the game's own validity check on a completed grid is skipped",
        find: "    !cfg.valid(solver, cfg.ctx)",
        replace: "    !true",
      },
      {
        within: "latinSolverTop",
        why: "an unfilled cell no longer marks the solve unfinished",
        find: "        if (!solver.grid[y * o + x]) diff = DIFF_UNFINISHED;",
        replace: "        if (false) diff = DIFF_UNFINISHED;",
      },
      {
        within: "latinGenerate",
        why: "the generator lets a row reuse a digit already in its column",
        find: "      for (let k = 0; k < i; k++) present[sq[row[k] * o + j] - 1] = 1;",
        replace:
          "      for (let k = 0; k < i - 1; k++) present[sq[row[k] * o + j] - 1] = 1;",
      },
      {
        within: "latinGenerateRect",
        why: "a w×h rectangle is cropped from a min(w,h)-square, overrunning it",
        find: "  const o = Math.max(w, h);\n  const latin = latinGenerate(o, rs);",
        replace: "  const o = Math.min(w, h);\n  const latin = latinGenerate(o, rs);",
      },
      {
        within: "latinSolver",
        why: "the seed hook (Salad's ball/cross clues) never runs",
        find: "  cfg.seed?.(solver);",
        replace: "  void cfg.seed;",
      },
      {
        within: "latinSolver",
        why: "the final candidate cube is not written back to cubeOut",
        find: "  if (cfg.cubeOut) cfg.cubeOut.set(solver.cube);\n  return ret;",
        replace: "  return ret;",
      },
      {
        within: "latinSolver",
        why: "an inconsistent set of givens is graded solvable, not impossible",
        find: "  if (!solver.alloc(grid)) {",
        replace: "  if (false) {",
      },
    ],
  },

  {
    module: "src/engine/grid/index.ts",
    cases: [
      {
        within: "gridNew",
        why: "the cairo tiling is unreachable through the dispatch",
        find: '    case "cairo":\n      return gridNewCairo(width, height);\n',
        replace: "",
      },
      {
        within: "gridNew",
        why: "kites and kagome are dispatched to each other",
        find: '    case "kites":\n      return gridNewKites(width, height);',
        replace: '    case "kites":\n      return gridNewKagome(width, height);',
      },
      {
        within: "gridNew",
        why: "a malformed or missing description reaches the generators unchecked",
        find: "  assertGridDescValid(type, width, height, desc);",
        replace: "  void assertGridDescValid;",
      },
      {
        within: "gridNew",
        why: "triangular ignores its version flag, so old game IDs rebuild wrong",
        find: "      return gridNewTriangular(width, height, desc);",
        replace: "      return gridNewTriangular(width, height, null);",
      },
      {
        within: "gridNew",
        why: "Penrose P2 (kite/dart) builds the P3 (rhomb) tiling",
        find: '      return gridNewPenrose("p2", width, height, desc as string);',
        replace: '      return gridNewPenrose("p3", width, height, desc as string);',
      },
      {
        within: "gridComputeSize",
        why: "the promised extent is computed with width and height swapped",
        find: "  return gridSizeFor(type, width, height);",
        replace: "  return gridSizeFor(type, height, width);",
      },
    ],
  },

  {
    module: "src/engine/midend.ts",
    cases: [
      {
        within: "Midend.newGameFromId",
        why: "an undecodable params string in a game ID is accepted silently",
        find: "      params = this.game.decodeParams(paramsStr);\n    } catch (e) {\n      return `Invalid parameters: ${(e as Error).message}`;",
        replace:
          "      params = this.game.decodeParams(paramsStr);\n    } catch {\n      return undefined;",
      },
      {
        within: "Midend.setParams",
        why: "an undecodable params string from the Custom dialog is accepted silently",
        find: "      decoded = this.game.decodeParams(params);\n    } catch (e) {\n      return `Invalid parameters: ${(e as Error).message}`;",
        replace:
          "      decoded = this.game.decodeParams(params);\n    } catch {\n      return undefined;",
      },
      {
        within: "Midend.newGameFromId",
        why: "a game ID whose params fail validation is accepted",
        find: "    const pErr = this.game.validateParams(params, generating);\n    if (pErr) return pErr;",
        replace:
          "    const pErr = this.game.validateParams(params, generating);\n    void pErr;",
      },
      {
        // `bound-abcd-generable-sizes` D4: this argument was a literal `true`,
        // which made `full` dead across sixteen games that gate a bound on it —
        // a generation-only bound also refused an already-described board.
        within: "Midend.newGameFromId",
        why: "a generation-only param bound also rejects a game ID that carries its desc",
        find: '    const generating = id[sep] === "#";',
        replace: "    const generating = true;",
      },
      {
        within: "Midend.loadGame",
        why: "a corrupt save is loaded instead of refused",
        find: "      return `Could not read save: ${(e as Error).message}`;",
        replace: "      return undefined;",
      },
      {
        within: "Midend.loadGame",
        why: "a save whose params no longer decode is loaded anyway",
        find: "      return `Invalid saved parameters: ${(e as Error).message}`;",
        replace: "      return undefined;",
      },
      {
        within: "Midend.loadGame",
        why: "a save from a different puzzle is loaded into this game",
        find: '      return `Save is for "${env.puzzleId}", not "${this.game.id}"`;',
        replace: "      return undefined;",
      },
      {
        within: "Midend.solve",
        why: "Solve on a game without a solver reports success instead of refusing",
        find: '      return "This game does not support solving";',
        replace: "      return undefined;",
      },
      {
        within: "Midend.computeHintPlan",
        why: "Hint on a game without hints reports success instead of refusing",
        find: '      return "This game does not support hints";',
        replace: "      return undefined;",
      },
      {
        within: "Midend.commitMove",
        why: "a new move after an undo no longer truncates the redo branch",
        find: "    this.history = this.history.slice(0, this.pos + 1);\n    this.moveLog = this.moveLog.slice(0, this.pos);",
        replace:
          "    this.history = this.history.slice();\n    this.moveLog = this.moveLog.slice();",
      },
      {
        within: "Midend.undo",
        why: "undo walks off the start of history instead of stopping at state 0",
        find: "    if (this.pos === 0) return;",
        replace: "    if (this.pos < 0) return;",
      },
      {
        within: "Midend.redo",
        why: "redo runs past the end of history",
        find: "    if (this.pos >= this.history.length - 1) return;",
        replace: "    if (this.pos >= this.history.length) return;",
      },
      {
        within: "Midend.commitMove",
        why: "undo/restart adopt a superseded desc, un-generating Mines' first click",
        find: "    this.applySupersede();\n    this.game.changedState?.(this.ui, prev, next);",
        replace: "    this.game.changedState?.(this.ui, prev, next);",
      },
      {
        within: "Midend.loadGame",
        why: "a loaded save's undo position is not clamped to the replayed history",
        find: "    this.pos = Math.min(env.pos, this.history.length - 1);",
        replace: "    this.pos = env.pos;",
      },
      {
        within: "Midend.saveGame",
        why: "the save omits the timer, so a loaded game restarts its clock",
        find: "      timerElapsed: this.timerElapsed,",
        replace: "      timerElapsed: 0,",
      },
      {
        within: "Midend.saveGame",
        why: "a solved-with-help game forgets it was solved with help",
        find: "      cheated: this.cheated,",
        replace: "      cheated: false,",
      },
      {
        within: "Midend.syncTimer",
        why: "the timer runs during animation but not for a timed game's clock",
        find: "    const want = this.timedClockActive() || this.animating;",
        replace: "    const want = this.animating;",
      },
      {
        within: "Midend.preferredSize",
        why: "preferredSize ignores the game's preferred tile size",
        find: "    return this.game.computeSize(this.params, this.preferredTileSize);",
        replace: "    return this.game.computeSize(this.params, 1);",
      },
      {
        within: "Midend.getColorPalette",
        why: "getColorPalette swallows the frontend's background, flattening every derived color",
        find: "    return resolvePalette(this.game, defaultBackground);",
        replace: "    return resolvePalette(this.game, [1, 1, 1]);",
      },
      {
        within: "Midend.darkPalette",
        why: "darkPalette claims an authored dark value for every color, defeating per-token authoring",
        find: "      const dark = color && darkValue(color);",
        replace: "      const dark = color;",
      },
      {
        within: "Midend.delete",
        why: "a deleted midend keeps its callbacks and goes on emitting to a torn-down adapter",
        find: "    this.notify = undefined;\n    this.notifyTimer = undefined;",
        replace: "    void this.notify;",
      },
    ],
  },

  {
    module: "src/engine/save.ts",
    cases: [
      {
        within: "isSaveEnvelope",
        why: "a save whose undo position is not a number is accepted",
        find: '    typeof v["pos"] === "number" &&',
        replace: "    true &&",
      },
      {
        within: "isSaveEnvelope",
        why: "a save whose move list is not an array is accepted",
        find: '    Array.isArray(v["moves"]) &&',
        replace: "    true &&",
      },
      {
        within: "isSaveEnvelope",
        why: "a save-format version the decoder cannot read is accepted anyway",
        find: '    v["v"] === 2 &&',
        replace: "    true &&",
      },
      {
        within: "isSaveEnvelope",
        why: "a non-string ui blob is accepted and handed to the game's decoder",
        find: '    (v["ui"] === undefined || typeof v["ui"] === "string")',
        replace: "    true",
      },
      {
        within: "decodeSave",
        why: "a pre-pivot C-format save is silently treated as an empty game",
        find: '    throw new Error("not valid JSON (likely a pre-pivot C-format save)");',
        replace: "    return { v: 1 };",
      },
    ],
  },

  {
    module: "src/engine/dsf.ts",
    cases: [
      {
        within: "Dsf.merge",
        why: "merge picks the smaller class as the root, breaking root identity",
        find: "    if (this.classSize[ra] > this.classSize[rb]) {",
        replace: "    if (this.classSize[ra] < this.classSize[rb]) {",
      },
      {
        within: "Dsf.merge",
        why: "a merge of two already-equivalent elements double-counts the size",
        find: "    if (ra === rb) return;",
        replace: "    if (false) return;",
      },
      {
        within: "Dsf.merge",
        why: "class sizes stop accumulating, so every class reports size 1",
        find: "      this.classSize[ra] += this.classSize[rb];",
        replace: "      this.classSize[ra] += 0;",
      },
      {
        within: "Dsf",
        why: "reinit leaves the old class sizes behind",
        find: "  /** Restore the singleton partition (every element its own root). */\n  reinit(): void {\n    for (let i = 0; i < this.parent.length; i++) {\n      this.parent[i] = i;\n      this.classSize[i] = 1;",
        replace:
          "  /** Restore the singleton partition (every element its own root). */\n  reinit(): void {\n    for (let i = 0; i < this.parent.length; i++) {\n      this.parent[i] = i;",
      },
      {
        within: "Dsf.size",
        why: "size() reports the queried element's own count, not its root's",
        find: "    return this.classSize[this.canonify(i)];",
        replace: "    return this.classSize[i];",
      },
    ],
  },

  {
    module: "src/engine/border-grid.ts",
    cases: [
      {
        within: "outOfBounds",
        why: "the y axis is not bounds-checked, so a click above the grid wraps",
        find: "  return x < 0 || x >= w || y < 0 || y >= h;",
        replace: "  return x < 0 || x >= w;",
      },
      {
        within: "clamp",
        why: "clamp lets a value below the low bound through",
        find: "  v < lo ? lo : v > hi ? hi : v;",
        replace: "  v > hi ? hi : v;",
      },
      {
        within: "margin",
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
        // or center click "means nothing", which the module's own
        // tie-break-at-a-tile-center test already contradicted.
        within: "pointerEdge",
        why: "the unreachable not-exactly-one-edge guard (a click always resolves to one edge)",
        equivalent: true,
        find: "  if (dir === 4) return null; // defensive: see above, unreachable",
        replace: "  if (dir === 4) dir = 0;",
      },
      {
        within: "pointerEdge",
        why: "a click on the outer border toggles a border with no neighbor",
        find: "  if (outOfBounds(hx, hy, w, h)) return null;",
        replace: "  if (false) return null;",
      },
      {
        within: "pointerEdge",
        why: "a toggle is applied to this cell but not mirrored on its neighbor",
        find: "    ((gdiff >> dir) << FLIP(dir)) | ((gdiff >> (dir + 4)) << (FLIP(dir) + 4));",
        replace: "    0;",
      },
      {
        within: "moveBorderCursor",
        why: "the cursor is not clamped, so it walks off the grid",
        find: "  ui.cursor.x = clamp(ui.cursor.x + d.dx, 1, 2 * w - 1);",
        replace: "  ui.cursor.x = ui.cursor.x + d.dx;",
      },
    ],
  },

  {
    module: "src/engine/deduction-fixpoint.ts",
    cases: [
      {
        within: "runDeductionFixpoint",
        why: "the grade regresses when a hard technique unlocks an easier one",
        find: "        if (technique.tier > grade) grade = technique.tier;",
        replace: "        grade = technique.tier;",
      },
      {
        within: "runDeductionFixpoint",
        why: "the grade is the technique's position in the ladder, not its declared tier",
        find: "        if (technique.tier > grade) grade = technique.tier;",
        replace: "        grade = techniques.indexOf(technique);",
      },
      {
        within: "runDeductionFixpoint",
        why: "the ladder does not restart from the top after a rung fires",
        find: "        fired = true;\n        break;",
        replace: "        fired = true;",
      },
      {
        within: "runDeductionFixpoint",
        why: "a rung's contradiction is treated as no progress",
        find: "      if (ret < 0) return { grade, impossible: true };",
        replace: "      if (ret < 0) continue;",
      },
      {
        within: "runDeductionFixpoint",
        why: "the difficulty cap is ignored, so every board is graded at the top tier",
        find: "      if (maxTier !== undefined && technique.tier > maxTier) continue;",
        replace: "      if (false) continue;",
      },
      {
        within: "runDeductionFixpoint",
        why: "baseGrade is ignored, so an unfired ladder grades 0 instead of its floor",
        find: "  let grade = baseGrade;",
        replace: "  let grade = 0;",
      },
      {
        within: "runDeductionFixpoint",
        why: "the settled early-out never fires, so a technique runs on a settled board",
        find: "    if (settled?.()) break;",
        replace: "    void settled;",
      },
      {
        within: "runDeductionFixpoint",
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
    module: "src/engine/wires.ts",
    cases: [
      {
        within: "rot",
        why: "rotation by n quarter-turns drops the wrap, losing arms off the top",
        find: "export function rot(x: number, n: number): number {",
        replace: "export function rot(x: number, n: number): number {\n  n = 0;",
      },
      {
        within: "growSpanningTree",
        why: "the spanning tree may close a loop by growing into a used tile",
        find: "      if (tiles[y3 * w + x3]) continue; // already used — would make a loop",
        replace: "      if (false) continue;",
      },
      {
        within: "growSpanningTree",
        why: "on a non-wrapping grid the frontier steps off the top edge",
        find: "        if (d === U && y2 === 0) continue;",
        replace: "        if (false) continue;",
      },
      {
        within: "opposite",
        why: "opposite() returns the arm itself, so connections match one-sided",
        find: "export function opposite(x: number): number {",
        replace: "export function opposite(x: number): number {\n  return x;",
      },
    ],
  },

  {
    module: "src/engine/divvy.ts",
    cases: [
      {
        within: "divvyRectangle",
        why: "a region may be grown past its target size",
        find: "export function divvyRectangle(w: number, h: number, k: number, rng: RandomState): Dsf {",
        replace:
          "export function divvyRectangle(w: number, h: number, k: number, rng: RandomState): Dsf {\n  k = k + 1;",
      },
      {
        within: "addremcommon",
        why: "the connectivity check that keeps every region 4-connected always passes",
        find: "  const neighbors = new Int32Array(8);\n  for (let dir = 0; dir < 8; dir++) {",
        replace:
          "  if (w) return true;\n  const neighbors = new Int32Array(8);\n  for (let dir = 0; dir < 8; dir++) {",
      },
    ],
  },

  {
    module: "src/engine/symmetric-blacks.ts",
    cases: [
      {
        within: "placeSymmetricBlacks",
        why: "4-fold rotation places only the 2-fold image, breaking the symmetry",
        find: "    case SYMM_ROT4:",
        replace: "    case SYMM_MAX:",
      },
    ],
  },

  // --- second wave ---------------------------------------------------------
  // Chosen by blast radius rather than by size: `params.ts` has 90 importers
  // and `color-mkhighlight.ts` 37, so a defect in either reaches most of the
  // collection at once — and both are small enough that a reader can check any
  // claim about them in a minute.

  {
    module: "src/engine/params.ts",
    cases: [
      {
        within: "parseDimensions",
        why: "a bare square params form (`7`) parses its height as 0 instead of 7",
        find: "  return { w, h: w, next: wParse.next };",
        replace: "  return { w, h: 0, next: wParse.next };",
      },
      {
        within: "parseDimensions",
        why: "the dimension parser consumes the `x` separator as part of the height",
        find: "    const hParse = parseLeadingInt(s, wParse.next + 1);",
        replace: "    const hParse = parseLeadingInt(s, wParse.next);",
      },
      {
        within: "parseLeadingInt",
        why: "`next` stops at the dimensions' start, so every trailing suffix is re-parsed",
        find: '  return {\n    value: Number.parseInt(s.slice(start, i) || "0", 10),\n    next: i,\n  };',
        replace:
          '  return {\n    value: Number.parseInt(s.slice(start, i) || "0", 10),\n    next: start,\n  };',
      },
      {
        within: "atof",
        why: "a non-numeric custom-params field yields NaN, which slips past every bound check",
        find: "export function atof(s: string): number {\n  const value = Number.parseFloat(s);\n  return Number.isNaN(value) ? 0 : value;",
        replace:
          "export function atof(s: string): number {\n  const value = Number.parseFloat(s);\n  return value;",
      },
      {
        within: "formatG",
        why: "a float param is encoded with full double precision, so it re-reads as a different number",
        find: "  return stripTrailingZeros(value.toFixed(Math.max(0, 5 - exponent)));",
        replace: "  return String(value);",
      },
      {
        within: "formatG",
        why: "%g never switches to exponential notation, so a tiny value encodes as 0.000000",
        find: "  if (exponent < -4 || exponent >= 6) {",
        replace: "  if (false) {",
      },
    ],
  },

  {
    module: "src/engine/color/color-mkhighlight.ts",
    cases: [
      {
        within: "mkhighlightBackground",
        why: "a near-white background is not shifted, so its highlight bevel vanishes",
        find: "  const dw = colorDistance(out, white);\n  if (dw < K) {",
        replace: "  const dw = colorDistance(out, white);\n  if (false) {",
      },
      {
        within: "mkhighlightBackground",
        why: "a near-black background is not shifted, so its lowlight bevel vanishes",
        find: "  const db = colorDistance(out, black);\n  if (db < K) {",
        replace: "  const db = colorDistance(out, black);\n  if (false) {",
      },
      {
        within: "mkhighlightBackground",
        why: "the exact-white epsilon is dropped, so K/dw overflows and shifts the background past white",
        find: "    if (dw < EPS) out = colorMix(white, black, K / Math.sqrt(3));\n    else out = colorMix(white, out, K / dw);",
        replace: "    out = colorMix(white, out, K / dw);",
      },
      {
        // EQUIVALENT, and measured rather than argued. `mkhighlightBackground`
        // shifts the background until it is *exactly* K from the extreme, so
        // `K / dw` is exactly 1 and `colorMix(bg, white, 1)` already yields
        // pure white — the `dw < K` arm only exists to absorb float drift.
        // Swept 9,261 backgrounds over the whole RGB cube at 1/20 steps: the
        // adjusted background was within K of white or black **zero** times.
        // Class (b) — unreachable in practice, so record it and keep the code.
        within: "mkhighlight",
        why: "the highlight's saturate-to-white arm (an unreachable float-drift guard)",
        equivalent: true,
        find: "  const highlight: Color = dw < K ? [1, 1, 1] : colorMix(bg, white, K / dw);",
        replace: "  const highlight: Color = colorMix(bg, white, K / dw);",
      },
      {
        within: "correctRegionColor",
        why: "the completed-region shade equals the background, so a correct region reads as unfilled",
        find: "  return [background[0] * 0.75, background[1] * 0.75, background[2] * 0.75];",
        replace: "  return [background[0], background[1], background[2]];",
      },
    ],
  },

  {
    module: "src/engine/findloop.ts",
    cases: [
      {
        within: "findLoops",
        why: "a back-edge to an ancestor is not recorded, so no loop is ever found",
        find: "          shallowestReachable[u] = Math.min(shallowestReachable[u], depth[w]);\n          anyLoop = true;",
        replace: "          void depth[w];",
      },
      {
        within: "findLoops",
        why: "reachability is not folded into the parent, so every edge above a loop reads as a bridge",
        find: "        shallowestReachable[parent[u]] = Math.min(\n          shallowestReachable[parent[u]],\n          shallowestReachable[u],\n        );",
        replace: "        void shallowestReachable[u];",
      },
      {
        within: "findLoops",
        why: "subtree sizes stop accumulating, so a bridge reports 1 vertex on its far side",
        find: "        subtreeSize[parent[u]] += subtreeSize[u];",
        replace: "        subtreeSize[parent[u]] += 0;",
      },
      {
        within: "findLoops.isBridge",
        why: "isBridge is only checked one way round, so half the queries answer null",
        find: "      const backward = isBridgeOneWay(w, u);",
        replace: "      const backward = null;",
      },
      {
        within: "findLoops.isBridge",
        why: "isBridge reports the two sides swapped",
        find: "        return { uVertices: backward.vVertices, vVertices: backward.uVertices };",
        replace:
          "        return { uVertices: backward.uVertices, vVertices: backward.vVertices };",
      },
      {
        within: "findLoops",
        why: "the edge back to the parent is followed, so every tree edge looks like a loop",
        find: "        if (w === parent[u]) continue;",
        replace: "        if (false) continue;",
      },
    ],
  },

  {
    // The shared machinery behind explained hints, and the largest module in the
    // engine. Cases are biased toward **the claims a hint utters** rather than
    // toward branch coverage: a narration whose premise is not actually checked
    // is the failure `docs/games/hints.md` § "The quality bar" rule 5 names, and it is
    // invisible to a render snapshot, which records whatever the game emits.
    module: "src/engine/candidate-hint.ts",
    cases: [
      {
        within: "candidateHint",
        why: "a hint deduces from a board with known mistakes instead of refusing",
        // Re-anchored by `refuse-honestly-at-every-tier`: this module used to
        // write the refusal pair out itself and now calls `commonHintRefusal`,
        // so the mistake count is what to neuter. Same planted defect — the
        // candidate family's hint reasons from a board it knows is wrong —
        // asked of the same module, which is what keeps the measurement
        // comparable across the move.
        find: "  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);",
        replace: "  const refusal = commonHintRefusal(state.completed, 0);",
      },
      {
        within: "candidateHint",
        why: "with no ui the plan folds the trivial eliminations away instead of teaching them",
        find: "  const autoClean = ui?.autoPencil ?? false;",
        replace: "  const autoClean = ui?.autoPencil ?? true;",
      },
      {
        within: "joinNums",
        why: "a two-value list narrates as “1, 2” with no “and”",
        find: "  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;",
        replace: "  if (ns.length === 2) return `${ns[0]}, ${ns[1]}`;",
      },
      {
        within: "nakedSingle",
        why: "a cell with two candidates left is announced as a forced single",
        find: "    if ((pencil[i] & (pencil[i] - 1)) !== 0) continue; // more than one bit set",
        replace: "    if (false) continue; // more than one bit set",
      },
      {
        within: "nakedSingle",
        why: "a filled cell's stale notes are announced as the next placement",
        find: "    if (grid[i] !== 0 || pencil[i] === 0) continue;",
        replace: "    if (pencil[i] === 0) continue;",
      },
      {
        within: "nextStrike",
        why: "strikes are taught from past the next placement, so the premise the player's board shows is gone",
        find: "  const lim = firstUnreflectedPlaceIndex(ops, opts?.placed ?? grid, w);",
        replace: "  const lim = ops.length;",
      },
      {
        within: "nextStrike",
        why: "a strike is taught on a cell the player has already filled",
        find: "    grid[op.y * w + op.x] === 0 &&\n    (pencil[op.y * w + op.x] & bit(op.n)) !== 0 &&",
        replace: "    (pencil[op.y * w + op.x] & bit(op.n)) !== 0 &&",
      },
      {
        within: "nextStrike",
        why: "a strike is taught on a candidate the player has already crossed out",
        find: "    (pencil[op.y * w + op.x] & bit(op.n)) !== 0 &&",
        replace: "    true &&",
      },
      {
        within: "nextStrike",
        why: "placement bookkeeping is taught as if it were a deduction technique",
        find: '    (op.reason as { kind?: string }).kind !== "dup";',
        replace: "    true;",
      },
      {
        within: "nextStrike",
        why: "a fully-struck firing ends the search instead of advancing to the next live one",
        find: "    if (live.length === 0) continue;",
        replace: "    if (live.length === 0) return null;",
      },
      {
        within: "nextPlace",
        why: "a placement the player has already made is offered again as the next move",
        find: '    if (op.kind === "place" && placed[op.y * w + op.x] === 0) return op;',
        replace: '    if (op.kind === "place") return op;',
      },
      {
        within: "regionDuplicateMarks",
        why: "the placed cell itself is offered as a candidate to cross out",
        find: "      if (j === home || seen.has(j)) continue;",
        replace: "      if (seen.has(j)) continue;",
      },
      {
        within: "regionDuplicateMarks",
        why: "a cell reachable through two of the cell's regions is struck twice",
        find: "      const j = region.cells[i];\n      if (j === home || seen.has(j)) continue;",
        replace: "      const j = region.cells[i];\n      if (j === home) continue;",
      },
      {
        within: "obviousCandidateMarks",
        why: "the mistaken-board guard goes, so a cell can be emptied of every note and the cleanup oscillates",
        find: "      removable &= removable - 1;",
        replace: "      removable &= removable;",
      },
      {
        within: "obviousCandidateMarks",
        why: "the cleanup never strikes the top candidate",
        find: "  const values = enc?.values ?? w;",
        replace: "  const values = enc?.values ?? w - 1;",
      },
      {
        within: "adaptiveMarkAll",
        why: "a press on a fully-cleaned board adds an empty undo entry instead of doing nothing",
        find: "  if (marks.length === 0) return null;",
        replace:
          '  if (marks.length === 0) return { type: "pencilStrike", marks } as unknown as M;',
      },
      {
        within: "lazyPopulate.ensure",
        why: "the working fill overwrites notes the player narrowed, so the plan teaches strikes on candidates no longer on their board",
        find: "      for (let i = 0; i < w * w; i++) if (!wGrid[i] && wPen[i] === 0) wPen[i] = all;",
        replace: "      for (let i = 0; i < w * w; i++) if (!wGrid[i]) wPen[i] = all;",
      },
      {
        within: "lazyPopulate",
        why: "an already-noted board still opens with a redundant “pencil everything in” step",
        find: "  let populated = !anyEmptyLacksNotes(state.grid, state.pencil, w);",
        replace: "  let populated = false;",
      },
      {
        within: "lazyPopulate.ensure",
        why: "the populate fill omits the top candidate, so no elimination of it is ever taught",
        find: "      const all = (1 << (w + 1)) - (1 << 1);",
        replace: "      const all = (1 << w) - (1 << 1);",
      },
      {
        within: "emitObviousCleanStep",
        why: "the cleanup's marks are not applied to the working notes, so the plan re-teaches strikes it already made",
        find: "  for (const m of obvious) pencil[m.y * w + m.x] &= ~bit(m.n);",
        replace: "  for (const m of obvious) void m;",
      },
      {
        within: "emitObviousCleanStep",
        why: "“fill, then clear the obvious ones” splits into two hints instead of one journey",
        find: '    prev !== undefined && dialect.read(prev.move)?.type === "pencilAll";',
        replace: "    false;",
      },
      {
        within: "emitObviousCleanStep",
        why: "the builder is told a cleanup step was emitted when there was nothing obvious to clear",
        find: "  if (obvious.length === 0) return false;",
        replace: "  if (obvious.length === 0) return true;",
      },
      {
        within: "populateStep",
        why: "the populate opener paints a board mark, breaking the one step allowed to paint nothing",
        find: "    highlights: { area: [], targets: [], marks: [] } as unknown as H,",
        replace:
          "    highlights: { area: [{ x: 0, y: 0 }], targets: [], marks: [] } as unknown as H,",
      },
      {
        within: "keepCandidateHintTrack",
        why: "a toggle that would re-add an absent candidate counts as following the strike",
        find: '    if (!(pencil[pm.y * w + pm.x] & bit(pm.n))) return "off";',
        replace: "    if (false) return null as never;",
      },
      {
        within: "keepCandidateHintTrack",
        why: "striking an unrelated candidate counts as following the strike step",
        find: '    if (hit < 0) return "off"; // touched a non-target candidate',
        replace: '    if (false) return "off"; // touched a non-target candidate',
      },
      {
        within: "keepCandidateHintTrack",
        why: "a shrunk strike keeps highlighting the cell whose candidate the player just crossed out",
        find: "        targets: remaining.map((k) => ({ x: k.x, y: k.y })),",
        replace: "        targets: sm.marks.map((k) => ({ x: k.x, y: k.y })),",
      },
      {
        within: "refreshCandidateHintStep",
        why: "a stored mark on a cell that has since been filled is still displayed",
        find: "      ({ x, y, n }) => grid[y * w + x] === 0 && (pencil[y * w + x] & bit(n)) !== 0,",
        replace: "      ({ x, y, n }) => (pencil[y * w + x] & bit(n)) !== 0,",
      },
      {
        within: "refreshCandidateHintStep",
        why: "the populate step stays displayed after every empty cell already has notes",
        find: "    return anyEmptyLacksNotes(grid, pencil, w) ? step : null;",
        replace: "    return step;",
      },
      {
        within: "adapterOf",
        why: "a game's own move dialect is ignored in favor of the type-keyed default",
        find: "  return adapter ?? (typeKeyedCandidateMoves as unknown as CandidateMoveAdapter<M>);",
        replace:
          "  return typeKeyedCandidateMoves as unknown as CandidateMoveAdapter<M>;",
      },
      {
        within: "populateText",
        why: "the populate opener says “cell” for a game whose board positions are squares",
        find:
          "  return `Start by penciling every candidate ${noun} into each empty ${cell}, " +
          "so there is something to cross out.`;",
        replace:
          "  return `Start by penciling every candidate ${noun} into each empty cell, " +
          "so there is something to cross out.`;",
      },
    ],
  },

  {
    // The shared search behind Sixteen's and Netslide's hints. The load-bearing
    // property is not "finds a route" but **plan stability across recomputes** —
    // a plan is recomputed whenever the player goes their own way, and a first
    // move that does not provably shorten the distance to the goal is how a hint
    // ends up walking a board round a loop for ever. Cases are biased there.
    module: "src/engine/slide-planner.ts",
    cases: [
      {
        within: "toroidalDist",
        why: "distance is measured the long way round, ignoring the wrap",
        find: "  return Math.min(d, len - d);",
        replace: "  return d;",
      },
      {
        within: "slidePieces",
        why: "a row's pieces slide the opposite way to the move's delta",
        find: "      const from = (((x - delta) % w) + w) % w;",
        replace: "      const from = (((x + delta) % w) + w) % w;",
      },
      {
        within: "slidePieces",
        why: "a column's pieces slide the opposite way to the move's delta",
        find: "      const from = (((y - delta) % h) + h) % h;",
        replace: "      const from = (((y + delta) % h) + h) % h;",
      },
      {
        within: "slidePieces",
        why: "cells outside the slid line are not carried over, so the rest of the board is blanked",
        find: "  dest.set(src);",
        replace: "  void src;",
      },
      {
        // Lives in `cellBits` since the exact search stopped keying boards as
        // strings: both it and `makeKeyFn` read their cell width from here, so
        // this one defect now reaches the forward search and the exact one alike.
        within: "cellBits",
        why: "the board key is one bit too narrow, so two different boards can key alike",
        find: "  while (1 << bits <= maxValue) bits++;",
        replace: "  while (1 << bits < maxValue) bits++;",
      },
      {
        within: "makeKeyFn",
        why: "packed cells overlap in the key, so distinct boards collide and get pruned as visited",
        find: "      packed |= arr[i] << (k * bits);",
        replace: "      packed |= arr[i] << k;",
      },
      {
        within: "invert",
        why: "the backward search's edges are not reversed, so its half of the path runs the wrong way",
        find: "  return { ...m, delta: -m.delta };",
        replace: "  return { ...m };",
      },
      {
        // The stronger pruning is now *derived* — `sameLineMovesCompose` reads
        // off the move set whether two slides of one line collapse into one — so
        // the defect to plant is applying it to a game whose slides do not
        // compose, which is Netslide's ±1 move set and where a shortest path
        // really does slide one line twice running.
        within: "bidirectionalPlan",
        why: "sliding the same line twice running is pruned, so any path needing a double slide is missed",
        find: "    return strict || m.delta === -prev.delta;",
        replace: "    return true;",
      },
      {
        // **Was marked EQUIVALENT, and is not.** The earlier verdict measured
        // the right thing and stopped one question short, which is worth keeping
        // in view: taking a level's first meet rather than its cheapest was run
        // against an independent breadth-first search over 601 scrambles of a
        // 4×4 board and against the real planner over ~3,900 more, and never
        // once returned a non-shortest path. Re-measured over another 352 boards
        // during the search rewrite (2026-09-08): still never. The reason is
        // sound — the search always grows the *smaller* frontier, so the two
        // depths stay within one of each other and a level's meets sit at the
        // same other-side depth.
        //
        // But path length is not the only thing this edit changes. Answering
        // mid-level also answers *before the next budget check*, so a search that
        // should have given up returns a path instead. A differential of the
        // rewritten search against the old one caught exactly that: of 426
        // boards, the two agreed move for move everywhere except two, both of
        // them in the budget-exhausted regime, where the mutant answered and the
        // original refused. That is a real difference in a real code path — the
        // budget exists precisely because these searches do run out — and
        // nothing in the suite sees it. So it is carried as a genuine SURVIVED
        // rather than excused.
        //
        // Nothing cheap catches it, and that was measured too: the planner's own
        // suite is green under this mutation, and a purpose-built guard checking
        // exact plans against an independent BFS over 352 boards was green as
        // well, at 13.7 s. A guard for it would have to reach a board where a
        // level's meets straddle the state cap.
        within: "bidirectionalPlan",
        why: "the first meet in a level is taken rather than the cheapest, so the search answers before its budget check and can return a path where it should refuse",
        find:
          "        const met = other.find(hash);\n" +
          "        if (met >= 0 && depth + other.depth[met] < bestTotal) {",
        replace:
          "        const met = other.find(hash);\n" +
          "        if (met >= 0 && bestFwd < 0) {",
      },
      {
        within: "planSlides",
        why: "a board that is already finished is reported as a partial plan",
        find: "    return { moves: [], reachedGoal: true };",
        replace: "    return { moves: [], reachedGoal: false };",
      },
      {
        // EQUIVALENT. `isGoal` is read at exactly two sites and both spell it
        // `h === 0 || isGoal(board)`, so the default is only ever consulted on a
        // board whose heuristic is *non-zero* — and `heuristic` is contractually
        // "zero at `goal`". A game that supplies no `isGoal` therefore never
        // reaches the default, and a game that supplies one (Netslide, whose win
        // condition is weaker than the goal board) is covered by the test above
        // it. The default stays because it is what makes `isGoal` optional at
        // all; asserting it would mean asserting a board that cannot occur.
        within: "planSlides",
        why: "the default goal test never fires, so every plan on a game without one is partial",
        equivalent: true,
        find: "  const isGoal = p.isGoal ?? ((board: Int32Array) => arrayToKey(board) === goalKey);",
        replace: "  const isGoal = p.isGoal ?? ((): boolean => false);",
      },
      {
        // This case used to plant the opposite defect — the exact search running
        // up front for a game that had asked to keep it in reserve — back when a
        // game could ask. Keeping it in reserve *is* the defect
        // (`fix-sixteen-hint-recompute-stability`), so what is worth planting now
        // is the search failing to run at all.
        within: "planSlides",
        why: "a game that asked for the exact search never gets it, so every board past the heuristic's reach falls back to a partial plan",
        find: "  if (p.exactSearch) {",
        replace: "  if (false) {",
      },
      {
        within: "planSlides",
        why: "the queue forgets a newly-cheaper f, so nodes below the current minimum are never popped",
        find: "    if (node.f < minF) minF = node.f;",
        replace: "    if (false) minF = node.f;",
      },
      {
        within: "planSlides",
        why: "the partial plan is routed to the worst board the search saw rather than the best",
        find: "    if (curr.h < bestNode.h) bestNode = curr;",
        replace: "    if (curr.h > bestNode.h) bestNode = curr;",
      },
      {
        within: "planSlides",
        why: "the game's veto on the opening move is applied at every depth, not just the first",
        find: "      if (curr.g === 0 && p.rejectFirstMove?.(move)) continue;",
        replace: "      if (p.rejectFirstMove?.(move)) continue;",
      },
      {
        within: "planSlides",
        why: "the search is greedy best-first rather than A*, so moves already spent stop counting",
        find: "        f: nextG + nextH,",
        replace: "        f: nextH,",
      },
      // Two cases retired here with the code they planted defects in, and
      // nothing is left uncovered by their going: the no-progress gate
      // (`const noProgress = bestNode.move === null;`) and the `usedExactSearch`
      // flag are both deleted, the first because gating the exact search is the
      // defect and the second because it existed only so a game's tests could
      // assert the gate still gated. There is no remaining configuration for
      // them to be the only case for.
      {
        within: "planSlides",
        why: "the forward path is handed back leaf-first, so the plan plays in reverse",
        find: "    return path.reverse();",
        replace: "    return path;",
      },
      {
        within: "bidirectionalPlan",
        why: "the bidirectional path's forward half is not reversed before its backward half is appended",
        find: "    path.reverse();",
        replace: "    void path;",
      },
      {
        // The one that actually happened, and the reason the deep search's
        // database is asserted directly rather than through its answers. It does
        // not break anything — it makes half the database unmatchable, so the
        // search returns "no plan" for boards it holds, which is indistinguishable
        // from a search that cannot reach far enough. It produced a confident
        // wrong conclusion about Sixteen's endgame before a referee caught it.
        within: "hash",
        why: "the database's key is narrowed on the way in and compared unsigned on the way out, so half of it is invisible",
        find: "    return hash | 0;",
        replace: "    return hash >>> 0;",
      },
      {
        within: "sameLineMovesCompose",
        why: "slides of one line are assumed to compose for every game, so a shortest path that slides one line twice running is pruned away from the games whose moves do not",
        find: "        if (sum !== 0 && !deltas.has(sum)) return false;",
        replace: "        if (false) return false;",
      },
      {
        within: "deepPlan",
        why: "the deep search stops one ply short, so the boards it exists for stay out of reach",
        find: "    if (depth === caps.forwardDepth || depth + 1 >= bestTotal) return;",
        replace:
          "    if (depth + 1 >= caps.forwardDepth || depth + 1 >= bestTotal) return;",
      },
    ],
  },

  {
    // The shared random-loop generator. Per corpus rule 2 the cases stay off the
    // draw order and off *which* loop comes out — that is Pearl's differential's
    // guarantee, by design — and aim instead at the two things this module owns
    // locally: the coloring is a single closed loop, and the bias protocol is
    // the sequence the doc comment promises.
    //
    // Two candidates were written, measured and **removed** for being on the
    // wrong side of that line: reversing `faceScore`'s sign, and counting
    // opposite-colored neighbors in `faceNumNeighbors`. Both survive the local
    // tests and should: they change which loop a seed yields, not whether it is
    // one. Carrying them would have manufactured findings the `repo-layout`
    // requirement says belong elsewhere — and elsewhere does catch them, checked
    // rather than assumed: under the `faceScore` reversal
    // `pearl-differential.test.ts` goes from 14 passed / 1 skipped to 7 failed,
    // one per desc byte-match fixture. `loopgen.test.ts`'s header records the
    // same split for a reader who arrives from the other direction.
    module: "src/engine/loopgen.ts",
    cases: [
      {
        within: "faceColor",
        why: "the infinite exterior reads as inside, so the boundary is drawn round the wrong side",
        find: "  return f === null ? FACE_BLACK : board[f.index];",
        replace: "  return f === null ? FACE_WHITE : board[f.index];",
      },
      {
        within: "canColorFace",
        why: "a face need not touch its own color, so a region can start anywhere and the loop breaks into pieces",
        find: "  if (!foundSame) return false;",
        replace: "  if (false) return false;",
      },
      {
        // EQUIVALENT, argued and then measured. `transitions` counts state
        // changes around a *closed* walk, so it is always even and only `0` is
        // newly admitted — and `0`, given the `foundSame` precondition above it,
        // means the face is a lone gray hole entirely enclosed by `color`. The
        // algorithm appears never to make one: candidacy is refreshed for every
        // face touching a newly-colored one, edge *or* corner, so an enclosed
        // region's last gray face is colored while its boundary still has two
        // transitions. "Appears" is doing real work in that sentence, so it was
        // measured rather than asserted — 1,319 (tiling, size, seed) runs across
        // all eleven periodic tilings `gridNew` builds without a description,
        // byte-identical colorings throughout. The sweep's own sensitivity was
        // checked first: changing the random-flip pass's acceptance moves 1,310
        // of those 1,319 rows.
        within: "canColorFace",
        why: "a coloring with fewer than two transitions is allowed, so a face can be walled off inside the wrong region",
        equivalent: true,
        find: "  return transitions === 2;",
        replace: "  return transitions <= 2;",
      },
      {
        within: "canColorFace",
        why: "the transition walk stops at two rather than past them, so a four-transition face passes the test",
        find: "        if (transitions > 2) break;",
        replace: "        if (transitions >= 2) break;",
      },
      {
        within: "generateLoop",
        why: "no face is seeded white, so there is no inside and no boundary at all",
        find: "  board[randomUpto(rng, numFaces)] = FACE_WHITE;",
        replace: "  board[randomUpto(rng, numFaces)] = FACE_BLACK;",
      },
      {
        // EQUIVALENT on the evidence, and the weaker of the two arguments here:
        // the observation is simply that the two candidate lists empty on the
        // same iteration, over the same 1,319-run sweep described above, so
        // stopping on either is stopping on both. There is no proof offered that
        // they must — which is precisely why this stays in the corpus rather
        // than being deleted. A tiling on which one list empties first would
        // leave faces gray, and the harness reporting this case as CAUGHT is how
        // that would announce itself. Loopy's generator also throws outright on a
        // gray face, so the consumer side is guarded independently.
        within: "generateLoop",
        why: "coloring stops as soon as either list empties, leaving faces gray",
        equivalent: true,
        find: "    if (cLight === 0 && cDark === 0) break; // no more faces we can use",
        replace:
          "    if (cLight === 0 || cDark === 0) break; // no more faces we can use",
      },
      {
        within: "generateLoop",
        why: "a face just colored stays in the other candidate list and can be colored again",
        find: "    lightable.delete(i);\n    darkable.delete(i);",
        replace: "    lightable.delete(i);",
      },
      {
        within: "generateLoop",
        why: "colorability is recomputed for the already-colored neighbors instead of the gray ones",
        find: "        if (faceColor(board, f) !== FACE_GRAY) continue;",
        replace: "        if (faceColor(board, f) === FACE_GRAY) continue;",
      },
      {
        within: "generateLoop",
        why: "tendrils grow from faces with two opposite neighbors, not one, so a flip can cut the loop",
        find: "        } else if (faceNumNeighbors(board, face, opp) === 1) {",
        replace: "        } else if (faceNumNeighbors(board, face, opp) === 2) {",
      },
      {
        within: "generateLoop",
        why: "a face tried tentatively for the bias is left colored, so later candidates are scored against a dirty board",
        find: "        board[fi] = FACE_GRAY;\n        bias(board, fi); // let bias know we put it back",
        replace: "        bias(board, fi); // let bias know we put it back",
      },
      {
        within: "generateLoop",
        why: "the bias is not told the tentative color was taken back, so its incremental state drifts",
        find: "        bias(board, fi); // let bias know we put it back",
        replace: "        void fi; // let bias know we put it back",
      },
      {
        within: "generateLoop",
        why: "the bias is never told which face was actually committed",
        find: "    if (bias) bias(board, i); // notify bias of the change",
        replace: "    void i; // notify bias of the change",
      },
    ],
  },

  {
    // The grid module's only floating-point code, and **display/input only** —
    // `gridNearestEdge` decides which edge a click lands on, `gridFindIncenter`
    // where a clue digit is drawn. Neither reaches a description, a generator or
    // a solver, which is the boundary that makes float arithmetic safe here and
    // the reason none of these cases belongs to a differential.
    module: "src/engine/grid/grid-geometry.ts",
    cases: [
      {
        within: "pointLineDistance",
        why: "perpendicular distance is left as twice the triangle area, so edge length skews which edge a click picks",
        find: "  return det / Math.sqrt(sq(ax - bx) + sq(ay - by));",
        replace: "  return det;",
      },
      {
        within: "gridNearestEdge",
        why: "an edge the click is off the far end of is eligible again",
        find: "    if (a2 >= e2 + b2) continue;",
        replace: "    if (false) continue;",
      },
      {
        within: "gridNearestEdge",
        why: "an edge the click is off the near end of is eligible again",
        find: "    if (b2 >= e2 + a2) continue;",
        replace: "    if (false) continue;",
      },
      {
        within: "gridNearestEdge",
        why: "the half-edge-length cut goes, so a click anywhere off the board still toggles an edge",
        find: "    if (4 * sq(dist) > e2) continue;",
        replace: "    if (false) continue;",
      },
      {
        within: "gridNearestEdge",
        why: "an exact tie goes to the highest-index edge, so a click on a vertex toggles a different one",
        find: "    if (bestEdge === null || dist < bestDistance) {",
        replace: "    if (bestEdge === null || dist <= bestDistance) {",
      },
      {
        within: "gridFindIncenter",
        why: "the incenter is recomputed on every request rather than read from the face",
        find: "  if (f.hasIncenter) return;",
        replace: "  if (false) return;",
      },
      {
        within: "gridFindIncenter",
        why: "the incenter is computed but never marked cached",
        find: "  f.hasIncenter = true;",
        replace: "  f.hasIncenter = false;",
      },
      {
        within: "gridFindIncenter",
        why: "the incenter's x is stored with the C's `(int)(v + 0.5)`, which truncates toward zero and so misplaces a clue digit by up to a unit on the negative coordinates a grid mostly has",
        find: "  f.ix = Math.round(xBest);",
        replace: "  f.ix = Math.trunc(xBest + 0.5);",
      },
      {
        within: "gridFindIncenter",
        why: "a face with no interior point found silently reports the origin instead of failing",
        find: "  if (!(bestDist > 0)) {",
        replace: "  if (false) {",
      },
      {
        within: "pointInFace",
        why: "the crossing test's y interval is open at both ends, so a vertex on the ray is miscounted",
        find: "    if ((y >= ys && y < ye) || (y >= ye && y < ys)) {",
        replace: "    if ((y > ys && y < ye) || (y > ye && y < ys)) {",
      },
      {
        within: "pointInFace",
        why: "the crossing test's denominator is left negative, flipping the inequality on downward edges",
        find: "      if (denom < 0) {\n        num = -num;\n        denom = -denom;\n      }",
        replace:
          "      if (false) {\n        num = -num;\n        denom = -denom;\n      }",
      },
      {
        // EQUIVALENT, and the argument is the classic one for ray casting: the
        // horizontal line through the point crosses a closed polygon an even
        // number of times, so the crossings to the left and the crossings to the
        // right have the *same parity*. Counting either answers the same
        // question. The direction is worth naming in the doc comment — it is how
        // a reader checks the tie handling — but it is not a decision the result
        // depends on.
        within: "pointInFace",
        why: "the ray is cast to the left instead of the right, inverting inside and outside",
        equivalent: true,
        find: "      if ((x - xs) * denom >= (y - ys) * num) inside = !inside;",
        replace: "      if ((x - xs) * denom <= (y - ys) * num) inside = !inside;",
      },
      {
        within: "minSquaredDistanceToBoundary",
        why: "the distance to the boundary takes the furthest corner rather than the nearest",
        find: "    if (mindist > dist) mindist = dist;",
        replace: "    if (mindist < dist) mindist = dist;",
      },
      {
        within: "minSquaredDistanceToBoundary",
        why: "an edge whose perpendicular foot lies outside the segment still counts, understating the room available",
        find: "    if (pde > 0 && pde < ede) {",
        replace: "    if (true) {",
      },
      // The next three are EQUIVALENT for one shared reason, which the module's
      // own doc comment states outright: "a near-singular system yields a wild
      // candidate point, which the point-in-polygon and minimum-distance vetting
      // then discards". Removing a guard turns a *rejected* subset into a `NaN`
      // or infinite candidate, and `pointInFace` answers false for both — every
      // comparison against `NaN` is false, and an infinite x makes the crossing
      // test fire on every edge spanning the point's y, which is an even number
      // of them. So the guards are an economy, not a correctness measure, and
      // they stay because a wild number propagating is worse to debug than a
      // subset skipped. Their being *caught* would mean a candidate now survives
      // vetting, which is the thing worth hearing about.
      {
        within: "solveQuadraticPoints",
        why: "a quadratic with no real root yields NaN candidate points instead of none",
        equivalent: true,
        find: "  if (!(disc >= 0)) return [];",
        replace: "  if (false) return [];",
      },
      {
        within: "solve2x2Matrix",
        why: "a singular 2x2 system is inverted anyway, so three collinear dots yield an infinite candidate",
        equivalent: true,
        find: "  const det = mx[0] * mx[3] - mx[1] * mx[2];\n  if (det === 0) return null;",
        replace:
          "  const det = mx[0] * mx[3] - mx[1] * mx[2];\n  if (false) return null;",
      },
      {
        within: "solve3x3Matrix",
        why: "a singular 3x3 system is inverted anyway, so three parallel edges yield an infinite candidate",
        equivalent: true,
        find: "  if (det === 0) return null;\n\n  const inv = [",
        replace: "  if (false) return null;\n\n  const inv = [",
      },
      {
        within: "gridFindIncenter",
        why: "the 3-subset enumeration never starts at a vertex, so vertex-led candidate points are missed",
        find: "  for (let i = 0; i + 2 < 2 * order; i++) {",
        replace: "  for (let i = 0; i + 2 < order; i++) {",
      },
    ],
  },

  {
    module: "src/engine/grid/grid-core.ts",
    cases: [
      {
        within: "makeConsistent",
        why: "two faces sharing a dot pair get two edges instead of one shared edge",
        find: "      const found = edgeByDots.get(key);",
        replace: "      const found = undefined;",
      },
      {
        within: "makeConsistent",
        why: "the edge dedup key collides, so unrelated dot pairs share an edge",
        find: "      const key = lo * numDots + hi;",
        replace: "      const key = lo + hi;",
      },
      {
        within: "makeConsistent",
        why: "a dot's degree is counted from one endpoint only, halving its edge list",
        find: "    e.dot1.order++;\n    e.dot2.order++;",
        replace: "    e.dot1.order++;",
      },
      {
        within: "makeConsistent",
        why: "the anticlockwise walk is dropped, so a boundary dot's face list stays half-empty",
        find: "    // clockwise search",
        replace: "    if (d.order > 0) continue;\n    // clockwise search",
      },
    ],
  },
];
