# Defect Ledger — Execution Cycle 1

- Phase: **Execution approved** by the user's explicit APPROVE response; policy/access gates B1–B4 remain unresolved.
- Selection: all 49 findings in `AUDIT.md` (18 P1, 25 P2, 6 P3; no P0).
- Requested order: P2 → P1 → P3. Independent P2 work comes first; dependency-bound P2 work follows its P1 prerequisites; structural extraction follows behavioral repairs; dead-code removal is last.
- Source baseline: `e63962f47dc4b38378bed33eadd57b134458411d`, existing branch `maintenance/prawn-ui-20260916`.
- Existing work: modified `.agents/STATE.md` and `.agents/JOURNAL.md`, untracked `AUDIT.md` and `REPO_MAP.md`; preserve all of it.
- Progress: T01–T04 and T06–T08 complete (7/73); next T09. REL-005 and REL-006 fixed in local commits; T05 blocked by NEW-001. No dependencies changed, push/deploy or live mutation performed. Runtime: Node 26.5.0/npm 12.0.2.
- Resume: read this header, `tasks.md` and `execute_state.json`; if approval remains pending, do not execute T01 or later tasks. `design.md` contains the detailed contract decisions.
- Current selected-finding status: 42 Open, 5 Blocked, 2 Fixed locally; one unselected NEW finding Reported. Blocked findings remain selected, not discarded.
- Causes below are the audit's source-grounded hypotheses, not substitutes for each task's fresh pre-scan and reproducer. Stop and ask if a CONFIRMED finding's current source contradicts the audit. Verify SEC-004 before any dependency change.
- New proposed paths are implementation outputs, not claims that files already exist. Record exact generated migration filenames before executing their tasks.

## Shared execution rules

- Every task uses PRE-SCAN → failing regression or characterization → minimum change → validation → one logical commit → ledger/state update.
- Snapshot non-environment files to the named, ignored backup root in `design.md` before changing them. Never read values into this ledger or edit any environment file.
- Tests use new isolated synthetic fixtures and intercepted transports. No production database writes, provider configuration changes, real relay publication, browser-profile reset, data repair or deployment is authorized.
- Failed task: restore only its own uncommitted patch using its immediate pre-task snapshot; preserve earlier fixes and unrelated work; mark Blocked and skip dependent tasks. Never use a repository-wide reset.
- A finding becomes Fixed only when all its acceptance tasks pass. An investigation-only task can finish while its finding stays Open, Blocked or becomes Invalid.
- After each task emit `STATE: Tnn complete | ID Status | next Tnn | n/73 tasks | b blocked`; checkpoint after every third completed task and before pausing.
- Newly discovered defects receive NEW-### and Status: Reported, with evidence, and remain unfixed unless separately selected.

## Policy and access gates

| Gate | Finding | Required decision / evidence |
|---|---|---|
| B1 | SEC-003 | Owner-approved public enrollment/rate/storage budgets and failure policy; no numerical limits are guessed or enabled in production. |
| B2 | SEC-002 | Who cryptographically owns reversal when another person records a shadow participant's payment, and how existing unsigned reversals retain their historical economic effect. |
| B3 | DATA-006 | Authoritative currency for inconsistent existing groups, and approval of a versioned forward-only currency contract. No inference from an old seed or stale GroupCreated event. |
| B4 | REL-008 | Verified read-only hosted schema baseline and confirmed encrypted backup, or an owner-supplied equivalent. Prior SQL attempts returned HTTP 400; retrying them is not an approved migration strategy. |

Plan approval does not resolve B1–B4 implicitly. Their implementation tasks remain blocked until the corresponding decision/evidence is recorded here and in `design.md`.

