/**
 * A `Midend`-backed scenario driver for in-process render tests.
 *
 * Given a game and a game id, it drives a *real* `Midend` to a target
 * frame — replaying `Move`s directly (no pointer events), optionally
 * computing the mistake overlay or walking the hint plan — and captures
 * that frame with a {@link RecordingDrawing}. Driving the real midend
 * (rather than calling a game's `redraw` against a hand-built state)
 * guarantees the captured frame is the one that ships: the hint /
 * mistake / animation lifecycle is the production one.
 *
 * This removes exactly the friction that made the Palisade hint frame
 * painful to verify in the browser harness: no worker, no
 * OffscreenCanvas blocking `getImageData`, no right-button marks that
 * don't register, and no Auto-Hint timing needed to stop on a mid-plan
 * step — reaching a specific hint step is just `showHint` + `hintUntil`.
 *
 * Dev/test-only; never imported by production code.
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import type { Game, HintStep } from "../game.ts";
import { Midend } from "../midend.ts";
import { RecordingDrawing } from "./recording-drawing.ts";

/** A neutral light-grey default background, standing in for the
 * frontend's theme colour (`puzzle-view.ts` derives one per theme). Any
 * fixed value works; it only needs to be stable so palette-derived
 * colours snapshot deterministically. */
export const DEFAULT_BACKGROUND: Colour = [0.827, 0.827, 0.827];

/** Guard against a never-satisfied `hintUntil` predicate walking the
 * plan forever (each step recomputes nothing, but a buggy predicate
 * could still loop to the plan's end and back). */
const MAX_HINT_STEPS = 1000;

export interface RenderScenario<Params, State, Move, Ui, DrawState, Mistake> {
  game: Game<Params, State, Move, Ui, DrawState, Mistake>;
  /** Full game id: `<params>:<desc>` (descriptive) or `<params>#<seed>`
   * (random, reproducible via the bit-identical RNG). */
  id: string;
  /** Game `Move`s to replay before capture, applied directly (not via
   * pointer events) — the deterministic way to reach a board state. */
  moves?: readonly Move[];
  /** Compute and show the mistake overlay (the `findMistakes` hook). */
  showMistakes?: boolean;
  /** Compute and show a hint (its first step, unless `hintUntil`
   * advances further). */
  showHint?: boolean;
  /** With `showHint`, walk the plan via `executeHint` until a step
   * satisfies this predicate (e.g. one carrying sibling-edge
   * highlights), leaving that step *displayed but not yet applied*.
   * Returns the matched step in the result's `hint`; if no step matches
   * within the plan, `hint` is the last step reached. */
  hintUntil?: (step: HintStep<Move>) => boolean;
  /** Spotlight a reference-aid item before capture (the `reference` /
   * `selectReference` hooks) — the key of the item to highlight, or null. */
  selectReference?: string | null;
  /** Frontend default background fed to the game's palette. Defaults to
   * {@link DEFAULT_BACKGROUND}. */
  defaultBackground?: Colour;
}

export interface RenderResult<Params, State, Move, Ui, DrawState> {
  /** The captured, normalised draw record (the snapshot/assertion target). */
  recording: RecordingDrawing;
  /** The hint step on display at capture, if `showHint` was set. */
  hint?: HintStep<Move>;
  /** How many mistakes the overlay flagged (0 when not shown / none). */
  mistakeCount: number;
  /** The game's pixel size at its preferred tile size — handy for an
   * SVG view (`toSvg`) of the same record. */
  size: Size;
  /** The resolved palette (index → RGB), for reference. */
  palette: Colour[];
  /** The driven midend, for further assertions (save round-trip, etc.). */
  midend: Midend<Params, State, Move, Ui, DrawState>;
}

/**
 * Drive a real `Midend` to the scenario's frame and capture its render.
 * Throws if the id is invalid (a test wants that surfaced, not a silent
 * empty frame).
 */
export function renderScenario<Params, State, Move, Ui, DrawState, Mistake>(
  scenario: RenderScenario<Params, State, Move, Ui, DrawState, Mistake>,
): RenderResult<Params, State, Move, Ui, DrawState> {
  const { game, id, moves, showMistakes, showHint, hintUntil } = scenario;
  const defaultBackground = scenario.defaultBackground ?? DEFAULT_BACKGROUND;

  const midend = new Midend(game);
  const err = midend.newGameFromId(id);
  if (err) throw new Error(`renderScenario: invalid id "${id}": ${err}`);

  if (moves && moves.length > 0) midend.playMoves(moves);

  if (scenario.selectReference !== undefined)
    midend.selectReference(scenario.selectReference);

  let mistakeCount = 0;
  if (showMistakes) mistakeCount = midend.findMistakes();

  let hint: HintStep<Move> | undefined;
  if (showHint) {
    const hintErr = midend.hint();
    if (hintErr) throw new Error(`renderScenario: hint failed: ${hintErr}`);
    hint = midend.activeHintStep();
    if (hintUntil) {
      let steps = 0;
      while (hint && !hintUntil(hint) && steps < MAX_HINT_STEPS) {
        // Apply the current step and advance; a no-animation game (e.g.
        // Palisade) settles synchronously, so the next step is on
        // display immediately. Stop when the plan runs out (executeHint
        // clears it ⇒ activeHintStep() is undefined).
        const stepErr = midend.executeHint();
        if (stepErr) break;
        hint = midend.activeHintStep();
        steps += 1;
      }
    }
  }

  const palette = game.colours(defaultBackground);
  const recording = new RecordingDrawing(palette);
  midend.redraw(recording);

  const size = game.computeSize(
    game.decodeParams(id.slice(0, id.search(/[:#]/))),
    game.preferredTileSize ?? 32,
  );

  return { recording, hint, mistakeCount, size, palette, midend };
}
