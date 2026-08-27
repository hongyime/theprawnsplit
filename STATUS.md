# Delivery status

Tracks implementation against `PRD.md`. **The PRD is the specification; this file is the
report card.** When they disagree, the PRD is right and this file is stale — or the code
is wrong. Never edit the PRD to match the code without a decision recorded in §11.

Last audited: 2026-08-24 (CR-010 semantic re-audit against main @ 62b321b): every PRD row whose phase is ≥ 3 was re-checked for ASSERTION-LEVEL coverage — does the cited test assert the requirement's behaviour, not merely touch the same files? Count stated exactly: **36 rows carry a purely numeric phase ≥ 3** (12× phase 3, 16× phase 4, 8× phase 5); SEC-01 (`2 (mint) / 4 (verify)`) adds a 37th in-scope register row whose **phase-4 verify half received an assertion-level audit** too — see its Notes row. Result: 3 rows downgraded to `Partial` with one-line gaps in the Notes column. The CR-009 pass (same day) verified file existence only. CR-012 added the Evidence column and the grading standard it encodes: **a row may be Built when cited tests assert the requirement's semantics; the column records whether that assertion ran against a real render (rendered) or against source text / pure modules (source-shape).** Three pilots were converted to rendered assertions (CR-012): reconciliation-ui, settlement-ui, manual-fallback-ui.

