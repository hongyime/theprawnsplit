# The Prawn Split

Split trip costs with friends. No accounts, no ads, no usage limits.

Expenses live on your own device and sync peer-to-peer through relays that
cannot read them. There is no server holding your ledger.

**Live:** https://theprawnsplit.vercel.app

## What it does

- Track shared expenses on a trip and see who owes whom
- Include friends who never install the app
- Works fully offline; reconciles when you reconnect
- Split equally, by exact amounts, by shares, or by percentage
- Settles a group in at most n−1 transfers

## Stack

Svelte 5 · TypeScript · Vite 6 · IndexedDB (`idb`) · Vercel · Upstash Redis (relay) · Nostr (relay pool)

`core/` is a dependency-free package holding every correctness-critical algorithm —
money allocation, settlement, HLC ordering, merge resolution, and the fold. It is
verified by property tests before any app code runs.

## Storage usage audit

Run **Upstash storage usage** from GitHub Actions on `main` for aggregate Redis
key count and memory bytes. It uses the existing repository secrets and only
issues `DBSIZE` and `INFO memory`, after its tests pass. Inventory is manual;
there is no schedule, key enumeration, trip-record read, or storage mutation.
The JSON summary records units and safe failure codes. A failed command exits
nonzero while retaining any successful aggregate result. Redis memory includes
overhead and is not a PostgreSQL import-size estimate or a monthly usage figure.

Local validation: `python -m unittest discover -s test/maintenance -p test_upstash_usage.py -v`.

## Supabase relay migration preparation

The live relay remains on Upstash until an explicit, validated cutover. The
optional server adapter uses `PRAWNSPLIT_RELAY_BACKEND=supabase` with server-only
`PRAWNSPLIT_SUPABASE_URL` and `PRAWNSPLIT_SUPABASE_SECRET_KEY`; leaving the switch
unset retains the current backend. Never put the secret key in a `VITE_` variable.

The base schema and a measured encrypted source snapshot have been staged privately,
with imports and app writes disabled. `supabase/schemas/relay.sql` is the desired
schema, including unpublished catch-up receipt changes; do not rerun its initial
creation statements over the staged namespace. It isolates encrypted relay
records in the private `prawnsplit` namespace and exposes service-only RPCs.
Imports and writes start disabled, with zero capacity budgets. Reads have row and
byte limits; writes reserve capacity before claiming a proof or allocating a
cursor. Capacity rejection preserves existing history and leaves new events on
the device for later retry. The shared project's other applications still need
their own capacity monitoring; a relay guard cannot limit their growth.

The manual **Encrypted relay export** workflow accepts a reviewed RSA public key
of at least 3072 bits. Its existing Upstash credentials can issue only a bounded
set of read commands through this script. The artifact uses recipient encryption;
the private key stays on the receiving machine. It retains stream IDs, ciphertext,
authors, proof commitments, auxiliary values and source metadata. Tests run with
`npm run test:relay-migration`.

The export's `stable` result is an optimistic key/count/high-cursor/proof check,
not an atomic cutover snapshot. Final reconciliation must account for writes
during export. Import verification currently covers relay records and commitments;
the complete encrypted export must also be archived privately in Supabase to retain
auxiliary values and source provenance before claiming a lossless migration.

Operated-relay parity does not prove that old Nostr-only events or pending device
events have been recovered. The prepared client recognizes an explicit server
generation using `PRAWNSPLIT_RELAY_MIGRATION`: `legacy` keeps existing behavior;
`paused` blocks HTTP writes; `supabase-v1` requires the Supabase backend and stops
Nostr publication from updated clients. Once a browser accepts that generation,
it refuses silent fallback to legacy publication. An unavailable status endpoint
leaves its local changes intact for retry.

Each browser retains its original ledger database, group secret, Nostr key and
claim identities. A separate recovery database stores per-event receipt hashes,
checkpoints and an encrypted pending packet before sending it. Lost acknowledgements
retry the same ciphertext. The Supabase append path returns the existing exact
blob/author receipt without allocating a second row; historical duplicate rows
and their original cursors are preserved. Initial operated history is scanned
with bounded forward pages. Previously confirmed device-only events then catch up
in bounded batches, while fresh local writes can proceed during the scan.

Nostr remains a recovery source. The prepared client reads one configured relay
per cycle, walking newest-first history backwards with overlapping second boundaries,
valid signatures and a real wire EOSE. A saturated timestamp or interrupted page
retains its checkpoint and reports incomplete recovery. Daily historical rescans
also cover late old-timestamp arrivals. Ledger events are deduplicated by ID and
verified payload; conflicting identities never overwrite local history. Nostr's
transport signatures/envelopes remain on the original relays; this is event-level
catch-up, not a claim of a complete archive of every Nostr transport envelope.
Some snapshots may outlive their underlying events. Full retained-history cutover
therefore still requires bounded private preservation of the raw signed Nostr
messages (including snapshots, IDs, signatures and tags), or an explicitly approved
narrower scope. The current event-recovery bridge does not satisfy that archive gate.

Unknown offline browsers reconcile when they next open the updated app. They do
not all need to reconnect before release. Existing custom/disabled operated relay
settings are preserved; after cutover those groups must select the default operated
relay before sending again. Already-open older bundles can still publish directly
to Nostr until refreshed, so recovery continues for their late events.
Migrated syncing requires the browser's Web Locks support to hold one trip's
cross-tab lock. Without it, the app pauses migrated syncing and preserves local
history; the pre-cutover fallback remains available. Initial generation discovery
is transactional and cannot replace another tab's pending encrypted packet.

The `paused` API switch alone is not an immutable source freeze: older deployment
URLs and scheduled writers must also lose Upstash write access before final export.
Final cutover requires reviewed management access or an owner-coordinated password
reset, old-credential revocation proof, an isolated new export credential, replica
consistency checks, final encrypted archive/import parity, and measured capacity.
No source records, projects or encryption keys are removed by this preparation,
and no paid plan is enabled. The existing 1,000-event author and 10,000-event group
admission limits remain; reaching them reports incomplete recovery for review.

## Setup

```bash
npm install
cp .env.example .env.local     # add Upstash values for relay work
npm run dev
```

`core/` tests need no network, no database, and no environment variables.

## Checks

```bash
npm run test:core     # property + unit suite for core/
npm run test:sync     # sync and integration tests
npm run lint:money    # bans floating-point arithmetic on money
npm run check         # svelte-check
npm run build         # runs all of the above, then builds
```

`npm run build` fails if any check fails. That is deliberate — see `PRD.md` §16.5.

## Docs

- `PRD.md` — what it does and why, with the decision log
- `TDD.md` — how it is built, including environment variables
- `AGENTS.md` — conventions for agents working in this repo

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
