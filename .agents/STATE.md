## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T52 (PERF-001 — account for the entire retained future buffer) done at
commit `55f41c6` — 52/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). PERF-001 is now
FULLY resolved: `admitTransportEvents`'s buffer-cap check only ever measured
what THIS call buffers (a local array starting empty every time), with zero
knowledge of rows already retained from earlier cycles -- repeated future
pages could grow held-event storage past `bufferMaxEvents` indefinitely.
Fixed via a new required `existingBufferedCount` option (buffer-cap check is
now `opts.existingBufferedCount + buffered.length >= opts.bufferMaxEvents`);
new `src/db/repo.ts`'s `bufferedEventIds()` lets both sync callers derive it
from what's still legitimately held (excluding whatever is being
re-evaluated this cycle) and exclude re-delivered not-yet-due duplicates.
`admitTransportEvents` never evicts -- only defers new surplus. Full
history of every completed task is in .agents/JOURNAL.md and in the git log
on this branch. Next: T53.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 52/73 tasks + 3 NEW findings complete.
Next: T53.

## Active work context

Working branch: `maintenance/prawn-ui-20260916`, pushed to
`origin/maintenance/prawn-ui-20260916`. Not yet merged into `main` via PR
(compare link: https://github.com/hongyime/theprawnsplit/compare/main...maintenance/prawn-ui-20260916).
Every task's exact commit hash is recorded in tasks.md/bugfix.md/
execute_state.json (local-only pipeline artifacts, not git-tracked) and in
the git log itself. Multiple agents/sessions may be active on this repo
concurrently — always `git fetch` and check `git log --oneline -5` on both
`main` and this branch before assuming either is unchanged.

<!-- MOLT_AUTO_START -->
## Auto State

- Updated: 2026-09-28 11:20:53 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: 66624d6
- Dirty files: 10
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->

Machine-specific values in this document use privacy placeholders.