| ID | Status | Implementation | Tests | Notes | Evidence |
|---|---|---|---|---|
| REQ-ID-01 | Built | `src/App.svelte`, `src/main.ts` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-ID-02 | Built | `src/lib/ids.ts`, `src/db/repo.ts` | `test/device-identity.test.ts`, `test/device-id-privacy-ui.test.ts`  | | source-shape |
| REQ-ID-03 | Built | `core/src/types.ts`, `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/participants.test.ts`  | | source-shape |
| REQ-ID-04 | Built | `src/lib/events.ts`, `core/src/fold.ts`, `src/App.svelte` | `core/test/fold.test.ts`, `test/participants.test.ts`  | | source-shape |
| REQ-ID-05 | Built | `core/src/fold.ts`, `core/src/settle.ts` | `core/test/fold.test.ts`, `core/test/settle.test.ts`  | | source-shape |
| REQ-ID-06 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/participants.test.ts`  | | source-shape |
| REQ-ID-07 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/verification.test.ts`, `test/participant-claim-ui.test.ts`  | | source-shape |
| REQ-ID-08 | Built | `src/lib/participants.ts`, `src/App.svelte` | `test/participant-claim-ui.test.ts`, `test/landing-ui.test.ts`  | | source-shape |
| REQ-ID-09 | Built | `src/lib/participants.ts`, `src/App.svelte` | `test/participant-claim-ui.test.ts`  | | source-shape |
| REQ-ID-10 | Built | `src/lib/participants.ts`, `src/App.svelte` | `test/participant-claim-ui.test.ts`  | | source-shape |
| REQ-ID-11 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/durability.test.ts`  | | source-shape |
| REQ-ID-12 | Built | `core/src/identity.ts`, `core/src/fold.ts`, `src/App.svelte` | `core/test/fold.test.ts`, `test/duplicate-banner-ui.test.ts` | CR-011 closed the CR-010 gap: `test/duplicate-banner-ui.test.ts` now asserts the possible-duplicate-participants banner (both labels, "without changing balances automatically", Merge / Not same append-only actions); fold-side assertion remains at `core/test/fold.test.ts:367` | rendered |
| REQ-ID-13 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `core/test/properties.test.ts` | CR-010 added the pinned opposing-direction merge case (`core/test/properties.test.ts`, concurrent HLCs convergent in both delivery orders); convergence is over-determined by four layers (compareHlc dev tiebreak, id tiebreak, fold pre-sort, direction-independent min-root union). CR-011 mutation runs: dropping the id tiebreak left every §16.2 property green — only the new pinned comparator test catches it | source-shape |
| REQ-ID-14 | Built | `core/src/fold.ts`, `src/lib/events.ts` | `core/test/fold.test.ts`, `test/reconciliation-ui.test.ts` | | source-shape |
| REQ-ID-15 | Built | `src/lib/expense-command.ts`, `src/App.svelte` | `test/expense-command.test.ts`, `test/landing-ui.test.ts`  | | source-shape |
| REQ-ID-16 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/reconciliation-ui.test.ts` | | source-shape |
| REQ-ID-17 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/reconciliation-ui.test.ts` | CR-012 assertion-level audit: `core/test/fold.test.ts` asserts contradiction surfacing WITHOUT altering merge balances (:382) and that EVERY transitive merge edge appears with per-edge undo (:403); `test/reconciliation-ui.test.ts` asserts one undo action per edge. Matches PRD:241 semantics | source-shape |
| REQ-ID-18 | Built | `core/src/identity.ts`, `src/lib/verification.ts`, `src/lib/device-link.ts`, `src/lib/reattestation.ts` | `core/test/identity.test.ts`, `test/verification.test.ts`, `test/device-link.test.ts`, `test/reattestation.test.ts`  | | source-shape |
| REQ-ID-19 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-MON-01 | Built | `core/src/money.ts`, `scripts/lint-money.mjs` | `core/test/money.test.ts`  | | source-shape |
| REQ-MON-02 | Built | `core/src/money.ts`, `src/lib/expense-command.ts`, `src/App.svelte` | `core/test/money.test.ts`, `test/expense-command.test.ts`  | | source-shape |
| REQ-MON-03 | Built | `core/src/money.ts` | `core/test/money.test.ts`  | | source-shape |
| REQ-MON-04 | Built | `core/src/fold.ts`, `core/src/canonical.ts` | `core/test/properties.test.ts`  | | source-shape |
| REQ-MON-05 | Built | `core/src/types.ts`, `core/src/money.ts`, `src/lib/split-preservation.ts` | `core/test/money.test.ts`, `test/split-preservation.test.ts`  | | source-shape |
| REQ-MON-06 | Built | `src/lib/split-preservation.ts` | `test/split-preservation.test.ts`  | | source-shape |
| REQ-MON-07 | Built | `src/lib/events.ts`, `src/db/repo.ts`, `src/App.svelte` | `test/currency-onboarding.test.ts`  | | source-shape |
| REQ-MON-08 | Built | `core/src/types.ts`, `core/src/fold.ts`, `src/lib/multicurrency.ts` | `core/test/fold.test.ts`, `test/multicurrency.test.ts`, `test/phase5-money-acceptance.test.ts`  | | source-shape |
| REQ-MON-09 | Built | `src/lib/expense-display.ts`, `src/App.svelte` | `test/expense-display.test.ts`, `test/common-expense-ui.test.ts`  | | source-shape |
| REQ-MON-10 | Built | `core/src/fold.ts`, `src/lib/events.ts` | `core/test/fold.test.ts`, `test/expense-edit.test.ts`  | | source-shape |
| REQ-MON-11 | Built | `core/src/types.ts`, `core/src/fold.ts`, `src/lib/payers.ts` | `core/test/fold.test.ts`, `test/payers.test.ts`, `test/phase5-money-acceptance.test.ts`  | | source-shape |
| REQ-MON-12 | Built | `core/src/fold.ts`, `src/lib/freeze-policy.ts` | `core/test/fold.test.ts`, `test/freeze-policy.test.ts`  | | source-shape |
| REQ-MON-13 | Built | `core/src/types.ts`, `src/lib/events.ts`, `src/lib/expense-display.ts` | `test/expense-display.test.ts`  | | source-shape |
| REQ-MON-14 | Built | `core/src/money.ts` | `core/test/money.test.ts`  | | source-shape |
| REQ-MON-15 | Built | `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-MON-16 | Built | `core/src/types.ts`, `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-MON-17 | Built | `core/src/fold.ts`, `src/lib/expense-history.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts`, `test/expense-history.test.ts`  | | source-shape |
| REQ-MON-18 | Built | `core/src/money.ts` | `core/test/money.test.ts`  | | source-shape |
| REQ-MON-19 | Built | `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-SET-01 | Built | `core/src/settle.ts` | `core/test/settle.test.ts`  | | source-shape |
| REQ-SET-02 | Built | `src/App.svelte`, `src/lib/settlement-command.ts` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-SET-03 | Built | `core/src/fold.ts`, `core/src/settle.ts` | `core/test/fold.test.ts`, `core/test/settle.test.ts`  | | source-shape |
| REQ-SET-04 | Built | `core/src/fold.ts`, `src/lib/settlement-history.ts` | `core/test/fold.test.ts`, `test/settlement-history.test.ts`  | | source-shape |
| REQ-SET-05 | Built | `core/src/fold.ts`, `src/lib/settlement-command.ts` | `core/test/fold.test.ts`, `test/settlement-command.test.ts`  | | source-shape |
| REQ-SET-06 | Built | `core/src/fold.ts`, `src/lib/settlement-history.ts` | `core/test/fold.test.ts`, `test/settlement-history.test.ts`  | | rendered |
| REQ-SET-07 | Built | `core/src/fold.ts`, `src/lib/settlement-history.ts`, `src/App.svelte` | `test/settlement-history.test.ts`, `test/settlement-ui.test.ts`  | | source-shape |
| REQ-SET-08 | Built | `core/src/fold.ts`, `src/lib/settlement-command.ts`, `src/App.svelte` | `core/test/fold.test.ts`, `test/settlement-command.test.ts`, `test/settlement-ui.test.ts`  | | rendered |
| REQ-SET-09 | Built | `core/src/fold.ts`, `src/lib/verification.ts` | `core/test/fold.test.ts`, `test/verification.test.ts`  | | source-shape |
| REQ-SYN-01 | Built | `api/relay.ts` | `test/relay-api.test.ts`, `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-SYN-02 | Built | `src/relay/types.ts`, `src/relay/http.ts`, `src/relay/nostr.ts`, `src/relay/sync.ts` | `test/relay-create.test.ts`, `test/nostr-relay.test.ts`  | | source-shape |
| REQ-SYN-03 | Built | `src/crypto/envelope.ts` | `test/sync.integration.test.ts`, `test/export-security.test.ts`  | | source-shape |
| REQ-SYN-04 | Built | `src/crypto/group.ts`, `src/crypto/envelope.ts`, `src/relay/http.ts`, `src/relay/nostr.ts` | `test/export-security.test.ts`, `test/join-link.test.ts`  | | source-shape |
| REQ-SYN-05 | Built | `src/relay/sync.ts`, `src/config.ts` | `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-06 | Built | `src/db/repo.ts`, `src/relay/sync.ts` | `test/sync.integration.test.ts`, `test/sync-state.test.ts`  | | source-shape |
| REQ-SYN-07 | Built | `src/relay/sync.ts` | `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-08 | Built | `core/src/transport.ts`, `src/relay/sync.ts` | `core/test/transport.test.ts`, `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-09 | Built | `core/src/transport.ts`, `src/relay/sync.ts`, `src/relay/http.ts` | `core/test/transport.test.ts`, `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-10 | Built | `src/lib/sync-labels.ts` | `test/sync-labels.test.ts`, `test/sync-coverage.test.ts`  | | source-shape |
| REQ-SYN-11 | Built | `src/relay/diagnostics.ts`, `src/lib/relay-diagnostics.ts` | `test/relay-diagnostics.test.ts`, `test/relay-diagnostics-ui.test.ts`  | | source-shape |
| REQ-SYN-12 | Built | `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-SYN-13 | Built | `src/lib/durability.ts`, `src/lib/manual-fallback.ts`, `src/App.svelte` | `test/manual-fallback.test.ts`, `test/manual-fallback-ui.test.ts`  | | source-shape |
| REQ-SYN-14 | Built | `src/relay/sync.ts` | `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-15 | Built | `src/lib/sync-labels.ts`, `src/App.svelte` | `test/sync-labels.test.ts`, `test/sync-honesty-ui.test.ts`  | | source-shape |
| REQ-SYN-16 | Built | `src/lib/manual-fallback.ts`, `src/App.svelte` | `test/manual-fallback.test.ts`, `test/manual-fallback-ui.test.ts`  | | source-shape |
| REQ-SYN-17 | Built | `src/relay/nostr.ts`, `scripts/task0-retention.mjs` | `test/nostr-relay.test.ts`  | | source-shape |
| REQ-SYN-18 | Built | `core/src/identity.ts`, `src/relay/sync.ts` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-SYN-19 | Built | `core/src/transport.ts` | `core/test/transport.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-SYN-20 | Built | `core/src/fold.ts`, `core/src/transport.ts` | `core/test/properties.test.ts`, `core/test/transport.test.ts`  | | source-shape |
| REQ-SYN-21 | Built | `src/relay/sync.ts`, `src/relay/http.ts`, `src/relay/nostr.ts` | `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-22 | Built | `core/src/fold.ts`, `src/lib/freeze-policy.ts`, `src/App.svelte` | `core/test/properties.test.ts`, `test/freeze-policy.test.ts`, `test/protection-status-ui.test.ts`  | | source-shape |
| REQ-SYN-23 | Built | `src/relay/sync.ts`, `src/relay/http.ts`, `src/relay/nostr.ts` | `test/sync.integration.test.ts`, `test/relay-create.test.ts`  | | source-shape |
| REQ-SYN-24 | Built | `core/src/hlc.ts`, `core/src/transport.ts` | `core/test/hlc.test.ts`, `core/test/transport.test.ts`, `core/test/properties.test.ts`  | | source-shape |
| REQ-SYN-25 | Built | `src/crypto/envelope.ts`, `src/relay/sync.ts` | `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-26 | Built | `src/relay/sync.ts` | `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-27 | Built | `core/src/transport.ts`, `src/relay/sync.ts` | `core/test/transport.test.ts`, `test/sync.integration.test.ts`  | | source-shape |
| REQ-SYN-28 | Built | `scripts/task0-retention.mjs`, `src/relay/diagnostics.ts` | `test/relay-diagnostics.test.ts`, `test/config.test.ts`  | | source-shape |
| REQ-DUR-01 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/storage-persistence-ui.test.ts`, `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-DUR-02 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/pwa-install.test.ts`, `test/durability-prompts-ui.test.ts`  | | source-shape |
| REQ-DUR-03 | Partial | `src/lib/durability.ts` | `test/durability-prompts-ui.test.ts` | Ladder rungs 1/4 and the expense-count trigger (`expenseCount >= 3`) are unasserted; only session-count rungs 2–3 plus the dismissal cap are tested (`test/durability.test.ts:40`) | source-shape |
| REQ-DUR-04 | Built | `src/lib/durability.ts` | `test/durability-prompts-ui.test.ts`, `test/pwa-install.test.ts`  | | source-shape |
| REQ-DUR-05 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/protection-status-ui.test.ts`  | | source-shape |
| REQ-DUR-06 | Partial | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/durability.test.ts` | Recovery-before-render ordering is only source-shape containment (`if (joinBlocked) await runSync();`); no behavioural test asserts the sync attempt precedes rendering or that recovery completes | source-shape |
| REQ-DUR-07 | Built | `src/lib/durability.ts` | `test/export-prompt-ui.test.ts`, `test/durability-prompts-ui.test.ts`  | | source-shape |
| REQ-DUR-08 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/durability.test.ts`, `test/durability-prompts-ui.test.ts`  | | source-shape |
| REQ-DUR-09 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/manual-fallback-ui.test.ts` | Import-as-primary asserted at `test/manual-fallback-ui.test.ts:32` (`primary-link` + `Import JSON` in the recovery panel), not in the previously cited durability tests | rendered |
| REQ-DUR-10 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/manual-fallback-ui.test.ts` | First-join vs eviction distinction asserted at `test/manual-fallback-ui.test.ts:32` (`recoveryMode === "evicted"` headings, primary-link import promoted only when evicted) | rendered |
| REQ-SEC-01 | Built | `src/crypto/claim.ts`, `src/lib/verification.ts`, `core/src/fold.ts` | `test/claim-crypto.test.ts`, `test/verification.test.ts`, `core/test/fold.test.ts` | Phase-4 verify half received an assertion-level audit in CR-010: real WebCrypto signature clears pending (`test/verification.test.ts:24`), cross-tag replay leaves it unconfirmed and cash-unconfirmable (:47), contested payee confirmations stay pending with `contested-settlement-confirmation` (`core/test/fold.test.ts:237`), invalid signatures ignored (:253), confirmation pid must match literal payee (:271) | source-shape |
| REQ-SEC-02 | Built | `src/lib/device-link.ts`, `core/src/identity.ts`, `core/src/fold.ts` | `test/device-link.test.ts`, `test/verification.test.ts`  | | source-shape |
| REQ-SEC-03 | Built | `src/crypto/claim.ts`, `src/lib/verification.ts` | `test/claim-crypto.test.ts`, `test/verification.test.ts`  | | source-shape |
| REQ-SEC-04 | Built | `src/crypto/claim.ts`, `src/lib/verification.ts`, `src/lib/device-link.ts` | `test/claim-crypto.test.ts`, `test/verification.test.ts`  | | source-shape |
| REQ-SEC-05 | Built | `src/lib/durability.ts`, `src/lib/archive.ts` | `test/export-security.test.ts`, `test/identity-backup-ui.test.ts`  | | source-shape |
| REQ-SEC-06 | Built | `core/src/identity.ts`, `src/lib/reattestation.ts`, `core/src/fold.ts` | `test/verification.test.ts`, `test/reattestation.test.ts`  | | source-shape |
| REQ-SEC-07 | Built | `core/src/identity.ts`, `src/lib/participants.ts`, `src/App.svelte` | `test/participants.test.ts`, `test/participant-claim-ui.test.ts`  | | source-shape |
| REQ-SEC-08 | Built | `core/src/fold.ts`, `src/lib/verification.ts` | `core/test/identity.test.ts`, `test/verification.test.ts`  | | source-shape |
| REQ-SEC-09 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/export-security.test.ts`, `test/identity-backup-ui.test.ts`  | | source-shape |
| REQ-PLT-01 | Built | `vite.config.ts`, `vercel.json` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-02 | Built | `public/manifest.webmanifest`, `index.html`, `src/lib/durability.ts`, `src/App.svelte` | `test/pwa-install.test.ts`  | | source-shape |
| REQ-PLT-03 | Built | `public/sw.js`, `src/main.ts` | `test/service-worker.test.ts`, `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-04 | Built | `public/sw.js`, `src/main.ts` | `test/service-worker.test.ts`, `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-05 | Built | `src/db/repo.ts` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-06 | Built | `vite.config.ts`, `tsconfig.json` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-07 | Built | `api/relay.ts` | `test/relay-api.test.ts`, `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-08 | Built | `api/relay.ts` | `test/relay-api.test.ts`, `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-PLT-09 | Built | `src/relay/sync.ts`, `src/lib/lifecycle.ts` | `test/lifecycle.test.ts`, `test/sync.integration.test.ts`  | | source-shape |
| REQ-LIF-01 | Built | `core/src/fold.ts`, `src/lib/lifecycle.ts` | `test/lifecycle.test.ts`, `test/lifecycle-ui.test.ts`  | | source-shape |
| REQ-LIF-02 | Built | `src/lib/archive.ts`, `src/lib/lifecycle.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/lifecycle.test.ts`  | | source-shape |
| REQ-LIF-03 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/phase5-archive-acceptance.test.ts`  | | source-shape |
| REQ-LIF-04 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/phase5-archive-acceptance.test.ts`  | | source-shape |
| REQ-LIF-05 | Built | `src/lib/lifecycle.ts`, `src/relay/sync.ts`, `src/App.svelte` | `test/lifecycle.test.ts`, `test/lifecycle-ui.test.ts`  | | source-shape |
| REQ-LIF-06 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/lifecycle-ui.test.ts`  | | source-shape |
| REQ-LIF-07 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/lifecycle-ui.test.ts`  | | source-shape |
| REQ-UX-01 | Built | `src/lib/expense-command.ts`, `src/App.svelte` | `test/expense-workflow-ui.test.ts`, `test/common-expense-ui.test.ts`  | | source-shape |
| REQ-UX-02 | Built | `src/App.svelte`, `src/lib/join-link.ts` | `test/landing-ui.test.ts`, `test/participant-claim-ui.test.ts`  | | source-shape |
| REQ-UX-03 | Built | `src/lib/events.ts`, `src/App.svelte` | `test/currency-onboarding.test.ts`  | | source-shape |
| REQ-UX-04 | Built | `src/App.svelte` | `test/empty-state-ui.test.ts`  | | source-shape |
| REQ-UX-05 | Built | `src/App.svelte`, `src/main.ts`, `index.html` | `test/platform-boundaries.test.ts`  | | source-shape |
| REQ-UX-06 | Built | `src/lib/sync-labels.ts`, `src/App.svelte` | `test/sync-honesty-ui.test.ts`, `test/sync-labels.test.ts`  | | source-shape |

