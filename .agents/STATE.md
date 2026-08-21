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
- Added durable Phase 3 prompt state in IndexedDB metadata. The app now tracks session
  count, install dismissals/retired levels, first-expense persistence request, pin-link
  prompt handling, non-zero balance history, and first-zero/seven-day export prompt
  handling without `localStorage`.
- Added durability prompt policy tests for standalone/archive/offline/desktop suppression,
  dismissal retirement, modal once-per-session behavior, pin-link once-only behavior, and
  export prompt triggers.
- Added REQ-DUR-10 recovery distinction in the empty join-link blocker. The recovery UI
  now lets the user mark the screen as first-time join or "had it before"; eviction mode
  changes the heading/copy and promotes manual JSON import ahead of retry sync.
- Added structural REQ-SEC-05 export artifact tests. `TripLedgerExport` is asserted to
  exclude identity backup data, claim private keys, group secret material, and local Nostr
  secret material; `DeviceIdentityBackup` remains the separate credential-bearing artifact.
- Added a minimal archive workflow for the REQ-DUR-07/REQ-LIF-04 export trigger. Archiving
  asks for final confirmation naming outstanding balances, downloads `TripLedgerExport`
  before recording `GroupArchived`, makes the trip read-only, and suppresses adaptive
  polling while archived.
- Added a pure archive lifecycle helper/test so archived/read-only/polling decisions are
  based on the ordered event log.
- Started Phase 4 trust work in the pure core. Settlement authority now comes only from
  the first valid participant claim plus `DeviceLinked`/threshold `ClaimReattested`
  keys; unpaired second claims surface `contested-participant-claim`, one device claiming
  multiple participants surfaces `device-claims-multiple-participants`, and contested
  claims cannot clear settlement pending state.
- Added adversarial Phase 4 tests for forged/unpaired second-device claims, valid
  `DeviceLinked` confirmation, one device claiming two participants, and contested
  settlement confirmation staying pending in folded state.
- Added Phase 4 duplicate/merge fold semantics. The core fold now surfaces duplicate-name
  participant hints, lets `ParticipantsMarkedDistinct` suppress only the duplicate scanner,
  keeps it out of union-find, surfaces `distinct-participants-merged` contradictions with
  the merge edge involved, and preserves EventVoided-as-merge-undo behavior.
- Added Phase 4 settlement status semantics. The core fold now marks settlements recorded
  by an uncontested payee device as born confirmed, marks settlements to shadow payees as
  `cashUnconfirmable` without pending nag state, keeps disputes visible without reversing
  balances, and exposes settlement status rows in the app UI.
- Added Phase 4 recovery-authority import path. `DeviceIdentityBackup` can now be pasted
  through the recovery import UI and restored onto a matching local trip by `tagHex`,
  even when the local IndexedDB `groupId` differs after join-link recovery. This keeps
  identity backup separate from `TripLedgerExport` while restoring claim keys.
- Added Phase 4 settlement-void authority. `SettlementVoided` is honored only when
  emitted by the device that recorded the original settlement; other void attempts now
  surface `unauthorized-settlement-void` and leave settlements/balances intact.
- Added Phase 4 merged-device display semantics. Folded participant device lists now
  union claimed devices across merged participants, include valid `DeviceLinked` and
  `ClaimReattested` devices when claim verification context is available, exclude voided
  link events, and do not change literal-payee settlement authority.
- Added Phase 4 contested-confirmation surfacing. A valid `SettlementConfirmed` signature
  for a payee with an active claim anomaly now leaves the settlement pending, marks the
  settlement as contested, and records `contested-settlement-confirmation`; invalid
  signatures remain ignored.
- Added Phase 4 version-vector financial edit resolution. Causally newer financial edits
  now remain the active expense financials even when HLC clock skew sorts an older edit
  later, while valid superseded financial edits remain visible in `financialHistory`.
- Added Phase 4 duplicate/merge reconciliation UI. Fold anomalies for possible duplicate
  participants and marked-distinct merge contradictions now surface in a full-width banner
  with append-only actions: merge, mark distinct, undo merge, or remove the distinct mark.
- Added Phase 4 browser settlement verification. The app now precomputes WebCrypto claim
  signature checks into a synchronous fold verification context, folds app state with that
  context, and lets a locally claimed payee emit signed `SettlementConfirmed` events.
- Added Phase 4 peer re-attestation workflow. Valid `ClaimReattested` authority now clears
  the contested second-claim anomaly, restored devices can confirm settlements after peer
  attestation, and the app surfaces re-attest/void-claim actions for contested recovered
  devices when this browser holds another participant's identity.
