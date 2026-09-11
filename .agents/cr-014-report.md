# CR-014 — complete and durable relay recovery

Runtime and release verification passed on a49e256d16440536a59150140817746b00b29ced. This report records the
verified application and its limitations. Publication of this report and the
portfolio Markdown/PostPlan checkpoint is the final documentation step; the
portfolio ledger records that step after the push and production verification.
The wider portfolio and the separate retention gate remain open.

## Result and causes

A populated ledger could miss an event from a newly joined device. The old HTTP
fetch plan requested only authors already known to that ledger. The operated API
also applies its Redis page limit before the optional author filter, so a sparse
filtered result could prevent progress. The original in-memory fixture filtered
before limiting and did not model that boundary accurately.

Normal sync now uses one bounded topic read per relay. Existing topic cursors
remain incremental. When only old author cursors exist, a bounded replay discovers
earlier unknown-author events without promoting an author checkpoint to a global
checkpoint. Legacy metadata, encrypted records, wire formats and the relay pool
are preserved. The real HTTP adapter and handler are exercised against synthetic
encrypted stream data. The multi-page fixture keeps the API's limit-before-filter
semantics.

The old caller saved read cursors before durable event storage. A failed write
could therefore skip the missing records permanently on retry. `upsertRemoteEvents`
now saves received events, their version-vector contribution and cursor updates
in the same IndexedDB events/meta transaction, waits for completion and aborts on
failure. Import callers may omit cursor updates. This does not make the entire
sync operation atomic: buffered-event removal, transport-vector updates and
publication confirmations still have separate failure boundaries.

Replay duplicates previously entered admission accounting before being removed.
The caller now deduplicates against stored event IDs and within the incoming batch
before admission, preserving the allowance for fresh events. Read-back confirmation
counts still use the relayed envelopes. Quorum and admission caps are unchanged.

The known-device request fixture falls from four reads to one. This is a bounded
request-count result; it is not a measured reduction in monthly platform usage.
Initial legacy replay can read more old events before incremental operation resumes.

## Loop A — executed commands and independently derived counts

