## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T49 (LOGIC-003 — emit the correct schema version for rate-bearing
corrections) done at commit `ff8c3d6` — 49/73 tasks + 3 NEW findings
complete in the 02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json).
LOGIC-003 is now FULLY resolved: `src/Trip.svelte`'s `editExpense` always
called `makeEvent` without a version argument, so its `version = 1` default
was used even when the retained financials still carried a `rate` field --
quarantining the edit on the same device that just created it. Fixed by
mirroring `addExpense`'s already-correct convention: pass
`financials.rate ? 2 : 1` as the version argument. `core/src/fold.ts` needed
no change -- its v>=2-for-rate validation was already correct and tested.
Full history of every completed task is in
.agents/JOURNAL.md and in the git log on this branch. Next: T50.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 49/73 tasks + 3 NEW findings complete.
Next: T50.

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

- Updated: 2026-09-27 22:43:35 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: 359c324
- Dirty files: 12
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->

Machine-specific values in this document use privacy placeholders.
