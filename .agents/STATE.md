## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-30

T56 (PERF-002 — reuse immutable signature checks without stale authority)
done at commit `0ea6c26` — 56/73 tasks + 3 NEW findings complete.
`buildVerificationContext` re-ran `verifyClaim` for every signature on every
refresh. Fix: module-level bounded LRU (`SIGNATURE_CACHE_MAX = 10_000`) keyed
by `(groupTag, alg, publicKey, payload, signature)` — all immutable per event.
Cross-group reuse impossible (groupTag part of key). Authority state (voids/
revocations) still recomputed by the fold on every refresh so those changes
take effect immediately. Bounded LRU eviction via Map insertion-order.
Test-only `resetSignatureCache()` seam. Switched verifyClaim call to module-
namespace import so vitest spy can intercept. Full history in .agents/JOURNAL.md
and the git log on this branch. Next: T57.

## Status

IN PROGRESS — 02_EXECUTE cycle, 56/73 tasks + 3 NEW findings complete.
Next: T57.

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
