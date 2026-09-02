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

import type { Game, HintStep } from "../game.ts";
import { Midend } from "../midend.ts";
import type { Color, Size } from "../types.ts";
import { RecordingDrawing } from "./recording-drawing.ts";

/** A neutral light-gray default background, standing in for the
 * frontend's theme color (`puzzle-view.ts` derives one per theme). Any
 * fixed value works; it only needs to be stable so palette-derived
 * colors snapshot deterministically. */
export const DEFAULT_BACKGROUND: Color = [0.827, 0.827, 0.827];

/** Guard against a never-satisfied `hintUntil` predicate walking the
 * plan forever (each step recomputes nothing, but a buggy predicate
 * could still loop to the plan's end and back). */
const MAX_HINT_STEPS = 1000;

/** Longer than any game's animation or flash, so one tick settles the clock. */
const SETTLE_SECONDS = 60;

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
  /** Run the animation/flash clock out before capturing, so the frame is the
   * **settled** one rather than an animated game's frame 0.
   *
   * A move on an animated game (Inertia's slide, Flip's tile spin, Sixteen's
   * row shove) arms an animation, and a capture taken straight after `moves`
   * therefore shows the *start* of that animation — with the previous state
   * still on screen. Anything a game draws only once the move has landed (a
   * dead player's splat, a win flash resolving) is invisible in that frame.
   * Set this to reach the frame a player actually ends up looking at. */
  settle?: boolean;
  /** Frontend default background fed to the game's palette. Defaults to
   * {@link DEFAULT_BACKGROUND}. */
  defaultBackground?: Color;
  /**
   * Buttons to send through `Midend.processInput` before capture, at `at`
   * (default the origin) — the way to reach a frame that only *input* produces.
   *
   * `moves` is the right tool for reaching a board state and stays the default:
   * it needs no coordinate arithmetic and cannot be broken by a layout change.
   * But a keyboard cursor is `Ui` state, not board state, so no `Move` can put
   * it anywhere — and "the frame after one arrow press" was therefore a frame
   * this harness could not reach at all. Pointer buttons work here too; prefer
   * `moves` for those unless the *coordinates* are what is under test.
   */
  presses?: readonly number[];
  /** Where {@link presses} land. Defaults to `{ x: 0, y: 0 }`, which is what a
   * keyboard press wants (the coordinates are ignored). */
  at?: { x: number; y: number };
}

export interface RenderResult<Params, State, Move, Ui, DrawState> {
  /** The captured, normalized draw record (the snapshot/assertion target). */
  recording: RecordingDrawing;
  /** The hint step on display at capture, if `showHint` was set. */
  hint?: HintStep<Move>;
  /** How many mistakes the overlay flagged (0 when not shown / none). */
  mistakeCount: number;
  /** The game's pixel size at its preferred tile size — handy for an
   * SVG view (`toSvg`) of the same record. */
  size: Size;
  /** The resolved palette (index → RGB), for reference. */
  palette: Color[];
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

  if (scenario.presses) {
    const at = scenario.at ?? { x: 0, y: 0 };
    for (const button of scenario.presses) midend.processInput(at.x, at.y, button);
  }

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

  // One generous tick is enough: `Midend.timer` clamps a finished animation
  // (dropping the from-state) and resets a finished flash, so the next redraw
  // is the settled frame.
  if (scenario.settle) midend.timer(SETTLE_SECONDS);

  // Through the midend, so the recording resolves indices against the same
  // board the app paints (the host background shifted off the extremes).
  const palette = midend.getColorPalette(defaultBackground);
  const recording = new RecordingDrawing(palette);
  midend.redraw(recording);

  const size = game.computeSize(
    game.decodeParams(id.slice(0, id.search(/[:#]/))),
    game.preferredTileSize ?? 32,
  );

  return { recording, hint, mistakeCount, size, palette, midend };
}
