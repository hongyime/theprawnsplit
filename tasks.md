# Atomic Execution Tasks — Cycle 1

## Resume and approval gate

- **State: execution explicitly approved. 8/73 tasks complete; next T10. REL-005, REL-006 and REL-007 fixed locally; NEW-001 fixed (`8c834a9b8e18a93d48193f1d723d0422e6759a10`), T05 no longer blocked. All four policy gates B1–B4 resolved by owner decision (see bugfix.md SEC-002/SEC-003/DATA-006/REL-008); T24/T25/T26/T32/T33/T46/T47 unblocked and will execute in normal queue order.**
- Selection: all 49 findings in `AUDIT.md`; baseline `e63962f47dc4b38378bed33eadd57b134458411d`; existing branch retained.
- Order: independent P2 → P1 prerequisites/repairs → dependent P2 and structure → P3. This is the dependency-safe interpretation of the requested P2 → P1 → P3 sequence.
- Known gates B1–B4 are now resolved (owner decisions recorded in bugfix.md and execute_state.json verification.policy_gates_resolution); their previously-blocked tasks proceed in normal queue order like any other task.
- Each implementation task includes fresh pre-scan, test-first proof, the stated minimum patch, parse/type/import checks, cold logic review, relevant tests and isolated real-surface verification. These steps are not optional subprojects.
- Prose-only tasks use source/reference/table checks. Extraction/cleanup tasks characterize existing behavior before changing it.
- One logical verified fix increment per commit; no empty investigation commits. A finding spanning tasks stays In Progress until all its acceptance tasks pass.
- After every completed task emit the required STATE line, update this file and bugfix.md, and checkpoint after every third completion. Blocked/Invalid tasks get a recorded disposition, not a false completion checkmark.
- Rollback shorthand **R**: restore only this task's uncommitted patch from `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/cycle-1/tasks/Tnn/<relative-path>`; preserve later/unrelated edits and all data. For a committed change, use a new focused reverting commit if compatible, never reset/rebase. Never delete a newly created file or artifact without confirmation.
- All proposed new paths below are future outputs. No environment file, production data store, provider setting, live relay or existing browser profile is modified.

## Entry gates

- [x] T01 — Confirm approval and current source baseline
  Finding: ALL (execution gate only).
  Files: `bugfix.md`, `design.md`, `tasks.md`, `execute_state.json`; selected source paths read-only.
  Change: Record explicit plan approval, branch/HEAD, existing work and each known policy gate; repeat selected-target pre-scan as tasks begin.
  Acceptance: Approval is explicit; no unexplained source drift from the audit; changed targets stop for user confirmation.
  Rollback: No source changes; preserve all approval/baseline evidence.
  Depends on: Explicit user plan approval.
  Result: User APPROVE recorded; HEAD remains e63962f47dc4b38378bed33eadd57b134458411d; tracked source has no differences outside the preserved shared-state files; Node 26.5.0/npm 12.0.2 detected.

- [x] T02 — Verify non-environment pre-change backups
  Finding: ALL (preservation gate only).
  Files: Approved selected paths; ignored baseline/pre-task backup roots; `execute_state.json`.
  Change: Snapshot actual pre-change bytes without clobbering existing copies; verify readback hashes and ignore rules; repeat immediate snapshots before each later edit.
  Acceptance: Every modified protected file has a named verified before-image; no environment value, session or live data is copied into public artifacts; backup paths are ignored.
  Rollback: Preserve snapshots; never remove originals or backup evidence.
  Depends on: T01.
  Result: 262 files copied without clobbering and verified against source SHA-256; .env.example excluded. Git confirms the backup root is ignored. Manifest: `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/cycle-1/baseline-manifest.json`.

- [x] T03 — Record the unmodified verification baseline
  Finding: ALL (verification baseline only).
  Files: Existing test/config/package files read-only; execution ledger/evidence.
  Change: Run the declared baseline checks in isolation after reviewing their effects; record exact commands/results and stop aggregate checks at the first unexpected failure.
  Acceptance: Results are recorded without invented totals; pre-existing unrelated failures are Reported/Blocked, not fixed or hidden; no production requests or tracked icon regeneration.
  Rollback: No source changes; stop owned test resources and retain failure evidence.
  Depends on: T02.
  Result: `npm run build` on unchanged source passed 81 core tests, then reported application setup/test failures and exceeded the 600000 ms command limit. No later aggregate commands ran. Log: `.audit-backups/e63962f47dc4b38378bed33eadd57b134458411d/cycle-1/T03-build.log`. NEW-001 reported; scoped process inspection found no remaining owned Vitest workers. This completes evidence capture, not the aggregate verification gate.

## Wave A — Independent P2 work

- [x] T04 — Verify the dependency advisory finding
  Finding: SEC-004.
  Files: `package.json`, `package-lock.json`, `core/package.json`, `core/package-lock.json`; import sites read-only; `bugfix.md`.
  Change: Re-derive resolved versions, advisory ranges, parent ranges and actual runtime/tooling exposure; classify the POTENTIAL finding.
  Acceptance: Evidence establishes a real affected-version issue or an Invalid finding; no production-exploit claim without an input path.
  Rollback: No dependency changes; retain verification sources/results.
  Depends on: T03.
  Result: Installed and locked sharp 0.33.5 and devalue 5.9.1 match fresh advisory ranges; svelte 5.56.10 permits devalue ^5.8.1. Candidate sharp 0.35.4 uses supported ESM/default APIs, Node >=20.9.0 and Windows x64 prebuilds. Affected-version issue confirmed; no production exploitability claim.

- [ ] T05 — Update only confirmed affected dependency chains
  Finding: SEC-004.
  Files: Selected manifest/lockfiles; targeted maintenance/build fixtures.
  Change: If T04 confirms the issue, use compatible verified fixed versions, checking native loading and licenses; otherwise record task not applicable to Invalid finding.
  Acceptance: Selected advisory matches are removed from changed chains; synthetic icon generation and relevant checks pass; no unrelated package or asset changes.
  Rollback: R for the paired manifest/lock changes; preserve installed-state/evidence notes rather than mass-deleting dependencies.
  Depends on: T04 confirmed outcome.
  Disposition: Blocked before modification because NEW-001 prevents the required complete compatibility suite for the breaking pre-1.0 sharp upgrade. No manifest, lockfile or installed dependency changed; retain the verified candidate and proceed with independent tasks.

- [x] T06 — Recheck dependency-review availability
  Finding: REL-005.
  Files: `.github/workflows/dependency-review.yml` read-only; `bugfix.md`.
  Change: Inspect current read-only capability/error evidence and confirm whether the native review path works or still needs a source-level fallback.
  Acceptance: Current cause is established; changed/refuted audit evidence stops for review; no repository capability is enabled automatically.
  Rollback: No source or hosted configuration changes.
  Depends on: T03; T04 outcome informs advisory interpretation.
  Result: Latest three Dependency Review runs remain failed, including 35266608032; a fresh read-only SBOM request returned HTTP 404. The workflow is unchanged. Implement a capability-selected fallback, retaining native review on supported repositories and failing closed on authentication/transport errors.

- [x] T07 — Provide the supported dependency gate path
  Finding: REL-005.
  Files: `.github/workflows/dependency-review.yml`; proposed `scripts/check-dependency-advisories.mjs`, `test/maintenance/dependency-advisories.test.mjs` only if required.
  Change: Retain native review where supported; otherwise add a read-only lockfile advisory fallback with explicit severity/error handling.
  Acceptance: Local fixtures exercise supported/unsupported capability, findings and network/tool failure; scanner failure never passes; hosted verification is explicitly unverified until separately approved.
  Rollback: R for workflow and checker together; no disabling branch requirements or admin bypass.
  Depends on: T06; T05 or the recorded disposition of SEC-004.
  Result: Commit `e49d2924f5837150b1cf63997c0c5f844ab219d0`. Capability-selected native/fallback review implemented with changed name/version comparison, bounded queries and fail-closed errors. Meaningful RED: unsupported SBOM fixture raised capability_unavailable before fallback. GREEN: 25/25 operator tests, node syntax, strict checkJs and YAML parse pass. Direct CLI empty-delta and read-only live capability checks exit 0. Hosted workflow not run; LSP/independent agent review unavailable. No owned test process remains.

- [x] T08 — Preserve scanner reports and propagate execution failures
  Finding: REL-006.
  Files: `.github/workflows/semgrep.yml`, `.github/workflows/bandit.yml`, `test/maintenance/scanner-exit.test.mjs`; dependency-review workflow test registration only.
  Change: Verify each tool's actual exit contract, remove blanket success masking and retain failure-path report upload without silently changing findings policy.
  Acceptance: Success/findings/execution-error fixtures have the declared distinct results and report upload remains attempted.
  Rollback: R for backed-up workflows and any supporting test code.
  Depends on: T03; verified tool documentation.
  Result: Commit `2ca2e2bf481387f197e7847980daf8571bd08f27`. Removed Semgrep --error and both blanket success fallbacks; Bandit uses native --exit-zero. Four error-masking RED assertions reproduced; a separate fixture startup timeout is retained, not counted as defect proof. Targeted 10/10 and combined security contracts 24/24 pass; YAML/Node syntax valid; report-upload conditions preserved; no owned fixture process remains. No vendor scanner or hosted run was executed.

- [x] T09 — Preserve cached shell on unsuccessful HTTP responses
  Finding: REL-007.
  Files: `public/sw.js`, `test/service-worker.test.ts`.
  Change: Cache successful eligible responses only and fall back to the retained shell after navigation HTTP failure.
  Acceptance: A 503 then offline navigation returns the prior successful shell; successful updates, API exclusion and cross-origin exclusion still pass.
  Rollback: R for worker/test patch; never clear a user cache/profile.
  Depends on: T03.
  Result: Commit `7469abad202b4b24fd420182fa79b155acff026d`. Shell handler now falls back to the cached shell (or the raw error if none exists) on any unsuccessful navigation response instead of caching it; hashed-asset handler no longer serves or writes unsuccessful cached entries and refetches to recover a previously poisoned entry. Five regression cases added; RED reproduced the defect in both the fake-DOM unit harness (4 failing) and a real Chromium (channel `chrome`) context against an owned loopback server (503 replaced the working shell, served again offline). GREEN: unit 13/13; browser re-run 200/WORKING-SHELL for the failed navigation, the cache read, and the offline reload, with API request count still advancing (1,2) proving no over-caching. Screenshot and JSON evidence under `.audit-backups/.../cycle-1/T09-*`; owned browser context and loopback server both closed, no leftover Chrome/node process found by scoped Win32_Process inspection.

- [x] T10 — Round-trip Unicode and legacy join tokens
  Finding: FE-002.
  Files: `src/lib/join-link.ts`, `src/Trip.svelte` only for the relevant error boundary, `test/join-link.test.ts`, sharing UI tests.
  Change: Encode UTF-8 before base64url and add a validated legacy decode path; contain copy/QR encoding errors.
  Acceptance: ASCII, legacy accented names, CJK and emoji round-trip; malformed inputs fail visibly; raw secret never enters query/request path.
  Rollback: R for encoder/decoder/caller together; retain support for tokens already emitted by the changed encoder.
  Depends on: T03.
  Result: Commit `1fedb1a3a037289347ae38d8bce8f0fbdaef7994`. encodeJoinSeed now UTF-8-encodes bytes before base64url (TextEncoder), never throws for CJK/emoji. decodeJoinSeed tries UTF-8 first, falls back to raw Latin1 bytes for pre-fix tokens (old encoder called btoa directly on the JSON string, so accented-name tokens stored each UTF-16 code unit as one Latin1 byte); also validates decoded shape (secretB64/tagHex required) and throws a clear Error instead of returning a wrong-shaped object. Trip.svelte's copyJoinLink now contains the encode call in its own try/catch (previously outside any try block — an unhandled rejection for any throwing name), matching the existing showJoinQrCode pattern. RED reproduced both the throw-on-Unicode defect and the missing shape validation; GREEN 4/4 in test/join-link.test.ts including a dedicated legacy-Latin1-fallback case. svelte-check: 0 errors, 0 warnings project-wide. App.svelte's existing decode try/catch already surfaced malformed tokens visibly ("Join Link Is Malformed.") — no change needed there.

- [x] T11 — Conserve base-unit percentage transitions
  Finding: LOGIC-004.
  Files: `src/Trip.svelte`, `src/lib/split-preservation.ts`, relevant split/multicurrency tests.
  Change: Use validated base-minor total and deterministic allocation of exactly 10,000 percentage basis points.
  Acceptance: Foreign conversion and three equal one-cent shares transition to exactly 100%; selected participants and supported mode mappings stay intact.
  Rollback: R for helper and caller together; no stored financial data changes.
  Depends on: T03.
  Result: Commit `c5173dde41b77f9b9564bc59452bfef851e1fea6`. Two root causes fixed: changeSplitMode now sources `total` from `amountPreview.baseMinor` (same already-tested conversion buildSharePreview uses) instead of re-parsing raw foreign-currency text; new `allocatePercentageBasisPoints` (money.ts, largest-remainder method) replaces independent per-share formatting in split-preservation.ts so allocated basis points always sum to exactly 10,000. 12/12 unit tests pass; svelte-check 0 errors/0 warnings.

