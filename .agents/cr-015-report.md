# CR-015 — Trip selection, request deadlines and participant layout

All final local commands and browser checks pass. Source push, hosted CI and
production checks remain pending. The wider portfolio and Supabase migration are incomplete.

## Behavior

Joining validates the secret/tag before selecting an existing ledger. Lookup and
creation share an IndexedDB read/write transaction, including concurrent joins.
Existing events, metadata, device identity and signing keys remain intact. Invalid
seeds cannot select an unrelated trip or create a phantom. No schema migration or
deduplication of older records is performed.

App owns navigation; Trip owns one ledger for its component lifetime. Older reads
cannot replace newer navigation. Pending signing and IDB work stay on the original
ledger; old sync results cannot reopen it or change another screen's error. Sync
and device-link refreshes reread the selected ID. Leaving clears the interval and
listeners. Cross-trip imports open a fresh screen.

HTTP publication, reads and NIP-11 metadata requests have a 15-second deadline
through response-body consumption, with abort and timer cleanup. Publication and
read checkpoints still require successful results. NIP-11 failures retain the
existing null fallback and process-lifetime cache. The caller fixture proves a
timeout leaves the event local and checkpoint unchanged, then a real retry
publishes, reads back and confirms it.

Participant actions wrap together; names, provenance and split labels wrap within
their available space. Mobile grid columns shrink. Toasts and balances handle long
names. The wider Prawn visual-system rollout remains separate.

## RED and corrections

Evidence files are in `../audit_results/maintenance-2026-09-09/`. Every database,
key and intercepted relay in these checks is a disposable synthetic fixture.

`split-trip-repository-red.log` reproduces wrong-trip selection, ignored new seeds,
duplicate concurrent joins and invalid seeds. `split-trip-ui-six-red.log`
reproduces old navigation winning, delayed claims reaching the wrong ledger, old
sync replacing the list/selection, leaked errors/form state and polling.
`split-network-deadline-red.log` and `split-deadline-sync-red.log` reproduce stalled
headers/bodies and a sync that cannot progress to retry. The final error test in
`split-join-storage-error-red.log` caught our broad catch mislabelling a full local
store as an invalid link; the catch now covers decoding only.

Harness failures are preserved separately: an ambiguous Trip Name selector and
interception of Testing Library's own retry interval were corrected before the
product RED runs. Only the application's 5-second interval is intercepted. The
browser fixture explicitly accepts its synthetic Hide confirmation and confirms
the Claim dialog. These harness corrections are not product failures.

The first aggregate check found two legacy fixtures pairing an unrelated tag with
a zero secret. They now derive the correct tag; all identity, privacy and import
assertions remain. The recovery test checks both exact valid messages instead of
requiring a broad regex to match only one. Existing source-shape assertions read
the extracted Trip file; their logic is retained. LF formatting preserves the
existing banner-boundary regex. Active STATUS paths and TDD's component map were
updated without regrading requirements.

## Loop A — measured verification

Computed from captured output: 22 new regression cases; 9/9 deliberate regressions detected.

```text
$ npm.cmd run build
Test Files  8 passed (8)
Tests  81 passed (81)
Test Files  67 passed (67)
Tests  233 passed (233)
svelte-check found 0 errors and 0 warnings
✓ built in 5.37s
exit 0

$ npm.cmd test
Test Files  8 passed (8)
Tests  81 passed (81)
Test Files  67 passed (67)
Tests  233 passed (233)
exit 0

$ npm.cmd --prefix core test
Test Files  8 passed (8)
Tests  81 passed (81)
exit 0

$ node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json
svelte-check found 0 errors and 0 warnings
exit 0
```

Fresh source lookup:

