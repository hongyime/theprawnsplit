# Project State

## Last change — 2026-09-23

T38 (CONC-001 — routed every UI event producer through the atomic
reservation allocator) done at commit `6df66ab` — 38/73 tasks + 3 NEW
findings complete in the 02_EXECUTE cycle (see
tasks.md/bugfix.md/execute_state.json). CONC-001 is now FULLY resolved:
no old factory()/commit()/appendEvents() path remains anywhere in
Trip.svelte. Full history of every completed task is in
.agents/JOURNAL.md and in the git log on this branch. Next: T39.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 38/73 tasks + 3 NEW findings complete.
Next: T39.

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

- Updated: 2026-09-22 21:06:27 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: b88cf7a
- Dirty files: 8
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->