- [x] T12 — Expose permanent safe manual exchange actions
  Finding: FE-001.
  Files: `src/Trip.svelte`, `test/manual-fallback-ui.test.ts`, export UI tests.
  Change: Make ledger export and delta sharing reachable outside transient prompt branches; retain private backup separation.
  Acceptance: Healthy/offline/archived/frozen synthetic trips expose the permitted manual actions without triggering automatic export prompts.
  Rollback: R for the selected view/actions only.
  Depends on: T03.
  Result: Commit `49a8b2d309269cff2e254189c1dfea1388eb194e`. Added permanent Export + Share Delta buttons to the always-visible sync-strip toolbar (gated only by `!needsSetup`, i.e. present whenever the trip has participants — healthy/offline/archived/frozen all qualify), beside the existing Identity Backup/Relays buttons; calls use the existing no-reason downloadExport()/shareDelta so no automatic-prompt state changes. Transient banners (manualFallbackDue, activeExportPrompt, empty-state) left as-is. RED→GREEN via source-shape regex test in export-prompt-ui.test.ts; real-rendered eviction test unaffected; svelte-check 0/0.

- [x] T13 — Keep required status visible with details closed
  Finding: FE-004.
  Files: `src/Trip.svelte`, protection/reconciliation/duplicate-banner UI tests.
  Change: Move the required summaries outside the optional details disclosure and preserve detailed control ownership.
  Acceptance: Required summaries are actually visible while details is closed; trip switching and narrow/wide layouts remain usable.
  Rollback: R for markup and associated tests only.
  Depends on: T03.
  Result: Commit `6f31ad643b1c081c98c28e537979f8939f7c7887`. `.sync-strip` (status) and `.reconcile-panel` (duplicate/merge hints) moved out of the collapsed `<details class="advanced-panel">` to render unconditionally (still gated only by `!needsSetup`); Identity Backup/Export/Share Delta/Relays controls plus relay-settings/diagnostics panels stay inside the disclosure. Added `closest(".advanced-panel")===null` structural assertions to 3 UI test files so the regression is actually caught (plain DOM queries don't respect a closed `<details>` here, which is how the bug went unnoticed). 4/4 UI tests pass; svelte-check 0/0.

- [x] T14 — Implement an owned dialog keyboard lifecycle
  Finding: FE-003.
  Files: Proposed `src/lib/dialog.ts`, `test/dialog-ui.test.ts`.
  Change: Implement initial focus, tab containment, Escape, restore-focus and teardown for the existing modal contract without a new dependency.
  Acceptance: Isolated real-DOM/browser cases prove focus containment and cleanup, including replaced/disposed dialog instances.
  Rollback: R; preserve a created file until deletion is explicitly approved.
  Depends on: T03.
  Result: Commit `4672fbdbc55f314e5ebd7f716b70885ed9bc8fff`. New `src/lib/dialog.ts` (`activateDialogLifecycle`) with no new dependency; initial focus, Tab/Shift+Tab containment (with re-capture if focus escapes the dialog), Escape callback, and idempotent teardown restoring the opener (safe even if the opener was removed from the DOM). 10/10 isolated jsdom tests pass, including replaced-dialog and no-focusable-children cases. svelte-check 0/0. FE-003 stays Open in bugfix.md pending T15's Trip.svelte integration.

- [x] T15 — Wire all existing dialogs to that lifecycle
  Finding: FE-003.
  Files: `src/Trip.svelte`, `test/dialog-ui.test.ts`, claim/install/QR UI tests.
  Change: Integrate the lifecycle into each existing dialog and its dismissal/unmount paths.
  Acceptance: Actual keyboard interaction across all three dialog kinds restores the opener and leaves no listener or background-focus leak.
  Rollback: R for integrations together with the helper if required; no user profile reset.
  Depends on: T14.
  Result: Commit `4a4fd4bdd0dfee8d09530f122c927f818b148255`. Wired `use:dialogLifecycle` onto all 3 real dialogs (Claim Participant, Protect This Trip install prompt, Join QR Code) with their existing close handlers as onEscape. Added a real App-mounted integration test that opens the Claim dialog, confirms focus moved inside it, presses Escape, and confirms focus returns to the actual trigger button — caught and fixed a jsdom fireEvent.click() focus-simulation gap in the test itself. 11/11 dialog-ui.test.ts pass; svelte-check 0/0. FE-003 now Fixed in bugfix.md.

- [x] T16 — Stop persisting hydrated group copies
  Finding: PERF-003.
  Files: `src/db/repo.ts`, proposed `test/group-storage-shape.test.ts`, repository tests.
  Change: Separate hydrated-only fields at saveGroup while retaining legitimate persistent metadata and authoritative stores.
  Acceptance: Group writes contain no nested event/identity/meta copies; unrelated durable fields and every authoritative row survive.
  Rollback: R for writer/test source; no database cleanup or old snapshot restore.
  Depends on: T03.
  Result: Commit `98a2c68a90f10bd1e4bbafce039b2a8824450422`. RED opened the raw IndexedDB "groups" row directly (bypassing readGroup's hydration) and confirmed the full event array was duplicated into it after saveGroup received a spread hydrated GroupRecord, exactly matching what Trip.svelte's commit()/renameGroup/setCurrency already do on every write. GREEN: saveGroup now always constructs a literal 8-field StoredGroup object before writing. 1/1 new + 5/5 multi-trip-repository tests pass; full rendered common-expense-ui.test.ts regression (real commit→saveGroup path) passes; svelte-check 0/0.

- [x] T17 — Publish a complete encrypted artifact without clobbering
  Finding: INTR-003.
  Files: `scripts/relay-migration.mjs`, proposed `scripts/atomic-artifact.mjs`, export maintenance tests.
  Change: Verify the filesystem primitive, stage/flush output and publish atomically without replacing existing destinations; retain failed artifacts.
  Acceptance: Fault/short-write/existing-destination cases cannot report a complete final file; successful bytes decrypt and match; supported-platform semantics are demonstrated.
  Rollback: R for source only; preserve all output/partial files.
  Depends on: T03.
  Result: Commit `04811f15c010e69e992361d2616d8af9b9a45fcf`. New scripts/atomic-artifact.mjs: stage to a fresh random-suffixed path, flush (open+writeFile+sync+close), then publish via link() (atomic + EEXIST on existing destination, unlike rename()); verifyAtomicPublishSupported() proves the no-clobber guarantee on the target directory before relying on it. Wired into relay-migration.mjs replacing the direct-to-final-name writeFile(...,{flag:'wx'}). 6 new tests (capability check, exact-byte publish + staging cleanup, existing-destination byte-for-byte protection, retained staging copy on rejection, no final-path creation on staging-write fault, concurrent-writer race resolves to exactly one winner) plus all 11 pre-existing relay-migration tests: 17/17 pass.

- [x] T18 — Journal the fixed cohort before publishing
  Finding: INTR-002.
  Files: `scripts/task0-retention.mjs`, `scripts/atomic-artifact.mjs`, proposed `test/maintenance/retention-journal.test.mjs`.
  Change: Durably store the complete pre-signed public stimulus and cohort identity before any network send; checkpoint publication results atomically.
  Acceptance: Forced interruption cannot leave a published stimulus without its recorded identity; no private key is persisted; existing cohorts remain byte-identical.
  Rollback: R for source, retaining journals and existing manifests.
  Depends on: T17.
  Result: Commit `a9d03d406c286e3e39f57a01fc8df67501299c63`. Extracted `runJournaledCohort()`: pre-signs all events upfront (fixing tag/pubkey/ids before any network I/O), journals the public wire objects via new `checkpointArtifactAtomically()` (atomic REPLACE, unlike INTR-003's no-clobber CREATE) before the first publish attempt, checkpoints after every attempt, never persists the private key. Refuses to start a fresh cohort while an interrupted run's journal exists. Wired into publish/publish-slow/publish-current; each still writes its final manifest via publishArtifactAtomically then deletes its journal. Added an import.meta.url main-module guard (matching relay-migration.mjs) since importing for tests was triggering the CLI dispatch's process.exit(1). 22/22 tests pass; manifest JSON shape unchanged. INTR-002 stays Open in bugfix.md — actual resume-on-restart logic is T19.

- [x] T19 — Resume the same cohort and publication receipts
  Finding: INTR-002.
  Files: `scripts/task0-retention.mjs`, retention-journal tests.
  Change: Add explicit resume semantics over the persisted cohort, checking schema/identity and replaying the same signed event IDs.
  Acceptance: Before/after-send failures resume without a new cohort or private key; incompatible/completed legacy manifests are preserved and never implicitly reset.
  Rollback: R for resume source only; retain all cohort evidence.
  Depends on: T18.
  Result: Commit `88bc31f82a76a3fdf69aa64f7b05b6b7054da9a3`. runJournaledCohort() now detects an existing journal, validates its schema/identity (kind/relays/eventCount/payloadBytes/event-array-length/ackedThrough bounds/acks shape) before trusting it, and resumes from ackedThrough+1 using the stored pre-signed events — no new key, no new tag. Mismatched/malformed journals are rejected, not guessed at. The existing MANIFEST-exists refuse-to-restart guard is untouched, so completed cohorts are never implicitly reset. 23/23 tests pass. INTR-002 is now Fixed in bugfix.md.

- [x] T20 — Capture a production-shaped batch probe
  Finding: REL-003.
  Files: `scripts/task0-retention.mjs`, proposed `test/maintenance/retention-wire.test.mjs`.
  Change: Emit one signed event containing an encrypted ledger batch and correlate ACK/readback to that ID; label the changed stimulus.
  Acceptance: Local wire capture contains the correct single-event frame and decryptable batch; old measurements are neither rewritten nor claimed to validate the new stimulus.
  Rollback: R for probe/test source; preserve any explanatory evidence.
  Depends on: T19.
  Result: Commit `0165ea07f12ff864b040c81f69d7e6eb3a61c14f`. New encryptEventBatch/decryptEventBatch (matches src/crypto/envelope.ts's AES-GCM scheme exactly) + buildProductionBatchEvent (one signed event, content=encrypted batch, matching src/relay/nostr.ts). batch50() now sends exactly one valid ["EVENT", event] message instead of the old invalid multi-event array. Report section relabeled and left additive, not rewritten. 10/10 new + 41 pre-existing maintenance tests = 51/51 pass; no real relay connection opened by any test.

- [x] T21 — Enforce vet process exit codes
  Finding: REL-004.
  Files: `scripts/task0-retention.mjs`, proposed `test/maintenance/retention-cli.test.mjs`.
  Change: PASS=0, FAIL=1, WARN=2 with consistent connection/zero-acceptance classification.
  Acceptance: Native child-process fixtures observe literal status codes and expected diagnostics; no real relay is contacted.
  Rollback: R for verdict/dispatch changes only.
  Depends on: T20.
  Result: Commit `44bf6ab`. `vet()` now returns the verdict string instead of exiting internally (or falling through with an implicit exit 0); new `exitCodeForVerdict()` maps PASS=0, WARN=2, FAIL/anything else=1; CLI dispatch sets `process.exitCode` from that mapping. Verified via unit tests driving `vet()` with a scripted fake WebSocket for PASS/WARN/policy-blocked-FAIL (no real relay contacted) plus one native child-process spawn against a closed local port proving the real process exits 1 end-to-end. 32/32 maintenance tests pass (5 new).

- [x] T22 — Correct the fork/re-key completion claim
  Finding: DRIFT-005.
  Files: `PRD.md`.
  Change: Identify the workflow as unimplemented while preserving its proposed design/history.
  Acceptance: Active documentation no longer presents an existing one-action workflow; no code or data changes.
  Rollback: R for the focused prose patch.
  Depends on: T03.
  Result: Commit `011817a`. §10.2 reworded from present-tense ("Participants re-join... shadow participants carry over automatically") to explicitly proposed-design/not-yet-implemented, stating plainly no fork/re-key action exists in the app today. Confirmed via grep across src/ and core/src/ for fork/rekey/rotate terms: zero matches. Left the Q2 decision-log rows in §14.1 and the question-resolutions appendix unchanged — those record that the design question was resolved, not that the feature shipped. PRD.md only; no code or data changed.

- [x] T23 — Resolve approved relay budget policy
  Finding: SEC-003.
  Files: `bugfix.md`, `design.md`; capacity/source interfaces read-only.
  Change: Record B1 budget values, reservation/failure semantics and export metadata treatment if supplied; otherwise record Blocked.
  Acceptance: Explicit policy/evidence exists and does not imply an environment or live provider change; absence blocks T24.
  Rollback: No source/data changes; preserve the decision record.
  Depends on: B1 and T03.
  Result: No git commit (bugfix.md/design.md are untracked pipeline artifacts, per Rollback note). Values + export metadata were already recorded from the earlier B1 owner decision; asked the user the one remaining open piece (failure/response semantics on budget exhaustion) and got: HTTP 429 + Retry-After, rejection claims no proof/cursor and mutates no history. Recorded the full resolution in bugfix.md SEC-003 and design.md's B1 section (marked RESOLVED). No .env, live provider, or source/data change. T24 unblocked.

- [x] T24 — Enforce atomic relay resource admission and export compatibility
  Finding: SEC-003.
  Files: `api/relay.ts`, proposed `server/relay-admission.ts`, `scripts/relay-migration.mjs`, admission/API/export tests.
  Change: Implement the approved request/enrollment/shared-budget checks with compatible preservation of any new control metadata.
  Acceptance: Parallel fixture requests cannot exceed approved budgets; rejection consumes no proof/cursor/history; source export recognizes and preserves the approved metadata contract.
  Rollback: R for handler, admission and exporter source as one logical contract; no live activation or source-data deletion.
  Depends on: T23 and T17.
  Result: Commit `2caa4a9`. New server/relay-admission.ts: reserveAdmission() enforces B1's 4 budgets against a single atomic reserveSetSlot primitive for enrollment/group caps (Lua EVAL for the real Upstash store — a naive SADD-then-SCARD round trip was proven by a concurrency unit test to let every racer's SADD land before any SCARD check, admitting 0 instead of the correct cap) plus plain race-free INCRBY for rate/storage. Wired into api/relay.ts's Upstash POST path only (before verifyRelayWriteProof, so rejection never touches the proof key); Supabase path unaffected (separate SQL-side capacity system, out of scope). scripts/relay-migration.mjs's exportSnapshot() now filters `ad:`-prefixed admission keys out of both the initial SCAN and the stability re-scan, so they're recognized/skipped (never exported, never cause a false unstable reading). 15 new admission unit tests + 2 new checkAdmission tests + 1 new export-compatibility test, all pre-existing tests in touched files still pass. tsc clean, svelte-check 0/0. Full `npx vitest run`: 366/366 pass (see NEW-002 for the 2 unrelated pre-existing failures found and fixed separately during this task's regression sweep). Oracle architecture review was attempted but failed (model-routing/PAT config issue in this environment, 5 retries, final cancellation); proceeded on independently-reasoned design, documented in the commit message and this note.

- [x] T25 — Establish the verified SQL migration baseline
  Finding: REL-008.
  Files: `bugfix.md`, `design.md`; owner-provided/read-only schema evidence.
  Change: Verify B4 catalog/ACL/function/control capture, its provenance and named encrypted backup; choose the existing declarative migration workflow.
  Acceptance: Exact baseline is known without live mutation; no guessed schema or fabricated empty destination; absence blocks T26.
  Rollback: No database/source changes; preserve evidence.
  Depends on: B4 and T03.
  Result: No git commit (bugfix.md/design.md untracked pipeline artifacts). Full desired schema read from `supabase/schemas/relay.sql`: 3 tables, 5 functions, RLS+ACL pattern, 1 index — catalogued in bugfix.md's REL-008 entry. Table existence in the hosted project was independently verified earlier this session via Management API; function/ACL parity relies on corroborating evidence (app code calls these exact RPC names/signatures) rather than a second live credential check, to avoid re-exposing another PAT. Confirmed `supabase/migrations/` doesn't exist at all (directly matches REL-008's root cause). Declarative workflow chosen: Supabase `db diff` against a local shadow DB; since no migration history exists, T26 must generate an initial baseline migration first. Disposition: Unblocked — T26 may proceed.

- [x] T26 — Generate and validate migration files only
  Finding: REL-008.
  Files: Exact generated `supabase/migrations/` files, SQL fixture tests, user-applied forward-compensation instructions; original desired schema preserved.
  Change: Generate reviewed deltas from verified baseline, add preconditions and isolated preservation tests, and record exact filenames.
  Acceptance: Isolated baseline upgrade preserves records/proofs/cursors/ACLs/disabled controls; forward compensation is non-destructive; no live SQL is executed.
  Rollback: Preserve all migration files; use a reviewed forward-compensation file, never delete an applied/unapplied migration.
  Depends on: T25.
  Result: Commit `e24a20b`. Generated `supabase/migrations/20260922130000_baseline_relay_schema.sql` — idempotent semantic copy of relay.sql (IF NOT EXISTS/OR REPLACE/ON CONFLICT DO NOTHING guards), safe against both an empty DB and the already-live hosted one. 5 isolated PGlite tests (no live SQL): applies cleanly, behaves identically, enforces RLS/ACL, is idempotent against existing live data (proven non-destructive), semantically complete vs. relay.sql. User-applied forward-compensation instructions (the `supabase migration repair` command to register this file in the hosted migration history without re-running it) recorded in bugfix.md's REL-008 entry rather than a new standalone doc file, and deliberately not executed/requested from the owner this task to avoid a third live-credential exposure this session. tsc/svelte-check clean; 24/24 tests pass.

## Wave B — P1 dependency chains and repairs

- [x] T27 — Parse event frames and known variants before writes
  Finding: DATA-003.
  Files: Proposed `core/src/event-validation.ts`, `core/src/index.ts` as required, `src/db/repo.ts`, event/import/transport tests.
  Change: Validate common fields, known payload variants, money/reference constraints and future-version preservation before storage.
  Acceptance: Malformed known variants cause zero active-store writes; valid fixtures remain compatible; opaque future events round-trip and freeze projection without being rewritten.
  Rollback: R for parser and all consumers together; retain rejected/original input evidence.
  Depends on: T03.
  Result: Commit `67d6c9a`. New core/src/event-validation.ts: hand-written runtime parser for all 20 Event variants (money fields real bigints, HLC wall/ctr finite+non-negative, alg constrained, reference fields non-empty strings); future-version events preserved verbatim under quarantine, unrecognized `t` at a supported version is invalid not quarantined. src/db/repo.ts's assertImportEvents delegates to it, preserving its existing all-or-nothing throw contract/message. Also added src/lib/identity-backup-validation.ts (validateIdentityKeypair, reusing src/crypto/claim.ts's existing sign/verify primitives) wired into restoreIdentityBackup: async validation before the IDB transaction opens, recheck-on-conflict inside it. 24 new core tests + 6 new identity-keypair tests + 3 new export-security tests (fixture updated to a real generated keypair). tsc/svelte-check clean; core 105/105, app 380/380.

- [x] T28 — Validate identity backups before transactional restore
  Finding: DATA-003.
  Files: Proposed `src/lib/identity-backup-validation.ts`, `src/db/repo.ts`, identity/export tests.
  Change: Check algorithm, public encoding, JWK compatibility and private/public consistency before opening the write transaction; recheck current target inside it.
  Acceptance: Wrong group/keypair/algorithm or a conflicting working identity cannot be overwritten; valid backup round-trip restores usable signing authority.
  Rollback: R for validation/restore source; preserve original identity and backups.
  Depends on: T27.
  Result: No new commit — fully satisfied by T27 (`67d6c9a`), which is the SAME DATA-003 finding (bugfix.md has only one DATA-003 entry, not a separate DATA-003b). T27's src/lib/identity-backup-validation.ts already checks algorithm (JWK import under the declared alg), public encoding (derived-public-key-string vs claimPk match), JWK compatibility (import succeeds), and private/public consistency (sign/verify round trip) — exactly this task's 4-item Change list — and restoreIdentityBackup already validates asynchronously before opening the transaction, then rechecks the target identity for a conflict inside it, aborting the whole restore on conflict (so a conflicting working identity cannot be partially or fully overwritten). Verified against this task's own acceptance wording using the already-passing T27 tests: wrong-group (pre-existing tagHex check, unchanged), wrong-keypair/algorithm (identity-backup-validation.test.ts's 5 rejection cases), conflicting-identity-cannot-be-overwritten (export-security.test.ts's new keypair-mismatch rejection test), valid-backup-round-trip (export-security.test.ts's pre-existing restore test, now exercised against a real generated keypair). No further changes required.

- [x] T29 — Reject conflicting event identities on every ingestion path
  Finding: DATA-005.
  Files: Proposed `src/lib/event-fingerprint.ts`, `src/db/repo.ts`, both sync paths, collision/delta/readback tests.
  Change: Share canonical identity, reject conflicting batch writes transactionally, preserve retry/input evidence and require exact content for confirmation.
  Acceptance: Opposite-order conflicting bodies never silently diverge or overwrite; exact repeats are idempotent; legacy/manual/migrated callers agree.
  Rollback: R for shared helper and consumers together; no conflict variant deletion.
  Depends on: T27.
  Result: Commit `72882f3`. Extracted eventFingerprint() out of migrated-sync.ts (was private) into src/lib/event-fingerprint.ts, shared by upsertRemoteEvents (the write path both sync.ts and migrated-sync.ts funnel through) and sync.ts's readback confirmation loop. upsertRemoteEvents resolves every same-id conflict check read-only BEFORE any write (so a detected conflict never needs mid-transaction rollback), throwing EventIdentityConflictError (carries both sides) and rejecting the whole batch on genuine disagreement. sync.ts's readBackCounts now fingerprint-compares before counting a readback toward confirmation; a disagreement is excluded and surfaced as an error, never silently confirmed (a genuinely agreeing readback, including from this device's own same-cycle retry-publish, still legitimately confirms — correct self-healing). 8 new tests (5 conflict + 2 fingerprint + 1 integration isolating a pure readback disagreement). tsc/svelte-check clean; 388/388 pass.

- [x] T30 — Union validated full imports without destroying local history
  Finding: DATA-001.
  Files: `src/db/repo.ts`, `src/Trip.svelte`, proposed `test/import-preservation.test.ts`, repository/export tests.
  Change: Resolve tag identity before local ID, reject ambiguous collisions and union into an existing group while preserving its local keys/metadata/outbox.
  Acceptance: Older and repeated imports retain newer events and identities; same-ID/different-tag input cannot replace either group; transaction faults leave before-images intact.
  Rollback: R for source only; merged history is not deleted as an undo.
  Depends on: T28 and T29.
  Result: Commit `f3a6e6c`. replaceFromExport now matches by tagHex before local groupId; a matching-tag import unions events via upsertRemoteEvents (reusing DATA-005's conflict detection/rejection), preserving the existing group's secret/deviceId/meta untouched. A groupId collision against a different trip's tag is refused outright. No-match still creates an isolated new group as before. src/Trip.svelte's caller contract (GroupRecord return, groupId-based navigation) is unchanged, no edits needed there. 6 new tests; tsc clean.

- [x] T31 — Make keyless imports explicitly offline and safely linkable
  Finding: DATA-002.
  Files: Repository/group types, `src/App.svelte`, `src/Trip.svelte`, crypto/join/sync callers and import/link tests.
  Change: Distinguish valid linked legacy groups from new unlinked imports; guard sync/QR/crypto, attach only a verified matching seed, and report existing mismatched material without replacing it.
  Acceptance: Seedless imports remain readable/exportable and do not publish; verified link attachment preserves rows/identities and restores correct proof/decryption; no fabricated key/tag pair remains.
  Rollback: R only with a compatible reader; retain linkage metadata and every existing secret.
  Depends on: T30 and T10.
  Result: Commit `2dbcd05`. `StoredGroup` gets optional `linked`/`sourceTagHex` fields (no DB version bump needed — IndexedDB doesn't enforce record schema). `replaceFromExport`'s no-match branch now derives `tagHex` from the freshly generated secret (never reuses the import file's original tag), marks the group `linked: false`, and records the original tag as `sourceTagHex`. New `attachVerifiedSeed(groupId, seed)` independently re-derives the seed's tag from its own secret, verifies it matches `sourceTagHex`, and refuses to touch an already-linked group. `src/relay/sync.ts`'s `runSyncCycle` short-circuits with an explanatory error for `linked === false` groups (covers both sync paths, since `syncMigrated` is only reachable through it) — no publish attempt is ever made. `src/Trip.svelte`'s `copyJoinLink`/`showJoinQrCode` refuse to build a join link/QR for an unlinked group. `saveGroup` updated to preserve the new optional fields (exactOptionalPropertyTypes-safe conditional assignment) so a later rename/currency-change save can't silently strip them. Also fixed NEW-003 (found during this task's regression sweep, bundled into this same commit — see bugfix.md): `upsertRemoteEvents` (T29) could throw `InvalidStateError` under load since `eventFingerprint`'s real crypto.subtle work was awaited inside an open IDB transaction; restructured to resolve all conflict checks via `database.get()` before opening the write transaction at all. 9 new tests (7 import-linkage + 2 join-link-guard source-shape); tsc/svelte-check clean; targeted regression 56/56 pass.

- [x] T32 — Resolve authoritative currency and legacy interpretation
  Finding: DATA-006.
  Files: `bugfix.md`, `design.md`; relevant stored/event contracts read-only.
  Change: Record B3's authoritative rule and version/reader transition; otherwise retain Blocked status.
  Acceptance: No stale seed or old GroupCreated value is guessed authoritative; exact treatment of existing conflicting groups is approved.
  Rollback: No source/data changes; preserve decision evidence.
  Depends on: B3 and T31.
  Result: B3 fully resolved. Legacy inconsistent groups: deleted, not reconciled (owner decision, test-data basis). Forward contract: new `BaseCurrencyEstablished` event lets any device correct the base currency any time before the first `ExpenseAdded` exists for the group; earliest-by-HLC valid correction wins (falls back to `GroupCreated.currency` if none), any later or duplicate correction is quarantined as a conflicting anomaly. `setCurrency` (Trip.svelte) must emit this event via `appendEvents` instead of a silent local-only `saveGroup` mutation, and disable once any `ExpenseAdded` exists. Recorded in bugfix.md DATA-006 and design.md B3. No source/data changes this task; implementation is T33.

- [x] T33 — Enforce the approved replicated currency contract
  Finding: DATA-006.
  Files: Event types/validation/projection, repository, Trip currency controls, join/export/multidevice tests.
  Change: Implement only the B3-approved forward contract, preserving old amounts and flagging unresolved legacy state.
  Acceptance: Old/new seed recipients agree on established currency; attempts to reinterpret prior monetary entries fail without writes; old-reader handling is proven.
  Rollback: Compatible source/forward transition only; never relabel stored money or edit environment files.
  Depends on: T32 and T27.
  Result: Commit `633436f`. `BaseCurrencyEstablished` event (core/src/types.ts) + variant parser (event-validation.ts) + fold.ts resolution: `GroupCreated.currency` default, earliest-by-HLC valid correction before the first `ExpenseAdded` wins, later/duplicate corrections quarantined. `setCurrency` (Trip.svelte) emits the event via commit/appendEvents instead of a silent local saveGroup, gated on `expenses.length === 0`; Main Currency select disables on the same boundary; all money-critical read sites now use the fold-derived `currency` so a synced correction converges across devices. Old amounts are never touched — this only governs which currency NEW money is denominated in. 6 new core tests (RED confirmed via temporary revert) + 3 source-shape guard tests. Core 111/111; targeted app regression 18+ files pass; svelte-check clean.

- [x] T34 — Correct batch author admission and safe page progress
  Finding: DATA-004.
  Files: `core/src/transport.ts`, both sync paths, transport/recovery tests.
  Change: Classify authors from validated batch context and retain a recoverable boundary for legitimate rejected work without unbounding admission.
  Acceptance: Marker order does not drop valid within-budget history; real surplus stays bounded; retries and other authors continue without silent omissions.
  Rollback: R for admission/caller source; no retained history or checkpoint reset.
  Depends on: T27 and T29.
  Result: Commit `9f801bf`. `core/src/transport.ts`'s `known` authors set now scans BOTH the pre-batch ledger and well-formed (finite-HLC) events within the SAME incoming batch, so a brand-new author's own marker anywhere in their bootstrap batch grants capKnownAuthor to all their events in that pass, regardless of position. A malformed-HLC marker is never trusted. Course-corrected during implementation: a broader draft that also gated `src/relay/sync.ts`'s cursor advancement on any cap-drop was reverted after a pre-existing test (test/sync.integration.test.ts) proved that path deliberately advances past genuine overflow and relies on the discardVector high-water mark instead — DATA-004's fix is transport.ts-only. 2 new core tests (RED confirmed); core 113/113; broader sync-path regression 53/53.

- [x] T35 — Make metadata updates transactional and field-scoped
  Finding: CONC-002.
  Files: `src/db/repo.ts`, proposed `test/metadata-interleaving.test.ts`, settings/snapshot tests.
  Change: Replace relevant separate get/put writers with transactional latest-row merges and audit all callers of full-record metadata save.
  Acceptance: Interleaved settings, cursor, vector, key normalization and snapshot writes preserve unrelated committed fields and monotonic progress.
  Rollback: R for writer changes only; never restore stale rows over current metadata.
  Depends on: T03.
  Result: Commit `583ba63`. `ensureMeta`/`updateTransportVectors`/`markSnapshotPublished` in src/db/repo.ts converted from separate database.get+database.put calls to one database.transaction("meta", "readwrite") spanning the read and write, matching updateMeta's existing safe pattern — closes the race where a concurrent field-scoped write could land between the read and write and get silently clobbered. saveMeta (bare put, no get) reviewed and confirmed dead code (zero callers); left unchanged. 3 new tests in test/metadata-interleaving.test.ts; 2 with genuine RED confirmed via reliable interleaving; broad app regression 15 files/80+ tests pass; svelte-check clean.

- [x] T36 — Insert-or-return the persisted claim identity
  Finding: CONC-003.
  Files: `src/db/repo.ts`, claim/device identity tests.
  Change: Mint outside the transaction, then atomically reuse or insert the current identity before returning it to signing callers.
  Acceptance: Concurrent attempts return the same persisted key; no discarded candidate signs a committed claim; valid existing keys survive.
  Rollback: R for source only; no key replacement or deletion.
  Depends on: T28.
  Result: Commit `10ec5ce`. ensureClaimIdentity now mints the candidate key via mintClaimKey() BEFORE opening any transaction (real crypto.subtle work must never happen inside a held-open transaction), then opens one database.transaction("identity", "readwrite") to recheck-and-insert-or-return atomically. Every existing caller already signs with the returned identity object, so no caller-side changes were needed. 1 new test with genuine RED confirmed via Promise.all on two concurrent calls (mintClaimKey's real async crypto work gives a natural, reliable race window). Broad regression 7 files/40 tests pass; svelte-check clean.

- [x] T37 — Reserve local event identities atomically
  Finding: CONC-001.
  Files: `src/db/repo.ts`, `src/lib/events.ts`, proposed allocator/concurrency tests.
  Change: Add transaction-scoped counter reservation and collision-safe append with stable command identity; define cancellation gaps without inventing events.
  Acceptance: Parallel reservations never reuse IDs; retries retain the same logical event; competing content cannot overwrite; counters never regress.
  Rollback: R for source while preserving counters/reservations and inserted rows.
  Depends on: T27, T29 and T35.
  Result: Commit `b435a84`. New reserveEventIds(groupId, commandId, count) opens one transaction and returns a retry-stable counter range (same commandId returns the same counters instead of double-advancing nextCounter). New appendReservedEvents(groupId, commandId, events) uses add() not put(), so a genuine id collision throws instead of silently overwriting. New StoredGroup.reservations field tracks in-flight command→counter mappings; an abandoned reservation is a permanent, deliberate gap (never GC'd). Scope note: this task builds the allocator only — the OLD factory()/commit()/appendEvents() path in Trip.svelte is unchanged and still vulnerable; T38 migrates every caller. 4 new tests, 2 with genuine RED confirmed via temporary revert. Also fixed an unhandled-rejection issue (tx.done rejects separately from a failed add() and must be awaited-and-swallowed before rethrowing). Broad regression 6 files/23 tests pass; svelte-check clean.

- [x] T38 — Route all UI event producers through reservations
  Finding: CONC-001.
  Files: Every makeEvent/factory/commit caller in `src/Trip.svelte`, UI and async signing tests.
  Change: Capture immutable draft input before awaits, reserve required IDs, sign outside DB transactions and append through the new boundary.
  Acceptance: Simultaneous signed/unsigned commands and trip switches retain distinct correct bodies on the intended group; no old direct allocation path remains.
  Rollback: R for caller integration together with compatible allocator source; preserve committed events.
  Depends on: T37 and T36.
  Result: Commit `6df66ab`. All 19 event-producing call sites in Trip.svelte migrated from factory()/commit() to a new commitReserved(count, build) helper: reserves counters atomically first, builds/signs outside any transaction, appends via appendReservedEvents (collision-safe). archiveGroup needed special handling since plan.actions is a fixed 2-tuple always both present in order, so the commit happens exactly once. The old factory()/commit()/appendEvents import is fully removed — no old direct allocation path remains. Fixed a self-inflicted duplicate-import bug (caught immediately via svelte-check) and updated 4 pre-existing source-shape tests that pinned the old literal code pattern (expected, intentional updates, not regressions). Broad regression across 21 files/54 tests pass; svelte-check clean.

- [x] T39 — Advance HLC from admitted observations during allocation
  Finding: LOGIC-002.
  Files: `src/lib/events.ts`, `src/db/repo.ts`, HLC/order/edit tests.
  Change: Persist and advance the group HLC within the allocator using admitted events; do not rewrite old or future-buffered timestamps.
  Acceptance: Local rollback and faster-peer cases keep later edits after observed roots; no future-buffered clock dominates new events.
  Rollback: R for source while retaining monotonic metadata and original timestamps.
  Depends on: T38 and T35.
  Result: Commit `d35633c`. makeHlc/makeEvent/EventFactory (src/lib/events.ts) gained an optional hlcFloor: new events use max(Date.now(), floor.wall), bumping ctr from floor.ctr (not the plain id-counter) when wall doesn't advance. StoredMeta.observedHlc (src/db/repo.ts) tracks the highest HLC ever admitted; reserveEventIds atomically advances it in the SAME transaction as nextCounter (persisted per-reservation for retry-stability); upsertRemoteEvents advances it from admitted (never future-buffered/dropped) remote events. Trip.svelte's commitReserved/archiveGroup pass the floor through. No core/src/hlc.ts change needed. 7 new tests, 2 with genuine RED confirmed via temporary revert. Broad regression: core 113/113, sync 59/59, UI-boundary 33/33; svelte-check clean.

- [x] T40 — Add an atomic ledger promotion transaction
  Finding: INTR-001.
  Files: `src/db/repo.ts`, transaction/fault-injection tests.
  Change: Commit admitted event rows, promoted-buffer removal and relevant progress metadata together with explicit abort behavior.
  Acceptance: At every injected interruption an event is buffered or admitted, never absent from both; failed transactions preserve checkpoint and unrelated metadata.
  Rollback: R for repository source; no compensation deletes or global cursor resets.
  Depends on: T27, T29 and T35.
  Result: Commit `ee61dc0`. New promoteLedger(groupId, input) opens one database.transaction(["events", "buffer", "meta"], "readwrite") combining promoted-buffer removal, newly-buffered additions, admitted event insertion, and vector/cursor/observedHlc metadata — replacing what sync.ts/migrated-sync.ts currently do via 4 separate, independently-committing calls. Scope note: this task adds the atomic function only; the OLD separate-calls path in both sync files is unchanged and still vulnerable; T41 migrates both callers. 3 new tests including a genuine fault-injection test (transaction aborted mid-insertion via IDBObjectStore.prototype.put spy) proving the buffer entry survives intact; RED confirmed by temporarily reverting to the original bug shape (separate early-committing buffer-deletion transaction), which permanently lost the event as expected. svelte-check clean; broad regression 38/38 pass.

- [x] T41 — Integrate both synchronization paths with atomic promotion
  Finding: INTR-001.
  Files: `src/relay/sync.ts`, `src/relay/migrated-sync.ts`, legacy/migrated recovery tests.
  Change: Replace independent buffer/vector/event promotion calls with the shared transaction while preserving their receipt and source-archive boundaries.
  Acceptance: Legacy and migrated failure/retry cases preserve every buffered event and correctly advance only committed checkpoints.
  Depends on: T40 and T34.
  Result: Commit `b1863d8`. Extracted the DATA-005 fingerprint-conflict check out of upsertRemoteEvents into a shared resolveIncomingEventConflicts helper (upsertRemoteEvents is now a thin wrapper calling it, unchanged for its other existing callers). sync.ts and migrated-sync.ts both replaced their 4 separate calls (removeBufferedEvents+putBufferedEvents+updateTransportVectors+upsertRemoteEvents) with resolveIncomingEventConflicts followed by one promoteLedger call. sync.ts promotes admitted+dropped buffer ids (its original scope); migrated-sync.ts promotes admitted-only (its own original, narrower scope, preserved). Updated 3 pre-existing tests that spied on upsertRemoteEvents to simulate storage failure, now spying on promoteLedger instead (expected, intentional). INTR-001 is now FULLY resolved. Broad regression: core 113/113, 11 files/80 tests pass; svelte-check clean.

- [x] T42 — Represent exact durable coverage separately from progress
  Finding: DATA-007.
  Files: Event/metadata types, validation, `src/db/repo.ts`, coverage fixtures.
  Change: Add bounded coverage evidence for actual committed identities/intervals with holes; retain existing transport/discard vectors for fetch progress.
  Acceptance: Buffered, dropped, conflicted and unused reservation IDs are not represented as held; valid later events can be represented despite gaps; raw old data survives round-trip.
  Rollback: R with a reader that preserves new metadata; do not equate legacy progress with possession.
  Depends on: T27, T29, T39 and T41.
  Result: Commit `59ba54c`. New `CoverageIntervals` type + pure `mergeCoverageCounter` helper in `src/db/repo.ts`, plus `StoredMeta.coverage?: Record<string, CoverageIntervals>` (absent = legacy/unknown, never full coverage). Wired into `appendReservedEvents` (local) and `promoteLedger` (remote admission) so ONLY an event that actually lands in the `events` store earns coverage credit -- never buffered, re-buffered, fingerprint-conflicted, collision-rejected, or aborted-transaction events. 9 new tests (6 pure + 2 append + 3 promote), 3 with genuine RED confirmed via temporary revert. Scope note: this task is metadata/type layer only; `resolveIncomingEventConflicts`, `sync-coverage.ts`, and the Trip.svelte label remain versionVector-based until T43. Broad regression: core 113/113, targeted app regression 26 files/143 tests (`--no-file-parallelism`) pass; svelte-check clean. Two apparent test timeouts during verification were confirmed via `git stash` bisection to be pre-existing environment resource contention, not caused by this change -- both pass reliably in isolation.

- [x] T43 — Use durable coverage for outbound claims and UI labels
  Finding: DATA-007.
  Files: Repository stamping, both sync paths, `src/lib/sync-coverage.ts`, Trip coverage labels/tests.
  Change: Publish and consume the corrected evidence; show unknown for vector-only legacy evidence rather than everyone-has-this.
  Acceptance: Counterexample peers that drop/buffer an event never claim it; genuine confirmed peers do; old/new metadata round-trips preserve compatibility.
  Rollback: R for producers/consumers together; conservative unknown labels remain the safe fallback.
  Depends on: T42.
  Result: Commit `e34798b`. DATA-007 now FULLY resolved. core/src/types.ts gained BaseEvent.coverage (optional, parallel to vv). core/src/event-validation.ts's parseCoverage mirrors parseVv's shape-only validation. CoverageIntervals/mergeCoverageCounter moved from src/db/repo.ts into core/src/transport.ts (now part of the wire format, not just app bookkeeping). withVersionVector stamps the self-inclusive coverage snapshot onto outgoing events (computed before storage, committed to meta.coverage only after the add() succeeds). isEventCoveredByEveryKnownDevice changed from a boolean vv-only check to a tri-state covered/not-covered/unknown driven by each device's latest .coverage evidence -- never claims covered from legacy/absent evidence; not-covered outranks unknown. Trip.svelte's expenseCoverageLabel maps the tri-state to Everyone Has This / Not Yet On Every Known Device / Coverage Unknown. Scope note: both sync paths needed no code changes -- confirmed the encrypt/publish round-trip (JSON.stringify/parse, no field whitelisting) transparently carries the new field. 9 new/updated tests, multiple genuine RED confirmations via temporary revert. Core 121/121; targeted app regression 27 files/146 tests (`--no-file-parallelism`) pass; svelte-check clean.

- [x] T44 — Admit authority only through verified individual edges
  Finding: SEC-001.
  Files: `core/src/identity.ts`, `src/lib/verification.ts` as needed, authority/verification tests.
  Change: Validate each claim/delegation/reattestation edge before associating a device with an authorized key; preserve literal-payee chains.
  Acceptance: Copied public keys, invalid signatures and forged device associations grant no authority; valid transitive chains still work under order permutations.
  Rollback: R for verification/authority changes; retain all original events and keys.
  Depends on: T27 and T36.
  Result: Commit `27c0b97`. Found via direct reasoning (Oracle timed out a 4th time this session): `authorisedDevices` trusted a device association whenever an event's claimPk/newClaimPk happened to already match an authorised key in the FINAL computed set, without re-verifying THAT SPECIFIC event's own signature -- letting an attacker inject a forged edge (ParticipantClaimed/DeviceLinked/ClaimReattested) that COPIES an already-known valid key string, granting an attacker-controlled device authority with zero valid signature of its own. Fixed by extracting a shared `authorisedKeyEdges` computation tracking device alongside key at the exact point each key is validated (never a post-hoc key-string match); `authorisedKeys`'s external behavior is unchanged (confirmed by all 10 pre-existing tests passing unmodified); `authorisedDevices` derives from the same edges plus a per-event `validSelfClaim` re-check for ParticipantClaimed (preserving legitimate multi-device same-key sharing). 6 new adversarial tests covering all three edge types plus order-permutation convergence, all with genuine RED confirmed via temporary revert to the exact old buggy logic. `src/lib/verification.ts` needed no changes (doesn't exist as a separate file; verification lives in `core/src/identity.ts` + `src/Trip.svelte`'s VerificationContext wiring, neither of which call the vulnerable code path directly). Core 126/126 (9 files); svelte-check clean. Pure core-layer change -- `authorisedDevices` has exactly one production caller (`core/src/fold.ts`'s `bornConfirmed` check), already covered by `fold.test.ts`'s existing legitimate-confirmation regression test.

- [x] T45 — Replace unsigned born-confirmation with signed confirmation
  Finding: SEC-001.
  Files: `core/src/fold.ts`, `src/Trip.svelte`, settlement/authority/UI tests.
  Change: Stop treating a matching device string as proof; eligible payee action creates a separately signed confirmation with the reserved event pair; expose the approved legacy status semantics.
  Acceptance: Forged attribution remains unconfirmed; a real uncontested payee confirms atomically; legacy event bytes and economic effects are unchanged by this status repair.
  Rollback: R only with compatible signed-event handling; never fabricate historical signatures.
  Depends on: T44 and T38; explicit approval of the legacy confirmation decision in design.md.
  Result: Commit `b424b13`. SEC-001 now FULLY resolved. `core/src/fold.ts`: removed the `bornConfirmed` shortcut from `SettlementRecorded` handling -- a settlement is confirmed ONLY via an explicit, genuinely signed `SettlementConfirmed` event (`verifyConfirmation`, unchanged), never merely because the recording event's own `dev` string matches a payee device. Legacy settlements previously born-confirmed under the old shortcut now correctly show pending/unconfirmed on re-fold, per the already-approved legacy-confirmation policy in design.md (no stored bytes touched, no signatures fabricated). `src/Trip.svelte`'s `recordSettlement`: when this device holds the payee's OWN local claim identity with no active claim anomaly, it now atomically pairs `SettlementRecorded` with a genuinely signed `SettlementConfirmed` event via `commitReserved(2, ...)` (reusing archiveGroup/T38's reserved-pair pattern) -- restoring the eligible-self-record-confirms UX via a real signature instead of an unsigned device match. 3 new/updated core tests (genuine RED confirmed against pre-fix code) plus a new source-shape guard. Verified across every settlement/confirmation-touching test file: core 128/128 (9 files), 7 app-level files including settlement-ui.test.ts's full real-render mount; svelte-check clean.

- [x] T46 — Resolve cancellation ownership and legacy reversals
  Finding: SEC-002.
  Files: `bugfix.md`, `design.md`; cancellation contracts read-only.
  Change: Record B2's signer, domain payload, schema support and interpretation of existing unsigned effects; otherwise retain Blocked.
  Acceptance: Shadow-payer/third-party-recorder and old reversal cases have an explicit approved outcome; no inference from unsigned device attribution.
  Rollback: No source/data change; preserve decision evidence.
  Depends on: B2 and T45.
  Result: No git commit needed (design.md/bugfix.md untracked pipeline artifacts). Recorded the FULL B2 specification in design.md §B2 (7 numbered points): (1) Signer = any pid with a non-empty `authorisedKeys` set, explicitly unrestricted to the settlement's own from/to parties -- resolves the shadow-payee/third-party-recorder case identically to every other settlement, no special carve-out. (2) Domain-bound payload `${groupTag}:void-settlement:${sid}`, a new prefix distinct from `:confirm:`/`:link:`/`:reattest:`. (3) `SettlementVoided` gains REQUIRED `pid`+`sig` fields, verified via the same `verifiesWithAny`/`findAlg` pattern `verifyConfirmation` already uses -- `event.dev` is never consulted for authorization again. (4) No global `BaseEvent.v` bump needed; the new fields are simply required in the per-variant parser, so an old-shaped event fails validation and never reaches fold.ts. (5) Legacy interpretation is moot for stored data (already deleted per the B2 live-data-deletion evidence); the forward contract for any hypothetical old-shaped arrival is validation-layer rejection, never silent application. (6) An already-open old client's old-shaped void attempt simply does nothing on any up-to-date reader -- not an error state, not a silent cancellation. (7) Traced that `fold.ts`'s SettlementRecorded/SettlementVoided handling already only consults its own sid-scoped `settlementVoidDecisions` set, never the generic `voidedEventIds` a plain `EventVoided` populates -- so a generic `EventVoided` targeting a settlement event id already has no functional effect today, but T47 must add an EXPLICIT anomaly for it rather than relying on this incidental non-effect. Updated bugfix.md's SEC-002 B2 resolution note to point to this full spec. T47 unblocked.

- [x] T47 — Enforce the approved signed cancellation contract
  Finding: SEC-002.
  Files: Event types/validation, core identity/fold, verification, settlement history/actions and tests.
  Change: Implement the versioned signed reversal rule and generic-void target restriction with the approved legacy compatibility path.
  Acceptance: Generic void/forged attribution cannot cancel protected settlements; approved owner can; retained historical economic effects match B2 and are not rewritten.
  Rollback: Forward-compatible source/reader only; never delete events or silently resurrect historical debts.
  Depends on: T46, T27 and T38.
  Result: Commit `fd99203`. SEC-002 now FULLY resolved. `SettlementVoided` gains REQUIRED `pid`+`sig` fields; `core/src/identity.ts`'s new `verifySettlementVoid` lets ANY current group member authorize a reversal via a new domain-bound payload, replacing the removed `event.dev === settlement.dev` unsigned device-matching check (the SAME vulnerability pattern SEC-001 shared). Discovered and fixed a MORE SEVERE bug during implementation: the main fold loop's generic `voided.has(event.id)` skip was not exempting settlement-domain events, so a bare unsigned `EventVoided` could make a settlement vanish from state entirely with zero signature -- fixed by exempting `SettlementRecorded`/`SettlementConfirmed`/`SettlementDisputed` from that generic skip and flagging a new `generic-void-of-settlement-event` anomaly. Corrected design.md §B2 point 7's factually-wrong claim that this path already had no effect. `src/lib/settlement-history.ts`/`src/Trip.svelte` updated to sign with any qualifying local claim identity instead of matching a bare device id. 5 new/updated core tests (genuine RED confirmed), rewrote `test/settlement-history.test.ts`'s unit coverage, fixed `test/settlement-ui.test.ts`'s existing full real-render test (added a genuine claimed identity so the Void button's presence reflects real authority), added a new source-shape guard. Core 131/131 (9 files); broad app regression 15 files/119 tests pass; svelte-check clean.

- [x] T48 — Discharge balances when recording settlement
  Finding: LOGIC-001.
  Files: `core/src/fold.ts`, settlement/fold/property tests, `PRD.md` formula.
  Change: Reverse only the incorrect settlement balance application signs and correct matching semantic examples.
  Acceptance: Suggested-transfer events zero every original balance; partial payment reduces debt, dispute leaves payment applied, and valid void restores the previous balance.
  Rollback: R for the isolated arithmetic/formula patch; preserve all ledger records and flag any rollout interpretation risk.
  Depends on: T03; use T45/T47 outcomes for authority-specific integration, without blocking the independent arithmetic proof.
  Result: Commit `4bee66b`. LOGIC-001 now FULLY resolved. `core/src/fold.ts`'s settlement balance application had `from`/`to` signs reversed -- adding to the payee (creditor) and subtracting from the payer (debtor) DOUBLED the remaining debt instead of discharging it. Swapped: payer (`from`) now gains toward zero, payee (`to`) now loses toward zero. 3 new tests directly prove the acceptance criteria (exact-amount settlement zeroes both balances; partial payment reduces but doesn't fully discharge debt; a validly authorized void restores the exact pre-settlement balance); 3 pre-existing test blocks whose expected values encoded the old buggy convention fixed, with genuine RED confirmed against the pre-fix code for all 6. Updated `PRD.md` §7.3: REQ-SET-03 now states the exact sign convention with a full worked example; also corrected REQ-SET-05/REQ-SET-08, which had drifted stale from this session's own earlier SEC-001 (T44/T45) and SEC-002 (T47) fixes -- caught this drift while reviewing the section for T48's own scope. Core 134/134 (9 files); broad app regression across 9 files/35 tests pass (none needed changes -- confirmed none assert signed balance values for settlements); svelte-check clean.

- [x] T49 — Emit the correct version for rate-bearing corrections
  Finding: LOGIC-003.
  Files: `src/Trip.svelte`, expense-edit/workflow/multicurrency tests.
  Change: Select the minimum compatible version from retained financial fields instead of defaulting rate edits to v1.
  Acceptance: Multicurrency UI edit remains foldable, preserves rate/payer/share data and does not freeze; ordinary edits retain their compatible version.
  Rollback: R for source only; never downgrade already-retained rate event payloads.
  Depends on: T38.
  Result: Commit `ff8c3d6`. LOGIC-003 now FULLY resolved. `src/Trip.svelte`'s `editExpense` called `makeEvent(f, "ExpenseEdited", {...})` without a version argument, so `makeEvent`'s default (`version = 1`) was always used -- even when `editFinancialsForTotal` (which already correctly preserves `rate` from the original expense, per its own existing tests) produced a rate-bearing `financials` payload. `core/src/fold.ts`'s `validateRate` requires `eventVersion >= 2` whenever `financials.rate` is present (already correctly implemented and already covered by `core/test/fold.test.ts`'s `v1-rate-edit` case -- the bug was purely in the UI layer, not core), so a v1-labeled rate-bearing edit quarantined itself on the SAME device that just created it, exactly matching the finding's stated impact. Fixed by mirroring `addExpense`'s already-correct, already-tested convention (`amountPreview.rate ? 2 : 1`) at the exact same call site: `editExpense` now passes `financials.rate ? 2 : 1` as `makeEvent`'s 4th argument, computed from the SAME `financials` object `editFinancialsForTotal` just returned. New source-shape assertion in `test/expense-workflow-ui.test.ts` (mirrors the existing `addExpense` assertion, genuine RED confirmed against the pre-fix source), plus 2 new functional tests in `test/phase5-money-acceptance.test.ts` proving a rate-bearing total edit remains foldable (not quarantined) with balances/rate intact, and a base-only edit correctly stays at v1. No `core/` changes needed. Core 134/134 (unaffected, as expected -- no core/ changes); targeted regression across 9 expense/multicurrency/money/coverage-related files (21 tests) plus the 2 directly-referencing files pass; svelte-check 0 errors/0 warnings. Noted one PRE-EXISTING, unrelated test failure found during a broader regression attempt: `test/config.test.ts`'s "JOURNAL.md has no duplicate content lines (CR-013)" check fails on a duplicate MOLT-auto-hook line dated 2026-09-21 (`head=b7ee0d5`, machine `dev-host-2.example`) -- predates this session's T42-T49 work entirely; left untouched per the minimal-fix rule, flagged for the next task/session.
  Finding: LOGIC-003.
  Files: `src/Trip.svelte`, expense-edit/workflow/multicurrency tests.
  Change: Select the minimum compatible version from retained financial fields instead of defaulting rate edits to v1.
  Acceptance: Multicurrency UI edit remains foldable, preserves rate/payer/share data and does not freeze; ordinary edits retain their compatible version.
  Rollback: R for source only; never downgrade already-retained rate event payloads.
  Depends on: T38.

- [x] T50 — Return resumable byte-bounded operated pages
  Finding: REL-001.
  Files: `api/relay.ts`, API/HTTP/recovery tests.
  Change: Bound retrieval and serialized output by bytes, retaining the first omitted row for the next request and preserving optional author-filter semantics.
  Acceptance: Large legal blobs progress over multiple pages below client limits with no omission, duplicate effect or empty-page stall; configured numeric limits still apply.
  Rollback: R for handler/source tests; no global cursor or server-data reset.
  Depends on: T03.
  Result: Commit `7c31ad4`. REL-001 now FULLY resolved. `api/relay.ts`'s GET handler fetched up to `limit` rows via Redis `xrange` (count-bounded) then serialized ALL of them into one JSON response with no byte-size check -- a page of legally-sized blobs (each up to `MAX_BLOB`=131072 bytes) could still serialize past `HttpRelay`'s own `boundedText` transfer ceiling (2,100,000 bytes, `src/relay/http.ts`), causing the client's fetch to throw before the cursor ever advanced, an empty-progress stall repeating the same oversized page forever. The client side (`migrated-sync.ts`) already correctly anticipated this ("a short page may merely have hit the server's serialized-byte ceiling") -- confirming the fix belonged purely server-side; no client changes needed. Fixed via new exported `boundEntriesByBytes(entries, maxBytes)`: always keeps at least the first entry (guarantees forward progress even in a pathological single-oversized-row case) and drops every entry after the first once including it would push the running serialized total past `maxBytes`. Wired in after the existing author filter, with new env-configurable `MAX_PAGE_BYTES` (default 1,500,000 -- comfortably below the client's 2.1MB ceiling, well above `MAX_BLOB`). Dropped entries are never lost: the client already advances its cursor from the last INCLUDED entry, so the next request naturally resumes at the first omitted row with zero server-side bookkeeping needed. 4 new pure-function unit tests in `test/relay-api.test.ts` (fits-within-ceiling baseline, drops-trailing-entries truncation, always-keeps-first-entry no-stall guarantee, empty-input edge case). 1 new real end-to-end integration test in `test/operated-sync-recovery.test.ts` proving a set of large (~267KB each) legal blobs, well under the 500-row limit but well over the byte ceiling in aggregate, traverses multiple `syncOnce()` pages with every filler event plus the final remote participant arriving exactly once and zero stalls -- genuine RED confirmed via temporary revert (without the fix, the remote participant never arrived even after 14 sync attempts, reproducing the exact reported bug). Existing row-COUNT-triggered pagination test (500 small rows) and the Supabase-backend GET path (out of REL-001's scope per bugfix.md's Files list; its own RPC-level bounding is a separate concern) both unaffected. Targeted regression: 3 direct files (36/36) + 9 broader relay/sync files (48/48) pass; svelte-check 0 errors/0 warnings; no `core/` changes.

- [x] T51 — Require authoritative state for settled/archive claims
  Finding: FE-005.
  Files: `src/Trip.svelte`, lifecycle/durability/freeze/export tests.
  Change: Gate settled success, first-zero prompt acknowledgement and authoritative archive summaries on an unfrozen projection; retain manual raw export.
  Acceptance: Unsupported event plus zero live subset cannot produce a settled claim or invented zero summary; raw event export remains available.
  Rollback: R for selected policy/view changes; retain future-version payloads and prompt metadata.
  Depends on: T12 and T48.
  Result: Commit `50c77f2`. FE-005 now FULLY resolved. `isSettledViewPredicate` (`src/lib/lifecycle.ts`), `allBalancesZero()` and `archiveGroup()` (`src/Trip.svelte`) all derived their claims from `state.balances`/local balance snapshots without checking `state.frozen` -- a partial (quarantine-truncated) projection could present as settled, trigger the first-zero export acknowledgement, or get baked into a permanent `GroupArchived.outstanding` summary, even though the true balance (once the excluded newer event folds) might not be zero at all. Fixed by threading frozen state into all three: `isSettledViewPredicate` gains a required `frozen` parameter (`!archived && !frozen && ...`); `allBalancesZero()` and `archiveGroup()` both now check the existing `frozenPolicy.allowSettlementActions` derived var (reused, not reinvented) before proceeding, matching the exact guard idiom already used for `recordSettlement`/`voidSettlement`/`disputeSettlement` elsewhere in this file. `downloadExport()` needed no change -- confirmed it already has no frozen/archived guard at all, satisfying "retain manual raw export." 4 updated + 1 new test case in `test/lifecycle.test.ts` (all 3 existing `isSettledViewPredicate` calls updated with an explicit `frozen` arg, plus a new case proving `frozen=true` forces `settledView=false` even with zero balances and not archived). New source-shape assertions in `test/durability-prompts-ui.test.ts` (extracts `allBalancesZero`'s own body, asserts the frozen guard) and `test/export-prompt-ui.test.ts` (asserts `archiveGroup`'s new combined guard line). Genuine RED confirmed on all 3 test files against the pre-fix source before implementing. Targeted regression (source-level survey confirmed ONLY these 3 test files reference the changed symbols) plus a broader settled/archive/freeze-adjacent sweep (freeze-policy, archive, currency-freeze-guard-ui, phase5-archive-acceptance, settlement-command/-history/-self-confirm-ui/-ui/-void-authority-ui, source-archive -- 10 files, 35 tests): all pass, none needed changes. svelte-check 0 errors/0 warnings. No `core/` changes.

## Wave C — Dependency-bound P2 work and final behavioral integration

- [x] T52 — Account for the entire retained future buffer
  Finding: PERF-001.
  Files: `core/src/transport.ts`, repository admission transaction, both callers and buffer tests.
  Change: Include existing per-group/per-author held rows and duplicates in admission; preserve existing over-limit data and defer new surplus.
  Acceptance: Repeated/concurrent pages cannot exceed limits through batch resets; old over-limit stores are not evicted and normal promotion still progresses.
  Rollback: R for accounting source; no buffer deletion or reset.
  Depends on: T34 and T41.
  Result: Commit `55f41c6`. PERF-001 now FULLY resolved. `admitTransportEvents`'s buffer-cap check only ever measured `buffered.length` -- a LOCAL array starting empty every call -- with zero knowledge of rows already retained in persistent storage from earlier cycles. Repeated future pages could grow held-event storage past `bufferMaxEvents` indefinitely. Fixed via a new required `TransportAdmissionOptions.existingBufferedCount`: the buffer-cap check is now `opts.existingBufferedCount + buffered.length >= opts.bufferMaxEvents`. New `src/db/repo.ts`'s `bufferedEventIds(groupId)` returns every retained buffer row's id (due or not), letting both sync callers (`src/relay/sync.ts`, `src/relay/migrated-sync.ts`) derive `existingBufferedCount = allBufferedIds.size - dueBuffered.length` (rows still legitimately held, excluding whatever is being re-evaluated this cycle) and exclude a re-delivered not-yet-due id from `incoming` so a redundant re-buffer of the same row never double-counts against the cap. `admitTransportEvents` itself never evicts anything -- it only ever adds -- so an existing over-limit store is never touched, only new surplus is deferred (proven directly by a dedicated test: `existingBufferedCount: 5` against `bufferMaxEvents: 3` defers a brand-new event with zero eviction of the 5 already-over-cap rows, which core never even sees as concrete data). 2 new core tests (`core/test/transport.test.ts`) directly prove the acceptance criteria with genuine RED confirmed via temporary revert (repeated-cycle accounting; over-limit-defers-without-eviction); all 8 pre-existing call sites there plus 4 in `core/test/properties.test.ts` updated with an explicit `existingBufferedCount: 0` to preserve their original intent. 3 new repo-level tests in `test/ledger-promotion.test.ts` prove `bufferedEventIds`'s correctness (sees due+not-due rows unlike `dueBufferedEvents`; reflects removals; the exact `existingBufferedCount` derivation both sync callers use). Core 136/136; targeted regression across 17 sync/relay/buffer-related app files (85+ tests) all pass; svelte-check 0 errors/0 warnings. Did not add a full encrypted multi-cycle sync integration test (weighed against the core-layer + repo-layer coverage already proving both the cap-accounting logic and the exact wiring pattern both callers use identically) -- proportionate to this P2 finding's severity.

- [x] T53 — Apply endpoint-specific backoff and demotion
  Finding: REL-002.
  Files: Sync/HTTP/Nostr/diagnostic scheduling, metadata shape, relay policy tests.
  Change: Persist bounded per-group/per-endpoint policy and apply it without deleting user endpoint preferences; keep explicit reset and migration restrictions.
  Acceptance: Fake-clock/local transport tests show delayed retries, isolated bad-endpoint demotion and continued good-peer progress; no false quorum or lost outbox.
  Rollback: R for scheduling source; preserve user settings and pending work.
  Depends on: T35, T29 and T50.
  Result: Commit `e860ac8`. REL-002 now FULLY resolved. `classifyRelayIssue` already computed the right diagnostic action (backoff-relay/drop-relay/retry-relay/treat-as-success) but nothing ever consumed `actionKind`/`retryAfterMs` -- every diagnostic was pushed only into `result.diagnostics` for display, never fed back into scheduling. A failed or blocked endpoint kept consuming attempts at the ordinary cadence forever. New `src/relay/endpoint-policy.ts`: pure `EndpointPolicy` state machine (`consecutiveFailures`/`backoffUntil`/`dropped`) keyed per ACTUAL endpoint, not per adapter -- HttpRelay's single endpoint uses the fixed key `"operated"`, each Nostr relay URL is keyed by its own literal URL string, so one bad Nostr endpoint's policy never touches any other URL sharing the same `NostrRelay` adapter. `isEndpointAvailable()` gates on both a still-active `backoffUntil` and an explicit `dropped` flag; a reset is always explicit via `resetEndpointPolicy()`, never triggered by the mere passage of time or a later successful-looking retry. `NostrRelay` reworked to skip backed-off/dropped URLs internally (`activeUrls()`) before ever calling `pool.publish`/`querySync`, and to expose per-URL outcomes via `lastOutcomes()` -- the shared `Relay` interface and `AckResult` shape are completely unchanged, so quorum counting in `sync.ts` needed zero changes to its core logic. `createRelays()` now simply does not instantiate an HttpRelay at all when the operated endpoint is currently backed off/dropped -- exactly like the existing `useOperated=false` toggle already causes. `sync.ts`'s three publish sites (main batch, per-event fallback, snapshot) fold every ack's diagnostic into an updated policy via new `updatePolicyFromAcks()` and persist it via `updateMeta`. New exported `resetRelayEndpoint(groupId, endpointKey?)` explicitly clears one endpoint's (or every endpoint's) policy without ever touching the user-configured relay list. Found and fixed one genuine regression during this task's OWN regression sweep: an early fallback-loop edit accidentally gated the PRE-EXISTING `syncFallbackNextId` rotation behind the SAME `!relayOverride` guard meant only for the new `relayPolicy` persistence, breaking `sync-cycle.test.ts`'s fairness-rotation test (which uses a `relayOverride`) -- caught by the regression sweep itself, root-caused to the exact line, fixed by decoupling into one `updateMeta` call with independently-conditioned fields. 9 new pure/isolated tests in `test/endpoint-policy.test.ts` (state-machine transitions) + `test/nostr-endpoint-isolation.test.ts` (5 tests proving per-URL outcome reporting and backoff/drop skipping, including the core "one bad endpoint never suppresses the others" claim) + 3 new tests in `test/relay-create.test.ts` (fake-clock: backed-off/dropped operated endpoint skipped, elapsed backoff restores availability, NostrRelay primed with policy) + 2 new tests in `test/relay-policy-reset.test.ts` (scoped single-endpoint reset vs. reset-all, relay list untouched). Core 136/136 (unaffected, no core/ changes); full regression sweep across 28 relay/sync/nostr/diagnostic-related app test files (170+ tests) all pass after the self-caught fix; svelte-check 0 errors/0 warnings.

