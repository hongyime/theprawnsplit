# Repository Map

## 1. Provenance

- Repository name / remote: `theprawnsplit`; `https://github.com/hongyime/theprawnsplit.git` (`git remote -v`; `package.json`).
- Commit analyzed: `e63962f47dc4b38378bed33eadd57b134458411d` (`git rev-parse HEAD`).
- Branch: `maintenance/prawn-ui-20260916`; default branch: `main`, resolved through `refs/remotes/origin/HEAD`.
- Working tree before output: unchanged, with 0 modified tracked files and 0 untracked, non-ignored files in the input scope (`git status --porcelain --untracked-files=all`).
- PR data source: `gh` (present and authenticated); open and merged PR metadata was retrieved. This is external metadata, not content fixed by the analyzed commit.
- Agent capability: shell, arbitrary file reads, directory/file enumeration, network access. Inspection commands were adapted to PowerShell; project code was not executed.
- Inventory basis: tracked working-tree files, excluding this output. There were no input working-tree differences. Counts use all 257 input paths; listings are uncapped at that size.
- Not analyzed: ignored dependency/build/editor directories and local environment files; binary image/font contents; complete lockfile dependency graphs; exhaustive individual test assertions; historical handoff/report contents; most of `PRD.md` and the latter portion of `TDD.md`. Ignore rules are in `.gitignore`. No submodule declaration or vendored source directory appears in the tracked inventory.
- History scope: 200 HEAD-reachable commits for churn; 30 recent subjects; all locally available refs for contributor counts. Remote refs were not refreshed. Ten module deep dives are included.
- Runtime outcomes, deployed environment settings and database contents: Not available: builds, tests, servers and operational probes were outside this read-only inspection.

## 2. What this repository is

This repository contains a browser application for recording expenses, participant identities and settlement records within individual travel groups (`src/App.svelte`, `src/Trip.svelte`, `core/src/types.ts`). Its ledger is reconstructed from persisted events, with integer monetary amounts and deterministic allocation and settlement functions supplied by a separate TypeScript package (`src/db/repo.ts`, `core/src/fold.ts`, `core/src/money.ts`, `core/src/settle.ts`). Browser clients exchange encrypted event envelopes through an HTTP relay and Nostr transports; an edge handler stores opaque payloads in Redis, or in a configuration-selected PostgreSQL adapter (`src/crypto/envelope.ts`, `src/relay/sync.ts`, `api/relay.ts`, `server/supabase-relay.ts`). The deployment configuration produces static Vite assets alongside the relay handler, while local ledger access uses IndexedDB and cryptographic operations use browser Web Crypto (`vercel.json`, `src/db/repo.ts`, `src/crypto/group.ts`).

## 3. Quick facts

| Field | Value |
|---|---|
| Primary language(s) | TypeScript and Svelte; CSS, JavaScript maintenance scripts, Python automation and PostgreSQL SQL also appear (`src/`, `core/src/`, `scripts/`, `supabase/schemas/relay.sql`). |
| Runtime / version constraint | Both package manifests declare ES modules but no `engines` constraint. TypeScript targets ES2022. Release/export workflows select Node 24, retention selects Node 22, general Build Check selects Node LTS, and Bandit selects Python 3.12 (`package.json`, `core/package.json`, `tsconfig.json`, `.github/workflows/`). |
| Package manager | npm; root and `core/` have separate manifests and lockfiles, with no workspace declaration (`package.json`, `core/package.json`). |
| Tracked files | 257 input files, including 156 `.ts`, 32 `.md`, 23 `.yml`, 12 `.json` and 7 `.svelte` files (`git ls-files`). |
| Total lines (tracked) | 32,319 LF bytes across all input files; 32,032 after excluding the three PNGs and one WOFF2 binary. This is newline counting, not a code-line metric. |
| Deployment artifact | `dist/` static assets and an edge relay function (`vercel.json`, `api/relay.ts:4`). |
| Persistence | IndexedDB ledger/recovery stores, browser Cache Storage, Redis Streams/proof keys, optional PostgreSQL relay tables (`src/db/repo.ts`, `src/relay/recovery-db.ts`, `public/sw.js`, `api/relay.ts`, `supabase/schemas/relay.sql`). |
| Test framework(s) | Vitest, fast-check, Svelte Testing Library/jsdom, fake-indexeddb, PGlite, Node test runner and Python unittest (`package.json`, `core/package.json`, `test/maintenance/`, `test/supabase-relay-sql.test.ts`). |
| CI | 18 GitHub Actions workflow files (`.github/workflows/`). |
| License | Apache-2.0 (`LICENSE`); notice file present (`NOTICE`). |

## 4. How it runs

| Entry point | Path | Trigger | What it starts |
|---|---|---|---|
| Browser module | `index.html:35`, `src/main.ts:9` | HTML module loading | Mounts `App`; registers a service worker after window load. |
| Trip navigation | `src/App.svelte:33-50` | Initial load, fragment change, trip selection or creation | Resolves a local group or join seed and mounts a keyed `Trip`. |
| Trip session | `src/Trip.svelte:1222-1225` | Component construction | Initializes the selected group and starts polling decisions. |
| Service worker | `public/sw.js` | Install, activate and fetch events | Populates shell cache and handles eligible same-origin requests. |
| Edge request handler | `api/relay.ts:75` | `/api/relay` requests | Returns capabilities or appends/reads relay entries. |
| Development/preview | `package.json:7,25` | `npm run dev`, `npm run preview` | Vite development or preview command. |
| Release build | `package.json:8` | `npm run build`; Vercel build configuration | Core tests, app/maintenance tests, monetary-source scan, Svelte checking, then Vite output. |
| Retention CLI | `scripts/task0-retention.mjs:620-637` | npm `task0:*` scripts or direct Node invocation | Publish/check cohorts, probe/vet relays, batch probe or NIP-11 inspection. |
| Relay metadata probe | `scripts/task0-relay-check.mjs:68-79` | Direct Node invocation | Reads kind-registry and relay metadata and prints JSON. |
| Encrypted export CLI | `scripts/relay-migration.mjs:264-295` | `node scripts/relay-migration.mjs export <output-path>` | Reads relay source, encrypts a snapshot and creates an output artifact. |
| Storage usage CLI | `scripts/upstash-usage.py:80-92` | Python invocation or manual workflow | Reads aggregate Redis usage and emits a JSON report. |
| Icon generation | `scripts/gen-icons.mjs` | `npm run gen:icons` | Rasterizes `public/favicon.svg` to three PNGs. |
| Bot merge CLI | `.github/scripts/checked-bot-merge.py:79-101` | Automation with `--group`; optional `--dry-run` | Inspects eligible PR heads/checks and conditionally requests a squash merge. |
| Test runners | `package.json`, `core/package.json`, `test/maintenance/test_upstash_usage.py` | Declared test scripts or unittest invocation | Execute their respective suites; none were invoked during mapping. |

The locked installation sequence declared by the release workflow is `npm ci` followed by `npm --prefix core ci`; the development command is `npm run dev` (`.github/workflows/split-build.yml:46-51`, `package.json`). The build command emits `dist/` as configured in `vercel.json`; the analysis script sets `ANALYZE` and enables the visualizer output in `vite.config.ts:12`.

All client configuration reads have fallbacks in `src/config.ts`. The HTTP storage path requires the selected backend's server credentials; the capability response itself does not open a database (`api/relay.ts:19-30,81-89`). Browser persistence and cryptography require IndexedDB and Web Crypto; migrated synchronization additionally checks Web Locks ownership (`src/db/repo.ts:99`, `src/crypto/group.ts`, `src/relay/migrated-sync.ts:42`).

Ports/sockets bound: Not available: no numeric listener port is specified in `vite.config.ts` or `package.json`, and no server was started. The application creates outbound HTTP/WebSocket traffic through relay adapters; the edge handler exports a request function rather than binding a listener (`src/relay/http.ts`, `src/relay/nostr.ts`, `api/relay.ts`). No Vite API proxy is declared in `vite.config.ts`.

## 5. Execution paths

### A. Save an expense and recompute the displayed ledger

