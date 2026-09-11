/**
 * The equivalence harness every `runDeductionFixpoint` adoption is proved with.
 *
 * **Why an adoption needs more than its differential.** The obvious proof that
 * re-plumbing a hand-written ladder onto the shared runner changed nothing is
 * that the game's byte-match fixtures did not move. Tracks showed that is
 * necessary and not sufficient: **deleting one of its eight rungs entirely, from
 * either version, left all its tests green** — not because the
 * differential is weak (mis-declaring a rung's *tier* turns eight of its cases
 * red) but because that rung fires on no board the generator produces. A corpus
 * certifies only the rungs it fires, and nothing in a fixture file tells you
 * which those are.
 *
 * So an adoption keeps its hand-written loop as an oracle and proves three
 * things this harness asserts:
 *
 *  1. **Same verdict, same grade, same board.** Comparing the *whole* mutated
 *     board rather than the return value means a ladder that reaches the same
 *     answer by different deductions fails — which no desc comparison can see.
 *  2. **At every cap.** The cap is what selects rungs, so a capped solve is a
 *     different walk down the same ladder and is where a mis-declared `tier`
 *     shows.
 *  3. **With a firing census.** Agreement over boards that only ever need the
 *     easiest rung certifies one rung. The census asserts which rungs the corpus
 *     reached, and a rung it cannot reach is named in `unreached` with its
 *     reason — a visible shortfall rather than an absent one.
 *
 * The harness declares its own `describe`/`it` blocks, so a game's test file is
 * the declaration and nothing else.
 */
import { describe, expect, it } from "vitest";
import type { FiringTally } from "../deduction-fixpoint.ts";

export interface LadderEquivalenceSpec<Board> {
  /** The game, for test names. */
  game: string;
  /** Every rung id the adopted ladder declares, in ladder order. */
  rungs: readonly string[];
  /**
   * Rungs this corpus never fires, each mapped to the reason it cannot.
   *
   * **Empty is the goal.** An entry is a rung whose behavior nothing here
   * certifies, so it is a live shortfall — the `NO_KEYBOARD` shape
   * (`docs/games/testing.md` § "How a cross-game guard finds its population").
   * Before adding one, check the rung against the C: an unreachable deduction is
   * exactly the shape a porting bug takes, and Tracks' entry is there only
   * because `solve_check_single_sub` was read and found reproduced line for
   * line.
   */
  unreached: Readonly<Record<string, string>>;
  /** The caps to walk each board at — the game's own tier values. */
  caps: readonly number[];
  /** One labeled case per board; the factory is called fresh per cap, per side. */
  cases: readonly { label: string; board: () => Board }[];
  /**
   * The adopted solver, taking the tally it forwards to
   * `runDeductionFixpoint`'s `firings` option.
   *
   * **Why a game's solver carries a parameter only a test supplies.** A rung's
   * reachability cannot be observed from the game's own results — that is this
   * file's whole premise — so the game has to hand the census a channel. The
   * runner does the counting; the game forwards the map and nothing else.
   */
  viaRunner: (board: Board, cap: number, firings: FiringTally) => unknown;
  /** The hand-written loop, kept as the oracle. */
  viaLegacy: (board: Board, cap: number) => unknown;
  /**
   * Every bit of board state the rungs write, as a comparable string. Include
   * the whole working state, not just the answer — that is what makes "the same
   * deductions" checkable rather than "the same result".
   */
  key: (board: Board) => string;
}

export function describeLadderEquivalence<Board>(
  spec: LadderEquivalenceSpec<Board>,
): void {
  const { game, rungs, unreached, caps, cases, viaRunner, viaLegacy, key } = spec;

  describe(`${game}: the shared runner drives the ladder exactly as the hand-written loop did`, () => {
    // One tally across every board and cap: the census asks which rungs the
    // *corpus* reaches, not which a single board does.
    const fired: FiringTally = new Map();
    let compared = 0;

    for (const { label, board } of cases) {
      it(`${label}: same verdict, same grade, same board at every cap`, () => {
        for (const cap of caps) {
          const runnerBoard = board();
          const legacyBoard = board();

          const got = viaRunner(runnerBoard, cap, fired);
          const want = viaLegacy(legacyBoard, cap);
          compared++;

          expect(got, `${game}/${label} cap=${cap}: verdict or grade differs`).toEqual(
            want,
          );
          expect(
            key(runnerBoard),
            `${game}/${label} cap=${cap}: same result but a different board — the ` +
              "two ladders made different deductions",
          ).toBe(key(legacyBoard));
        }
      });
    }

    it("compared a real corpus, and fired every rung it claims to", () => {
      // Vacuity: agreement over nothing is agreement.
      expect(compared, `${game}: no board was compared`).toBeGreaterThanOrEqual(
        cases.length * caps.length,
      );
      expect(
        rungs.length,
        `${game}: a ladder with no rungs certifies nothing`,
      ).toBeGreaterThan(0);

      // A rung present with a zero count would be a rung that never fired, so
      // membership alone is not the question the census asks.
      const missing = rungs.filter((id) => (fired.get(id) ?? 0) === 0).sort();
      expect(
        missing,
        `${game}: a rung this corpus never fires is a rung this file does not ` +
          "certify — widen the cases until it does, or record it in `unreached` " +
          "with the reason (and check it against the C first)",
      ).toEqual(Object.keys(unreached).sort());

      // The ledger's own honesty check: an entry for a rung that is not in the
      // ladder at all would be a permanent excuse nothing could retire.
      expect(
        Object.keys(unreached).filter((id) => !rungs.includes(id)),
        `${game}: \`unreached\` names a rung the ladder does not have`,
      ).toEqual([]);
    });
  });
}
