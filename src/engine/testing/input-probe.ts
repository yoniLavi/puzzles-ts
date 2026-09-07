/**
 * **Shared behavioral input probes** — the questions the collection-wide input
 * guards ask of a game, asked in one place so every guard asks them the same
 * way and a new guard inherits the answers rather than re-deriving them.
 *
 * These are *behavioral*: each drives a real `Midend` over a real board through
 * the same code path the frontend uses. None reads a game's source, and none
 * reads a declaration about a game — a game joins a population by **having** the
 * behavior, which is the enrollment rule the whole collection runs on
 * (AGENTS.md, "A game joins a shared mechanic by *having* it").
 *
 * Consumers: `input-parity.test.ts` (the parity bar) and `shortcuts.test.ts`
 * (the app's bare-letter sweep). Both used to build their own board and their
 * own probe grid; the duplication is what this module removes.
 */

import type { Game } from "../game.ts";
import { Midend } from "../midend.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../pointer.ts";
import { randomNew } from "../random/index.ts";
import type { Color } from "../types.ts";
import { RecordingDrawing } from "./recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "./render-scenario.ts";

export type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;
export type AnyMidend = Midend<unknown, unknown, unknown, unknown, unknown>;

export interface ProbeBoard {
  readonly params: unknown;
  readonly tileSize: number;
  readonly size: { w: number; h: number };
  readonly m: AnyMidend;
  /** Return the board to its opening position. */
  readonly reset: () => void;
}

/** One board per game, built once — the generators are the expensive part. */
export function probeBoard(game: AnyGame, id: string): ProbeBoard {
  const params = game.defaultParams();
  const desc = game.newDesc(params, randomNew(`parity-${id}`)).desc;
  const tileSize = game.preferredTileSize ?? 32;
  const m = new Midend(game);
  m.setCallbacks(
    () => {},
    () => {},
    () => {},
  );
  const gameId = `${game.encodeParams(params, true)}:${desc}`;
  const reset = () => {
    m.newGameFromId(gameId);
  };
  reset();
  return { params, tileSize, size: game.computeSize(params, tileSize), m, reset };
}

/** A stable digest of everything a save carries — board, history and whatever
 * UI state the game chooses to persist. */
export function fingerprint(m: AnyMidend): string {
  const bytes = m.saveGame();
  let h = 0;
  for (const b of bytes) h = (h * 31 + b) | 0;
  return String(h);
}

/**
 * **What the player can perceive** — the painted frame plus the save.
 *
 * A save alone is not the player's view of the game, and treating it as one
 * under-reports: Guess keeps its peg *holds* in `GuessUi` and never serializes
 * them, so a right-click that toggles a hold is invisible to
 * {@link fingerprint} while being plainly visible on screen. Signpost's
 * backward grab is the same shape. Scoring those two "no secondary meaning"
 * would demand `ignoresSecondaryButton` from two games that have one, turning
 * off the promotion they handle — the exact defect the flag exists to prevent,
 * arrived at from the other direction.
 *
 * So the observation is the union: a change the *save* records, or a change the
 * *frame* shows. That is the honest reading of "did anything happen", and it
 * needs nothing from the game beyond the `redraw` every game already has.
 */
export function observable(m: AnyMidend, background: Color): string {
  const recording = new RecordingDrawing(m.getColorPalette(background));
  m.redraw(recording);
  return `${fingerprint(m)}|${JSON.stringify(recording.ops)}`;
}

/**
 * Probe points across the whole board — a coarse grid is not enough (an early
 * cut of the press sweep sailed straight past Untangle, whose vertices sit at
 * arbitrary points, and would have reported health).
 */
export function probePoints(size: {
  w: number;
  h: number;
}): { x: number; y: number }[] {
  const step = Math.max(4, Math.floor(Math.min(size.w, size.h) / 12));
  const pts: { x: number; y: number }[] = [];
  for (let x = 2; x < size.w; x += step)
    for (let y = 2; y < size.h; y += step) pts.push({ x, y });
  return pts;
}

/**
 * **Codes no game can act on.**
 *
 * The obvious choice — Unicode's private-use area, `0xE000`+ — is **wrong here,
 * and picking it is how the honesty guard was first mis-measured**. Button codes
 * are not Unicode: `MOD_MASK` is `0x7800`, so `0xE000` decodes as
 * `MOD_NUM_KEYPAD | MOD_SHFT | 0x8000` and carries two live modifier bits. It
 * convicted Sixteen, which reads the keypad bit and was answering exactly as
 * designed. `0x0300`–`0x0302` sit in the gap above `CURSOR_SELECT2` and below
 * `MOD_STYLUS`; `0x10000` sits above every modifier.
 *
 * Every reason these are safe is asserted from the vocabulary in
 * `input-parity.test.ts`, never taken on trust from this comment.
 */
export const UNACTIONABLE: readonly number[] = [0x0300, 0x0301, 0x0302, 0x10000];

