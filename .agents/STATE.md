## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T51 (FE-005 — gate settled/archive claims on an unfrozen projection) done
at commit `50c77f2` — 51/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). FE-005 is now
FULLY resolved: `isSettledViewPredicate`, `allBalancesZero()` and
`archiveGroup()` all derived settled/first-zero/archive-summary claims from
`state.balances` without checking `state.frozen` -- a partial
(quarantine-truncated) projection could present as settled or get baked into
a permanent `GroupArchived.outstanding` summary even though the true balance
might not be zero once the excluded event folds. Fixed by threading frozen
state into all three, reusing the existing `frozenPolicy.allowSettlementActions`
derived var (matching the exact guard idiom already used for settlement
actions elsewhere in `src/Trip.svelte`). `downloadExport()` needed no change
-- already unconditional, satisfying "retain manual raw export." Full
history of every completed task is in .agents/JOURNAL.md and in the git log
on this branch. Next: T52.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 51/73 tasks + 3 NEW findings complete.
Next: T52.

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
