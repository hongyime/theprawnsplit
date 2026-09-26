# Project State

## Last change — 2026-09-23

T43 (DATA-007 — publish and consume exact durable coverage evidence)
done at commit `e34798b` — 43/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). DATA-007 is
now FULLY resolved: `BaseEvent.coverage` is part of the Event wire format
(`core/src/types.ts`/`event-validation.ts`), `withVersionVector` stamps it
on outgoing events, and `isEventCoveredByEveryKnownDevice` returns a tri-
state (covered/not-covered/unknown) so the Trip.svelte label never claims
"Everyone Has This" from legacy vector-only evidence again. Full history
of every completed task is in .agents/JOURNAL.md and in the git log on
this branch. Next: T44.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 43/73 tasks + 3 NEW findings complete.
Next: T44.

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

- Updated: 2026-09-25 09:40:34 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: a341d30
- Dirty files: 6
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->
