# Project State

Current task: continue next-phase hardening while production relay runtime env remains
unconfigured.

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
  keys; unpaired second claims surface `unverified-reclaim`, one device claiming
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
- Hardened editable money formatting in the app. Split-mode preservation, multi-payer
  seeding, edit prompts, and settlement suggestions now format minor units from `BigInt`
  without converting ledger amounts through `Number`.
- Hardened percentage split parsing. Percentage-mode weights now parse decimal input into
  integer basis points and surface invalid percentage text instead of using floating-point
  `Number(...)`/`Math.round(...)`.
- Hardened share-weight parsing. Share-mode weights now require strict whole-number text
  instead of accepting partial `Number.parseInt(...)` matches.
- Added Phase 5 creation-to-archive acceptance coverage. A repository-level test now
  creates a trip, adds participants and an expense, records outstanding balances in
  `GroupArchived`, exports, restores into a fresh store, and verifies balances/archive.
- Hardened the Phase 5 local-metadata export boundary. `TripLedgerExport` now has a
  regression proving custom relay settings and subgroup presets stay out of the
  shareable ledger artifact.
- Hardened REQ-DUR-08 pin-link prompt persistence. Created, joined, and restored groups
  now seed normalized durability metadata immediately, and repository coverage proves
  the pin-link prompt survives app-launch bookkeeping until explicitly handled.
- Added REQ-SYN-13 Web Share delta fallback. The app can package pending outbound events
  as a `TripLedgerDelta`, share it through Web Share with JSON download fallback, and
  import that delta into a matching joined trip without exposing identity or group secrets.
- Added REQ-SYN-13 QR join-token sharing. Join-link encoding now lives in a tested helper
  that keeps the token in the URL fragment, and the app exposes a QR modal using the same
  join token as the copy-link action.
- Hardened REQ-SYN-15/16 sync metadata. Partial read-back confirmation no longer clears
  `unsyncedSince` while any local or published outbound event remains pending, so the
  manual sharing banner cannot disappear before the outbox is fully confirmed.
- Added REQ-SYN-25/26 snapshot-only bootstrap coverage. A relay snapshot can seed the
  transport version vector for an empty joined device, but it does not create semantic
  ledger events or folded participant state without raw event history.
- Added REQ-SYN-10 delivery-coverage surfacing. Expense rows now say "everyone has
  this" only when every known device's latest version vector covers the relevant expense
  event; otherwise they show that it is not yet on every known device.
- Hardened REQ-SYN-11 relay OK failure policy. Relay diagnostics now carry structured
  action kinds for duplicate-as-success, retry/backoff, permanent drop, and retryable
  unknown failures, with bounded exponential backoff timing for retryable relay failures.

Next step:
- Automatic production deploy for current `main` commit `805e6e9` is Ready on
  2026-08-21, and Vercel inspect shows both requested production aliases attached.
- Configure Vercel env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
  Vercel env listing on 2026-08-21 reports no environment variables; without them the
  app can still build and Nostr sync can run, but `/api/relay` will return a
  configuration error.

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
- Latest verification on 2026-08-21 after editable money formatting hardening: `npm run
  build` passed with 43 core tests and 54 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after percentage split parsing hardening: `npm run
  build` passed with 43 core tests and 55 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after strict share-weight parsing: `npm run build`
  passed with 43 core tests and 56 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after Phase 5 creation-to-archive acceptance:
  `npm run build` passed with 43 core tests and 57 root tests; root `npm audit
  --json`, protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after Phase 5 local metadata export boundary:
  `npm run build` passed with 43 core tests and 57 root tests; root `npm audit
  --json`, protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after archived profile edit lock: `npm run build`
  passed with 43 core tests and 58 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after archived draft/subgroup lock: `npm run
  build` passed with 43 core tests and 58 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after archived settlement draft lock: `npm run
  build` passed with 43 core tests and 58 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-LIF-05 polling proof: `npm run build`
  passed with 43 core tests and 59 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after custom relay adapter proof: `npm run build`
  passed with 43 core tests and 61 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after Phase 5 money export/restore acceptance:
  `npm run build` passed with 43 core tests and 62 root tests; root `npm audit
  --json`, protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after operated relay API coverage: `npm run
  build` passed with 43 core tests and 65 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after identity-backup prompt hardening: `npm run
  build` passed with 43 core tests and 66 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after unverified-reclaim anomaly alignment: `npm
  run build` passed with 43 core tests and 66 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-DUR-08 pin-link metadata hardening: `npm
  run build` passed with 43 core tests and 67 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-SYN-13 Web Share delta fallback: `npm
  run build` passed with 43 core tests and 68 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-SYN-13 QR join-token sharing: `npm run
  build` passed with 43 core tests and 69 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-SYN-15/16 outbox clock hardening: `npm
  run build` passed with 43 core tests and 70 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-SYN-25/26 snapshot-only bootstrap
  coverage: `npm run build` passed with 43 core tests and 71 root tests; root `npm
  audit --json`, protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-SYN-10 delivery coverage surfacing: `npm
  run build` passed with 43 core tests and 73 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Latest verification on 2026-08-21 after REQ-SYN-11 relay policy hardening: `npm run
  build` passed with 43 core tests and 74 root tests; root `npm audit --json`,
  protected-string scan, and `git diff --check` passed.
