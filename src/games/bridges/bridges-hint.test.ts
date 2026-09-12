/**
 * Bridges' explained hint: the per-game half of the guarantees.
 *
 * The cross-game guards already walk every tier for voice, length, marks,
 * overlay repaint, purity and resume (`engine/hint-*.test.ts`, enrolled by the
 * `hint()` declaration alone). What is here is what only this game can say:
 * which premises its corpus reaches, that its one reason-less rule is the
 * bookkeeping mark and nothing else, that a firing's sentence and its picture
 * hold the same numbers, and that the plan's own moves solve a real board
 * through the real `executeMove`.
 */
import { describe, expect, it } from "vitest";
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import {
  ALREADY_SOLVED,
  CONTRADICTION_UNLOCALIZED,
  FIX_MISTAKES_FIRST,
} from "../../engine/hint-refusal.ts";
import { randomNew } from "../../engine/random/index.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import { newBridgesDesc } from "./generator.ts";
import { type BridgesHighlights, narrate } from "./hint.ts";
import { say } from "./hint-text.ts";
import { bridgesGame } from "./index.ts";
import {
  type BridgesFiring,
  type BridgesReason,
  type BridgesSpan,
  bridgesRecordingPass,
} from "./solver.ts";
import {
  BRIDGES_PRESETS,
  type BridgesMove,
  type BridgesParams,
  type BridgesState,
  G_LINEH,
  G_LINEV,
  type Island,
  newStateFromDesc,
} from "./state.ts";

type Kind = BridgesReason["kind"];

/**
 * Every premise the recording projection can speak, as a total record: adding
 * a variant fails to compile until the census below lists it, which is what
 * stops a new arm shipping unreached and unread
 * (docs/games/hints.md § "Census the reasons, not only the rungs").
 */
const REASON_KINDS: Record<Kind, true> = {
  exactSpace: true,
  everyNeighbor: true,
  wouldCloseLoop: true,
  needsThisWay: true,
  wouldSealGroup: true,
  wouldStarve: true,
  mustReachOut: true,
};

/**
 * The premise no *shipped* board can reach, with its reason. Every preset
 * Bridges offers has `allowloops` on, and the loop rung is the only one that
 * asks whether they are off, so the whole ladder can be certified by
 * `bridges-ladder.test.ts` and this arm still never speak. It is covered
 * instead by the loops-forbidden shapes below, which a player reaches through
 * the Type dialog.
 */
const UNREACHED_BY_PRESETS: Kind[] = ["wouldCloseLoop"];

/** Five, because the two connectivity arms are the rare ones: `mustReachOut`
 * fires on roughly one board in ten and three seeds miss it outright. */
const SEEDS = ["bh-a", "bh-b", "bh-c", "bh-d", "bh-e"];

/** The shipped presets, plus the axes the Type dialog varies that the ladder
 * reads: loops forbidden, and the two extremes of `maxb`. */
const SHAPES: { label: string; params: BridgesParams; shipped: boolean }[] = [
  ...BRIDGES_PRESETS.map((params) => ({
    label: bridgesGame.encodeParams(params, true),
    params,
    shipped: true,
  })),
  {
    label: "7x7 no loops",
    params: { ...BRIDGES_PRESETS[2], allowloops: false },
    shipped: false,
  },
  {
    label: "15x15 no loops, maxb 4",
    params: { ...BRIDGES_PRESETS[8], allowloops: false, maxb: 4 },
    shipped: false,
  },
  {
    label: "15x15 maxb 1",
    params: { ...BRIDGES_PRESETS[8], maxb: 1 },
    shipped: false,
  },
];

function makeBoard(params: BridgesParams, seed: string): BridgesState {
  const { desc } = newBridgesDesc(params, randomNew(seed));
  return newStateFromDesc(params, desc);
}

/** Every firing the deduction makes on this board, hidden ones included, plus
 * the island list a reason's `island` index names. */
