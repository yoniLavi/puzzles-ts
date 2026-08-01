# Design — audit-author-known-issues

## Context

The porting effort reads three kinds of author statement, and they are not
interchangeable:

1. **`TODO`/`FIXME` comments in the `.c`** — terse, implementation-facing, and
   written for whoever next opens the file.
2. **`puzzles/unreleased/docs/<game>.md` `## Status`** — candid, player-facing,
   and written to say *what is wrong with the game*. This is where x-sheep says
   things like "This puzzle has severe problems" and "the colors should probably
   be removed entirely".
3. **Upstream Tatham's prose** — `puzzles/unfinished/README` and the manual,
   which explain why a game was shelved.

Crossing demonstrated that reading (1) and skipping (2) looks like diligence and
isn't: the `.c` TODO mentioned the clue-list problem and the colours, so the port
*appeared* to have covered the author's concerns, while the one request that most
improved the game — automatic cursor movement — appeared only in (2) and was
never seen. Playbook §1.0 now requires reading (2) first, but the rule cannot
retroactively bind the nine ports that predate it.

## Decisions

### D1 — A reconciliation, not a re-read

The audit's unit of work is a **claim about what shipped**, not a fresh opinion
about each game. For every author-stated point the question is "what did the port
do about this, and is that recorded?" — with four allowed answers (fixed /
declined / owner-pending / outstanding). A point that was consciously declined is
a *pass*, provided the reason is written down; the failure mode this exists to
catch is a defect the author named that the port reproduced silently.

### D2 — Verify against behaviour, not against the design note

`design.md` findings are the first place to look but not the evidence. Two
patterns in this repo make a written decision an unreliable record: decisions get
**overturned during implementation** (Loopy's D6c luminance palette was written,
built and reverted; Crossing's D9 "reflow the number list" turned out to need no
change at all and its stated *reason* was wrong), and a finding can be **too
generous** about its own coverage (Crossing's F8 declared the matter closed after
looking at two board sizes, missing the failure at the top of the range). So a
"fixed" verdict cites a test or a behaviour, not a paragraph.

### D3 — Timing is a hard constraint, not a preference

`retire-c-engine` deletes `puzzles/` wholesale. Per-game C deletion does **not**
remove `docs/<game>.md` (every ported game's file is still present today), so the
material survives until that teardown and then vanishes. The audit must therefore
sit between "last port lands" and "C is retired", and `retire-c-engine` should
name the dependency. Anything whose reasoning must outlive the subtree moves into
the relevant capability spec (D4).

### D4 — Verdicts that matter become spec text

A deliberate divergence from an author's stated intent is a behavioural contract:
Crossing having no per-digit colours, and its cursor advancing along a run, are
now requirements in the `crossing` spec rather than only commit messages. Where
the audit confirms such a decision for an earlier port, it is added the same way.
A *declined* point usually stays in the audit table only — it changed nothing.

### D5 — Scope discipline on the big ones

Some author requests are whole projects. Seismic's "the generator step that
creates randomly filled regions needs to be completely replaced" is a generator
rewrite; Salad's is a request for shared pseudo-Latin support upstream never
built. Those are proposed, not attempted, and the audit stays a sweep rather than
becoming an umbrella for unrelated work.

Seismic's is the worked example of that discipline, and of the alternative timing:
its port measured the limit precisely (1 in 200,000 successes at 49 cells, none
above ~50) and opened `replace-seismic-region-generator` there and then, because
the measurement was in hand and would otherwise have to be redone. So a port that
*quantifies* an author's complaint should open the change itself; this audit is
the backstop for the ones that didn't.

## Risks

- **The sweep becomes a rubber stamp.** Mitigated by D2: a "fixed" verdict has to
  point at a test or an observed behaviour.
- **It is run too late.** Mitigated by the `ts-migration` requirement and the
  dependency recorded in `retire-c-engine`.
- **It grows into a rewrite programme.** Mitigated by D5.

## Open questions for the owner

1. **Batching the taste calls.** The audit will likely surface several
   author-flagged aesthetic choices like Crossing's colours. Presenting them as
   one batch is assumed; say if you would rather take them per game.