## Verification

Five rows marked `Built`, re-evidenced with actual grep output on 2026-08-24:

### 1. MON-01 — integer minor units, deterministic allocation
```
$ rg -n "export function allocate\b" core/src/money.ts
10:export function allocate(total: bigint, weights: bigint[], eventId: string, pids: string[]): bigint[] {

$ rg -n "allocate\(1000n" core/test/money.test.ts
6:    expect(allocate(1000n, [1n, 1n, 1n], "event-1", ["a", "b", "c"]).reduce((a, b) => a + b, 0n)).toBe(1000n);
7:    expect(allocate(1000n, [1n, 1n, 1n], "event-1", ["a", "b", "c"]).sort((a, b) => Number(b - a))).toEqual([334n, 333n, 333n]);
```

### 2. SYN-12 — fold determinism under log reordering
```
$ rg -n "^export function fold" core/src/fold.ts
127:export function fold(events: Event[], opts: FoldOptions, ctx?: VerificationContext): State {

$ rg -n -A2 "keeps folded state identical across 1,000" core/test/properties.test.ts
26:  it("keeps folded state identical across 1,000 deterministic shuffles", () => {
27-    const events: Event[] = [
28-      base("ParticipantAdded", { id: "participant-alice", hlc: hlc(1), pid: "alice", name: "Alice" } as never),
```