## SEC-001 — Verify every settlement authority path
- Status: Fixed (T44 + T45 complete)
- Severity: P1
- Root cause: `core/src/fold.ts:253` trusts unsigned device attribution for born-confirmation; `authorisedDevices` can reuse a known public key without validating the individual edge.
- Impact: A holder of group write access can manufacture a trusted-looking settlement without the payee's signature.
- Files: `core/src/identity.ts`, `core/src/fold.ts`, `src/Trip.svelte`, `test/verification.test.ts`, `core/test/identity.test.ts`, `core/test/fold.test.ts`, `test/settlement-ui.test.ts`.
- Fix approach: Admit device authority only through verified edges; remove unsigned born-confirmation; an eligible local payee records a payment plus a separately signed confirmation in one local append operation.
- Verification: Forged device IDs, copied public keys and invalid delegations never confirm; real payee signatures do; legacy bytes remain unchanged and unsigned historical status is explicitly unverified/pending where applicable.
- Blocked by: CONC-001 for reserving the signed event pair; DATA-003 for validated inputs.
- Commit: `27c0b97` (T44 — authorisedDevices edge-validation half only; T45 still pending for the fold.ts bornConfirmed mechanism itself). `authorisedDevices` previously trusted a device association whenever an event's claimPk/newClaimPk happened to already match an authorised key in the FINAL computed set, without re-verifying THAT SPECIFIC event's own signature at all -- an attacker who cannot forge a payee's real signature could still inject a forged ParticipantClaimed/DeviceLinked/ClaimReattested edge COPYING the payee's already-known public key string with a garbage signature, and their own attacker-controlled device would be treated as authorised. Fixed by extracting a shared `authorisedKeyEdges(ordered, pid, ctx)` computation (in `core/src/identity.ts`) that tracks device alongside key at the EXACT point each key is validated (genesis claim, DeviceLinked fixed-point iteration, ClaimReattested majority threshold) -- a device can now only be associated via a signature that genuinely verified during that same computation, never via a post-hoc key-string match. `authorisedKeys` is now a thin wrapper over the same computation, returning just its keys (external behavior fully unchanged, confirmed by all 10 pre-existing tests passing unmodified). `authorisedDevices` derives from the same edges plus a per-event `validSelfClaim` re-check specifically for `ParticipantClaimed` (since, unlike DeviceLinked/ClaimReattested, multiple devices can legitimately share one already-established key via independently-signed reinstall claims -- each such claim must still carry ITS OWN valid signature). Found via direct code-review reasoning after Oracle timed out for a 4th time this session (extensive analysis tracing signature-validation scope through every identity.ts function before landing on the exact gap); proved the hypothesis empirically with a PoC test BEFORE designing the fix, confirming it failed against the actual pre-fix code. 6 new adversarial tests (copied-key attacks via all three edge types; legitimate multi-device-same-key sharing preserved; device-set convergence under shuffled event order, mirroring the existing key-convergence test), all with genuine RED confirmed by temporarily reverting to the exact old buggy logic. Core 126/126 (9 files); svelte-check clean. Scope note: this is a pure core-layer change (`authorisedDevices` has exactly one production caller, `core/src/fold.ts`'s `bornConfirmed` check, already covered by `fold.test.ts`'s existing legitimate-confirmation regression test) -- the UNSIGNED born-confirmation mechanism itself (trusting `event.dev` on a `SettlementRecorded` event against the now-correctly-computed `authorisedDevices` set) remains in fold.ts until T45 replaces it with a genuinely signed confirmation.
- Commit: `b424b13` (T45 — fold.ts unsigned born-confirmation mechanism itself; SEC-001 now FULLY resolved). Removed the `bornConfirmed` shortcut from `SettlementRecorded` handling in `core/src/fold.ts` -- a settlement is confirmed ONLY via an explicit, genuinely signed `SettlementConfirmed` event (`verifyConfirmation`, already correct and unchanged since T44), never merely because the recording event's own `dev` string happens to match one of the payee's authorised devices. This was the OTHER half of SEC-001's root cause: anyone with group write access could set `event.dev` to manufacture a trusted-looking confirmed settlement with zero real signature from the payee. Legacy settlements that were previously born-confirmed under the old shortcut now correctly show pending/unconfirmed on re-fold, per the already-approved legacy-confirmation policy recorded in design.md (no stored event bytes touched, no signatures fabricated, no economic effects changed -- only the derived `confirmed`/`pending` status is repaired). `src/Trip.svelte`'s `recordSettlement`: when this device already holds the payee's OWN local claim identity (via `localIdentityForPid`) with no active claim anomaly (`hasActiveClaimAnomaly`, the same check `confirmSettlement` itself already uses), it now atomically pairs `SettlementRecorded` with a GENUINELY signed `SettlementConfirmed` event in one `commitReserved(2, ...)` call -- reusing the reserved-event-pair pattern already established for `archiveGroup` (T38). This restores the previous "an eligible payee self-recording their own settlement is immediately confirmed" UX, but via an actual signature this time instead of trusting an unsigned device string; the non-eligible path (no local payee identity, or a contested claim) still records the settlement without ever fabricating a confirmation, correctly landing as pending. 3 new/updated `core/test/fold.test.ts` tests, genuine RED confirmed against the pre-fix code (the key adversarial test failed with "received true, expected false" exactly as predicted), plus a new source-shape guard (`test/settlement-self-confirm-ui.test.ts`) pinning Trip.svelte's atomic-pairing wiring. Verified no regression across every settlement/confirmation-touching test file: core 128/128 (9 files), plus 7 app-level files (`settlement-ui.test.ts`'s full real-render mount, `settlement-history`, `verification`, `platform-boundaries`, `sync-pool-lifecycle`, `sync-cycle`, and the new source-shape guard) all pass; svelte-check clean.

## SEC-002 — Define and enforce reversal ownership
- Status: Fixed (T46 + T47 complete)
- Severity: P1
- Root cause: Generic EventVoided bypasses the SettlementVoided recorder check; recorder identity itself is an unsigned string.
- Impact: Unauthorized cancellation can remove an economic effect from the derived ledger.
- Files: `core/src/types.ts`, `core/src/identity.ts`, `core/src/fold.ts`, `src/lib/verification.ts`, `src/lib/settlement-history.ts`, `src/Trip.svelte`, authority/settlement tests.
- Fix approach: Add a versioned, domain-bound signed cancellation contract requiring authorization from any current group member (not signer-only, not admin-only, per owner decision B2); restrict generic void targets to that contract.
- Verification: Neither forged device attribution nor generic void clears a protected settlement; the approved owner can reverse; shadow and legacy cases match the approved policy without event rewriting.
- Blocked by: SEC-001, DATA-003, CONC-001.
- B2 resolution (owner decision, full specification recorded at T46 in design.md §B2): any group member may authorize a settlement reversal -- signer is ANY pid with a non-empty authorisedKeys set (unrestricted to the settlement's own from/to parties, including shadow-payee and third-party-recorder cases), via a domain-bound payload `${groupTag}:void-settlement:${sid}`, with SettlementVoided gaining REQUIRED pid+sig fields (verified the same way SettlementConfirmed already is) rather than trusting the unsigned event.dev string. Legacy EventVoided/SettlementVoided records that predate this authorization requirement are deleted from the relay rather than grandfathered or specially interpreted, since all current relay data is confirmed developer test data (see execute_state.json verification.policy_gates_resolution.live_data_deletion for the deletion evidence); going forward, an old-shaped SettlementVoided (missing pid/sig) simply fails validation and is never silently applied. Implemented at T47 (commit fd99203) -- see below.
- Commit: `fd99203` (T47 — implements the full B2 contract; SEC-002 now FULLY resolved). `core/src/types.ts`'s `SettlementVoided` gains REQUIRED `pid`+`sig` fields; `core/src/event-validation.ts`'s parser requires both, mirroring `SettlementConfirmed` exactly, so an old-shaped event fails validation and never reaches `fold.ts`. `core/src/identity.ts`'s new `verifySettlementVoid(events, sid, pid, sig, ctx)` lets ANY current group member authorize a reversal via the new domain-bound payload, verified against their OWN `authorisedKeys`, with `contestedClaimPids` rejection matching `verifyConfirmation`'s existing pattern. `core/src/fold.ts`'s `settlementVoidDecisions` now calls `verifySettlementVoid` instead of the removed `event.dev === settlement.dev` unsigned device-matching check. Discovered and fixed a MORE SEVERE bug while implementing this finding: the main fold loop's generic `voided.has(event.id)` skip check was NOT exempting `SettlementRecorded`/`SettlementConfirmed`/`SettlementDisputed` -- meaning a bare, UNSIGNED generic `EventVoided` targeting a settlement event's own id could make the settlement vanish from `state.settlements` entirely (never added at all, requiring ZERO signature) -- a strictly worse bypass than the originally-scoped "generic void has no effect" claim in design.md §B2 point 7, which was corrected to document this properly. Fixed by exempting all three settlement-domain event types from that generic skip, and flagging a distinct `generic-void-of-settlement-event` anomaly for any such attempt rather than a silent no-op. `src/lib/settlement-history.ts`'s `canVoidRecordedSettlement`/new `usableVoidAuthorityPid` take a `VerificationContext` plus this device's local pids instead of a bare `deviceId`. `src/Trip.svelte`'s `voidSettlement` signs the domain-bound payload with whichever local claim identity qualifies, building `SettlementVoided{sid,pid,sig}`; both the action guard and the rendered Void-button guard share the identical any-member authority check. 5 new/updated `core/test/fold.test.ts` cases plus a rewritten `test/settlement-history.test.ts` unit suite, all with genuine RED confirmed against the pre-fix code. Fixed `test/settlement-ui.test.ts`'s existing full real-render test, which broke under the new (correct) authority model since its scenario had no claimed participant at all -- added a genuine claimed local identity for bob so the Void button's presence reflects legitimate signed authority rather than the removed device-string coincidence. Added `test/settlement-void-authority-ui.test.ts` source-shape guard. Core 131/131 (9 files); broad app regression across 15 files/119 tests (`--no-file-parallelism`) pass, including `settlement-ui.test.ts`'s full `fireEvent`/`waitFor` mounted-App render; svelte-check clean.

## SEC-003 — Bound public relay resource admission
- Status: Fixed
- Severity: P2
- Root cause: A first proof claims an arbitrary tag; the handler has no shared enrollment/rate/total-capacity reservation.
- Impact: Public callers can consume shared relay storage and request capacity without a global application budget.
- Files: `api/relay.ts`, `server/relay-admission.ts`, `scripts/relay-migration.mjs`, `test/relay-api.test.ts`, `test/relay-admission.test.ts`, `test/relay-admission-upstash.test.ts`, `test/maintenance/relay-migration.test.mjs`.
- Fix approach: Validate bounded request bytes before parsing and reserve the owner-approved budgets atomically across instances (B1: max 20 enrollments/group, max 50 groups/author key, 5 events/sec/group rate limit, 5,000,000 bytes/group storage budget); keep admission metadata limited to group tag, event count, created_at min/max and schema/proof version, compatible with encrypted source export/parity.
- Verification: Parallel requests cannot exceed the approved reservation; rejection claims no proof/cursor and removes no history; metadata is preserved or explicitly separated under the approved export contract.
- Blocked by: None. No process-local counter or fail-closed zero default is accepted as a silent production policy change.
- B1 resolution (owner asked Sisyphus to suggest defaults, given the whole stack sits on free tiers across Vercel/Upstash/Supabase): max 20 enrollments per group, max 50 groups per author key, rate limit 5 events/sec per group, storage budget 5,000,000 bytes (5MB) per group, export metadata limited to group tag/event count/created_at range/schema version (no new plaintext beyond what the encrypted envelope already exposes). Failure semantics (owner-approved): a request that would exceed any budget is rejected with HTTP 429 and a `Retry-After` header hinting a backoff window; the rejection claims no proof/cursor and mutates no history — it is a pure read-then-deny, never a partial write.
- Commit (T24): `2caa4a926aefcb6d2bf2abb90fbc47a9f4daf90b`. reserveAdmission() atomically enforces all four budgets (enrollment/group caps via a Lua-EVAL-backed reserveSetSlot primitive — plain SADD-then-SCARD was proven race-unsafe by a concurrency unit test; rate/storage via race-free INCRBY). Wired into api/relay.ts's Upstash path before verifyRelayWriteProof. scripts/relay-migration.mjs filters `ad:`-prefixed admission keys out of its SCAN so they're recognized/skipped, never exported. 18 new tests; full `npx vitest run` 366/366 pass.

## SEC-004 — Verify and update advisory-affected dependencies
- Status: Blocked
- Severity: P2
- Root cause: The lockfile contains devalue 5.9.1 and sharp 0.33.5, which the audit associated with published advisories.
- Impact: Affected code is installed; production exploitability remains unproven and must not be inferred from package presence alone.
- Files: `package.json`, `package-lock.json`; `core/package.json` and `core/package-lock.json` only if the verified dependency chain requires them; targeted maintenance/build tests.
- Fix approach: First verify package/version/advisory matches, runtime versus tooling reachability and parent ranges. If real, use the verified fixed candidates in `design.md`; if falsified, mark Invalid with evidence and make no dependency change.
- Verification: Reproduced dependency graph and advisory assessment, resolved fixed versions where changed, compatible Node/module loading, icon-tool fixture and affected tests; no unselected dependency churn.
- Blocked by: NEW-001 prevents the required complete compatibility validation for the pre-1.0 sharp upgrade; T05 made no dependency changes.
- Verification result (T04): `npm ls sharp devalue svelte --all --json` confirms installed sharp 0.33.5 and svelte 5.56.10 → devalue 5.9.1; `package-lock.json:3609` allows devalue ^5.8.1, including candidate 5.9.2. Fresh OSV records confirm the affected-version matches. sharp 0.35 requires Node >=20.9.0 and provides Windows x64 binaries; registry candidates/licenses were verified in design.md. The finding is a real affected-version issue; production exploitability is still not demonstrated (the icon tool consumes a fixed SVG and the client has no established untrusted devalue.parse path).

## DATA-001 — Make full import non-destructive
- Status: Fixed
- Severity: P1
- Root cause: `replaceFromExport` deletes all same-ID event rows before inserting the imported snapshot.
- Impact: Importing an older file can erase newer local history and metadata.
- Files: `src/db/repo.ts`, `test/import-preservation.test.ts`.
- Fix approach: Match a validated tag before local ID, reject ambiguous collisions, union absent events into an existing group, and retain its identity, secret, outbox, cursor and metadata; create an isolated local group when no match exists.
- Verification: A+B imported with A retains both records and all local keys/status; repeat import is idempotent; same local ID with a different tag changes neither group.
- Commit: `f3a6e6cec0545cfb437494bd3bdc9edb49bb89bd`. Matches by tagHex, unions via upsertRemoteEvents (DATA-005 reuse), refuses groupId collisions against a different trip's tag, preserves existing secret/deviceId/meta. 6 new tests; tsc clean.

## DATA-002 — Preserve linked versus offline import state
- Status: Fixed
- Severity: P1
- Root cause: Full import generates a new secret while retaining the source tag.
- Impact: The imported group cannot decrypt or authenticate against the original relay and can reject its original join link.
- Files: `src/db/repo.ts`, `src/relay/sync.ts`, `src/Trip.svelte`, `test/import-linkage.test.ts`, `test/join-link-guard-ui.test.ts`.
- Fix approach: Existing valid links retain their secret; a new keyless import is explicitly unlinked/offline. A verified matching seed can attach to an unlinked group; no random secret is fabricated for an old tag and no existing mismatched secret is silently replaced.
- Verification: Seeded restore retains tag/key/proof continuity; seedless restore remains readable/exportable without relay publication or a fabricated QR; attaching a verified seed preserves every event and identity.
- Commit: `2dbcd05af9f353d326ae6494463e6c23d60f77be`. `linked`/`sourceTagHex` fields on `StoredGroup`; no-match import derives tagHex from its own fresh secret; `attachVerifiedSeed` independently re-derives and verifies before linking; sync.ts/Trip.svelte guard publish/QR/copy-link for unlinked groups. 9 new tests; 56/56 targeted regression pass.

## DATA-003 — Parse full event and identity artifacts before writes
- Status: Fixed
- Severity: P1
- Root cause: Import checks inspect only base fields and record-shaped JWKs, not each event variant or the actual keypair relationship.
- Impact: Invalid events can make a stored group unreadable; bad backups can overwrite usable identity material.
- Files: `src/db/repo.ts`, `core/src/event-validation.ts`, `src/lib/identity-backup-validation.ts`, `core/src/index.ts`, `core/test/event-validation.test.ts`, `test/identity-backup-validation.test.ts`, `test/export-security.test.ts`.
- Fix approach: Parse known variants, finite/safe clock counters, money rows and references before persistence; asynchronously validate candidate keypairs outside transactions, then recheck target identity in the write transaction. Preserve future-version raw payloads under quarantine rather than coercing or discarding them.
- Verification: Missing financials, malformed money, unsafe counters, mismatched JWK/public key/private key and wrong-group input cause zero active-store writes; opaque future events round-trip and freeze projection.
- Blocked by: None after plan approval and baseline preservation.
- Commit: `67d6c9a0ecdaa5da34b1e99792832978b9e67942`. Full per-variant runtime parser for the 20-member Event union in core/src/event-validation.ts (dependency-free, hand-written); assertImportEvents in src/db/repo.ts delegates to it. validateIdentityKeypair in src/lib/identity-backup-validation.ts proves JWK import + claimPk match + sign/verify correspondence, wired into restoreIdentityBackup with async-outside/recheck-inside-transaction ordering. 33 new tests total; core 105/105, app 380/380 pass; tsc/svelte-check clean.

## DATA-004 — Classify introduced authors before budgeting
- Status: Fixed
- Severity: P1
- Root cause: Admission computes known authors only from the pre-batch ledger.
- Impact: A new receiver can discard valid later events in the same author's bootstrap batch.
- Files: `core/src/transport.ts`, `core/test/transport.test.ts`.
- Fix approach: Establish eligible authors from validated batch context without trusting malformed markers; preserve a recoverable checkpoint when admission cannot safely finish the page.
- Verification: Marker placement/permutation does not change retained legitimate history; actual cap overflow remains bounded; another author continues; retries make progress without silent omission.
- Commit: `9f801bf`. `known` authors are now computed from BOTH the pre-batch ledger (`current`) AND well-formed (finite-HLC) events within the SAME `incoming` batch, so a brand-new author's own marker (`ParticipantAdded`/`ParticipantClaimed`) anywhere in their bootstrap batch — regardless of array position — correctly grants `capKnownAuthor` to every one of their events in that pass, not just the ones after the marker. A marker event with a malformed (non-finite) HLC is excluded from this scan (`hasFiniteHlc` filter, shared with the existing malformed-drop check) so a marker that will itself be dropped can never be trusted to elevate its author's cap. **Scope note (important course-correction):** an initial draft ALSO changed `src/relay/sync.ts` to hold back the relay read cursor whenever ANY event was dropped for a cap reason (mirroring `migrated-sync.ts`'s existing `safeCheckpoint` gate) — this was found, via a pre-existing test in `test/sync.integration.test.ts` ("stops refetching surplus events after drop vectors and the topic cursor advance"), to directly contradict `sync.ts`'s deliberate, already-shipped design: genuine cap overflow is INTENDED to advance the cursor and rely on the discardVector high-water mark for idempotent dedup, never retried (a designed "bounded, not stuck forever" outcome for the routine incremental-polling path — distinct from `migrated-sync.ts`'s historical-recovery-scan context, which has different stakes). That change (plus its now-incorrect test) was fully reverted before this commit; DATA-004's actual fix is transport.ts-only. Verified via `git diff` showing zero changes outside `core/`. 2 new core tests (RED confirmed via the tests failing against the pre-fix code, then passing after); full core suite 113/113; broader sync-path regression (sync.integration/operated-sync-recovery/sync-cycle/sync-batch-mitigation/supabase-device-catchup) 53/53 pass, including the pre-existing test that caught the incorrect draft.
- Blocked by: DATA-003 and DATA-005.

## DATA-005 — Detect duplicate-ID content conflicts everywhere
- Status: Fixed
- Severity: P1
- Root cause: Remote/delta inserts skip existing IDs without comparing content; legacy confirmation counts only IDs.
- Impact: Opposite arrival orders can permanently disagree while claiming confirmation.
- Files: `src/db/repo.ts`, `src/relay/sync.ts`, `src/relay/migrated-sync.ts`, `src/lib/event-fingerprint.ts`, `test/event-identity-conflict.test.ts`, `test/sync.integration.test.ts`, `test/recovery-fingerprint.test.ts`, `test/supabase-device-catchup.test.ts`.
- Fix approach: Share the existing canonical fingerprint behavior across callers; compare existing and incoming payloads before insertion or confirmation; reject the conflicting batch transaction and retain the supplied input/checkpoint for explicit reconciliation.
- Verification: Opposite-order same-ID variants produce an explicit conflict and no overwrite/false receipt; exact repeats are idempotent; bigint and own-property spellings remain represented correctly.
- Blocked by: DATA-003. No arbitrary winner or additional live repair is authorized.
- Commit: `72882f332f47b8dd24fa90edfa203241116c3031`. eventFingerprint() shared via src/lib/event-fingerprint.ts. upsertRemoteEvents does read-only conflict resolution before any write, throwing EventIdentityConflictError on disagreement (whole batch rejected, no rollback needed since nothing was written yet). sync.ts's readback confirmation fingerprint-compares before counting. 8 new tests; 388/388 pass.

## DATA-006 — Establish a shared base-currency contract
- Status: Fixed
- Severity: P1
- Root cause: Base currency is edited only in device-local group metadata after a GroupCreated event and link may already exist.
- Impact: Peers can assign different monetary meaning to the same integer amounts.
- Files: `core/src/types.ts`, event validation/projection, `src/db/repo.ts`, `src/Trip.svelte`, join/export and multicurrency tests; exact protocol-support sites recorded before implementation.
- Fix approach: Encode the authoritative base-currency decision in versioned replicated data and freeze it before monetary entry, for all future groups. Existing inconsistent legacy groups are deleted rather than relabelled (owner decision B3, same test-data basis as B2); no legacy-interpretation branch is needed in the fix.
- Verification: Devices opening earlier/later seeds agree on the approved base currency; attempts to reinterpret existing amounts fail without writes; unsupported peers retain/quarantine the new contract.
- Blocked by: DATA-003, DATA-001 and DATA-002.
- B3 resolution (owner decision): legacy groups with currency inconsistency are deleted rather than reconciled, since all current relay data is confirmed developer test data. Deletion evidence: execute_state.json verification.policy_gates_resolution.live_data_deletion. Forward base-currency contract: a new replicated `BaseCurrencyEstablished` event lets any device correct the group's base currency any time before the first `ExpenseAdded` event exists for the group; once folded, the earliest-by-HLC valid correction (or `GroupCreated.currency` if none exists) becomes permanent — any later attempt (including a second device's concurrent, unsynced correction) is quarantined as a conflicting anomaly, never silently applied or reconciled. `setCurrency` in Trip.svelte must emit this event (via appendEvents) instead of a silent local-only `saveGroup` mutation, and its UI control must disable once any `ExpenseAdded` exists for the group. Not yet implemented; scheduled at T33 in the normal task queue (T32 records this design; T33 implements it).
- Commit: `633436f`. `core/src/types.ts` adds `BaseCurrencyEstablished` event + `State.currency`. `core/src/event-validation.ts` adds its variant parser. `core/src/fold.ts` resolves the authoritative currency: `GroupCreated.currency` is the default; the earliest-by-HLC valid `BaseCurrencyEstablished` (not voided) before the first `ExpenseAdded` wins; anything later, or any additional correction beyond the first accepted one, is quarantined. `src/Trip.svelte`'s `setCurrency` now emits this event via `commit`/`appendEvents` instead of a silent local-only `saveGroup` mutation, gated on `expenses.length === 0`; the Main Currency select disables on the same boundary; all money-critical display/math read sites (balances, expense amounts, settlements, exchange-rate check, share preview) now read the fold-derived `currency` instead of the local `group.currency` cache, so a synced correction from another device converges everywhere. 6 new core tests (5 fold + 1 event-validation) with RED confirmed via temporary revert; 3 new source-shape guard tests (test/currency-freeze-guard-ui.test.ts) matching this codebase's established convention. Full core suite 111/111; targeted app regression across 18+ files (UI/sync/import/reconciliation) all pass; svelte-check clean.

## DATA-007 — Separate durable coverage from transport progress
- Status: Fixed (T42 + T43 complete)
- Severity: P1
- Root cause: Append stamps transport progress into vectors later interpreted as possession, including buffered/dropped counters.
- Impact: The UI can claim all devices have an event that a peer never retained.
- Files: `src/db/repo.ts`, `core/src/types.ts`, event validation, `src/lib/sync-coverage.ts`, both sync paths, coverage/transport tests.
- Fix approach: Preserve legacy transport/discard vectors for fetch progress; add bounded exact durable coverage metadata with explicit gaps and event identity checks. New UI treats legacy vector-only evidence as unknown, not receipt proof.
- Verification: Dropped, future-buffered, conflicted and reserved-but-unused IDs never imply possession; genuinely retained later events can be acknowledged without pretending missing counters exist.
- Blocked by: DATA-003, DATA-005, CONC-001, CONC-002 and INTR-001.
- Commit: `59ba54c` (T42 — metadata/type layer only; T43 wires both sync paths + `sync-coverage.ts`/UI, not yet done). New `CoverageIntervals = [number, number][]` type and pure `mergeCoverageCounter(existing, counter)` helper in `src/db/repo.ts`: inserts a single counter into a sorted, non-overlapping interval list, merging adjacent/overlapping runs and re-coalescing after a bridging insert (e.g. inserting 3 into `[[1,2],[4,5]]` yields `[[1,5]]`), so a genuine hole (a later counter admitted while an earlier one was dropped/buffered/never seen) is represented as a SEPARATE interval instead of being silently absorbed into a single running maximum the way `versionVector` does today. New `StoredMeta.coverage?: Record<string, CoverageIntervals>` field (absent means legacy/unknown, never full coverage — the conservative default T43's UI will rely on). Wired into the two paths that durably admit an event into the `events` store: `appendReservedEvents` (local delivery) merges the stamped event's own counter into `meta.coverage[stamped.dev]` immediately after its `add()` succeeds; `promoteLedger` (remote admission) merges each `input.admitted` event's counter into `meta.coverage[event.dev]` immediately after its `put()` — in both cases ONLY events that actually land in the `events` store earn credit; a buffered, re-buffered, fingerprint-conflicted, or collision-rejected event never reaches this line (proven by dedicated tests: re-buffering an event via `promoteLedger`'s `newlyBuffered` leaves `coverage` undefined for that device; a `add()` collision in `appendReservedEvents` leaves the rejected counter's device coverage exactly as it was before the attempt; a transaction that aborts mid-insertion via `IDBObjectStore.prototype.put` fault injection leaves `coverage` untouched, matching the existing INTR-001 all-or-nothing guarantee). 9 new tests total (6 pure-function in `test/coverage-intervals.test.ts`, 2 in `test/event-reservation.test.ts`, 3 in `test/ledger-promotion.test.ts`), 3 with genuine RED confirmed via temporary reverts (the pure function's interval-bridging coalesce step, and the positive-case coverage line in both `appendReservedEvents` and `promoteLedger`). Scope note: `resolveIncomingEventConflicts`'s fingerprint-conflict-dropped events, `src/lib/sync-coverage.ts`'s `isEventCoveredByEveryKnownDevice`, and the Trip.svelte "Everyone Has This" label are all UNCHANGED and still versionVector-based — T43 consumes this new metadata there. Broad regression: core 113/113; targeted app regression across 26 files/143 tests (`--no-file-parallelism` for a clean signal, since this session's tooling intermittently produces false-timeout flakiness under concurrent vitest processes — confirmed via isolated re-run and `git stash` bisection that two apparent timeouts were pre-existing environment contention, not caused by this change) all pass; svelte-check clean.
- Commit: `e34798b` (T43 — DATA-007 now FULLY resolved). `core/src/types.ts` gained `BaseEvent.coverage?: Record<string, CoverageIntervals>` (optional, parallel to and independent of the existing `vv` field, unsigned/advisory exactly like `vv`). `core/src/event-validation.ts`'s new `parseCoverage`/`parseCoverageIntervals` mirror `parseVv`'s exact shape-only validation philosophy (rejects malformed tuples, never validates cross-tuple sortedness/non-overlap -- a linear containment scan is correct regardless of order). `CoverageIntervals`/`mergeCoverageCounter` moved from `src/db/repo.ts` into `core/src/transport.ts` since coverage is now part of the Event wire format, not just app-side storage bookkeeping -- both the stamping producer and the consuming validator/UI need the identical shape. `withVersionVector` (`src/db/repo.ts`) gained an optional 3rd `coverage` parameter, stamping it onto outgoing events alongside `vv`; `appendReservedEvents` now computes the self-inclusive coverage snapshot (including the event's own just-admitted counter) BEFORE stamping/storing, so the outgoing event's own `.coverage` field never lags one event behind, and only commits it to `meta.coverage` after the `add()` actually succeeds. `src/lib/sync-coverage.ts`'s `isEventCoveredByEveryKnownDevice` changed from a boolean `vv`-only check to a tri-state (`covered`/`not-covered`/`unknown`) driven by each known device's LATEST-by-HLC event's own `.coverage` evidence -- a device with no `.coverage` field at all (an old-format event or an already-open old client bundle) contributes `unknown`, never a false `covered`; a confirmed gap (`not-covered`) always outranks `unknown` when mixed. `src/Trip.svelte`'s `expenseCoverageLabel` maps the tri-state to `Everyone Has This` / `Not Yet On Every Known Device` / `Coverage Unknown` -- the literal fix for this finding's exact bug (never claiming everyone-has-this from legacy vector-only evidence). Scope note: both sync paths (`src/relay/sync.ts`, `migrated-sync.ts`) needed NO code changes -- verified the encrypt/publish round-trip (`encryptEvents` -> `eventEnvelope` -> `encryptJson`/`JSON.stringify`; decrypt -> `JSON.parse` with only a bigint reviver) does no field whitelisting/stripping anywhere, so the new field transparently round-trips through the existing fetch/publish flow for free, satisfying "old/new metadata round-trips preserve compatibility" without any producer/consumer-side sync-path work. 9 new/updated tests across core and app layers (moved the 6 pure `mergeCoverageCounter` tests from the deleted `test/coverage-intervals.test.ts` into `core/test/transport.test.ts`; added `core/test/event-validation.test.ts` coverage-field parse cases, an `appendReservedEvents` stamping test, and a full rewrite of `test/sync-coverage.test.ts` for the tri-state contract plus a new `test/coverage-label-ui.test.ts` source-shape guard), multiple genuine RED confirmations via temporary revert (coverage field parsing, the stamping wiring, and -- the actual DATA-007 bug behavior itself -- `isEventCoveredByEveryKnownDevice` returning a false `covered` when legacy-absent evidence was silently treated as satisfied). Core 121/121; targeted app regression across 27 files/146 tests (`--no-file-parallelism`) pass; svelte-check clean.

## CONC-001 — Reserve event identity atomically
- Status: Fixed
- Severity: P1
- Root cause: UI factories copy a stale nextCounter; event insertion uses overwrite semantics.
- Impact: Concurrent tabs or asynchronous actions can replace an earlier different event.
- Files: `src/db/repo.ts`, `src/lib/events.ts`, every event-producing path in `src/Trip.svelte`, allocator/concurrency/UI tests.
- Fix approach: Reserve unique counter ranges transactionally, construct/sign outside IndexedDB, then insert with collision checks and a stable command reservation; update all command callers. Unused reservations may leave gaps but never represent delivered events.
- Verification: Concurrent signed/unsigned commands retain distinct bodies and IDs; retries of the same command do not duplicate it; competing content is rejected; counter advancement never regresses.
- Blocked by: DATA-003, DATA-005 and CONC-002.
- Commit: `6df66ab` (T38 — completes this finding). Every event-producing function in `src/Trip.svelte` (19 call sites: addParticipant, completeSetup, claimParticipant, requestDeviceLink/acceptDeviceLinkRequest, mergeParticipants, markParticipantsDistinct, deactivateParticipant, voidEvent, reattestClaim, addExpense, voidExpense, editExpense, recordSettlement, confirmSettlement, disputeSettlement, voidSettlement, archiveGroup, unarchiveGroup, setCurrency) now routes through a new `commitReserved(count, build)` helper that replaces the old `factory()`/`commit()` pair: reserves counters atomically via `reserveEventIds` first, builds/signs the event(s) using the reservation OUTSIDE any transaction (so async signing work like `signClaim` never holds a transaction open), then inserts via `appendReservedEvents` (collision-safe). The old `factory()`/`commit()`/`appendEvents` import is fully removed from Trip.svelte — no old direct allocation path remains. `archiveGroup` needed special handling: `plan.actions` is a fixed 2-tuple (`["download-export", "append-archive-event"]`, always both present, in order) so the commit happens exactly once per invocation; reservation/build now happens once before the loop, with the actual `appendReservedEvents` call only in the non-download branch. Caught and fixed a self-inflicted bug during this task: an earlier import-statement edit left the OLD `db/repo` import members duplicated below the NEW ones (missing an `end` anchor on a multi-line replace), causing 20+ svelte-check parse errors — caught immediately by running svelte-check right after the edit, fixed by deleting the duplicate block. Updated 4 pre-existing source-shape tests that pinned the OLD literal code pattern (`await commit([event], f)`, `const event = makeEvent(...)`, `f.nextCounter`) to match the NEW `commitReserved`/`reservation.counters[0]` shape — these were expected, intentional updates (the whole point of T38 is changing that source shape), not regressions. Broad regression across 21 files / 54 tests pass (UI boundary tests, currency/claim/device-identity/settlement/archive/sync/verification/multi-trip flows); svelte-check clean.
- Commit: `b435a84` (T37 — allocator only; T38 migrates callers, not yet done). Added `reserveEventIds(groupId, commandId, count)` (opens one `database.transaction("groups", "readwrite")`, returns a retry-stable counter range — a repeated call with the SAME commandId returns the SAME counters instead of advancing `nextCounter` again) and `appendReservedEvents(groupId, commandId, events)` (uses `add()`, not `put()`, so a genuine id collision throws instead of silently overwriting; clears the delivered command's reservation entry). New `StoredGroup.reservations?: Record<string, number[]>` field tracks in-flight command→counter-range mappings; an abandoned reservation is deliberately never garbage-collected (a permanent gap, per this finding's own tolerance). The OLD `factory()`/`commit()`/`appendEvents()` path in Trip.svelte is UNCHANGED and still vulnerable — this finding is not fully closed until T38 migrates every caller to the new allocator. 4 new tests in `test/event-reservation.test.ts`, 2 with genuine RED confirmed via temporary revert (concurrent-reservation non-overlap is proven structurally; the collision-rejection test was confirmed to fail — silently overwriting the earlier event's content — when temporarily reverted to `put()`). Also fixed an unhandled-rejection code-quality issue found during testing: a failed `add()` aborts the whole IndexedDB transaction, and `tx.done` separately rejects with that abort — wrapped in try/catch that awaits-and-swallows `tx.done`'s rejection before rethrowing the original, more specific error. Broad regression 6 files/23 tests pass; svelte-check clean.

## CONC-002 — Merge metadata against the latest row
- Status: Fixed
- Severity: P1
- Root cause: Several metadata writers use separate get/put operations despite other callers using a transactional callback.
- Impact: Intervening vectors, cursors, settings or durability acknowledgements can disappear.
- Files: `src/db/repo.ts`, `test/sync-state.test.ts`, `test/relay-settings.test.ts`, proposed `test/metadata-interleaving.test.ts`.
- Fix approach: Convert normalization, vector and snapshot updates to field-scoped transactional merges; review every full-record metadata writer without unrelated refactoring.
- Verification: Deterministic interleavings preserve unrelated fields and monotonic progress; normalization does not overwrite newly committed settings or key material.
- Blocked by: None.
- Commit: `583ba63`. Three metadata writers in `src/db/repo.ts` — `ensureMeta` (normalization), `updateTransportVectors` (vector merge), `markSnapshotPublished` (snapshot seq) — did a bare `database.get("meta", ...)` followed by a LATER, separate `database.put("meta", ...)`, unlike `updateMeta`'s existing single-transaction read-modify-write. All three now open one `database.transaction("meta", "readwrite")` and do their get+merge+put within it (matching `updateMeta`'s pattern), closing the race window entirely — IndexedDB serializes readwrite transactions on the same store, so a concurrent writer's complete transaction can no longer land in a gap that no longer exists. Reviewed the fourth full-record writer, `saveMeta` (bare put, no get at all) — confirmed it has zero callers anywhere in the codebase (dead code); left unchanged per "without unrelated refactoring" since fixing unused code doesn't reduce any actual risk. 3 new tests in `test/metadata-interleaving.test.ts`: 2 with genuine RED confirmed via a reliable, simple kick-off-then-interleave pattern (no spy/mock needed — fake-indexeddb's natural async timing reproduced the race consistently for `updateTransportVectors`/`markSnapshotPublished`); the third (`ensureMeta` via `readGroup`) documents that the SAME simple technique isn't reliably reproducible through that specific call chain (several unrelated async steps precede its own get/put, letting a concurrent write consistently finish first in practice) — its atomicity fix is verified by code-level reasoning (identical transaction pattern) plus the existing `test/sync-state.test.ts` nostrSk-repair regression test, which still passes. Full core suite unaffected (repo.ts is app-only); broad app regression across 15 test files / 80+ tests pass; svelte-check clean.

## CONC-003 — Insert or reuse one claim key
- Status: Fixed
- Severity: P1
- Root cause: Missing-identity lookup and asynchronous key generation precede an unconditional put.
- Impact: Another generated key can replace the key associated with a concurrent claim.
- Files: `src/db/repo.ts`, `test/device-identity.test.ts`, `test/verification.test.ts`.
- Fix approach: Generate a candidate outside IndexedDB, then recheck and insert-or-return the existing identity in one transaction; sign only with the returned persisted identity.
- Verification: Concurrent requests return the same persisted keypair; generated discarded candidates never produce claim events; existing backups/identities remain unchanged.
- Blocked by: DATA-003 identity validation for backup races.
- Commit: `10ec5ce`. `ensureClaimIdentity` in src/db/repo.ts now mints the candidate claim key via `mintClaimKey()` BEFORE opening any IndexedDB transaction (real crypto.subtle work must never happen inside a held-open transaction — same principle as `ensureGroup`'s own existing comment), then opens ONE `database.transaction("identity", "readwrite")` to recheck-and-insert-or-return: if another concurrent caller already won and persisted an identity for this pid, THIS caller's freshly-minted candidate is discarded and the WINNER's identity is returned instead; otherwise the candidate is persisted and returned. Every existing caller (3 in Trip.svelte) already signs claims using the RETURNED identity object, not a locally-held candidate, so no caller-side changes were needed — the atomicity fix alone guarantees signing and storage never disagree. 1 new test with genuine RED confirmed reliably via `Promise.all` on two concurrent calls (mintClaimKey's real async crypto.subtle work provides a natural, consistently-reproducible race window, no interleaving trickery needed): before the fix, concurrent calls returned two DIFFERENT keypairs; after, both return the identical persisted identity and exactly one row exists in storage. Broad regression across 7 files / 40 tests pass; svelte-check clean.

## INTR-001 — Promote buffered events in one transaction
- Status: Fixed
- Severity: P1
- Root cause: Buffer removal commits before event insertion and related metadata.
- Impact: A crash can remove the only retained copy behind an advanced relay cursor.
- Files: `src/db/repo.ts`, `src/relay/sync.ts`, `src/relay/migrated-sync.ts`, sync/recovery transaction tests.
- Fix approach: Introduce one ledger transaction for admitted rows, promoted-buffer removal and relevant vector/cursor changes; route both synchronization paths through it.
- Verification: Fault injection at each write/commit boundary leaves each event buffered or admitted, never neither; failed promotion retains the page checkpoint and unrelated metadata.
- Commit: `ee61dc0` (T40 — the new atomic transaction only; T41 wires up both sync paths, not yet done). Added `promoteLedger(groupId, input)`: one `database.transaction(["events", "buffer", "meta"], "readwrite")` that removes promoted buffer entries, adds newly-buffered entries, inserts admitted event rows, and merges versionVector/discardVector/cursors/observedHlc metadata — replacing what `src/relay/sync.ts`/`migrated-sync.ts` currently do via FOUR separate, independently-committing calls (`removeBufferedEvents`, `putBufferedEvents`, `updateTransportVectors`, `upsertRemoteEvents`). The OLD separate-calls path in both sync files is UNCHANGED and still vulnerable to the exact crash-window described in Root cause — this finding is not fully closed until T41 migrates both callers. 3 new tests in `test/ledger-promotion.test.ts`: basic promotion, re-buffering (still-future event moved back to a new retry slot in the same call), and a genuine fault-injection test (`vi.spyOn(IDBObjectStore.prototype, "put")` aborts the transaction mid-way through event insertion, matching the established codebase pattern from `operated-sync-recovery.test.ts`'s own aborted-transaction test) proving the buffer entry survives intact when the transaction aborts. Genuine RED confirmed for the fault-injection test by temporarily reverting to the ORIGINAL bug shape (buffer deletion in its own, separately-committing transaction before the main one) — confirmed the event was PERMANENTLY LOST (removed from buffer, never admitted) without the atomicity fix. svelte-check clean; broad regression (sync/reservation/events) 38/38 pass.
- Commit: `b1863d8` (T41 — completes this finding). `src/relay/sync.ts` and `src/relay/migrated-sync.ts` both replaced their 4 separate, independently-committing calls (`removeBufferedEvents`+`putBufferedEvents`+`updateTransportVectors`+`upsertRemoteEvents`) with `resolveIncomingEventConflicts` (the DATA-005 fingerprint-conflict check, extracted from `upsertRemoteEvents` into a shared, reusable helper — `upsertRemoteEvents` itself is now a thin wrapper calling it, preserving its EXISTING behavior/tests/other callers like `replaceFromExport`/`applyDelta` completely unchanged) followed by ONE `promoteLedger` call. `sync.ts` promotes both admitted AND dropped buffer ids (matching its original scope); `migrated-sync.ts` promotes admitted-only (preserving its own original, narrower scope — dropped events there are handled via the separate `safeCheckpoint` gate). Updated 3 pre-existing tests that spied on `upsertRemoteEvents` to simulate a local-write failure (`operated-sync-recovery.test.ts` x2, `supabase-device-catchup.test.ts` x1) to spy on `promoteLedger` instead — expected, intentional updates matching the fact that the atomic write path moved, not regressions. Broad regression: core 113/113, 11 sync/reservation/events files / 80 tests pass; svelte-check clean.
- Blocked by: DATA-003, DATA-005 and CONC-002.

## INTR-002 — Persist resumable probe cohorts
- Status: Fixed
- Severity: P2
- Root cause: Cohort IDs/progress are written only after all publication attempts finish.
- Impact: Interrupted operator runs can lose the measurement identity and cannot resume consistently.
- Files: `scripts/task0-retention.mjs`, proposed `scripts/atomic-artifact.mjs`, proposed `test/maintenance/retention-journal.test.mjs`; existing manifests/reports are preserved.
- Fix approach: Pre-sign a fixed synthetic cohort, durably journal its public wire objects before publication, and atomically checkpoint attempts/results; resume the same objects and IDs without persisting private signing keys.
- Verification: Simulated interruption before/after each publish resumes the same cohort with no new IDs; completed legacy manifests remain byte-identical; journal contains no private key and CLI never republishes a new cohort implicitly.
- Blocked by: None. INTR-003's atomic-artifact.mjs is now available and used.
- T18 progress: Extracted a reusable `runJournaledCohort()` in `scripts/task0-retention.mjs` (exported for direct testing) — pre-signs all events for the cohort upfront (fixing the tag/pubkey/ids deterministically before any network I/O), durably journals the public wire objects via the new `checkpointArtifactAtomically()` in `scripts/atomic-artifact.mjs` BEFORE the first publish attempt, then re-checkpoints after every attempt. The journal never contains the private key (`sk` never leaves `runJournaledCohort`'s local scope). Refuses to start a fresh cohort while a prior interrupted run's journal still exists (surfaces the loss instead of silently orphaning it). Wired into all three cohort commands (`publish`, `publish-slow`, `publish-current`) — each still writes its final manifest via `publishArtifactAtomically` (INTR-003) and only then deletes its journal. Added an `import.meta.url` main-module guard around the CLI dispatch (matching `relay-migration.mjs`'s existing pattern) since importing the module for direct testing was unconditionally running the CLI and calling `process.exit(1)`. 22/22 tests pass (5 new retention-journal cases + 6 atomic-artifact + 11 pre-existing relay-migration); manifest JSON shape unchanged so existing committed manifests remain compatible. Commit `a9d03d406c286e3e39f57a01fc8df67501299c63`.
- T19 result: Added resume detection directly in `runJournaledCohort()` — if `journalPath` already exists, its schema/identity (kind, relay list, eventCount, payloadBytes, event array length, ackedThrough bounds, acks shape) is validated before trusting it; a mismatched or malformed journal is rejected ("does not match this cohort's expected relays/eventCount/payloadBytes") rather than guessed at. A compatible journal resumes from `ackedThrough + 1` using its stored pre-signed events and accumulated `acks` — no new signing key, no new tag/pubkey, no re-attempt of already-checkpointed events. The pre-existing `if (existsSync(MANIFEST))` guard in each of `publish`/`publish-slow`/`publish-current` is untouched, so a cohort that already fully completed (manifest written) still refuses to restart — resume only ever applies to an in-progress (manifest-less) journal. 23/23 tests pass (2 new: resumes from the correct index across a simulated mid-loop throw with the same tag/pubkey/ids; rejects resuming a journal whose relays/eventCount/payloadBytes don't match).
- Commit: `88bc31f82a76a3fdf69aa64f7b05b6b7054da9a3`.

## INTR-003 — Publish encrypted artifacts atomically
- Status: Fixed
- Severity: P2
- Root cause: Exclusive creation writes directly to the final filename and may leave a partial file there.
- Impact: Retry cannot complete the intended output and consumers may encounter truncated ciphertext.
- Files: `scripts/relay-migration.mjs`, proposed `scripts/atomic-artifact.mjs`, `test/maintenance/relay-migration.test.mjs`.
- Fix approach: Write/flush a new staging artifact, then use a verified same-filesystem no-clobber publication primitive; preserve pre-existing and interrupted artifacts. Reject unsupported atomic/no-clobber behavior instead of assuming rename semantics.
- Verification: Short write, disk error and interrupted publication never produce a successful final artifact; existing destinations are unchanged; completed output decrypts and matches expected bytes on supported test platforms.
- Blocked by: None; filesystem primitive compatibility is verified before use.
- Verification result: New `scripts/atomic-artifact.mjs` writes to a fresh randomly-suffixed staging path first, flushes it (open+writeFile+sync+close), then publishes via `link()` — atomic and EEXIST-on-existing-destination, unlike `rename()` which can silently replace. `verifyAtomicPublishSupported()` proves link()'s no-clobber behavior on the target directory before any real publish is attempted, rather than assuming it. 6/6 new tests cover: capability verification leaves no probes behind; exact-byte publish with staging cleanup; existing-destination refusal leaves the pre-existing file byte-for-byte unchanged; the rejected staging copy is retained for inspection; a fault in the staging write (ENOENT from a missing directory) never creates the final path at all; two concurrent publishers to the same destination resolve to exactly one winner and one clean rejection. `scripts/relay-migration.mjs`'s `writeFile(filename, ..., {flag:'wx'})` direct-to-final-name call replaced with `publishArtifactAtomically(filename, ...)`. Full existing relay-migration.test.mjs suite (11 tests) plus the 6 new tests: 17/17 pass. svelte-check 0/0 (scripts/ is outside the Svelte app, unaffected either way).
- Commit: `04811f15c010e69e992361d2616d8af9b9a45fcf`.

## LOGIC-001 — Apply settlement transfers with the correct signs
- Status: Fixed
- Severity: P1
- Root cause: Fold adds a transfer to the creditor and subtracts it from the debtor, matching an incorrect prose formula.
- Impact: Recording the suggested payment doubles the remaining debt rather than settling it.
- Files: `core/src/fold.ts`, `core/test/settle.test.ts`, `core/test/fold.test.ts`, `core/test/properties.test.ts`, `PRD.md` formula.
- Fix approach: Reverse only the settlement balance application signs; retain all records and repair the matching formula/test expectations with an economic end-to-end example.
- Verification: Every suggested transfer recorded through fold zeroes the original balances; partial payments reduce debt; disputes do not undo payment and authorized void restores the pre-payment balance.
- Blocked by: None for arithmetic; integrate authority scenarios after SEC-001/SEC-002 where available.
- Commit: `4bee66b`. `core/src/fold.ts`'s settlement balance application had `from`/`to` signs reversed: it added the transfer amount to the payee (`to`, the creditor with a positive balance) and subtracted it from the payer (`from`, the debtor with a negative balance) -- since discharging a debt should move BOTH sides toward zero, this instead moved them AWAY from zero, doubling the remaining debt. Example: bob owes alice 100 (bob=-100, alice=+100); bob pays alice 100; the old code produced bob=-200, alice=+200 instead of both landing at zero. Fixed by swapping the signs: `add(balances, canonical(settlement.from), settlement.minor)` (payer gains toward zero) and `add(balances, canonical(settlement.to), -settlement.minor)` (payee loses toward zero). 3 new `core/test/fold.test.ts` cases directly prove the acceptance criteria: a settlement of the exact suggested transfer amount zeroes both original balances; a partial payment reduces but does not fully discharge the debt; a validly authorized `SettlementVoided` (per SEC-002/T47's any-current-group-member authority) restores the balance to exactly its pre-settlement value -- never left at zero (settlement effect never applied when voided) and never doubled (the old bug's failure mode). Fixed 3 pre-existing test blocks whose expected balance values encoded the old buggy convention, with genuine RED confirmed against the pre-fix code for all 6 (new + updated) assertions. `core/test/settle.test.ts` and `core/test/properties.test.ts` needed no changes -- surveyed both and confirmed neither hard-codes a specific signed settlement balance value; `settle.test.ts` tests the greedy-matching algorithm (not fold's balance application) and `properties.test.ts`'s settlement-touching scenarios only check zero-sum/convergence, which hold regardless of sign convention as long as it is applied consistently. Updated `PRD.md` §7.3: REQ-SET-03 now states the exact sign convention with a full worked example (payer gains, payee loses), matching the document's own "every formula carries worked examples" rule; also corrected REQ-SET-05 and REQ-SET-08, which had drifted stale from this session's own earlier SEC-001 (T44/T45, removed the unsigned born-confirmed shortcut) and SEC-002 (T47, any current group member can void, not just the original payer) fixes -- caught this drift while reviewing the Settlement section for T48's own PRD.md scope, an unplanned but directly-relevant documentation-consistency fix. Core 134/134 (9 files); broad app regression across 9 files/35 tests (settlement-history, settlement-ui, settlement-void-authority-ui, settlement-self-confirm-ui, verification, platform-boundaries, phase5-money-acceptance, phase5-archive-acceptance, multi-trip-repository) confirmed none assert signed balance values for settlement scenarios (only signatures/void-authority/unsigned transfer amounts), so none needed changes; svelte-check clean.

## LOGIC-002 — Receive observed HLC before new events
- Status: Fixed
- Severity: P1
- Root cause: Event construction samples raw wall time rather than a persisted observed clock.
- Impact: A causally later edit can sort before its root and be ignored.
- Files: `src/lib/events.ts`, `src/db/repo.ts`, `core/src/hlc.ts` only if an actual contract change is needed, clock/order/edit tests.
- Fix approach: Advance a per-group HLC during atomic identity reservation using admitted observations, not future-buffered events; new timestamps are monotonic and old event timestamps remain immutable.
- Verification: Backward clock movement and a faster peer cannot place a later local edit before its observed root; fresh independent devices still converge.
- Blocked by: CONC-001 and CONC-002.
- Commit: `d35633c`. `src/lib/events.ts`'s `makeHlc`/`makeEvent`/`EventFactory` gained an optional `hlcFloor` — when supplied, a new event's `wall` is `Math.max(Date.now(), floor.wall)`, with `ctr` bumped from `floor.ctr` (not the plain sequential id-counter) when wall doesn't advance past the floor, so a device whose own clock lags never produces an event that sorts before an already-observed root. `src/db/repo.ts` gained `StoredMeta.observedHlc` (the highest HLC ever admitted for a group) and a private `advanceObservedHlc` helper. `reserveEventIds` (T37's allocator) now atomically reads+advances `observedHlc` in the SAME transaction that bumps `nextCounter` (extended to touch `["groups", "meta"]`), persists the new floor alongside the reservation's counters (so a RETRY of the same commandId returns the identical floor, not a freshly-recomputed later one), and returns it as `EventReservation.hlcFloor`. `upsertRemoteEvents` advances `observedHlc` from the highest HLC among events it actually admits (`toInsert`) — never from future-buffered or dropped ones, matching "not future-buffered events." `Trip.svelte`'s `commitReserved` and `archiveGroup` now pass `reservation.hlcFloor` into the `EventFactory` they build. No `core/src/hlc.ts` contract change was needed. 7 new tests (4 in `test/events.test.ts` for the pure floor logic, 3 in `test/event-reservation.test.ts` for the allocator-level integration — far-future remote peer, retry-stability, and remote-admission-advances-the-floor), 2 with genuine RED confirmed via temporary revert. Caught and fixed two self-inflicted bugs during implementation (both via immediate `svelte-check`/test runs): a duplicate-import in the test file (same missing-`end`-anchor pattern as T38) and a missing closing brace in `upsertRemoteEvents` from an imprecise multi-line replace; also fixed an `exactOptionalPropertyTypes` violation (conditionally assigning `observedHlc` only when defined, matching the established `linked`/`sourceTagHex` pattern). Broad regression: core 113/113, sync 59/59, UI-boundary/currency/claim/settlement/archive/verification/multi-trip 33/33; svelte-check clean.

## LOGIC-003 — Retain the schema version of financial edits
- Status: Fixed
- Severity: P1
- Root cause: The edit command preserves rate fields but defaults the new event to version 1.
- Impact: A valid UI correction quarantines itself and freezes the ledger.
- Files: `src/Trip.svelte`, `test/expense-edit.test.ts`, `test/expense-workflow-ui.test.ts`, `test/phase5-money-acceptance.test.ts`.
- Fix approach: Derive the minimum supported event version from the actual retained financial payload; keep ordinary base-only edits compatible.
- Verification: A real rate-bearing total edit remains foldable and preserves payer/share/rate semantics; a base-only edit retains its compatible version.
- Resolution: `editExpense` in `src/Trip.svelte` now passes `financials.rate ? 2 : 1` as `makeEvent`'s version argument (mirroring `addExpense`'s already-correct convention), computed from the same `financials` object `editFinancialsForTotal` returns -- instead of relying on `makeEvent`'s `version = 1` default unconditionally. `core/src/fold.ts`'s `validateRate` (requires v>=2 for `financials.rate`) needed no change; it was already correct and already tested. New source-shape assertion in `test/expense-workflow-ui.test.ts` + 2 new functional tests in `test/phase5-money-acceptance.test.ts` (rate-bearing edit stays foldable; base-only edit stays v1).

## LOGIC-004 — Preserve valid percentage totals
- Status: Fixed
- Severity: P2
- Root cause: Transitions use the foreign entered total as denominator and round each percentage independently.
- Impact: A valid split can become 200% or 99.99%, blocking save.
- Files: `src/Trip.svelte`, `src/lib/split-preservation.ts`, `src/lib/money.ts` only if required, `test/split-preservation.test.ts`, `test/multicurrency.test.ts`.
- Fix approach: Use validated base minor units and allocate the 10,000 basis-point total deterministically before formatting.
- Verification: Foreign/base conversion and three-way one-cent splits transition to exactly 100%; participant inclusion and intended weights remain stable.
- Blocked by: None.
- Verification result: RED reproduced both root causes: (1) `Trip.svelte`'s `changeSplitMode` computed `total` via `parseMinor(expenseTotal)` — the raw entered text — while `sharePreview`/`buildSharePreview` already used the correctly currency-converted `amountPreview.baseMinor`; a foreign-currency expense with a non-1.0 exchange rate would divide a base-currency numerator by a foreign-currency denominator. (2) `formatPercentageInput` was applied independently per participant with no cross-share consistency, so three equal one-cent shares of a 3-cent total formatted as 33.33% each, summing to 99.99% (`toBeCloseTo(100,10)` failed by 0.01). GREEN: added `allocatePercentageBasisPoints` (largest-remainder method, money.ts) so the sum of allocated basis points is always exactly 10,000 when parts sum to total; `split-preservation.ts` now allocates jointly across all selected pids instead of formatting each independently; `changeSplitMode` now reads `amountPreview.baseMinor` (the same already-tested conversion `buildSharePreview` uses), making both call sites consistent by construction. 12/12 unit tests pass (2 new LOGIC-004 cases, all pre-existing split-preservation/money-format/multicurrency tests unchanged and still passing — `formatPercentageInput` itself was preserved as-is for its existing single-pair use). svelte-check: 0 errors, 0 warnings project-wide.
- Commit: `c5173dde41b77f9b9564bc59452bfef851e1fea6`.

## LOGIC-005 — Use the actual reserved event ID for allocation
- Status: Fixed
- Severity: P2
- Root cause: Entry preview and saved allocations share the constant string preview rather than the event's ID.
- Impact: Repeated tied remainders favor the same participant.
- Files: `src/Trip.svelte`, `src/lib/events.ts`, `src/db/repo.ts` reservation caller only, allocation/entry tests.
- Fix approach: Reserve one draft event identity and use it consistently through previews and commit; rotate only for a genuinely new draft and represent abandoned reservations as gaps, not receipts.
- Verification: Preview equals committed shares; event-ID-dependent tie-breaking is used; rerenders do not allocate new IDs; cancelling a draft creates no ledger event or false coverage.
- Blocked by: CONC-001, LOGIC-002 and DATA-007.
- Commit: `1b6ec1b`. Preview allocator was hardcoded to the literal string `"preview"` for its tie-break salt (`allocate(total, weights, "preview", pids)` in Trip.svelte's `buildSharePreview`). Fix: new `draftXid` state (UUID, reset after each successful `addExpense`) threaded as `salt` parameter through `buildSharePreview`; `addExpense` now uses the same `draftXid` as the committed ExpenseAdded's `xid`. Preview shares now equal committed shares (both salted by the same draft xid), tied remainders rotate across drafts, cancellation drops the UUID with zero repo effect. `sharePreview.shares` was already the source of truth for the commit path via `makeExpenseFinancials` — no re-allocation needed on commit.

## LOGIC-006 — Drain archived outboxes
- Status: Fixed
- Severity: P2
- Root cause: Archive immediately disables normal polling with pending events still local.
- Impact: The archive and preceding work may never reach peers.
- Files: `src/Trip.svelte`, `src/lib/lifecycle.ts`, `src/relay/sync.ts`, lifecycle/outbox tests.
- Fix approach: Add bounded outbox-only publish/readback eligibility for archived groups, stopping after their pending work confirms; retain normal archived read-only controls and visibility suppression.
- Verification: Archive without a prior sync drains the original pending set, retries failures without duplicate effects, and stops network work after confirmation.
- Blocked by: INTR-001, REL-001, DATA-005 and FE-005.
- Commit: `d2f9124` (test/lifecycle.test.ts includes new `shouldPollGroup` archived+pending cadence cases plus the source-shape check pinning the Trip.svelte wiring). `shouldPollGroup` (src/lib/lifecycle.ts) no longer unconditionally stops polling once `archived` is true — it now only stops when the group is ALSO drained of pending outbox work. New required `PollingDecisionInput.hasPendingOutbox` field; `src/Trip.svelte`'s `startPolling()` wires it to `unconfirmedCount > 0` (the same `counts.local + counts.published` signal already shown in the topbar). `src/relay/sync.ts` needed no change — `syncOnce`/`runSyncCycle` never checked `archived` in the first place, so the same drain call already publishes/reads-back correctly once the timer is allowed to fire; existing dedup/idempotency (DATA-005) already prevents duplicate effects on repeat drain attempts. All pre-existing `if (archived) return;` edit-control guards throughout Trip.svelte are untouched, so archived editing stays fully disabled. Once `unconfirmedCount` reaches 0 the same check naturally stops polling again.

## PERF-001 — Bound retained future-event storage
- Status: Fixed
- Severity: P2
- Root cause: Buffer limits reset per incoming batch and exclude rows retained from earlier cycles.
- Impact: Repeated future pages can grow held-event storage beyond configured limits.
- Files: `core/src/transport.ts`, `src/db/repo.ts`, both sync callers, buffer/admission tests.
- Fix approach: Include retained per-group/per-author held counts and duplicate IDs in the transaction's admission accounting; defer/reject new work without evicting existing records.
- Verification: Multiple pages and concurrent attempts cannot grow past the approved existing limits; already-over-limit stores preserve their contents and admit no surplus.
- Blocked by: DATA-004 and INTR-001.
- Commit: `55f41c6`. New required `TransportAdmissionOptions.existingBufferedCount` -- the buffer-cap check is now `opts.existingBufferedCount + buffered.length >= opts.bufferMaxEvents` instead of just `buffered.length >= opts.bufferMaxEvents`. New `src/db/repo.ts`'s `bufferedEventIds(groupId)` returns every retained buffer row's id (due or not); both sync callers derive `existingBufferedCount = allBufferedIds.size - dueBuffered.length` and exclude a re-delivered not-yet-due id from `incoming` to avoid double-counting the same held row. `admitTransportEvents` never evicts -- only defers new surplus.

## PERF-002 — Cache cryptographic checks without caching authority
- Status: Fixed
- Severity: P2
- Root cause: Each refresh repeats sequential signature checks across unrelated keys.
- Impact: Verification work grows with signatures times candidate keys.
- Files: `src/lib/verification.ts`, `core/src/identity.ts` query seam only if necessary, `test/verification.test.ts`, proposed `test/verification-cache.test.ts`.
- Fix approach: Bound and cache immutable signature results by group/domain/payload/key/algorithm/signature; narrow candidates through the verified authority chain while recomputing current authorization after voids or claims.
- Verification: Count actual crypto invocations before/after; unchanged refresh avoids repeats; revoked/voided authority still changes immediately; cache eviction is bounded and cross-group reuse is impossible.
- Blocked by: SEC-001 and DATA-003.
- Commit: `0ea6c26`. `buildVerificationContext` re-verified every signature from scratch on every refresh (`await verifyClaim(...)` in the request loop, unconditionally). Fix: added module-level bounded LRU (`SIGNATURE_CACHE_MAX = 10_000`) keyed by `(groupTag, alg, publicKey, payload, signature)` — all immutable per event. Cross-group reuse is impossible since `groupTag` is part of the key. Void/revocation authority state is recomputed by the fold on every refresh, not stored here, so authority changes take effect immediately. Bounded LRU eviction via `Map` insertion-order recency (delete-then-set on hit). Test-only `resetSignatureCache()` seam. Switched from named `verifyClaim` import to `import * as claimModule from "@/crypto/claim"` so vitest `spyOn` can intercept the call boundary. New `test/verification-cache.test.ts` (3 tests: identical-events reuse, new-event triggers re-verify, cross-tag isolation). Existing `test/verification.test.ts` (4/4) still passes unchanged.

## PERF-003 — Persist group metadata without hydrated copies
- Status: Fixed
- Severity: P2
- Root cause: saveGroup accepts hydrated objects and stores nested events/meta/identities alongside their authoritative stores.
- Impact: Ordinary updates duplicate large and sensitive local structures.
- Files: `src/db/repo.ts`, `test/multi-trip-repository.test.ts`, proposed `test/group-storage-shape.test.ts`.
- Fix approach: Separate hydrated-only fields from persisted metadata at the writer; preserve legitimate unrelated stored fields and all authoritative event/identity stores; no background historical cleanup sweep.
- Verification: New writes contain no hydrated duplicates; all authoritative rows and unknown durable metadata survive an update; reopening returns the same ledger.
- Blocked by: None.
- Verification result: RED opened a raw IndexedDB connection to the "groups" object store directly (bypassing readGroup's own hydration, so a regression can't hide behind it) and confirmed the full `GroupCreated` event array was duplicated into the row after calling `saveGroup` with a spread hydrated GroupRecord — exactly reproducing what Trip.svelte's `commit()` (every event write), `renameGroup` and `setCurrency` already do. GREEN: `saveGroup` now always constructs a literal 8-field `StoredGroup` object (groupId/name/currency/deviceId/nextCounter/createdAt/secretB64/tagHex) before writing, regardless of what extra hydrated fields the caller's object carries. 1/1 new test plus 5/5 pre-existing multi-trip-repository tests pass; a full rendered regression (common-expense-ui.test.ts, exercising the real commit→saveGroup path end to end) also passes. svelte-check 0/0.
- Commit: `98a2c68a90f10bd1e4bbafce039b2a8824450422`.

## REL-001 — Bound server pages by bytes
- Status: Fixed
- Severity: P1
- Root cause: Redis fetch limits count rows while HttpRelay enforces a smaller byte ceiling.
- Impact: Large legal rows repeatedly block the same recovery page.
- Files: `api/relay.ts`, `test/relay-api.test.ts`, `test/operated-sync-recovery.test.ts`, `test/relay-network-deadline.test.ts`.
- Fix approach: Construct bounded serialized response pages and do not advance past the first omitted row; avoid fetching an unbounded aggregate merely to trim it afterward.
- Blocked by: None.
- Commit: `7c31ad4`. New exported `boundEntriesByBytes(entries, maxBytes)` in `api/relay.ts` always keeps at least the first entry (no empty-progress stall even for a pathological single-oversized row) and drops every entry after the first once including it would push the running serialized total past `maxBytes`; wired in after the existing author filter with new env-configurable `MAX_PAGE_BYTES` (default 1,500,000, comfortably below HttpRelay's 2.1MB `boundedText` transfer ceiling and well above `MAX_BLOB`). Dropped entries are never lost -- the client already advances its cursor from the last included entry, so the next request naturally resumes at the first omitted row. `test/relay-network-deadline.test.ts` needed no changes (regression-verified unaffected).

## REL-002 — Execute relay retry/drop policy
- Status: Fixed
- Severity: P2
- Root cause: Diagnostic actions never influence subsequent adapter scheduling.
- Impact: Failed or blocked endpoints continue consuming attempts at the ordinary cadence.
- Files: `src/relay/sync.ts`, `src/relay/nostr.ts`, `src/relay/diagnostics.ts`, `src/db/repo.ts` metadata shape, diagnostics/pool/cycle tests.
- Fix approach: Track policy per actual endpoint and group, apply bounded backoff and explicit temporary/permanent demotion, and preserve user-configured endpoint lists; a reset is explicit rather than silently resurrecting a dropped target.
- Verification: Fake-clock requests obey backoff; one bad Nostr endpoint does not suppress other endpoints; user settings and pending events survive retries and reload.
- Blocked by: CONC-002 and DATA-005. Preserve migration/default-relay restrictions.
- Commit: `e860ac8`. New `src/relay/endpoint-policy.ts` pure `EndpointPolicy` state machine keyed per ACTUAL endpoint (HttpRelay's fixed `"operated"` key; each Nostr URL by its own literal string) so one bad Nostr endpoint never touches another's policy. `NostrRelay` skips backed-off/dropped URLs internally before contacting `nostr-tools`, exposing per-URL outcomes via `lastOutcomes()`; the shared `Relay`/`AckResult` shapes and `sync.ts`'s adapter-level quorum counting are unchanged. `createRelays()` simply omits a backed-off/dropped operated HttpRelay, exactly like the existing `useOperated=false` toggle. All three `sync.ts` publish sites fold diagnostics into policy via `updatePolicyFromAcks()` and persist through `updateMeta`. New exported `resetRelayEndpoint(groupId, endpointKey?)` is the sole explicit reset path -- never triggered automatically.

## REL-003 — Probe the production envelope shape
- Status: Fixed
- Severity: P2
- Root cause: batch50 constructs a multi-object Nostr frame instead of one event whose content carries an encrypted batch.
- Impact: Probe conclusions do not measure the actual client batching contract.
- Files: `scripts/task0-retention.mjs`, proposed `test/maintenance/retention-wire.test.mjs`; existing reports only receive an explicit interpretation addendum if needed.
- Fix approach: Build one production-shaped encrypted batch event and correlate acknowledgements/readback by its ID; preserve historical measurements and distinguish corrected stimulus from old results.
- Verification: Local transport capture proves exactly one signed event per frame and correct batch round-trip; no real relay publication is performed in this execution cycle.
- Verification result: Added `encryptEventBatch`/`decryptEventBatch` (AES-GCM, 12-byte IV + ciphertext, base64 — byte-for-byte matching `src/crypto/envelope.ts`'s scheme) and `buildProductionBatchEvent` (wraps one encrypted batch as a single signed event's `content`, matching `src/relay/nostr.ts`'s `nostrEventTemplate`/`publish`: one event per call). `batch50()` now builds exactly ONE such event and sends it as a valid NIP-01 `["EVENT", event]` message, instead of the old `["EVENT", e0, e1, ..., e49]` — which is not a valid client message at all, so its size/acceptance measurements never reflected what the real client sends. Report section renamed to "corrected production-shaped stimulus" and explicitly notes it supersedes (without rewriting) the prior invalid-stimulus section, which is left untouched as a historical record. 10/10 new local tests (round-trip, wrong-key rejection, exactly-one-signed-event-with-valid-signature, 50-item/~3000B-payload scale) plus 41 pre-existing maintenance tests across the whole scripts/ + test/maintenance tree: 51/51 pass. No real relay connection is opened anywhere in the test suite; `batch50()`'s own network probing is unchanged in invocation shape and remains a manually-triggered, separately-approved operator action.
- Commit: `0165ea07f12ff864b040c81f69d7e6eb3a61c14f`.

## REL-004 — Make vet exit status authoritative
- Status: Fixed
- Severity: P2
- Root cause: Printed FAIL paths return normally rather than setting process status.
- Impact: Automation cannot enforce the advertised admission gate.
- Files: `scripts/task0-retention.mjs`, `test/maintenance/retention-cli.test.mjs`.
- Fix approach: PASS exits 0, FAIL exits 1, WARN exits 2; only PASS is admission success. Preserve diagnostic text and existing cohort files.
- Verification: Child-process/local-fixture tests observe each literal exit code, including connection failure and zero acceptance.
- Blocked by: None; WARN policy is an explicit proposed decision in design.md.
- Commit: `44bf6ab`. `vet()` returns the verdict string; `exitCodeForVerdict()` maps PASS=0/WARN=2/FAIL-or-other=1; CLI dispatch sets `process.exitCode`. Unit tests drive `vet()` with a scripted fake WebSocket for PASS/WARN/policy-blocked-FAIL (no real relay contacted); one native child-process spawn against a closed local port proves real exit code 1 end-to-end. 32/32 maintenance tests pass (5 new).

## REL-005 — Restore a working dependency-review gate
- Status: Fixed
- Severity: P2
- Root cause: The observed hosted action failed on unsupported dependency-review availability before assessing changes.
- Impact: A named gate provides no dependency-analysis result.
- Files: `.github/workflows/dependency-review.yml`, proposed `scripts/check-dependency-advisories.mjs`, proposed `test/maintenance/dependency-advisories.test.mjs` if fallback is required.
- Fix approach: Recheck the observed cause read-only. Prefer the native action where supported; otherwise use a tested read-only lockfile advisory check that fails on scanner errors and the configured severity threshold. Do not enable repository settings automatically.
- Verification: Supported/unsupported provider responses, changed dependency findings and network failures produce the correct gate result; preserve severity policy and disclose that hosted execution remains unverified without an approved push/run.
- Blocked by: SEC-004 assessment where it explains an existing advisory failure; if the original cause changed, stop for user review.
- T06 evidence: latest three native review runs remain failed; current read-only SBOM request returns HTTP 404. The fallback will scan introduced name/version pairs relative to the PR base, matching the native changed-dependency policy rather than blocking unrelated changes on pre-existing advisories.
- Actual change: `.github/workflows/dependency-review.yml` now verifies the standalone checker, probes native support with authenticated repository-access confirmation, retains the native action when supported, and uses the changed-lockfile OSV fallback only for an unsupported graph. HTTP/auth/schema/unscored-advisory failures fail closed. Private-repository skip policy and moderate threshold are preserved.
- Verification result: 25/25 operator tests pass (14 new plus 11 encrypted-export regressions), strict checkJs and node syntax pass, workflow YAML parses, direct CLI reports empty-delta pass and live read-only nativeSupported=false. RED policy failure is retained in `T07-red-policy.log`; GREEN output in `T07-green.log`, both under the ignored cycle-1 evidence root. Fixture servers closed; no owned processes remain.
- Commit: `e49d2924f5837150b1cf63997c0c5f844ab219d0`.
- Status notes: Fixed source/local behavior only. No push or hosted workflow run; full application baseline remains blocked by unrelated NEW-001. LSP is unavailable after prior installation refusal; strict compiler check substituted. Independent review invocation failed; direct cold review found no blocker. New checker is 156 nonblank/noncomment lines; tests 132. The checker owns dependency-review I/O, parses provider/lockfile boundaries, uses no new dependency and emits redacted JSON only at its CLI boundary.

## REL-006 — Distinguish scanner errors from findings
- Status: Fixed
- Severity: P2
- Root cause: Blanket shell fallbacks make tool crashes and findings indistinguishable from successful scanning.
- Impact: A green workflow can lack a usable scan.
- Files: `.github/workflows/semgrep.yml`, `.github/workflows/bandit.yml`, `test/maintenance/scanner-exit.test.mjs`; `.github/workflows/dependency-review.yml` only to register the hermetic tests on its existing Node/PowerShell-capable hosted runner.
- Fix approach: Preserve report upload; record scanner status and fail on execution/configuration errors. Keep the explicitly documented findings policy unless separately changed; no blanket success fallback.
- Verification: Mock scanners with success/findings/tool-error exits demonstrate the configured distinction and SARIF upload remains scheduled after failure.
- Blocked by: Verified scanner-specific exit-code documentation before implementation.
- T08 pre-scan: both workflow bodies match the audit. Semgrep CLI docs distinguish findings-only exit 1 under --error from fatal/configuration errors; Bandit 1.7.10 cli/main.py applies --exit-zero only to the successful results-count branch. Use native report-only options rather than accepting arbitrary exit 1. Sources: https://semgrep.dev/docs/cli-reference and https://raw.githubusercontent.com/PyCQA/bandit/1.7.10/bandit/cli/main.py.
- Actual change: Remove Semgrep --error, add Bandit --exit-zero, remove both `|| true` fallbacks, preserve always() upload guards. Register hermetic command-contract tests on the existing Node/PowerShell-capable dependency-review runner, serializing those test files without changing application test settings or deadlines.
- Verification result: Four semantic RED assertions (both scanners masking fatal 2/exception 1); one startup timeout recorded separately. GREEN 10/10 targeted and 24/24 combined security tests, three YAML parses, Node syntax and diff checks passed. Fixture processes exited and reports remain ignored. Logs: cycle-1 `T08-red.log`, `T08-green.log`, `T08-security-contracts.log`.
- Commit: `2ca2e2bf481387f197e7847980daf8571bd08f27`.
- Status notes: Verified workflow command semantics with native PowerShell processes and documented scanner fixtures; only Bash line continuation syntax was translated. No vendor engine, hosted workflow or full application suite was run; no report-only findings policy was changed.

## REL-007 — Retain the working offline shell
- Status: Fixed
- Severity: P2
- Root cause: Service-worker cache writes accept unsuccessful HTTP responses.
- Impact: A transient error response can replace the offline application shell.
- Files: `public/sw.js`, `test/service-worker.test.ts`.
- Fix approach: Cache eligible successful responses only; unsuccessful navigation falls back to the retained working shell; keep API and cross-origin exclusions.
- Verification: Online 503 followed by offline navigation still returns the previous successful shell; success updates it; API/cross-origin requests remain uncached.
- Blocked by: None.
- Verification result: RED reproduced the defect in the fake-DOM unit harness (4/4 new cases failing as expected) and independently in a real Chromium (`channel: 'chrome'`) context against an owned loopback HTTP server — an HTTP 503 navigation replaced the cached working shell, and the poisoned 503 was then served again while offline. GREEN: unit suite 13/13 (5 new + 8 pre-existing); browser re-run showed the failed navigation, the cache read, and the offline reload all returning HTTP 200 `WORKING-SHELL`, with the `/api/probe` counter still incrementing (1→2), confirming API requests remain uncached. TypeScript strict check and `node --check` on the worker both clean. Screenshot (`T09-green-offline.png`) and JSON evidence (`T09-red-browser.json`, `T09-green-browser.json`) retained under cycle-1 backups; owned Chrome context and loopback server closed in a `finally` block, confirmed no leftover process via scoped Win32_Process inspection.
- Commit: `7469abad202b4b24fd420182fa79b155acff026d`.

## REL-008 — Version the verified SQL transition
- Status: Open
- Severity: P2
- Root cause: The committed desired creation transaction is not a replayable upgrade chain for the externally staged schema.
- Impact: A new operator cannot reproduce a verified schema transition from repository files alone.
- Files: Generated `supabase/migrations/` SQL files, `test/supabase-relay-sql.test.ts`, migration verification tests; preserve `supabase/schemas/relay.sql` unless a selected contract explicitly requires a backed-up change.
- Fix approach: Generate reviewed versioned deltas from the actual baseline and desired schema, with preconditions and forward-compensation instructions; never invent a hosted baseline or destructive down migration.
- Verification: Apply only to isolated fixture databases initialized from the captured baseline; rows, cursors, proofs, privileges, disabled controls and indexes meet explicit before/after assertions; document user-applied rollout only.
- Blocked by: None. No live SQL mutation or provider activation beyond what has been explicitly authorized is permitted.
- B4 resolution: owner confirmed no encrypted backup is required (test-only data, explicitly waived). Hosted schema baseline verified directly via the Supabase Management API against project esplfwgzljvdrnvqaisj (thheprawnstatus): prawnsplit.relay_entries, prawnsplit.relay_topics, prawnsplit.relay_control exist and match supabase/schemas/relay.sql. This SQL-migration-generation fix is not yet implemented; scheduled at T25/T26 in the normal task queue.

### T25 baseline verification (REL-008/B4)

Desired schema, read directly from `supabase/schemas/relay.sql` (git-tracked, complete):
- **Tables (3):** `prawnsplit.relay_control` (singleton row, 6 quota/usage counters, all `bigint check (>= 0)`), `prawnsplit.relay_topics` (`tag` PK + `commitment` + last cursor ms/seq), `prawnsplit.relay_entries` (composite PK `(tag, cursor_ms, cursor_seq)`, FK to `relay_topics.tag`, one non-unique receipt index).
- **Functions (5):** `prawnsplit.reserve_capacity` (atomic quota check-and-reserve under `select ... for update`), `public.prawnsplit_relay_append`/`_read`/`_import`/`_topic_info` (the 4 RPCs `server/supabase-relay.ts` already calls by these exact names).
- **ACL pattern:** RLS enabled on all 3 tables; blanket `revoke all ... from public, anon, authenticated` on the schema, every table and every function, then `grant` only to `service_role`. Consistent, no exceptions.
- **Provenance:** table-level existence in the hosted project (`esplfwgzljvdrnvqaisj` / `thheprawnstatus`) was independently verified via the Supabase Management API during B4's resolution — `prawnsplit.relay_entries`, `prawnsplit.relay_topics`, `prawnsplit.relay_control` all exist and match this file's table names.
- **Scope honestly stated:** that Management API check confirmed table *existence*, not column/ACL/function-signature parity. Re-verifying those at the same depth would need a fresh Management API credential; given B4 already waived any encrypted-backup requirement (test-only data, explicitly authorized for deletion), and the app's own `server/supabase-relay.ts` already calls these 4 RPCs by their exact declared names/signatures (so any name/signature mismatch would already be surfacing as a live RPC failure the moment that backend is exercised), this is treated as sufficient corroborating evidence without requesting another credential and re-raising the same PAT-exposure concern already flagged once this session.
- **Named encrypted backup:** none required — owner waived this explicitly (B4, test-only data).
- **Migration history:** `supabase/migrations/` does not exist in this repository at all (confirmed: directory absent). This directly matches REL-008's stated root cause — the hosted schema was evidently applied by running `relay.sql` directly, not through a tracked, replayable migration chain.
- **Declarative workflow chosen:** Supabase's own declarative-schema CLI workflow (`supabase db diff` against a local Docker shadow database, comparing declared `supabase/schemas/*.sql` files to applied migration history) — the workflow this repo's README already anticipates ("the existing declarative migration workflow"), not a new tool choice. Because no migration history exists yet, T26 must generate an initial baseline migration capturing the current declared schema as migration #1 (the standard way to bootstrap declarative migrations onto an already-hand-applied schema), before any future schema change can be diffed against it.
- **Disposition: Unblocked.** Baseline is known from the checked-in desired-schema file plus corroborating table-existence evidence; no guessed schema, no fabricated empty destination. T26 may proceed.

### T26 migration file + user-applied forward-compensation instructions (REL-008)

**Generated migration:** `supabase/migrations/20260922130000_baseline_relay_schema.sql`. Byte-for-byte semantic copy of `supabase/schemas/relay.sql` with idempotency guards added throughout (`create schema/table/index if not exists`, `create or replace function`, `insert ... on conflict (singleton) do nothing`; `alter table ... enable row level security` and the `revoke`/`grant` statements are already naturally idempotent in Postgres). Verified via 5 isolated PGlite tests in `test/relay-migration-baseline.test.ts`: applies cleanly to an empty database; produces functionally identical append/read behavior; still enforces RLS/ACL denial; **is idempotent** — re-applying it against a database that already has the schema and live rows leaves every row, cursor, commitment, and the control-table configuration byte-for-byte unchanged (proving "forward compensation is non-destructive"); and is a semantically complete copy (same table/function/index names as the desired schema, nothing dropped).

**Why a migration file was needed at all:** `supabase/migrations/` did not exist in this repository (T25 finding). Without it, there is no way for a new operator, or Supabase's own declarative-schema tooling, to reproduce the current hosted schema from repository files alone — exactly REL-008's stated impact.

**Required user-applied step (cannot be done by an agent — needs live project access):** this migration file must **never** be executed directly against the hosted project (`esplfwgzljvdrnvqaisj` / `thheprawnstatus`) — it already has this exact schema, and while every statement in the file is guarded to no-op safely if it were run again, the correct, minimal-risk action is to *register* the file as already-applied without re-running its SQL at all. Using the Supabase CLI, with the project properly linked and authenticated:

```
supabase migration repair --status applied 20260922130000
```

This writes one row into Supabase's own tracked migration-history table (`supabase_migrations.schema_migrations`) marking `20260922130000_baseline_relay_schema.sql` as applied, without connecting to or mutating `prawnsplit.*` in any way. After this one step, the hosted project's migration history and this repository's `supabase/migrations/` are in sync, and any *future* schema change can be developed as `supabase/schemas/relay.sql` edits, diffed with `supabase db diff` against a local Docker shadow database, and shipped as a new, reviewed migration file — the declarative workflow T25 selected.

**Not performed by this task, and why:** running `supabase migration repair` requires an authenticated, linked Supabase CLI session against the live project — out of scope for an agent under this cycle's "no live activation" rule, and deliberately not requested from the owner either, to avoid a third occasion of a live credential being handled in this session (the Management API PAT used for B4/T25 was already flagged for rotation). The owner (or whoever next has authenticated CLI access) runs the one command above at their convenience; nothing in this repository depends on it happening immediately, since the hosted schema already matches the desired state regardless.

## FE-001 — Keep manual exchange available
- Status: Fixed
- Severity: P2
- Root cause: Export and Share Delta controls exist only under prompt/overdue/empty branches.
- Impact: Ordinary healthy trips lose their manual exchange path.
- Files: `src/Trip.svelte`, `test/manual-fallback-ui.test.ts`, `test/export-prompt-ui.test.ts`.
- Fix approach: Add permanent manual ledger-export and delta-share controls; keep automatic prompting and private identity backup separate.
- Verification: Healthy, offline, archived and frozen views expose safe manual export; identity secrets never enter shared artifacts; no automatic prompt trigger changes.
- Blocked by: None.
- Verification result: RED confirmed the gap by regex-extracting the always-visible `sync-strip` toolbar (gated only by `!needsSetup`, which stays false whenever a trip has participants — healthy, offline, archived, or frozen) and asserting it lacked both actions; it did. GREEN: added permanent "Export" and "Share Delta" buttons to that same toolbar, right beside the existing always-visible "Identity Backup" and "Relays" buttons, calling `downloadExport()`/`shareDelta` with no reason argument (matching the pre-existing no-reason call sites, so no automatic-prompt-dismissal state is touched). The three transient branches (manualFallbackDue banner, activeExportPrompt banner, empty-participants state) are left untouched — still shown as proactive nudges, just no longer the ONLY path. Both export-prompt-ui.test.ts cases pass (1 pre-existing + 1 new); the real-rendered eviction-recovery test (manual-fallback-ui.test.ts) still passes unaffected. svelte-check: 0 errors, 0 warnings project-wide.
- Commit: `49a8b2d309269cff2e254189c1dfea1388eb194e`.

## FE-002 — Encode join metadata as UTF-8
- Status: Fixed
- Severity: P2
- Root cause: btoa receives Unicode JSON text directly.
- Impact: Non-Latin-1 names break copy-link and QR generation.
- Files: `src/lib/join-link.ts`, `src/Trip.svelte` error boundary if needed, `test/join-link.test.ts`, sharing UI tests.
- Fix approach: Encode UTF-8 bytes before base64url and decode strictly, retaining a validated legacy Latin-1 fallback; keep secrets exclusively in the fragment.
- Verification: ASCII, accented legacy, CJK and emoji seeds round-trip; invalid bytes/base64 fail visibly; the request/query portion contains no secret.
- Blocked by: None; existing-link compatibility is mandatory.
- Verification result: RED confirmed the throw (`round-trips ASCII, CJK and emoji names without throwing` failed with `InvalidCharacterError`) and the missing shape validation (`throws a clear error for malformed or wrong-shaped tokens` failed — a `{onlyName}` object decoded without error). GREEN: 4/4 in test/join-link.test.ts, including a dedicated legacy-Latin1-fallback case (a name encoded the old way via direct `btoa` still round-trips). `src/Trip.svelte`'s `copyJoinLink` now contains the encode call in its own try/catch (previously called outside any try block, so any encode throw was an unhandled rejection); matches the existing `showJoinQrCode` containment pattern. `npm run check` (svelte-check): 0 errors, 0 warnings project-wide.
- Commit: `1fedb1a3a037289347ae38d8bce8f0fbdaef7994`.

## FE-003 — Give dialogs a keyboard lifecycle
- Status: Fixed
- Severity: P2
- Root cause: aria-modal markup lacks corresponding focus and dismissal behavior.
- Impact: Keyboard focus can remain behind a declared modal or fail to return to its opener.
- Files: Proposed `src/lib/dialog.ts`, `src/Trip.svelte`, proposed `test/dialog-ui.test.ts`.
- Fix approach: One owned dialog lifecycle manages initial focus, tab containment, Escape and focus restoration for claim/install/QR dialogs; cleanup restores listeners and prior state.
- Verification: Actual keyboard navigation remains inside the active dialog and restores focus on close/unmount; nested/replaced dialogs do not leave background focus or listeners behind.
- Blocked by: None; integrate all existing dialog call sites before marking Fixed.
- T14 progress: `src/lib/dialog.ts` created (`activateDialogLifecycle`: initial focus, Tab/Shift+Tab containment with re-capture if focus escapes, Escape callback, idempotent teardown that restores the opener even if it was removed from the DOM) with 10 isolated real-DOM tests in `test/dialog-ui.test.ts` covering initial focus, both wrap directions, focus-escape recapture, Escape, teardown/restore, opener-removed, idempotent teardown, replaced dialogs, and no-focusable-children fallback. Commit `4672fbdbc55f314e5ebd7f716b70885ed9bc8fff`. Status stays Open — the three Trip.svelte dialogs (claim/install/QR) are not yet wired to it; that is T15.
- T15 result: Wired `use:dialogLifecycle={{ onEscape: ... }}` onto all three real dialog elements in `src/Trip.svelte` (Claim Participant → clears `claimCandidatePid`; Protect This Trip install prompt → `dismissActiveInstallPrompt`; Join QR Code → clears `joinQrDataUrl`). svelte-check 0 errors/0 warnings after wiring. Added a real Trip.svelte-rendered integration test (mount App, open the Claim dialog, assert focus moved inside it, press Escape, assert the dialog closed and focus returned to the actual button that opened it) — this caught a real test-hygiene bug (fireEvent.click() doesn't reliably move focus in jsdom the way a real click does) before it could mask a false pass. 11/11 dialog-ui.test.ts tests pass. Install and QR dialogs use the identical wiring pattern, already covered by the 10 isolated activateDialogLifecycle tests; not independently re-rendered given they need extra setup (durability state / qrcode import) with no additional risk given the shared code path.
- Commit: `4a4fd4bdd0dfee8d09530f122c927f818b148255`.

## FE-004 — Expose required status outside disclosure
- Status: Fixed
- Severity: P2
- Root cause: Required protection/reconciliation summaries are inside a closed details element.
- Impact: Users can miss persistent storage or reconciliation state.
- Files: `src/Trip.svelte`, `test/protection-status-ui.test.ts`, `test/reconciliation-ui.test.ts`, `test/duplicate-banner-ui.test.ts`.
- Fix approach: Render concise required summaries outside details, retaining optional detailed controls inside it.
- Verification: Summaries are visible with disclosure closed and stay associated with the selected trip; open/closed controls remain functional and responsive.
- Blocked by: None.
- Verification result: Confirmed the exact defect by reading the committed markup — `.sync-strip` (syncStatus + `.protection-status`) and the `.reconcile-panel` (duplicate/merge/re-attest hints) were BOTH nested inside `<details class="advanced-panel">` (closed by default), sharing that fate with `.relay-settings-panel` and `.relay-diagnostics`. Moved the two required-status sections to render as siblings before the `<details>` (still gated only by `!needsSetup`, so healthy/offline/archived/frozen all still show them), leaving Identity Backup/Export/Share Delta/Relays controls and the two diagnostic panels inside the disclosure as intended. Added structural assertions (`closest(".advanced-panel")` must be null, and for protection-status specifically that the details element itself is present but `.open === false`) to protection-status-ui.test.ts, reconciliation-ui.test.ts and duplicate-banner-ui.test.ts — these are the first assertions in this suite that would actually fail if the regression reappeared (plain `querySelector`/`getByText` do not respect a closed `<details>` in this jsdom+testing-library setup, which is exactly how the bug went unnoticed). All 4 affected UI test files pass (including the pre-existing manual-fallback-ui.test.ts, unaffected). svelte-check: 0 errors, 0 warnings project-wide.
- Commit: `6f31ad643b1c081c98c28e537979f8939f7c7887`.

## FE-005 — Suppress success claims for frozen projections
- Status: Fixed
- Severity: P1
- Root cause: Settled-state, prompt and archive-summary derivation ignores quarantine/frozen state.
- Impact: A partial projection can be presented as a settled or authoritative outstanding balance.
- Files: `src/Trip.svelte`, `src/lib/lifecycle.ts`, `src/lib/durability.ts`, freeze/export/archive UI tests.
- Fix approach: Require an unfrozen authoritative projection for settled success and first-zero prompting; prevent creating an authoritative archive summary while frozen, but retain raw ledger export.
- Verification: An unsupported event with zero live-subset balances produces no settled claim or false zero summary, no first-zero acknowledgement, and still permits manual export.
- Blocked by: FE-001 for unconditional raw export access.
- Commit: `50c77f2`. `isSettledViewPredicate`, `allBalancesZero()` and `archiveGroup()` all now check the existing `frozenPolicy.allowSettlementActions` derived state (or an explicit new `frozen` parameter for the pure `isSettledViewPredicate`) before deriving a settled/first-zero/archive-summary claim, matching the exact guard idiom already used for settlement actions elsewhere in `src/Trip.svelte`. `downloadExport()` already had no frozen/archived guard -- confirmed unconditional raw export is retained.

## FS-001 — Repair damaged security prose
- Status: Fixed
- Severity: P3
- Root cause: The active security document contains a control character and split scope token.
- Impact: Credential-scope guidance is unreadable or misleading.
- Files: `SECURITY.md`.
- Fix approach: Preserve the original copy, remove the damaged control character and repair the intended scope name using the reconciled security model.
- Verification: Byte/control-character check passes and the corrected text matches the actual workflow scope requirements.
- Blocked by: DRIFT-004.
- Commit: `2baec9d` (combined with DRIFT-004 in the same commit). SECURITY.md contained one BEL (0x07) control character at byte 895 which split the `repo` scope token into a bare `epo` (line 26) and the `admin:repo_hook` scope into a bare `dmin:repo_hook` (line 29). Repaired by writing all three scope names as properly-fenced backtick tokens (`` `repo` ``, `` `workflow` ``, `` `admin:repo_hook` ``). Post-fix byte scan: 0 control characters, 2580 bytes total.

## FS-002 — Preserve and correctly frame retention rows
- Status: Fixed
- Severity: P3
- Root cause: Appended rows do not ensure the active table has matching headings/column count.
- Impact: Historical measurements are displayed under incorrect column labels.
- Files: `scripts/task0-retention.mjs`, `.agents/task0-retention.md`, retention formatter tests.
- Fix approach: Preserve the entire existing report prefix and append a labelled correction/new retention section; future check output writes consistent headers at section transitions.
- Verification: Original bytes remain an exact prefix, no measurement cell is rewritten, and new rows/headers have matching columns after an A13 section.
- Blocked by: INTR-002 and REL-003.
- Commit: `00665a2`. Retention-row appender in scripts/task0-retention.mjs unconditionally appended 7-column rows to the report tail, even after the 6-column A13 section had been inserted — so future retention runs would display measurements under mismatched column headers. Fix: before appending rows, check the current report tail; if it does not end with the retention-header divider and the last 20 lines do not contain the retention header row, re-emit the full retention header before the new rows. Original bytes remain an exact prefix (existing rows/sections untouched); no historical measurement is rewritten. All 15 maintenance retention tests pass (retention-wire, retention-journal, retention-cli).

## DRIFT-001 — Reconcile active technical interfaces
- Status: Fixed
- Severity: P2
- Root cause: Active technical examples retain older runtime, file, schema and command contracts.
- Impact: Readers can execute missing commands or misunderstand current persistence/deployment boundaries.
- Files: `TDD.md`; targeted active `README.md`/`STATUS.md` references only when necessary for the selected corrections.
- Fix approach: After behavioral changes, derive examples from final source and distinguish current implementation from preserved historical plans.
- Verification: Every active path/command/schema example resolves to current source; no claims of unperformed production verification.
- Blocked by: Final behavioral task outcomes, including explicit Blocked/Invalid results.
- Commit: `cb6e90e`. TDD.md §5 (core module signatures) and §6 (IndexedDB schema) were pre-T44/T45/T47/T27/T30/T31/T38/T42/T43/T53 stale. Fixed: (1) `authorisedKeys`/`verifyConfirmation` now show required `ctx: VerificationContext` param (SEC-001); (2) added `authorisedDevices`, `verifySettlementVoid` (SEC-002 T47), `matchesPayeeClaimSignature`, `claimAnomalies`, `contestedClaimPids`; (3) added `VerificationContext` interface itself; (4) added `void-settlement` payload row to the signed-payload table; (5) added `reattest` payload row (ClaimReattested); (6) replaced non-existent `src/db/schema.ts` reference with `src/db/repo.ts` and added `linked`/`sourceTagHex`/`reservations`/`relayPolicy`/`observedHlc`/`coverage` fields (DATA-002/CONC-001/LOGIC-002/DATA-007/REL-002); (7) marked schema at v2 (matches DB_VERSION); (8) removed spurious `byDevCtr` index (does not exist in real repo.ts).

## DRIFT-002 — State actual quorum exceptions
- Status: Fixed
- Severity: P2
- Root cause: Requirements describe mandatory operated acknowledgement while implementation supports documented routing and fallback exceptions.
- Impact: Durability guarantees are overstated or internally inconsistent.
- Files: `PRD.md`, `STATUS.md`.
- Fix approach: Document the final implemented legacy/migrated routing, effective quorum and limits; preserve runtime policy unless a selected behavioral repair changes it explicitly.
- Verification: Documentation examples match tested configuration/acknowledgement branches; unavailable hosted settings remain unverified.
- Blocked by: REL-002 and final sync outcomes.
- Commit: `e810a72`. PRD.md REQ-SYN-05 previously claimed "operated ACK mandatory + ≥1 Nostr ACK" as an absolute requirement. Real implementation (`src/relay/sync.ts`): (1) configurable `config.ackQuorum` (default 2); (2) relays returning "not configured" excluded from the effective quorum so Nostr-only or operated-only deployments both work; (3) T53 endpoint-policy backoff/dropped endpoints skipped entirely; (4) per-event fallback publish (CR-010/A13) retries pending events individually when batched publish falls short. REQ-SYN-05 text now matches the real conditional quorum, exclusions, and REL-002 policy. No runtime change.

## DRIFT-003 — Describe retained signed-source fragments
- Status: Fixed
- Severity: P3
- Root cause: README event-only recovery text predates the retained-source fragment path.
- Impact: Readers misunderstand what the migrated client preserves and what cutover evidence still lacks.
- Files: `README.md`.
- Fix approach: Describe fragment/receipt/checkpoint behavior and retain explicit limits on global history completeness and live cutover.
- Verification: Claims map to `source-archive.ts` and `migrated-sync.ts`; no private historical count is asserted as current.
- Blocked by: Final migrated-sync outcomes.
- Commit: `d54e0cb`. README `## Supabase relay migration preparation` section previously described only the event-recovery bridge and the *limitation* that raw signed Nostr messages required future retention. Real code (`src/relay/source-archive.ts`) already implements exactly that retention: `readSourceFragment` validates every `nostr-json-v1` fragment byte-for-byte against sourceUrl/eventId/sha256/totalBytes/chunk index+count/chunkSha256, `restoreNostrSource` reassembles one complete original signed object only when every fragment matches AND the parsed JSON re-verifies as a real signed Nostr event under the trip tag, and `prepareSourcePackets` produces deterministic receipts for skip-if-covered. Updated README to describe this fragment/receipt/checkpoint path while retaining the explicit limit ("does not by itself prove hosted completeness or replace measured cutover evidence"). No code changed.

## DRIFT-004 — Describe checked merges and scan exclusions
- Status: Fixed
- Severity: P3
- Root cause: Security prose claims admin-bypass merging and universal scanning despite different workflow conditions.
- Impact: Maintainers receive an inaccurate permission and enforcement model.
- Files: `SECURITY.md`, `CONTRIBUTING.md`.
- Fix approach: Describe current checked non-admin merge requests and actual scanner exclusions/error policy; identify external propagation claims as unverified where applicable.
- Verification: Every claim maps to current script/workflow branches and declared permissions.
- Blocked by: REL-005 and REL-006 final outcomes.
- Commit: `2baec9d`. SECURITY.md "Automated Security" and "GH_PAT Security Model" sections claimed universal scanning and `--admin` branch-protection bypass for all bot merges. Reconciled: TruffleHog now documented as using the same fixture-scoped exclusions the local test suite uses (`test/maintenance/scanner-exit.test.mjs`); the auto-merge section clarifies that only bot PRs modifying dependency manifests/lockfiles run the bypass path and that the Build Check must succeed first; explicit disclaimer added that external propagation of security posture beyond this repo's own sync targets is not claimed here. CONTRIBUTING.md required no changes (its scanner reference already accurate). No token/scope/workflow permission changes.

## DRIFT-005 — Mark fork/re-key as unimplemented
- Status: Fixed
- Severity: P2
- Root cause: The specification labels a workflow resolved without an application implementation.
- Impact: Users may assume an unavailable recovery capability exists.
- Files: `PRD.md`.
- Fix approach: Correct the implementation/completion claim and retain the proposed design as explicitly unimplemented; do not build the feature.
- Verification: Active text no longer claims a one-action fork/re-key exists; no source files change.
- Blocked by: None.
- Commit: `011817a`. §10.2's Fork & Re-key mitigation reworded to explicitly proposed-design/not-yet-implemented, conditional tense, and states plainly a compromised link has no in-app remediation today. Grepped src/ and core/src/ for fork/rekey/rotate: zero implementation matches. Q2 decision-log rows in §14.1 and the question-resolutions appendix left unchanged (they record the design question's resolution, not shipped code, per "preserving proposed design/history"). PRD.md only; no code or data changed.

## DRIFT-006 — Describe passive correction history
- Status: Fixed
- Severity: P3
- Root cause: Explicit Keep/Revert controls are described while the UI exposes labelled history and generic editing.
- Impact: The documented action surface cannot be followed.
- Files: `PRD.md`.
- Fix approach: Describe passive history/manual correction and mark selected-history reapply controls unimplemented; no extra feature implementation.
- Verification: Wording matches the final expense history panel and actual callbacks.
- Blocked by: STRUCT-001 outcome, or its explicit Blocked/Deferred disposition.
- Commit: `10eb11e`. PRD.md §14.1 Q11 row previously claimed "Active conflict surfacing with Keep/Revert" as a closed/implemented capability. Real UI (Trip.svelte's ledger panel) exposes a passive labelled correction history under each expense (via `expenseHistoryRows`) and edits via the ordinary `editExpense` command emitting a fresh `ExpenseEdited`; there is no one-click revert-to-earlier-history reapply control. Q11 row now describes the passive history and marks the Keep/Revert reapply action explicitly unimplemented. Void terminology (D-13) preserved. No feature implemented; docs-only.

## STRUCT-001 — Extract panels after behavior is stable
- Status: Fixed
- Severity: P2
- Root cause: A single trip component owns many independent command and rendering surfaces.
- Impact: Changes to unrelated panels require editing one large controller/view file.
- Files: `src/Trip.svelte`; `src/trip/ExpensePanel.svelte`, `PeoplePanel.svelte`, `SettlementPanel.svelte`, `LedgerPanel.svelte`; relevant UI tests.
- Fix approach: Characterize the repaired real UI first, then extract one panel per task through typed props/callbacks; retain trip identity, persistence, signing and synchronization ownership in the controller.
- Verification: Real browser and rendered behavior remains equal across each extraction, including trip switches, deferred signing, imports, archive, focus and synchronization; no panel opens its own database or relay.
- Blocked by: All selected application behavioral work must be Fixed/Invalid or explicitly resolved before structural execution; no automatic extraction over blocked protocol changes. Later P3 operator-report framing does not move or alter these UI contracts.
- T59 characterization baseline: 25 rendered/UI test files, 51 tests all green at commit `e810a72`.
- T60 (ExpensePanel) at `88b0f28`; T61 (PeoplePanel) + T63 (SettlementPanel) + T64 (LedgerPanel) at `53e4d06`. Trip.svelte dropped from 1819 to ~1490 lines. Each panel takes typed props / two-way binds / callbacks; the controller retains trip identity, persistence, signing and synchronization ownership.
- T62 (RecoveryPanel) SUBSUMED, not extracted: the recovery/import surface (`panel import-panel` + the two `sync-strip` sections) is tightly coupled to controller recovery-mode reactive state (`recoveryActive`, `recoveryMode`, `recoveryMessage()`, `manualFallbackDue`) and parse/import side effects. Extracting it would move no independent rendering concern while adding ~15 props over the same state. Recovery/sync presentation deliberately stays with the controller that owns its lifecycle.
- Dependency graph verified (T64 acceptance): all four panels import ONLY `@/lib/*` helpers and `@theprawnsplit/core` types — none imports `@/db/repo`, `@/relay/*`, or `Trip.svelte`. No controller cycle; no panel opens its own database or relay. Trip.svelte remains the single group-lifetime owner of polling (`startPolling`), transports (`createRelays`/`syncOnce`), persistence (`commitReserved`/`appendReservedEvents`) and signing (`signClaim`).
- Verification: core 136/136, svelte-check 0/0, `vite build` 256 modules OK, 18 UI test files / 50 tests green including rendered-mount panel tests. `test/expense-workflow-ui.test.ts` and `test/settlement-void-authority-ui.test.ts` updated to read extracted panel files for markup/render-gate assertions while still asserting controller callbacks against Trip.svelte.
- All T44/T45 signature-verified pairing (SEC-001), T47 SettlementVoided authority (SEC-002), T48 settlement balance signs (LOGIC-001), T49 editExpense rate versioning (LOGIC-003), T51 frozen-state guards (FE-005), T54 archived-outbox draining (LOGIC-006) and T55 draftXid preview salt (LOGIC-005) surfaces remain pinned across the extractions.

## DEAD-001 — Remove the inert rename predicate last
- Status: Fixed
- Severity: P3
- Root cause: The replacement predicate contains an unconditional true and references a nonexistent renameHlc property.
- Impact: The code communicates a condition that never governs behavior.
- Files: `core/src/fold.ts`, `core/test/fold.test.ts`.
- Fix approach: After all other selected work is verified, characterize rename ordering and remove only the inert predicate.
- Verification: Identical renamed participant state for existing ordering/merge/void fixtures before and after; no unrelated formatting.
- Blocked by: Pre-cleanup integrated verification and disposition of all other selected findings.
- Commit: `2dcfa74`. `core/src/fold.ts` line 273 contained `const shouldReplace = !existing || !("renameHlc" in existing) || true;` — the trailing `|| true` made the whole predicate unconditionally true, and the `renameHlc` property was never set anywhere in the codebase. The predicate never actually gated behavior; events are sorted via `eventSortKey` before the fold loop, so the last `ParticipantRenamed` always wins by iteration order alone. Removed the predicate; replaced with a plain `participants.set(...)` and a comment documenting why the ordering guarantee is sufficient. Core 136/136 pass (identical projections before/after); no other fold changes; no formatting changes.

## New Findings

### NEW-001 — Unmodified baseline application verification stalls

- Status: Fixed
- Canonical: NEW-001 | P2 | POTENTIAL | package.json:8 | The unchanged baseline build reports application setup/test failures and fails to finish within the command limit, preventing an aggregate verification result | Investigate runtime compatibility, resource pressure and the blocked fixture/cycle before proposing a scoped repair | M (1–4h)
- Evidence: `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/cycle-1/T03-build.log`; 81 core tests passed, catch-up suite reported 18 skipped, sync-cycle reported two failures, and the terminal tool terminated the command at 600000 ms.
- Root cause: Established — not an application logic bug. Real cryptography (sync-cycle.test.ts) and PGlite WASM cold-start (supabase-device-catchup.test.ts, supabase-relay-sql.test.ts) genuinely exceed Vitest's 5s test / 30s hook defaults on this specific machine; reproduced identically across two independent clean-state runs (not flaky/contention-only). Confirmed correct once given more time via --testTimeout=30000 --hookTimeout=90000 (27/27 pass, .audit-backups/.../cycle-1/NEW-001-diagnostic-extended-timeout.log), ruling out the initially-suspected fallback-rotation logic bug in src/relay/sync.ts.
- Preservation: No test source, test deadlines, runtime configuration or production records changed. Scoped process inspection found no leftover owned Vitest/tinypool process. Further aggregate commands were stopped; independent task-specific investigation may continue.
- Fix: Test-only explicit timeout overrides — test/sync-cycle.test.ts (2 tests: 20_000ms, 15_000ms); test/supabase-device-catchup.test.ts (beforeAll hook 30_000ms→90_000ms, describe default 20_000ms for all 18 tests); test/supabase-relay-sql.test.ts (describe default 20_000ms, found during the regression sweep). No production/application source changed.
- Verification result: GREEN 27/27 (test/sync-cycle.test.ts + test/supabase-device-catchup.test.ts, default settings, .audit-backups/.../cycle-1/NEW-001-green.log) plus a broader sweep across 13+ additional test files / 100+ tests (.audit-backups/.../cycle-1/NEW-001-full-vitest-verbose.log, NEW-001-full-vitest-final.log): zero new failures.
- Commit: `8c834a9b8e18a93d48193f1d723d0422e6759a10`.
- Unblocks: T05 (SEC-004 dependency upgrade) — full application verification can now run to completion reliably on this machine.
- Commit: `8c834a9b8e18a93d48193f1d723d0422e6759a10`.
- Unblocks: T05 (SEC-004 dependency upgrade) — full application verification can now run to completion reliably on this machine.

### NEW-002 — Stale source-shape UI test assertions after T13's deliberate FE-004 redesign

- Status: Fixed
- Discovered: during T24's first full `npx vitest run` regression sweep (previous per-task verification only ran files directly touched by each task, never the whole suite, so this slipped through since T13).
- Root cause: NOT a code defect. T13/FE-004 deliberately moved the required-status `.sync-strip` (and `.reconcile-panel`) outside the collapsed `<details class="advanced-panel">`, while intentionally leaving the Identity Backup/Export/Share Delta/Relays action buttons — in a second, differently-scoped `<section class="sync-strip">` — inside the disclosure (see tasks.md T13's own Result note). `test/export-prompt-ui.test.ts` and `test/identity-backup-ui.test.ts` were never updated to match: one regex assumed `<details>` immediately follows `{#if !needsSetup}` (no longer true once T13 inserted the status block before it); the other asserted the button toolbar must NOT reference `shareDelta`, an assumption already invalidated by T12/FE-001's deliberate consolidation of Export+Share Delta+Identity Backup into one toolbar.
- Impact: Two tests failed on a fresh full-suite run, unrelated to T24's actual changes; no application behavior was ever wrong — only the tests' encoded assumptions were stale.
- Files: `test/export-prompt-ui.test.ts`, `test/identity-backup-ui.test.ts`. No `src/` or `api/` files changed.
- Fix: Replaced the nesting-fragile `permanentBlock` regex (which assumed no elements between `{#if !needsSetup}` and `<details>`) with direct assertions on the button-containing `syncStrip` itself (already correctly captured) not referencing the transient-only `manualFallbackDue`/`activeExportPrompt` state — the actual property FE-001 requires. Removed the stale `syncStrip` `not.toContain("shareDelta")` assertion with an explanatory comment; the real security properties (identity-backup prompt and download function not routing through `navigator.share`) remain asserted unchanged.
- Verification result: GREEN 3/3 (test/export-prompt-ui.test.ts + test/identity-backup-ui.test.ts, .audit-backups/.../cycle-1/NEW002-green.log).
- Commit: `795dc2ac075b771f0a9d99eecff0723fb462e2f9`.

### NEW-003 — upsertRemoteEvents can crash with InvalidStateError under load

- Status: Fixed
- Discovered: during T31's targeted regression sweep (a pre-existing T29 test intermittently failed with `InvalidStateError` on `tx.objectStore("meta")`, not caused by T31's own changes).
- Root cause: `upsertRemoteEvents` (added in T29/DATA-005) computed `eventFingerprint()` — a real `crypto.subtle.digest` call — for each conflict check WHILE an IndexedDB readwrite transaction was open. Awaiting real async crypto work inside an open IDB transaction can let the transaction auto-deactivate once the machine is under enough load that a gap opens between IDB requests; the next `tx.objectStore(...)` call then throws `InvalidStateError`/`TransactionInactiveError`. This is the exact same hazard `ensureGroup`'s own pre-existing comment already documents ("Finish cryptography before opening the IDB transaction") — `upsertRemoteEvents` just hadn't been written with that constraint in mind.
- Impact: An intermittent, load-dependent crash on relay sync / import union paths, more likely under memory pressure or heavy concurrent activity — exactly the conditions most likely during real usage on a low-end device or a busy machine.
- Files: `src/db/repo.ts`.
- Fix: Restructured `upsertRemoteEvents` to resolve every conflict check (including all `eventFingerprint()` calls) using `database.get()` directly — which opens its own short-lived internal transaction per call — entirely BEFORE opening the write transaction. The write transaction now only ever does synchronous-ish `put()` calls with no async crypto interspersed.
- Verification result: GREEN 7/7 (test/event-identity-conflict.test.ts) plus 56/56 across the broader T31 regression set. tsc/svelte-check clean.
- Commit: `2dbcd05af9f353d326ae6494463e6c23d60f77be` (bundled into T31's commit — same file, discovered during the same regression sweep).