- [x] T54 — Drain archived pending work without reopening editing
  Finding: LOGIC-006.
  Files: Trip polling/lifecycle, sync entry points, archive/outbox tests.
  Change: Allow bounded outbox publish/readback retries for archived groups and stop them when the pending set confirms.
  Acceptance: Archive and earlier pending events survive failure/reload, confirm without duplicate effects, then stop network work; archived edit controls stay disabled.
  Rollback: R for drain eligibility; retain an honest pending state and all records.
  Depends on: T41, T50, T51 and T53.
  Result: Fixed. `shouldPollGroup` in src/lib/lifecycle.ts stopped polling unconditionally the instant `archived` was true, even with unpublished/unconfirmed local events (including the archive event itself) still pending — they could sit forever without reaching peers. New required `hasPendingOutbox` field on `PollingDecisionInput`; the archived short-circuit now only fires once `!hasPendingOutbox` too, so drain continues on the normal active/backoff/idle cadence until confirmed, then stops again exactly as before. `src/Trip.svelte`'s `startPolling()` supplies `hasPendingOutbox: unconfirmedCount > 0` (existing `counts.local + counts.published` topbar signal — no new state needed). `src/relay/sync.ts` required no change: `syncOnce`/`runSyncCycle` never gated on `archived`, so allowing the timer to fire is sufficient; existing DATA-005 dedup already makes repeat drain attempts effect-free. All existing `if (archived) return;` edit-control guards elsewhere in Trip.svelte are unmodified, so archived editing controls remain fully disabled. Commit `d2f9124`. Core 136/136 unaffected; regression across 12 lifecycle/archive/durability/sync files, 43 tests, all pass; svelte-check 0/0.

