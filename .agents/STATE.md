## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-30

T54 (LOGIC-006 — drain archived pending work without reopening editing) done at
commit `d2f9124` — 54/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). LOGIC-006 is now
FULLY resolved: `shouldPollGroup` (src/lib/lifecycle.ts) stopped polling the
instant a group was archived, even with unpublished/unconfirmed local events
(including the archive event itself) still pending -- they could sit forever
without reaching peers. New required `PollingDecisionInput.hasPendingOutbox`
field; the archived short-circuit now only fires once the group is ALSO
drained (`!hasPendingOutbox`), so the timer keeps draining on the normal
active/backoff/idle cadence until confirmed, then stops again exactly as
before. `src/Trip.svelte`'s `startPolling()` supplies
`hasPendingOutbox: unconfirmedCount > 0` (the existing
`counts.local + counts.published` topbar signal -- no new state needed).
`src/relay/sync.ts` required zero changes: `syncOnce`/`runSyncCycle` never
gated on `archived` in the first place, so letting the timer fire is
sufficient; existing DATA-005 dedup already makes repeat drain attempts
effect-free. Every pre-existing `if (archived) return;` edit-control guard
elsewhere in Trip.svelte is untouched, so archived editing stays fully
disabled. Full history of every completed task is in .agents/JOURNAL.md and
in the git log on this branch. Next: T55.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 54/73 tasks + 3 NEW findings complete.
Next: T55.

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

- Updated: 2026-09-30 07:58:14 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: d2f9124
- Dirty files: 10
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->

Machine-specific values in this document use privacy placeholders.
