# Design: TS on-screen key labels

Restore the virtual keypad on the TS path, faithful to upstream
`game_request_keys`. The mechanism is small; the decisions are about *where* the
hook lives, *what it takes*, and *how labels resolve*.

## Decisions

### D1 — The hook takes `params` only, like upstream

Upstream's `game_request_keys(const game_params *params, int *nkeys)` depends only
on params (e.g. Solo's digit count is `c·r`), and the panel
(`puzzle-keys.ts willUpdate`) reloads the key list **only when params change**, not
per move. So `Game.requestKeys?(params: Params): KeyLabel[]` matches both upstream
and the reload semantics. Passing `state`/`ui` would imply the keypad varies with
play, which it does not (and the panel wouldn't reload anyway) — so it is
deliberately omitted to avoid a misleading contract.

### D2 — Forward through `EngineCore`, default to `[]`

`worker-adapter.ts` implements `PuzzleEngineSurface.requestKeys()` and today
returns `[]`. The faithful path is the same one `getParams`/`findMistakes` already
take: the adapter calls a new `EngineCore.requestKeys()`, and `Midend.requestKeys()`
returns `this.game.requestKeys?.(this.params) ?? []`. A game without the hook keeps
the empty keypad it has now — so the change is additive and the non-keypad ported
games (Flip, Galaxies, …) are untouched. The "empty-but-valid shape" comment in the
adapter header is narrowed to the config/prefs surface it still describes.

### D3 — Resolve labels in TS; don't replicate the C `button2label` machinery

Upstream returns `label = NULL` for keys whose display text is derived from the
button code (digits, and the `'\b'` clear key), and the C frontend's
`button2label` fills them in. Rather than port that machinery, each TS game returns
the **resolved** `{ button, label }`: a digit key is `{ button: '1'+i (or 'a'+…),
label: "1".."9"/"a".. }`, and the clear key is `{ button: '\b' (8), label: "Clear" }`
so the existing `puzzle-keys` icon map (`Clear → key-clear`) renders it as the
clear icon exactly as the C path did. Games with explicit upstream labels (Undead:
Ghost/Vampire/Zombie) carry those strings verbatim.

The single source of truth for the digit keypad is a shared
`src/native/engine/key-labels.ts` (`digitKeys(n)`), since Filling, Keen, Solo,
Towers and Unequal all want the same `1..n` + clear set. Solo/Towers size `n` from
`c·r` / the grid order; the helper takes the count.

### D4 — Faithfulness bar: match the C keypad, asserted per game

The bar is parity with the C build's keypad, not invention. Each game's test pins
the returned `KeyLabel[]` (buttons and labels) against the upstream set for
representative params — a 9-digit Solo board and a 4-symbol board (`2×2`), Keen at
two widths, Undead's exactly four keys (G/V/Z/clear). This catches an off-by-one in
the digit range (`'a'` rollover past 9) or a wrong clear-key code, which is the
only real risk here.

### D5 — Scope: the six games that defined `game_request_keys`

A scan of the upstream sources for the ported games shows exactly six define
`game_request_keys`: **Filling, Keen, Solo, Towers, Undead, Unequal**. The other
ported games passed `NULL` (no keypad) and stay keypad-less — that is parity, not a
gap. Net/Map/etc. are unported and keep their C keypad through the existing WASM
route.

## Alternatives rejected

- **Pass `(params, state, ui)` to the hook** — rejected (D1): the keypad doesn't
  vary with play and the panel doesn't reload on state change; the wider signature
  would be a contract the implementation can't honour.
- **Port the C `button2label` / NULL-label resolution into the engine** — rejected
  (D3): more machinery than the six call sites justify; resolving the label at the
  game is a one-liner and keeps the engine free of the C frontend's label table.
- **A single cross-game "keys" spec requirement instead of per-game deltas** —
  rejected: per-game behaviour (which keys Solo vs Undead shows) lives in each
  game's spec, matching how the hint and findMistakes features were specced
  (mechanism in `ts-engine`, each implementer in its own spec).
- **Restore Marks/Hints keys too** — out of scope: upstream's `game_request_keys`
  for these six returns only entry keys + clear; adding Marks/Hints would be new
  affordances, not parity.
