## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-30

T55 (LOGIC-005 — tie draft allocation to one actual reserved event ID) done
at commit `1b6ec1b` — 55/73 tasks + 3 NEW findings complete. Preview allocator
was hardcoded to the literal `"preview"` string as its tie-break salt — every
tied expense in a trip favoured the same participant. Fix: new `draftXid`
UUID state (reset after each successful `addExpense`) threaded through
`buildSharePreview` as `salt`, and reused as the `ExpenseAdded` `xid` on
commit. Cancellation drops the UUID with zero repo effect. `sharePreview.shares`
was already the source of truth for the commit path via `makeExpenseFinancials`,
so no re-allocation on commit was needed. Full history in .agents/JOURNAL.md
and the git log on this branch. Next: T56.

## Status

IN PROGRESS — 02_EXECUTE cycle, 55/73 tasks + 3 NEW findings complete.
Next: T56.

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