### 3. SEC-03 — claim algorithm fallback when Ed25519 is unavailable
```
$ rg -n -A7 "export async function pickAlg" src/crypto/claim.ts
12:export async function pickAlg(): Promise<ClaimAlg> {
13-  try {
14-    await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
15-    return "ed25519";
16-  } catch {
17-    return "ecdsa-p256";
18-  }
19-}

$ rg -n "pickAlg|ecdsa-p256" test/claim-crypto.test.ts
2:import { pickAlg } from "@/crypto/claim";
12:    await expect(pickAlg()).resolves.toBe("ecdsa-p256");
```

### 4. LIF-04 — archive exports the ledger automatically
```
$ rg -n 'makeEvent\(f, "GroupArchived"|download-export|downloadExport\(undefined' src/App.svelte
800:    const archiveEvent = makeEvent(f, "GroupArchived", {
805:      if (action === "download-export") {
806:        downloadExport(undefined, archivedExportGroup);

$ rg -n -A5 'const archive = makeEvent' test/phase5-archive-acceptance.test.ts
35:    const archive = makeEvent(factory, "GroupArchived", { outstanding });
36:    const archivedTrip = await appendEvents(group.groupId, [archive]);
37:
38:    await resetRepositoryForTests(`phase5-archive-restore-${crypto.randomUUID()}`);
39:    const restored = await replaceFromExport(createExport(archivedTrip));
40:    const restoredArchive = latestArchiveEvent(restored.events);
```

