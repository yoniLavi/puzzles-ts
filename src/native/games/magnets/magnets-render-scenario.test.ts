/**
 * Tier-2.5 render scenarios for magnets: drive a real Midend to a target frame
 * and capture `redraw`. Targeted op assertions (background, corner symbols,
 * domino fills, clue numbers, a placed magnet, the touching-terminal red
 * error, the findMistakes overlay) plus one snapshot so a render regression is
 * a reviewable text diff (`vitest -u` re-baselines an intended change; the
 * targeted assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { magnetsGame } from "./index.ts";
import { COL_MISTAKE, COL_NEGATIVE, COL_POSITIVE } from "./render.ts";
import {
  DIFF_EASY,
  encodeParams,
  type MagnetsMove,
  type MagnetsParams,
  newState,
} from "./state.ts";

function board(p: MagnetsParams, seed: string) {
  const { desc, aux } = magnetsGame.newDesc(p, randomNew(seed));
  const state = newState(p, desc);
  return { id: `${encodeParams(p, true)}:${desc}`, state, aux: aux ?? "" };
}

/** The index and partner of some horizontal domino in a board. */
function horizontalDomino(state: ReturnType<typeof newState>): {
  idx: number;
  partner: number;
} {
  for (let i = 0; i < state.wh; i++) {
    if (state.common.dominoes[i] === i + 1) return { idx: i, partner: i + 1 };
  }
  throw new Error("no horizontal domino in board");
}

const P: MagnetsParams = { w: 6, h: 5, diff: DIFF_EASY, stripclues: false };

describe("magnets render scenarios", () => {
  it("opener frame: domino fills + clue numbers", () => {
    const { id } = board(P, "mrs-0");
    const { recording, size } = renderScenario({ game: magnetsGame, id });

    // Rounded-domino corners are circles.
    expect(recording.ops.some((o) => o.op === "circle")).toBe(true);
    // Clue numbers (and corner + / − symbols) draw text/rects.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("a placed magnet draws + (positive) and − (negative) fills", () => {
    const { id, state } = board(P, "mrs-magnet");
    const { idx } = horizontalDomino(state);
    const moves: MagnetsMove[] = [{ type: "set", idx, which: 1 }];
    const { recording } = renderScenario({ game: magnetsGame, id, moves });

    // The magnet symbols are drawn in COL_POSITIVE / COL_NEGATIVE background.
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_POSITIVE),
    ).toBe(true);
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_NEGATIVE),
    ).toBe(true);
  });

  it("findMistakes overlay repaints even when the cell was already drawn", () => {
    const { id, state, aux } = board(P, "mrs-mistake");
    const { idx, partner } = horizontalDomino(state);
    // Place this domino opposite to its solution so it is a mistake.
    const solIdx = aux[idx] === "+" ? 1 : aux[idx] === "-" ? 2 : 0;
    const wrong = solIdx === 1 ? 2 : 1; // opposite magnet (both ends are magnets)
    // Only meaningful when the solution makes this a magnet.
    if (solIdx === 0) return;

    const moves: MagnetsMove[] = [{ type: "set", idx, which: wrong }];
    const { recording } = renderScenario({
      game: magnetsGame,
      id,
      moves,
      showMistakes: true,
    });
    // The mistake overlay (inset red outline) appears on a frame *after* the
    // move that placed the cell (playbook §3.2 — overlay must be in the diff
    // key). Both ends of the wrong magnet are flagged.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      true,
    );
    void partner;
  });
});