1. `index.html:35` loads `src/main.ts`, whose `mount(App, { target })` mounts `src/App.svelte`.
2. `src/App.svelte:15-46` uses `navigate`, `createGroup`, `readGroup` or `ensureGroup` to select a group; the keyed block passes it to `Trip` (`src/App.svelte:93-98`).
3. `src/Trip.svelte:640` runs `addExpense`, checks amount/payer/share previews, obtains `factory()`, and calls `defaultExpenseDate`, `makeExpenseFinancials` and `makeEvent` from `src/lib/events.ts`.
4. `src/lib/events.ts:13` constructs the `ExpenseAdded` event, including identity and clock metadata. The event schema's monetary fields use `bigint` (`core/src/types.ts:1,17-22,59-66`).
5. `src/Trip.svelte:265-272` runs `commit`: saves group metadata with `saveGroup`, appends the event through `appendEvents`, then refreshes counts and state.
6. `src/db/repo.ts:397` persists encoded events in the IndexedDB event store; `encodeEvent` uses the bigint serializer from `src/lib/money.ts`. The store key includes both group and event IDs (`src/db/repo.ts:64-80,184`).
7. `src/Trip.svelte:244-252` builds signature-verification context with `buildVerificationContext` (`src/lib/verification.ts:17`) and calls `fold` (`core/src/fold.ts:127`). The result contains participants, expenses, settlements, balances and anomaly/quarantine state (`core/src/types.ts:122-130`).
8. `src/Trip.svelte:156` derives suggested transfers with `greedySettlement(state.balances)` (`core/src/settle.ts:19`); its ledger UI renders the refreshed values. The first expense also invokes the storage-persistence prompt path (`src/Trip.svelte:659-662`).

### B. Publish and read back events through the legacy operated relay

1. `src/Trip.svelte:1179` runs polling decisions through `shouldPollGroup` (`src/lib/lifecycle.ts:37`); `runSync` dynamically imports and calls `syncOnce(tripId)` (`src/Trip.svelte:932-934`).
2. `src/relay/sync.ts:97-104` enters `coordinatedSync`, which shares a group's in-flight promise and, where available, requests a group-specific Web Lock (`src/relay/sync-cycle.ts:17`). `createRelays` constructs transports from the group's stored settings.
3. `src/relay/sync.ts:109-125` queries `discoverMigration`; `HttpRelay.migrationMode` requests `/api/relay?capabilities=1` (`src/relay/http.ts:12`). In the legacy branch, execution continues to outbound batching rather than `syncMigrated`.
4. `src/relay/sync.ts:127-170` reads pending events, derives the group key/write proof, sizes a batch and encrypts it. `encryptEvents` wraps events; `encryptJson` uses AES-GCM with a fresh IV (`src/crypto/envelope.ts:23-43`).
5. `HttpRelay.publish` sends JSON fields `tag`, `author`, `blob`, `writeProof` (`src/relay/http.ts:23-34`). Parallel relay acknowledgements are counted by the synchronization code; the Nostr pool is represented as one adapter (`src/relay/sync.ts:155-166`, `src/relay/nostr.ts:93-104`).
6. `api/relay.ts:92-116` validates fields, runs `verifyRelayWriteProof`, and stores a SHA-256 proof commitment using `SETNX`/`GET`. It calls Redis `XADD` with the opaque blob and author, then returns `{ cursor }`.
7. `HttpRelay.fetch` requests a bounded topic page (`src/relay/http.ts:37-52`). `api/relay.ts:119-142` uses Redis `XRANGE`, applies optional author filtering after the bounded read, and returns `{ entries }`.
8. `src/relay/sync.ts` decrypts received envelopes, calls `admitTransportEvents` (`core/src/transport.ts:55`), and persists accepted remote events/cursors through `upsertRemoteEvents` (`src/db/repo.ts:700`). Published/read-back status is persisted through `markEvents` (`src/db/repo.ts:598`); the trip reloads and folds the ledger after the cycle (`src/Trip.svelte`, `core/src/fold.ts`).

### C. Retry migrated delivery and retain Nostr recovery sources

1. `api/relay.ts:81-89` exposes a configured migration generation. `discoverMigration` validates it, initializes a separate recovery record and refuses a return to legacy after a generation has been recorded (`src/relay/migration-mode.ts:25-36`).
2. `src/relay/sync.ts:116-118` selects `syncMigrated` for the default operated relay. `src/relay/migrated-sync.ts:38-45` verifies cross-tab ownership before proceeding.
3. `src/relay/migrated-sync.ts:187-223` selects uncovered event fingerprints, constructs a size-limited encrypted packet and saves `state.pending` before calling `sendPending`.
4. `sendPending` publishes the stored ciphertext and requires a valid cursor receipt (`src/relay/migrated-sync.ts:52-72`). `api/relay.ts:104-107` delegates to `SupabaseRelayStore.append`, which invokes the append RPC (`server/supabase-relay.ts:73-79`).
5. `public.prawnsplit_relay_append` serializes admission through the control-row lock, checks the proof commitment and returns the existing cursor for an exact blob/author match; otherwise it reserves capacity and inserts an entry (`supabase/schemas/relay.sql:83-122`).
6. `RecoveryRepository.acknowledge` commits event receipts and pending-state removal together (`src/relay/recovery-db.ts:60-71`). A retry therefore can reuse the persisted ciphertext instead of creating a new packet (`src/relay/migrated-sync.ts:52-62`).
7. The recovery branch calls `recoverNostrPage` and prepares source packets (`src/relay/migrated-sync.ts`, `src/relay/nostr-recovery.ts`, `src/relay/source-archive.ts`). Its transport reads signed Nostr wire events through `fetchNostrRecoveryPage` (`src/relay/nostr.ts:115-118`, `src/relay/nostr-recovery-transport.ts`).
8. `src/relay/migrated-sync.ts:225-242` publishes retained source fragments through the operated relay. Only the final acknowledged fragment advances the source checkpoint; the receipt, remaining packet state and checkpoint share a recovery-database transaction. Ledger synchronization in this branch does not call Nostr publication (`src/relay/migrated-sync.ts:38-40`).

## 6. Architecture

The source is a browser application, a separately manifested core package, and an edge storage boundary. It is not an npm workspace: `vite.config.ts:16` and `tsconfig.json:17` resolve `@theprawnsplit/core` directly to `core/src/index.ts`, while `core/package.json` defines its own test command.

