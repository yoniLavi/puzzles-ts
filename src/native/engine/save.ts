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
  /** The board description the moves were played against. */
  desc: string;
  /** Serialised move log; `moves[i]` turns history[i] into history[i+1]. */
  moves: unknown[];
  /** History cursor at save time (for save-then-undo round-trips). */
  pos: number;
  /** Accumulated timer seconds. */
  timerElapsed: number;
  /** Whether the solver was used (drives "solved-with-help"). */
  usedSolve: boolean;
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
    Array.isArray(v.moves) &&
    typeof v.pos === "number" &&
    typeof v.timerElapsed === "number" &&
    typeof v.usedSolve === "boolean"
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