### 5. SYN-24 — hybrid logical clock never moves backwards
```
$ rg -n -A3 "^export function receive" core/src/hlc.ts
5:export function receive(local: HLC, remote: HLC, now: number): HLC {
6-  const wall = Math.max(now, local.wall, remote.wall);
7-  let ctr = 0;
8-  if (wall === local.wall && wall === remote.wall) ctr = Math.max(local.ctr, remote.ctr) + 1;

$ rg -n -A2 "never decreases when the local clock moves backwards" core/test/hlc.test.ts
6:  it("never decreases when the local clock moves backwards", () => {
7-    expect(receive(hlc(1000, 2, "local"), hlc(900, 0, "remote"), 800)).toEqual({ wall: 1000, ctr: 3, dev: "local" });
8-  });
```

## CR-010 semantic re-audit (2026-08-24)

Scope: every row whose PRD phase column is ≥ 3. Count stated exactly: **36 rows carry a purely numeric
phase ≥ 3** (12× phase 3: DUR-01..10, SEC-05, SEC-09; 16× phase 4: ID-12/13/14/16/17/19, MON-17, SET-04..09,
SEC-02/06/08; 8× phase 5: MON-08, LIF-01..07). SEC-01 (`2 (mint) / 4 (verify)`) is a 37th register row
**outside that set**; its phase-4 verify half was assertion-level audited as well (36 audited units across
37 register rows; the CR-010 report's "36 including SEC-01" phrasing conflated these two counts — corrected
here per CR-011). For each unit the requirement text and the cited test assertions were read;
the question was whether the test ASSERTS the requirement or merely touches the same area.

