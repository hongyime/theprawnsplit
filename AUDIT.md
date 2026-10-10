# Codebase Audit

## 0. Run Metadata

| Field | Evidence / scope |
|---|---|
| Scope | STATIC and LIVE; LIVE restricted to read-only HTTP, GitHub workflow metadata/logs, local container/listener metadata, advisory queries and attempted read-only database queries. |
| Agent capability | Shell, arbitrary file reads, tracked-file enumeration and network access verified. Public production HTTP and GitHub access verified. Database query access not established. |
| Commit | `e63962f47dc4b38378bed33eadd57b134458411d`, branch `maintenance/prawn-ui-20260916`. |
| Starting hypothesis | `REPO_MAP.md` read first; findings below were traced to source rather than accepted from that map. |
| Baseline | 257 tracked files. `.agents/STATE.md` and `.agents/JOURNAL.md` already modified at audit start; `REPO_MAP.md` already untracked. These changes were preserved. |
| Phases | 0–8 performed; Phase 5 has the access limitations recorded below. No application tests, builds, servers, mutation tests or exploit payloads were executed. Parser libraries inspected syntax without executing application modules. |
| Board execution | Roles applied directly in this session. Team orchestration rejected the caller's lead eligibility; no independent team approval is claimed. |
| Output | This report only. All changes below are proposals for 02_EXECUTE, not actions performed. |
| Findings | 49 total: P0 0; P1 18; P2 25; P3 6. CONFIRMED 48; POTENTIAL 1. |
| Excluded / unavailable | Ignored dependency/build/editor trees as audit targets, Git object integrity/fsck, full historical secret scanning, binary decoding beyond signatures, detached wiki content, actual browser-ledger contents, hosted SQL rows/ACLs/function bodies, runtime traces, queue/cache metrics, and production write-path exercise. Installed compilers were used only as parsers. |

- **Confirmation boundary:** CONFIRMED means the stated source path or live failure was verified, not that it was executed against production data. Static interleavings and arithmetic traces are identified as such.
- **Production identity boundary:** live release metadata includes commits different from the local audit SHA. The served bundle was not byte-matched to this checkout. Static defects are therefore not asserted to have been exercised on the deployed bundle.
- **Immediate incident boundary:** available live observations did not establish active exploitation or ongoing stored-record corruption. No write-path probe was used to try to establish either.
- **Canonical definitions:** Section 8 is the sole findings register. Other sections reference those IDs and supply evidence, dependency ordering or verification contracts rather than redefining findings.
- **Protected resources:** no database, environment, configuration, session, credential, migration, source, workflow or historical report was modified. Future protected-file changes require the named, verified backups in Section 10 before execution.

## 1. Filesystem Health

| Inspection | Result | Limitation / finding reference |
|---|---|---|
| Tracked-file existence, size and UTF-8 decoding | All 257 paths readable; no zero-byte file or text NUL detected | Not a disk/device health test. |
| JSON / web manifest | 12 JSON files and one web manifest parsed | PowerShell object conversion initially rejected lockfiles; hashtable conversion and independent Python JSON parsing accepted both. No lockfile corruption finding. |
| TOML / Python syntax | One TOML file and three Python files parsed | Python AST parsing only; no imports of repository scripts. |
| TypeScript / JavaScript / Svelte syntax | 164 script files and seven Svelte files parsed without syntax errors | TypeScript `createSourceFile` and Svelte parser; not type checking, linking or execution. |
| YAML | Files read as configuration | Not available: Python YAML parser was absent; no dependency was installed. No claim of exhaustive YAML parser validation. |
| PNG / WOFF2 | Three PNG signatures/trailers and the WOFF2 signature accepted | Full pixel/font decoding not performed. |
| Database / credential artifacts | No tracked database/session/private-key file matched the inspected extensions | Ignored local stores and external databases were not scanned as filesystem artifacts. |
| Temporary / conflict-copy names | No tracked `.tmp`, `.bak`, `.old`, `.orig`, `.swp`, numbered-copy or conflict-copy match | A lockfile is not classified as an orphan merely because of its name. |
| Documentation character damage | U+0007 found in `SECURITY.md:29`; adjacent scope text is split at lines 26–29 | FS-001; noncritical documentation damage. |
| Retention report shape | Seven-cell retention rows occur beneath six-column headers, including the A13 table | FS-002; original observations must be retained. |

- **Critical corruption gate:** no critical corruption established by the inspections above; no repair attempted.
- **Orphans:** unused exports or absent runtime references alone do not establish that an intentionally exported core function is disposable. No file deletion is proposed.
- **Recovery proposals:** FS-001 repairs textual damage; FS-002 adds corrected headings/annotations without rewriting historical measurements. Both remain permission-gated.

## 2. Master Feature Map

### 2.1 Runtime, package and transport boundaries

| Boundary | Files | Inputs → implementation → outputs / effects |
|---|---|---|
| Browser bootstrap | `index.html`, `src/main.ts` | Module script → `mount(App)` → DOM; startup exception fallback; load event registers `/sw.js`. |
| Trip selection | `src/App.svelte` | Fragment or button → `load`, `navigate`, `startNewTrip`, `selectTrip`, `showTripList` → repository calls and keyed `Trip`; navigation generation rejects stale selection results. |
| Trip lifetime | `src/Trip.svelte` | `initialGroup` fixes `tripId`; `initGroupSession`, `refreshState`, `refreshCounts` initialize projections; teardown removes interval/listeners. |
| Core package | `core/package.json`, `core/src/index.ts` | Private ES-module package; re-exports canonicalization, fold, HLC, identity, allocation, settlement, transport and event types; no runtime package dependency block. |
| Source aliasing | `vite.config.ts`, `tsconfig.json`, `vitest.config.ts` | `@` resolves to `src`; `@theprawnsplit/core` resolves directly to `core/src/index.ts`; test config substitutes selected UI components. |
| Build | `package.json`, `core/package.json` | `npm run build` runs core tests, root tests including Node export tests, monetary scan, Svelte check, then Vite; `dev`, `preview`, `analyze`, icon and retention scripts also declared. |
| Deployment | `vercel.json`, `api/relay.ts` | Static `dist` plus edge request handler; non-API paths rewrite to HTML; selected response/security/cache headers configured. No application-owned listener or container declared. |
| Browser storage | `src/db/repo.ts`, `src/relay/recovery-db.ts` | `idb` wraps ledger and recovery databases; detailed stores below. |
| External storage | `api/relay.ts`, `server/supabase-relay.ts`, `supabase/schemas/relay.sql` | Redis stream/proof operations or HTTPS PostgREST RPC; server sees opaque payloads and routing metadata. |
| External transports | `src/relay/http.ts`, `src/relay/nostr.ts`, `src/relay/nostr-recovery-transport.ts` | HTTP JSON and signed Nostr events; normal publication, bounded reads and separate source-recovery protocol. |

### 2.2 Core functions and event model

| File | Symbols and actual responsibility | Inputs / outputs / handled boundaries |
|---|---|---|
| `core/src/types.ts` | `Money`, `HLC`, `Event`, `Financials`, `State`, `VerificationContext`, `compareCodepoints`, `compareHlc`, `eventSortKey` | Bigint money; event metadata and discriminated payloads; sorted comparison by HLC then event ID; synchronous signature callback. |
| `core/src/canonical.ts` | `canonicalize`, `compareCanonical`, `stableStringify`, `canonicalState`, `canonicalStateBytes` | Values/maps/sets → ordered JSON-compatible representation; bigint becomes decimal text; non-finite numbers converted to strings. |
| `core/src/money.ts` | `fnv1a`, `allocate` | Nonnegative total/weights, unique participant IDs, event ID → conserved bigint allocations; remainder/hash/ID tie-breaking; invalid shape/weight preconditions throw. |
| `core/src/settle.ts` | `byAmountDescPidAsc`, `greedySettlement` | Balance map → debtor-to-creditor transfers by sorted amounts; exhausted entries advance each side. |
| `core/src/hlc.ts` | `receive`, `admissionGate` | Local/remote clocks → merged HLC; incoming future timestamp → admissible verdict or retry time. Application event creation is separately implemented in `src/lib/events.ts`. |
| `core/src/identity.ts` | `DSU.add/find/union/roots`, `voidedEventIds`, `buildDSU` | Event set → terminal void IDs and rebuilt minimum-root participant unions. |
| `core/src/identity.ts` | `validSelfClaim`, `firstValidClaim`, `verifiesWithAny`, `authorisedKeysWithoutReattestation`, `authorisedKeys` | Group-bound signatures → genesis/delegated/reattested key sets; delegation loops to fixed point; reattestations counted by target and attestor. |
| `core/src/identity.ts` | `authorisedDevices`, `findAlg`, `keyAlgsFor`, `verifyConfirmation`, `matchesPayeeClaimSignature` | Key-bearing events → device/key lookup; settlement confirmation resolves the literal payee rather than a merged participant. |
| `core/src/identity.ts` | `claimAnomalies`, `contestedClaimPids` | Valid self-claims and authority sets → multiple-participant-device and unverified-reclaim anomalies. |
| `core/src/fold.ts` | `validateRate`, `validateFinancials`, `eventCounter`, `versionCovers`, `financialWinner` | Financial payload checks and causal/LWW selection; input is typed as events but not comprehensively parsed at this boundary. |
| `core/src/fold.ts` | `activeMergeEdges`, `mergePath`, `settlementVoidDecisions`, `fold`, `later` | Ordered events → participants, expense history, settlement statuses, balances, anomalies and frozen/quarantined state; terminal voids evaluated before projection. |
| `core/src/transport.ts` | `eventCounter`, `knownAuthors`, `authorCounts`, `bump`, `admitTransportEvents` | Incoming/current events and limits → admitted/buffered/dropped arrays and transport/discard vectors; non-finite HLC fields, author/group caps and future clocks handled. |

Event discriminators declared in `core/src/types.ts:24-80`:

- Group: `GroupCreated`, `GroupArchived`, `GroupUnarchived`.
- Participants: `ParticipantAdded`, `ParticipantRenamed`, `ParticipantClaimed`, `ParticipantUnclaimed`, `ParticipantMerged`, `ParticipantsMarkedDistinct`, `ParticipantDeactivated`.
- Authority: `DeviceLinked`, `ClaimReattested`.
- Expenses: `ExpenseAdded`, `ExpenseEdited`, `ExpenseVoided`.
- Settlements: `SettlementRecorded`, `SettlementConfirmed`, `SettlementDisputed`, `SettlementVoided`.
- Generic cancellation: `EventVoided`.
- Every event declares version, ID, HLC and originating device; optional version vector. Financials contain total, payer rows, share rows and optional frozen rate. A declared event type is not itself evidence of a UI producer for that type.

### 2.3 Repository functions and durable effects

All symbols in this subsection are in `src/db/repo.ts`; store definitions are at lines 12–123.

| Symbols | Inputs → outputs / effects |
|---|---|
| `db`, `resetRepositoryForTests` | Open/upgrade ledger database; test helper closes and deletes its selected test database. The helper was not called in this audit. |
| `createNostrSecretHex`, `normalizeNostrSecretHex`, `ensureSecrets`, `ensureMeta` | Create/normalize stored cryptographic material and metadata; reads can perform normalization writes. |
| `encodeEvent`, `decodeEvent`, `counterFromEvents`, `vectorFromEvents`, `withVersionVector` | Event serialization, counter recovery and vector stamping. |
| `createGroup` | New device/group/secret → group, GroupCreated event and metadata in one transaction. |
| `ensureGroup` | Optional join seed → secret/tag validation, serialized existing-group lookup or group creation; crypto precedes the transaction. |
| `listGroups`, `readGroup` | Stored rows → sorted trip list or hydrated group/events/identities/meta; readGroup raises the next-counter view to the highest retained counter. |
| `saveGroup`, `appendEvents` | Group object replacement; event rows stamped and written by key as local, metadata updated, group reread. |
| `createExport`, `createDelta`, `createIdentityBackup`, `createJoinSeed`, `stringifyExport` | Separate ledger, delta, private identity and secret-bearing join artifacts. Shareable ledger/delta omit the group secret and private identity store. |
| `isRecord`, `assertString`, `assertNumber`, `assertImportGroup`, `assertImportEvents`, `assertIdentityBackup`, `parseExport` | Parsed JSON → selected artifact type after base-field checks. |
| `replaceFromExport` | Full artifact → new secret/device, group overwrite, deletion/replacement of events under the imported group ID, replacement metadata; identities/buffer are not part of that transaction. |
| `restoreIdentityBackup` | Match tag or group ID, require matching tag → identity rows replaced by participant key. |
| `applyDelta` | Match existing trip → `upsertRemoteEvents`; no full-group replacement. |
| `markEvents`, `unsyncedEvents`, `pendingOutboundEvents`, `pendingOutboundEventRows`, `syncCounts`, `confirmedEvents` | Read or transition local/published/confirmed rows and outbox-related metadata. |
| `dueBufferedEvents`, `putBufferedEvents`, `removeBufferedEvents` | Future-event retry selection and separate buffer-store transactions. |
| `updateMeta`, `recordAppLaunch` | Transactional metadata callback and launch/session accounting. |
| `updateTransportVectors`, `saveMeta`, `markSnapshotPublished` | Full-record metadata writes, including separate read/modify/write paths. |
| `upsertRemoteEvents` | Insert absent event IDs as confirmed and update vectors/cursors in an events/meta transaction; catch aborts the transaction. |
| `ensureClaimIdentity`, `getGroupCrypto` | Lookup or mint/store claim key; derive group encryption key from retained secret. |

