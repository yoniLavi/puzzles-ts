#!/usr/bin/env sh
# Kill vitest worker processes this repo leaked, before starting a new run.
#
# WHY THIS EXISTS. Every generator/solver/hint-planner under src/native/ is
# purely synchronous, so a worker mid-computation owns its thread outright:
# `testTimeout` is a setTimeout on that blocked loop and cannot fire, and the
# pool's shutdown is IPC-driven so the worker never reads "exit" either. Kill
# the parent vitest (Ctrl-C, a CI/bash-timeout SIGTERM) while a worker computes
# and that worker reparents to init and spins a core *forever*. Two such orphans
# (4h40m old, ~78% CPU each) were the main reason this box sat at load 13-96.
# Signals are the only layer above an uninterruptible sync loop, so an external
# reaper is the floor; scripts/gate.sh and the pre{test,test:run} npm hooks call
# it. See openspec/specs/repo-layout/spec.md, "Test worker processes do not
# outlive their runner".
#
# WHY BEFORE A RUN, NOT AFTER. The interrupt that orphans a worker also kills
# any post-run hook, so an "after" hook is never there when it matters. Running
# first means the *next* run cleans up the last one's leak — orphans stop
# accumulating, which is the property that actually protects the machine.
#
# WHY THIS CANNOT KILL SOMETHING IT SHOULDN'T. Two independent keys must both
# match: (1) PPID is exactly 1 — a live run's workers are children of their
# vitest runner, so this alone excludes every healthy process; (2) the command
# line contains THIS repo's node_modules worker path, which excludes other
# checkouts, other projects, and other users. Kills are by exact PID (never
# pkill/killall — those would take out the owner's running servers).
#
# FAIL-SAFE. Any error is swallowed and we exit 0. This runs ahead of the
# pre-commit gate; a reaper bug must never be able to block a commit.

# No `set -e`: a failing probe must not abort the caller's run.

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P) || exit 0
[ -n "$repo_root" ] || exit 0

# The path as it appears in a worker's command line. `pwd -P` above resolves
# symlinks, matching how node reports a resolved module path.
worker_path="$repo_root/node_modules/vitest/dist/workers/"

# `ps` fields: pid, ppid, elapsed, full command. `-A` (all processes) still only
# lets us signal our own; another user's processes are unkillable here anyway.
snapshot=$(ps -o pid=,ppid=,etime=,command= -A 2>/dev/null) || exit 0
[ -n "$snapshot" ] || exit 0

# Two lists, deliberately: `pids` is whitespace-safe for the kill loop to
# word-split, `notice` is human text (its ages contain no spaces today, but it
# is never split, so it cannot come apart if that changes).
pids=""
notice=""

# Field-split the snapshot rather than grepping it: the PPID==1 test has to be
# structural, since no substring match on a command line could establish it.
# Splitting also sidesteps a plain `grep -F "$worker_path"` matching this
# script's own scan process.
while read -r pid ppid etime command; do
  [ "$ppid" = "1" ] || continue
  case "$command" in
    *"$worker_path"*) ;;
    *) continue ;;
  esac
  [ "$pid" -gt 1 ] 2>/dev/null || continue

  # SIGTERM first: a worker blocked in sync JS won't run handlers, but one idle
  # between tests exits cleanly.
  kill -TERM "$pid" 2>/dev/null
  pids="$pids $pid"
  notice="$notice $pid (alive ${etime})"
done <<EOF
$snapshot
EOF

[ -n "$pids" ] || exit 0

# Give a cleanly-exiting worker a moment before escalating. Only ever paid on a
# box that actually had an orphan.
sleep 1

for pid in $pids; do
  # Still alive => it was sync-blocked and never ran the TERM handler. SIGKILL
  # is the only thing that reaches it; that is the whole point of the reaper.
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null
  fi
done

echo "reap: killed orphaned vitest worker(s):$notice" >&2
exit 0
