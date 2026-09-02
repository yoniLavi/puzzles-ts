/**
 * Rejecting a value the code has no case for — the two forms, and why there
 * are two.
 *
 * A game's `executeMove` looks total (`(state, move) => State`) and is not: a
 * save is untrusted input. `SaveEnvelope.moves` is `unknown[]` and is *cast*
 * to `Move` on replay, never parsed, so a move written by a different build
 * arrives looking perfectly well typed and reaches a dispatch with no arm for
 * it. What happens next must be a legible refusal, not a guess.
 *
 * {@link assertNever} is the form to reach for. Binding the value to `never`
 * keeps the compile-time exhaustiveness a discriminated dispatch already has —
 * add a member to the union and forget an arm, and the call stops type-checking
 * at the game, before anything runs — and adds the runtime refusal on top. A
 * bare `default: throw` would *trade* the first for the second: with any
 * `default` present the function is total for the type checker whatever the
 * union says, so the far likelier mistake (us adding a move type) goes
 * undetected until a player hits it.
 *
 * {@link rejectMove} is for the case that genuinely has no union to narrow: a
 * move type that is a single object shape (`{ ops: Op[] }`, `{ dir }`), where
 * the only thing to check is that the fields the dispatch reads are there.
 * It exists so that case does not reach for `assertNever(move as never, …)`,
 * which would silence exactly the error `assertNever` is there to raise.
 */

/** Longest move rendered into a message. A refused move is by definition not
 * one of ours, so it can be any size; a solve move's grid alone would bury the
 * game's name under a thousand digits. */
const MAX_DESCRIPTION = 200;

/** Render a value for a human reading a console. Never throws: this runs only
 * on a path where something has already gone wrong, and a `TypeError` from
 * `JSON.stringify` there would replace the one legible message with a
 * confusing one. */
function describe(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION)}…` : text;
}

/**
 * Reject a value that the dispatch above has proved it cannot reach.
 *
 * The `never` parameter is the point: it is a compile-time assertion that every
 * member of the union is handled, and a runtime refusal for the off-union value
 * that type checking cannot exclude.
 *
 * `context` is required rather than derived from a stack: the message is read
 * in a player's console and quoted in a `loadGame` refusal, and "unrecognized
 * move" with no game name in it is the unhelpfulness this exists to remove.
 * Spell it as the dispatch site — `"abcd: executeMove"`.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unrecognised ${describe(value)}`);
}

/**
 * Reject a move whose type is not a union, so there is nothing to narrow to
 * `never` — the dispatch depends on fields rather than on a discriminant.
 *
 * Same message shape as {@link assertNever}, deliberately, so the two read
 * alike in a console. Different name, also deliberately: this one carries no
 * compile-time guarantee, and a reader is entitled to see which of the two
 * they are looking at.
 */
export function rejectMove(move: unknown, context: string): never {
  throw new Error(`${context}: unrecognised ${describe(move)}`);
}