function allFirings(
  params: BridgesParams,
  seed: string,
): { firings: BridgesFiring[]; status: string; islands: Island[] } {
  const start = makeBoard(params, seed);
  const work = start.workingCopy();
  const pass = bridgesRecordingPass(
    work,
    params.difficulty,
    stepBudget("bridges test"),
  );
  const r = deduceHintPlan<BridgesState, BridgesFiring, string>({
    board: work,
    status: () => (pass.impossible() ? "broken" : pass.solved() ? "done" : "open"),
    incomplete: "open",
    next: () => pass.next(),
    showable: () => true,
  });
  return { firings: r.plan, status: r.status, islands: start.islands };
}

/** How many bridges run along this span on `state`. */
function spanBridges(state: BridgesState, span: BridgesSpan): number {
  const dx = Math.sign(span.x2 - span.x1);
  const dy = Math.sign(span.y2 - span.y1);
  return state.gridCount(span.x1 + dx, span.y1 + dy, dx ? G_LINEH : G_LINEV);
}

describe("the corpus reaches every premise, and the ledger says which it cannot", () => {
  const shipped = new Map<Kind, number>();
  const all = new Map<Kind, number>();
  let firingCount = 0;
  let stalled = 0;
  for (const { params, shipped: isShipped } of SHAPES) {
    for (const seed of SEEDS) {
      const { firings, status } = allFirings(params, seed);
      if (status !== "done") stalled++;
      for (const f of firings) {
        firingCount++;
        if (!f.reason) continue;
        all.set(f.reason.kind, (all.get(f.reason.kind) ?? 0) + 1);
        if (isShipped)
          shipped.set(f.reason.kind, (shipped.get(f.reason.kind) ?? 0) + 1);
      }
    }
  }

  it("looked at enough firings to mean anything", () => {
    // The vacuity guard: every assertion below passes over an empty census.
    expect(firingCount).toBeGreaterThan(2000);
    expect(stalled, "a board the deduction could not finish").toBe(0);
  });

  it("every premise fires somewhere in the corpus", () => {
    expect(Object.keys(REASON_KINDS).filter((k) => !all.has(k as Kind))).toEqual([]);
  });

  it("the shipped presets reach everything but the ledgered arm", () => {
    const missing = (Object.keys(REASON_KINDS) as Kind[]).filter(
      (k) => !shipped.has(k),
    );
    // Exactly the ledger, in both directions: an arm that starts firing on a
    // shipped board fails here just as loudly as one that stops.
    expect(missing.sort()).toEqual([...UNREACHED_BY_PRESETS].sort());
    // And the ledger's reason is derived rather than observed: the loop rung
    // returns at once when loops are allowed, and every preset allows them. A
    // preset that stopped allowing them would make the entry wrong, and this is
    // what notices.
    expect(BRIDGES_PRESETS.every((p) => p.allowloops)).toBe(true);
  });
});