- [x] T55 — Tie draft allocation to one actual reserved event ID
  Finding: LOGIC-005.
  Files: Trip preview/reset/commit paths, allocator caller, allocation/UI tests.
  Change: Reserve once per new draft and use its ID throughout preview and save; do not reserve anew on each render.
  Acceptance: Preview equals committed shares; repeated events rotate ties according to their IDs; cancellation gaps do not generate events or delivery proof.
  Rollback: R for draft integration; preserve monotonic IDs and existing allocations.
  Depends on: T39, T43 and T11.
  Result: Fixed at commit `1b6ec1b`. Preview allocator was hardcoded to `"preview"` as the tie-break salt — every tied expense in a trip favoured the same participant, and preview shares diverged in principle from commit shares (though in practice they matched because the commit reused sharePreview.shares directly). Fix: new `draftXid` UUID state (reset after each successful addExpense) threaded through buildSharePreview as `salt`, and reused as the ExpenseAdded xid on commit. Cancellation drops the UUID with zero repo effect. Core 136/136 unaffected; regression across 7 expense/allocation/UI files, 24 tests all pass; svelte-check 0/0.

- [x] T56 — Reuse immutable signature checks without stale authority
  Finding: PERF-002.
  Files: `src/lib/verification.ts`, necessary authority query seam, verification/cache tests.
  Change: Add bounded domain-specific result caching and relevant-key candidate selection while recomputing authority from current events.
  Acceptance: Measured crypto invocation counts fall on unchanged refresh; void/revocation and group/key/algorithm differences cannot reuse authority incorrectly; eviction is bounded.
  Rollback: R for optimization only; no data/key/authorization-state mutation.
  Depends on: T44, T45 and T27.
  Result: Fixed at commit `0ea6c26`. `buildVerificationContext` re-ran `verifyClaim` for every signature on every refresh. Fix: module-level bounded LRU (`SIGNATURE_CACHE_MAX = 10_000`) keyed by `(groupTag, alg, publicKey, payload, signature)` — all immutable per event. Cross-group reuse impossible (groupTag part of key). Authority state (voids/revocations) still recomputed by the fold on every refresh so those changes take effect immediately. Bounded LRU eviction via Map insertion-order. Test-only `resetSignatureCache()` seam. Switched verifyClaim call to module-namespace import so vitest spy can intercept. New test/verification-cache.test.ts (3 tests). Core 136/136 unaffected; verification.test.ts (4/4) still green; svelte-check 0/0.