```text
index.html -> src/main.ts -> src/App.svelte -> src/Trip.svelte
                                               | -> core/src/*
                                               | -> src/lib/* -> src/crypto/*
                                               | -> src/db/repo.ts -> idb
                                               ` -> src/relay/sync.ts
                                                     | -> src/db/repo.ts
                                                     | -> core/src/*
                                                     | -> src/crypto/*
                                                     | -> http.ts --HTTP--> api/relay.ts
                                                     |                      | -> @upstash/redis
                                                     |                      ` -> server/supabase-relay.ts
                                                     |                           --RPC--> relay.sql functions
                                                     | -> nostr.ts -> nostr-tools
                                                     ` -> migrated-sync.ts -> recovery-db.ts -> idb
```

Arrows before transport labels reflect imports or dynamic imports in `src/main.ts`, `src/App.svelte`, `src/Trip.svelte`, `src/relay/sync.ts`, `src/relay/migrated-sync.ts`, `api/relay.ts` and `server/supabase-relay.ts`. The RPC mapping is declared by names in the server adapter and SQL functions, rather than a JavaScript import of SQL.

`core/src/` owns event folding, monetary allocation, identity resolution, deterministic ordering and transport admission. `src/lib/` owns view/command policies and formatting; some modules are import-free predicates, while verification bridges asynchronous browser crypto into the core's synchronous callback contract (`src/lib/verification.ts`, `core/src/types.ts:143-146`). `src/db/repo.ts` owns the durable browser ledger. Relay modules coordinate replication and use repository APIs; `api/relay.ts` only processes relay envelope metadata and opaque payloads. The SQL adapter has a type-only dependency on `src/relay/types.ts` (`server/supabase-relay.ts:1`).

Durable state lives in the two IndexedDB databases, relay stores and Cache Storage. UI selection/form state lives in `App`/`Trip`; per-context synchronization ownership lives in module-level maps/sets (`src/db/repo.ts`, `src/relay/recovery-db.ts`, `public/sw.js`, `src/App.svelte`, `src/Trip.svelte`, `src/relay/sync-cycle.ts`).

## 7. File inventory

Depth-capped directory map; purposes are grounded in the representative files listed in each directory below.

```text
.                         package/build/deployment configuration and project documents
  .agents/                state, protocol, change-request reports and prompts
    handoffs/             serialized cross-session records
  .github/                contribution metadata and automation configuration
    ISSUE_TEMPLATE/       issue forms
    scripts/              checked bot-merge implementation
    workflows/            CI, scans, repository automation and relay operations
  api/                    edge HTTP relay handler
  core/                   separately locked TypeScript package
    src/                  ledger algorithms and event contracts
    test/                 core unit/property tests
  public/                 service worker, manifest and application icons
    fonts/                tracked font binary
  scripts/                maintenance CLIs and probe manifests
  server/                 PostgreSQL relay RPC adapter
  src/                    Svelte application and client configuration
    crypto/               key derivation, claims and envelope encryption
    db/                   IndexedDB repository
    lib/                  view/command policies, formatting and UI primitives
    relay/                transport adapters, replication and recovery
  supabase/               PostgreSQL schema assets
    schemas/              desired relay SQL definition
  test/                   app, integration, transport and UI tests
    maintenance/          export and usage-script tests
    stubs/                test-only component/icon substitutes
```

All 257 tracked input files follow in ascending path order, with directory grouping provided by path prefixes.

```text
.agents/JOURNAL.md
.agents/PROTOCOL.md
.agents/STATE.md
.agents/STATE.template.md
.agents/cr-007-report.md
.agents/cr-010-prompt.md
.agents/cr-010-report.md
.agents/cr-011-report.md
.agents/cr-012-report.md
.agents/cr-013-prompt.md
.agents/cr-013-report.md
.agents/cr-014-prompt.md
.agents/cr-014-report.md
.agents/cr-015-prompt.md
.agents/cr-015-report.md
.agents/cr-016-prompt.md
.agents/cr-016-report.md
.agents/cr-017-prompt.md
.agents/cr-017-report.md
.agents/handoffs/split-source-retention-20260915.json
.agents/handoffs/split-supabase-20260914.json
.agents/task0-retention-current.md
.agents/task0-retention-slow.md
.agents/task0-retention.md
.deepsource.toml
.env.example
.gitattributes
.github/FUNDING.yml
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/dependabot.yml
.github/greetings.yml
.github/labels.yml
.github/pull_request_template.md
.github/scripts/checked-bot-merge.py
.github/workflows/auto-merge-bots.yml
.github/workflows/bandit.yml
.github/workflows/ci.yml
.github/workflows/codeql.yml
.github/workflows/dependabot-auto-merge.yml
.github/workflows/dependency-review.yml
.github/workflows/greetings.yml
.github/workflows/heartbeat.yml
.github/workflows/labeler.yml
.github/workflows/lfs-guard.yml
.github/workflows/relay-export.yml
.github/workflows/scorecard.yml
.github/workflows/semgrep.yml
.github/workflows/split-build.yml
.github/workflows/storage-usage.yml
.github/workflows/summary.yml
.github/workflows/task0-retention.yml
.github/workflows/trufflehog.yml
.gitignore
.sourcery.yml
AGENTS.md
CONTRIBUTING.md
LICENSE
NOTICE
PRD.md
README.md
SECURITY.md
STATUS.md
TDD.md
api/relay.ts
core/package-lock.json
core/package.json
core/src/canonical.ts
core/src/fold.ts
core/src/hlc.ts
core/src/identity.ts
core/src/index.ts
core/src/money.ts
core/src/settle.ts
core/src/transport.ts
core/src/types.ts
core/test/fold.test.ts
core/test/helpers.ts
core/test/hlc.test.ts
core/test/identity.test.ts
core/test/money.test.ts
core/test/order.test.ts
core/test/properties.test.ts
core/test/settle.test.ts
core/test/transport.test.ts
core/tsconfig.json
core/vitest.config.ts
index.html
last_sync.txt
package-lock.json
package.json
public/apple-touch-icon.png
public/favicon.svg
public/fonts/SpaceGrotesk.woff2
public/icon-192.png
public/icon-512.png
public/manifest.webmanifest
public/sw.js
scripts/gen-icons.mjs
scripts/lint-money.mjs
scripts/relay-migration.mjs
scripts/task0-manifest-current.json
scripts/task0-manifest-slow.json
scripts/task0-manifest.json
scripts/task0-relay-check.mjs
scripts/task0-retention.mjs
scripts/upstash-usage.py
server/supabase-relay.ts
src/App.svelte
src/Trip.svelte
src/config.ts
src/crypto/bytes.ts
src/crypto/claim.ts
src/crypto/envelope.ts
src/crypto/group.ts
src/db/repo.ts
src/lib/Icon.svelte
src/lib/NeoButton.svelte
src/lib/NeoCard.svelte
src/lib/archive.ts
src/lib/clock-skew.ts
src/lib/currencies.ts
src/lib/device-link.ts
src/lib/durability.ts
src/lib/events.ts
src/lib/expense-command.ts
src/lib/expense-display.ts
src/lib/expense-edit.ts
src/lib/expense-history.ts
src/lib/freeze-policy.ts
src/lib/ids.ts
src/lib/join-link.ts
src/lib/lifecycle.ts
src/lib/manual-fallback.ts
src/lib/money.ts
src/lib/multicurrency.ts
src/lib/participants.ts
src/lib/payers.ts
src/lib/reattestation.ts
src/lib/relay-diagnostics.ts
src/lib/relay-settings.ts
src/lib/settlement-command.ts
src/lib/settlement-history.ts
src/lib/split-preservation.ts
src/lib/subgroups.ts
src/lib/sync-coverage.ts
src/lib/sync-labels.ts
src/lib/verification.ts
src/main.ts
src/relay/batch-limits.ts
src/relay/bounded-body.ts
src/relay/diagnostics.ts
src/relay/http.ts
src/relay/migrated-sync.ts
src/relay/migration-mode.ts
src/relay/nip11.ts
src/relay/nostr-recovery-transport.ts
src/relay/nostr-recovery.ts
src/relay/nostr.ts
src/relay/recovery-db.ts
src/relay/request-deadline.ts
src/relay/source-archive.ts
src/relay/sync-cycle.ts
src/relay/sync.ts
src/relay/types.ts
src/styles.css
src/vite-env.d.ts
supabase/schemas/relay.sql
svelte.config.js
test/archive.test.ts
test/batch-limits.test.ts
test/claim-crypto.test.ts
test/clock-skew.test.ts
test/common-expense-ui.test.ts
test/config.test.ts
test/currency-onboarding.test.ts
test/device-id-privacy-ui.test.ts
test/device-identity.test.ts
test/device-link.test.ts
test/duplicate-banner-ui.test.ts
test/durability-prompts-ui.test.ts
test/durability.test.ts
test/empty-state-ui.test.ts
test/expense-command.test.ts
test/expense-display.test.ts
test/expense-edit.test.ts
test/expense-history.test.ts
test/expense-workflow-ui.test.ts
test/export-prompt-ui.test.ts
test/export-security.test.ts
test/freeze-policy.test.ts
test/identity-backup-ui.test.ts
test/join-link.test.ts
test/join-recovery-boundary.test.ts
test/landing-ui.test.ts
test/lifecycle-ui.test.ts
test/lifecycle.test.ts
test/maintenance/relay-migration.test.mjs
test/maintenance/test_upstash_usage.py
test/manual-fallback-ui.test.ts
test/manual-fallback.test.ts
test/money-format.test.ts
test/multi-trip-repository.test.ts
test/multi-trip-ui.test.ts
test/multicurrency.test.ts
test/nostr-history-recovery.test.ts
test/nostr-recovery-transport.test.ts
test/nostr-relay.test.ts
test/operated-sync-recovery.test.ts
test/participant-claim-ui.test.ts
test/participants.test.ts
test/payers.test.ts
test/phase5-archive-acceptance.test.ts
test/phase5-money-acceptance.test.ts
test/platform-boundaries.test.ts
test/protection-status-ui.test.ts
test/pwa-install.test.ts
test/reattestation.test.ts
test/reconciliation-ui.test.ts
test/recovery-fingerprint.test.ts
test/relay-api.test.ts
test/relay-create.test.ts
test/relay-deadline-sync.test.ts
test/relay-diagnostics-ui.test.ts
test/relay-diagnostics.test.ts
test/relay-migration-mode.test.ts
test/relay-network-deadline.test.ts
test/relay-settings.test.ts
test/service-worker.test.ts
test/settlement-command.test.ts
test/settlement-history.test.ts
test/settlement-ui.test.ts
test/source-archive.test.ts
test/split-preservation.test.ts
test/storage-persistence-ui.test.ts
test/stubs/NeoButton.svelte
test/stubs/NeoCard.svelte
test/stubs/lucide-icons.ts
test/subgroups.test.ts
test/supabase-device-catchup.test.ts
test/supabase-relay-adapter.test.ts
test/supabase-relay-sql.test.ts
test/sync-batch-mitigation.test.ts
test/sync-coordination.test.ts
test/sync-coverage.test.ts
test/sync-cycle.test.ts
test/sync-honesty-ui.test.ts
test/sync-labels.test.ts
test/sync-pool-lifecycle.test.ts
test/sync-state.test.ts
test/sync-transport-cancel.test.ts
test/sync.integration.test.ts
test/verification.test.ts
tsconfig.json
vercel.json
vite.config.ts
vitest.config.ts
```

Generated/tracked: npm lockfiles; the three PNG outputs named by `scripts/gen-icons.mjs`; retention reports updated by `.github/workflows/task0-retention.yml`. The font is a tracked binary, not source inspected in this run (`public/fonts/SpaceGrotesk.woff2`). No vendored dependency source appears in the tracked list. Untracked-but-not-ignored input files: none; that observation concerns working-tree state rather than commit content.

Largest text files by newline count include `package-lock.json` (4,153), `PRD.md` (1,886), `src/Trip.svelte` (1,815), `core/package-lock.json` (1,294), `src/styles.css` (1,241), `src/db/repo.ts` (764), `core/test/properties.test.ts` (685) and `scripts/task0-retention.mjs` (637). Directory counts include `test/` directly (79), `src/lib/` (32), `.agents/` directly (22), `.github/workflows/` (18) and `src/relay/` (16).

## 8. Key modules in depth

### `core/src/`
- Responsibility: event contracts, monetary allocation, ledger projection, claim authority and transport admission (`types.ts`, `money.ts`, `fold.ts`, `identity.ts`, `transport.ts` within this directory).
- Key files and symbols: `core/src/fold.ts:127` (`fold`), `core/src/money.ts:10` (`allocate`), `core/src/settle.ts:19` (`greedySettlement`), `core/src/identity.ts` (`buildDSU`, `authorisedKeys`, `verifyConfirmation`), `core/src/canonical.ts` (`canonicalStateBytes`).
- Depends on: internal core modules; no runtime dependency block in `core/package.json`.
- Depended on by: `src/Trip.svelte`, `src/lib/events.ts`, `src/relay/sync.ts`, `src/relay/migrated-sync.ts`, and core/app tests.
- Notable behavior: allocation uses integer division/remainders, hash/codepoint tie-breaking and a conserved-total assertion; settlement sorts creditor/debtor balances; fold emits frozen/quarantined/anomaly state (`core/src/money.ts`, `core/src/settle.ts`, `core/src/fold.ts`).
- Tests covering it: `core/test/money.test.ts`, `core/test/fold.test.ts`, `core/test/identity.test.ts`, `core/test/order.test.ts`, `core/test/properties.test.ts`, `core/test/transport.test.ts`.

### `src/App.svelte` and `src/Trip.svelte`
- Responsibility: trip navigation, forms, ledger rendering, claims/settlements, file/QR exchange and synchronization status.
- Key files and symbols: `src/App.svelte` (`navigate`, `load`, `startNewTrip`); `src/Trip.svelte` (`commit`, `refreshState`, `addExpense`, `runSync`, `startPolling`).
- Depends on: core, `src/db/repo.ts`, `src/lib/`, claim crypto and dynamically loaded sync/QR modules (`src/Trip.svelte` imports and dynamic imports).
- Depended on by: `src/main.ts` mounts `App`; `App` mounts a keyed `Trip`; UI tests import or read the components (`test/landing-ui.test.ts`, `test/expense-workflow-ui.test.ts`).
- Notable behavior: navigation versions discard stale selection results; a trip ID is fixed for each component instance; teardown removes polling/listener resources (`src/App.svelte:15-49`, `src/Trip.svelte:79-86,1211-1225`).
- Tests covering it: `test/multi-trip-ui.test.ts`, `test/landing-ui.test.ts`, `test/settlement-ui.test.ts`, `test/expense-workflow-ui.test.ts` and other `test/*-ui.test.ts` files.

### `src/db/repo.ts`
- Responsibility: IndexedDB schemas, event/state reads and writes, identity storage, transport metadata and import/export artifacts.
- Key files and symbols: `db`, `createGroup`, `ensureGroup`, `readGroup`, `appendEvents`, `upsertRemoteEvents`, `parseExport`, `createExport`, `createIdentityBackup`, `applyDelta` (`src/db/repo.ts`).
- Depends on: `idb`, core event types, crypto and selected `src/lib/` helpers (`src/db/repo.ts:1-10`).
- Depended on by: UI, sync/recovery orchestration and type consumers such as `src/lib/verification.ts`.
- Notable behavior: compound group/event keys, local/published/confirmed status, per-group cursors/vectors, separate identity backups and browser DB version upgrade logic (`src/db/repo.ts:23-123,146-184,448-598`).
- Tests covering it: `test/multi-trip-repository.test.ts`, `test/device-identity.test.ts`, `test/export-security.test.ts`, `test/sync.integration.test.ts`.

### `src/crypto/`
- Responsibility: binary encoding, group identifiers/keys, encrypted envelopes and participant-claim signatures.
- Key files and symbols: `src/crypto/group.ts` (`createGroupSecret`, `groupTag`, `groupKey`, `relayWriteProof`), `src/crypto/envelope.ts` (`encryptEnvelope`, `decryptEnvelope`), `src/crypto/claim.ts` (`mintClaimKey`, `signClaim`, `verifyClaim`).
- Depends on: Web Crypto, byte helpers and bigint serialization; envelope source-archive linkage is type-only (`src/crypto/envelope.ts:1-4`).
- Depended on by: `src/db/repo.ts`, `src/relay/sync.ts`, `src/relay/migrated-sync.ts`, `src/lib/verification.ts`, `src/Trip.svelte`.
- Notable behavior: 32-byte random group secrets; SHA-256 tags; HKDF-derived AES-256-GCM key and write proof; 12-byte random envelope IV; legacy event-array decoding (`src/crypto/group.ts`, `src/crypto/envelope.ts`). Claim keys support Ed25519 and ECDSA P-256 (`src/crypto/claim.ts`).
- Tests covering it: `test/claim-crypto.test.ts`, `test/sync.integration.test.ts`, `test/verification.test.ts`.

### `src/lib/`
- Responsibility: monetary text handling, expense/payer/split commands, participant and settlement policies, lifecycle/durability decisions and display primitives.
- Key files and symbols: `src/lib/events.ts` (`makeEvent`, `makeExpenseFinancials`), `src/lib/money.ts` (`parseMinor`, `bigintReplacer`), `src/lib/verification.ts` (`buildVerificationContext`), `src/lib/lifecycle.ts` (`shouldPollGroup`).
- Depends on: selected core exports, crypto verification and repository types; numerous predicate/formatting modules have no imports (`src/lib/settlement-command.ts`, `src/lib/durability.ts`).
- Depended on by: `src/Trip.svelte`, `src/db/repo.ts` and relay orchestration (`src/relay/sync.ts`).
- Notable behavior: different split-input modes preserve entered amounts through `src/lib/split-preservation.ts`; multicurrency conversion is isolated in `src/lib/multicurrency.ts`; relay settings normalize endpoints and deduplicate relay URLs in `src/lib/relay-settings.ts`.
- Tests covering it: `test/expense-command.test.ts`, `test/money-format.test.ts`, `test/split-preservation.test.ts`, `test/multicurrency.test.ts`, `test/lifecycle.test.ts`, `test/durability.test.ts`, `test/verification.test.ts`.

### `src/relay/sync.ts` and transport adapters
- Responsibility: legacy publication/read-back, batching, snapshots, admission and migration dispatch.
- Key files and symbols: `src/relay/sync.ts` (`syncOnce`, `createRelays`, `relayFetchPlans`), `src/relay/http.ts` (`HttpRelay`), `src/relay/nostr.ts` (`NostrRelay`), `src/relay/sync-cycle.ts` (`coordinatedSync`).
- Depends on: core, repository, crypto, configuration, Nostr SDK, NIP-11 metadata and deadline/batch helpers.
- Depended on by: dynamic import in `src/Trip.svelte:932`; integration tests call `syncOnce` with injected relays (`test/sync.integration.test.ts`).
- Notable behavior: adapter-level acknowledgement quorum, group topic cursors, bounded network work, NIP-11-informed batch sizing and per-group coordination (`src/relay/sync.ts`, `src/relay/sync-cycle.ts`).
- Tests covering it: `test/sync.integration.test.ts`, `test/sync-cycle.test.ts`, `test/sync-coordination.test.ts`, `test/sync-batch-mitigation.test.ts`, `test/relay-network-deadline.test.ts`, `test/nostr-relay.test.ts`.

### `src/relay/migrated-sync.ts` and recovery modules
- Responsibility: operated-only migrated publication, device catch-up, receipt persistence and retained Nostr source delivery.
- Key files and symbols: `syncMigrated`, `eventFingerprint` (`src/relay/migrated-sync.ts`), `discoverMigration` (`src/relay/migration-mode.ts`), `RecoveryRepository` (`src/relay/recovery-db.ts`), `prepareSourcePackets` (`src/relay/source-archive.ts`).
- Depends on: existing repository/crypto/core, operated relay interface, `src/relay/nostr-recovery.ts`, `src/relay/nostr-recovery-transport.ts` and a separate `idb` database.
- Depended on by: `src/relay/sync.ts` migration dispatch; recovery tests.
- Notable behavior: content fingerprints detect conflicting event identities; encrypted pending packets survive retries; accepted generation prevents silent legacy fallback; source checkpoints advance after retained fragments are acknowledged (`src/relay/migrated-sync.ts`, `src/relay/migration-mode.ts`, `src/relay/recovery-db.ts`).
- Tests covering it: `test/supabase-device-catchup.test.ts`, `test/nostr-history-recovery.test.ts`, `test/nostr-recovery-transport.test.ts`, `test/source-archive.test.ts`, `test/recovery-fingerprint.test.ts`.

### `api/relay.ts`, `server/supabase-relay.ts` and `supabase/schemas/relay.sql`
- Responsibility: HTTP envelope storage and the alternate SQL storage implementation.
- Key files and symbols: `handler`, `verifyRelayWriteProof` (`api/relay.ts`); `SupabaseRelayStore` (`server/supabase-relay.ts`); append/read/import/topic-info RPCs (`supabase/schemas/relay.sql`).
- Depends on: `@upstash/redis` or server-side fetch to Supabase RPCs. SQL uses PostgreSQL built-ins; the server adapter does not import a Supabase JavaScript SDK.
- Depended on by: `src/relay/http.ts` over HTTP; export/import maintenance logic and tests (`scripts/relay-migration.mjs`, `test/supabase-relay-sql.test.ts`).
- Notable behavior: validated tags/proofs, opaque storage, fixed provider-error responses, backend/generation compatibility checks, SQL capacity reservation and service-role grants (`api/relay.ts`, `server/supabase-relay.ts`, `supabase/schemas/relay.sql`).
- Tests covering it: `test/relay-api.test.ts`, `test/relay-create.test.ts`, `test/supabase-relay-adapter.test.ts`, `test/supabase-relay-sql.test.ts`.

### `scripts/`
- Responsibility: source export, aggregate usage inspection, Nostr retention probes, asset generation and monetary-source scanning.
- Key files and symbols: `scripts/relay-migration.mjs` (`main`, `exportSnapshot`, `sealSnapshot`), `scripts/upstash-usage.py` (`collect`, `main`), CLI dispatch in `scripts/task0-retention.mjs:620`.
- Depends on: Node/Python standard libraries; `sharp` for icons; relay/network access for operational commands (`scripts/gen-icons.mjs`, `scripts/upstash-usage.py`, `scripts/task0-retention.mjs`).
- Depended on by: `package.json` scripts and `.github/workflows/relay-export.yml`, `.github/workflows/storage-usage.yml`, `.github/workflows/task0-retention.yml`.
- Notable behavior: export creates a recipient-encrypted file with exclusive creation; usage reads only aggregate commands; retention workflow commits report outputs (`scripts/relay-migration.mjs:264-287`, `scripts/upstash-usage.py:46-77`, `.github/workflows/task0-retention.yml`).
- Tests covering it: `test/maintenance/relay-migration.test.mjs`, `test/maintenance/test_upstash_usage.py`; no matching references to retention/probe/icon script filenames were located in `test/`.

### `public/` and `src/styles.css`
- Responsibility: install metadata, browser caching, icons/font assets and application styling.
- Key files and symbols: `public/sw.js` (`isCacheable`, install/activate/fetch listeners), `public/manifest.webmanifest`, `src/styles.css`.
- Depends on: browser service-worker/Cache Storage APIs; HTML links and public assets (`index.html`, `public/sw.js`).
- Depended on by: `src/main.ts` imports styles and registers the worker; `index.html` references icons/manifest; `src/App.svelte` renders the favicon.
- Notable behavior: shell requests use network-first with cached fallback; asset requests use cache-first; API and cross-origin requests are excluded; activation deletes other cache names (`public/sw.js`).
- Tests covering it: `test/service-worker.test.ts`, `test/pwa-install.test.ts`.

## 9. External interfaces

| Interface | Method / event / command | Handler / contract |
|---|---|---|
| `/api/relay?capabilities=1` | GET | `api/relay.ts:86`: `{ protocol, mode, generation }`, non-cacheable. |
| `/api/relay?tag=…&cursor=…&limit=…&author=…` | GET | `api/relay.ts:119`: `{ entries: [{ cursor, blob, author }] }`; tag required, other query fields optional. |
| `/api/relay` | POST | `api/relay.ts:92`: body `{ tag, blob, author, writeProof }`; response `{ cursor }`. Invalid inputs, proof conflicts and unavailable/paused storage have distinct HTTP statuses. |
| `/api/relay` | Other methods | `api/relay.ts:145`: 405 JSON error. |
| Non-API navigation paths | Vercel rewrite | `vercel.json:5`: rewrites to `/index.html`. |
| Join fragment | `#join=…`, optional recovery parameter | `src/App.svelte:33-42`, `src/lib/join-link.ts`: decode seed and select/ensure local group. |
| Nostr relay pool | Signed event publish and bounded queries | `src/relay/nostr.ts`: configured kind, group `t` tag, encrypted content and creation-time cursors. |
| Nostr recovery connection | EVENT / EOSE wire exchange | `src/relay/nostr-recovery-transport.ts`: bounded retained-history reads; `src/relay/nostr.ts:115` validates configured relay selection. |
| NIP-11 metadata | HTTP metadata fetch | `src/relay/nip11.ts`, called for message limits by `src/relay/sync.ts:91-94`. |
| Supabase REST RPC | POST `/rest/v1/rpc/prawnsplit_relay_append` and `prawnsplit_relay_read` | `server/supabase-relay.ts:24,73-94`; corresponding functions in `supabase/schemas/relay.sql`. |
| Maintenance RPCs | `prawnsplit_relay_import`, `prawnsplit_relay_topic_info` | `supabase/schemas/relay.sql:160,213`; import/parity helper in `scripts/relay-migration.mjs`. |
| Browser file exchange | Ledger export, identity backup and delta | `src/db/repo.ts`: `createExport`, `createIdentityBackup`, `createDelta`, `parseExport`, `replaceFromExport`, `restoreIdentityBackup`, `applyDelta`. |
| Local maintenance commands | `task0:*`, `gen:icons`, `lint:money`, export and usage CLIs | `package.json`, `scripts/`; entry points are listed in Section 4. |
| GitHub events / schedules | Push, PR, issue, workflow completion, manual dispatch, cron | `.github/workflows/`; gates and operational effects are listed in Section 12. |

The internal core API re-exports canonicalization, folding, HLC, identity, money, settlement, transport and types from `core/src/index.ts`. Both packages are private, and neither manifest declares a published `bin` interface (`package.json`, `core/package.json`). No gRPC/GraphQL registration, application queue worker or incoming application webhook handler was found in the tracked source; the server entry point is `api/relay.ts`.

## 10. Data and configuration

### Stored and exchanged data

| Storage / model | Shape and behavior | Evidence |
|---|---|---|
| Ledger database | `ThePrawnSplit`, version 2; `groups`, `events`, `identity`, `meta`, `buffer`; group/event and group/participant compound keys, plus group/sync indexes | `src/db/repo.ts:12-123` |
| Event payload | Version, ID, HLC, device, optional version vector; discriminated event union for groups, participants/claims, expense corrections, settlements, archive/unarchive and voids | `core/src/types.ts:9-80` |
| Folded state | Maps of participants, expenses, settlements and balances; anomalies, quarantined IDs and frozen flag | `core/src/types.ts:122-130` |
| Group transport metadata | Vectors, cursors, Nostr signing material, durability settings, relay configuration and subgroup presets | `src/db/repo.ts:41-55` |
| Recovery database | `ThePrawnSplitRelayRecovery`, version 1; `states` by scope and `receipts` by scope/event ID; encrypted pending packet and per-relay checkpoints | `src/relay/recovery-db.ts:4-36` |
| Redis relay | Stream key `ts:<tag>` with opaque blob/author fields; commitment key `tp:<tag>` | `api/relay.ts:11-12,60-66,112-115` |
| PostgreSQL namespace | `prawnsplit.relay_control`, `relay_topics`, `relay_entries`; numeric cursor pair primary key, topic foreign key and non-unique receipt digest index | `supabase/schemas/relay.sql:9-47` |
| SQL access/capacity | RLS enabled; grants to service role; write/import switches initially disabled; capacity counters and budgets initially zero; transactional reservation | `supabase/schemas/relay.sql:9-22,43-81,222-231` |
| Shared ledger export | Group metadata omits device counter and group secret; events exported separately from private claim identities | `src/db/repo.ts:146-160,448-475` |
| Relay envelopes | Event or snapshot discriminator; optional retained-source fragment; bigint JSON encoding inside AES-GCM | `src/crypto/envelope.ts`, `src/lib/money.ts` |

Schema evolution is implemented in the IndexedDB upgrade callback; SQL is supplied as one creation transaction rather than a numbered migration chain (`src/db/repo.ts:99-123`, `supabase/schemas/relay.sql`). Whether that SQL matches any hosted schema is not established by these files.

### Environment names

Defaults below describe existence only; environment values are not reproduced. `.env.example` declares the client/server names, while additional build, test and workflow names occur at the cited read sites.

| Variable name | Read / consumed at | Default exists? |
|---|---|---|
| `ANALYZE` | `vite.config.ts:12`; set by `package.json:24` | Absent disables visualizer branch |
| `FAST_CHECK_SEED` | `core/test/order.test.ts`, `core/test/properties.test.ts` | Yes, test-specific seeds |
| `GITHUB_EVENT_PATH` | `.github/scripts/checked-bot-merge.py:87` | No |
| `GITHUB_REPOSITORY` | `.github/scripts/checked-bot-merge.py:84` | No |
| `GITHUB_STEP_SUMMARY` | `scripts/upstash-usage.py:84`, `scripts/relay-migration.mjs:287` | Optional; absent omits summary write |
| `GH_TOKEN` | `.github/workflows/auto-merge-bots.yml`, `dependabot-auto-merge.yml`, `lfs-guard.yml`, `summary.yml` in the same directory | Supplied by workflow expressions |
| `ISSUE_BODY` | `.github/workflows/summary.yml` | Supplied by event |
| `ISSUE_NUMBER` | `.github/workflows/summary.yml` | Supplied by event |
| `ISSUE_TITLE` | `.github/workflows/summary.yml` | Supplied by event |
| `PRAWNSPLIT_EXPORT_PUBLIC_KEY_B64` | `scripts/relay-migration.mjs:183`, `.github/workflows/relay-export.yml:49` | No usable fallback; validated input required |
| `PRAWNSPLIT_RELAY_BACKEND` | `api/relay.ts:27,82` | Yes |
| `PRAWNSPLIT_RELAY_MIGRATION` | `api/relay.ts:81` | Yes |
| `PRAWNSPLIT_SUPABASE_SECRET_KEY` | `api/relay.ts:30`, `server/supabase-relay.ts:17-27` | No |
| `PRAWNSPLIT_SUPABASE_URL` | `api/relay.ts:30`, `server/supabase-relay.ts:17-24` | No |
| `RELAY_MAX_BLOB_BYTES` | `api/relay.ts:8` | Yes; invalid numeric input falls back |
| `RELAY_MAX_FETCH_LIMIT` | `api/relay.ts:9` | Yes; invalid numeric input falls back |
| `RESPONSE` | `.github/workflows/summary.yml` | Supplied by inference step output |
| `UPSTASH_REDIS_REST_TOKEN` | `api/relay.ts:20`, `scripts/upstash-usage.py:51`, `scripts/relay-migration.mjs:48` | No usable fallback |
| `UPSTASH_REDIS_REST_URL` | `api/relay.ts:20`, `scripts/upstash-usage.py:50`, `scripts/relay-migration.mjs:47` | No usable fallback |
| `VITE_ACK_QUORUM` | `src/config.ts:22` | Yes |
| `VITE_BATCH_MAX_EVENTS` | `src/config.ts:23` | Yes |
| `VITE_CAP_GROUP_TOTAL` | `src/config.ts:26` | Yes |
| `VITE_CAP_KNOWN_AUTHOR` | `src/config.ts:25` | Yes |
| `VITE_CAP_UNKNOWN_AUTHOR` | `src/config.ts:24` | Yes |
| `VITE_DRIFT_BUFFER_MAX` | `src/config.ts:27` | Yes |
| `VITE_IDLE_AFTER_MS` | `src/config.ts:21` | Yes |
| `VITE_MAX_FUTURE_DRIFT_MS` | `src/config.ts:28` | Yes |
| `VITE_NOSTR_KIND` | `src/config.ts:8`, `scripts/task0-retention.mjs:34`, `scripts/task0-relay-check.mjs:15` | Yes |
| `VITE_NOSTR_RELAYS` | `src/config.ts:10` | Yes |
| `VITE_POLL_ACTIVE_MS` | `src/config.ts:18` | Yes |
| `VITE_POLL_BACKOFF_MS` | `src/config.ts:19` | Yes |
| `VITE_POLL_IDLE_MS` | `src/config.ts:20` | Yes |
| `VITE_RELAY_ENDPOINT` | `src/config.ts:16` | Yes |
| `VITE_SCHEMA_VERSION` | `src/config.ts:17` | Yes |
| `VITE_SNAPSHOT_EVERY` | `src/config.ts:29` | Yes |

`GH_PAT` and `GITHUB_TOKEN` are workflow secret sources for injected `GH_TOKEN`, not application configuration reads (`.github/workflows/auto-merge-bots.yml:43`, `.github/workflows/dependabot-auto-merge.yml:43`).

Config precedence observable in source: explicit stored group relay settings are normalized over client defaults; client defaults use `import.meta.env` with fallback constants; numeric settings reject non-finite/sub-one inputs and floor accepted values (`src/lib/relay-settings.ts:12-27`, `src/config.ts:1-30`). Server selection reads `process.env` and enforces migration/backend combinations (`api/relay.ts:26-30,81-85`). Tests can inject relays, limits, repository instances or fetch implementations (`src/relay/sync.ts:80-104`, `src/relay/migrated-sync.ts:38-40`, `server/supabase-relay.ts:17`). No custom environment-file loader is present in the inspected application/configuration entry points.

## 11. Dependencies

### Direct runtime dependencies

| Dependency | Declared range | Observed use |
|---|---|---|
| `@upstash/redis` | `^1.38.2` | Redis environment client, commitment operations and stream append/read (`api/relay.ts`). |
| `idb` | `^8.0.0` | Typed ledger/recovery database opening and transactions (`src/db/repo.ts`, `src/relay/recovery-db.ts`). |
| `nostr-tools` | `^2.24.3` | Nostr keys, event signing and relay pool (`src/relay/nostr.ts`); recovery transport verification (`src/relay/nostr-recovery-transport.ts`). |
| `qrcode` | `^1.5.4` | Dynamically loaded join-link QR rendering (`src/Trip.svelte:869-870`). |
| `svelte` | `^5.16.0` | Browser mounting and component lifecycle (`src/main.ts`, `src/App.svelte`, `src/Trip.svelte`). |

Ranges are from `package.json:27-32`. `core/package.json` declares only development dependencies; internal source imports remain within `core/src/`.

### Development/build declarations

| Category | Direct declarations and evidence |
|---|---|
| Build | `vite`, `@sveltejs/vite-plugin-svelte`, `rollup-plugin-visualizer` (`package.json`, `vite.config.ts`). |
| Types/checking | `typescript`, `svelte-check`, `@tsconfig/svelte`, `@types/node`, `@types/qrcode` (`package.json`, `tsconfig.json`). |
| Test runner/property tests | `vitest`, `fast-check`; also declared separately in `core/package.json` (`core/test/properties.test.ts`). |
| UI tests | `@testing-library/dom`, `@testing-library/svelte`, `jsdom`; component aliases and browser resolution in `vitest.config.ts`. |
| Storage tests | `fake-indexeddb`, `@electric-sql/pglite` (`test/sync.integration.test.ts`, `test/supabase-relay-sql.test.ts`). |
| Asset tooling | `sharp` (`scripts/gen-icons.mjs`). |

All direct package version declarations use caret ranges (`package.json`, `core/package.json`). Both npm lockfiles use lockfile format 3 and record resolved dependency versions (`package-lock.json:4`, `core/package-lock.json:4`). GitHub Actions mix version-tag and full-SHA references; Semgrep's container uses a floating tag (`.github/workflows/split-build.yml`, `.github/workflows/relay-export.yml`, `.github/workflows/semgrep.yml:59-60`). No application Dockerfile, Compose file, Terraform module, Helm chart, Kubernetes manifest or devcontainer appears in the tracked inventory; the Semgrep container is a CI execution image.

## 12. Testing and CI

### Test declarations and scope

| Suite / gate | What the source configures | Evidence |
|---|---|---|
| Core | Eight `*.test.ts` files plus helper; Vitest and fast-check cover allocation, settlement, clocks, fold, identity, ordering and transport properties | `core/test/`, `core/vitest.config.ts`, `core/package.json` |
| Application | 79 top-level `test/*.test.ts` files; Vitest default Node environment, no file parallelism, test-specific browser environments/mocks | `test/`, `vitest.config.ts` |
| UI | Mixture of rendered Svelte tests and source-text assertions; NeoCard/NeoButton imports redirected to stubs | `test/landing-ui.test.ts`, `test/expense-workflow-ui.test.ts`, `vitest.config.ts:12-17`, `test/stubs/` |
| Sync integration | In-process relay doubles and IndexedDB simulation; convergence, recovery, quorum, snapshots and cursor/admission behavior | `test/sync.integration.test.ts` |
| SQL integration | PGlite runs the actual SQL creation script and exercises role access, quotas, append/read/import semantics | `test/supabase-relay-sql.test.ts:30-67` |
| Service worker | Event/fetch/cache behavior and source configuration assertions | `test/service-worker.test.ts` |
| Export maintenance | Node test runner | `test/maintenance/relay-migration.test.mjs`, `package.json:13` |
| Usage maintenance | Python unittest; separate from npm build chain | `test/maintenance/test_upstash_usage.py`, `.github/workflows/storage-usage.yml:27` |
| Monetary-source gate | Rejects selected rounding/float-parser patterns in enumerated ledger paths | `scripts/lint-money.mjs:4-10` |
| Type/component check | `svelte-check --tsconfig ./tsconfig.json`; strict compiler options | `package.json:9`, `tsconfig.json` |

`npm test` runs core then application/relay-export tests. `npm run build` adds the monetary-source gate, Svelte checking and Vite build after those tests (`package.json:8-14`). No suite was run, so pass/fail totals are Not available: execution was excluded from this mapping.

### Workflows

| Workflow path | Trigger / configured effect |
|---|---|
| `.github/workflows/auto-merge-bots.yml` | Workflow completion/manual dispatch; invokes the checked merge CLI for its non-Dependabot allowlist. |
| `.github/workflows/bandit.yml` | PR/push/schedule/manual; detects Python, runs Bandit and uploads SARIF; shell fallback suppresses scan failure. |
| `.github/workflows/ci.yml` | Path-filtered PRs to main/master; detects package manager, installs root dependencies and runs the package build script. |
| `.github/workflows/codeql.yml` | Push/PR/schedule; detects supported source languages and runs CodeQL initialization/autobuild/analysis for eligible public repositories. |
| `.github/workflows/dependabot-auto-merge.yml` | Workflow completion/manual dispatch; invokes checked merge CLI for Dependabot. |
| `.github/workflows/dependency-review.yml` | PR dependency review for public repositories, failing at moderate severity; private-repository branch emits a message. |
| `.github/workflows/greetings.yml` | Issue/PR first interaction; Dependabot PR branch excluded. |
| `.github/workflows/heartbeat.yml` | Scheduled/manual repository heartbeat automation. |
| `.github/workflows/labeler.yml` | PR-target metadata labelling; Dependabot excluded. |
| `.github/workflows/lfs-guard.yml` | Push/PR LFS checks with repository opt-out handling. |
| `.github/workflows/relay-export.yml` | Manual main-branch export; Node maintenance tests precede encrypted artifact creation/upload. |
| `.github/workflows/scorecard.yml` | Scheduled/manual OpenSSF Scorecard run and SARIF upload. |
| `.github/workflows/semgrep.yml` | PR/push/schedule/manual community rules scan; shell fallback suppresses scan failure and SARIF upload allows failure. |
| `.github/workflows/split-build.yml` | Path-filtered main pushes/manual; installs both locked packages, builds, then separately runs root tests, core tests and Svelte checking. |
| `.github/workflows/storage-usage.yml` | Relevant pushes/manual run usage-script tests; actual aggregate read runs only for manual main-branch execution. |
| `.github/workflows/summary.yml` | Issue event; inference action output is posted as an issue comment. |
| `.github/workflows/task0-retention.yml` | Cron `0 6 * * *` / manual; checks three cohorts, stages the three report files, commits differences and pushes. |
| `.github/workflows/trufflehog.yml` | Push/PR verified-secret scan, with Dependabot PR exception. |

Additional configured schedules are `23 10 * * 1` (Bandit), `0 14 * * 3` (CodeQL), `39 9 * * 1` (heartbeat), `0 3 1 * *` (Scorecard) and `17 10 * * 1` (Semgrep), each in its workflow above.

The bot merge script checks same-repository/default-branch targeting, the exact head, required successful Build Check/Build and all other checks before requesting a merge (`.github/scripts/checked-bot-merge.py:21-76`). Actual branch-protection requirements and workflow run outcomes are Not available: repository settings/check-run APIs were not queried.

No tracked coverage configuration, browser e2e-runner configuration, pre-commit hook configuration, ESLint or Prettier configuration appears in the input inventory. DeepSource analyzer declarations exist in `.deepsource.toml`; no active transformer is declared there. No test reference to `.github/scripts/checked-bot-merge.py`, `scripts/gen-icons.mjs`, `scripts/task0-relay-check.mjs` or `scripts/task0-retention.mjs` was located in `test/`; this is a reference search result, not a coverage percentage.

## 13. Branches

Positions use the existing `origin/main` ref at `b5518b6`, selected through `refs/remotes/origin/HEAD`. Rows preserve `git for-each-ref --sort=-committerdate` order; commit IDs replace calendar timestamps. Counts come from `git rev-list --left-right --count origin/main...<ref>`, with the right count reported as ahead.

| Branch | Last commit | Author | Ahead/behind default | Apparent purpose |
|---|---|---|---|---|
| `origin/HEAD` (symbolic alias) | `b5518b6` | task0-probe | 0 ahead / 0 behind | [inferred] Default-branch pointer; not an independent branch. |
| `origin/main` | `b5518b6` | task0-probe | 0 ahead / 0 behind | [inferred] Shared mainline and automated retention reports. |
| `maintenance/prawn-ui-20260916` | `e63962f` | b | 2 ahead / 3 behind | [inferred] Font/card/button presentation change plus state notes; unique subjects at `ed332a0`, `e63962f`. |
| `origin/maintenance/prawn-ui-20260916` | `e63962f` | b | 2 ahead / 3 behind | [inferred] Remote-tracking counterpart of the UI branch. |
| `main` | `6808e51` | b | 0 ahead / 3 behind | [inferred] Local mainline checkout reference. |
| `origin/dependabot/github_actions/actions/checkout-7.0.1` | `78d0cba` | dependabot[bot] | 1 ahead / 11 behind | [inferred] Checkout action update; unique subject at `78d0cba`. |
| `origin/dependabot/github_actions/trufflesecurity/trufflehog-3.97.4` | `02addc2` | dependabot[bot] | 1 ahead / 31 behind | [inferred] TruffleHog action update; unique subject at `02addc2`. |
| `origin/cr-009-status-register` | `f3a4f40` | b | 0 ahead / 94 behind | [inferred] Status register, drift and schema work; merge subject `6740971`. |
| `cr-008-doc-reconcile` | `39d95e4` | b | 0 ahead / 96 behind | [inferred] Documentation reconciliation, from ref name and merge subject. |
| `origin/cr-007-relay-admission` | `eac6612` | b | 1 ahead / 102 behind | [inferred] Relay admission/list/probe classification changes; unique subject at `eac6612`. |
| `cr-005-retention-probe` | `d18eab1` | b | 1 ahead / 106 behind | [inferred] Retention-probe work; unique subject at `d18eab1`. |
| `origin/dependabot/github_actions/actions/labeler-7` | `e529d47` | b | 1 ahead / 262 behind | [inferred] Named for a labeler update; unique subject only establishes branch initialization. |
| `origin/dependabot/github_actions/actions/setup-python-7` | `135f392` | b | 1 ahead / 262 behind | [inferred] Named for a Python setup update; unique subject only establishes branch initialization. |

All 13 returned refs are listed; the 40-ref cap was not reached. Git ancestry counts do not establish whether changes were incorporated through a squash; PR metadata is reported separately.

## 14. Pull requests

Authenticated `gh pr list --state open --limit 50` returned an empty list. There are therefore no open-PR number/title/author/head/base/draft/size rows to report from that response.

`gh pr list --state merged --limit 30` returned these ten records. Titles and head refs provide PR metadata evidence; they are not a substitute for inspecting another branch's source.

| PR | Title | Author | Head |
|---|---|---|---|
| #11 | feat: apply Prawn UI — Space Grotesk font and neo-card style | maintainer | `maintenance/prawn-ui-20260916` |
| #10 | chore(deps): bump actions/checkout from 4.2.2 to 7.0.1 | app/dependabot | `dependabot/github_actions/actions/checkout-7.0.1` |
| #8 | chore(deps): bump trufflesecurity/trufflehog from 3.97.0 to 3.97.1 | app/dependabot | `dependabot/github_actions/trufflesecurity/trufflehog-3.97.1` |
| #7 | chore(deps): bump actions/setup-node from 4 to 7 | app/dependabot | `dependabot/github_actions/actions/setup-node-7` |
| #6 | chore(deps): bump actions/checkout from 4 to 7 | app/dependabot | `dependabot/github_actions/actions/checkout-7` |
| #5 | CR-009: status register, drift guard, schema versioning decoupled from phases | maintainer | `cr-009-status-register` |
| #4 | feat: CR-007 — correct WoT misdiagnosis, drop damus, add snort, vet command | maintainer | `cr-007-relay-admission` |
| #3 | CR-006: fix probe accuracy and add slow cohort | maintainer | `cr-006-probe-accuracy` |
| #2 | CR-005: start task 0 relay retention probe | maintainer | `cr-005-retention-probe` |
| #1 | CR-001: make the app visible | maintainer | `cr-001-visible-app` |

Themes represented by those titles are UI presentation, dependency automation, relay probes/admission and status/schema handling. Local merge subjects additionally include `6abb0b8` (main integration), `6740971` (CR-009 integration) and `39d95e4` (main into documentation branch), from `git log --merges -n 40 --oneline`.

## 15. Change activity

File-touch counts below use `git log -n 200 --name-only --pretty=format:` over the analyzed HEAD history, exclude this output and count path occurrences, not changed lines. Default merge-diff behavior applies. Twenty of 201 distinct touched paths are listed (181 more not listed).

| Count | Path |
|---:|---|
| 133 | `.agents/STATE.md` |
| 129 | `.agents/JOURNAL.md` |
| 33 | `.agents/task0-retention.md` |
| 29 | `src/App.svelte` |
| 28 | `.agents/task0-retention-slow.md` |
| 26 | `.agents/task0-retention-current.md` |
| 13 | `core/test/properties.test.ts` |
| 12 | `test/platform-boundaries.test.ts` |
| 11 | `.agents/PROTOCOL.md` |
| 11 | `src/relay/sync.ts` |
| 11 | `test/sync.integration.test.ts` |
| 9 | `.gitignore` |
| 9 | `package.json` |
| 9 | `STATUS.md` |
| 9 | `test/config.test.ts` |
| 8 | `PRD.md` |
| 8 | `src/db/repo.ts` |
| 7 | `src/styles.css` |
| 7 | `test/manual-fallback-ui.test.ts` |
| 6 | `.github/workflows/task0-retention.yml` |

Contributor counts use `git shortlog -sn --all` across all locally available refs, not just the 200-commit churn window:

| Commits | Author |
|---:|---|
| 226 | b |
| 30 | task0-probe |
| 6 | dependabot[bot] |
| 4 | GitHub Actions Sync |
| 4 | github-actions[bot] |

The 30-subject inspection includes retained signed-source recovery (`7c02b12`), recovery-bridge preparation/release (`c9633c7`, `6b0008a`), encrypted relay export (`3088443`), aggregate usage inspection (`d705e82`), bounded trip synchronization (`108d642`), trip isolation (`e936989`) and the UI update (`ed332a0`). Repeated retention report commits correspond to `.github/workflows/task0-retention.yml`.

`git tag --sort=v:refname` returned no tags. Hosted releases: Not available: release metadata was not queried. Both package versions are `0.0.0` in `package.json` and `core/package.json`.

## 16. Documentation vs. code

Documentation was cross-checked after forming the source/configuration description. Repository instructions and an automatically attached README were present earlier in tool context; they were not used as code evidence. This table samples claims in `README.md`, `CONTRIBUTING.md`, the opening/layout/configuration sections of `TDD.md`, and the opening sections of `PRD.md`; it is not an exhaustive requirements audit.

| Doc claim | Source | Code evidence | Status |
|---|---|---|---|
| “no usage limits” | `README.md:3` | Admission limits in `src/config.ts:24-28` and `core/src/transport.ts`; HTTP payload/page limits in `api/relay.ts`. This broad claim does not describe those technical limits. | contradicted |
| Relays receive encrypted payloads | `README.md:5-6` | `src/crypto/envelope.ts:23-43`; only blob/author stored in `api/relay.ts:112-115`. | confirmed |
| Four expense split modes | `README.md:15` | Split-mode state/UI in `src/Trip.svelte`; parsers in `src/lib/money.ts` and preservation in `src/lib/split-preservation.ts`. | confirmed |
| At most n−1 settlement transfers | `README.md:16` | `core/src/settle.ts:19-45` consumes at least one creditor/debtor per transfer for zero-sum balances; `core/test/settle.test.ts`, `core/test/properties.test.ts`. | confirmed |
| Core has no runtime package dependencies | `README.md:22-24` | `core/package.json` has only dev dependencies; source imports are internal. | confirmed |
| Build executes the listed gates | `README.md:130-138` | Ordered `&&` build chain in `package.json:8`; `test:sync` also includes relay-export maintenance tests. | confirmed |
| Aggregate usage inventory is manually invoked | `README.md:28-34` | Actual read job restricted to manual main invocation in `.github/workflows/storage-usage.yml`; `scripts/upstash-usage.py:59` enumerates only aggregate commands. | confirmed |
| [doc claim, unverified] Hosted backend is still Upstash | `README.md:40` | Default is Upstash in `api/relay.ts`; deployed environment was not inspected. | unverified |
| SQL starts with import/write switches disabled | `README.md:45-51` | `supabase/schemas/relay.sql:9-22`. Hosted staging claims are separate from these defaults. | confirmed |
| Recovery bridge retains only ledger events | `README.md:91-97` | `src/relay/source-archive.ts` and `src/relay/migrated-sync.ts:225-242` now prepare/persist original-source fragments before checkpoint advancement. This does not establish complete remote-history coverage. | outdated |
| Migrated sync requires cross-tab lock support | `README.md:104-107` | Ownership test in `src/relay/migrated-sync.ts:42-45`; acquisition in `src/relay/sync-cycle.ts:21-27`. | confirmed |
| “TruffleHog scans every PR” | `CONTRIBUTING.md:17` | `.github/workflows/trufflehog.yml:44-57` skips Dependabot PRs. | contradicted |
| Vite 5 stack entry | `TDD.md:86` | `package.json:49` declares Vite 6 range. | outdated |
| Separate DB schema file and source worker | `TDD.md:51-64` | Schema is in `src/db/repo.ts`; worker is `public/sw.js`. Listed `src/db/schema.ts` and `src/sw.ts` are absent from inventory. | outdated |
| API file is all server code | `TDD.md:66-67,251-254` | `api/relay.ts` imports `server/supabase-relay.ts`; SQL functions live in `supabase/schemas/relay.sql`. | outdated |
| Upstash credential is the only environment secret | `TDD.md:16-17` | Optional Supabase credential read in `api/relay.ts:30`, also declared by name in `.env.example`. | outdated |
| “No code has been written.” | `PRD.md:11` | Application and ledger implementation in `src/Trip.svelte`, `core/src/fold.ts`, `src/db/repo.ts`. | outdated |

Capabilities absent from the sampled README feature summary include multiple locally selectable trips (`src/App.svelte:69-98`), subgroup presets (`src/lib/subgroups.ts`, `src/Trip.svelte`), participant device linking/reattestation (`src/lib/device-link.ts`, `src/lib/reattestation.ts`) and settlement dispute/void events (`core/src/types.ts:74-77`). This absence statement is limited to that summary, not the full requirements document.

## 17. Gaps and unknowns

- Deployed backend, active migration generation, SQL deployment state, retained source coverage and hosted capacity: Not available: operational endpoints and databases were not queried. The repository supplies configuration branches and a desired schema (`api/relay.ts`, `supabase/schemas/relay.sql`), not an independently verified deployment snapshot.
- Runtime correctness, installed dependency availability, test totals and build output: Not available: project execution was excluded. Test/build declarations are described in Section 12 (`package.json`, `vitest.config.ts`, `.github/workflows/split-build.yml`).
- The existing local branch/ref graph is older or different from the PR service's integration metadata: PR #11 is reported merged by `gh`, while the selected branch still has unique commits against the stored `origin/main`. No fetch or integration-method verification was performed.
- README staging/retention statements and handoff evidence are not treated as live service facts. Full historical reports and most requirement sections were not analyzed in this run (`.agents/`, `PRD.md`, `TDD.md`).
- Exact Node runtime support is not declared by an `engines` field in either package manifest; the workflows select different runtime channels (`package.json`, `core/package.json`, `.github/workflows/ci.yml`, `.github/workflows/split-build.yml`, `.github/workflows/task0-retention.yml`).
- No application container/orchestration definitions, server listener-port declaration or Vite API proxy were present in the tracked configuration inventory (`vite.config.ts`, `vercel.json`).
- No numbered SQL migration history accompanies `supabase/schemas/relay.sql`; its relationship to a hosted schema is not determined by local inspection.
- No tracked coverage report/configuration or browser e2e-runner setup was found; UI coverage includes source assertions and aliased component stubs (`vitest.config.ts`, `test/expense-workflow-ui.test.ts`, `test/stubs/`). No coverage percentage is inferred.
- Private environment contents, binary asset contents and probe-manifest payload values were not inspected for inclusion in this map. No secret-scan result is asserted from that limited scope (`.gitignore`, `.env.example`, `scripts/task0-manifest*.json`).
- Tags are absent from the local tag listing; hosted releases and required branch checks are Not available: their metadata endpoints were not queried.
- Supplemental delegated review: Not available: the reviewer invocation returned no assistant or tool response; the background source-tracing task also returned no findings. The map is based on direct file and Git inspections, with an inline structural/citation self-check.