describe("what the plan shows, and what it keeps to itself", () => {
  it("a reason-less firing is only ever the bookkeeping mark", () => {
    let hidden = 0;
    for (const { params } of SHAPES) {
      for (const seed of SEEDS) {
        for (const f of allFirings(params, seed).firings) {
          if (f.reason) continue;
          hidden++;
          // Nothing but `M`, which is what the fork's auto-mark aid already
          // draws: the island's own digit against its own bridges says it.
          expect(f.ops.every((op) => op.op === "M")).toBe(true);
        }
      }
    }
    expect(hidden, "no hidden firing to judge").toBeGreaterThan(500);
  });

  it("one firing is one step: every move in it runs from one island", () => {
    let multi = 0;
    let steps = 0;
    for (const { params } of SHAPES) {
      for (const seed of SEEDS) {
        const { firings, islands } = allFirings(params, seed);
        for (const f of firings) {
          if (!f.reason) continue;
          steps++;
          const focus = islands[f.reason.island];
          const spans = f.ops.filter((op) => op.op === "L" || op.op === "N");
          if (spans.length > 1) multi++;
          for (const op of spans) {
            expect(
              op.x1 === focus.x && op.y1 === focus.y,
              "a step carries a move from an island its premise is not about",
            ).toBe(true);
          }
        }
      }
    }
    // Not vacuous in either direction: some steps really do force several
    // bridges at once, which is what makes the single-origin claim worth
    // asserting rather than trivially true. Deleting the recorder's
    // per-premise early return in `Solver.ladder`'s sweep turns this red.
    expect(steps).toBeGreaterThan(1000);
    expect(multi).toBeGreaterThan(100);
  });

  it("the sentence's numbers are the picture's", () => {
    const seen = new Set<Kind>();
    for (const { params } of SHAPES) {
      for (const seed of SEEDS) {
        // A player board advanced by the plan's own moves, so a count is read
        // off the board as it was when the firing spoke.
        let player = makeBoard(params, seed);
        for (const f of allFirings(params, seed).firings) {
          const r = f.reason;
          if (r) {
            seen.add(r.kind);
            if (r.kind === "exactSpace") {
              const added = f.ops.reduce(
                (n, op) => (op.op === "L" ? n + op.n - spanBridges(player, op) : n),
                0,
              );
              expect(added, "the bridges drawn are not the ones counted").toBe(
                r.missing,
              );
            }
            if (r.kind === "everyNeighbor") {
              expect(r.ev.islands.length).toBe(r.neighbors);
            }
            if (r.kind === "wouldSealGroup" || r.kind === "mustReachOut") {
              expect(r.ev.islands.length).toBe(r.group);
            }
          }
          player = bridgesGame.executeMove(player, { ops: f.ops });
        }
      }
    }
    expect(seen.size, "no firing carried a reason").toBe(
      Object.keys(REASON_KINDS).length,
    );
  });

  it("the shown steps alone solve the board", () => {
    for (const { label, params } of SHAPES) {
      for (const seed of SEEDS) {
        let player = makeBoard(params, seed);
        for (const f of allFirings(params, seed).firings) {
          if (!f.reason) continue;
          player = bridgesGame.executeMove(player, { ops: f.ops });
        }
        // Every hidden firing is a mark, and `map_check` does not read marks —
        // so hiding them cannot cost the player the win (`engine/hint-plan.ts`:
        // never hide a change the win condition needs).
        expect(player.completed, `${label} ${seed} did not finish`).toBe(true);
      }
    }
  });

  it("never asks for a bridge across a cross the player has drawn", () => {
    // `interpretMove` refuses a bridge over a no-line, so a step asking for one
    // would be a move the player cannot make. The working copy keeps their
    // crosses, which zeroes `possibles` and takes the span out of the ladder.
    const params = BRIDGES_PRESETS[2];
    const start = makeBoard(params, "bh-a");
    const first = bridgesGame.hint?.(start, undefined, bridgesGame.newUi(start));
    expect(first?.ok).toBe(true);
    if (!first?.ok) return;
    const target = first.steps[0].move.ops.find((op) => op.op === "L");
    expect(target).toBeDefined();
    if (target?.op !== "L") return;
    const crossed = bridgesGame.executeMove(start, {
      ops: [{ op: "N", x1: target.x1, y1: target.y1, x2: target.x2, y2: target.y2 }],
    });
    const again = bridgesGame.hint?.(crossed, undefined, bridgesGame.newUi(crossed));
    if (!again?.ok) return;
    for (const step of again.steps) {
      for (const op of step.move.ops) {
        if (op.op !== "L") continue;
        const sameSpan =
          (op.x1 === target.x1 &&
            op.y1 === target.y1 &&
            op.x2 === target.x2 &&
            op.y2 === target.y2) ||
          (op.x1 === target.x2 &&
            op.y1 === target.y2 &&
            op.x2 === target.x1 &&
            op.y2 === target.y1);
        expect(sameSpan, "the hint asked for a bridge the game would refuse").toBe(
          false,
        );
      }
    }
  });
});