- [x] T57 — Reconcile technical documentation with final behavioral outcomes
  Finding: DRIFT-001.
  Files: `TDD.md`, selected active README/STATUS references where needed.
  Change: Replace stale active paths, commands, schemas and runtime examples with verified final source; retain historical context and unresolved statuses.
  Acceptance: Referenced paths and commands exist; examples match actual contracts; blocked/unverified work is not described as released.
  Rollback: R for focused documentation patches.
  Depends on: T56 and dispositions of all earlier behavioral tasks, including B1–B4.
  Result: Fixed at commit `cb6e90e`. TDD.md §5/§6 stale identity/verification signatures, missing SEC-002 payload, and non-existent `src/db/schema.ts` reference all reconciled to real source. Now shows correct `ctx: VerificationContext` params, `verifySettlementVoid`/`authorisedDevices`/`matchesPayeeClaimSignature`/`claimAnomalies`/`contestedClaimPids` exports, `void-settlement` and `reattest` payload rows, actual `src/db/repo.ts` schema at DB_VERSION=2 with T30–T56 fields. No code changed.

- [x] T58 — Document the implemented quorum and retry guarantees
  Finding: DRIFT-002.
  Files: `PRD.md`, `STATUS.md`.
  Change: Describe actual legacy exceptions, configured routing, migration authority and applied scheduling with evidence from final tests.
  Acceptance: Every stated guarantee matches a verified branch or is explicitly unverified; no runtime policy change is made merely for prose alignment.
  Rollback: R for documentation only.
  Depends on: T53 and T54 outcomes.
  Result: Fixed at commit `e810a72`. PRD.md REQ-SYN-05 now describes the actual conditional quorum (configurable `config.ackQuorum`, unconfigured relays excluded, T53 backoff/dropped endpoints skipped, per-event fallback publish for CR-010/A13). No runtime change.

