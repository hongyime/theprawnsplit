# Project State

Current task: continue local build while Vercel direct deployment is blocked.

Progress:
- Completed spec cleanup plus Phase 0 executable core.
- Created live `.agents/STATE.md` and `.agents/JOURNAL.md`.
- Cleaned active PRD/TDD contradictions for claim mode, drift handling, cap semantics,
  export artifact names, relay route shape, relay write proof, and fold/admission boundaries.
- Added standalone `core/` TypeScript package with pure money, settlement, HLC,
  identity, fold, and canonical-state modules.
- Added Vitest/fast-check Phase 0 tests.
- Started Phase 1 local single-device app work. Scope: static Vite/Svelte PWA,
  IndexedDB ledger storage, participants, expenses, settlements, import/export, no
  sync/relay/server code.
- Added root Vite/Svelte scaffold, IndexedDB repository helpers, event helpers, and
  initial local ledger UI.
- Implemented Phase 1 local workflows: auto local group creation, shadow participants,
  four split modes, visible rounding remainder, immutable expense add/edit/void events,
  settlement recording, balances, PWA manifest, and TripLedgerExport import/export.
- Added service worker offline app-shell caching, iOS Add-to-Home-Screen guidance, and
  `lint:money` build gate for ledger money code.
- Started Phase 2 sync work. Scope: Task 0 relay/protocol checks, encrypted relay
  payloads, operated Vercel relay, Nostr adapter, sync metadata/outbox, adaptive
  polling, claim-key minting, honest unsynced UI, and manual fallback promotion.
- Added and ran `scripts/task0-relay-check.mjs`: kind 1512 is regular-range and
  unregistered in the current registry; all five default relays expose NIP-11 metadata.
  Retention remains unproven and requires scheduled publish/read-back probes.
- Added Phase 2 sync plumbing: group secret/tag storage, AES-GCM relay envelopes,
  Nostr and HTTP relay adapters, sync metadata/outbox states, read-back confirmation,
  join-link seed support, and visible unconfirmed counts.
- Added Phase 2 transport admission rules: future-dated relay events are persisted in
  the IndexedDB drift buffer until due, per-author cap surplus is dropped without
  blocking other authors, and `discardVector` advances for dropped surplus to prevent
  refetch loops.
- Added `core/src/transport.ts` with tests covering REQ-SYN-19/24/27. Local appended
  events are stamped with the sender's current version vector before publication.
- Added encrypted advisory snapshot relay envelopes. Sync publishes a snapshot every
  configured cadence with folded canonical state plus covering `vv`; bootstrap devices
  with an empty raw log seed their transport vector from the newest snapshot while raw
  event fetch/reconciliation remains authoritative.
- Added root Phase 2 sync integration tests with an in-memory five-relay pool. The test
  proves typed snapshot/event envelope decryption and three-device convergence when only
  two of five relays survive. `npm run build` now runs both `test:core` and `test:sync`.
- Added fake-IndexedDB sync recovery coverage. The test isolates two browser stores,
  syncs a populated device through in-memory relays, creates a wiped second device from
  the join seed, and verifies topic-only relay fetch reconstructs the same folded state.
  `syncOnce` accepts injected relays for tests while production still creates HTTP+Nostr
  relays by default.
- Added recovery-oriented join UI semantics. A join-link device with an empty raw log now
  shows a recovery panel, retries relay recovery before rendering an empty trip, keeps
  participant creation disabled until raw history arrives, surfaces manual JSON import as
  a primary action, and labels snapshot-only bootstrap as advisory while raw history keeps
  reconciling.
- Fixed the first remote Vercel build failure: production root install did not install
  `core/devDependencies`, so `core/test/properties.test.ts` could not resolve
  `fast-check`. Added `fast-check` to root devDependencies because the root build runs
  `npm --prefix core test`.
- Added the operated Vercel relay function at `api/relay.ts`, backed by Upstash Redis
  Streams, plus `vercel.json` Vite routing.
- Added Phase 2 claim-key minting UI: unclaimed participants can be claimed with a
  signed `ParticipantClaimed` event; expense creation is read-only until the device has
  a local claim; identity backup is a separate warning-gated export.
- Created and linked the Vercel project to the GitHub repository. Local Vercel link
  metadata remains gitignored.
- Attached the requested custom domain to the Vercel project. Vercel reports the existing
  Cloudflare CNAME is valid, with a recommended DNS target update.
- Set Vercel project settings: framework `vite`, build command `npm run build`, output
  directory `dist`.
- Started Phase 3 durability work that does not depend on deployment. The app now
  computes standalone status with the PRD display-mode/iOS checks, shows an always-visible
  protection indicator for installed/browser, storage persistence, and sync health, hides
  install guidance when already standalone, and calls `navigator.storage.persist()` only
  after the first expense save path rather than initial load.

Next step:
- Commit and push `main` when ready; GitHub push is expected to trigger Vercel deployment.
- Remaining deployment work: configure Vercel env vars and verify the automatic deployment.
- Direct Vercel CLI deploy remains blocked by the daily free-tier API deployment limit.
  Attempted production deploy on 2026-08-21 failed with `api-deployments-free-per-day`
  (>100 deployments).
- Configure Vercel env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
  They are currently absent; without them the app can still build and Nostr sync can run,
  but `/api/relay` will return a configuration error.

Notes:
- Keep `.agents/STATE.md` short and current.
- Record durable decisions in `.agents/JOURNAL.md`.
- Verification passed on 2026-08-21 from `core/`: `npm test`, `npx tsc --noEmit`,
  and `npm audit --json` with zero vulnerabilities after upgrading Vitest.
- Phase 1 verification passed on 2026-08-21 from repo root: `npm run build`,
  root `npm audit --json`, core `npm audit --json`, served dev app at
  `http://127.0.0.1:5173/`, fetched `/`, `/src/main.ts`, and `/sw.js` with HTTP 200,
  and scanned sources for prohibited localStorage/sessionStorage/relay/telemetry/login/
  signup/background-sync/push references. The only `fetch` hit is service-worker cache
  fallback.
- Phase 2 partial verification passed on 2026-08-21 from repo root: `npm run build`,
  `npm --prefix core test` (7 files, 23 tests), root `npm run test:sync` (1 file,
  3 tests), and standalone `api/relay.ts` typecheck with the installed Upstash SDK
  signatures.
- Security audits passed on 2026-08-21: root `npm audit --json` and `npm --prefix
  core audit --json` both report zero vulnerabilities.
- Latest verification on 2026-08-21 after recovery UI changes: `npm run build` passed
  with core tests, sync integration tests, money lint, Svelte diagnostics, and Vite
  production bundle; root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after adding root `fast-check`: `npm run build`
  passed locally and root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after Phase 3 protection UI: `npm run build` passed
  locally and root `npm audit --json` reports zero vulnerabilities.
- Vercel checks on 2026-08-21 show the project exists but direct deployment creation was
  quota-blocked.
- Retried a production Vercel CLI deploy on 2026-08-21; it is still blocked with
  `api-deployments-free-per-day` (>100 deployments). Vercel env check still shows no
  env vars configured. Domain verification remains OK with `dns_change_recommended`.
- A deployment attempt briefly passed quota and exposed the missing root `fast-check`
  dependency in Vercel build logs; after fixing it locally, the next deployment attempt
  was quota-blocked again with `api-deployments-free-per-day`.
- `vercel build --prod` currently fails locally before project
  code runs with `spawn cmd.exe ENOENT`; `cmd.exe` exists on PATH, so keep this as a
  local CLI runner issue unless reproduced remotely.
