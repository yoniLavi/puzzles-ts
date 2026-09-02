#!/usr/bin/env node
/**
 * stdin → stdout, folded to American spelling under `spelling-table.mjs`.
 *
 * This is the fold every shape proof of a respelling sweep uses: "every removed
 * line equals its added line once both are folded" —
 *
 *   git diff -U0 | grep '^[-+]' | grep -v '^[-+][-+]' | sed 's/^[-+]//' \
 *     | node scripts/checks/spelling-fold.mjs | sort | uniq -u
 *
 * prints nothing when the diff is a pure respelling, and prints exactly the
 * lines that changed in some other way when it is not.
 */
import { readFileSync } from "node:fs";
import { foldText } from "./spelling-table.mjs";

process.stdout.write(foldText(readFileSync(0, "utf8")));