describe("following a step", () => {
  const params = BRIDGES_PRESETS[2];
  const start = makeBoard(params, "bh-a");
  const ui = bridgesGame.newUi(start);

  it("shrinks in place while the player draws, then completes", () => {
    const r = bridgesGame.hint?.(start, undefined, ui);
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    // A step whose one premise forces more than one bridge is the interesting
    // case, and it is what every board this generator makes opens with.
    const step = r.steps.find(
      (s) => s.move.ops.filter((op) => op.op === "L").length > 1,
    );
    expect(step, "no multi-bridge step in the opening plan").toBeDefined();
    if (!step) return;

    let state = start;
    let verdict: string | undefined;
    let legs = 0;
    while (legs < 20) {
      const op = step.move.ops.find((o) => o.op === "L");
      if (op?.op !== "L") break;
      legs++;
      // One drag adds one bridge, and the player drags from whichever end they
      // like, so the move is deliberately the reverse of the recorded op.
      const move: BridgesMove = {
        ops: [
          {
            op: "L",
            x1: op.x2,
            y1: op.y2,
            x2: op.x1,
            y2: op.y1,
            n: spanBridges(state, op) + 1,
          },
        ],
      };
      verdict = bridgesGame.hintKeepTrack?.(move, step, state);
      state = bridgesGame.executeMove(state, move);
      if (verdict === "completed") break;
      expect(verdict, `leg ${legs}`).toBe("onTrack");
    }
    expect(verdict).toBe("completed");
    expect(legs, "the step never shrank").toBeGreaterThan(1);
  });

  it("calls an unrelated move off-plan", () => {
    const r = bridgesGame.hint?.(start, undefined, ui);
    expect(r?.ok, "no plan to go off").toBe(true);
    const step = r?.ok ? r.steps[0] : undefined;
    // Every island the step's own move does not touch, that still has a
    // neighbor to bridge to: the moves a player might make instead.
    const elsewhere = start.islands.filter(
      (is) =>
        !step?.move.ops.some(
          (op) => op.op !== "S" && op.op !== "M" && op.x1 === is.x && op.y1 === is.y,
        ) && is.points.some((pt) => pt.off > 0),
    );
    expect(elsewhere.length, "no unrelated move to try").toBeGreaterThan(4);
    let checked = 0;
    for (const is of elsewhere) {
      const pt = is.points.find((p) => p.off > 0);
      if (!pt || !step) continue;
      checked++;
      const move: BridgesMove = {
        ops: [
          {
            op: "L",
            x1: is.x,
            y1: is.y,
            x2: is.x + pt.off * pt.dx,
            y2: is.y + pt.off * pt.dy,
            n: 1,
          },
        ],
      };
      expect(bridgesGame.hintKeepTrack?.(move, step, start)).toBe("off");
    }
    expect(checked).toBe(elsewhere.length);
  });
});

describe("refusing", () => {
  const params = BRIDGES_PRESETS[2];
  const start = makeBoard(params, "bh-a");
  const ui = bridgesGame.newUi(start);

  it("refuses a solved board with the collection's wording", () => {
    const solved = bridgesGame.solve?.(start, start);
    expect(solved?.ok).toBe(true);
    if (!solved?.ok) return;
    const done = bridgesGame.executeMove(start, solved.move);
    expect(bridgesGame.hint?.(done, undefined, ui)).toEqual({
      ok: false,
      error: ALREADY_SOLVED,
    });
  });

  it("refuses a board with a wrong bridge on it", () => {
    const is = [...start.islands]
      .sort((a, b) => a.count - b.count)
      .find((i) => i.points.filter((p) => p.off > 0).length > 1);
    expect(is).toBeDefined();
    if (!is) return;
    let wrong = start;
    for (const pt of is.points) {
      if (!pt.off) continue;
      wrong = bridgesGame.executeMove(wrong, {
        ops: [
          {
            op: "L",
            x1: is.x,
            y1: is.y,
            x2: is.x + pt.off * pt.dx,
            y2: is.y + pt.off * pt.dy,
            n: params.maxb,
          },
        ],
      });
    }
    expect(bridgesGame.findMistakes?.(wrong).length).toBeGreaterThan(0);
    expect(bridgesGame.hint?.(wrong, undefined, ui)).toEqual({
      ok: false,
      error: FIX_MISTAKES_FIRST,
    });
  });

  it("refuses an annotation `findMistakes` cannot see, and says so honestly", () => {
    // Marking an island complete before it is locks bridges it still needs. No
    // entry is wrong, so there is nothing to highlight and `FIX_MISTAKES_FIRST`
    // would promise a highlight that never comes.
    const first = start.islands[0];
    const marked = bridgesGame.executeMove(start, {
      ops: [{ op: "M", x: first.x, y: first.y }],
    });
    expect(bridgesGame.findMistakes?.(marked).length).toBe(0);
    expect(bridgesGame.hint?.(marked, undefined, ui)).toEqual({
      ok: false,
      error: CONTRADICTION_UNLOCALIZED,
    });
  });
});