- Added platform-boundary regression coverage for REQ-PLT-05/REQ-UX-05: runtime
  source is scanned to keep ledger data out of browser key-value stores and to prevent
  telemetry, analytics, push, or background-sync APIs from entering the app shell.
  Latest verification on 2026-08-21 passed with `npm run build` (43 core tests, 76
  root tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Fixed REQ-SYN-05/15/16 publish quorum semantics. Local outbound events now remain
  local when fewer than two relay acknowledgements are received, even if one relay echoes
  them back; already-published events can still confirm from later read-back. Latest
  verification on 2026-08-21 passed with `npm run build` (43 core tests, 78 root tests),
  root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-09/21 incremental fetch planning. Empty local logs still use topic-only
  bootstrap, while populated operated-relay sync now fetches by device author plus stored
  cursor and persists cursor advancement; Nostr remains topic+cursor until the app stores
  a usable per-device Nostr pubkey directory. Latest verification on 2026-08-21 passed
  with `npm run build` (43 core tests, 80 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened REQ-SYN-16 manual fallback promotion. The overdue relay confirmation banner
  now exposes direct Share delta, Export, and Copy link actions instead of passive text.
  Latest verification on 2026-08-21 passed with `npm run build` (43 core tests, 81 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Fixed REQ-SYN-16 timing reactivity. Manual fallback due-state now uses a tested
  10-minute helper and a UI clock updated from the polling interval, so the banner
  appears when time passes without requiring unrelated state changes. Also made the
  expensive REQ-SYN-12 core property test timeout explicit after a harness timeout,
  keeping the same generated cases and shuffle count. Latest verification on
  2026-08-21 passed with `npm run build` (43 core tests, 82 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-PLT-08 operated relay write proof handling. `/api/relay` now requires a
  64-hex write proof, stores only a SHA-256 proof commitment per tag, and rejects later
  writes whose proof does not match the tag commitment before appending ciphertext.
  Latest verification on 2026-08-21 passed with `npm run build` (43 core tests, 84 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-SYN-17 Nostr addressing. Nostr publish and fetch construction now goes
  through tested helpers that require lowercase 64-hex group tags and emit the indexed
  single-letter `t` tag shape for group addressing. Latest verification on 2026-08-21
  passed with `npm run build` (43 core tests, 86 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened REQ-SYN-14 snapshot publication boundaries. Snapshot cadence now uses only
  confirmed raw events, and snapshot `vv`/folded state are built from that confirmed
  subset so snapshots cannot cover local events that have not reached relay read-back.
  Latest verification on 2026-08-21 passed with `npm run build` (43 core tests, 87 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-22 sync-boundary regression coverage. A future-schema relay event is
  retained locally, freezes old fold state, advances the transport vector, and establishes
  relay cursors so it does not become a stable refetch loop. Latest verification on
  2026-08-21 passed with `npm run build` (43 core tests, 88 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-PLT-09 adaptive polling. Runtime config and lifecycle policy now use
  three cadences: active, backoff, then idle after the configured idle threshold; hidden
  tabs and archived groups still suspend polling. Latest verification on 2026-08-21
  passed with `npm run build` (43 core tests, 88 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened REQ-SEC-07 claim surfacing. Claimed participant rows now render tested TOFU
  attribution including claiming device, time, and current balance, and peers can void a
  disputed genesis claim through an append-only `EventVoided`. Latest verification on
  2026-08-21 passed with `npm run build` (43 core tests, 89 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-SEC-02/Q13 device-link artifacts. Device pairing requests now require a
  lowercase 64-hex group tag and lowercase 128-bit hex nonce at both creation and import,
  preserving the signed link payload's replay boundary. Latest verification on 2026-08-21
  passed with `npm run build` (43 core tests, 90 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-SEC-03 claim algorithm fallback coverage. `pickAlg()` now has a regression
  proving devices choose ECDSA P-256 when Ed25519 WebCrypto key generation is unavailable.
  Latest verification on 2026-08-22 passed with `npm run build` (43 core tests, 91 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Tightened REQ-DUR-07 export-prompt policy. The app now selects active export prompts
  through a tested helper so launch/session/time-only state cannot introduce prompt
  reasons outside first-zero and seven-day-unprotected return. Latest verification on
  2026-08-22 passed with `npm run build` (43 core tests, 92 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-DUR-09/10 recovery-screen regression coverage so the offline/join blocking
  screen keeps manual JSON import visible and distinguishes first join from suspected
  storage eviction. Latest verification on 2026-08-22 passed with `npm run build` (43
  core tests, 93 root tests), root `npm audit --json`, protected-string scan, and `git
  diff --check`.
- Tightened REQ-SET-09 contested-confirmation surfacing so invalid `DeviceLinked` or
  `ClaimReattested` delegated keys cannot make a settlement look contested; only
  literal-payee self-claims and authorised delegated keys count. Latest verification on
  2026-08-22 passed with `npm run build` (44 core tests, 93 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Tightened REQ-MON-17 expense correction presentation by carrying the winning
  financial-history index through folded state, so duplicate-value corrections cannot make
  multiple history rows appear active. Latest verification on 2026-08-22 passed with `npm
  run build` (44 core tests, 94 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Tightened REQ-ID-17 transitive marked-distinct contradictions so the anomaly carries
  every merge edge in the path and the UI exposes an undo action for each involved merge,
  not just the first edge. Latest verification on 2026-08-22 passed with `npm run build`
  (45 core tests, 95 root tests), root `npm audit --json`, protected-string scan, and
  `git diff --check`.
- Tightened Phase 4 relay diagnostics display so retryable backoff diagnostics surface the
  concrete retry window instead of generic action copy. Latest verification on
  2026-08-22 passed with `npm run build` (45 core tests, 97 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Tightened REQ-SEC-06 re-attestation status display so non-peer `ClaimReattested` events
  cannot inflate the shown attestation count for an unverified recovered device. Latest
  verification on 2026-08-22 passed with `npm run build` (45 core tests, 98 root tests),
  root `npm audit --json`, protected-string scan, and `git diff --check`.
- Tightened REQ-SEC-01/08 settlement confirmation admission so `SettlementConfirmed.pid`
  must match the literal payee in `SettlementRecorded` before a valid signature can clear
  pending or surface a contested confirmation. Latest verification on 2026-08-22 passed
  with `npm run build` (47 core tests, 98 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Tightened REQ-SEC-06 core re-attestation authority so the claimed-peer majority is
  counted per recovered key/device, not globally across unrelated `ClaimReattested`
  targets for the same participant. Latest verification on 2026-08-22 passed with `npm
  run build` (48 core tests, 98 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added Phase 4 browser verification coverage for real `DeviceLinked` signatures. The
  regression proves an authorised paired second device can confirm settlement while a
  separate unpaired same-participant claim remains contested and pending. Latest
  verification on 2026-08-22 passed with `npm run build` (48 core tests, 99 root tests).
- Added REQ-MON-13 expense display coverage. Ledger rows now use a tested helper that
  orders by the stored local `date`, preserving wall-clock day display even when UTC
  `at` would sort the opposite way. Latest verification on 2026-08-22 passed with
  `npm run build` (48 core tests, 100 root tests).
- Hardened REQ-SEC-09 identity-backup UI. The prompt now warns that the file grants
  impersonation power, and source-level coverage keeps identity backup on download-only
  handlers rather than share-sheet/manual sharing paths. Latest verification on
  2026-08-22 passed with `npm run build` (48 core tests, 101 root tests).
- Hardened REQ-UX-06 sync wording. Topbar/protection labels now come from a tested
  sync-label helper that withholds success-style "ready offline" copy while local or
  published events remain unconfirmed, and prioritizes update-required copy for
  quarantined schema events. Latest verification on 2026-08-22 passed with
  `npm run build` (48 core tests, 104 root tests).
- Hardened REQ-UX-04 empty state. Before participants exist, the People panel now offers
  both primary actions: Add people, which focuses the participant input, and Share trip
  file. Latest verification on 2026-08-22 passed with `npm run build` (48 core tests,
  105 root tests).
- Added REQ-MON-07/REQ-UX-03 currency-onboarding coverage. Currency inference is now
  exposed through a pure helper, and repository coverage proves `ensureGroup()` creates a
  local group immediately with inferred currency and a `GroupCreated` event instead of a
  setup currency step. Latest verification on 2026-08-22 passed with `npm run build`
  (48 core tests, 107 root tests).
- Fixed and pinned REQ-MON-06 split-mode preservation. Equal -> Shares now pre-fills
  one share per included participant instead of rounded minor-unit amounts, and
  amount-to-percentage transitions remain populated through a tested helper. Latest
  verification on 2026-08-22 passed with `npm run build` (48 core tests, 109 root tests).
- Hardened REQ-UX-01 common-case expense flow. The default single payer now prefers this
  device's locally claimed participant when no valid payer is selected, while preserving
  an existing valid manual payer choice. Latest verification on 2026-08-22 passed with
  `npm run build` (48 core tests, 110 root tests).
- Hardened REQ-ID-15/REQ-MON-02/11 expense append eligibility. `addExpense()` now uses
  the same tested command helper as the disabled button state, enforcing local claim,
  non-empty description, and valid amount/share/payer previews before appending. Latest
  verification on 2026-08-22 passed with `npm run build` (48 core tests, 111 root tests).
- Added REQ-SET-02 platform-boundary coverage. Source-level tests now fail if app code
  introduces payment processors or browser payment APIs, keeping settlements as
  append-only ledger records instead of money movement. Latest verification on
  2026-08-22 passed with `npm run build` (48 core tests, 112 root tests).
- Hardened REQ-SET-03 settlement record eligibility. Manual settlement recording now
  shares a tested command helper with the handler, requiring an active, unfrozen,
  positive transfer between different participants before appending `SettlementRecorded`.
  Latest verification on 2026-08-22 passed with `npm run build` (48 core tests, 113
  root tests).
- Hardened REQ-SET-04/09 settlement confirmation eligibility. The Confirm action and
  handler now share a tested command helper requiring an active, unfrozen, pending
  settlement, a local payee identity, and no active payee claim anomaly before signing
  `SettlementConfirmed`. Latest verification on 2026-08-22 passed with `npm run build`
  (48 core tests, 115 root tests).
- Hardened REQ-LIF-04 archive export ordering. Archive now prepares the exact
  `GroupArchived` event first, downloads a ledger export view containing that event, and
  then appends the same event so the automatic archive export reconstructs the archived
  state. Latest verification on 2026-08-22 passed with `npm run build` (48 core tests,
  116 root tests).
- Hardened REQ-MON-08/11/16 expense edit preservation. Editing an expense total now
  uses a tested helper that rescales existing payer and share rows with deterministic
  allocation while preserving the frozen `rate`, instead of collapsing multi-payer or
  multi-currency expenses into a single-payer base-currency shape. Latest verification on
  2026-08-22 passed with `npm run build` (48 core tests, 118 root tests).
- Hardened REQ-MON-10/16 expense edit robustness for zero-value financial rows. The
  edit rescale helper now falls back to equal weights only when all stored payer/share
  rows are zero, preserving row shape and keeping imported zero-total expenses editable
  instead of throwing in allocation. Latest verification on 2026-08-22 passed with `npm
  run build` (48 core tests, 119 root tests).
- Added REQ-SYN-02 relay-boundary coverage. Source-level platform tests now fail if
  direct browser network APIs, Nostr pool calls, or relay adapter construction leak
  outside the relay adapters and sync relay factory. Latest verification on 2026-08-22
  passed with `npm run build` (48 core tests, 121 root tests).
- Added REQ-SYN-04 relay secret-transmission coverage. The sync integration harness now
  records relay writes and proves two live relay targets receive ciphertext, public tag,
  author id, and derived write proof without the raw stored `secretB64`. Latest
  verification on 2026-08-22 passed with `npm run build` (48 core tests, 122 root tests).
- Hardened REQ-SYN-13/REQ-SEC-05 import artifact classification. `parseExport()` now
  accepts only version-1 `TripLedgerExport`, `TripLedgerDelta`, or `DeviceIdentityBackup`
  artifacts, leaving `DeviceLinkRequest` on the separate pairing path and rejecting
  unknown/import-mismatched JSON before fallback import dispatch. Latest verification on
  2026-08-22 passed with `npm run build` (48 core tests, 123 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-13 always-available fallback coverage. A source-level regression now
  proves Link, QR, Share delta, and Export remain in the normal header outside
  `manualFallbackDue`, while the overdue banner still promotes Share delta, Export, and
  Copy link. Latest verification on 2026-08-22 passed with `npm run build` (48 core
  tests, 124 root tests), root `npm audit --json`, protected-string scan, and `git diff
  --check`.
- Hardened REQ-SYN-17 device-local Nostr key handling. Metadata creation now stores a
  64-hex Nostr secret immediately, and `readGroup()` repairs older invalid local metadata
  instead of relying on the relay adapter to rotate it at sync time. Latest verification
  on 2026-08-22 passed with `npm run build` (48 core tests, 125 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-SEC-03 claim verification algorithm handling. Settlement confirmation
  verification now only uses algorithms recovered from key-bearing ledger events and no
  longer falls back to an assumed Ed25519 default. Latest verification on 2026-08-22
  passed with `npm run build` (49 core tests, 125 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-SYN-18 source-boundary coverage. Ledger authorization modules are now
  guarded against importing or inspecting Nostr transport signatures, pubkeys, relay
  classes, or `nostr-tools`; transport signatures remain relay attribution only. Latest
  verification on 2026-08-22 passed with `npm run build` (49 core tests, 126 root tests),
  root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added TDD §3.1/REQ-PLT-08 server-only relay credential coverage. Platform boundary
  tests now fail if Upstash Redis credentials appear in client `src/` or under a
  `VITE_` name, while asserting the operated relay reads them through server-only
  `process.env`. Latest verification on 2026-08-22 passed with `npm run build` (49 core
  tests, 127 root tests), root `npm audit --json`, protected-string scan, and `git diff
  --check`.
- Added REQ-PLT-08 blind-relay source coverage. Platform boundary tests now fail if
  `api/relay.ts` imports core ledger modules, IndexedDB repository code, relay envelope
  crypto, or ledger event/domain types; the operated relay remains an opaque append/read
  store. Latest verification on 2026-08-22 passed with `npm run build` (49 core tests,
  128 root tests), root `npm audit --json`, protected-string scan, and `git diff
  --check`.
- Hardened TDD §3.4 relay runtime limit parsing. `RELAY_MAX_BLOB_BYTES` and
  `RELAY_MAX_FETCH_LIMIT` now fall back to documented defaults when malformed, zero, or
  negative, instead of producing `NaN` relay limits. Latest verification on 2026-08-22
  passed with `npm run build` (49 core tests, 129 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened REQ-MON-08/12 multi-currency schema admission. Core fold now quarantines
  rate-bearing financials that are mislabeled as schema v1 instead of silently accepting
  v2-only `rate` data under a v1 event, and also rejects malformed v2 rate payloads.
  Latest verification on 2026-08-22 passed with `npm run build` (51 core tests, 129 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added Q7 ambient clock-skew warning coverage. The app now compares local time with the
  median HLC wall time of the last 10 peer events and shows a non-blocking warning when
  the difference exceeds 10 minutes, without mutating HLC values. Latest verification on
  2026-08-22 passed with `npm run build` (51 core tests, 132 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Vercel checks on 2026-08-21 show the current `main` production deployment is Ready
  and has the requested aliases attached. Vercel env listing still shows no env vars
  configured, so the operated relay runtime remains unconfigured.
- `vercel build --prod` currently fails locally before project
  code runs with `spawn cmd.exe ENOENT`; `cmd.exe` exists on PATH, so keep this as a
  local CLI runner issue unless reproduced remotely.
