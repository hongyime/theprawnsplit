# Remediation Design — Execution Cycle 1

## Approval boundary and scope

- **Execution approved:** the user explicitly replied APPROVE to these artifacts. The unchanged design below governs execution; B1–B4 still require their separate inputs, and no live mutation or deployment is authorized.
- Selected: all 49 register IDs in `AUDIT.md`; exact selection and resume gate are in `execute_state.json`.
- Baseline: `e63962f47dc4b38378bed33eadd57b134458411d`; preserve the existing branch and all pre-existing worktree changes. No checkout, rebase, stash, push or deployment is part of planning.
- Requested preference: P2 → P1 → P3. `tasks.md` executes independent P2 changes first, then P1 dependency chains, then dependent P2 work and structural extraction, then P3. This prevents a P2 optimization from being built on an authorization or transaction contract that a later P1 fix replaces.
- Four selected findings remain blocked: SEC-003/B1, SEC-002/B2, DATA-006/B3, REL-008/B4. Plan approval alone does not resolve their business-policy/access gates.
- All other statuses start Open. SEC-004 retains POTENTIAL confidence until verified. No fixes or test results are claimed at planning time.

## Decisions included in this proposed plan

| Decision | Proposed behavior to approve |
|---|---|
| Severity order | Independent P2 → P1 → dependency-bound P2 → structural extraction → P3; prerequisite order overrides simple severity sorting. |
| Legacy confirmation | Keep every original record and economic effect; never fabricate a payee signature. An unsigned historical born-confirmation is not retained as cryptographic proof merely because its device string matches. Explicitly display unverified/pending status where applicable. |
| Keyless import | Preserve readable/exportable imported history as explicitly unlinked/offline until a matching seed is supplied. Never generate a replacement secret under the original tag. |
| Existing mismatched key | Preserve it and report the mismatch. Do not overwrite it, infer the intended secret or bulk-repair existing browser databases. |
| Future schema input | Validate common framing, retain original opaque future payloads, and freeze authoritative projection; do not reject all future events or coerce them into known variants. |
| Event reservations | Unique counter ranges may leave unused gaps after cancellation/interruption. Only committed events count as delivery; no synthetic ledger event is created to fill a gap. |
| Coverage | Legacy transport vectors remain fetch-progress metadata; absence of new durable coverage evidence means unknown, not everyone-has-this. |
| Frozen archive | Block creation of an authoritative outstanding-balance archive summary while frozen; preserve unconditional raw ledger export instead of writing an invented zero summary. |
| Vet exit status | PASS=0, FAIL=1, WARN=2; only PASS passes an admission gate. |
| Scanner policy | Preserve report upload and existing intentional findings policy, but tool/configuration/network failure cannot be converted to success. |
| Hosted actions | Modify source/workflow/migration files only after approval; no automatic repository capability enablement, live SQL write, credential change, relay test publication or provider switch. |
| Documentation-only selections | DRIFT-005 and DRIFT-006 correct completion claims; they do not authorize building fork/re-key or Keep/Revert features. |

## Explicit unresolved gates

### B1 — SEC-003 budget policy — RESOLVED

Owner-approved budgets (defaults suggested by Sisyphus given the whole stack sits on free tiers across Vercel/Upstash/Supabase, adopted as-is): max 20 enrollments per group, max 50 groups per author key, rate limit 5 events/sec per group, storage budget 5,000,000 bytes (5MB) per group.

Failure/response semantics (owner-approved): a request that would exceed any of the above budgets is rejected with HTTP 429 Too Many Requests plus a `Retry-After` header hinting a backoff window. Rejection is a pure read-then-deny — it claims no proof/cursor and mutates no history; there is no partial write. This applies uniformly whether the limit hit is enrollment count, group count, event rate or storage bytes.

Export metadata treatment (owner-approved): admission metadata stays limited to group tag, event count, `created_at` min/max and schema/proof version — no new plaintext beyond what the encrypted envelope already exposes. Compatible with the existing encrypted source export/parity contract.

None of this changes any `.env` value, live provider setting or deployed behavior in this cycle; it is a recorded policy only. Implementation lands at T24 in the normal task queue. Source inventory and capacity evidence must still establish how existing records are counted before T24 begins; a local in-memory rate counter is not a cross-instance limit, and a zero budget must not silently disable the existing service.

The approved design must also account for quota metadata in the encrypted export allowlist, stability checks and replay/parity tooling. Adding unrecognized keys that make the exporter fail is not an acceptable intermediate release.

### B2 — SEC-002 reversal ownership and historical effects