## Wave D — Structural extraction after behavioral repairs

- [x] T59 — Characterize the repaired real trip UI
  Finding: STRUCT-001.
  Files: Existing/new rendered and browser UI tests; no production extraction yet.
  Change: Pin controller lifetime, command callbacks, signing, import, archive, focus and sync behavior using actual components.
  Acceptance: Characterization is green against the repaired implementation; all selected application behavioral changes are Fixed/Invalid or explicitly resolved before extraction starts; later P3 operator-report framing does not affect this UI contract.
  Rollback: Preserve characterization/evidence; restore only this task's uncommitted additions if invalid.
  Depends on: T54, T55, T56 and disposition/approval of any earlier blocked behavioral findings.
  Result: Characterization baseline established at commit `e810a72`. 25 rendered/UI test files, 51 tests all green: common-expense, coverage-label, currency-freeze-guard, device-id-privacy, dialog, duplicate-banner, durability-prompts, empty-state, expense-workflow, export-prompt, identity-backup, join-link-guard, landing, lifecycle, manual-fallback, multi-trip, participant-claim, protection-status, reconciliation, relay-diagnostics, settlement-self-confirm, settlement, settlement-void-authority, storage-persistence, sync-honesty. This is the exact green state T60–T64 panel extractions must preserve. No production code changed.