### 2.4 Cryptographic functions

| File | Functions | Contract |
|---|---|---|
| `src/crypto/bytes.ts` | `bytesToBase64`, `base64ToBytes`, `bytesToHex`, `hexToBytes`, `cryptoBytes`; `utf8`, `utf8d` | Binary/text representations and ArrayBuffer normalization. |
| `src/crypto/group.ts` | `createGroupSecret`, `secretToBase64`, `secretFromBase64`, `digest`, `groupTag`, `groupKey`, `relayWriteProof` | Random group secret; SHA-256 addressing; HKDF encryption/write-proof derivations. |
| `src/crypto/claim.ts` | `pickAlg`, `algorithm`, `signAlgorithm`, `mintClaimKey`, `importPrivateKey`, `importPublicKey`, `signClaim`, `verifyClaim` | Ed25519 feature detection with P-256 fallback; JWK import/export; sign/verify; verification failures return false. |
| `src/crypto/envelope.ts` | `encryptJson`, `eventEnvelope`, `encryptEnvelope`, `encryptEvents`, `decryptEnvelope`, `decryptEvents` | AES-GCM over bigint-tagged JSON with random IV; event/snapshot/source-fragment envelopes; legacy array decoding. |
| `src/lib/verification.ts` | `signatureCacheKey`, `publicJwkFromClaimPk`, `addEventSignatureRequests`, `buildVerificationContext` | Collect keys and signature requests, asynchronously verify them, expose a synchronous lookup to core folding. |

### 2.5 Replication, recovery and server functions

| File | Functions/classes | Inputs → outputs / effects |
|---|---|---|
| `src/relay/types.ts` | `Relay`, `RelayEntry`, `AckResult`, `RelayRequestOptions`, `SyncResult`, diagnostic unions | Shared transport and outcome shapes; cursor semantics vary by adapter. |
| `src/relay/sync-cycle.ts` | `emptySyncResult`, `ownsCrossTabSync`, `coordinatedSync`, `syncNetworkBudget` | Same-context promise coalescing, optional cross-tab Web Lock, bounded network work and teardown. |
| `src/relay/sync.ts` | `fetchOpts`, `publishQuorumReached`, `relayFetchPlans`, `createRelays`, `defaultMessageLimitBytes`, `syncOnce`, `runSyncCycle` | Load group/settings → discover generation → legacy or migrated synchronization. Legacy batches, fallback writes, reads, admission, confirmations, snapshots and metadata updates. |
| `src/relay/http.ts` | `HttpRelay.migrationMode/publish/fetch` | Capability GET; JSON POST; bounded GET pages; deadlines/body limits. |
| `src/relay/nostr.ts` | `selectNostrEntries`, `secretFromHex`, `assertLowercaseGroupTag`, `nostrEventTemplate`, `nostrFetchFilter`; `NostrRelay` constructor, `secretHex`, `close`, `request`, `publish`, `fetch`, `recoveryPage` | Nostr key/pool ownership; signed content events; timestamp-based queries; at least one accepted pool publish yields an adapter ACK. |
| `src/relay/request-deadline.ts` | `withRequestDeadline` | Parent cancellation and request timeout race; listener/timer/transport cleanup. |
| `src/relay/bounded-body.ts` | `boundedText` | Response stream → byte-limited decoded text; cancels reader. |
| `src/relay/nip11.ts` | `clearNip11CacheForTests`, `fetchMaxMessageLength`, `requestMaxMessageLength` | Relay metadata HTTP lookup → nullable limit cached for process lifetime. |
| `src/relay/batch-limits.ts` | `resolveMessageLimit`, `fitCountWithinLimit`, `projectBatchSize` | Known limits and probe size → minimum limit, binary-search count, projected bytes. |
| `src/relay/diagnostics.ts` | `relayIssueCode`, `isDuplicateRelayAck`, `relayBackoffMs`, `classifyRelayIssue`, `resetUnknownRejectionCounts` | Provider text → diagnostic/action metadata; unknown-rejection counters are module state. |
| `src/relay/migration-mode.ts` | `parseMigrationMode`, `recoveryScope`, `isDefaultOperatedRelay`, `discoverMigration` | Capability response and stored generation → selected recovery state; rejects silent legacy fallback. |
| `src/relay/recovery-db.ts` | `RecoveryRepository.state/initialize/save/covered/sourceCovered/acknowledge/close`, `recoveryRepository` | Separate IndexedDB states/receipts; initialization and receipt/pending-state acknowledgement transactions. |
| `src/relay/migrated-sync.ts` | `eventFingerprint`, `syncMigrated`; nested `sendPending`, `ingest` | Exact packet retry, ordered operated history scan, fingerprint collision checks, admission, receipt recording, device catch-up, source archive upload and checkpoint progression. |
| `src/relay/nostr-recovery.ts` | `recoverNostrPage` | Per-relay checkpoint → backward history page; overlapping boundaries, saturation detection and periodic sweep state. |
| `src/relay/nostr-recovery-transport.ts` | `eventObjectJson`, `fetchNostrRecoveryPage` | WebSocket REQ/EVENT/EOSE/CLOSE → verified signed objects preserving original object text; explicit byte/count/deadline limits. |
| `src/relay/source-archive.ts` | `invalid`, `digest`, `validSourceUrl`, `signedSource`, `readSourceFragment`, `restoreNostrSource`, `prepareSourcePackets` | Signed raw objects → hashed encrypted fragments; receipt identity, bounded packet preparation and exact reconstruction validation. |
| `api/relay.ts` | `redis`, `supabase`, `json`, `bad`, `parseRelayNumericLimit`, `bytesToHex`, `isValidWriteProof`, `writeProofCommitment`, `verifyRelayWriteProof`, `parseLimit`, `handler` | Capability GET, append POST, read GET, 405 fallback; first commitment claim plus subsequent proof checks; Redis or SQL branch; fixed storage-error response. |
| `server/supabase-relay.ts` | `validRedisCursor`; `SupabaseRelayStore` constructor, `rpc`, `append`, `read` | Validated HTTPS service endpoint and cursor/response contracts; bounded RPC request race; provider detail suppression. |
| `supabase/schemas/relay.sql` | `reserve_capacity`, `prawnsplit_relay_append`, `prawnsplit_relay_read`, `prawnsplit_relay_import`, `prawnsplit_relay_topic_info` | Capacity reservation; proof/cursor serialization; exact-blob receipt reuse; bounded reads; cursor-preserving import and parity summaries; service-role access. |

### 2.6 View and command helpers

| File | Functions / values | Responsibility and boundaries |
|---|---|---|
| `src/lib/events.ts` | `makeHlc`, `makeEvent`, `makeExpenseFinancials`, `defaultGroupCreated`, `defaultParticipant`, `defaultExpenseDate` | Device-counter event construction; wall clock sampled directly; financial row construction and local calendar date. |
| `src/lib/money.ts` | `parseMinor`, `parsePercentageBasisPoints`, `parseShareWeight`, `formatMinor`, `formatMinorInput`, `formatPercentageInput`, `bigintReplacer`, `bigintReviver` | Decimal text to bigint and back; fixed two-decimal representation; JSON bigint wrappers. |
| `src/lib/multicurrency.ts` | `parseExchangeRate`, `parseDecimalRate`, `currencyAmountPreview`, `convertToBaseMinor`, `normalizeCurrency` | Decimal rational conversion to base minor units and frozen display rate. |
| `src/lib/expense-command.ts` | `canAppendExpense` | Requires active group, local identity, description and valid previews. |
| `src/lib/expense-edit.ts` | `rescaleRows`, `editFinancialsForTotal` | Rescale existing payer/share rows together and preserve rate metadata. |
| `src/lib/expense-display.ts` | `expenseDisplayRows` | Sort by captured calendar date. |
| `src/lib/expense-history.ts` | `expenseHistoryRows` | Financial history entries with original/correction labels and active index. |
| `src/lib/payers.ts` | `buildPayerPreview` | Single/multiple payer rows; nonnegative amounts and total matching. |
| `src/lib/split-preservation.ts` | `preserveSplitInputs` | Derive exact values, weights and percentages from selected participants and preview amounts. |
| `src/lib/participants.ts` | `claimAttributionText`, `normalizeParticipantName`, `levenshteinDistance`, `findParticipantNameMatch`, `groupParticipantsForClaim`, `defaultSplitSelection`, `defaultPayerPid` | Fuzzy matching, claim ordering, attribution and form defaults. |
| `src/lib/device-link.ts` | `createDeviceLinkRequest`, `linkPayload`, `isDeviceLinkReplay`, `parseDeviceLinkRequest`, `assertDeviceLinkFields` | Shareable key/nonce request, payload construction and replay tuple checking. |
| `src/lib/reattestation.ts` | `reattestationThreshold`, `reattestationStatus` | Claimed-peer population and displayed attestation progress; display counting is separate from cryptographic authority. |
| `src/lib/settlement-command.ts` | `canRecordSettlement`, `hasActiveClaimAnomaly`, `canConfirmSettlement` | Positive non-self transfer eligibility and local payee confirmation controls. |
| `src/lib/settlement-history.ts` | `settlementClaimView`, `canVoidRecordedSettlement` | Payment/dispute lookup and recorder-device UI eligibility. |
| `src/lib/archive.ts` | `isArchivedEventLog` | Ordered archive/unarchive events → lifecycle flag. |
| `src/lib/lifecycle.ts` | `isSettledViewPredicate`, `canEditGroupProfile`, `shouldPollGroup`, `latestArchiveEvent`, `createArchiveTransitionPlan`, `groupWithPendingArchiveEvent`, confirmation-text helpers | Computed settled state, active/archived policy, adaptive polling and export-before-archive plan. |
| `src/lib/durability.ts` | `emptyDurabilityPromptState`, `normalizeDurabilityPromptState`, `installPromptLevel`, `dismissInstallPrompt`, `shouldPromptPinLink`, `shouldPromptIdentityBackup`, `shouldPromptFirstZeroExport`, `shouldPromptSevenDayExport`, `exportPromptReason` | Persisted prompt counters, retirement/suppression, return-window and balance/export triggers. |
| `src/lib/freeze-policy.ts` | `frozenViewPolicy` | Quarantine → balance/settlement visibility policy. |
| `src/lib/manual-fallback.ts` | `MANUAL_FALLBACK_AFTER_MS`, `isManualFallbackDue` | Outbox-age threshold. |
| `src/lib/relay-settings.ts` | Default/normalize/parse helpers, `relaySettingsTargetCount`, HTTP/Nostr normalizers | Per-device routing preferences and URL normalization. |
| `src/lib/relay-diagnostics.ts` | `formatDelay`, `relayDiagnosticActionText` | Diagnostic action text and displayed retry interval. |
| `src/lib/subgroups.ts` | Name/ID normalizers, `upsertSubgroupPreset`, `deleteSubgroupPreset`, `applySubgroupSelection` | Local participant-selection presets; no replicated ledger event. |
| `src/lib/sync-coverage.ts` | `eventCounter`, `latestVersionVectorsByDevice`, `isEventCoveredByEveryKnownDevice` | Latest event vectors → displayed delivery coverage. |
| `src/lib/sync-labels.ts` | `syncSurfaceLabels` | Unconfirmed/quarantine counts → topbar/protection labels. |
| `src/lib/clock-skew.ts` | `peerClockSkewWarning` | Recent peer timestamps → ambient warning; does not mutate events. |
| `src/lib/ids.ts` | `newId`, `todayLocal`, `inferCurrency`, `inferCurrencyFromLocale` | UUID/random fallback, local calendar date, regional currency mapping/fallback. |
| `src/lib/currencies.ts` | `commonCurrencies`, `allCurrencies`, `currencyOptions` | Static choices and deduplicated current/common/all ordering. |
| `src/lib/join-link.ts` | `encodeJoinSeed`, `decodeJoinSeed`, `buildJoinLink` | JSON/base64url fragment encoding; secret remains in fragment rather than query. |
| `src/lib/Icon.svelte` | Icon path map, reactive path selection | Decorative SVG, default settings icon for unknown names. |
| `src/lib/NeoCard.svelte`, `src/lib/NeoButton.svelte` | Runes props and children snippets | Styled wrapper/button; button forwards remaining attributes. |
| `src/styles.css` | Font face, theme variables, responsive/selectors | Global presentation; no visual browser verdict was attempted. |