Required before T47:

1. Does reversal authority belong to the cryptographic recorder, the literal payer, or another explicitly named actor when a shadow participant's payment is recorded?
2. How are already-retained unsigned reversals represented without silently resurrecting debts or endorsing forged historical authority?


**RESOLVED (T46) — full B2 specification, required before T47 writes any code:**

1. **Signer**: reversal authority belongs to "any current group member" (owner decision), meaning ANY pid with a non-empty `authorisedKeys(events, pid, ctx)` set at fold time — explicitly UNRESTRICTED to the settlement's own `from`/`to` parties or to the device that originally recorded it. This resolves open Question 1 as "another explicitly named actor: any current group member", not the cryptographic recorder and not the literal payer/payee specifically. A shadow payee (never claimed, `cashUnconfirmable`) or a settlement recorded by an unrelated third-party device does not change this — the SAME any-current-member rule applies uniformly; there is no separate carve-out for those cases (this is the explicit approved outcome T46's acceptance criterion requires for the shadow-payer/third-party-recorder case).
2. **Domain-bound cancellation payload**: `${ctx.groupTag}:void-settlement:${sid}` — a NEW domain prefix distinct from every existing one (`:confirm:`, `:link:`, `:reattest:`), so a signature produced for any other purpose can never be replayed as a settlement-void authorization, and vice versa.
3. **Signer/algorithm fields (schema)**: `SettlementVoided` (`core/src/types.ts`) gains two new REQUIRED fields — `pid: string` (the authorizing group member) and `sig: string` (signature over the domain-bound payload above, verified against `pid`'s `authorisedKeys`, mirroring `verifyConfirmation`'s exact `verifiesWithAny` pattern; the signing algorithm is looked up the same way `SettlementConfirmed`/`verifyConfirmation` already do via `findAlg`/`keyAlgsFor`, so no separate `alg` field is needed on the event itself). The event's own `dev`/device-string attribution is NEVER consulted for authorization purposes going forward — only the `pid`+`sig` pair, verified cryptographically.
4. **Supported schema version**: no global `BaseEvent.v` bump is needed. `pid`/`sig` become REQUIRED (not optional) fields on the `SettlementVoided` variant in `core/src/event-validation.ts`'s per-variant parser; an incoming `SettlementVoided` event missing either field fails validation at the parse layer (`kind: "invalid"`) and never reaches `fold.ts` at all — it can never silently apply.
5. **Legacy interpretation**: moot for STORED data — every pre-existing unsigned `SettlementVoided`/`EventVoided` record on the relay was already deleted under B2's own authorization (see `execute_state.json` `verification.policy_gates_resolution.live_data_deletion`; all prior relay content was confirmed developer test data). For the FORWARD contract (defense in depth against a hypothetical old-shaped event arriving from an un-updated client, a corrupted import, or a crafted payload): an old-shaped `SettlementVoided` event (missing `pid`/`sig`) is INVALID per point 4 above, and is treated exactly like any other malformed event — quarantined/rejected at validation, never interpreted as an authorized void, never silently dropped as "legacy exempt". No blanket rejection of a genuinely well-formed HISTORICAL void is implied by this — only ill-formed (missing required fields) events are affected, and none currently exist on the relay to be affected by it.
6. **Old-client behavior**: an already-open old client bundle that only knows the OLD 2-field `SettlementVoided` shape (`{ sid }`, no `pid`/`sig`) can still construct such an event locally, but it will fail validation on ANY device (including the client's own, once its local `event-validation.ts` also enforces the new required fields after an update) and never actually cancel a settlement's economic effect on any up-to-date reader. This is the same "never blanket-resurrect debts" posture as the rest of this finding: an attempted-but-invalid void simply does nothing, leaving the settlement's derived state exactly as if the void attempt had never happened — not an error state requiring recovery, not a silently-accepted cancellation.
7. **Generic `EventVoided` restriction** (per the Fix approach's "restrict generic void targets to that contract") — CORRECTED at T47 implementation time (this point's original text was factually wrong; see below): `core/src/fold.ts`'s main event loop skips ANY event whose id appears in the generic `voidedEventIds` set (`if (voided.has(event.id)) continue;`), and `SettlementRecorded`/`SettlementConfirmed`/`SettlementDisputed` were previously processed inside that SAME loop with no exemption -- meaning a bare, UNSIGNED generic `EventVoided` targeting a `SettlementRecorded` event's own `.id` could make the settlement vanish from `state.settlements` entirely (never added to state at all, not merely left unconfirmed), a MORE severe bypass than "no effect" and requiring NO signature whatsoever. Fixed by exempting `SettlementRecorded`/`SettlementConfirmed`/`SettlementDisputed` from that generic skip check entirely -- only the domain-specific signed `SettlementVoided` contract (verified via `verifySettlementVoid`) may ever affect a settlement's derived state. A generic `EventVoided` naming a settlement-related event id is ALSO flagged as a distinct anomaly (`code: "generic-void-of-settlement-event"`) so the attempt is visible, never a silent no-op.

### B3 — DATA-006 authoritative currency — RESOLVED (T32)

Legacy inconsistent groups: deleted, not reconciled (owner decision, test-data basis — see bugfix.md DATA-006).

Forward-only currency transition contract: a new event type `BaseCurrencyEstablished` (`{pid: n/a; currency: string}` on `BaseEvent`) lets any device correct the group's base currency any time before the first `ExpenseAdded` event exists for the group. At fold time, the earliest-by-HLC *valid* `BaseCurrencyEstablished` event becomes the authoritative base currency (falling back to `GroupCreated.currency` if none exists); any `BaseCurrencyEstablished` event that arrives after the first `ExpenseAdded` (by HLC order) is quarantined as a conflicting anomaly, as is any *additional* `BaseCurrencyEstablished` beyond the first valid one (covers two devices concurrently correcting it before ever syncing). `src/Trip.svelte`'s `setCurrency` must emit this event via `appendEvents` instead of a silent local-only `saveGroup` mutation, and its UI control must disable once any `ExpenseAdded` exists for the group. Existing values are never relabelled, converted or rewritten based on guessed intent — this only governs which currency NEW money is denominated in.

### B4 — REL-008 hosted baseline and preservation — RESOLVED (T25)

Required before T26: exact qualified schema/function/index/ACL/control metadata from a verified read-only channel and confirmation of a named encrypted schema/data backup. An owner-supplied verified capture is acceptable. The audit's failed HTTP 400 attempts are not evidence that hosted objects are absent.

**Baseline established:** the desired schema is fully specified in `supabase/schemas/relay.sql` (3 tables, 5 functions, RLS + blanket-revoke/service_role-grant ACL pattern, 1 index — full inventory recorded in bugfix.md's REL-008 entry, T25 baseline verification). Table-level existence in the hosted project was independently confirmed via the Supabase Management API during B4's resolution. Function/ACL-level parity was not re-verified at that same depth in T25 (would require a fresh Management API credential, re-raising the PAT-exposure concern already flagged once); the app's own `server/supabase-relay.ts` already calling these 4 RPCs by their exact declared names/signatures is treated as sufficient corroborating evidence given the reduced stakes (B4 already waived any encrypted-backup requirement — test-only data). Named encrypted backup: none required, owner-waived. `supabase/migrations/` does not exist in this repository — confirmed absent, matching REL-008's root cause directly.

Generate migration files from the approved desired/baseline comparison using the repository's declarative schema workflow (Supabase's `supabase db diff` against a local Docker shadow database — the workflow this repo's README already anticipates). Because no migration history exists, T26 generates an initial baseline migration capturing the current declared schema as migration #1 before any future change can be diffed against it. Record exact generated filenames before editing them. No live application of migrations, ALTER/UPDATE/DELETE/DROP/TRUNCATE, mutable RPC or restoration over live data is authorized.

## Architecture and allowed dependency direction

Preserve the current application/core/repository/transport split. Add an internal helper only when multiple selected paths need the same corrected contract; do not turn this into a general repository rewrite.

```text
App -> Trip (fixed group lifetime and command ownership)
         -> src/trip/* (proposed views; typed props and callbacks only)
         -> pure domain/validation functions
         -> repository command and transaction boundaries
         -> sync coordinator -> transport adapters -> edge handler -> storage

core event validation -> core types and pure financial rules
identity-backup validation -> Web Crypto helpers (outside DB transactions)
shared event fingerprint -> canonical event bytes (not authorization decisions)
operator scripts -> atomic artifact helper
dependency workflow -> read-only advisory checker
```

- Panel components do not open databases, own Nostr pools, allocate identities, independently poll or sign claims.
- Core remains free of network/IndexedDB/Web Crypto I/O. Asynchronous cryptographic checks are completed outside database transactions.
- Immutable signature verification results may be cached. Current authorization, void decisions and disputed/pending state are recomputed from current retained events.
- Retain current aliases and entry paths. New internal helpers are not accidental public core exports; export only functions actually required by selected callers.

### Proposed modules and the selected pressure each resolves

| Path | Responsibility | Finding |
|---|---|---|
| `core/src/event-validation.ts` | Pure common-frame/known-variant parsing and supported/future distinction | DATA-003 |
| `src/lib/identity-backup-validation.ts` | JWK/public/private consistency and safe restore candidates | DATA-003 |
| `src/lib/event-fingerprint.ts` | One canonical event identity calculation shared by manual and relay paths | DATA-005 |
| `src/lib/dialog.ts` | Owned focus/keyboard lifecycle for existing dialogs | FE-003 |
| `scripts/atomic-artifact.mjs` | Flushed no-clobber publication for operator artifacts | INTR-003, INTR-002 |
| `scripts/check-dependency-advisories.mjs` | Conditional read-only lockfile advisory fallback when native review is unsupported | REL-005 |
| `server/relay-admission.ts` | Approved distributed admission/reservation contract; created only after B1 | SEC-003 |
| `src/trip/ExpensePanel.svelte` | Expense draft/history view | STRUCT-001 |
| `src/trip/PeoplePanel.svelte` | Participant/claim/reconciliation view | STRUCT-001 |
| `src/trip/RecoveryPanel.svelte` | Import/export/recovery view | STRUCT-001 |
| `src/trip/SettlementPanel.svelte` | Settlement view and action callbacks | STRUCT-001 |
| `src/trip/SyncPanel.svelte` | Sync/protection/settings view | STRUCT-001 |

These are proposed output names, not existing-source evidence. Reuse existing helpers where the fresh pre-scan establishes that a new module is unnecessary. Log such a reduction in the ledger; adding further abstractions requires a selected-task justification.

## Data model and migration contracts

| Boundary | Forward strategy | Rollback / compatibility |
|---|---|---|
| Event parsing | Parse known variants before writes; retain original raw JSON for future versions and explicit quarantined data. Do not normalize signatures, money wrappers or unknown future payloads by rewriting originals. | A parser must not replace raw retained input. If readers cannot support the new representation, keep both readers until compatibility is proven; do not roll back to a reader that corrupts it. |
| Duplicate IDs | Compare canonical identity before insert/readback marking. Exact duplicate is idempotent; conflicting content rejects that batch and preserves original source input/checkpoint for user reconciliation. | Old rows are unchanged. Reverting the guard is a security/data-integrity regression, not a data rollback. |
| Full import | Resolve validated tag first; reject ambiguous matches and same-ID/different-tag collision. Merge into the matching group without deleting events, identities, cursors, buffers or unrelated metadata. New imports use isolated local IDs. | No undo by deleting newly merged history. Preserve source artifact and a before-import encrypted snapshot; an operator data repair is separate and never automatic. |
| Linked/unlinked group | Make linkage explicit; a keyless offline import carries source tag/provenance without a fabricated active secret. Crypto/join operations require a verified linked state. An absent linkage field on a valid legacy group preserves its existing behavior. | Avoid a mandatory destructive IndexedDB upgrade. Keep unknown added metadata intact; an older reader that fabricates a key for an unlinked group is not a safe rollback. Release compatibility remains a separate gate. |
| Existing inconsistent secret/tag | Detect and report without replacing either field; preserve all old key material and local history. | No silent repair. Only a separately reviewed owner recovery operation can attach replacement material to an existing inconsistent store. |
| Counter reservations | Transactionally reserve group-scoped monotonic ID ranges; sign/compute outside the transaction; commit only matching reserved identities with collision checks. Capture draft input before awaits. | Unused gaps are allowed and are not acknowledgements. Never lower nextCounter or reuse a reserved ID during rollback. |
| HLC | Add compatible local metadata for the last admitted/issued HLC, advanced within the allocation transaction; initialize from retained admitted events if needed. | Existing event timestamps remain untouched; preserve clock metadata even if a caller is rolled back. |
| Durable coverage | Keep transport/discard progress separate. Use bounded exact coverage intervals/identity evidence that represent holes and committed events; legacy vector-only evidence does not imply possession. | Optional coverage data must survive old/new transport round-trips. New UI is conservative when evidence is absent. No claim that an already-open old bundle gains corrected behavior. |
| Buffer admission/promotion | In one ledger transaction, recheck retained counts/duplicates, insert admitted rows, remove only successfully promoted buffer entries, and merge relevant vectors/cursors. Existing over-limit buffers are retained. | An abort retains the old state. Do not compensate a failed promotion by deleting data or resetting cursors globally. |
| Claim keys | Generate candidate outside IndexedDB; insert-or-return inside one transaction. Restore validates keys before transaction and checks the latest target before replacement. | Preserve working identity and backup bytes; never overwrite a mismatched existing identity merely to make a test pass. |
| Group storage shape | Stop persisting known hydrated-only copies while preserving legitimate durable metadata and all authoritative event/identity stores. | No historical cleanup sweep. Source rollback never restores an old database snapshot over intervening writes. |
| Relay policy | Per-group/per-actual-endpoint retry state is local routing metadata; configured endpoints are preserved. Bounded backoff/demotion has an explicit reset path. | New metadata is optional; do not reset other group metadata or credentials to roll back scheduling changes. |
| Signed cancellation / base currency | Exact contracts are blocked by B2/B3. Require schema/reader transition and legacy semantics before implementation. | No automatic regrading of historical economic effects or guessed currency migration. |
| SQL | After B4, generate versioned guarded deltas and preservation assertions; validate against isolated copies of the verified baseline. | Ship forward-compensation and compatible-reader instructions; no destructive down-migration or live restore. |
| Operator artifacts | New staging file → flush → verified same-filesystem no-clobber publication. Retain failed/staging/final artifacts and old manifests. | Never replace an existing destination. Atomic/no-clobber platform behavior must be demonstrated; unsupported filesystems produce a reported blocker. |
| Cohort journal | Persist pre-signed public wire objects and cohort identity before any publication, then checkpoint each attempt/result. No private signing key in journal. | Resume the same identities rather than generating another cohort; existing completed manifests and measurement bytes remain untouched. |

### Environment and wire-version constraint

Environment files are immutable in this cycle, including `.env.example`. Ordinary corrections use existing configuration names. If a new schema version, deployment threshold or feature activation requires an environment/configuration decision outside the approved source change, stop that task and record the prerequisite; do not bypass the configured support ceiling or weaken the env/config consistency tests. B2/B3 must expressly settle this before their wire-contract tasks proceed.

## Interface changes and caller coverage

| Changed contract | Affected callers that must be checked |
|---|---|
| Full/partial import validation | `parseExport`, `replaceFromExport`, `applyDelta`, `restoreIdentityBackup`; Trip `importExport`; relay decrypt/admission and migrated ingest; export/recovery tests. |
| Linkage state / group crypto | `ensureGroup`, `ensureSecrets`, `readGroup`, `createJoinSeed`, `getGroupCrypto`; App `load`/navigation; Trip copy-link/QR/import; `runSyncCycle`, migrated sync initialization. |
| Collision-checked append | `appendEvents`, `upsertRemoteEvents`, manual delta/full import; legacy readback confirmation; migrated receipt/fingerprint logic; test repository fixtures. |
| Event allocation / HLC | Trip `completeSetup`, `addParticipant`, `claimParticipant`, `acceptDeviceLinkRequest`, `mergeParticipants`, `markParticipantsDistinct`, `deactivateParticipant`, `voidEvent`, `reattestClaim`, `addExpense`, `editExpense`, `voidExpense`, `recordSettlement`, `confirmSettlement`, `disputeSettlement`, `voidSettlement`, `archiveGroup`, `unarchiveGroup`; `factory` and `commit`; event helper fixtures. |
| Metadata merge | `ensureMeta`, `updateTransportVectors`, `markSnapshotPublished`, `saveMeta` and every actual production caller found in pre-scan; settings, durability, sync and snapshots. |
| Buffered admission result | `dueBufferedEvents`, buffer read/write helpers, `runSyncCycle`, nested migrated `ingest`, cursor/vector updates and retention accounting. |
| Authority / confirmation | `authorisedKeys`, `authorisedDevices`, `claimAnomalies`, `verifyConfirmation`, `settlementVoidDecisions`, `fold`, `buildVerificationContext`; Trip record/confirm/void actions; settlement history UI. |
| Coverage | Stored metadata, outbound event stamping, transport envelopes, import/export round-trip, `latestVersionVectorsByDevice`, `isEventCoveredByEveryKnownDevice`, `expenseCoverageLabel`. |
| Retry/drop policy | `createRelays`, `HttpRelay`, individual Nostr publication/read attempts, NIP-11 selection, diagnostic classification, group settings/reset and cycle teardown. |
| Archived drain | `archiveGroup`, `shouldPollGroup`, `startPolling`, `runSync`, outbox queries, publish/readback and teardown. Other archived edits stay disabled. |
| Percentage and reserved draft identity | `buildSharePreview`, `allocatedShares`, `changeSplitMode`, `preserveSplitInputs`, `makeEvent`, `addExpense`; every rerender/reset/cancel path. |
| UI extraction | Existing controller state and callbacks remain sole owners; update affected tests and references to component paths, not their semantic assertions. |
| Atomic operator output | Export `main`, cohort `publish`/`publishSlow`/`publishCurrent`, journal resume/write helpers; isolated maintenance tests. |
| Correct probe / exit codes | `batch50`, `vet`, command dispatch and npm task0 scripts; native child-process tests with local transports only. |
| Dependency/scanner gate | Dependency-review workflow and conditional checker; Semgrep/Bandit exit handling/report upload; exact tool version/exit contracts verified before editing. |

This inventory is a starting caller contract. Each task repeats a symbol/reference search immediately before changing it; any additional affected caller is included only where necessary to fix the selected defect. A new unrelated defect is logged NEW-### instead.

## Dependency compatibility

No new third-party runtime or development dependency is proposed. Internal helpers use existing platform, Node and repository dependencies.

Conditional SEC-004 upgrade candidates verified against registry metadata during planning:

| Package | Candidate | License | Verified metadata / remaining checks |
|---|---|---|---|
| sharp | 0.35.4 | Apache-2.0 | Registry version exists; Node >=20.9.0; import and require exports declared. Existing Node 22/24 workflow selections meet this declared floor. Native optional packages/platform loading and actual API compatibility still need tests. |
| devalue | 5.9.2 | MIT | Registry version exists; ES-module import/default exports declared. Check the actual parent range before re-resolution; do not add an unnecessary direct runtime dependency or force an incompatible override. |

Sources: `https://registry.npmjs.org/sharp/0.35.4`, `https://registry.npmjs.org/devalue/5.9.2`; advisory IDs and affected lock entries are recorded in `AUDIT.md` SEC-004.

- These are verified fixed-boundary candidates, not a claim that they are the newest versions or already installed.
- T04 verifies advisories and graph against current files. A falsified match becomes Invalid; do not update merely because a package name looks risky.
- If a confirmed update fits the existing parent range, re-resolve only that chain and pin the changed direct declaration deliberately. Broader package updates require a selected-task reason and approval of any newly required incompatible version.
- Check package/native-transitive license and redistribution effects before committing; do not copy registry contact information or credentials into artifacts.
- Test sharp using a synthetic or read-only SVG fixture and temporary output; do not regenerate unselected tracked icons.
- New API/CLI usage, filesystem publication semantics, scanner exit codes and migration commands require current official documentation or verified local help before execution. No guessed command is an acceptance criterion.

## Blast radius and rollback by change family

Rollback means a new source commit or restoration of this task's immediate uncommitted patch, not a destructive database rollback. Preserve all accepted later events and unrelated work.

| Findings | Main blast radius | Per-change rollback boundary |
|---|---|---|
| SEC-001 | Historical pending/confirmed display, claim authority, paired devices | Restore only source if compatible; do not invent signatures or delete new signed confirmation events. Record the legacy interpretation visibly. |
| SEC-002 | Reversal authorization, shadows, historical cancellations, wire compatibility | B2 defines compatibility first; preserve events and use a forward-compatible reader, never blanket-resurrect debts. |
| SEC-003 | Public availability, provider quotas, exporter source-key handling | Retain ledger data and proof/cursor state; any operational activation/rollback is separately approved. No live settings toggle in this cycle. |
| SEC-004 | Tooling/native binaries, compiler transitive dependency graph | Restore only the paired manifest/lock changes and test the prior resolved graph; never delete data or force a broad install reset. |
| DATA-001 | Full restore and multi-trip matching | Restore source only; merged history is preserved. A data undo needs a separately reviewed before-image and cannot overwrite newer data. |
| DATA-002 | Offline import, link attachment, QR/sync guards | Retain linkage metadata and old keys; do not deploy a reader that fabricates a secret for unlinked state. |
| DATA-003 | All external imports, future-version recovery, identity restore | Retain raw input and future payloads; do not relax validation to make old invalid fixtures pass. |
| DATA-004 | Bootstrap admission/caps and pagination | Preserve retained/rejected source and checkpoints; source rollback cannot discard previously admitted history. |
| DATA-005 | Deduplication, import, readback receipt state | Preserve all variants/diagnostics and original event bytes; no arbitrary conflict winner on rollback. |
| DATA-006 | Meaning of money across all devices | B3 must define a forward reader transition; never relabel amounts or restore an old seed as authority. |
| DATA-007 | Delivery labels, metadata size, compatibility | Retain progress metadata, fall back to unknown coverage, never infer possession from missing proof. |
| CONC-001, LOGIC-002 | All event producers and persistent allocation/HLC | Retain counters/reservations/HLC and committed rows; never reuse identities or lower clocks. |
| CONC-002 | Metadata writers across sync/settings/durability | Restore code only, retaining latest stored fields; no full-record metadata restore over intervening updates. |
| CONC-003 | Claim creation and signed actor identity | Preserve the chosen persisted key and candidate-free behavior; no automatic key replacement. |
| INTR-001, PERF-001 | Admission, future buffering, vectors/cursors | Aborted transaction retains old state; already-held/admitted rows are never removed as compensation. |
| INTR-002 | Operator journal format and resumption | Keep old and new cohort artifacts; stop rather than republish a different cohort on schema mismatch. |
| INTR-003 | Operator final/staging files and platform behavior | Keep existing/partial files; source rollback never deletes an artifact to free a filename. |
| LOGIC-001 | All derived settlement balances | Keep ledger events unchanged; source reversal restores the old arithmetic but is not a safe financial repair. Review existing user workarounds before any live rollout. |
| LOGIC-003 | Expense correction versions | Retain the correctly versioned events; old readers must quarantine them rather than receive rewritten payloads. |
| LOGIC-004 | Draft percentages and remainder rounding | Restore helper/caller source together; existing committed financials remain unchanged. |
| LOGIC-005 | Draft reservation and preview identity | Preserve used/reserved IDs; reverting UI must not reuse counters or alter saved shares. |
| LOGIC-006 | Archived network lifecycle | Restore scheduling source only; preserve pending work and explicit unsynced state. |
| PERF-002 | Verification cache and authority candidate selection | Disable/revert cache source without changing stored keys, events or authorization rules. |
| PERF-003 | Group row shape | Restore writer source only; retain authoritative event/identity stores and legitimate metadata. |
| REL-001 | GET paging and optional author filtering | Restore handler source only; clients' already-committed cursors remain valid and never reset globally. |
| REL-002 | Endpoint retry cadence and migration guards | Restore scheduler only, preserve routing preferences and outbox; no hidden global relay reset. |
| REL-003, REL-004 | Operator wire stimulus and CLI gate | Restore code if needed, retain original and corrected measurement interpretations and explicit status history. |
| REL-005, REL-006 | CI gating and security reports | Restore backed-up workflow/source together; do not enable admin bypass, disable checks or fabricate scan success. |
| REL-007 | Installed service-worker cache behavior | Restore source only after version/cache compatibility review; never clear users' caches/profiles as a rollback step. |
| REL-008 | SQL upgrade reproducibility | Source files plus tested forward-compensation only; hosted application/restoration remains user-applied. |
| FE-001, FE-004 | Manual action reachability and status placement | Restore only selected view changes; artifact privacy and pending-state truth remain invariants. |
| FE-002 | Existing/new join token decoding | Keep backward-compatible decoding; no regeneration or replacement of group secrets. |
| FE-003 | Focus and listener lifecycle | Restore helper and all consumers together; always release owned listeners and restore prior focus state. |
| FE-005 | Quarantine, archive and export prompts | Restore selected policy/view source only; never convert missing balances to zeros or mutate retained future events. |
| DRIFT-001..006 | Active documentation accuracy | Preserve historical decisions; use focused documentation corrections, not runtime changes to fit old claims. |
| FS-001 | Active security text | Restore original named text copy if required; no credential or scope changes accompany character repair. |
| FS-002 | Historical report framing and future writer output | Original report is a byte-identical prefix; rollback preserves appended evidence instead of deleting it. |
| STRUCT-001 | All extracted panel props/events and test references | Recombine one panel from its pre-task source copy; preserve the controller and do not delete generated files without separate confirmation. |
| DEAD-001 | Rename ordering readability | Restore the precise predicate lines if characterization differs; no other fold changes are included. |

## Backups and protected-file handling

- Baseline backup root: `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/cycle-1/baseline/<relative-path>`.
- Immediate pre-task backup root: `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/cycle-1/tasks/Tnn/<relative-path>`.
- Backup files are immutable, no-clobber and verified by readback/hash. If a name already exists with different bytes, stop and allocate a new explicitly recorded snapshot name; do not overwrite it.
- Snapshot the actual pre-change working-tree bytes, including accepted earlier fixes; Git HEAD alone is not an adequate snapshot of a dirty file.
- Exact protected paths likely affected: `.github/workflows/dependency-review.yml`, `.github/workflows/semgrep.yml`, `.github/workflows/bandit.yml`, `supabase/schemas/relay.sql` if necessary, `vitest.config.ts` only if justified, and all selected package/lock files. Store each at its identical relative path beneath both roots above before editing.
- `.env`, `.env.*`, `*.env`, environment YAML/JSON and credential/session files are not edited, moved or reset. Backups must not expose values in logs or committed artifacts. No user browser data is collected implicitly.
- Existing retention manifests, signed histories, archives and reports are evidence. FS-002 permits only the selected append-only explanatory/header work; no past measurement is replaced.
- `.audit-backups/` is expected to be ignored by existing rules; T02 verifies this with Git. If not, stop for a focused permission decision instead of staging preservation material.
- For B4, the owner confirms an encrypted named schema/data backup before any migration generation based on that baseline. This cycle does not execute live restoration.

## Verification and commit protocol

### For every behavioral change

1. Fresh source/caller pre-scan; compare with the audit. A changed target or refuted CONFIRMED finding stops that task for a decision.
2. Write/run a meaningful failing regression. Expected RED is not a validation failure; record its exact assertion and cause. Refactors use passing characterization first.
3. Apply only the selected correction; parse/type/import checks, cold logic review, relevant tests, and literal acceptance check.
4. Exercise the changed real surface in an isolated test environment: actual CLI invocation against local fixtures; HTTP adapter against a local fake; real browser for UI. No production relay writes or shared database resets.
5. If validation fails, restore this task's patch from its immediate snapshot, preserve its evidence, mark Blocked, and continue only independent tasks. Do not fix NEW-### defects opportunistically.
6. Commit one verified logical increment with `fix(<category>): <ID> <description>`. A test plus inseparable implementation belongs together. No empty commits, secret/data/backups staging, force push, shared rebase or automatic push.
7. Update ledger/tasks, emit STATE, and checkpoint after every third completed task. A multi-task finding remains In Progress until every required subtask passes.

### Integration checkpoints

- Capture the existing baseline before implementation. Unexpected pre-existing failures become evidence/NEW findings and can block the aggregate gate; they are not permission to weaken tests.
- Use the repository's declared core/root/maintenance suites, money lint and Svelte checking. Full build and both root/core commands are distinct checks, not interchangeable counts.
- At T70, verify the complete behavioral set before DEAD-001. At T72, run the final required integration checks and review only new deltas/unresolved concerns. Do not rerun unrelated expensive checks without a reason.
- Validate documentation paths/commands, table widths and artifact ID sets directly; no artificial unit tests for prose-only changes.
- UI checks cover keyboard focus, trip switching, offline/pending/archived/frozen states and narrow/wide layouts using the actual components, not just aliases/stubs. Load the applicable browser/frontend/visual-QA instructions when those tasks begin.
- Test-generated processes, listeners and browser contexts are owned and stopped after use. Keep evidence and backups; ask before deleting temporary files or checkpoint files at closeout.
- No hosted CI/production success is inferred from local tests. With no approved push/deploy, hosted verification remains an explicitly documented gap.

## What this cycle is not changing

- No environment files, secret rotation, existing user sessions, browser profiles, live database rows, provider billing plans or backend activation: prohibited or outside the approved source-only execution surface.
- No original event/financial/key rewriting, source deletion or automatic historical repair: preservation is required even where a new reader reports inconsistent legacy state.
- No fork/re-key or Keep/Revert feature: selected drift findings correct descriptions only.
- No unrelated formatter sweep, framework migration, root folder reorganization, test assertion weakening or blanket dependency upgrade: not needed for the selected findings.
- No production relay experiments, retention cohort replacement or automatic report-data regeneration: operator stimulus is tested locally and historical evidence remains intact.
- No source changes during Phase 1 and no automatic continuation past pending approval.

## Phase 1 acceptance (historical planning checkpoint)

These checks describe the completed planning gate. The user subsequently approved execution; `execute_state.json` is authoritative for current approval, progress and verification gaps.

- `bugfix.md` contains exactly one entry for every selected audit ID and no invented fix.
- `tasks.md` covers every selected ID with an ordered dependency graph, concrete acceptance and rollback; conditional/blocked tasks remain visible.
- `execute_state.json` records `phase=awaiting_plan_approval`, `approval.status=pending`, no completed tasks and no code commits.
- Policy/access gates B1–B4 remain explicit; all referenced task numbers and selections agree.
- Only planning/continuity artifacts change; current source baseline remains intact.
