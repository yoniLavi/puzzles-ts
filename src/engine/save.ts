/**
 * The save format: a versioned JSON envelope, UTF-8 encoded into the bytes the
 * Dexie store holds (`SavedGameRecord.data` is `Uint8Array | Blob`). It is not
 * upstream's `midend_serialise` format; C-format saves are expendable.
 *
 * Restoration replays `moves` from the initial `desc`, so the format
 * stores the move log rather than every state.
 */

export interface SaveEnvelope {
  /** Format version. Bump when the envelope shape changes, and teach
   * {@link decodeSave} to upgrade the old shape — a save a player already has
   * is not ours to invalidate when the fix is a few lines. */
  v: 2;
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
  /** Serialized move log; `moves[i]` turns history[i] into history[i+1]. */
  moves: unknown[];
  /** History cursor at save time (for save-then-undo round-trips). */
  pos: number;
  /** Accumulated timer seconds. */
  timerElapsed: number;
  /** Whether the solver was used (drives "solved-with-help"). Spelled as every
   * game's state spells it (`ts-engine`, "One completion vocabulary across
   * games"); `v: 1` saves called it `usedSolve` and are upgraded on read. */
  cheated: boolean;
  /** Serialized `Ui` state that must survive a save but cannot be rebuilt by
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

/**
 * Bring an older envelope up to the current shape, or return it unchanged.
 *
 * `v: 1` spelled `cheated` as `usedSolve`. That is the only difference, the two
 * mean the same thing, and the whole migration is one key — so a save a player
 * already has keeps working rather than being thrown away for a rename.
 *
 * Runs *before* validation, so `isSaveEnvelope` only ever describes the current
 * shape and cannot drift into blessing both.
 */
function upgrade(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const v = value as Record<string, unknown>;
  if (v["v"] !== 1) return value;
  const { usedSolve, ...rest } = v;
  return { ...rest, v: 2, cheated: usedSolve };
}

function isSaveEnvelope(value: unknown): value is SaveEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v["v"] === 2 &&
    typeof v["puzzleId"] === "string" &&
    typeof v["params"] === "string" &&
    typeof v["desc"] === "string" &&
    // Optional: only a desc-superseding game writes it.
    (v["privDesc"] === undefined || typeof v["privDesc"] === "string") &&
    Array.isArray(v["moves"]) &&
    typeof v["pos"] === "number" &&
    typeof v["timerElapsed"] === "number" &&
    typeof v["cheated"] === "boolean" &&
    (v["ui"] === undefined || typeof v["ui"] === "string")
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
  const upgraded = upgrade(parsed);
  if (!isSaveEnvelope(upgraded)) {
    throw new Error("not a recognized TS save envelope");
  }
  return upgraded;
}