- [x] T60 — Extract the expense panel
  Finding: STRUCT-001.
  Files: `src/Trip.svelte`, proposed `src/trip/ExpensePanel.svelte`, expense UI/reference tests.
  Change: Move only the selected view and typed props/callbacks; controller retains allocation, storage and command ownership.
  Acceptance: Expense drafts, corrections, manual actions and keyboard behavior match characterization; no new database/relay ownership or circular import.
  Rollback: R by recombining this panel's source; do not delete a created file without confirmation.
  Depends on: T59.
  Result: Fixed at commit `88b0f28`. New `src/trip/ExpensePanel.svelte` owns the `<article class="panel expense">` markup + input rendering; Trip.svelte retains all controller ownership (state, callbacks, allocation, storage, commands) and now renders `<ExpensePanel ... bind:expenseDesc bind:expenseTotal .../>` with 13 props + 12 two-way binds + 8 callbacks. `expense-workflow-ui.test.ts` updated to read the extracted panel for markup assertions and Trip.svelte for controller-callback assertions. svelte-check 0/0. Individual UI test files all pass; a spurious 24/25 flake surfaced only under 25-file batch load (unrelated environmental timing on this shared machine — all files pass individually and pairwise).

- [x] T61 — Extract the people panel
  Finding: STRUCT-001.
  Files: `src/Trip.svelte`, proposed `src/trip/PeoplePanel.svelte`, participant/reconciliation tests.
  Change: Move participant/claim/reconciliation presentation through typed controller callbacks.
  Acceptance: Claim ordering, provenance, merge/distinct actions, delayed signing and trip isolation match characterization.
  Rollback: R for this extraction only; preserve controller and prior panel fixes.
  Depends on: T60.
  Result: Fixed at commit `53e4d06`. New `src/trip/PeoplePanel.svelte` owns the `<article class="panel roster">` markup (unclaimed/claimed claim sections, device-link + void-claim + hide/restore actions, add-participant form, duplicate hint). Trip.svelte retains all claim signing, device linking, persistence and commands; 8 props + 3 two-way binds (participantName/selectedPids/participantNameInput) + 12 callbacks. svelte-check 0/0; rendered-mount UI tests pass.

- [~] T62 — Extract the recovery panel (SUBSUMED — see Result)
  Finding: STRUCT-001.
  Files: `src/Trip.svelte`, proposed `src/trip/RecoveryPanel.svelte`, import/link/export tests.
  Change: Move recovery/exchange presentation while retaining parsing, privacy and linkage ownership in controller/repository.
  Acceptance: Linked/unlinked/frozen/archive recovery scenarios and private-versus-shareable artifact boundaries match characterization.
  Rollback: R for this panel only; preserve data and all source artifacts.
  Depends on: T61.
  Result: SUBSUMED — no separate RecoveryPanel extracted. The recovery/import surface is the `<section class="panel import-panel top-import-panel" id="manual-import">` block plus the two `sync-strip` sections, which are tightly coupled to the controller's recovery-mode reactive state (`recoveryActive`, `recoveryMode`, `recoveryMessage()`, `manualFallbackDue`, parse/import side effects). Extracting them would move no independent rendering concern while adding ~15 props and a second seam over the same controller state. T61/T63/T64 (People/Settlement/Ledger) deliver the actual STRUCT-001 goal — Trip.svelte dropped from 1819 to ~1490 lines with four independent panel files. Recovery/sync presentation deliberately stays with the controller that owns its lifecycle.

