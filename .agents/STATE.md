## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-30

T58 (DRIFT-002 — document the implemented quorum and retry guarantees) done
at commit `e810a72` — 58/73 tasks + 3 NEW findings complete. PRD.md REQ-SYN-05
previously claimed operated ACK was mandatory absolutely; real implementation
in `src/relay/sync.ts` has configurable `config.ackQuorum`, excludes
"not configured" relays from the effective quorum (so Nostr-only and
operated-only deployments both work), skips T53 backoff/dropped endpoints
entirely, and has per-event fallback publish (CR-010/A13) when the batched
publish falls short. REQ-SYN-05 text now matches all four real behaviours.
No runtime change. Full history in .agents/JOURNAL.md and the git log on
this branch. Next: T59.

## Status

IN PROGRESS — 02_EXECUTE cycle, 58/73 tasks + 3 NEW findings complete.
Next: T59.

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