```text
$ rg -n async function navigate|const tripId|async function commit|async function runSync|async function requestDeviceLink|onDestroy|export async function ensureGroup|withRequestDeadline src/App.svelte src/Trip.svelte src/db/repo.ts src/relay/http.ts src/relay/nip11.ts src/relay/request-deadline.ts
src/relay/request-deadline.ts:3:export async function withRequestDeadline<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
src/relay/nip11.ts:9:import { withRequestDeadline } from "./request-deadline";
src/relay/nip11.ts:30:    return await withRequestDeadline(async (signal) => {
src/db/repo.ts:308:export async function ensureGroup(seed?: JoinSeed): Promise<GroupRecord> {
src/Trip.svelte:2:  import { onDestroy } from "svelte";
src/Trip.svelte:82:  const tripId = initialGroup.groupId;
src/Trip.svelte:263:  async function commit(events: Event[], nextFactory: EventFactory): Promise<void> {
src/Trip.svelte:353:  async function requestDeviceLink(pid: string): Promise<void> {
src/Trip.svelte:925:  async function runSync(): Promise<void> {
src/Trip.svelte:1205:  onDestroy(() => {
src/relay/http.ts:3:import { withRequestDeadline } from "./request-deadline";
src/relay/http.ts:11:    return withRequestDeadline(async (signal) => {
src/relay/http.ts:30:    return withRequestDeadline(async (signal) => {
src/App.svelte:2:  import { onDestroy } from "svelte";
src/App.svelte:13:  async function navigate(read: () => Promise<GroupRecord | null>, joining = false, recovery: "first-join" | "evicted" = "first-join"): Promise<void> {
src/App.svelte:47:  onDestroy(() => { navigation++; window.removeEventListener("hashchange", load); });
```

## Loop B — adverse changes, class and contracts

`split-cr015-mutations.json` and its individual logs record these deliberate
regressions: wrong join match, unchecked secret, non-atomic lookup, late timeout,
missing abort, leaked deadline timer, stale navigation, wrong post-sync reread,
and leaked trip polling. Every variant was detected; original bytes were restored
after each run. No surviving mutation was hidden or tuned away.

The original component's async-function count and both unseeded refresh calls
are computed in `split-cr015-scope-review.json`. Fixing only those calls would
leave signing and other actions sharing mutable trip identity. Component lifetime
provides the broader boundary; the delayed-claim test checks actual persistence
as well as the selected screen.

Trace: App navigation → repository matching → Trip actions → syncOnce → HTTP and
Nostr Relay contracts → response bodies and local publication/cursor writes.
HTTP cursors remain opaque. Nostr reads use created_at watermarks, while its
publication ACK cursor is an event ID. The installed Nostr pool has connection
and publication timers; that implementation is unchanged.

A request deadline is not a whole-cycle budget. Existing per-event fallback can
make sequential requests. The caller fixture exercises batch, fallback and read
timeouts for one event before a successful retry. Larger outboxes and WebSocket
lifecycle/reuse require a separate budget review. Buffer removal, discard vectors
and publication confirmations retain the separate transaction boundaries from
CR-014. These changes do not establish measured monthly savings or free capacity.

## Browser and visual evidence

`prawn-split-trips-cr015-v2-local.json` checks two-device recovery, joining a
second trip in an existing browser, device-link refreshes on both trips and
preservation of the original expense. Layout evidence checks actual text/action
rectangles and page widths, then Hide, Restore and Claim. Baseline long names
overflowed mobile and intersected desktop controls. Final visual review narrowed
an overly broad wrapping rule that split short button labels. Browser checks of
the final source are `prawn-split-layout-cr015-v2-local.json` (320/390/1440,
no overlaps or page overflow, controls usable) and the trip check above
(14 checks, no page errors). All three final layout screenshots were reviewed.
Production remains pending.

## Loop C — release pending

Push directly to main under this repository's explicit workflow. Record hosted
CI, Vercel production commit/aliases, browser checks and clean synchronized main
before marking this CR complete. No feature branch or PR is used.

## Deviations

Runtime seed validation, concurrent-join serialization and component extraction
address the class behind the initial selection finding. Long-name coverage also
caught split-label and toast overflow. Fixture/path corrections are explained
above. Dependencies, schedules, relay settings and persisted data are preserved.

## Not verified this pass

Existing PWA upgrade/offline lifecycle, real relay retention and A13 publication
capacity, simultaneous edits to the same trip across tabs, database-full recovery
beyond displaying its error, total sync-cycle budgets, legacy HTTP author paging,
all STATUS semantics, monthly provider usage and the full Supabase migration
remain open. Ledgers retain the existing browser and Redis/Nostr architecture.
No real records, collectors, retention probes or providers were changed or
deleted, and no paid resources were provisioned.