Result at audit time: **33 Built / 3 Partial / 0 Not started.** ID-12 was subsequently returned to Built
by CR-011 Task 5 (see below); current standing: **34 Built / 2 Partial**.

- **DUR-03 → Partial.** `test/durability.test.ts:40` asserts rungs 2–3 via session counts and the
  four-dismissal retirement, but no test exercises rung 1, rung 4 (`daysSinceLastSeen >= 7d`), or the
  `expenseCount >= 3` trigger branch in `src/lib/durability.ts:69`.
- **DUR-06 → Partial.** `test/join-recovery-boundary.test.ts` pins source shape (`await runSync()` on
  joinBlocked, waiting panel replacing empty roster) but nothing asserts recovery is attempted BEFORE
  rendering or that recovery actually completes end-to-end.
- **ID-12 → Partial (closed by CR-011 Task 5).** The fold-side duplicate anomaly is asserted
  (`core/test/fold.test.ts:367`) and `src/App.svelte:1409` renders its banner, but no test covered that
  banner for `possible-duplicate-participants`; `test/reconciliation-ui.test.ts` only covered the
  `distinct-participants-merged` contradiction variant. `test/duplicate-banner-ui.test.ts` now asserts it.
- **SEC-01 phase-4 verify half — Built, assertion-level evidence:** real WebCrypto signature clears pending
  (`test/verification.test.ts:24`), cross-tag replay stays unconfirmed (:47), contested payee confirmations
  stay pending (`core/test/fold.test.ts:237`), invalid signatures ignored (:253), confirmation pid must match
  the literal pre-merge payee (:271).

