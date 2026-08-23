# Tasks — upgrade-openspec-tooling

> **Take the baseline before touching anything.** The acceptance criterion is
> "every spec and change still validates, and the archive is unharmed", and a
> baseline taken afterwards proves nothing. This is the same rule
> `anchor-probe-cases-structurally` opens with.

## 0. Decision (owner) — blocks §3, not §1–2

- [ ] 0.1 What happens to `retire-modified-spec-deltas` once the tool is safe.
      Recommended: **revert most of it** — `MODIFIED` legal again, the
      `OPENSPEC_AGENTS.md` override block and both guards deleted — keeping the
      §2.2 Slide fix and this change's pinning. The alternative is to keep
      `ADDED`-only as **house style** on a now-safe tool, which is a legitimate
      taste (one verb, nothing to remember) but must be *labelled* as taste
      rather than as a hazard mitigation, because the hazard is gone.
- [ ] 0.2 Whether the upgrade is installed globally (`npm i -g`, matching today)
      or only as a repo devDependency. **Recommended: devDependency**, so the
      repo states its own version; a global install then only affects other
      projects. Note the current global is shared with whatever else the owner
      uses openspec for, which is a reason not to bump it silently.

## 1. Baseline

- [ ] 1.1 Record `openspec validate --all --strict` on 0.15.0 — expect
      `79 passed, 0 failed` for specs and `9 passed` for changes.
- [ ] 1.2 Record `git rev-parse HEAD`, and the byte size / file count of
      `openspec/specs/` and `openspec/changes/archive/`. The archive is 288 delta
      files of history; "untouched" must be checkable, not asserted.
- [ ] 1.3 Note which files carry OpenSpec managed markers today (`AGENTS.md`'s
      managed block, `openspec/OPENSPEC_AGENTS.md`, `openspec/project.md`), since
      the upgrade is documented to strip or delete them.

## 2. Upgrade

- [ ] 2.1 Add `@fission-ai/openspec@1.10.0` per the 0.2 decision. Keep
      `npm install` as the entire setup (`AGENTS.md`, "Build commands").
- [ ] 2.2 Run the documented upgrade (`openspec init`, or `openspec update` to
      refresh tools; `openspec init --force --tools claude` is the
      non-interactive form) and **read the diff before accepting it** — this is
      the step that rewrites instruction files.
- [ ] 2.3 Re-run `openspec validate --all --strict` and require the 1.1 numbers.
      A change or spec that 1.x parses differently is the finding this task
      exists for, not a nuisance.
- [ ] 2.4 Confirm the archive is byte-identical to 1.2. If 1.x rewrites archived
      changes, stop and re-scope — rewriting history is explicitly out.

## 3. Reconcile the workaround (gated on 0.1)

- [ ] 3.1 Apply the 0.1 decision to `retire-modified-spec-deltas`: revert, or
      relabel as house style. Either way **delete the `OPENSPEC_AGENTS.md`
      override block and the guard asserting it survives** — if 1.x stops
      generating that file, both are guarding a file that no longer exists, and
      a guard that cannot fire reads as a mechanism still in use (that change's
      own §3.1 reasoning, turned on itself).
- [ ] 3.2 Keep the Slide fix from that change's §2.2 regardless — the delta
      targeting the wrong requirement is a content bug, and no scenario check on
      either side can see it.
- [ ] 3.3 Rewrite `AGENTS.md` § "Work management" to match whatever 0.1 decides,
      and **keep the incident** (the 134 lines) as the reason — with its real
      resolution, which is that the tool was nine months stale. A rule whose
      motivating failure is not recorded gets re-litigated; a rule whose failure
      is recorded *wrongly* is worse.

## 4. Close the two open questions this touches

- [ ] 4.1 `AGENTS.md` "Known unresolved questions" — the entry hoping upstream
      would let the instruction filename be configured. If 1.x deletes
      `openspec/AGENTS.md` outright, the question is answered by removal rather
      than by configuration; say so and strike it, along with the rename dance in
      the managed block.
- [ ] 4.2 Add the version floor (proposal, "Assert the floor"): a machine on an
      older CLI must be told. Cheap, and it is the control whose absence let a
      nine-month-old tool gate the workflow unnoticed.
- [ ] 4.3 **Prove the floor fires** — point it at a version above the installed
      one, watch it fail, revert. A guard never shown to fail is not known to
      work.

## 5. Verify

- [ ] 5.1 Full gate green.
- [ ] 5.2 Archive one change end-to-end under 1.x on a committed tree, confirm
      `git diff openspec/specs/` is what the delta says it should be, then
      `git reset --hard` (this project does not branch —
      `feedback_trunk_based_no_branches`).

## 6. Close out

- [ ] 6.1 Owner acceptance, then archive.
