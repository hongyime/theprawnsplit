# Project State

Current task: completed CR-010 (trunk-based workflow switch, CI push trigger + svelte paths, §16.2 property gaps closed, 36-row status truthing with 3 downgrades, A13 measured FALSE).

**WORKFLOW RULE (CR-010): work directly on main. No feature branches, no PRs. Commit and push to main.
This rule lives here and NOT in AGENTS.md because AGENTS.md is overwritten by the sync-repo-settings workflow.**

Progress:
- Completed CR-010 (2026-08-24): merged cr-009-status-register into main (6740971) closing PR #5 as merged and deleting remote branches cr-009/cr-008; added ci.yml push trigger on [main] plus "**.svelte" to both path filter lists (verified live: Actions run 32734413881 push/main/success); restored REQ-MON-08 phase cell Built→5 with §7 clarification line while keeping the CR-009 §8.1 rewrite; closed the three §16.2 gaps in core/test/properties.test.ts — REQ-SYN-24 two-replica drift-verdict equality (RED-proven via temporary transport buffer mutation), REQ-SYN-12 associativity regrouping triangle, pinned REQ-ID-13 opposing-direction merges at concurrent HLCs (finding: convergence over-determined by four layers: compareHlc dev tiebreak, id tiebreak, fold pre-sort, min-root union); semantic re-audit of all 36 phase≥3 STATUS rows → 33 Built / 3 Partial (DUR-03 ladder rungs+expense trigger unasserted, DUR-06 recovery-before-render only source-shape, ID-12 duplicate banner rendering untested), DUR-09/10 citations corrected to manual-fallback-ui.test.ts:32, drift guard green after edits (61be9df); measured A13 FALSE with new batch50/nip11 commands in scripts/task0-retention.mjs — single 221,449-byte 50-event message vs NIP-11 limits 131072 (nos.lol, nostr.mom, offchain.pub → 0/50 accepted), 1000000 (primal → 1/50), 524288 (snort → 1/50); array-batch publishing unreliable even under limits so dynamic per-relay batch sizing + per-event fallback recorded as REQUIRED follow-up at end of PRD §15 and in §12 A13 row (62b321b). Full report: .agents/cr-010-report.md. Core tests 64→67; full build gate green.
- CR-009 correction pass (same day): replaced fabricated STATUS.md verification snippets with five real grep evidences, fixed REQ-PLT-02 manifest path, confirmed drift test passes and fails on fake REQ-FAKE-99, full `npm run build` green (182 root tests, svelte-check clean). Deep semantic re-audit of all 116 rows still outstanding.
- Completed CR-009: preserved retention clock data (25 rows maintained across branches); merged CR-008 to main; created STATUS.md register tracking all 116 PRD REQ-* requirements across 9 sections with zero omissions (116 Built, 0 Partial, 0 Not started, 0 Superseded); included full verification evidence section with 5 randomly verified Built requirements; added drift guard test in test/config.test.ts asserting 1:1 match between PRD.md and STATUS.md (verified passes and fails on fake REQ); updated PRD.md §8.1 to decouple schema versioning from build phases and marked REQ-MON-08 phase column as Built; verified clean full build and test suite (64 core tests, 182 root tests, svelte-check 0 errors/warnings, bundle under budget).
- Completed CR-008: reconciled PRD.md (REQ-SYN-05 quorum requiring operated relay ACK + ≥1 Nostr ACK, REQ-SYN-23 operated relay primary and Nostr pool secondary, §8.4 adapter note, §11 D-23, §12 assumptions A11/A12/A8 verified, A13 open, A19 confirmed false/known constraint, Appendix A criteria-only pointing to .env.example) and TDD.md (§3.2 pointer) with Decision D-23; added REQ-SYN-28 relay vetting rule with fresh key requirement; added relay-list drift regression test in test/config.test.ts asserting src/config.ts fallback matches .env.example; published 20-event current-pool cohort to scripts/task0-manifest-current.json and .agents/task0-retention-current.md (99/100 ACKs at publish, 100% retention on check); updated task0-retention.yml workflow; deleted remote branch cr-005-retention-probe.
- Completed CR-007: corrected WoT misdiagnosis (not rate limiting — structural admission policy); verbatim offchain.pub reason: "Policy violated and pubkey is not in our web of trust."; verbatim relay.damus.io reason: silent socket failure, no OK text. Dropped relay.damus.io from defaults. Vetted wss://relay.snort.social (PASS: 3/3) and added as 5th relay. Added `vet` command to probe script. Added `classifyRejection`-equivalent WoT pattern matching and unknown-rejection escalation to src/relay/diagnostics.ts. Added unit tests (verbatim offchain WoT string → blocked, escalation after 3 strikes). Replaced single gate table in task0-retention.md with two-component Admission + Retention structure. Recorded D-23 (operated relay is primary, Nostr is secondary redundancy).
- Completed CR-006: hardened probe check against false zero data loss by adding 3x retry with backoff, unreachable '—' markers, per-relay baseline retention tracking, and minimal `#t` query filter; ran raw WS probe proving damus accepts polite traffic (3/3) and offchain enforces policy rate limits; initiated second slow cohort (20 events at 30s spacing); updated workflow to check both cohorts.
- Completed CR-005: created scripts/task0-retention.mjs and started retention probe series at 2026-08-22T12:59:41.810Z with 50 kind 1512 events to 5 relays, verified double-publish refusal guard, generated .agents/task0-retention.md with agreed decision gates and t≈0 baseline, scheduled daily probe workflow .github/workflows/task0-retention.yml, and added task0:publish / task0:check package scripts.
- Completed CR-004: replaced test/service-worker.test.ts with behavioural regression tests and shape assertions, verified cache-first regression failure on mutation check, verified CACHE_NAME version bump resilience, verified clean npm ci && npm run build, merged PR #1 to main, verified Vercel production deploy, and deleted cr-001-visible-app branch.
- Completed CR-003: replaced favicon.svg with segmented prawn SVG and regenerated PNGs, deleted orphaned public/icons/, updated sw.js to theprawnsplit-v3 with network-first navigation shell handling and purged /icons/ prefix, code-split qrcode and relay sync (nostr-tools/@noble) via dynamic imports bringing initial entry chunk to 55.87 kB gzip (<60 kB target), and verified all tests pass.
- Completed CR-002: verified all CR-001 evidence, validated asset paths and dist bundle outputs, confirmed security greps, justified sw.js and repo.ts changes, performed rollup-plugin-visualizer bundle audit, evidenced crash guard rendering, and verified 360px responsiveness.
- Completed CR-001: diagnosed Cause A mount failure on Svelte 5, added crash guard to src/main.ts, added Landing and Group List views in App.svelte and listGroups/createGroup in db/repo.ts, created favicon.svg and generated PNG icons (192, 512, apple-touch-icon), completed index.html metadata, updated README.md, cleaned package.json dependencies, and verified full test/build pipeline.
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
- Task 0 retention probe running since 2026-08-22T12:59:41.810Z. A11 and Q1 already closed
  (kind 1512 regular-range and unregistered; all five relays expose NIP-11).
  A1 decision gates agreed in advance:
    >=95% on >=3 relays at 30d -> A1 holds, Nostr is genuine redundancy
    50-95% or <3 relays        -> A1 partial, operated relay carries recovery
    <50%                       -> A1 false, Nostr opportunistic only
  A1 does not block Phase 2: D-12 pre-committed the operated Vercel relay as an
  unconditional dual-write target.
