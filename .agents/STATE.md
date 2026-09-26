# Project State

## Last change — 2026-09-23

T44 (SEC-001 — authorisedDevices edge-validation half) done at commit
`27c0b97` — 44/73 tasks + 3 NEW findings complete in the 02_EXECUTE cycle
(see tasks.md/bugfix.md/execute_state.json). Found a genuine security
vulnerability via direct code-review reasoning after Oracle timed out a
4th time this session: `authorisedDevices` in `core/src/identity.ts`
trusted a device association whenever an event's claimPk/newClaimPk
matched an already-authorised key, without re-verifying THAT SPECIFIC
event's own signature -- letting an attacker inject a forged edge that
copies an already-known public key string and grant an attacker device
authority with zero valid signature. Fixed via a shared
`authorisedKeyEdges` computation tracking device alongside key only at
genuine signature-verification points. SEC-001 is NOT yet fully resolved
-- T45 still needs to replace fold.ts's unsigned born-confirmation
mechanism itself. Full history of every completed task is in
.agents/JOURNAL.md and in the git log on this branch. Next: T45.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 44/73 tasks + 3 NEW findings complete.
Next: T45.

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