- Added Phase 4 participant add/claim UX. The People form now interrupts likely duplicate
  participant creation with normalized fuzzy matching, the claim flow uses an in-app
  provenance/balance confirmation modal, and the roster shows claim/add attribution.
- Added REQ-ID-08 roster ordering. Unclaimed participants now render first with primary
  claim emphasis, claimed participants are grouped in a collapsed section, and create-new
  sits last with secondary styling.
- Started relay diagnostics for Phase 4. Sync results now carry structured relay
  diagnostics parsed from NIP-01-style failure prefixes, and the app renders them below
  the sync strip.
- Started REQ-MON-17 app surfacing. Expense rows now expose folded financial history so
  superseded concurrent corrections are visible, not only preserved in core state.
- Started settlement dispute/void UX. Settlement rows now show payment and dispute claims
  together, allow append-only disputes, and offer local void only to the device that
  recorded the settlement.
- Started REQ-SEC-02 device pairing UI. Claimed participant rows can now create a
  shareable `DeviceLinkRequest`, and an authorised device can paste that request to emit a
  signed `DeviceLinked` event.
- Added REQ-SEC-06 re-attestation threshold display. Contested recovered-device banners
  now show the majority threshold, current attestation count, and the two-peer small-group
  caveat from Q14.
- Started REQ-SYN-22 frozen UI enforcement. When newer schema events are quarantined,
  the app now hides balances and freezes settlement controls instead of displaying
  non-authoritative money state.
- Started Phase 5 lifecycle polish. Archive confirmation now states relay data is not
  deleted, and archived trips expose an explicit confirmed unarchive action.
- Continued Phase 5 lifecycle polish. The app now treats `settled` as a computed active
  view predicate over folded balances, and archived trips show the outstanding transfers
  captured by the controlling `GroupArchived` event.
- Started Phase 5 custom-relay configuration UI. Relay preferences are device-local
  metadata, normalize operated endpoint/Nostr relay URLs, and feed sync relay creation
  without writing relay configuration into shared ledger events.
- Started Phase 5 multi-payer UI. Expense entry can now emit the existing v1
  `Financials.payers[]` schema from either one payer or exact paid amounts from multiple
  people, with validation that payer amounts sum to the total.
- Started participant deactivation UI. `ParticipantDeactivated` is exposed as a roster
  hide/restore action that only changes default new-expense split selection; folded
  balances and settlements remain unchanged.
- Started REQ-MON-08 multi-currency entry. The app can create v2 rate-bearing expenses
  by converting an entered foreign total to group base minor units and freezing
  `Financials.rate` in the expense event.
- Started Phase 5 subgroup presets. Expense split selections can be saved, applied, and
  deleted as local metadata presets; expenses still persist concrete payer/share rows.
- Added Phase 5 archive export acceptance coverage. `TripLedgerExport` restore now has
  a regression proving archived state and recorded outstanding balances reconstruct on a
  fresh local store.
- Hardened REQ-MON-08 multi-currency conversion. Foreign-currency base minor units are
  now computed from the decimal rate text with `BigInt` rational arithmetic instead of
  floating-point rounding, and the money lint gate covers the helper.
- Added a testable Phase 5 archive transition plan. The UI now executes a pure
  `download-export` then `append-archive-event` action list, with copied outstanding
  transfers feeding the `GroupArchived` event.

Next step:
- Latest pushed commit before this slice is `36c4a0d` on `main`.
- GitHub/Vercel automatic production deployment for `cd21de2` completed Ready on
  2026-08-21.
- Remaining deployment work: configure Vercel env vars and verify custom-domain runtime.
- Direct Vercel CLI deploy remains blocked by the daily free-tier API deployment limit.
  Attempted production deploy on 2026-08-21 failed with `api-deployments-free-per-day`
  (>100 deployments).
- Pushed commit `d543234` to `main` on 2026-08-21. GitHub recorded a Vercel status,
  but Vercel failed it at the account/build-rate-limit layer before creating a new
  deployment for that commit.
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
- Latest verification on 2026-08-21 after Phase 3 prompt gating: `npm run build` passed
  locally with 23 core tests and 7 root tests; root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after recovery distinction/export tests: `npm run
  build` passed locally with 23 core tests and 9 root tests; root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after minimal archive flow: `npm run build` passed
  locally with 23 core tests and 10 root tests; root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after Phase 4 trust core slice: `npm run build`
  passed locally with 27 core tests and 10 root tests; root `npm audit --json` reports
  zero vulnerabilities.
