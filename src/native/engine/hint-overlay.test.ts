/**
 * Cross-game guarantee: a hint overlay reaches the render cache.
 *
 * The defect class (playbook §3.2; `unify-hint-framework` seam S4): an
 * overlay is applied *on top of* a cell, so it usually isn't part of the
 * cell's packed tile value — and if it also isn't compared in the game's
 * cache-miss branch, it only repaints when the cell's tile coincidentally
 * changed that frame. A hint (like Check-&-Save's mistake overlay, which
 * shipped exactly this bug on Towers) is requested a frame *after* the
 * move that drew the board, when nothing else has changed — so the
 * overlay simply never appears.
 *
 * The guard drives the production path: warm the midend's drawstate with
 * a settled frame, prove the next frame paints nothing (or note the game
 * repaints unconditionally), then display a hint and require the very
 * next frame — same drawstate, same board — to emit paint ops. A game
 * whose hint bits are missing from its diff key fails here, for every
 * hinting game at once, without any per-game colour knowledge.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "./midend.ts";
import { declaresNoMarks, firstLeaf, HINT_GAMES } from "./testing/hint-games.ts";
import { RecordingDrawing } from "./testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "./testing/render-scenario.ts";

const SEEDS = ["ov-a", "ov-b", "ov-c"];

/** How many opening steps we will play through looking for one that carries
 * board marks (a candidate game's populate/cleanup opener may precede the
 * first marked deduction). */
const MAX_UNMARKED_OPENERS = 4;

describe("a newly displayed hint repaints a warm, otherwise-unchanged frame", () => {
  for (const [name, game] of HINT_GAMES) {
    it(`${name}: the hint overlay survives the render cache`, () => {
      for (const seed of SEEDS) {
        const midend = new Midend(game);
        const params = firstLeaf(game.presets());
        const id = `${game.encodeParams(params, true)}#${name}-${seed}`;
        const err = midend.newGameFromId(id);
        expect(err, `${name}/${seed}: bad id ${id}`).toBeUndefined();

        const palette = game.colours(DEFAULT_BACKGROUND);

        for (let opener = 0; ; opener++) {
          // Settle any pending animation, then warm the drawstate cache
          // exactly as the app does: absorb outstanding changes into one
          // paint, so the next frame differs only by what we add.
          midend.timer(60);
          midend.redraw(new RecordingDrawing(palette));

          // Display a hint. Nothing else about the board changes, so for
          // a cached renderer this frame's *only* difference is the
          // overlay — the exact frame the bug class makes blank.
          const hintErr = midend.hint();
          expect(
            hintErr,
            `${name}/${seed}: hint refused on the board`,
          ).toBeUndefined();
          const step = midend.activeHintStep();
          expect(step, `${name}/${seed}: no step on display`).toBeDefined();
          if (!step) return;

          const withHint = new RecordingDrawing(palette);
          midend.redraw(withHint);

          // Painting anything means the overlay reached the cache — the
          // class is exercised for this seed.
          if (withHint.ops.length > 0) break;

          // A blank frame is only legitimate for a step that declares no
          // board marks (the candidate games' populate opener: its banner
          // narration is the whole display). Anything else is the bug.
          expect(
            declaresNoMarks(step.highlights),
            `${name}/${seed}: displaying a hint with board marks painted ` +
              "nothing on a warm frame — its overlay is not reaching the " +
              "render cache (playbook §3.2)",
          ).toBe(true);

          // Apply the marks-free opener's own move (a board transition,
          // which drops the displayed hint) and judge the next display.
          expect(
            opener,
            `${name}/${seed}: no step within ${MAX_UNMARKED_OPENERS} painted or declared marks`,
          ).toBeLessThan(MAX_UNMARKED_OPENERS);
          midend.playMoves([step.move]);
        }
      }
    }, 30_000);
  }
});