### 2.7 Trip command and rendering index

All following functions and effects are in `src/Trip.svelte`:

| Group | Named functions / effects | User input and final effect |
|---|---|---|
| Projection | `factory`, `commit`, `refreshState`, `refreshCounts`, `initGroupSession` | Repository writes → verification context → fold → reactive view collections. |
| Participants | `addParticipant`, `completeSetup`, `requestClaimParticipant`, `claimParticipant`, `requestDeviceLink`, `acceptDeviceLinkRequest` | Name/selection/link request → participant, key storage, signed claim/delegation events. |
| Reconciliation | `mergeParticipants`, `markParticipantsDistinct`, `deactivateParticipant`, `voidEvent`, `voidParticipantClaim`, `reattestClaim` | Explicit controls/confirmations → append-only domain events. |
| Attribution | `participantClaimEvent`, `participantAddedEvent`, `activeDeactivationEvent`, `firstParticipantClaim`, `formatEventTime`, `shortDevice`, `mergeUndoEventIds`, `participantClaimAttribution`, `participantAddAttribution`, `participantStatusText`, `claimBalance`, `matchText`, `reattestationMessage`, `localPeerIdentityFor`, `participantLabel` | Event/participant lookups → labels and action context. |
| Expense draft | `selectedPidList`, `allocatedShares`, `buildSharePreview`, `changeSplitMode`, `changePayerMode`, `payerSummary`, `expenseCoverageLabel`, `rateSummary` | Draft amount/currency/payers/splits → validity and amount previews. |
| Expense mutation | `addExpense`, `editExpense`, `voidExpense` | Validated controls/prompts → expense events → commit; first expense invokes storage persistence. |
| Settlement mutation | `recordSettlement`, `localIdentityForPid`, `confirmSettlement`, `disputeSettlement`, `voidSettlement` | Suggested/manual transfer or action → settlement events; confirmation calls claim signing. |
| Export/import | `downloadExport`, `downloadJsonFile`, `shareDelta`, `downloadIdentityBackup`, `importExport` | Browser Blob/download/share or pasted JSON → selected repository import path; private backup has an explicit warning. |
| Lifecycle | `archiveGroup`, `unarchiveGroup`, `archiveOutstandingLabels`, `isGroupArchived`, `allBalancesZero`, `hasNonZeroBalance` | Confirmation → export/append archive or unarchive; derived flags gate controls/polling. |
| Sharing | `copyJoinLink`, `showJoinQrCode` | Group seed → clipboard/prompt or dynamically imported QR encoder. |
| Sync | `runSync`, `recoveryMessage`, `relayDefaults`, `currentRelaySettings`, `resetRelaySettingsForm`, `saveRelaySettings`, `resetRelaySettings` | Sync button/poll or settings → selected trip sync/readback and stored routing preferences. |
| Presets | `saveSubgroupPreset`, `deleteSubgroup`, `applySubgroup` | Draft participant selection → metadata preset or form selection. |
| Durability | `detectStandalone`, `refreshProtectionStatus`, `requestStoragePersistenceAfterFirstExpense`, `patchDurability`, `refreshDurabilityPrompts`, prompt dismiss/handled/download helpers, `markFirstExpensePersistenceRequested` | Browser capabilities and persisted policy → banners/modals, storage request and acknowledgement metadata. |
| UI lifecycle | `showToast`, `properCase`, `splitModeLabel`, `markActivity`, `startPolling`, `onVisibilityChange`, `onConnectivityChange`, `onDestroy` | Interval, pointer/key/visibility/connectivity events → refresh/sync decisions and cleanup. |

Rendered surfaces include trip metadata, setup, import, recovery, archive/settled/quarantine banners, the collapsible sync/protection/reconciliation panel, roster, balances, expense draft, settlements, ledger history, claim/install/QR dialogs (`src/Trip.svelte:1230-1815`).

### 2.8 Operator tools, CI, configuration and test boundaries

| Files | Implemented behavior |
|---|---|
| `scripts/relay-migration.mjs` | `compareCursor`, `boundedJson`, `redisReader`, `keys`, `entry`, `exportSnapshot`, `snapshotSummary`, `validateExportPublicKey`, `prepareExport`, `sealSnapshot`, `openSnapshot`, `validateSnapshot`, `importAndVerify`, `main`; bounded Redis command allowlist, optimistic consistency checks, recipient encryption, exclusive artifact creation, injected import/parity RPC helper. |
| `scripts/upstash-usage.py` | `NoRedirects`, `counter`, `parse_result`, `collect`, `main`; GET DBSIZE/INFO-memory aggregates, response limit, fixed failure codes and optional Actions summary. |
| `scripts/task0-retention.mjs` | `readCurrentRelays`, `sleep`, `publish`, `publishSlow`, `publishCurrent`, `queryRelay`, `check`, `probe`, `vet`, `nip11`, `batch50`, `humanElapsed`, `writeReportHeader`; throwaway Nostr cohorts, manifests, readback reports and manual probes. |
| `scripts/task0-relay-check.mjs` | `relayInfoUrl`, `fetchJson`, `checkKindRegistry`, `checkRelay`; historical metadata probe with top-level JSON report. |
| `scripts/lint-money.mjs` | `files` and fixed regex scan over selected monetary paths; failure prints paths/messages and exits nonzero. |
| `scripts/gen-icons.mjs` | `sharp` rasterization of the repository SVG into three named public PNGs. |
| `.github/scripts/checked-bot-merge.py` | `decision`, `gh`, `inspect_and_merge`, `main`; allowed bot, same-repository/default-branch/exact-head/required-check conditions; optional dry run; non-admin squash request. |
| `.github/workflows/ci.yml`, `split-build.yml` | PR build and main release paths; root versus root-plus-core installation; release also reruns root/core/check commands. |
| `.github/workflows/bandit.yml`, `codeql.yml`, `dependency-review.yml`, `semgrep.yml`, `trufflehog.yml`, `scorecard.yml`, `lfs-guard.yml` | Security/dependency/source/LFS analysis jobs, with differing filters and failure policies. |
| `.github/workflows/relay-export.yml`, `storage-usage.yml`, `task0-retention.yml` | Manual encrypted export; manual aggregate usage; scheduled readback/report commits. |
| `.github/workflows/auto-merge-bots.yml`, `dependabot-auto-merge.yml`, `greetings.yml`, `labeler.yml`, `summary.yml`, `heartbeat.yml` | Checked merge automation, contributor metadata/comments, issue inference summary and repository activity commits. |
| `package-lock.json`, `core/package-lock.json` | Resolved dependency graphs; 310 unique npm name/version pairs queried against OSV. |
| `vitest.config.ts`, `core/vitest.config.ts`, `test/`, `core/test/` | Vitest unit/property/in-process integration and jsdom tests; Node and Python maintenance tests; test stubs replace selected real UI primitives. Test existence is not credited as a passing behavioral audit. |
| `svelte.config.js`, `tsconfig.json`, `core/tsconfig.json`, `.deepsource.toml`, `.sourcery.yml`, `.github/dependabot.yml` | Compiler/preprocessor, strict type settings, analyzer and dependency automation configuration. |

Environment names and fallback sites:

