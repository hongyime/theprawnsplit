## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-30

T57 (DRIFT-001 — reconcile technical documentation with final behavioral
outcomes) done at commit `cb6e90e` — 57/73 tasks + 3 NEW findings complete.
TDD.md §5 (core module signatures) and §6 (IndexedDB schema) were pre-T44/
T45/T47/T27/T30/T31/T38/T42/T43/T53 stale. Fixed: added required
`ctx: VerificationContext` params on `authorisedKeys`/`verifyConfirmation`;
added `authorisedDevices`, `verifySettlementVoid` (SEC-002), `matchesPayee
ClaimSignature`, `claimAnomalies`, `contestedClaimPids`; added the
`VerificationContext` interface; added `void-settlement` and `reattest`
signed-payload rows; replaced non-existent `src/db/schema.ts` reference with
actual `src/db/repo.ts` schema at DB_VERSION=2 with the `linked`/
`sourceTagHex`/`reservations`/`relayPolicy`/`observedHlc`/`coverage` fields;
removed spurious `byDevCtr` index. No code changed. Full history in
.agents/JOURNAL.md and the git log on this branch. Next: T58.

## Status

IN PROGRESS — 02_EXECUTE cycle, 57/73 tasks + 3 NEW findings complete.
Next: T58.

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