- Latest verification on 2026-08-21 after duplicate/merge fold slice: `npm run build`
  passed locally with 30 core tests and 10 root tests; root `npm audit --json` reports
  zero vulnerabilities.
- Latest verification on 2026-08-21 after settlement status slice: `npm run build`
  passed locally with 33 core tests and 10 root tests; root `npm audit --json` reports
  zero vulnerabilities.
- Latest verification on 2026-08-21 after identity-backup restore: `npm run build`
  passed locally with 33 core tests and 11 root tests; root `npm audit --json` reports
  zero vulnerabilities.
- Latest verification on 2026-08-21 after settlement-void authority: `npm --prefix
  core test` passed with 35 tests, `npm run build` passed with 35 core tests and 11
  root tests, and root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after merged-device display semantics: `npm
  --prefix core test` passed with 38 tests, `npm run build` passed with 38 core tests
  and 11 root tests, and root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after contested-confirmation surfacing: `npm
  --prefix core test` passed with 39 tests, `npm run build` passed with 39 core tests
  and 11 root tests, and root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after version-vector financial edit resolution:
  `npm --prefix core test` passed with 40 tests, `npm run build` passed with 40 core
  tests and 11 root tests, and root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after duplicate/merge reconciliation UI: `npm run
  build` passed with 40 core tests and 11 root tests, and root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after browser settlement verification: `npm run
  build` passed with 40 core tests and 12 root tests, and root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after peer re-attestation workflow: `npm --prefix
  core test` passed with 41 tests, `npm run build` passed with 41 core tests and 13
  root tests, and root `npm audit --json` reports zero vulnerabilities.
- Latest verification on 2026-08-21 after participant add/claim UX: `npm run build`
  passed with 41 core tests and 17 root tests, and root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after REQ-ID-08 roster ordering: `npm run build`
  passed with 41 core tests and 18 root tests, and root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after relay diagnostics: `npm run build` passed
  with 41 core tests and 21 root tests, and root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after REQ-MON-17 app history surfacing: `npm run
  build` passed with 41 core tests and 22 root tests, and root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after settlement dispute/void UX: `npm run build`
  passed with 41 core tests and 24 root tests, and root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after REQ-SEC-02 device pairing UI: `npm run build`
  passed with 41 core tests and 26 root tests, and root `npm audit --json` reports zero
  vulnerabilities.
- Latest verification on 2026-08-21 after REQ-SEC-06 re-attestation threshold UI: `npm
  run build` passed with 41 core tests and 28 root tests, and root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after REQ-SYN-22 frozen UI enforcement: `npm run
  build` passed with 41 core tests and 30 root tests, and root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after Phase 5 lifecycle unarchive slice: `npm run
  build` passed with 41 core tests and 32 root tests, and root `npm audit --json`
  reports zero vulnerabilities.
- Latest verification on 2026-08-21 after Phase 5 settled/archive summary slice: `npm
  run build` passed with 41 core tests and 34 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after Phase 5 custom relay settings slice: `npm run
  build` passed with 41 core tests and 38 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after Phase 5 multi-payer UI slice: `npm run build`
  passed with 41 core tests and 41 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after participant deactivation UI slice: `npm run
  build` passed with 42 core tests and 42 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-MON-08 multi-currency entry slice: `npm
  run build` passed with 43 core tests and 45 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after subgroup presets slice: `npm run build`
  passed with 43 core tests and 49 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after archive export acceptance coverage: `npm run
  build` passed with 43 core tests and 50 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after multi-currency integer conversion hardening:
  `npm run build` passed with 43 core tests and 51 root tests; root `npm audit
  --json`, protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after archive transition plan extraction: `npm run
  build` passed with 43 core tests and 52 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Vercel checks on 2026-08-21 show the project exists but direct deployment creation was
  quota-blocked.
- Vercel automatic deploy on 2026-08-21 for `cd21de2` succeeded and reports Ready.
- Retried a production Vercel CLI deploy on 2026-08-21; it is still blocked with
  `api-deployments-free-per-day` (>100 deployments). Vercel env check still shows no
  env vars configured. Domain verification remains OK with `dns_change_recommended`.
- A deployment attempt briefly passed quota and exposed the missing root `fast-check`
  dependency in Vercel build logs; after fixing it locally, the next deployment attempt
  was quota-blocked again with `api-deployments-free-per-day`.
- `vercel build --prod` currently fails locally before project
  code runs with `spawn cmd.exe ENOENT`; `cmd.exe` exists on PATH, so keep this as a
  local CLI runner issue unless reproduced remotely.