/** True for a code that carries no modifier bit and is no pointer button. */
export function isPointerButton(button: number): boolean {
  return isMouseDown(button) || isMouseDrag(button) || isMouseRelease(button);
}

export interface UnactionableResult {
  /** Every unactionable code the game answered, with where it answered. */
  readonly claims: string[];
  /** Whether any of them reached the board. A code with no meaning cannot have
   * moved anything, so this is the one direction "did the board change" is safe
   * to ask in — there is no innocent reading of it. */
  readonly boardChanged: boolean;
}

/** What a game does with codes nothing in the vocabulary can express. */
export function unactionableClaims(game: AnyGame, id: string): UnactionableResult {
  const { size, m, reset } = probeBoard(game, id);
  reset();
  const before = fingerprint(m);
  const claims: string[] = [];
  // The origin as well as the board, because a keyboard event arrives at (0, 0)
  // and a game gating on pointer *coordinates* alone answers every key that
  // lands there — a board-only sweep scores it healthy.
  const points = [{ x: 0, y: 0 }, ...probePoints(size)];
  for (const code of UNACTIONABLE)
    for (const p of points)
      if (m.processInput(p.x, p.y, code))
        claims.push(`0x${code.toString(16)} at (${p.x},${p.y})`);
  return { claims, boardChanged: fingerprint(m) !== before };
}

/** What a game did with the secondary button, and the evidence for it. */
export interface SecondaryMeaning {
  /** Whether `RIGHT_BUTTON` means anything at all in this game. */
  readonly used: boolean;
  /** How it showed itself — for the failure message, and for a reader who
   * wants to know *which* of the three shapes this game has. */
  readonly evidence: string | null;
}

/**
 * **Does the secondary button mean anything in this game?**
 *
 * `Game.ignoresSecondaryButton` exists because the promotion is pure loss for a
 * game with no secondary meaning: `detectSecondaryButton` turns a held press
 * into `RIGHT_BUTTON`, the game tests no such button, and the whole gesture
 * disappears — only on touch, and only for the player who paused to aim. The
 * guard asserts the biconditional, so the answer here decides whether a game
 * *must* declare the flag, and a wrong answer either drops every long press a
 * player makes or turns off a promotion the game handles.
 *
 * **Reading the collection is what shaped this question.** All 57 games were
 * read or measured, and there are exactly three legitimate answers, all
 * observable and none of them a declaration:
 *
 *  1. **It commits a move** (34 games) — the press is the whole interaction.
 *  2. **It changes what the next input does** (16) — the pencil-mode press
 *     (nine games, all through the shared `pressNoteTakingCell`), Guess's peg
 *     hold, Samegame's selection clear, Rome's pencil drag, Signpost's backward
 *     grab, Ascent's candidate cycle. The press commits nothing by itself, so
 *     asking only "did the board change" scores every one of them meaningless.
 *  3. **It folds onto the primary button** (Slide's `asPrimary`) — the
 *     documented alternative to the flag, which makes the gesture work whichever
 *     way the long-press detector resolved it.
 *
 * So the question is *did it change anything observable, now or next*, and the
 * three shapes are one question rather than three special cases.
 *
 * **On not reopening "did the board change".** That question was rejected after
 * it falsely convicted four games (`audit-input-mode-parity`), and the ban
 * stands. What was rejected is using **its negation as a conviction** — "the
 * board did not change, therefore this input is dead" — which is unsound
 * because an eraser on a fresh board correctly changes nothing. Used the other
 * way, as one of several *sufficient* signs that the button does mean something,
 * it cannot convict anyone: a game is only ever reported meaningless when it is
 * invisible under **every** observation below. The asymmetry is the whole point.
 */