The required commands ran separately in the successful Ubuntu/Node release job:
[https://github.com/hongyime/theprawnsplit/actions/runs/34561921495](https://github.com/hongyime/theprawnsplit/actions/runs/34561921495). Both dependency installations also succeeded.
Root and core counts below are distinct; the root command invokes the core suite
before the application suite. Successful step conclusions establish zero exits.

```text
$ npm run build
2026-09-11T04:22:06.6022927Z > theprawnsplit@0.0.0 build
2026-09-11T04:22:06.6024425Z > npm run test:core && npm run test:sync && npm run lint:money && npm run check && vite build
2026-09-11T04:22:06.7258327Z > theprawnsplit@0.0.0 test:core
2026-09-11T04:22:06.7259330Z > npm --prefix core test
2026-09-11T04:22:06.9797119Z > @theprawnsplit/core@0.0.0 test
2026-09-11T04:22:06.9797618Z > vitest run
2026-09-11T04:22:08.9201593Z  Test Files  8 passed (8)
2026-09-11T04:22:08.9203067Z       Tests  81 passed (81)
2026-09-11T04:22:09.0438644Z > theprawnsplit@0.0.0 test:sync
2026-09-11T04:22:09.0439157Z > vitest run --config vitest.config.ts --dir .
2026-09-11T04:22:37.0811208Z  Test Files  63 passed (63)
2026-09-11T04:22:37.0817849Z       Tests  211 passed (211)
2026-09-11T04:22:37.2471760Z > theprawnsplit@0.0.0 lint:money
2026-09-11T04:22:37.2472263Z > node scripts/lint-money.mjs
2026-09-11T04:22:37.3776234Z > theprawnsplit@0.0.0 check
2026-09-11T04:22:37.3776944Z > svelte-check --tsconfig ./tsconfig.json
2026-09-11T04:22:41.7685721Z svelte-check found 0 errors and 0 warnings
2026-09-11T04:22:44.2438784Z ✓ built in 1.94s
conclusion: success
```
```text
$ npm test
2026-09-11T04:22:44.4479575Z > theprawnsplit@0.0.0 test
2026-09-11T04:22:44.4480409Z > npm run test:core && npm run test:sync
2026-09-11T04:22:44.5444689Z > theprawnsplit@0.0.0 test:core
2026-09-11T04:22:44.5445100Z > npm --prefix core test
2026-09-11T04:22:44.6417850Z > @theprawnsplit/core@0.0.0 test
2026-09-11T04:22:44.6418192Z > vitest run
2026-09-11T04:22:46.2912022Z  Test Files  8 passed (8)
2026-09-11T04:22:46.2913507Z       Tests  81 passed (81)
2026-09-11T04:22:46.4227963Z > theprawnsplit@0.0.0 test:sync
2026-09-11T04:22:46.4228662Z > vitest run --config vitest.config.ts --dir .
2026-09-11T04:23:33.4964133Z  Test Files  63 passed (63)
2026-09-11T04:23:33.4965674Z       Tests  211 passed (211)
conclusion: success
```
```text
$ npm --prefix core test
2026-09-11T04:23:33.6875316Z > @theprawnsplit/core@0.0.0 test
2026-09-11T04:23:33.6875888Z > vitest run
2026-09-11T04:23:35.3319211Z  Test Files  8 passed (8)
2026-09-11T04:23:35.3320211Z       Tests  81 passed (81)
conclusion: success
```
```text
$ npx svelte-check --tsconfig ./tsconfig.json
2026-09-11T04:23:39.9883781Z svelte-check found 0 errors and 0 warnings
conclusion: success
```

The local focused sync run passed 23/23.
The corrected local landing suite passed 3/3.
Local Svelte checking also reported zero errors and warnings. These targeted
checks do not turn the failed Windows aggregate run into a pass: that run had a
worker-start failure in the existing common-expense UI file. The independent
hosted commands above provide the completed aggregate gates. No permanent test
pool, isolation, dependency or lockfile setting was changed to hide that failure.

Counts and source references were collected with:

```text
python collect-prawn-split-final-evidence.py
python audit-prawn-split-source.py final-source-review
```

Their computed output, excluding unrelated deployment identifiers:

```json
{
  "status": {
    "total": 116,
    "distribution": {
      "Built": 114,
      "Partial": 2
    }
  },
  "tables": {
    "PRD.md": {
      "tables": 40,
      "rows": 452,
      "errors": []
    },
    "STATUS.md": {
      "tables": 1,
      "rows": 118,
      "errors": []
    }
  },
  "baseline_files": 204,
  "unchanged_baseline_files": 196,
  "changed_baseline_files": [
    ".agents/JOURNAL.md",
    ".agents/PROTOCOL.md",
    "PRD.md",
    "STATUS.md",
    "src/db/repo.ts",
    "src/relay/sync.ts",
    "test/landing-ui.test.ts",
    "test/sync.integration.test.ts"
  ],
  "retention_paths_preserved": [
    ".agents/task0-retention-current.md",
    ".agents/task0-retention-slow.md",
    ".agents/task0-retention.md",
    ".github/workflows/task0-retention.yml",
    "scripts/task0-retention.mjs"
  ],
  "retention_note_only_deployments": 11,
  "production_http_checks": 12,
  "matching_assets": 10,
  "browser": {
    "primary": {
      "origin": "https://theprawnsplit.hong-yi.me",
      "checks": 11,
      "errors": []
    },
    "secondary": {
      "origin": "https://theprawnsplit.vercel.app",
      "checks": 11,
      "errors": []
    }
  },
  "source_call_counts": {
    "relayFetchPlans(": 1,
    "admitTransportEvents(": 1,
    "upsertRemoteEvents(": 2
  }
}
```

The baseline covers tracked source/configuration files and excludes the changing
shared state file. It is not an export or checksum of private browser ledgers.
The edited PRD and STATUS table shapes pass. Existing STATUS grading is retained;
this repair does not establish assertion-level coverage for every requirement.

Fresh path/function verification:

```text
$ rg -n -e relayFetchPlans -e admitTransportEvents -e upsertRemoteEvents -e cursorUpdates -e ensureGroup -e "function listGroups" -e opts.author -e XRANGE -e xrange -e FILTER src/relay/http.ts src/relay/nostr.ts src/relay/sync.ts src/relay/types.ts src/db/repo.ts src/App.svelte api/relay.ts core/src/transport.ts
api/relay.ts:95:      const rows = await redis().xrange<{ blob?: string; author?: string }>(
src/db/repo.ts:258:export async function listGroups(): Promise<StoredGroup[]> {
src/db/repo.ts:308:export async function ensureGroup(seed?: JoinSeed): Promise<GroupRecord> {
src/db/repo.ts:571:  await upsertRemoteEvents(group.groupId, delta.events);
src/db/repo.ts:677:export async function upsertRemoteEvents(groupId: string, events: Event[], cursorUpdates: Record<string, string> = {}): Promise<number> {
src/db/repo.ts:696:        cursors: { ...meta.cursors, ...cursorUpdates }, lastSyncAt: Date.now() });
src/relay/sync.ts:2:import { admitTransportEvents, canonicalState, fold } from "@theprawnsplit/core";
src/relay/sync.ts:16:  upsertRemoteEvents,
src/relay/sync.ts:48:export function relayFetchPlans(group: GroupRecord, relayName: string): RelayFetchPlan[] {
src/relay/sync.ts:187:  const fetchJobs = relays.flatMap((relay) => relayFetchPlans(group, relay.name).map((plan) => ({ relay, plan })));
src/relay/sync.ts:200:  const cursorUpdates: Record<string, string> = {};
src/relay/sync.ts:209:    if (lastEntry) cursorUpdates[relayResult.cursorKey] = lastEntry.cursor;
src/relay/sync.ts:239:  const transport = admitTransportEvents(incoming, group.events, group.meta.discardVector, {
src/relay/sync.ts:267:  result.received = await upsertRemoteEvents(groupId, transport.admitted, cursorUpdates);
src/relay/http.ts:24:    if (opts.author) url.searchParams.set("author", opts.author);
core/src/transport.ts:55:export function admitTransportEvents(
src/App.svelte:13:    ensureGroup,
src/App.svelte:231:        group = await ensureGroup(seed);
src/App.svelte:414:    group = await ensureGroup();
src/App.svelte:994:      group = await ensureGroup();
src/relay/nostr.ts:59:    ...(opts.author ? { authors: [opts.author] } : {}),
```

## Loop B — failures before fixes and deliberate regressions

The recorded unfixed HTTP discovery/pagination/persistence cases, real transaction
abort, replay-budget case and reversed-sort fixture failed as follows. Pending
cases are deliberately deselected cases in the targeted runs, not passing tests.

```text
sync-red: {"total": 5, "passed": 0, "failed": 5, "pending": 0}
discovers a previously unknown device in an already populated ledger
AssertionError: expected [ Array(1) ] to include 'new-device:1'
reaches new authors beyond a full mixed stream page without refetching the first page
AssertionError: expected [] to have a length of 1 but got +0
keeps read cursors unchanged when durable event storage fails
AssertionError: expected { …(1) } to deeply equal {}
recovers the missing event on retry after a temporary storage failure
AssertionError: expected [] to have a length of 1 but got +0
uses one incremental stream read regardless of the known device count
AssertionError: expected [ …(4) ] to have a length of 1 but got 4
```
```text
transaction-red: {"total": 6, "passed": 0, "failed": 1, "pending": 5}
keeps event rows and the cursor together when an IndexedDB transaction aborts
AssertionError: expected { 'operated:topic': '1000-1' } to deeply equal {}
```
```text
replay-red-v2: {"total": 7, "passed": 0, "failed": 1, "pending": 6}
does not count replayed stored events against the admission budget for fresh events
AssertionError: expected { published: +0, confirmed: +0, …(7) } to match object { received: 1, dropped: +0 }
```
```text
sort-fixture-red: {"total": 3, "passed": 0, "failed": 1, "pending": 2}
lists stored groups sorted by newest first
AssertionError: expected 'g_b4fee02b-3e38-4a2c-b5c0-b4120b0d72ce' to be 'g_8b0fa17f-c4ad-44b0-8914-6f7c3dd5ee73' // Object.is equality
```

The initial replay runner produced only `STACK_TRACE_ERROR`; that output was not
used as a behavioral RED. The subsequent replay run above has the actual assertion
failure. Legacy author-checkpoint recovery also fails in the known-author-only
mutation and passes in the final focused suite.

The runtime mutation runner restored both source files after each variant:

| Deliberate regression | Failed cases | Meaningful assertion failures |
| --- | --- | --- |
| known-author-only | 5 | 5 |
| checkpoint-before-write | 4 | 3 |
| checkpoint-not-saved | 3 | 3 |
| duplicates-counted-as-new | 1 | 1 |

The checkpoint-before-write variant additionally produced an unclassified
`STACK_TRACE_ERROR` for pagination. It is excluded from meaningful failures.
The reversed comparator also failed the corrected trip-order assertion and was
restored; application timestamp and ordering behavior were not changed.

**B1 — Class and scope.** The source call counts above cover the production TypeScript
tree. Fetch planning has a shared caller; transport admission has a sync caller;
remote persistence has both sync and import callers. The fix addresses normal
topic recovery and received-event/cursor persistence at those boundaries. It does
not claim the other persistence steps or legacy author-filter API are repaired.

**B2/B3 — Can the tests fail?** The initial REDs and distinct mutations above exercise
discovery, bounded progress, storage failure/retry and duplicate-budget behavior.
The passing tests were observed to fail under the relevant old behavior or a
deliberately restored regression. No test assertion was removed to obtain GREEN.

**B4 — Whole-path trace.** `App.svelte` calls sync, which builds relay fetch plans and
uses the adapter contract in `src/relay/types.ts`. HTTP passes its cursor and
optional author to `api/relay.ts`; Redis limits first. Nostr uses its topic/time
cursor semantics and client-side cursor filtering. Both return encrypted envelopes
to sync for decryption, duplicate filtering and core transport admission. Sync
passes admitted events and cursor updates to the shared repository transaction.
The full trace exposed the old HTTP fixture's ordering mismatch and the cursor's
early persistence. Existing Nostr integration checks remain in the root suite.

**B5/B6 — Boundaries and conclusions.** Production browser checks use isolated
contexts with synthetic HTTP/Nostr relay traffic and service workers blocked.
They verify setup, claiming, expense creation, confirmation before sharing, mobile
join recovery, discovery of the new mobile participant, reopening after reload,
topic cursor use, page overflow and uncaught JavaScript errors. The browser assets
tested on runtime commit 461e5455 match the subsequent fixture-only deployment.
All public HTML/compiled-file comparisons and malformed-tag JSON checks pass on
both aliases. Those input-validation requests stop before opening a Redis stream.
No private ledger or real relay write was used as a test fixture.

## Deviations and additional findings

- The replay admission defect was discovered while exercising bounded replay and
  was fixed at the same caller boundary, with its own recorded RED.
- The encrypted pagination fixture exceeded its original five-second deadline on
  this Windows runner. Only its deadline changed to thirty seconds; the page and
  event assertions remain intact. Fixture array accesses were then guarded to
  satisfy the existing strict type checks.
- The first hosted build passed, but its separate root-test step exposed the old
  trip-order fixture's clock assumption. Distinct explicit timestamps repair that
  fixture. The original CI log did not contain the actual timestamps, so an equal
  timestamp on that run is an inference from source, not a measured value.
- A repository-specific main-push workflow runs every protocol command because
  the shared build workflow is PR-only. It filters application/config changes and
  leaves daily retention Markdown updates out of this extra CI build.
- The initial production checker expected plain text for malformed tags; the
  actual handler returns JSON. Correcting the checker made both validations pass
  without changing the endpoint.
- The stale local Git commit-graph chain was preserved and its replacement cache
  was verified without changing HEAD, source history or tracked contents.
- Source inspection found possible first-trip selection during join/refresh.
  This is queued for behavioral reproduction rather than claimed fixed here.
- The mobile Shadow badge overlaps provenance text inside its row, despite no
  page overflow. The UI backlog retains that finding.
- Retention-report-only commits caused the production deployments counted above.
  A conservative deployment-ignore follow-up is queued; no Vercel setting or
  retention schedule was changed by CR-014.

## Production and release checklist

Production deployment `dpl_EkPTtGBAanxAUSAk2LuVNofPyzTu` is READY on `a49e256d16440536a59150140817746b00b29ced`.
The public aliases are https://theprawnsplit.hong-yi.me and
https://theprawnsplit.vercel.app. The latest asset comparison is recorded in
`prawn-split-production-fixture-release.json`; browser evidence is in
`prawn-split-browser-production-primary.json` and its secondary counterpart.
Full local evidence remains in the portfolio maintenance artifact directory;
the hosted command output and workflow links are provided here for independent review.

- [TruffleHog Secret Scan](https://github.com/hongyime/theprawnsplit/actions/runs/34561921469): success
- [Semgrep](https://github.com/hongyime/theprawnsplit/actions/runs/34561921467): success
- [LFS Guard](https://github.com/hongyime/theprawnsplit/actions/runs/34561921459): success
- [CodeQL Analysis](https://github.com/hongyime/theprawnsplit/actions/runs/34561921471): success
- [Prawn Split Release Check](https://github.com/hongyime/theprawnsplit/actions/runs/34561921495): success

At report generation the application worktree was clean on the verified source
commit. This report, STATE, JOURNAL and backlog notes are then published together;
final clean-tree, push and notes-deployment verification are recorded in the
portfolio release metadata. The report does not fabricate its own future commit
or deployment. The original prompt remains the unmodified audit trail.

## Not verified this pass

Live relay retention and admission, existing PWA upgrade/offline behavior, monthly
usage savings, multi-trip selection, HTTP/NIP-11 deadlines, legacy optional author
filter pagination, the remaining independent persistence boundaries, mobile row
layout, the broader semantic STATUS audit and every other portfolio requirement
remain outside this completed runtime verification. The separate retention clock
and scheduled probes are preserved. The existing IndexedDB/Redis/Nostr design was
not migrated into Supabase, and no existing records were removed.

## B4 correction — 2026-09-11 source recheck

The B4 phrase "client-side cursor filtering" above is incorrect. Nostr passes the
timestamp watermark to the relay as `since`. `selectNostrEntries` removes duplicate
event IDs, sorts by creation time and ID, and emits timestamp cursors; it does not
filter locally by the supplied `since` value. This is existing behavior and was
unchanged by CR-014. This addendum preserves the original report and corrects the
trace; the implementation and test conclusions do not rely on local time filtering.

```text
$ rg -n -e since -e seen.has -e sort -e querySync src/relay/nostr.ts
14:export function selectNostrEntries(events: NostrEventLike[], opts: { since?: number | null }): RelayEntry[] {
18:  // The relay applies `since` server-side; the boundary second may re-deliver
22:    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
23:    .sort((a, b) => a.created_at - b.created_at || compareCodepoints(a.id, b.id))
53:  opts: { author?: string; limit?: number; since?: number | null },
60:    ...(opts.since ? { since: opts.since } : {}),
94:    const since = opts.cursor ? Number(opts.cursor) : null;
95:    const filter = nostrFetchFilter(tag, this.kind, { ...opts, since });
96:    const events = await this.pool.querySync(this.relayUrls, filter);
97:    return selectNostrEntries(events, { since });
```

## Not verified this pass — unchanged after correction

The scope exclusions in the preceding section remain open. In particular, live
Nostr retention/admission and the behavior of relays returning events outside
their requested timestamp range were not verified by these isolated checks.
