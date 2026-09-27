## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T48 (LOGIC-001 — discharge balances when recording settlement) done at
commit `4bee66b` — 48/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). LOGIC-001 is
now FULLY resolved: `core/src/fold.ts`'s settlement balance application
had `from`/`to` signs reversed, DOUBLING the remaining debt instead of
discharging it -- swapped so the payer gains toward zero and the payee
loses toward zero. Also corrected `PRD.md` §7.3's REQ-SET-05/REQ-SET-08,
which had drifted stale from this session's own earlier T44/T45/T47
security fixes. Full history of every completed task is in
.agents/JOURNAL.md and in the git log on this branch. Next: T49.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 48/73 tasks + 3 NEW findings complete.
Next: T49.

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
