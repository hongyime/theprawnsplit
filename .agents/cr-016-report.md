# CR-016 — Bounded sync cycles and exact confirmation

Local verification complete; source CI, production verification and Loop C closeout are pending.

## Behavior

Same-trip callers share a cycle. When Web Locks are available, another tab skips
work already owned by that trip, while a different trip can continue. The existing
Sync, Backup, And Recovery panel reports the skipped cycle without treating it as
a recovery attempt. Browsers without Web Locks retain same-context exclusion only.

Network work has a 60000-millisecond timer-based limit. Both
relay implementations and NIP-11 lookups receive cancellation; individual request
deadlines remain in place. Local durable commits finish rather than being abandoned
by a whole-function timeout. Owned Nostr pools close on completion or failure.
Limit lookups use only this trip's configured relay URLs.

Fallback work is capped at 10 events per cycle. The next
pending ID persists so permanently rejected events do not starve later records,
including records beyond the primary batch. Unfinished records remain local.
Primary publication prioritizes local rows; successful batch sizing and the polling
cadence are unchanged. Confirmation requires that exact event to have reached
publication quorum and then been read back. A snapshot cannot be marked published
without any relay acknowledgement. Sync field updates use a single metadata
transaction instead of separate reads and writes.

## Regressions and adversarial review

The initial failing evidence is in `split-cr016-budget-red.log`,
`split-cr016-metadata-red.log` and `split-cr016-snapshot-red.log`. It reproduces
overlapping cycles, unearned confirmation, stalled work, excessive fallback writes,
unclosed pools, lost metadata updates and zero-acknowledgement snapshots. The first
snapshot run also exposed a fixture parameterization mistake, corrected separately.

The initial mutation pass tried 18 variants:
16 were detected and 2
survived. Those original results remain recorded. Removing the success-path timer
cleanup exposed a coverage gap; a separate success-cleanup contract was then seen
red under that fault. Removing all request aborts also produced red transport
contracts. The supplemental pass detected 2 of
2 faults. The redundant parent-abort removal
still survives because the request helper's finally block aborts the transport.
This is not claimed as a fully killed mutation suite.

Every new unit case has failing regression or fault-injection evidence. Same-trip
coordination was broken through overlapping calls, a shared key and a retained
failed promise. Network lifetime was broken through a delayed limit, removal of the
race and cleanup faults. The previous production build was first byte-matched on
both aliases; the new browser contract then failed against that build with open
connections. The corrected build closes 5 observed
browser connections and passes 18 browser checks, including
same-trip exclusion, different-trip progress and retry after lock release.

Earlier local attempts recorded strict typing errors and timeout failures during
high host memory use. Typing was corrected without changing test settings. The
delayed-claim test subsequently passed against both original and current runtime
files. All required commands below passed on the final source. Browser harness
corrections covered an incompatible Playwright close callback, the existing closed
details panel, the shared clock and the unchanged idle polling cadence.

## Loop A — computed evidence

Command: `python audit_results/maintenance-2026-09-09/write-split-cr016-report.py`

```json
{
  "core_tests": 81,
  "app_tests": 251,
  "browser_checks": 18,
  "original_tracked_files": 217,
  "original_mutations": 18,
  "original_detected": 16,
  "original_survivors": 2,
  "supplemental_mutations": 2,
  "supplemental_detected": 2,
  "closed_browser_sockets": 5,
  "relay_implementations": 2,
  "network_limit_ms": 60000,
  "fallback_limit": 10,
  "new_app_tests": 18,
  "new_cases_seen_red": 18,
  "class_call_sites": {
    "production_sync_callers": 1,
    "relay_adapters": 2,
    "network_helper_calls_http": 2,
    "network_helper_calls_nostr": 1,
    "network_helper_calls_nip11": 1,
    "confirmation_sites": 1,
    "publication_sites": 2,
    "snapshot_mark_sites": 1
  }
}
```

Actual command results:

```text
npm.cmd run build (exit 0) Test Files  8 passed (8); Tests  81 passed (81); Test Files  71 passed (71); Tests  251 passed (251); svelte-check found 0 errors and 0 warnings; ✓ built in 12.64s
npm.cmd test (exit 0) Test Files  8 passed (8); Tests  81 passed (81); Test Files  71 passed (71); Tests  251 passed (251)
npm.cmd --prefix core test (exit 0) Test Files  8 passed (8); Tests  81 passed (81)
npx.cmd --no-install svelte-check (exit 0) svelte-check found 0 errors and 0 warnings
```

Fresh source citations from `rg -n` using the function/constant names below:

```text
src/relay/request-deadline.ts:3:export async function withRequestDeadline<T>(request: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
src/relay/nip11.ts:17:export async function fetchMaxMessageLength(
src/relay/nostr.ts:66:export class NostrRelay implements Relay {
src/relay/http.ts:5:export class HttpRelay implements Relay {
src/db/repo.ts:216:async function ensureMeta(group: StoredGroup, events: Event[]): Promise<StoredMeta> {
src/db/repo.ts:239:export async function updateMeta(groupId: string, update: (meta: StoredMeta) => StoredMeta): Promise<StoredMeta> {
src/db/repo.ts:681:export async function updateTransportVectors(
src/db/repo.ts:731:export async function saveMeta(meta: StoredMeta): Promise<void> {
src/db/repo.ts:736:export async function markSnapshotPublished(groupId: string, seq: number): Promise<void> {
src/relay/sync-cycle.ts:4:export const SYNC_FALLBACK_LIMIT = 10;
src/relay/sync-cycle.ts:14:export function coordinatedSync(groupId: string, run: () => Promise<SyncResult>): Promise<SyncResult> {
src/relay/sync-cycle.ts:29:export function syncNetworkBudget(requestedMs = SYNC_NETWORK_BUDGET_MS) {
src/relay/sync.ts:30:import { coordinatedSync, emptySyncResult, syncNetworkBudget, SYNC_FALLBACK_LIMIT } from "./sync-cycle";
src/relay/sync.ts:95:export function syncOnce(groupId: string, relayOverride?: Relay[], opts: SyncOnceOptions = {}): Promise<SyncResult> {
src/relay/sync.ts:183:        for (const [index, row] of fallbackRows.slice(0, SYNC_FALLBACK_LIMIT).entries()) {
src/relay/sync.ts:275:    const confirmedIds = [...confirmationEligible]
src/Trip.svelte:933:      if (result.inProgress) {
```

The source manifest is `split-cr016-validated-source.json`. All original tracked
files and environment files match the initial preservation hashes. This report
adds no Markdown tables or enumerated requirement-ID register.

## Scope and remaining work

The traced path is Trip -> coordinator -> configured NIP-11 and HTTP/Nostr
transports -> publication eligibility -> admissions/checkpoints -> snapshots ->
metadata updates -> resource cleanup. The class inventory above counts the caller,
transport helper, publication and confirmation sites.

Other full-record metadata writers still need broader transaction review:
ensureMeta, updateTransportVectors, saveMeta and markSnapshotPublished. Buffer,
vector and received-event/checkpoint transactions are not combined into a larger
transaction here. Stalled IndexedDB operations are outside the network time limit.
Old already-open app versions do not acquire the new Web Lock; reloading online
uses the unchanged network-first service-worker shell strategy. Installed-PWA
upgrade behavior was not exercised in these disposable browser contexts.

## Not verified this pass

Real relay retention and long-term recovery, the separate retention gate, live
provider capacity, monthly billing/egress fit, Supabase migration, wider Prawn
styling and the remaining portfolio requirements. All browser relay traffic and
gateway fixtures are synthetic; no real ledger or provider write was used for tests.