export function secondaryMeaning(game: AnyGame, id: string): SecondaryMeaning {
  const { params, tileSize, size, m, reset } = probeBoard(game, id);
  const panel = game.requestKeys?.(params) ?? [];

  /** Where a step acts. A pointer step acts on the board; a key arrives at the
   * origin, which is where `worker-adapter.ts` delivers one. */
  type Step = { button: number; at: "p" | "q" };
  const at = (button: number): Step => ({ button, at: "p" });
  const to = (button: number): Step => ({ button, at: "q" });

  /**
   * The secondary gestures to try. A press alone is not enough: Rome's
   * secondary button starts a **pencil drag** and Signpost's grabs a chain
   * backwards, so both are invisible until the drag happens — and scoring them
   * meaningless would demand a flag that turns off the very gesture they have.
   */
  const gestures: { label: string; steps: Step[] }[] = [
    { label: "a secondary press", steps: [at(RIGHT_BUTTON), at(RIGHT_RELEASE)] },
    {
      label: "a secondary drag",
      steps: [at(RIGHT_BUTTON), to(RIGHT_DRAG), to(RIGHT_RELEASE)],
    },
  ];

  /**
   * What might reveal a gesture that changed the game's *future* rather than
   * its board. Deliberately generous, and the generosity is not free
   * politeness: an under-detection demands the flag from a game that has a
   * secondary meaning, which turns off a promotion it handles — so a missing
   * follow-up here is itself a defect. The neighbor cases exist because
   * Ascent's secondary press clears a selection, which is invisible until the
   * *next* cell is pressed.
   */
  const followUps: { label: string; steps: Step[] }[] = [
    { label: "on its own", steps: [] },
    { label: "then a primary press", steps: [at(LEFT_BUTTON), at(LEFT_RELEASE)] },
    {
      label: "then a primary press on the next cell",
      steps: [to(LEFT_BUTTON), to(LEFT_RELEASE)],
    },
    {
      label: "then a primary drag onto the next cell",
      steps: [at(LEFT_BUTTON), to(LEFT_DRAG), to(LEFT_RELEASE)],
    },
    {
      label: "then a second secondary press",
      steps: [at(RIGHT_BUTTON), at(RIGHT_RELEASE)],
    },
    { label: "then Enter", steps: [at(CURSOR_SELECT)] },
    { label: "then the secondary select", steps: [at(CURSOR_SELECT2)] },
    { label: "then '1'", steps: [at(0x31)] },
    ...(panel[0]
      ? [{ label: `then the ${panel[0].label} key`, steps: [at(panel[0].button)] }]
      : []),
  ];

  /**
   * How the board is set up before the secondary gesture. A secondary meaning
   * is very often "undo what the primary one did", so it has nothing to act on
   * until something is there — and *how much* setup it needs varies: Ascent
   * places a number with two presses (pick a placed number, then an adjacent
   * empty cell), and its right-click erase is invisible until one is on the
   * board. With a one-press prime Ascent is credited only by an incidental
   * cursor hide it shares with the primary press, which is the right verdict
   * reached on evidence that would not survive the game changing.
   */
  const primes: { label: string; steps: Step[] }[] = [
    { label: "", steps: [] },
    { label: " after a primary press", steps: [at(LEFT_BUTTON), at(LEFT_RELEASE)] },
    {
      label: " after two primary presses",
      steps: [at(LEFT_BUTTON), at(LEFT_RELEASE), to(LEFT_BUTTON), to(LEFT_RELEASE)],
    },
    {
      label: " after a primary drag",
      steps: [at(LEFT_BUTTON), to(LEFT_DRAG), to(LEFT_RELEASE)],
    },
  ];

  const play = (
    p: { x: number; y: number },
    q: { x: number; y: number },
    prime: Step[],
    gesture: Step[],
    follow: Step[],
  ) => {
    reset();
    for (const s of [...prime, ...gesture, ...follow]) {
      const target = s.at === "q" ? q : p;
      if (isPointerButton(s.button)) m.processInput(target.x, target.y, s.button);
      else m.processInput(0, 0, s.button);
    }
    return observable(m, DEFAULT_BACKGROUND);
  };

  /** Where a drag or a neighbor press lands. More than one direction, because a
   * game may accept a gesture along one axis and not another: Signpost links a
   * cell to the neighbor its *arrow* points at, so a single "one tile right"
   * target round-trips to nothing on every cell whose arrow points elsewhere,
   * and the game reads as having no secondary meaning at all. */
  const targets = (p: { x: number; y: number }) =>
    [
      { x: p.x + tileSize, y: p.y },
      { x: p.x, y: p.y + tileSize },
      { x: p.x + tileSize, y: p.y + tileSize },
      { x: p.x - tileSize, y: p.y },
      { x: p.x, y: p.y - tileSize },
    ].filter((q) => q.x >= 0 && q.y >= 0 && q.x < size.w && q.y < size.h);

  for (const p of probePoints(size)) {
    for (const q of targets(p)) {
      for (const prime of primes) {
        // A press the game did not even consume cannot have changed anything,
        // so there is nothing to compare — and this is what keeps the sweep
        // cheap for the games that genuinely ignore the button, which are the
        // only ones that ever reach the end of this loop.
        reset();
        for (const s of prime.steps)
          m.processInput(s.at === "q" ? q.x : p.x, s.at === "q" ? q.y : p.y, s.button);
        const consumed = m.processInput(p.x, p.y, RIGHT_BUTTON);
        m.processInput(p.x, p.y, RIGHT_RELEASE);
        if (!consumed) continue;

        for (const g of gestures)
          for (const f of followUps)
            if (
              play(p, q, prime.steps, [], f.steps) !==
              play(p, q, prime.steps, g.steps, f.steps)
            )
              return {
                used: true,
                evidence:
                  `${g.label} at (${p.x},${p.y})${prime.label} ${f.label} ` +
                  "leaves a different game than the same sequence without it",
              };
      }
    }
  }
  return { used: false, evidence: null };
}
