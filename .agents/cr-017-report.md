# CR-017 — Encrypted relay staging checkpoint

The verified operated-relay snapshot is staged privately in the existing Free
PrawnStatus Supabase project. The live PrawnSplit app remains on Upstash and Nostr.
This CR is in progress: the runtime adapter and schema source are uncommitted,
and history recovery, capacity hardening and production cutover remain open.

## Released and staged behavior

Export-only commit `30884435e458436c4e3b3e09942600f0e90a7f9b` contains the manual recipient-encrypted
export workflow, its tool and tests. All 4 main workflows
passed. The exact Vercel deployment `dpl_2ixhM5afZEu7CHcf3R9114L8QHEh` is READY;
both public homepages match the validated build and the invalid-tag relay probe
returns the expected safe response without a storage read.

The [reviewed export run](https://github.com/hongyime/theprawnsplit/actions/runs/34807373560) retained
14 encrypted stream records,
8 topics and 8
proof commitments. The complete snapshot is 11149
bytes; exact cursor/blob/author/commitment read-back parity passed after import.
The private Supabase archive contains 2 objects totaling
16187 bytes: the full recipient-encrypted export and nonsecret
provenance. Source TTL/provenance remains inside that complete archive.

Actual destination roles, RLS, anonymous PostgREST denial, private archive denial
and parity checks passed (8 staging checks). Retained
namespace size is 122880 bytes; logical payload is
8393 bytes; the application database measures
18295955 bytes. Both measured staging ceilings passed.
Imports and app writes were disabled after the run and confirmed disabled again.

Staging used 56 requests and
74472 request/response body bytes,
excluding headers and transport overhead. Its normal body budget was separate
from the reserved cleanup budget. Monthly usage is still unverified. A bounded
read-only preservation check confirms the existing anonymous Status summary reader
and public homepage still work; no collector or schedule was invoked.

Upstash source data, Nostr behavior, device keys, offline ledgers, pending events,
Vercel environment and existing Status tables were preserved. No data was deleted,
and no paid plan or new Supabase project was enabled. Recipient decryption happened
only in local memory; no plaintext snapshot file was written.

## Local verification (PROTOCOL A)

Counts below were computed from fresh command logs, not combined across repeated
commands. Root tests run the distinct core, app and export suites.

```text
npm.cmd run build => exit 0
Test Files  8 passed (8)
Tests  81 passed (81)
Test Files  73 passed (73)
Tests  284 passed (284)
ℹ tests 11
ℹ pass 11
ℹ fail 0
svelte-check found 0 errors and 0 warnings
✓ built in 19.91s
npm.cmd test => exit 0
Test Files  8 passed (8)
Tests  81 passed (81)
Test Files  73 passed (73)
Tests  284 passed (284)
ℹ tests 11
ℹ pass 11
ℹ fail 0
npm.cmd --prefix core test => exit 0
Test Files  8 passed (8)
Tests  81 passed (81)
npx.cmd --no-install svelte-check => exit 0
svelte-check found 0 errors and 0 warnings
```

Derivation command and output:

```text
python split-cr017-checkpoint-20260914.py
{"all_distinct_suites": 376, "app": 284, "archive_bytes": 16187, "archive_objects": 2, "core": 81, "draft_mutations_detected": 5, "draft_mutations_total": 6, "export": 11, "main_workflows": 4, "postgres_checks": 7, "preservation_checks": 3, "staging_checks": 8, "staging_http_requests": 56, "staging_request_and_response_body_bytes": 74472}
```

The owned PostgreSQL lab independently exercised actual roles and concurrent proof
claims, cursor allocation, capacity rejection and idempotent imports, then stopped.
The staging runner also passed its separate synthetic tests for real request
sequencing, archive parity, role leaks, transfer failures and cleanup.

## Adversarial review (PROTOCOL B)

The relay handler, storage adapter, SQL RPCs and export/import boundary were traced
together. The original API input tests failed before the draft fixes: malformed
JSON/body shapes, UTF-8 byte sizing and provider endpoint details in errors. The
fixed targeted tests passed and the final full commands above passed. Those API
fixes are still unpublished.

All three export mutations failed: plaintext leakage, numeric cursor precision
loss and omitted proof parity. The initial draft mutation audit detected five of
six mutations. Removing successful-request timer cleanup survived because only
timeout completion was tested; that survivor remains recorded. Added early-success
and early-failure cleanup behavior then detected the same mutation, and restored
source passed. No assertions were weakened to obtain a pass.

Independent review reproduced a physical-capacity estimator limitation: initial
page/index allocation can exceed the current per-row reservation near a tiny
ceiling. This blocks a strict physical-ceiling claim and production writes. The
small staging import was reviewed separately with ample headroom and explicit
measured post-import assertions. A separate conservative correction candidate and
real PostgreSQL proof exist for follow-up; they have not been adopted here.

Export consistency is optimistic, not atomic. Existing operated-relay parity does
not prove complete recovery of Nostr-only or pending device events. Optional legacy
author filtering still follows page limits; current normal sync/import recovery
uses topic-wide reads. Other API routes and broader semantic/retention backlog
items were outside this pass. Existing development-dependency advisories were
observed but not changed by this bounded migration preparation.

Fresh path/function verification:

```text
api/relay.ts:27:  const backend = process.env.PRAWNSPLIT_RELAY_BACKEND ?? "upstash";
api/relay.ts:81:      try { parsed = await req.json(); } catch { return bad("invalid request body"); }
api/relay.ts:82:      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return bad("invalid request body");
server/supabase-relay.ts:13:export class SupabaseRelayStore {
server/supabase-relay.ts:64:      return await Promise.race([operation(), deadline]);
README.md:41:optional server adapter uses `PRAWNSPLIT_RELAY_BACKEND=supabase` with server-only
test/supabase-relay-sql.test.ts:124:  it("bounds reads by count and serialized bytes without skipping the next page", async () => {
.github/workflows/relay-export.yml:4:  workflow_dispatch:
scripts/relay-migration.mjs:189:export function sealSnapshot(snapshot, publicKey) {
test/supabase-relay-adapter.test.ts:11:const names = ["PRAWNSPLIT_RELAY_BACKEND", "PRAWNSPLIT_SUPABASE_URL", "PRAWNSPLIT_SUPABASE_SECRET_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
test/supabase-relay-adapter.test.ts:14:  process.env.PRAWNSPLIT_RELAY_BACKEND = "supabase";
test/supabase-relay-adapter.test.ts:27:    delete process.env.PRAWNSPLIT_RELAY_BACKEND;
test/supabase-relay-adapter.test.ts:113:  it.each([200, 503])("cleans the deadline after an early HTTP %i response", async (status) => {
test/relay-api.test.ts:53:    expect(await body(response)).toEqual({ error: "invalid request body" });
supabase/schemas/relay.sql:9:create table prawnsplit.relay_control (
supabase/schemas/relay.sql:24:create table prawnsplit.relay_topics (
supabase/schemas/relay.sql:31:create table prawnsplit.relay_entries (
supabase/schemas/relay.sql:46:create function prawnsplit.reserve_capacity(p_bytes bigint, p_entries bigint, p_groups bigint)
supabase/schemas/relay.sql:58:  reserve_bytes := p_bytes + (p_entries + p_groups) * 8192;
supabase/schemas/relay.sql:74:create function public.prawnsplit_relay_append(p_tag text, p_commitment text, p_blob text, p_author text)
supabase/schemas/relay.sql:110:create function public.prawnsplit_relay_read(p_tag text, p_cursor text default null,
supabase/schemas/relay.sql:131:    order by e.cursor_ms, e.cursor_seq limit least(500, greatest(1, coalesce(p_limit, 100)))
supabase/schemas/relay.sql:145:create function public.prawnsplit_relay_import(p_tag text, p_commitment text, p_rows jsonb)
supabase/schemas/relay.sql:198:create function public.prawnsplit_relay_topic_info(p_tag text)
```

## Next work and rollback

1. Review and adopt the separate conservative capacity correction with explicit
   shared-database limitations before allowing app writes.
2. Preserve the staged rows/archive and original source. Review per-group recovery
   of Nostr-only and pending device history; retain encryption keys and offline data.
3. Implement and review future Supabase publication behavior and Nostr read recovery.
4. Capture and privately archive a newer bounded snapshot only after the next review;
   verify old rows/proofs remain identical and reconcile exact append-only deltas.
5. Use a reviewed write pause or drain and final zero-gap reconciliation before the
   app cutover. Run hosted and targeted production checks on that exact source.

Rollback for this checkpoint is to keep both import/write flags disabled and leave
the app on Upstash. Retain the staged namespace, private archive and original data;
do not delete records or replace encryption keys to force a fit.

Evidence is retained in the portfolio audit directory: `split-private-export-20260914.json`,
`split-draft-final-validation-20260914.json`, `split-postgres-lab-20260914.json`,
`split-draft-mutations-20260914.json`, `split-deadline-gap-20260914.json`,
`split-independent-review-20260914.json`, and `split-staging-20260914/result.json`
with `preservation-result.json`. The root PostPlan links the current checkpoint.

## Not verified this pass

Production app cutover, complete Nostr/device history recovery, final delta closure,
future publication semantics, a hard shared-database byte ceiling and monthly
quota headroom remain unverified. The runtime/schema draft is not clean, pushed
or checked on hosted main. PROTOCOL Loop C is therefore incomplete; only the
export stage is released and the reviewed snapshot is staged.

## Capacity follow-up applied

The conservative capacity correction is now in the unpublished schema draft and
was applied to only the staged private `reserve_capacity` function. The guarded
transaction asserted the expected previous function body/OID/owner/ACL/search path,
disabled controls and retained counts, then verified unchanged metadata, ACLs, RLS
and data counts before commit. Actual helper body MD5 is
`5e7cfb363d4a2d4cd8a15a9549db821a`. Imports and app writes remain disabled;
retained counts remain 14 records and
8 topics, with 8393
payload bytes. No new import or archive/source/application change occurred.

The permanent first-topic allocation regression fails against the old schema
and the candidate SQL suite passes 17 tests. The guarded replacement passes
4 synthetic transaction tests. The independent candidate was also
checked on real PostgreSQL; its stopped-lab evidence is retained separately.
The earlier full protocol totals above precede this SQL-only correction and new
regression test. They are not claimed as a rerun of the final draft; final full
release checks still gate any future runtime publication.

This is a conservative admission estimate with extra headroom, not an exact
physical-allocation or shared-database ceiling. Other applications can grow the
same database independently. Actual staging measurements and monthly usage
monitoring remain separate requirements.

The original local repository was safely fast-forwarded to released export commit
`30884435e458436c4e3b3e09942600f0e90a7f9b`, clean before and after, with existing local environment/link
files preserved. Unpublished adapter/schema files were not copied there. Evidence:
`split-original-fastforward-20260914.json` and
`split-capacity-replacement-result-20260914.json`.

Device participation does not block release indefinitely. Implement and test
Nostr read recovery, event deduplication, per-device catch-up and stale-client
behavior before cutover. Unknown device-only events and keys remain on their
original browsers and reconcile when those browsers next open the updated app;
do not require every offline device to upload first. Final operated-source delta
closure and safe old-client behavior still gate server cutover. The staged snapshot
does not represent a claim of complete history for every user.

Not verified after this follow-up: final runtime release checks, production
cutover, source delta closure, recovery behavior and monthly quota headroom.
CR-017 remains in progress.


## Event-recovery bridge validation resource checkpoint

The event-recovery bridge, generation/backend pairing guard, Web Lock ownership,
transactional recovery initialization, durable encrypted retry packets and bounded
signed Nostr event recovery are implemented in the isolated main checkout. Local
ledger/crypto keys remain unchanged. Raw signed Nostr messages and snapshot-only
history are a separate unresolved retention gate; no claim of full history parity
is made. Offline devices may reconnect and catch up later.

The final four-command protocol has not passed. V3 completed the behavioral
suites before two test-fixture typing diagnostics; those casts were corrected
without changing runtime behavior. Its captured output was:

```text
Test Files  8 passed (8)
Tests  81 passed (81)
Test Files  78 passed (78)
Tests  312 passed (312)
ℹ tests 11
ℹ pass 11
ℹ fail 0
svelte-check found 2 errors and 0 warnings in 1 file
```

V4 passed 309 app tests but could not start the landing UI worker. That missing
file passed all three tests in a targeted run. Approximately 1 GiB of 16 GiB RAM
was free. V5 used supported VITEST_MAX_WORKERS=1 while retaining every assertion
and original command. Its captured command result is:

```json
[
  {
    "command": "npm.cmd run build",
    "exit": 1,
    "log": "split-catchup-final-v5-build-20260914.log",
    "summary": [
      "Test Files  8 passed (8)",
      "Tests  81 passed (81)",
      "Test Files  2 failed | 76 passed (78)",
      "Tests  1 failed | 301 passed | 10 skipped (312)"
    ]
  }
]
```

The v5 log records a synthetic PGlite initialization failure and an existing sync
test exceeding its 5s duration. This is wider than a fixture-only startup issue;
no test deadline was relaxed and no further identical full run was started.
User processes were left running. A suitable, separately reviewed validation
environment is the next publication prerequisite.

Read-only inspection of current main found no existing hosted workflow that
accepts an exact candidate artifact/hash without publishing source or using a
source branch. Prawn Split Release Check checks out its dispatched ref and has
no candidate input; the only manual workflow input is the encrypted exporter's
recipient public key. No workflow was dispatched or changed, and no candidate
was uploaded. L390 was not used. Evidence is retained in
`split-catchup-hosted-validation-route-20260914.json`.

The exact prior-schema receipt upgrade passed synthetic PostgreSQL role,
concurrency, retry/capacity and byte/content preservation checks. The guarded
Management wrapper passed its five synthetic failure/success checks and was
approved conditionally on a green final protocol. It has not been invoked live.
Imports and writes were last verified disabled at the earlier staging checkpoint;
this phase made no live schema, source, archive, environment or flag mutation.
The original checkout remains clean at released export-only main 30884435e458436c4e3b3e09942600f0e90a7f9b.

## Not verified this pass

Final complete local/hosted validation and bridge publication remain pending.
Raw Nostr/snapshot preservation, final source freeze with invalidated old write
credentials, final encrypted delta/parity, current shared capacity and monthly
egress remain gates before Supabase backend activation. The staged 14 rows do
not establish everyone's complete history. CR-017 and Loop C remain incomplete.

## Linux validation stage — 2026-09-14

The unchanged runtime candidate was retried once after local free memory
recovered above 4 GB. Its core suite passed 81 tests; the app suite passed 310
and failed two multi-trip UI scenarios on local test timeouts. Cleanup then
reported one unhandled rejection. No test limits or assertions were changed,
and the remaining three protocol commands did not run after build failed.

The next stage uses the existing Linux release workflow on main. Vercel Git
deployments are temporarily disabled in the same source commit, using the
[documented Git deployment switch](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments).
This publishes a validation candidate, not a verified production release.
Only after all four hosted commands pass may the original Vercel configuration
be restored for production validation. The receipt SQL upgrade, backend switch,
raw Nostr preservation and source-freeze gates remain separate.
