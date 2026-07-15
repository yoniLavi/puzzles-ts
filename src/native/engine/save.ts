/**
 * The clean TS-native save format: a versioned JSON envelope, UTF-8
 * encoded into the bytes the Dexie store already holds
 * (`SavedGameRecord.data` is `Uint8Array | Blob`, so no schema
 * migration). It is deliberately NOT compatible with the C
 * `midend_serialise` format — per the `ts-migration` doctrine old
 * C-format saves and pre-pivot shared IDs are expendable. `random.ts`
 * (retained, bit-identical) keeps future game IDs reproducible.
 *
 * Restoration replays `moves` from the initial `desc`, so the format
 * stores the move log rather than every state.
 */

export interface SaveEnvelope {
  /** Format version. Bump when the envelope shape changes. */
  v: 1;
  puzzleId: string;
  /** Fully-encoded game parameters. */
  params: string;
  /** The board description the moves were played against — the *public* one,
   * which is also what the shareable game ID names. */
  desc: string;
  /** Present only for a game that superseded its desc (upstream `privdesc`;
   * Mines). The description state 0 is rebuilt from on restore: the public
   * desc describes the layout *plus* the first click, so replaying the move
   * log from it would re-apply a click already baked into the board. Absent ⇒
   * `desc` reconstructs state 0 faithfully, as it does for every other game. */
  privDesc?: string;
  /** Serialised move log; `moves[i]` turns history[i] into history[i+1]. */
  moves: unknown[];
  /** History cursor at save time (for save-then-undo round-trips). */
  pos: number;
  /** Accumulated timer seconds. */
  timerElapsed: number;
  /** Whether the solver was used (drives "solved-with-help"). */
  usedSolve: boolean;
  /** Serialised `Ui` state that must survive a save but cannot be rebuilt by
   * replaying the move log (upstream `encode_ui`; Mines' death counter and
   * completion flag). Present only for a game with an `encodeUi` hook. */
  ui?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeSave(envelope: SaveEnvelope): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(JSON.stringify(envelope));
  // Return a Uint8Array over a plain ArrayBuffer (Comlink-transferable).
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

function isSaveEnvelope(value: unknown): value is SaveEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    typeof v.puzzleId === "string" &&
    typeof v.params === "string" &&
    typeof v.desc === "string" &&
    // Additive and optional: a save written before desc supersession existed
    // simply omits it, and every non-superseding game still does.
    (v.privDesc === undefined || typeof v.privDesc === "string") &&
    Array.isArray(v.moves) &&
    typeof v.pos === "number" &&
    typeof v.timerElapsed === "number" &&
    typeof v.usedSolve === "boolean" &&
    (v.ui === undefined || typeof v.ui === "string")
  );
}

export function decodeSave(data: Uint8Array): SaveEnvelope {
  const text = decoder.decode(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("not valid JSON (likely a pre-pivot C-format save)");
  }
  if (!isSaveEnvelope(parsed)) {
    throw new Error("not a recognised TS save envelope");
  }
  return parsed;
}
