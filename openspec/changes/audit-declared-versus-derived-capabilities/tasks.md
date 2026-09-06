# audit-declared-versus-derived-capabilities — tasks

Scaffolded 2026-09-06. **Investigation.** Rewritten from the survey's findings,
as task 0.6 required.

## 0. Survey — done, with the population read rather than sampled

- [x] 0.1 `/opsx:explore`.
- [x] 0.2 **Every guarantee in `guarantees.md`'s table, classified.** All eight
      rows read. **Not one needs a manifest.** Six are *had* (board model,
      planner, invariants/mistakes, presentation, and the two affordances — each
      read off an object, a method, or a `Ui` field the game already carries);
      two are **declaration-as-input** and have shipped in exactly that form
      (the technique ladder's `{ id, tier, run }`, params' `paramConfig` +
      `paramsCodec`); one — the gesture table — is withdrawn.
- [x] 0.3 **Every existing cross-game guard, classified.** The enrollment fact
      is always one of three: the registered game object, the `Ui` `newUi`
      returns, or the game's own source. **No guard enrolls from a manifest.**
      The most useful finding is the converse of the one the task predicted: a
      guard that *was* a hand-list and should not have been —
      `hint-quality.test.ts`'s `DEDUCTIVE`, an eighteen-name opt-in that had
      silently missed **six** hinting games (Boats, Bricks, Group, Salad,
      Sticks, Subsets). Fixed in this change; five of the six pass the check
      they were never given, across 72–153 steps each.
- [x] 0.4 **The declarations that exist and are not derived, counted.** Of the
      `Game` contract's **29 optional members, 26 declare themselves by
      existing**; exactly **three** are boolean flags — `canMarkAll`,
      `ignoresSecondaryButton`, `wantsStylusModifier`. Each passes the
      `needsRightButton` test (a production consumer reads it and branches), and
      each earns its place for one reason: production needs the answer
      *synchronously* and cannot run the probe. Only one of the three was held
      to its behavior; the other two are now.
- [x] 0.5 The three open questions, settled with evidence — see below.
- [x] 0.6 Task list rewritten.

## 1. The three open questions

- [x] 1.1 **Intent that behavior cannot show.** It exists, and it *never carries
      enrollment*. Every case in the tree is a **reason attached to a derived
      member**: `NO_KEYBOARD`, `INERT_PANEL_KEYS`, `NO_FLAG`,
      `EVIDENCE_WASH_GAMES`, `NO_CONSUMER`, `TEST_ONLY_CONSUMER`, `IDIOMS`,
      `nonUniqueTiers`, `nonMonotone`. Three are **empty** — including
      `NO_KEYBOARD`, the example the proposal cited as the live case *for*
      declaration. The one genuine "intent behavior cannot show" is a
      technique's **tier**, and it sits on the technique, consumed by
      `runDeductionFixpoint` at run time, not on the game for a guard to read.
- [x] 1.2 **The capability-manifest diff.** Needs no manifest. A derived set
      snapshotted in the guard is the same diff and cannot be forgotten by a new
      game; the shape already ships five times over. `migration.md` amended.
- [x] 1.3 **Discoverability.** The menu is `engine-catalog.md` and it is good —
      all four shipped mechanics have entries. But **nothing held it complete**,
      and five modules had gone uncataloged, `params-codec.ts` among them. A
      manifest would not have helped (you cannot look up a key you do not know
      to write); a guard does. Shipped as `scripts/checks/engine-catalog.mjs`.

## 2. What shipped

- [x] 2.1 `hint-quality.test.ts`: `DEDUCTIVE` inverted — derived from
      `HINT_GAMES` minus a reasoned `NARRATES_MOVES` ledger, with a floor and a
      ledger-honesty check. Five games gain the necessity check.
- [x] 2.2 `NECESSITY` gains `nowhere` ("can go nowhere but this cell" is plain
      necessity English, not a private idiom); `IDIOMS` becomes a predicate over
      the **step**, and Subsets' continuation legs get an owner-endorsed entry
      scoped to `continuesPrevious` (owner, 2026-09-06). Both mutation-proved.
- [x] 2.3 `mark-all.test.ts`: `canMarkAll` held to an `M` press through
      `interpretMove`. (Not through the midend: it reports a bare `UI_UPDATE` as
      consumed, and Ascent returns one for any button inside its grid, so that
      route names eleven games where ten offer the press.)
- [x] 2.4 `touch-input.test.ts`: `wantsStylusModifier` held to an actual read of
      `MOD_STYLUS`, both directions. The flag turns the whole touch-parity sweep
      off, which is why it most needed this.
- [x] 2.5 `testing/enrollment.ts`: `membersNotMentioning` now scans **code**,
      comments stripped. Its first cut convicted Net for a comment explaining
      that it deliberately has no stylus branch — a game punished for
      documenting an absence. Strengthens all four callers.
- [x] 2.6 `scripts/checks/engine-catalog.mjs` + the five missing entries
      (`assert-never`, `hint-mark`, `hint-ordinal`, `hint-refusal`,
      `params-codec`), wired into the gate's fast prefix ahead of the
      documentation-only shortcut — the spelling guard's precedent, for the same
      reason.
- [x] 2.7 Docs: `guarantees.md`'s standing principle rewritten and its table
      reclassified; `game-definition.md`'s frame annotated with the
      input-versus-manifest distinction; `migration.md`'s manifest diff amended;
      `docs/games/testing.md` § "How a cross-game guard finds its population"
      written as the followable rule; `engine-catalog.md`'s stale
      "`hint-games.ts` is the enrollment list" sentence corrected.
- [x] 2.8 Pattern's "the one game that wants the raw MOD_STYLUS bit" corrected —
      Loopy wants it too.
- [x] 2.9 `ts-engine` spec: four requirements, so the next change does not
      re-decide any of this.

## Standing constraints — how each was met

- [x] C1 **Not generalized from input.** The deduction end was read separately
      and answers *differently* — and that difference is the survey's sharpest
      result. `declare-deduction-techniques` shipped a real declaration
      (`{ id, tier, run }`), and a technique's tier is genuinely undecidable from
      behavior. It is not a counterexample to the hypothesis but the thing that
      sharpens it: **declaration-as-input is healthy; declaration-as-manifest is
      what keeps being reversed.**
- [x] C2 **The survey did not only confirm.** Two candidate answers were
      measured and rejected. A blanket `continuesPrevious` exemption looked
      elegant and derived, and the measurement killed it: **244 of 253**
      continuation legs across the enrolled games already carry a modal, so it
      would have given up a check the corpus overwhelmingly passes. And the
      first stylus scan produced a defect that was not there (Net), which is the
      instrument failing, not the game.
- [x] C3 **The `NO_KEYBOARD` pattern was priced, not assumed.** It is the right
      answer, and the survey found *why*: the list is not enrollment, it is a
      snapshot of the derived set. That is why it can be empty and still assert
      something.
- [x] C4 **No RDD passage left claiming unshipped behavior in the present
      tense.** `guarantees.md`'s principle, its table header,
      `game-definition.md`'s opening frame and its Affordances section, and
      `migration.md`'s manifest bullet all now say what shipped and point at the
      live contract.
- [x] C5 **`adopt-the-game-definition-adapter` is fed, not pre-empted.** The
      evidence it is owed: a fourth and fifth concern have now stood alone
      (`params-codec`, the note-taking cell), no declaration has needed to know
      about another, and the criterion it holds is untouched by this change.