Representative assertion-level evidence for rows kept Built (all verified verbatim during this audit):

- SET-09 contested confirmations hold pending: `core/test/fold.test.ts` "keeps contested settlement
  confirmations pending" asserts `pending === true`, `confirmed === false`, `contestedConfirmation === true`
  plus `unverified-reclaim` anomaly under a second unpaired claim.
- SEC-02 real-signature delegation: `test/verification.test.ts:125` proves WebCrypto-signed `DeviceLinked`
  authority confirms while an impostor same-participant claim leaves the settlement `pending` with
  `contestedConfirmation`.
- SEC-05 export split: `test/export-security.test.ts:69` asserts no `identities`/`secretB64`/`claimSk`/
  `private-d` in `TripLedgerExport`, with `DeviceIdentityBackup` separately carrying `claimSkJwk` (:112).
- LIF-05 archived read-only + polling stop: `test/lifecycle.test.ts:77` stops polling when archived/hidden;
  `test/lifecycle-ui.test.ts:10` keeps archived trips readable but read-only.
- MON-08 frozen rate: `test/multicurrency.test.ts:13` freezes rate at entry; `test/phase5-money-acceptance.test.ts`
  round-trips the rate-bearing event through export/restore.
- DUR-09/10 citation corrected to `test/manual-fallback-ui.test.ts:32`, which carries the actual assertions
  (primary-link import promotion, evicted vs first-join headings); the previously cited durability tests do not.

No row was upgraded without new evidence; no evidence was fabricated. Rows outside this scope retain their
CR-009 existence-level verification.