describe("the sentences at their extremes", () => {
  // The only instrument that can read a sentence a board never produces
  // (docs/games/hints.md § "Census the reasons, not only the rungs").
  it("reads correctly at the smallest and largest values", () => {
    expect(say.exactSpace(1, 1)).toContain("one more bridge");
    expect(say.exactSpace(16, 8)).toContain("8 more bridges");
    expect(say.everyNeighbor(1, 1)).toContain("just one neighbor");
    expect(say.everyNeighbor(4, 2)).toContain("either neighbor");
    expect(say.everyNeighbor(16, 4)).toContain("any 3 of its 4 neighbors");
    expect(say.needsThisWay(3, 0)).toContain("no bridges at all");
    expect(say.needsThisWay(3, 1)).toContain("at most 1 bridge from");
    expect(say.needsThisWay(3, 2)).toContain("at most 2 bridges from");
    expect(say.wouldSealGroup(2)).toContain("these 2 islands");
    expect(say.wouldStarve(5, true)).toContain("this 5 itself");
    expect(say.wouldStarve(5, false)).toContain("the outlined island");
    for (const s of [
      say.exactSpace(16, 8),
      say.everyNeighbor(16, 4),
      say.wouldCloseLoop,
      say.needsThisWay(16, 12),
      say.wouldSealGroup(64),
      say.wouldStarve(16, false),
      say.mustReachOut(16),
    ]) {
      expect(s.length, s).toBeLessThanOrEqual(120);
    }
  });

  it("names the starved island only when one is outlined", () => {
    // The sentence's self arm and the picture's filter run the same test, so
    // "the outlined island" is never spoken over an empty outline.
    const state = makeBoard(BRIDGES_PRESETS[2], "bh-a");
    expect(
      narrate(state, {
        kind: "wouldStarve",
        island: 0,
        ev: { islands: [0], spans: [] },
      }),
    ).toContain("itself");
    expect(
      narrate(state, {
        kind: "wouldStarve",
        island: 0,
        ev: { islands: [1], spans: [] },
      }),
    ).toContain("the outlined island");
  });
});

describe("the marks", () => {
  it("marks an island for every step, and never twice", () => {
    let recolored = 0;
    let outlined = 0;
    for (const { params } of SHAPES) {
      for (const seed of SEEDS) {
        let state = makeBoard(params, seed);
        for (let step = 0; step < 40; step++) {
          const r = bridgesGame.hint?.(state, undefined, bridgesGame.newUi(state));
          if (!r?.ok) break;
          const hl = r.steps[0].highlights as BridgesHighlights;
          expect(hl.targets.length, "a step that decides nothing").toBeGreaterThan(0);
          // Something beside the action is always marked, so the premise is
          // never carried by the sentence alone.
          expect(
            hl.focus !== null || hl.islands.length > 0,
            "a step with no island marked",
          ).toBe(true);
          // And never both ways at once: an island is the one the words name,
          // or one of the ones they outline.
          expect(
            hl.islands.some((i) => i.x === hl.focus?.x && i.y === hl.focus?.y),
          ).toBe(false);
          if (hl.focus) recolored++;
          if (hl.islands.length > 0) outlined++;
          state = bridgesGame.executeMove(state, r.steps[0].move);
        }
      }
    }
    expect(recolored).toBeGreaterThan(100);
    expect(outlined).toBeGreaterThan(100);
  });

  it("outlines a group whenever a sentence counts one", () => {
    let seen = 0;
    let empty = 0;
    for (const { params } of SHAPES) {
      for (const seed of SEEDS) {
        const { firings } = allFirings(params, seed);
        for (const f of firings) {
          const r = f.reason;
          if (r?.kind !== "mustReachOut") continue;
          seen++;
          // "the outlined group" has to be something: the source island is
          // recolored rather than outlined here, so the group must hold more
          // than it.
          if (r.ev.islands.filter((i) => i !== r.island).length === 0) empty++;
        }
      }
    }
    expect(seen, "the corpus produced no group-sealing step").toBeGreaterThan(0);
    expect(empty, "a step said 'the outlined group' over nothing").toBe(0);
  });
});