- Client (`src/config.ts`): `VITE_NOSTR_KIND`, `VITE_NOSTR_RELAYS`, `VITE_RELAY_ENDPOINT`, `VITE_SCHEMA_VERSION`, `VITE_POLL_ACTIVE_MS`, `VITE_POLL_BACKOFF_MS`, `VITE_POLL_IDLE_MS`, `VITE_IDLE_AFTER_MS`, `VITE_ACK_QUORUM`, `VITE_BATCH_MAX_EVENTS`, `VITE_CAP_UNKNOWN_AUTHOR`, `VITE_CAP_KNOWN_AUTHOR`, `VITE_CAP_GROUP_TOTAL`, `VITE_DRIFT_BUFFER_MAX`, `VITE_MAX_FUTURE_DRIFT_MS`, `VITE_SNAPSHOT_EVERY`. Each has a fallback; numeric parser rejects non-finite/sub-one input and floors accepted values.
- Server (`api/relay.ts`): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PRAWNSPLIT_SUPABASE_URL`, `PRAWNSPLIT_SUPABASE_SECRET_KEY`, `PRAWNSPLIT_RELAY_BACKEND`, `PRAWNSPLIT_RELAY_MIGRATION`, `RELAY_MAX_BLOB_BYTES`, `RELAY_MAX_FETCH_LIMIT`. Storage credentials have no usable fallback; selection/limit fields do. Incompatible backend/generation returns 503.
- Tools/tests/workflows: `ANALYZE`, `FAST_CHECK_SEED`, `PRAWNSPLIT_EXPORT_PUBLIC_KEY_B64`, `GITHUB_STEP_SUMMARY`, `GITHUB_REPOSITORY`, `GITHUB_EVENT_PATH`, `GH_TOKEN`, `ISSUE_TITLE`, `ISSUE_BODY`, `ISSUE_NUMBER`, `RESPONSE`; workflow secret sources include `GH_PAT` and `GITHUB_TOKEN` (`vite.config.ts`, `core/test/`, `scripts/`, `.github/`).
- Stored per-group relay settings override normalized client defaults (`src/lib/relay-settings.ts`); they do not alter the server's deployment configuration. No environment values are included here.

### 2.9 End-to-end paths and feature reconciliation units

1. **Expense:** Trip draft helpers → `makeEvent` → Trip `commit` → `saveGroup` / `appendEvents` → `buildVerificationContext` → `fold` → balances/history/suggestions.
2. **Legacy sync:** Trip `runSync` → `syncOnce` / coordinator → capabilities → encryption / HTTP and Nostr publish → quorum marking → fetch/decrypt/admit → buffer/vector/confirmation writes → event/cursor transaction → snapshot → metadata / teardown.
3. **Migrated sync:** capabilities/generation record → Web Lock ownership → pending ciphertext retry → operated RPC receipt → initial history / per-event receipt scan → Nostr raw-source scan → durable source fragments → operated archive acknowledgement → checkpoint.
4. **Import:** pasted JSON → artifact dispatch/base checks → full replacement, identity replacement or delta insert → local reread/fold. These paths are not interchangeable.
5. **Archive:** suggested transfers → archive plan/event → downloaded export view → committed archive → archived polling suppression.
6. **Operator export:** environment/public-recipient validation → bounded source reads → optimistic consistency check → recipient encryption → exclusive file write → JSON summary.

The following 30 feature groups are the explicit denominator for Section 3. They aggregate repeated documentation statements; they are not a grading of every individual requirement assertion. FULL means source implements the described feature group without a gap established in that group by this pass, not production certification.

| Unit | Documented feature group | Source | Assessment |
|---|---|---|---|
| F01 | Browser bootstrap and trip selection | `src/main.ts`, `src/App.svelte` | FULL |
| F02 | Group creation and currency metadata | `src/db/repo.ts`, `src/Trip.svelte:919` | PARTIAL |
| F03 | Shadow participants and name matching | `src/lib/participants.ts`, `src/Trip.svelte:275` | FULL |
| F04 | Claim identity and authority | `core/src/identity.ts`, `src/db/repo.ts:743` | PARTIAL |
| F05 | Device delegation and social recovery | `src/lib/device-link.ts`, `core/src/identity.ts` | PARTIAL |
| F06 | Integer allocation integrated into entry | `core/src/money.ts`, `src/Trip.svelte:555` | PARTIAL |
| F07 | Single/multiple payer construction | `src/lib/payers.ts`, `core/src/types.ts` | FULL |
| F08 | Four split modes and transitions | `src/lib/split-preservation.ts`, `src/Trip.svelte:593` | PARTIAL |
| F09 | Multicurrency entry and correction | `src/lib/multicurrency.ts`, `src/Trip.svelte:677` | PARTIAL |
| F10 | Append-only expense history | `src/db/repo.ts:397`, `core/src/fold.ts` | PARTIAL |
| F11 | Replica event-set convergence | `src/db/repo.ts:700`, `src/relay/sync.ts` | PARTIAL |
| F12 | Participant union/distinct reconciliation | `core/src/identity.ts`, `core/src/fold.ts` | FULL |
| F13 | Settlement planning and application | `core/src/settle.ts`, `core/src/fold.ts:338` | PARTIAL |
| F14 | Settlement confirmation and reversal authority | `core/src/fold.ts:99,251` | PARTIAL |
| F15 | Group-key derivation and encrypted envelopes | `src/crypto/group.ts`, `src/crypto/envelope.ts` | FULL |
| F16 | Legacy dual-relay publication/readback | `src/relay/sync.ts`, `api/relay.ts` | PARTIAL |
| F17 | Admission budgets and clock handling | `core/src/transport.ts`, `src/lib/events.ts` | PARTIAL |
| F18 | Delivery coverage indicators | `src/lib/sync-coverage.ts`, `src/Trip.svelte:625` | PARTIAL |
| F19 | Migrated receipt/source recovery | `src/relay/migrated-sync.ts` | PARTIAL |
| F20 | Full-ledger and delta exchange | `src/db/repo.ts:416,587` | PARTIAL |
| F21 | Private identity backup/restore | `src/db/repo.ts:539,571` | PARTIAL |
| F22 | Archive and durability lifecycle | `src/lib/lifecycle.ts`, `src/Trip.svelte:814` | PARTIAL |
| F23 | Offline shell cache | `public/sw.js` | PARTIAL |
| F24 | Recovery, manual exchange and status UI | `src/Trip.svelte:1230-1815`, `src/lib/join-link.ts` | PARTIAL |
| F25 | Operated relay storage boundary | `api/relay.ts` | PARTIAL |
| F26 | SQL backend deployment/capacity path | `supabase/schemas/relay.sql` | PARTIAL |
| F27 | Operator encrypted export and usage reporting | `scripts/relay-migration.mjs`, `scripts/upstash-usage.py` | PARTIAL |
| F28 | Retention and relay-vetting tools | `scripts/task0-retention.mjs` | PARTIAL |
| F29 | One-action fork and re-key | `PRD.md:1054-1069`; no matching application action | ABSENT |
| F30 | Explicit financial-history Keep/Revert actions | `PRD.md:1248`; `src/Trip.svelte:1741-1749` displays history only | ABSENT |

Intent sources: `PRD.md` requirements/algorithms/decisions, `TDD.md`, `README.md`, `STATUS.md`, `CONTRIBUTING.md`, `SECURITY.md`, and tracked `.agents/` work orders/reports/journal/protocol. Historical rejected designs and superseded vendor choices are not counted as missing implementations. Operational report counts remain historical claims unless independently observed below.

## 3. Reconciliation Summary

Across the explicitly enumerated 30 feature groups, 5 are FULL (16.67%), 23 PARTIAL (76.67%) and 2 ABSENT (6.67%). These are source-level feature-group assessments, not test-pass percentages and not the historical 116-row STATUS grading. A complete assertion-by-assertion recertification of every STATUS row, including browser/platform and empirical retention requirements, is not established by this read-only run. Production readiness is **3/17 PASS**, with **6 FAIL, 6 PARTIAL and 2 N/A** under the evidence boundaries in Section 11.

The system has a deployed client, relay endpoint, event projection, replication and recovery machinery, but its financial and preservation claims exceed the paths established by source. Recorded suggested settlements increase rather than discharge balances; full imports overwrite newer local history and construct an inconsistent secret/tag pair; unsigned attribution can bypass settlement authority; and several durability operations cross separate transactions. Live HTTP availability and successful CI build conclusions do not establish those semantic properties. Migration preparation exists, but hosted SQL parity and operational capacity could not be verified through the available access path.

## 4. Critical Gaps — Documented but Unimplemented

| Feature / contract | Intent source | Source outcome | Register |
|---|---|---|---|
| Fork and re-key workflow | `PRD.md:1054-1069,1240` | No fork action; full import is not a valid substitute because it retains the old tag with a new secret | DRIFT-005, DATA-002 |
| Explicit Keep/Revert correction controls | `PRD.md:1248` | History is rendered as labelled values; generic edit remains available, but no selected-history reapply action | DRIFT-006 |
| Applied relay backoff/drop actions | `PRD.md:846-854` | Diagnostic metadata/text exists; scheduling and adapter construction do not apply it | REL-002 |
| Non-destructive ordinary ledger import | `PRD.md:298-299,1318` | Full import deletes/replaces same-ID event rows | DATA-001 |
| Reliable settlement closure | `PRD.md:1420-1427` | Suggested transfer applied as a ledger event increases the outstanding balances | LOGIC-001 |

Severity, confidence, minimum proposal and effort for each item are defined once in Section 8. No absent feature is silently proposed as a code change merely to make documentation true; drift-only selections correct documentation unless the user separately approves implementing the feature.

## 5. Ghost Features — Implemented but Undocumented

| Candidate | Documentation reconciliation | Outcome |
|---|---|---|
| Multiple selectable trips | `src/App.svelte`; `.agents/JOURNAL.md:169,211-224`, `TDD.md:49-50` | Documented; not a ghost. The older non-goal in `PRD.md:1498` is not current source behavior. |
| Subgroup presets | `src/lib/subgroups.ts`; `PRD.md:1379`, `.agents/JOURNAL.md:48` | Documented; not a ghost. |
| SQL relay/recovery | `server/supabase-relay.ts`, `src/relay/migrated-sync.ts`; `README.md:38-116`, `.agents/cr-017-report.md` | Documented preparation; hosted activation is unverified. |
| Exact signed-source retention | `src/relay/source-archive.ts`; `.agents/cr-017-report.md:345-435` | Documented in the change report but not reconciled into README; DRIFT-003. |
| New UI primitives | `src/lib/NeoCard.svelte`, `src/lib/NeoButton.svelte`; `.agents/JOURNAL.md:248` | Documented; not a ghost. |

- No GHOST finding is asserted from absence in the README alone.

## 6. Documentation Drift

| Intent / claim source | Actual source / observed difference | Register |
|---|---|---|
| `TDD.md:51-67,86,395-419,482-506` | Different file layout, Vite major, IndexedDB version/shape and package scripts; advertised root watch/deploy scripts are absent | DRIFT-001 |
| `PRD.md:291,309`, `STATUS.md:62,80` | Effective legacy quorum can accept a remaining adapter when operated storage is unconfigured or disabled | DRIFT-002 |
| `README.md:91-97` | Exact source fragments are now retained and acknowledged before checkpoint advancement | DRIFT-003 |
| `SECURITY.md:33-51`, `CONTRIBUTING.md:17` | Bot merges use checked, non-admin REST requests; secret scans exclude some bot PRs | DRIFT-004 |
| `PRD.md:1054-1069` | One-action fork/re-key absent | DRIFT-005 |
| `PRD.md:1248` | Keep/Revert controls absent | DRIFT-006 |
| `PRD.md:538-542` | Settlement sign formula agrees with the implementation but contradicts the debtor-to-creditor closure requirement | LOGIC-001; agreement between prose and code does not validate the arithmetic |
| `STATUS.md:7,210-246` | Historical grading mixes source shape, rendering and limited semantic audits | Not used as a fresh passing verdict; current findings supersede only their traced behavior claims |

## 7. Data Integrity

### 7.1 Code-defined stores and schema boundaries

| Store | Code-defined schema / constraints | Live match / counts / anomalies | Write-boundary assessment |
|---|---|---|---|
| IndexedDB `groups` | Key `groupId`; name, currency, deviceId, nextCounter, createdAt, secretB64, tagHex | Not available: no user browser database opened | Full replacement accepts structurally wider GroupRecord objects; DATA-001/002/006, PERF-003 |
| IndexedDB `events` | Key `[groupId,eventId]`; eventJson, local/published/confirmed state, optional publishedAt; byGroup/bySync indexes | Not available: no user rows sampled | Local puts overwrite by ID; remote inserts skip collisions; DATA-003/005, CONC-001 |
| IndexedDB `identity` | Key `[groupId,pid]`; deviceId, algorithm, public key/JWK and private JWK | Not available: private identity rows not read | Async mint races and replacement without keypair validation; CONC-003, DATA-003 |
| IndexedDB `meta` | Key groupId; vectors, cursors, signing material, durability, settings, snapshots and presets | Not available: no row counts sampled | Transactional callback coexists with stale full-record writers; CONC-002, DATA-007 |
| IndexedDB `buffer` | Key `[groupId,eventId]`; event JSON and retryAt | Not available: no retained-row counts sampled | Separate promotion/delete writes and per-call rather than retained-buffer limits; INTR-001, PERF-001 |
| Recovery `states` | Scope key; generation, cursor, initialReadDone, pending ciphertext, sourcePending, Nostr checkpoints and rotation | Not available: no browser recovery database opened | Initialization and acknowledge are transactions within recovery DB; ledger and recovery DBs remain separate |
| Recovery `receipts` | `[scope,id]`; event fingerprints and source-fragment receipt namespaces | Not available: no receipt sample | Pending deletion and receipts share a recovery transaction; later ledger status may require readback retry |
| Redis `ts:<tag>` | Stream ID → opaque blob and author | Not available: runtime Redis credentials/rows were not read | Append is not receipt-idempotent; client event deduplication is separate; REL-001, DATA-005 |
| Redis `tp:<tag>` | First-claimed commitment via SETNX, later GET comparison | Not available: no commitments sampled | No global enrollment/storage budget in handler; SEC-003 |
| SQL `relay_control` | Boolean singleton PK; write/import booleans; payload/entry/group and namespace/database budgets; nonnegative counters | **UNVERIFIED**: read-only Management queries returned HTTP 400 | Global row lock serializes reservations; no hosted budget/flag claim |
| SQL `relay_topics` | Tag PK with lowercase-hex check; nullable commitment; unsigned-64-range numeric cursor fields | **UNVERIFIED**: no hosted schema or row sample | Proof checking and cursor reservation serialized through control lock |
| SQL `relay_entries` | FK tag; cursor numeric pair; PK `(tag,cursor_ms,cursor_seq)`; nonempty blob, author length check; non-unique receipt digest index | **UNVERIFIED**: no hosted counts, duplicates or FK checks | Append finds exact existing blob/author; import preserves historical cursors and rejects conflicting existing content |

- Browser schema source: `src/db/repo.ts:12-123`; recovery schema: `src/relay/recovery-db.ts:4-36`; relay SQL: `supabase/schemas/relay.sql:9-47`.
- SQL source enables RLS and revokes public/anon/authenticated table/function privileges while granting service-role access. This is **code intent**, not a verified hosted ACL result (`supabase/schemas/relay.sql:43-47,222-231`).
- Hosted zero-row tables, orphan FKs, sentinel records, test records and corruption: **Not available: SQL access was not established.** Historical staging counts in `.agents/cr-017-report.md` are not copied into this column as current measurements.
- No database-file corruption or ongoing production record corruption was established. No repair, import, mutable RPC, key change or source deletion was performed.

### 7.2 Static counterexamples and attack/interruption proofs

| IDs | Concrete trace / preconditions | Consequence established from code |
|---|---|---|
| LOGIC-001 | Valid expense leaves creditor `+50`, debtor `-50`; `greedySettlement` returns debtor → creditor 50; `fold` adds 50 to payee and subtracts 50 from payer | Result is `+100/-100`, not zero (`core/src/settle.ts:23-42`, `core/src/fold.ts:333-340`, `src/Trip.svelte:1681-1684`). No program was executed for this arithmetic trace. |
| SEC-001 | Group member can construct an unsigned SettlementRecorded with `dev` equal to an existing uncontested payee device; encrypted group transport admits it | `bornConfirmed` trusts that string membership and does not request a signature (`core/src/fold.ts:251-264`). Additional invalid key-bearing events can also reuse an authorized public key in `authorisedDevices:121-124`. |
| SEC-002 | Group member emits EventVoided targeting a SettlementRecorded ID, rather than SettlementVoided | `voidedEventIds` accepts the target; fold skips it at line 205, bypassing `settlementVoidDecisions` recorder check (`core/src/identity.ts:36-43`, `core/src/fold.ts:99-124,204-205`). |
| DATA-001 | Same-ID local group has events A+B; imported older export contains A | Full import deletes both local event rows and inserts only A (`src/db/repo.ts:427-444`). No automatic pre-import snapshot/merge prompt is present in `src/Trip.svelte:876-907`. |
| DATA-002 | Export contains old tag but deliberately no secret; import creates random secret and retains old tag | Derived key/proof no longer matches original relay history, and `ensureGroup` rejects the old link against that stored secret (`src/db/repo.ts:419-424,352-354`). |
| DATA-003 | Base-valid ExpenseAdded JSON omits `financials`, or supplies incompatible row/money types; backup supplies record-shaped but invalid JWKs | Base import checks accept these shapes; writes occur before fold/signing discovers the error (`src/db/repo.ts:527-566`, `core/src/fold.ts:37-43,218`). Invalid backup rows can overwrite working identity keys (`src/db/repo.ts:579-583`). |
| DATA-004 | Empty receiver gets more than the unknown-author budget from one author, including that author's ParticipantAdded/Claimed marker | `knownAuthors(current)` is fixed before the loop; later events are dropped as unknown and legacy cursor can advance past them (`core/src/transport.ts:61-85`, `src/relay/sync.ts:278-304`). |
| DATA-005 | Two replicas receive different content for the same event ID in opposite orders | `upsertRemoteEvents` retains whichever content arrived first; legacy confirmation counts only IDs (`src/db/repo.ts:705-710`, `src/relay/sync.ts:254,296-299`). Migrated fingerprint checks do not cover manual/legacy callers. |
| DATA-006 | A join link is shared during setup; creator changes base currency afterward; peer retains the earlier seed metadata | `setCurrency` writes only the creator's group row, while GroupCreated/event history is unchanged; identical minor values are interpreted with different currency labels (`src/Trip.svelte:919-923`, `src/db/repo.ts:291-300,328-334`). |
| DATA-007 | Receiver buffers/drops an event but advances transportVector, then creates a local event | Local append stamps that transport progress into `vv`; another device's coverage helper treats it as possession (`core/src/transport.ts:81-102`, `src/db/repo.ts:203-205,406,681-697`, `src/lib/sync-coverage.ts:16-23`). |
| CONC-001 | Two tabs hydrate the same device/nextCounter; both create different events before either local view refreshes | Both IDs match; `appendEvents.put` replaces the earlier row. Sync Web Locks do not wrap UI event creation (`src/Trip.svelte:260-269`, `src/lib/events.ts:19-24`, `src/db/repo.ts:407`). |
| CONC-002 | A vector/snapshot writer reads meta; a transactional settings/event update commits; the earlier writer puts its stale object | Later settings/cursor/vector fields can be overwritten (`src/db/repo.ts:687-697,738-740` versus `updateMeta:239-247`). |
| CONC-003 | Two claims both read missing identity, await independent key generation, then put the same group/participant key | One private key replaces the other while either claim event may already reference the other public key (`src/db/repo.ts:743-758`). |
| INTR-001 | Future event was buffered in a previous page; its relay cursor already advanced; a later cycle deletes the due buffer row and dies before event insertion | No durable local copy remains and normal cursor reads do not revisit its source page (`src/relay/sync.ts:287-304`, `src/relay/migrated-sync.ts:118-121`). Recovery depends on an additional retained source, not the normal retry. |
| LOGIC-002 | Receiver observes root at wall 1000, then edits using local wall 900 while retaining a later vector/counter | Edit sorts before root and is skipped because no expense exists yet; the later financialWinner check is never reached (`src/lib/events.ts:9-10`, `core/src/fold.ts:128,232-234`). |
| LOGIC-003 | Existing v2 expense has a frozen rate; UI edits its total | Edit preserves rate but makeEvent defaults to v1; fold quarantines it because rate requires v2 (`src/Trip.svelte:677-694`, `src/lib/events.ts:17`, `core/src/fold.ts:30-43`). |
| LOGIC-004 | Foreign total 10.00 converts to base total 20.00; transition to percentage; separately, three equal one-cent shares convert to percentage | Wrong denominator produces 200%; independent rounding of three thirds produces 99.99%, both rejected by the 100% gate (`src/Trip.svelte:588,593-609`, `src/lib/split-preservation.ts:28`, `src/lib/money.ts:41-46`). |
| PERF-001 | Repeated pages contain distinct future events | Each call starts a new `buffered=[]`; existing held rows are neither counted nor capped before new puts (`core/src/transport.ts:64,98`, `src/db/repo.ts:663-670`). |
| REL-001 | A legal Redis page contains enough accepted blobs to exceed 2,100,000 bytes | Server count-only page exceeds client's byte limit; client rejects before persisting any cursor and repeats that page (`api/relay.ts:130-142`, `src/relay/http.ts:46`). |
| FE-002 | Trip name contains characters outside Latin-1 | `btoa(JSON.stringify(seed))` throws; copy-link constructs the URL before its try block (`src/lib/join-link.ts:8-9`, `src/Trip.svelte:846-850`). |
| FE-005 | Participants exist, a newer expense is quarantined, live-subset balances are zero | Settled banner and zero-balance prompt calculations do not inspect frozen state (`src/Trip.svelte:195,1081-1082,1121,1286-1292`). |

## 8. Findings Register

### SEC — Inspector

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| SEC-001 | P1 | CONFIRMED | core/src/fold.ts:253 | The system auto-confirms an unsigned settlement from a forgeable device ID and can infer device authority from invalid events reusing an authorized public key. | Remove device-ID-only auto-confirmation, emit a separately verified payee confirmation, and derive authorized devices only from individually verified authority edges. | L (>4h) |
| SEC-002 | P1 | CONFIRMED | core/src/fold.ts:205 | Generic EventVoided can erase a settlement without passing the settlement reversal authorization check. | Restrict generic void targets and require cryptographically verified reversal authority for settlement cancellation while preserving all original events. | L (>4h) |
| SEC-003 | P2 | CONFIRMED | api/relay.ts:104 | Public callers can enroll arbitrary tags and consume operated storage without an application-level enrollment, request-rate or total-storage budget. | Add server-side admission and bounded resource budgets that reject new work without deleting retained history, after backing up affected configuration. | L (>4h) |
| SEC-004 | P2 | POTENTIAL | package-lock.json:2347 | Locked devalue and sharp versions match published advisories, although a vulnerable production input path was not established. | Update the affected dependency chains to advisory-fixed versions, retain the old lockfiles as named backups, and verify actual parser reachability and compatibility before release. | M (1–4h) |

### DATA — Archivist

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| DATA-001 | P1 | CONFIRMED | src/db/repo.ts:430 | Full-ledger import deletes newer same-group events absent from the imported artifact. | Back up the existing ledger and replace destructive import with validated set-union or an isolated imported copy, preserving every existing record. | L (>4h) |
| DATA-002 | P1 | CONFIRMED | src/db/repo.ts:423 | Full import pairs a newly generated secret with the old tag, breaking decryption, write proof and rejoining of the original trip. | Preserve a matching existing secret or require a verified matching join seed, otherwise keep the imported ledger explicitly offline rather than fabricating a secret for the old tag. | L (>4h) |
| DATA-003 | P1 | CONFIRMED | src/db/repo.ts:527 | Import validation omits event-variant and keypair checks, allowing malformed events or unusable identity material to be persisted over working state. | Parse complete artifact/event variants and verify identity keypair consistency before any write, retaining rejected input separately from the active ledger. | L (>4h) |
| DATA-004 | P1 | CONFIRMED | core/src/transport.ts:61 | An author introduced within an incoming batch remains classified unknown for that whole batch, so legitimate history can be dropped before the legacy cursor advances. | Determine eligible known authors from validated batch context before budgeting and retain a recoverable checkpoint whenever legitimate entries are rejected. | M (1–4h) |
| DATA-005 | P1 | CONFIRMED | src/db/repo.ts:707 | Legacy and delta ingestion silently choose first-arriving content for duplicate IDs, allowing permanent replica disagreement and incorrect ID-only confirmation. | Compare canonical event fingerprints at every persistence/readback boundary and retain conflicting variants for reconciliation instead of silently accepting one. | L (>4h) |
| DATA-006 | P1 | CONFIRMED | src/Trip.svelte:919 | Base-currency edits are local metadata only, so peers using an earlier join seed can interpret the same amounts in different currencies. | Replicate an explicit base-currency decision and freeze or version it before monetary entries, without relabelling retained amounts or rewriting historical events. | L (>4h) |
| DATA-007 | P1 | CONFIRMED | src/db/repo.ts:406 | Local publication vectors can acknowledge buffered or dropped progress that the delivery UI then treats as actual possession. | Separate transport/discard progress from conservative durable-event coverage and use only the latter for published delivery claims. | L (>4h) |

### CONC — Paranoid

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| CONC-001 | P1 | CONFIRMED | src/db/repo.ts:407 | Concurrent UI commands can allocate the same device-counter ID and overwrite an earlier local event. | Allocate counters and insert events atomically with collision rejection, sharing the same write boundary across tabs and asynchronous commands. | L (>4h) |
| CONC-002 | P1 | CONFIRMED | src/db/repo.ts:687 | Nontransactional metadata read/modify/write paths can overwrite intervening cursor, vector, settings or durability updates. | Route vector, snapshot and normalization updates through a single-store transactional merge over the latest row. | M (1–4h) |
| CONC-003 | P1 | CONFIRMED | src/db/repo.ts:743 | Concurrent claim-key minting can replace the private key associated with a claim event already being produced. | Generate candidates outside IndexedDB, then transactionally recheck and insert-or-return the existing identity before signing. | M (1–4h) |

### INTR — Paranoid

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| INTR-001 | P1 | CONFIRMED | src/relay/sync.ts:287 | Buffer promotion deletes the durable buffered event before its admitted event row commits, creating a crash-loss window after the source cursor has advanced. | Commit buffer removal, admitted rows and relevant metadata together in one ledger transaction in both synchronization paths. | L (>4h) |
| INTR-002 | P2 | CONFIRMED | scripts/task0-retention.mjs:112 | Cohort publication records its manifest only after all network writes, so interruption loses the identity and progress needed to continue that measurement. | Persist an atomic cohort journal before publication and checkpoint each result, preserving existing manifests and historical reports. | M (1–4h) |
| INTR-003 | P2 | CONFIRMED | scripts/relay-migration.mjs:283 | Direct final-path export writes can leave a truncated encrypted artifact that exclusive-create retry will refuse to replace. | Stage and flush a new temporary artifact before atomic final publication, preserving any existing or interrupted artifact rather than overwriting it. | M (1–4h) |

### LOGIC — Inspector

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| LOGIC-001 | P1 | CONFIRMED | core/src/fold.ts:339 | Recording a debtor-to-creditor settlement increases both outstanding balances instead of discharging them. | Add the payment to the debtor balance and subtract it from the creditor balance, with a suggested-transfer-through-fold regression and correction of the matching prose formula. | M (1–4h) |
| LOGIC-002 | P1 | CONFIRMED | src/lib/events.ts:10 | New events use raw wall time without receiving the observed HLC, so a causally later edit can sort before its root and disappear from projection. | Persist and advance a per-group HLC from observed events during atomic event allocation, preserving existing timestamps. | L (>4h) |
| LOGIC-003 | P1 | CONFIRMED | src/Trip.svelte:689 | Editing a rate-bearing expense emits a default-v1 event, causing the system to quarantine its own correction and freeze balances. | Derive the edit event version from its retained financial fields and cover the complete multicurrency-edit workflow. | S (<1h) |
| LOGIC-004 | P2 | CONFIRMED | src/Trip.svelte:597 | Percentage transitions use the entered foreign denominator and independently rounded shares, so valid splits can become totals other than 100%. | Pass the validated base-minor total to split preservation and conserve the percentage basis-point total. | S (<1h) |
| LOGIC-005 | P2 | CONFIRMED | src/Trip.svelte:569 | Saved allocations reuse the constant preview hash seed, repeatedly favoring the same participants instead of the actual event-ID tie-break. | Reserve the event ID before preview/allocation and use that stable ID for both the displayed and committed split. | M (1–4h) |
| LOGIC-006 | P2 | CONFIRMED | src/Trip.svelte:829 | Archiving immediately suppresses polling while the new archive event and other pending events can remain local indefinitely. | Keep a bounded outbox-drain/readback path active for archived groups until pending writes are confirmed, while leaving normal archived browsing read-only. | M (1–4h) |

### PERF — Inspector

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| PERF-001 | P2 | CONFIRMED | core/src/transport.ts:98 | The future-event limit applies only to each new batch and does not bound the retained buffer across synchronization cycles. | Account for existing buffered rows in admission and reject or defer additional work without deleting retained events. | M (1–4h) |
| PERF-002 | P2 | CONFIRMED | src/lib/verification.ts:41 | Every refresh repeats sequential signature checks across unrelated public keys, with work growing with signature count times key count. | Cache immutable verification results and restrict candidate keys to the relevant authority chain before scheduling bounded verification work. | M (1–4h) |
| PERF-003 | P2 | CONFIRMED | src/db/repo.ts:394 | Group writes persist hydrated event, identity and metadata copies because callers pass GroupRecord objects, duplicating ledger data in the groups store. | Explicitly project StoredGroup fields at the write boundary and preserve existing records during any later storage-normalization migration. | M (1–4h) |

### REL — Inspector / SRE

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| REL-001 | P1 | CONFIRMED | api/relay.ts:130 | Count-bounded Redis pages can exceed the client's byte limit, causing repeated rejection of the same page and stalled recovery. | Bound the operated response by serialized bytes without skipping the first omitted row and cover progress across oversized pages. | M (1–4h) |
| REL-002 | P2 | CONFIRMED | src/relay/diagnostics.ts:39 | Backoff and drop decisions are displayed but never applied to relay scheduling, so failed endpoints continue receiving work at the normal cadence. | Persist per-relay retry/drop state and apply it in transport scheduling, preserving user settings and local outboxes. | M (1–4h) |
| REL-003 | P2 | CONFIRMED | scripts/task0-retention.mjs:517 | The batch probe sends multiple Nostr event objects in one frame rather than the client's single encrypted-batch event, so its result does not validate the production batching path. | Probe the actual production envelope shape with correlated acknowledgements and append corrected interpretation while preserving original measurements. | M (1–4h) |
| REL-004 | P2 | CONFIRMED | scripts/task0-retention.mjs:475 | The vet command can print FAIL and still exit successfully, preventing exit-status-based enforcement of relay admission. | Return explicit nonzero exit status for failed vetting and define the WARN policy without changing retained cohorts. | S (<1h) |
| REL-005 | P2 | CONFIRMED | .github/workflows/dependency-review.yml:27 | The live dependency-review job fails before evaluating dependencies because the repository lacks supported dependency-review availability. | Enable the required repository capability or provide a working review gate, backing up the workflow before any edit. | M (1–4h) |
| REL-006 | P2 | CONFIRMED | .github/workflows/semgrep.yml:75 | Scanner shell fallbacks suppress both findings and scanner execution errors, allowing a successful job conclusion without a successful scan. | Preserve SARIF upload but distinguish findings policy from scanner failure and propagate execution failures after backed-up workflow changes. | M (1–4h) |
| REL-007 | P2 | CONFIRMED | public/sw.js:36 | Network error-status responses can replace the cached working shell and then be replayed during offline launch. | Cache only successful eligible responses and use the retained working shell when a navigation response is unsuccessful. | S (<1h) |
| REL-008 | P2 | CONFIRMED | supabase/schemas/relay.sql:5 | The repository contains a creation transaction but no tracked versioned upgrade sequence for the already-staged schema described by its operator records. | Add reviewed versioned migrations generated from the desired schema plus forward-compensation instructions after a verified encrypted schema/data backup, preserving the original schema file. | L (>4h) |

### FE — Client inspector

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| FE-005 | P1 | CONFIRMED | src/Trip.svelte:195 | A frozen ledger can still show a settled-success banner and derive zero-balance export prompts from its incomplete live subset. | Require an authoritative unfrozen state for settled-success claims and outstanding-balance summaries while retaining explicit unknown-state export access. | M (1–4h) |
| FE-001 | P2 | CONFIRMED | src/Trip.svelte:1308 | Manual Export and Share Delta actions are conditional on prompts or overdue synchronization instead of remaining available for an ordinary healthy trip. | Add persistent manual exchange actions outside conditional prompt branches without changing automatic prompt triggers. | S (<1h) |
| FE-002 | P2 | CONFIRMED | src/lib/join-link.ts:9 | Join-link encoding fails for non-Latin-1 trip names because JSON text is passed directly to btoa. | Encode and decode UTF-8 bytes before base64url conversion and preserve compatibility with existing links. | S (<1h) |
| FE-003 | P2 | CONFIRMED | src/Trip.svelte:1765 | Custom modal dialogs do not manage initial focus, focus containment, Escape or focus restoration, leaving keyboard navigation outside the declared modal. | Implement a shared accessible dialog lifecycle with focus entry/containment/restoration and keyboard dismissal. | M (1–4h) |
| FE-004 | P2 | CONFIRMED | src/Trip.svelte:1390 | Protection and reconciliation information is placed inside a closed details element despite the intended persistent status/banner contract. | Render the required status and reconciliation summary outside the disclosure while keeping detailed controls collapsible. | S (<1h) |

### FS — Pathologist

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| FS-001 | P3 | CONFIRMED | SECURITY.md:29 | A control character and split scope token corrupt the credential-scope documentation. | Preserve a named copy and repair the damaged scope text while reconciling the current security model. | S (<1h) |
| FS-002 | P3 | CONFIRMED | .agents/task0-retention.md:83 | Retention rows are appended beneath an incompatible table header, mislabelling the historical measurement columns. | Preserve all original report bytes and append a correctly headed retention section, updating the writer to maintain section boundaries. | M (1–4h) |

### DRIFT — Detective

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| DRIFT-001 | P2 | CONFIRMED | TDD.md:482 | DRIFT: layout, runtime, storage and command examples describe interfaces that differ from the current implementation. | Reconcile active technical examples with current paths, scripts, schemas and environment names while retaining historical decisions as history. | M (1–4h) |
| DRIFT-002 | P2 | CONFIRMED | PRD.md:291 | DRIFT: the documented mandatory operated-relay quorum conflicts with the implemented legacy fallback and device-local routing options. | Record the implemented quorum exceptions and their durability limits in active requirements and status documentation rather than silently changing runtime policy. | M (1–4h) |
| DRIFT-005 | P2 | CONFIRMED | PRD.md:1054 | HALLUCINATION: the specification presents one-action fork/re-key as resolved although no application workflow implements it. | Mark the workflow unimplemented and remove the completion claim unless the user separately approves a feature specification. | S (<1h) |
| DRIFT-003 | P3 | CONFIRMED | README.md:91 | DRIFT: the README describes event-only recovery although the migrated path now retains exact signed-source fragments. | Describe the implemented fragment/receipt path and keep global source-completeness and cutover limits explicit. | S (<1h) |
| DRIFT-004 | P3 | CONFIRMED | SECURITY.md:36 | DRIFT: security documentation claims admin-bypass bot merging and universal secret scanning that the current workflows do not perform. | Document checked non-admin merges, actual scan exclusions and the external secret-propagation claim's verification boundary. | S (<1h) |
| DRIFT-006 | P3 | CONFIRMED | PRD.md:1248 | HALLUCINATION: explicit Keep/Revert correction actions are described as resolved but the UI only displays history and generic editing. | Document passive history and manual correction as the current behavior and mark selected-history reapplication as unimplemented. | S (<1h) |

### STRUCT — Urbanist

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| STRUCT-001 | P2 | CONFIRMED | src/Trip.svelte:1 | One component owns financial commands, cryptographic actions, synchronization, imports, lifecycle policy and all major view panels, coupling unrelated change surfaces. | After behavioral repairs, extract the named panels and their command interfaces while retaining a single trip-lifetime controller and unchanged persistence ownership. | L (>4h) |

### DEAD — Undertaker

| ID | SEVERITY | CONFIDENCE | FILE:LINE | ISSUE | FIX | EFFORT |
|---|---|---|---|---|---|---|
| DEAD-001 | P3 | CONFIRMED | core/src/fold.ts:209 | The rename replacement predicate always evaluates true and references a state field that is never part of ParticipantState. | Remove the inert predicate and state the ordered-pass replacement rule directly without changing behavior. | S (<1h) |

### Advisory evidence for SEC-004

| Locked package | Advisory | Fixed boundary reported by source | Exposure limit |
|---|---|---|---|
| `devalue@5.9.1` | [GHSA-9rgm-9g3h-6x36](https://api.osv.dev/v1/vulns/GHSA-9rgm-9g3h-6x36), CVE-2026-81176 | 5.9.2 | Requires untrusted input to `devalue.parse`; no such application call was established. |
| `sharp@0.33.5` | [GHSA-f88m-g3jw-g9cj](https://api.osv.dev/v1/vulns/GHSA-f88m-g3jw-g9cj) | 0.35.0 for this advisory | Repository icon tool reads a fixed local SVG, not a demonstrated public upload route. |
| `sharp@0.33.5` | [GHSA-rgj7-g3m4-5g8c](https://api.osv.dev/v1/vulns/GHSA-rgj7-g3m4-5g8c) | 0.35.4 | Codec/platform/input conditions apply; no production RCE claim is made. |

### Additional evidence for lower-level findings

- **PERF-002:** `addEventSignatureRequests` iterates all known public keys for each link/reattest/confirmation; `buildVerificationContext` awaits every generated request and is rebuilt on refresh (`src/lib/verification.ts:17-44,68-96`, `src/Trip.svelte:244-247`). No elapsed-time benchmark is claimed.
- **PERF-003:** Trip passes `{ ...group, nextCounter }`; GroupRecord includes `events`, `meta`, `identities`; saveGroup stores the object without selecting fields (`src/Trip.svelte:265-269`, `src/db/repo.ts:140-144,392-394`).
- **REL-002:** actionKind/retryAfterMs are produced in diagnostics and rendered by `src/lib/relay-diagnostics.ts`; `createRelays` reconstructs the configured targets and polling uses lifecycle cadence, not these action records.
- **REL-006:** both `.github/workflows/semgrep.yml:75` and `.github/workflows/bandit.yml:71` suppress the scan command's exit status; Semgrep SARIF upload also permits error.
- **FE-001:** export/share calls occur in overdue/prompt/empty-state branches or archive flow; the healthy advanced panel at `src/Trip.svelte:1389-1485` contains no unconditional ledger export/delta controls.
- **FE-003:** modal markup at `src/Trip.svelte:1765-1810` declares `aria-modal`; the global key handler at lines 1201–1205 records activity and is not a dialog keyboard handler.
- **FS-002:** original retention table at `.agents/task0-retention.md:39` has six columns; later rows have seven; rows appended after line 82 also follow the A13 table's different headers. Existing measurements are evidence to preserve, not expendable files.

## 9. Interruption & Recovery Analysis

| Path / operation | Interruption point | Consequence | Recoverable? | Finding ID |
|---|---|---|---|---|
| Group creation / ensureGroup | Before transaction completion | Transaction rolls back; crypto candidate may be discarded | Transaction-local recovery in source | — |
| UI event allocation | Between factory creation and event put; overlapping caller | Duplicate counter ID can overwrite a different event | Not by ordinary retry after overwrite | CONC-001 |
| UI commit | After saveGroup, before appendEvents | Counter/group snapshot can advance without the intended event | Gaps possible; command retry not represented by a stable command token | CONC-001, PERF-003 |
| Claim identity | After one key write while another candidate/signing action continues | Stored private key may not match the produced claim | Requires retained matching backup or renewed authority | CONC-003 |
| Full import | Transaction commits older snapshot | Atomic transaction still deliberately removes newer records and changes key material | Only with separately retained ledger/key copies | DATA-001, DATA-002 |
| Malformed import | After storage, before fold/signing | Persisted invalid event/key reappears on subsequent reads | No validated in-app repair path established | DATA-003 |
| Remote event/cursor write | During events/meta transaction | Catch aborts event/cursor changes together | Page can be retried | — |
| Future-event promotion | After buffer deletion, before event insertion | Buffered source lost behind an already advanced cursor | Additional source replay may help; normal retry cannot guarantee it | INTR-001 |
| Metadata update | Between separate get and put while another writer commits | Lost concurrent fields / regressed progress | Not reliably reconstructed from that overwritten row | CONC-002 |
| Legacy publish | Provider accepts, acknowledgement lost | Local event retries; additional stream rows possible | Event-level deduplication, subject to collision defect | DATA-005 |
| Legacy oversized read | Body limit exceeded before cursor commit | Same page fetched and rejected repeatedly | Requires smaller server byte-bounded page | REL-001 |
| Migrated pending packet | Remote accepts, receipt response lost | Persisted exact ciphertext retried; SQL matches prior blob/author | Source-defined receipt path | — |
| Recovery receipt → ledger status | After recovery ACK transaction, before ledger status marking | Receipt and UI state temporarily differ | Subsequent operated readback can reconcile; not a single cross-database commit | — |
| Retained-source upload | Before/after fragment ACK or local receipt commit | Durable queued packet remains or completed fragment advances | Recovery transaction retains the remaining queue/checkpoint | — |
| Archive | After archive event commit but before a sync cycle | Polling eligibility becomes false with an undrained outbox | Requires reopening/manual intervention without revised drain path | LOGIC-006 |
| Operator cohort publishing | After any network publish, before final manifest write | Published experiment cannot resume from recorded IDs/progress | Original remote data may exist without a durable local cohort record | INTR-002 |
| Encrypted export | During final-file write | Partial ciphertext file occupies intended output path | New output path can be used; existing partial artifact must be preserved | INTR-003 |
| Service-worker refresh | Successful network delivery of an HTTP error response | Working offline shell can be replaced with error content | Later successful online load may repair cache | REL-007 |
| SQL append/import | Within source-defined transaction | Locks/quota counters and rows roll back together | Code-defined transaction; hosted behavior not measured | — |

### Live observations and commands

| Observation | Exact read-only surface | Result / limit |
|---|---|---|
| Public HTML | `Invoke-WebRequest -Method Head -Uri https://theprawnsplit.vercel.app/ -TimeoutSec 20` | HTTP 200; HTML content type; cache must revalidate; frame denial header present. |
| Worker | HEAD `https://theprawnsplit.vercel.app/sw.js` | HTTP 200 JavaScript. |
| Manifest | HEAD `https://theprawnsplit.vercel.app/manifest.webmanifest` | HTTP 200 manifest JSON. |
| Relay generation | GET `https://theprawnsplit.vercel.app/api/relay?capabilities=1` | HTTP 200; `{"protocol":1,"mode":"legacy","generation":null}`; `Cache-Control: no-store`. This does not test database availability. |
| Release CI | `gh run list --limit 20 --json databaseId,workflowName,headSha,headBranch,status,conclusion,event,url` | [Release run 35285436250](https://github.com/hongyime/theprawnsplit/actions/runs/35285436250) concluded success at `a13b1c53e8437ea3f8b7eb921a353655d3efb522`, not the local audit SHA. |
| Dependency gate | `gh run view 35266608032 --log-failed` | [Run 35266608032](https://github.com/hongyime/theprawnsplit/actions/runs/35266608032) reported dependency review unsupported and directed enabling Dependency graph; no dependency analysis result was produced. |
| Scheduled retention | `gh run list` above | [Run 35435670385](https://github.com/hongyime/theprawnsplit/actions/runs/35435670385) concluded success; this is job metadata, not an independent raw-relay retention measurement. |
| Local services | `docker ps --format '{{.Names}}\|{{.Image}}\|{{.Status}}\|{{.Ports}}'`; `Get-NetTCPConnection -State Listen` filtered to candidate ports | No container/listener was established as belonging to this application; unrelated services were not opened, stopped or inspected further. |
| Advisory lookup | POST query-only request to `https://api.osv.dev/v1/querybatch` for lockfile name/version pairs, followed by advisory GETs | 310 unique pairs queried; the three advisory IDs above matched. No package manager mutation/install was run. |
| Database discovery | GET `https://api.supabase.com/v1/projects`, matching only the project named in `.agents/cr-017-report.md` | One documented-name match; provider metadata reported `ACTIVE_HEALTHY`. Other project details are omitted. |
| Database SELECT attempts | POST `/v1/projects/{ref}/database/query/read-only`; then `/database/query` with `read_only: true` | Both returned HTTP 400 before usable schema/count results. Query used qualified catalog SELECTs; no mutable RPC or SQL statement was sent. |

- Database request shapes were checked against the Supabase Management OpenAPI schema. The failed requests do not establish a corrupt database, a schema mismatch, or absence of records.
- Hosted process/thread state, database logs, restart history, queue depths, cache ratios, memory growth and slow-query samples: **Not available: no relevant runtime observability access was established.**
- No resources were started for this audit. No teardown or production reset was required.

## 10. Structural Reorganization Plan

### 10a. Current file tree

Full tracked path inventory follows. `REPO_MAP.md` is an additional untracked input; this report is the new audit output. Ignored local trees are excluded rather than treated as repository source.

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

### 10b. Target file tree

- **Exact retained set:** every path in 10a remains at the identical path; `REPO_MAP.md` and `AUDIT.md` remain root pipeline artifacts. No existing file is relocated or deleted.
- **Exact additions for STRUCT-001:** `src/trip/ExpensePanel.svelte`, `src/trip/PeoplePanel.svelte`, `src/trip/RecoveryPanel.svelte`, `src/trip/SettlementPanel.svelte`, `src/trip/SyncPanel.svelte`.
- **Migration additions for REL-008:** `supabase/migrations/`; individual migration filenames are generated by the schema workflow in 02_EXECUTE after hosted baseline verification, rather than inventing an applied version here.
- The full target is the retained set plus those additions; all unchanged paths are explicitly enumerated in 10a rather than represented by a wildcard.

Expanded target path tree (directory purposes follow in the table):

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
.audit-backups/ (owner-controlled, ignored preservation artifacts)
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
AUDIT.md
CONTRIBUTING.md
LICENSE
NOTICE
PRD.md
README.md
REPO_MAP.md
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
src/trip/ExpensePanel.svelte
src/trip/PeoplePanel.svelte
src/trip/RecoveryPanel.svelte
src/trip/SettlementPanel.svelte
src/trip/SyncPanel.svelte
src/vite-env.d.ts
supabase/migrations/ (filenames generated after verified hosted baseline)
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

| Target directory | Purpose |
|---|---|
| Root | Package/compiler/deployment entry configuration and pipeline/project documents |
| `.agents/`, `.agents/handoffs/` | Preserved historical decisions, work orders, reports and continuity records |
| `.github/`, `.github/ISSUE_TEMPLATE/`, `.github/scripts/`, `.github/workflows/` | Repository metadata, issue forms and automation |
| `api/`, `server/` | HTTP transport boundary and server storage client |
| `core/`, `core/src/`, `core/test/` | Separately testable domain package |
| `public/`, `public/fonts/` | Public install/cache/assets |
| `scripts/` | Operator and build utilities; existing cohorts preserved |
| `src/` | Bootstrap and one trip-lifetime controller |
| `src/crypto/`, `src/db/`, `src/lib/`, `src/relay/` | Existing crypto, persistence, policy and replication boundaries |
| `src/trip/` | Proposed view panels with explicit props/callbacks and no duplicate persistence ownership |
| `supabase/schemas/`, `supabase/migrations/` | Desired schema plus reviewed reproducible upgrade history |
| `test/`, `test/maintenance/`, `test/stubs/` | Behavioral/unit/maintenance tests and explicit test substitutes |
| `.audit-backups/` | Proposed ignored, owner-controlled recovery copies; never public credential storage |

### 10c. Sequenced extraction and protection plan

No move or extraction is authorized by this report. Structural extraction follows semantic fixes and characterization coverage.

| Step | Action | Source | Destination | Protected? | Backup required? |
|---|---|---|---|---|---|
| 1 | Snapshot exact pre-change files and verify readback/hash | Each selected existing path | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/<same-relative-path>` | Treat all selected files as protected for this plan | Yes, before editing; no snapshot created in this stage |
| 2 | Preserve browser ledger/identity state before any repair procedure | Owned browser IndexedDB stores | Named encrypted `browser-ledgers-before-repair.enc.json` in the same backup root | Yes | Yes; valid decryption/record counts confirmed; do not collect other users' devices implicitly |
| 3 | Establish hosted migration baseline read-only | Existing relay schema/data | Named encrypted `relay-schema-and-data-before-migration.enc.json` in the same backup root | Yes | Yes; live access and parity must be independently established first |
| 4 | Extract expense view, preserving controller callbacks | Sections of `src/Trip.svelte` | `src/trip/ExpensePanel.svelte` | Source retained | Source backup required |
| 5 | Extract roster view | Sections of `src/Trip.svelte` | `src/trip/PeoplePanel.svelte` | Source retained | Source backup required |
| 6 | Extract recovery/import view | Sections of `src/Trip.svelte` | `src/trip/RecoveryPanel.svelte` | Source retained; handles protected data | Source backup required |
| 7 | Extract settlement view | Sections of `src/Trip.svelte` | `src/trip/SettlementPanel.svelte` | Source retained | Source backup required |
| 8 | Extract sync/status view | Sections of `src/Trip.svelte` | `src/trip/SyncPanel.svelte` | Source retained | Source backup required |
| 9 | Generate/review additive upgrade history from verified desired/live baseline | `supabase/schemas/relay.sql` and verified catalog | `supabase/migrations/` | Yes; original SQL retained | Verified encrypted schema/data backup and original SQL copy required |

Explicit protected-configuration backup names for likely selected changes:

| Existing path | Required backup path before any edit |
|---|---|
| `.github/workflows/dependency-review.yml` | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/.github/workflows/dependency-review.yml` |
| `.github/workflows/semgrep.yml` | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/.github/workflows/semgrep.yml` |
| `.github/workflows/bandit.yml` | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/.github/workflows/bandit.yml` |
| `src/config.ts` if a selected repair needs a configuration change | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/src/config.ts` |
| `supabase/schemas/relay.sql` | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/supabase/schemas/relay.sql` |
| `vitest.config.ts` if test routing changes | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/vitest.config.ts` |
| `package.json`, `package-lock.json` | Same relative paths beneath the exact backup root above |
| `core/package.json`, `core/package-lock.json` if dependency changes touch them | Same relative paths beneath the exact backup root above |
| `.gitignore` | `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/.gitignore` |

- Revalidate HEAD and existing working-tree changes in 02_EXECUTE; the backup must reflect the actual pre-change bytes, not merely this audit SHA's repository version.
- Credential-bearing backups require owner-controlled encryption/access and must never be committed or uploaded as public artifacts. No environment/session/key relocation is proposed.
- No proposal authorizes deleting records, restoring over unpreserved data, dropping tables or discarding failed/partial artifacts. Rollback uses preserved copies and forward-compatible application changes, with any data operation separately approved.

### 10d. New directories

| Directory | Purpose / related selection |
|---|---|
| `src/trip/` | Panel extraction only; STRUCT-001 |
| `supabase/migrations/` | Reviewed versioned schema transitions; REL-008 |
| `.audit-backups/` | Verified pre-change preservation artifacts, ignored and access-controlled |

### 10e. .gitignore additions

| Pattern | Reason |
|---|---|
| `.audit-backups/` | Exclude future preservation copies, especially encrypted data/key backups; verify the existing dot-directory rule already covers this before adding redundant text |

No production source, lockfile, public font/icon, historical report or migration is proposed for removal from tracking solely because it is generated or binary.

## 11. Production Readiness Checklist

| # | Item | Assessment | Evidence / covering finding |
|---:|---|---|---|
| 1 | Deployment secrets externalized | PASS | Inspected server paths read environment names; probe manifests contain public keys, not retained private keys. Browser-generated group/claim keys intentionally live in browser storage. Historical secret scanning remains outside this claim. |
| 2 | Pinned dependencies without known CVEs | FAIL | Lockfiles resolve versions, but advisory matches remain; SEC-004. No production exploitability claim. |
| 3 | Versioned/recoverable migrations | FAIL | Desired creation SQL and externally described upgrades lack a tracked executable transition chain; REL-008. Destructive down-migrations are not proposed. |
| 4 | External-call timeout and retry | PARTIAL | App request/cycle deadlines exist; diagnostics do not govern retry/drop behavior and manual probe connection paths have no complete deadline; REL-002, `scripts/task0-retention.mjs:333-336,413-416,485`. |
| 5 | Structured logging | PARTIAL | Export/usage tools emit JSON; UI/operator paths also use text and provider/runtime logs were not accessible (`scripts/`, `src/relay/types.ts`, `api/relay.ts`). |
| 6 | No exposed debug/test routes | PASS | Only capability/read/append handler branches found in `api/relay.ts`; test helpers are not HTTP routes. |
| 7 | Graceful shutdown for long-running services | N/A | No application-owned daemon/server process declared; browser/pool lifecycle is covered separately. |
| 8 | Error responses avoid stack/internal detail leaks | PASS | Edge handler returns fixed storage failure messages; server RPC wrapper suppresses provider details (`api/relay.ts:146-151`, `server/supabase-relay.ts`). |
| 9 | Every external input validated | FAIL | Event variants and identity keypair material can pass import guards before persistence; DATA-003. |
| 10 | Health/monitoring equivalent | PARTIAL | Live capabilities route answers, and usage/retention jobs exist, but capabilities does not check storage and no current database/trace metrics were obtained. |
| 11 | Atomic/guarded file writes | FAIL | Cohort manifests and encrypted artifacts have interruption windows; INTR-002, INTR-003. |
| 12 | Public abuse prevention | PARTIAL | Existing-tag write proof and per-request field limits exist; global enrollment/storage/rate admission is absent in source; SEC-003. External edge policy not inspected. |
| 13 | Session/token expiry | N/A | No account-session system; non-expiring group bearer capability is an explicit design limitation (`PRD.md:1046-1070`). |
| 14 | Critical-path test coverage | PARTIAL | Unit/property/in-process UI/storage tests exist, but critical semantic counterexamples survive their intended coverage; LOGIC-001, CONC-001, DATA-001. Some real UI primitives are aliased out. |
| 15 | Documented reproducible build/start | PARTIAL | Lockfiles and successful hosted release evidence exist; active technical examples diverge from executable commands; DRIFT-001. |
| 16 | Retryable writes idempotent | FAIL | Full imports change key/state on repetition and local event allocation can overwrite collisions; DATA-001, DATA-002, CONC-001. SQL exact-blob receipts cover only one path. |
| 17 | Background work survives interruption | FAIL | Buffered-event promotion can lose its sole local copy, and cohort progress is recorded only at completion; INTR-001, INTR-002. |

- PASS means the stated evidence boundary passed inspection, not a universal deployment warranty.
- Totals: PASS 3; FAIL 6; PARTIAL 6; N/A 2.

## 12. Prioritized Remediation Roadmap

All entries are proposals. Protected-file and database preservation requirements from Section 10 apply before the selected action. Verification below is a contract for 02_EXECUTE; it was not run here.

| Order | Finding ID | Action / rationale | Files affected | Effort |
|---:|---|---|---|---|
| 1 | SEC-001 | Close unsigned confirmation/device-authority path before trusting settlement status | `core/src/fold.ts`, `core/src/identity.ts`, `src/Trip.svelte`, authority tests | L |
| 2 | SEC-002 | Separate generic void from authenticated settlement reversal | Core identity/fold/types, settlement callers/tests | L |
| 3 | DATA-001 | Preserve newer records on import; require backup before any existing-data repair | `src/db/repo.ts`, import UI/tests | L |
| 4 | DATA-002 | Preserve/verify secret-tag continuity; explicitly distinguish offline imports from linked recovery | Repository, import/join helpers/tests | L |
| 5 | DATA-003 | Validate artifacts and keys before persistence | Repository, transport parsing boundary, core/schema tests | L |
| 6 | DATA-005 | Reject identity collisions consistently before cursor/confirmation claims | Repository, both sync paths, delta/readback tests | L |
| 7 | DATA-006 | Establish one replicated base-currency contract | Repository/types, metadata UI, multi-device tests | L |
| 8 | DATA-004 | Correct within-batch author admission and checkpoint retention | `core/src/transport.ts`, sync tests | M |
| 9 | DATA-007 | Separate receipt coverage from transport/discard progress | Repository, transport, coverage helpers/tests | L |
| 10 | LOGIC-001 | Correct settlement arithmetic and prove end-to-end zeroing, not merely total zero-sum | `core/src/fold.ts`, settlement tests, `PRD.md` formula | M |
| 11 | CONC-001 | Atomic local ID allocation and collision-safe append | Repository, event factory, UI commands/tests | L |
| 12 | LOGIC-002 | Wire observed HLC into the atomic allocator after CONC-001 | Events/repository/core clock tests | L |
| 13 | CONC-002 | Transactional metadata merges across every writer | `src/db/repo.ts`, interleaving tests | M |
| 14 | CONC-003 | Insert-or-return claim identity after asynchronous mint | Repository, claim concurrency tests | M |
| 15 | LOGIC-003 | Preserve schema version on rate-bearing edits | Trip edit command, rendered/workflow tests | S |
| 16 | REL-001 | Byte-bounded Redis pages with resumable next cursor | API, HTTP/sync integration tests | M |
| 17 | FE-005 | Suppress authoritative success claims while frozen | Trip lifecycle/protection/export views/tests | M |
| 18 | INTR-001 | Atomic buffered-event promotion | Repository and both sync paths, interruption tests | L |
| 19 | INTR-002 | Durable resumable cohort journal | Retention tool and maintenance tests; original manifests retained | M |
| 20 | INTR-003 | Atomic encrypted artifact publication | Export tool and maintenance tests | M |
| 21 | STRUCT-001 | Extract panels only after repaired behavior is characterized | `src/Trip.svelte`, five proposed `src/trip/` panels, UI tests | L |
| 22 | PERF-001 | Bound retained future-event accounting | Transport/repository tests | M |
| 23 | PERF-002 | Reuse immutable signature results and narrow candidate keys | Verification/core authority boundary, verification tests | M |
| 24 | PERF-003 | Persist only group metadata fields | Repository, storage-shape tests | M |
| 25 | LOGIC-004 | Use base-unit totals for split transitions | Trip split command, preservation tests | S |
| 26 | LOGIC-005 | Stable actual event ID through preview and commit | Trip draft/event allocation, rounding tests | M |
| 27 | LOGIC-006 | Drain archived outboxes with bounded confirmation work | Trip/sync lifecycle tests | M |
| 28 | REL-002 | Apply per-relay retry/drop policy | Sync/diagnostics/settings tests | M |
| 29 | REL-003 | Replace invalid batch experiment with production-shape measurement, preserving old evidence | Retention probe and appended report annotation | M |
| 30 | REL-004 | Enforce vet exit semantics | Retention CLI, maintenance tests | S |
| 31 | REL-007 | Preserve working offline shell on HTTP failure | `public/sw.js`, service-worker tests | S |
| 32 | FE-001 | Persistent manual exchange controls | Trip/panel UI and interaction tests | S |
| 33 | FE-002 | UTF-8-safe compatible join links | Join helper and sharing tests | S |
| 34 | FE-003 | Dialog focus/keyboard lifecycle | Trip/dialog panels and keyboard tests | M |
| 35 | FE-004 | Persistent protection/reconciliation summary | Trip/status panel and visibility tests | S |
| 36 | DRIFT-001 | Align technical examples with verified interfaces | `TDD.md`, relevant active docs | M |
| 37 | DRIFT-002 | Reconcile quorum policy and exceptions | `PRD.md`, `STATUS.md` | M |
| 38 | DRIFT-005 | Mark fork/re-key unimplemented; implementation requires a separate approved feature request | `PRD.md` | S |
| 39 | SEC-003 | Bound public enrollment and storage admission while preserving existing history | `api/relay.ts`, backed-up limit configuration, admission tests | L |
| 40 | SEC-004 | Upgrade affected packages after reachability/compatibility review | Manifest/lockfiles with named backups | M |
| 41 | REL-005 | Restore an operational dependency-review gate | Repository capability or backed-up dependency workflow | M |
| 42 | REL-006 | Preserve reports while propagating scanner execution failures | Backed-up Semgrep/Bandit workflows | M |
| 43 | REL-008 | Version the verified schema transition path without destructive rollback | Desired schema retained; generated migrations/operational instructions | L |
| 44 | DRIFT-003 | Update source-retention description and scope limits | `README.md` | S |
| 45 | DRIFT-004 | Correct bot merge and scanning security statements | `SECURITY.md`, `CONTRIBUTING.md` | S |
| 46 | DRIFT-006 | Correct Keep/Revert completion claim | `PRD.md` | S |
| 47 | FS-001 | Repair damaged documentation characters, combined with DRIFT-004 if selected | `SECURITY.md` | S |
| 48 | FS-002 | Append corrected retention-table framing without changing observations | Retention tool and existing report | M |
| 49 | DEAD-001 | Remove inert rename predicate after behavioral coverage is preserved | `core/src/fold.ts`, relevant fold tests | S |

Selection dependencies:

- DATA-001 and DATA-002 share the full-import boundary and need a coordinated preservation design even if only one ID is initially selected.
- CONC-001 and LOGIC-002 share event allocation; LOGIC-005 uses that resulting stable ID.
- DATA-003 precedes reliable collision/admission checks; DATA-007 must not reuse transport progress as semantic coverage.
- INTR-001 and CONC-002 require transactional boundaries to be specified before UI extraction.
- STRUCT-001 is optional reorganization and is not a prerequisite for the P1 repairs.
- SEC-004 needs package-version compatibility and actual reachability review; an advisory match alone is not permission to claim production exploitation.
- REL-008 cannot be executed against hosted state until read-only baseline access, exact schema comparison, backup and capacity review succeed.

Minimum regression contracts for high-risk selections:

- Apply every suggested transfer as a SettlementRecorded event and assert each original balance becomes zero.
- Two tabs issue different commands from the same initial counter; both immutable event bodies survive with distinct IDs.
- Import an older export into a group with newer events; all newer events, original keys and identity rows remain recoverable.
- Reopen an imported linked group with the original verified seed; decryption/proof/tag continuity holds.
- Malformed event variants and invalid keypairs produce zero persistent writes.
- Reverse delivery order for conflicting same-ID payloads; both replicas report conflict without silently diverging.
- Kill promotion at every transaction boundary; each buffered event exists either buffered or admitted after reopening.
- Simulate a legal oversized stream page; client advances through bounded pages without omissions or permanent replay.
- Forge only the unsigned device attribution of a settlement; it remains unconfirmed without payee signature.
- Introduce an unsupported event with zero live-subset balances; no settled-success assertion or authoritative outstanding summary appears.

Not verified in this pass: production SQL schema/data/ACL parity, browser write-path reproduction, actual exploit execution, queue/cache metrics, empirical performance, full historical secret scanning, every test assertion or every individual STATUS requirement's runtime acceptance. These limitations are not converted into passing results.

## 13. Selection Prompt

Audit complete within the recorded STATIC/LIVE evidence boundaries. 49 findings. Which do you want fixed?

- `fix all`
- `fix P0` / `fix P0,P1`
- `fix SEC-001, DATA-004, DEAD-001`
- `fix all except STRUCT-*`
- `none` — report only

Selection does not execute changes in this stage. After selection: **Selected: <IDs>. Run 02_EXECUTE with AUDIT.md and this selection.**
