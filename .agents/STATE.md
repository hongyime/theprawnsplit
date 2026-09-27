## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T47 (SEC-002 — enforce the approved signed cancellation contract) done at
commit `fd99203` — 47/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). SEC-002 is
now FULLY resolved: `SettlementVoided` requires signed `pid`+`sig` fields
verified against `authorisedKeys` (any current group member, per design.md
§B2), replacing the removed unsigned `event.dev===settlement.dev` check.
Also fixed a MORE SEVERE bug found during implementation: a generic
unsigned `EventVoided` could make a settlement vanish from state entirely
via the main fold loop's `voided` skip -- now exempted for all settlement-
domain event types. Full history of every completed task is in
.agents/JOURNAL.md and in the git log on this branch. Next: T48.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 47/73 tasks + 3 NEW findings complete.
Next: T48.

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
- Machine: dev-host-2.example
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: a341d30
- Dirty files: 6
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->

Machine-specific values in this document use privacy placeholders.
