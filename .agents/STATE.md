## Portability maintenance - 2026-09-27

- Replaced POSIX-only inline ANALYZE assignment with a Node launcher preserving arguments, environment and exit status. Stub Vite contracts passed on Windows and Linux; no application build ran.

# Project State

## Last change — 2026-09-23

T50 (REL-001 — bound operated relay pages by bytes) done at commit
`7c31ad4` — 50/73 tasks + 3 NEW findings complete in the 02_EXECUTE cycle
(see tasks.md/bugfix.md/execute_state.json). REL-001 is now FULLY resolved:
`api/relay.ts`'s GET handler fetched up to `limit` rows via Redis `xrange`
(count-bounded) then serialized ALL of them into one JSON response with no
byte-size check -- a page of legally-sized blobs could still serialize past
HttpRelay's own `boundedText` transfer ceiling (2.1MB), causing the client's
fetch to throw before the cursor ever advanced, an empty-progress stall that
repeated the same oversized page forever. Fixed via new exported
`boundEntriesByBytes(entries, maxBytes)`: always keeps at least the first
entry (no-stall guarantee) and drops trailing entries once the running
serialized total would exceed `MAX_PAGE_BYTES` (new, default 1.5MB); dropped
entries are never lost since the client's own cursor advancement naturally
resumes at the first omitted row. Full history of every completed task is in
.agents/JOURNAL.md and in the git log on this branch. Next: T51.

A separate, unrelated session fixed Dependabot PR #12 (trufflehog patch
bump) on `main` by enabling Dependency Graph via the GitHub API — merged,
done, no action needed here. That work never touched any file this
T-series cycle depends on.

## Status

IN PROGRESS — 02_EXECUTE cycle, 50/73 tasks + 3 NEW findings complete.
Next: T51.

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