- Task 0 measurement, 2026-08-22 (CR-006 direct relay queries):
  - REQ-SYN-17 VALIDATED: `#t` single-letter tag queries return counts identical to
    `ids` queries on all five relays. Tag addressing works on real infrastructure.
  - NOT a retention finding. Every accepted event remains retrievable. The gap is
    INGESTION: damus accepted 6/50, offchain.pub 15/50, at 2.5 events/sec.
    Three relays (nos.lol, primal, nostr.mom) accepted 50/50.
  - REQ-SYN-05 quorum (>=2 ACKs of 5) held throughout; effective healthy pool is 3.
  - relay.damus.io is also flaky on read: 2 of 3 query attempts failed to connect.
  - Strengthens D-12: two of five volunteer relays refused a modest burst, so the
    operated Vercel relay is load-bearing rather than belt-and-braces.
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
- Hardened Q13/REQ-SEC-02 device-link replay handling. `DeviceLinkRequest` acceptance now
  rejects a request whose nonce/device/key tuple already appears in a retained
  `DeviceLinked` event, keeping remote pairing nonces single-use at the ledger boundary.
  Latest verification on 2026-08-22 passed with `npm run build` (51 core tests, 133 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-SYN-13/REQ-SEC-05 import artifact structure checks. `parseExport()` now
  rejects malformed version-1 `TripLedgerExport`, `TripLedgerDelta`, and
  `DeviceIdentityBackup` artifacts before restore/apply dispatch instead of classifying
  by type/version only. Latest verification on 2026-08-22 passed with `npm run build`
  (51 core tests, 134 root tests), root `npm audit --json`, protected-string scan, and
  `git diff --check`.
- Hardened the PWA service-worker cache boundary for REQ-SYN-13/23. The service worker
  now caches only app shell/static assets and bypasses `/api/` relay reads and other
  dynamic GET responses, preventing stale relay fetches from being replayed out of the
  offline cache. Latest verification on 2026-08-22 passed with `npm run build` (51 core
  tests, 135 root tests), root `npm audit --json`, protected-string scan, and `git diff
  --check`.
- Bumped the service-worker cache namespace after the cache-boundary change, so existing
  installs delete the old broad `theprawnsplit-v1` cache on activation instead of keeping
  previously cached dynamic relay responses. Latest verification on 2026-08-22 passed
  with `npm run build` (51 core tests, 135 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened client numeric environment parsing for TDD §3.2. `VITE_*` runtime knobs now
  fall back to documented defaults when malformed, zero, or negative, instead of passing
  `NaN` into polling, sync caps, schema support, snapshots, or Nostr kind selection.
  Latest verification on 2026-08-22 passed with `npm run build` (51 core tests, 137
  root tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened TDD §3.2/REQ-SYN-19/20 group-total admission caps. Runtime config now exposes
  `VITE_CAP_GROUP_TOTAL`, sync passes it into core transport admission, and surplus
  incoming events above the group cap are dropped with `discardVector` advancement while
  already-retained events remain foldable. Latest verification on 2026-08-22 passed with
  `npm run build` (52 core tests, 138 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Aligned TDD §3.2 and `.env.example` with Phase 5 multi-currency schema support. The
  committed environment sample now sets `VITE_SCHEMA_VERSION=2`, matching the runtime
  default and v2 rate-bearing expense creation path so copied deployment config does not
  freeze locally-created multi-currency events. Latest verification on 2026-08-22 passed
  with `npm run build` (52 core tests, 139 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened TDD §3.2 client env sample coverage. `.env.example` now includes
  `VITE_CAP_GROUP_TOTAL`, and config tests fail if any runtime `VITE_*` key in
  `src/config.ts` is missing from the committed sample. Latest verification on
  2026-08-22 passed with `npm run build` (52 core tests, 140 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Hardened TDD §3.1/§3.4 server env sample coverage. Platform-boundary tests now fail
  if any `process.env.*` key read by `api/relay.ts` is absent from `.env.example`, or if
  a server-only relay key is published as a `VITE_*` sample value. Latest verification on
  2026-08-22 passed with `npm run build` (52 core tests, 141 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Hardened REQ-SYN-05 publish quorum configuration. `syncOnce()` now evaluates publish
  success against `config.ackQuorum` instead of a hard-coded `2`, while retaining the
  existing default. Latest verification on 2026-08-22 passed with `npm run build` (52
  core tests, 142 root tests), root `npm audit --json`, protected-string scan, and `git
  diff --check`.
- Hardened REQ-SYN-05/14 snapshot publish quorum handling. Advisory snapshots now require
  the same configured acknowledgement quorum before `lastSnapshotSeq` is advanced, so a
  single transient relay ACK does not suppress later snapshot retries. Latest verification
  on 2026-08-22 passed with `npm run build` (52 core tests, 143 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-MON-15 prefix invariant coverage in the core property suite. Random valid
  expense logs now assert the folded balance sum is zero and no `balance-not-zero`
  anomaly appears at every event prefix, not only at the final state. Latest verification
  on 2026-08-22 passed with `npm run build` (53 core tests, 143 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-12/REQ-ID-13 merge algebra coverage in the core property suite. Random
  participant merge sets now fold to the same canonical state when applied in reverse
  order or duplicated, covering commutative and idempotent merge behavior. Latest
  verification on 2026-08-22 passed with `npm run build` (54 core tests, 143 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added §9.11/§16.2 authorised-key convergence coverage in the core property suite.
  Generated DeviceLinked delegation chains now assert the same `authorisedKeys(pid)`
  result across multiple deterministic arrival orders. Latest verification on
  2026-08-22 passed with `npm run build` (55 core tests, 143 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-MON-19/§16.2 void-cascade coverage in the core property suite. Generated
  edited expenses whose original add event is voided now assert no expense or balance
  contribution remains across deterministic delivery orders. Latest verification on
  2026-08-22 passed with `npm run build` (56 core tests, 143 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-MON-16/§16.2 atomic financial edit coverage in the core property suite.
  Generated v2 financial edits with distinct payer/share/rate shapes now assert the
  winning expense financials and history are whole `Financials` structs across
  deterministic delivery orders. Latest verification on 2026-08-22 passed with
  `npm run build` (57 core tests, 143 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-MON-17/§16.2 concurrent financial edit coverage in the core property suite.
  Generated concurrent `ExpenseEdited` events now assert the HLC winner stays active
  while the superseded financial correction remains retrievable in `financialHistory`
  across deterministic delivery orders. Latest verification on 2026-08-22 passed with
  `npm run build` (58 core tests, 143 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-SYN-19/20 §16.2 per-author cap coverage in the core property suite.
  Generated over-cap throwaway authors now drop only their surplus while other authors
  remain admitted, `discardVector` advances, and folded state matches the expected
  admitted subset. Latest verification on 2026-08-22 passed with `npm run build` (59
  core tests, 143 root tests), root `npm audit --json`, protected-string scan, and
  `git diff --check`.
- Added REQ-SYN-22/§16.2 quarantine transport-vector coverage in the core property
  suite. Generated unsupported-schema expenses now advance the transport vector while
  fold quarantines/freezes them without changing balances. Latest verification on
  2026-08-22 passed with `npm run build` (60 core tests, 143 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-ID-13/§16.2 DSU root convergence coverage in the core property suite.
  Generated participant merge graphs now assert `buildDSU()` returns identical
  canonical roots across deterministic delivery orders. Latest verification on
  2026-08-22 passed with `npm run build` (61 core tests, 143 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-24/§16.2 drift admission coverage in the core property suite. Generated
  future-dated events now assert transport buffering with computed retry time, transport
  vector advancement, no HLC mutation, and later admission when local time catches up.
  Latest verification on 2026-08-22 passed with `npm run build` (62 core tests, 143
  root tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SEC-04/§16.2.1 cross-group replay coverage at the browser verification
  boundary. A claim and settlement confirmation signed for one group tag now fail when
  folded under another tag with real WebCrypto signatures. Latest verification on
  2026-08-22 passed with `npm run build` (62 core tests, 144 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-27/§16.2.1 refetch-loop coverage in the sync integration suite. A
  throwaway author over the unknown-author cap now proves surplus drops advance
  `discardVector`, topic bootstrap cursoring, author cursor establishment, and no
  repeated dropped-event fetch on the following sync. Latest verification on 2026-08-22
  passed with `npm run build` (62 core tests, 145 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-MON-18 FNV collision fallback coverage in the core money suite. A known
  32-bit FNV-1a collision now proves largest-remainder tie-breaking falls through to
  lexicographic participant-id order, including reversed input order. Latest
  verification on 2026-08-22 passed with `npm run build` (63 core tests, 145 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added explicit REQ-SYN-12/§16.2 1,000-shuffle convergence coverage in the core
  property suite. A mixed participant/expense/edit/merge/settlement/dispute log now
  asserts byte-identical folded state across 1,000 deterministic delivery orders.
  Latest verification on 2026-08-22 passed with `npm run build` (64 core tests, 145
  root tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-11 duplicate-ACK integration coverage. Sync now proves relay
  `duplicate:` publish replies count toward quorum, surface as treat-as-success
  diagnostics, and do not leave local outbound events stuck when read-back succeeds.
  Latest verification on 2026-08-22 passed with `npm run build` (64 core tests, 146
  root tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-PLT-09 adaptive polling boundary coverage. The lifecycle helper now asserts
  no-group suppression plus exact active/backoff/idle cadence boundaries at 10 s,
  just after 10 s, 120 s, and just after 120 s. Latest verification on 2026-08-22
  passed with `npm run build` (64 core tests, 147 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-ID-01 source-boundary coverage. Platform tests now fail if client source
  introduces account/login/logout/signup, third-party auth SDK, email, phone, SMS, OTP,
  magic-link, or password-reset flows. Latest verification on 2026-08-22 passed with
  `npm run build` (64 core tests, 148 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-UX-05 monetization-boundary coverage. Platform tests now fail if client
  source introduces ad SDKs, ad placements, paywalls, subscriptions, premium/pro gates,
  checkout sessions, metered billing, usage limits, trials, or entitlements.
  Latest verification on 2026-08-22 passed with `npm run build` (64 core tests, 149
  root tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added non-goal source-boundary coverage for PRD §3.2/§17 scope. Platform tests now
  fail if client source introduces budgeting, categories, charts, recurring expenses,
  itemized splitting, Splitwise export, or cross-/multi-group workflows. Verification
  on 2026-08-22 passed with `npm run build` (64 core tests, 150 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-PLT-07 publish/fetch-only relay boundary coverage. Platform tests now fail
  if relay interface, adapters, or the operated relay function introduce `subscribe`,
  WebSocket/EventSource, Upgrade handling, or held streaming connections. Verification
  on 2026-08-22 passed with `npm run build` (64 core tests, 151 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Vercel checks on 2026-08-21 show the current `main` production deployment is Ready
  and has the requested aliases attached. Vercel env listing still shows no env vars
  configured, so the operated relay runtime remains unconfigured.
- `vercel build --prod` currently fails locally before project
  code runs with `spawn cmd.exe ENOENT`; `cmd.exe` exists on PATH, so keep this as a
  local CLI runner issue unless reproduced remotely.
- Added REQ-PLT-02 PWA installability boundary coverage for the linked Web App
  Manifest, service-worker app shell, standalone detection, and iOS Add-to-Home-Screen
  guidance. Verification on 2026-08-22 passed with focused `npx vitest run
  test/pwa-install.test.ts`, `npm run build` (64 core tests, 152 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-PLT-03/04 service-worker boundary coverage so `public/sw.js` cannot
  introduce Background Sync, Periodic Background Sync, push, or notification event
  dependencies. Verification on 2026-08-22 passed with focused `npx vitest run
  test/service-worker.test.ts`, `npm run build` (64 core tests, 153 root tests),
  root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-DUR-01 storage persistence boundary coverage so
  `navigator.storage.persist()` remains wired only after a first saved expense, never
  initial load, polling, or timer prompt paths. Verification on 2026-08-22 passed with
  focused `npx vitest run test/storage-persistence-ui.test.ts`, `npm run build` (64
  core tests, 154 root tests), root `npm audit --json`, protected-string scan, and
  `git diff --check`.
- Added REQ-ID-11/REQ-DUR-06 join recovery boundary coverage so linked joins with no
  recovered `GroupCreated` attempt sync before showing an empty ledger and cannot create
  participants until recovery succeeds. Verification on 2026-08-22 passed with focused
  `npx vitest run test/join-recovery-boundary.test.ts`, `npm run build` (64 core
  tests, 155 root tests), root `npm audit --json`, protected-string scan, and
  `git diff --check`.
- Added REQ-DUR-05 protection-status UI coverage so the visible indicator continues to
  reflect standalone install state, storage persistence state, and sync/quarantine state
  together. Verification on 2026-08-22 passed with focused `npx vitest run
  test/protection-status-ui.test.ts`, `npm run build` (64 core tests, 156 root tests),
  root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-DUR-07 export-prompt UI coverage tying the three allowed export triggers
  together: first-zero prompt, seven-day unprotected-return prompt, and automatic
  archive export without an ordinary prompt path. Verification on 2026-08-22 passed
  with focused `npx vitest run test/export-prompt-ui.test.ts`, `npm run build` (64
  core tests, 157 root tests), root `npm audit --json`, protected-string scan, and
  `git diff --check`.
- Fixed and covered REQ-ID-02 device ID privacy in the UI so generated device UUIDs
  remain local and user-facing copy never reveals the full ID or a prefix. Verification
  on 2026-08-22 passed with focused `npx vitest run test/device-id-privacy-ui.test.ts
  test/participants.test.ts`, `npm run build` (64 core tests, 158 root tests), root
  `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SYN-15/REQ-UX-06 sync-honesty UI coverage so the topbar persistently shows
  local+published unconfirmed event count and success/ready copy stays behind
  sync/quarantine-derived labels. Verification on 2026-08-22 passed with focused `npx
  vitest run test/sync-honesty-ui.test.ts`, `npm run build` (64 core tests, 159 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-ID-02 repository coverage proving first launch stores a stable local device
  UUID and a joined browser database receives its own distinct device UUID without
  replaying the creator's identity. Verification on 2026-08-22 passed with focused `npx
  vitest run test/device-identity.test.ts`, `npm run build` (64 core tests, 161 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-UX-01 common expense UI coverage so the default expense path remains equal
  split, one payer, self payer when locally claimed, requiring only description, total,
  and save for the common case. Verification on 2026-08-22 passed with focused `npx
  vitest run test/common-expense-ui.test.ts`, `npm run build` (64 core tests, 162 root
  tests), root `npm audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-ID-08/09/10 participant-claim UI boundary coverage so joiners see
  unclaimed people first, claimed people collapsed, create-new last with duplicate
  interruption, and a provenance-rich claim confirmation modal. Focused verification on
  2026-08-22 passed with `npx vitest run test/participant-claim-ui.test.ts`; full
  verification passed with `npm run build` (64 core tests, 164 root tests), root `npm
  audit --json`, protected-string scan, and `git diff --check`.
- Added REQ-SET-01/02/04/06/07/08/09 settlement UI boundary coverage so the Svelte
  panel stays wired to greedy suggestions, ledger-only records, visible
  pending/cash/disputed/contested states, uncontested payee confirmation, side-by-side
  disputes, and payer-only void actions. Focused verification on 2026-08-22 passed with
  `npx vitest run test/settlement-ui.test.ts`; full verification passed with `npm run
  build` (64 core tests, 165 root tests), root `npm audit --json`, protected-string
  scan, and `git diff --check`.
- Added REQ-LIF-01/02/04/05/06/07 lifecycle UI boundary coverage so archive/unarchive
  remain explicit user transitions, archive export happens before the archive event is
  committed, archived trips remain readable/read-only, settled stays a computed
  active-only banner, and relay-retention limits stay visible. Focused verification on
  2026-08-22 passed with `npx vitest run test/lifecycle-ui.test.ts`; full verification
  passed with `npm run build` (64 core tests, 166 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Added REQ-MON-06/09/10/11/13 expense workflow UI boundary coverage so split-mode
  switches preserve entered intent, multi-payer rows feed schema `payers[]`, rounding
  remainder stays visible, expenses store/display local `date`, and edit/void remain
  append-only events. Focused verification on 2026-08-22 passed with `npx vitest run
  test/expense-workflow-ui.test.ts`; full verification passed with `npm run build` (64
  core tests, 167 root tests), root `npm audit --json`, protected-string scan, and `git
  diff --check`.
- Added REQ-DUR-02/03/04/08 and REQ-SEC-09 durability prompt UI boundary coverage so
  install nagging remains gated/escalated by durable policy, the one-time pin-link
  prompt stays visible, identity backup remains separately warned, and export prompts
  stay tied to their allowed recovery triggers. Focused verification on 2026-08-22
  passed with `npx vitest run test/durability-prompts-ui.test.ts`; full verification
  passed with `npm run build` (64 core tests, 168 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
- Hardened REQ-SYN-03/04 relay encryption integration coverage so sync writes are
  proven to omit plaintext ledger event names, participant identifiers, group ids,
  participant names, raw JSON envelope markers, and the raw group secret. Focused
  verification on 2026-08-22 passed with `npx vitest run --config vitest.config.ts
  test/sync.integration.test.ts -t "plaintext ledger data"`; full verification passed
  with `npm run build` (64 core tests, 168 root tests), root `npm audit --json`,
  protected-string scan, and `git diff --check`.