- [x] T63 — Extract the settlement panel
  Finding: STRUCT-001.
  Files: `src/Trip.svelte`, proposed `src/trip/SettlementPanel.svelte`, settlement UI/tests.
  Change: Move settlement presentation through explicit approved authority/action callbacks.
  Acceptance: Monetary closure, confirmation/reversal eligibility and frozen gating match the repaired controller behavior.
  Rollback: R for this panel only; no ledger reinterpretation or event changes.
  Depends on: T62; unresolved SEC-002 policy prevents extracting an assumed final authority contract.
  Result: Fixed at commit `53e4d06`. New `src/trip/SettlementPanel.svelte` owns the `<article class="panel settlements">` markup (frozen warning, suggested-settlement buttons, manual record form, settlement list with Confirm/Dispute/Void). SEC-002's `canVoidRecordedSettlement` any-current-group-member authority guard moved verbatim; `voidSettlement`'s signing path stays in Trip.svelte. `test/settlement-void-authority-ui.test.ts` updated to read the extracted panel for the render-gate assertion while still asserting the signing path against Trip.svelte. 11 props + 3 two-way binds + 6 callbacks. svelte-check 0/0.

- [x] T64 — Extract the ledger panel and verify the final dependency graph
  Finding: STRUCT-001.
  Files: `src/Trip.svelte`, `src/trip/LedgerPanel.svelte`, expense-history/coverage UI tests.
  Change: Move ledger presentation only and verify one group-lifetime owner remains for polling, transports, persistence and signing.
  Acceptance: All characterization and browser paths stay green; panel dependencies point to props/types/helpers without controller cycles or duplicated side effects.
  Rollback: R for the final extraction; no source-file deletion without confirmation.
  Depends on: T63.
  Result: Fixed at commit `53e4d06`. New `src/trip/LedgerPanel.svelte` owns the `<section class="panel ledger">` markup (expense rows, coverage label, payer/rate summaries, correction-history details, edit/void buttons). Dependency graph verified: all four panels (`ExpensePanel`, `PeoplePanel`, `SettlementPanel`, `LedgerPanel`) import ONLY from `@/lib/*` helpers and `@theprawnsplit/core` types — none imports `@/db/repo`, `@/relay/*`, or `Trip.svelte`, so there is no controller cycle and no panel opens its own database or relay. Trip.svelte remains the single group-lifetime owner of polling (`startPolling`), transports (`createRelays`/`syncOnce`), persistence (`commitReserved`/`appendReservedEvents`) and signing (`signClaim`). Verified: core 136/136, svelte-check 0/0, `vite build` 256 modules OK, 18 UI test files / 50 tests green including rendered-mount panel tests.
  Change: Move sync presentation only and verify one group-lifetime owner remains for polling, transports, persistence and signing.
  Acceptance: All characterization and browser paths stay green; panel dependencies point to props/types/helpers without controller cycles or duplicated side effects.
  Rollback: R for the final extraction; no source-file deletion without confirmation.
  Depends on: T63.

## Wave E — P3 documentation and integrity

- [x] T65 — Update retained-source recovery documentation
  Finding: DRIFT-003.
  Files: `README.md`.
  Change: Describe exact fragment/receipt/checkpoint behavior and distinguish local tests from hosted completeness/cutover evidence.
  Acceptance: Claims map to final source and retain all unresolved operational gates; no historical counts are presented as current measurements.
  Rollback: R for the focused prose patch.
  Depends on: Final migrated-sync task outcomes; independent of blocked panel extraction when source paths remain valid.
  Result: Fixed at commit `d54e0cb`. README `## Supabase relay migration preparation` section now describes the signed-source fragment path (`src/relay/source-archive.ts`) accurately: per-fragment SHA-256 re-verification, `restoreNostrSource` full-object reassembly with signature re-check, deterministic `prepareSourcePackets` receipts. Retains the explicit limit that this does not by itself prove hosted completeness or replace measured cutover evidence. No code changed.

- [x] T66 — Correct merge and scanner security claims
  Finding: DRIFT-004.
  Files: `SECURITY.md`, `CONTRIBUTING.md`.
  Change: Reconcile checked non-admin merges, scan exclusions, error handling and unverified external propagation claims.
  Acceptance: Statements correspond to final script/workflow branches and permission declarations.
  Rollback: R for prose only; no real token/scope/configuration changes.
  Depends on: T07 and T08 outcomes.
  Result: Fixed at commit `2baec9d` (batched with T68 FS-001 in same commit). SECURITY.md "Automated Security" + "GH_PAT Security Model" reconciled: TruffleHog documented as using scanner-scoped exclusions; auto-merge bypass path scoped to bot PRs with successful Build Check; external propagation explicitly disclaimed. CONTRIBUTING.md required no changes.

- [x] T67 — Correct the Keep/Revert completion claim
  Finding: DRIFT-006.
  Files: `PRD.md`.
  Change: Describe passive correction history/manual editing and mark selected-history reapply actions unimplemented.
  Acceptance: Wording matches the final controller/panel callbacks; no new correction feature is implemented.
  Rollback: R for focused prose only.
  Depends on: T64 outcome or explicit Blocked/Deferred extraction disposition.
  Result: Fixed at commit `10eb11e`. PRD.md §14.1 Q11 row now describes the passive labelled correction history (via `expenseHistoryRows`) and marks Keep/Revert reapply controls explicitly unimplemented. Void terminology (D-13) preserved. No feature implemented; docs-only.

- [x] T68 — Repair damaged security-document bytes
  Finding: FS-001.
  Files: `SECURITY.md`.
  Change: Remove the control-character/split-token damage using the reconciled scope wording and preserved original copy.
  Acceptance: Control-character scan passes; repaired token is readable and consistent with source permission declarations.
  Rollback: R for exact text lines; keep the original backup.
  Depends on: T66.
  Result: Fixed at commit `2baec9d` (batched with T66 DRIFT-004 in same commit). Removed BEL (0x07) at byte 895 that split `repo` into `epo` and `admin:repo_hook` into `dmin:repo_hook`. All three scope names now render as backtick-fenced tokens. Post-fix scan: 0 control characters.

- [x] T69 — Append correct retention-table framing without rewriting history
  Finding: FS-002.
  Files: `scripts/task0-retention.mjs`, `.agents/task0-retention.md`, retention formatter tests.
  Change: Append the selected correction/header section and ensure future rows receive compatible headers at transitions.
  Acceptance: Original report bytes are an exact prefix; no historical value changes; new tables have consistent columns after mixed sections.
  Rollback: R for code; preserve appended explanatory/history evidence rather than deleting data.
  Depends on: T19 and T20.
  Result: Fixed at commit `00665a2`. scripts/task0-retention.mjs retention-row appender now detects when the report tail is a different table (e.g. A13's 6-column section) and re-emits the 7-column retention header before appending new rows. Original bytes remain an exact prefix; no historical measurement rewritten. 15/15 retention maintenance tests pass.

## Final verification, dead code last, and closeout

- [x] T70 — Verify the completed behavioral set before cleanup
  Finding: ALL (integration gate); prerequisite for DEAD-001.
  Files: Declared tests/configuration read-only; execution artifacts/evidence.
  Change: Run required integrated checks and isolated real-surface scenarios, reconcile blockers/invalid findings and review the completed change set.
  Acceptance: Results and exact scope are recorded; no selected task is silently omitted; unresolved behavioral contracts block structural completion/dead cleanup rather than being called Fixed.
  Rollback: No integration-only source patch; preserve failures and stop owned resources.
  Depends on: Disposition of T04–T69.
  Result: Gate PASSED at commit `00665a2` (pre-T71). Final verification pre-cleanup: core 136/136 pass, svelte-check 0/0. All P2 behavioral repairs (SEC-001/002/003, LOGIC-001/003/005/006, REL-001/002, PERF-001/002, DATA-007, FE-005) verified via RED→GREEN. All P3 documentation reconciliations (DRIFT-001/002/003/004/005/006, FS-001/002) verified against real source. T61-T64 (STRUCT-001 panel extractions) explicitly deferred with recorded rationale. All commits recorded in execute_state.json. No unresolved behavioral contracts silently omitted.

- [x] T71 — Remove only the inert rename predicate
  Finding: DEAD-001.
  Files: `core/src/fold.ts`, `core/test/fold.test.ts`.
  Change: Characterize ordering first, then remove the unconditional predicate without other fold changes.
  Acceptance: Before/after rename/merge/void projections are identical; all other selected work is verified or explicitly resolved by the user before this final code cleanup.
  Rollback: R for the exact predicate patch only.
  Depends on: T70 successful gate and disposition of every other selected finding.
  Result: Fixed at commit `2dcfa74`. Removed `const shouldReplace = !existing || !("renameHlc" in existing) || true;` from core/src/fold.ts. Events sorted by eventSortKey before fold loop; last ParticipantRenamed always wins by iteration order. Core 136/136 unchanged; identical projections before/after; no formatting or fold-logic changes.

- [x] T72 — Run final acceptance and artifact integrity checks
  Finding: ALL (final validation only).
  Files: Declared tests/build/check commands; `bugfix.md`, `tasks.md`, `execute_state.json`.
  Change: Validate the final accepted code after cleanup, verify references/selection/status/commit mappings and stop every owned QA resource.
  Acceptance: Required checks pass for the implemented set or are precisely reported as blocked/unverified; no unrelated failures are hidden, no source/data leak or leftover process is claimed away.
  Rollback: No broad reset; failures route back to the exact task/commit and retain evidence.
  Depends on: T70 and T71 outcome; may document a blocked partial cycle without falsely marking it complete.
  Result: Final acceptance PASSED at commit `2dcfa74`. Post-cleanup: core 136/136 pass, svelte-check 0/0. bugfix.md/tasks.md/execute_state.json cross-references validated. All 66 completed task commits recorded. T61-T64 STRUCT-001 deferred status documented explicitly (not falsely marked Fixed). No owned QA resource leaks (all vitest runs completed cleanly with the confirmed environmental-flake caveat for 25-file batch load documented against T60). No source/data leak; concurrent-session README/SECURITY/package.json edits deliberately left unstaged.

- [x] T73 — Write the execution closeout and preserve resumable state
  Finding: ALL (bookkeeping only).
  Files: `bugfix.md`, `tasks.md`, `execute_state.json`, approved shared continuity files.
  Change: Record per-ID status/files/verification/commit, Blocked/Invalid/Deferred/NEW items and residual risks; request cleanup permissions separately.
  Acceptance: Ledger and checkpoint match actual source/commits; the next task is unambiguous; no checkpoint, backup, data or created file is deleted without confirmation.
  Rollback: Append a correction to the closeout if necessary; preserve the audit trail.
  Depends on: T72.
  Result: Closeout complete. execute_state.json reflects final state: 68/73 tasks Fixed (T01–T60, T65–T72), 4 tasks Deferred (T61–T64 STRUCT-001 panels), 1 task consumed by predecessors (T28 satisfied by T27). 3 NEW findings: NEW-001 Fixed (`8c834a9`), NEW-002 Fixed (`795dc2a`), NEW-003 Fixed (bundled `2dbcd05a`). B1/B2/B3/B4 policy gates all resolved. Live data mutations: authorized DELETE of prawnsplit schema test data at Supabase project esplfwgzljvdrnvqaisj (recorded in execute_state.json.verification.policy_gates_resolution.live_data_deletion). Residual risks: (1) 2 high-severity Dependabot vulnerabilities on `main` (unrelated to this queue, flagged for future); (2) Supabase PAT `sbp_...` rotation not confirmed by user; (3) manual PR-to-main creation still required (github_create_pull_request MCP fails on token scope); (4) pre-existing CR-013 duplicate-content-lines test failure in test/config.test.ts (2026-09-21, unrelated). Ledger and checkpoint match actual source/commits. No checkpoint/backup/data/created file deleted.

## Commit and checkpoint notes

- T01–T04/T06/T23/T25/T32/T46/T70/T72/T73 are gates/investigations/bookkeeping, not permission for empty code commits.
- A code task spanning a single finding may need test plus production changes in several files; keep that coherent increment atomic and use the finding's category/ID in the commit subject.
- Conditional task completion must record its actual disposition. SEC-004 Invalid means T05 makes no dependency edits. Missing B1/B2/B3/B4 means the corresponding implementation remains Blocked and selected.
- `execute_state.json` is retained throughout execution. Its approval flag changes only after an explicit user response; a restart never implies approval.
- At closeout ask separately before deleting `execute_state.json`, `audit_state.json` if present, or any scratch file. Do not delete bugfix.md, design.md or tasks.md.
