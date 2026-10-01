## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-30

**02_EXECUTE cycle COMPLETE — Wave D now finished too.** 71/73 tasks Fixed
(T01–T61, T63–T72), 1 task subsumed by design (T62 RecoveryPanel — recovery/
import surface is inseparable from controller recovery-mode state), 1 task
consumed by predecessor (T28 by T27), 3 NEW findings Fixed.

**Wave D complete at `53e4d06`:** `src/trip/` now holds ExpensePanel,
PeoplePanel, SettlementPanel and LedgerPanel. Trip.svelte dropped 1819 →
~1490 lines. Dependency graph verified: every panel imports ONLY `@/lib/*`
and `@theprawnsplit/core` types — zero `@/db/repo`, `@/relay/*` or
`Trip.svelte` imports, so no controller cycle and no panel opens its own
database or relay. Trip.svelte stays the single group-lifetime owner of
polling, transports, persistence and signing.

**Dependabot: all 7 alerts cleared.** `undici` fixed transitively and
`sharp` bumped 0.33.5 → 0.35.5 (dev-only, `scripts/gen-icons.mjs`).
`npm audit` now reports 0 vulnerabilities.

Final closeout commits: T65 (`d54e0cb` DRIFT-003 README source-archive doc),
T66+T68 (`2baec9d` DRIFT-004+FS-001 SECURITY.md scanner claims + BEL fix),
T67 (`10eb11e` DRIFT-006 PRD Q11 Keep/Revert wording), T69 (`00665a2` FS-002
retention formatter section transition), T71 (`2dcfa74` DEAD-001 inert
rename predicate removal).

Final verification: core 136/136 pass, svelte-check 0/0. All commits
recorded in execute_state.json.commits and per-task Result paragraphs in
tasks.md. All P2/P3 dispositions recorded in bugfix.md.

**Residual manual actions (user):** (1) open PR to `main` via
https://github.com/hongyime/theprawnsplit/compare/main...maintenance/prawn-ui-20260916?expand=1
— the github_create_pull_request MCP still fails on token scope; (2)
rotate/revoke Supabase PAT (see execute_state.json.verification.policy_gates_resolution.B4 note about the exposed PAT)
— was told to do this during T25/B4 resolution; still unconfirmed.

**Residual risks flagged for a future session (NOT this cycle's scope):**
(1) 2 high-severity Dependabot vulnerabilities on `main` — flagged by GitHub
on every push, unrelated to this queue; (2) pre-existing
`test/config.test.ts` CR-013 duplicate-content-lines assertion fails on one
duplicate MOLT_AUTO_HOOK JOURNAL.md line at head=`b7ee0d5` (2026-09-21,
unrelated to this cycle); (3) T61–T64 panel extractions await a dedicated
Wave-D cycle.

Full per-task history in .agents/JOURNAL.md and the git log on this branch.

## Status

COMPLETE — 02_EXECUTE cycle done; 68/73 Fixed, 4 Deferred, 1 subsumed,
3 NEW findings Fixed. Awaiting manual PR-to-main and Supabase PAT rotation.

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

- Updated: 2026-10-01 02:11:55 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: b0e46df
- Dirty files: 9
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->

Machine-specific values in this document use privacy placeholders.
