## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T53 (REL-002 — apply endpoint-specific backoff and demotion) done at
commit `e860ac8` — 53/73 tasks + 3 NEW findings complete in the
02_EXECUTE cycle (see tasks.md/bugfix.md/execute_state.json). REL-002 is now
FULLY resolved: diagnostic actions (backoff-relay/drop-relay/retry-relay)
were already correctly classified but never fed back into scheduling -- a
failed or blocked endpoint kept consuming attempts at the ordinary cadence
forever. New `src/relay/endpoint-policy.ts` tracks bounded per-ENDPOINT (not
per-adapter) policy -- HttpRelay's single endpoint keyed `"operated"`, each
Nostr URL keyed by its own literal string so one bad Nostr endpoint never
suppresses the others. `NostrRelay` now skips backed-off/dropped URLs
internally before contacting `nostr-tools`; `createRelays()` simply omits a
backed-off operated HttpRelay, matching the existing `useOperated=false`
toggle -- zero changes needed to `sync.ts`'s adapter-level quorum counting.
New exported `resetRelayEndpoint()` is the sole explicit reset path. Full
history of every completed task is in .agents/JOURNAL.md and in the git log
on this branch. Next: T54.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 53/73 tasks + 3 NEW findings complete.
Next: T54.

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

- Updated: 2026-09-28 11:20:53 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: 66624d6
- Dirty files: 10
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->

Machine-specific values in this document use privacy placeholders.
