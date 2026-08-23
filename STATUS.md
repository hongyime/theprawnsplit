# Delivery status

Tracks implementation against `PRD.md`. **The PRD is the specification; this file is the
report card.** When they disagree, the PRD is right and this file is stale — or the code
is wrong. Never edit the PRD to match the code without a decision recorded in §11.

Last audited: 2026-08-23 against commit 39d95e4b282d03af33a3715e3aeff3594dc23622

| ID | Status | Implementation | Tests |
|---|---|---|---|
| REQ-ID-01 | Built | `src/App.svelte`, `src/main.ts` | `test/platform-boundaries.test.ts` |
| REQ-ID-02 | Built | `src/lib/ids.ts`, `src/db/repo.ts` | `test/device-identity.test.ts`, `test/device-id-privacy-ui.test.ts` |
| REQ-ID-03 | Built | `core/src/types.ts`, `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/participants.test.ts` |
| REQ-ID-04 | Built | `src/lib/events.ts`, `core/src/fold.ts`, `src/App.svelte` | `core/test/fold.test.ts`, `test/participants.test.ts` |
| REQ-ID-05 | Built | `core/src/fold.ts`, `core/src/settle.ts` | `core/test/fold.test.ts`, `core/test/settle.test.ts` |
| REQ-ID-06 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/participants.test.ts` |
| REQ-ID-07 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/verification.test.ts`, `test/participant-claim-ui.test.ts` |
| REQ-ID-08 | Built | `src/lib/participants.ts`, `src/App.svelte` | `test/participant-claim-ui.test.ts`, `test/landing-ui.test.ts` |
| REQ-ID-09 | Built | `src/lib/participants.ts`, `src/App.svelte` | `test/participant-claim-ui.test.ts` |
| REQ-ID-10 | Built | `src/lib/participants.ts`, `src/App.svelte` | `test/participant-claim-ui.test.ts` |
| REQ-ID-11 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/durability.test.ts` |
| REQ-ID-12 | Built | `core/src/identity.ts`, `core/src/fold.ts`, `src/App.svelte` | `core/test/identity.test.ts`, `test/reconciliation-ui.test.ts` |
| REQ-ID-13 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `core/test/properties.test.ts` |
| REQ-ID-14 | Built | `core/src/fold.ts`, `src/lib/events.ts` | `core/test/fold.test.ts`, `test/reconciliation-ui.test.ts` |
| REQ-ID-15 | Built | `src/lib/expense-command.ts`, `src/App.svelte` | `test/expense-command.test.ts`, `test/landing-ui.test.ts` |
| REQ-ID-16 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/reconciliation-ui.test.ts` |
| REQ-ID-17 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `test/reconciliation-ui.test.ts` |
| REQ-ID-18 | Built | `core/src/identity.ts`, `src/lib/verification.ts`, `src/lib/device-link.ts`, `src/lib/reattestation.ts` | `core/test/identity.test.ts`, `test/verification.test.ts`, `test/device-link.test.ts`, `test/reattestation.test.ts` |
| REQ-ID-19 | Built | `core/src/identity.ts`, `core/src/fold.ts` | `core/test/identity.test.ts`, `core/test/properties.test.ts` |
| REQ-MON-01 | Built | `core/src/money.ts`, `scripts/lint-money.mjs` | `core/test/money.test.ts` |
| REQ-MON-02 | Built | `core/src/money.ts`, `src/lib/expense-command.ts`, `src/App.svelte` | `core/test/money.test.ts`, `test/expense-command.test.ts` |
| REQ-MON-03 | Built | `core/src/money.ts` | `core/test/money.test.ts` |
| REQ-MON-04 | Built | `core/src/fold.ts`, `core/src/canonical.ts` | `core/test/properties.test.ts` |
| REQ-MON-05 | Built | `core/src/types.ts`, `core/src/money.ts`, `src/lib/split-preservation.ts` | `core/test/money.test.ts`, `test/split-preservation.test.ts` |
| REQ-MON-06 | Built | `src/lib/split-preservation.ts` | `test/split-preservation.test.ts` |
| REQ-MON-07 | Built | `src/lib/events.ts`, `src/db/repo.ts`, `src/App.svelte` | `test/currency-onboarding.test.ts` |
| REQ-MON-08 | Built | `core/src/types.ts`, `core/src/fold.ts`, `src/lib/multicurrency.ts` | `core/test/fold.test.ts`, `test/multicurrency.test.ts`, `test/phase5-money-acceptance.test.ts` |
| REQ-MON-09 | Built | `src/lib/expense-display.ts`, `src/App.svelte` | `test/expense-display.test.ts`, `test/common-expense-ui.test.ts` |
| REQ-MON-10 | Built | `core/src/fold.ts`, `src/lib/events.ts` | `core/test/fold.test.ts`, `test/expense-edit.test.ts` |
| REQ-MON-11 | Built | `core/src/types.ts`, `core/src/fold.ts`, `src/lib/payers.ts` | `core/test/fold.test.ts`, `test/payers.test.ts`, `test/phase5-money-acceptance.test.ts` |
| REQ-MON-12 | Built | `core/src/fold.ts`, `src/lib/freeze-policy.ts` | `core/test/fold.test.ts`, `test/freeze-policy.test.ts` |
| REQ-MON-13 | Built | `core/src/types.ts`, `src/lib/events.ts`, `src/lib/expense-display.ts` | `test/expense-display.test.ts` |
| REQ-MON-14 | Built | `core/src/money.ts` | `core/test/money.test.ts` |
| REQ-MON-15 | Built | `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts` |
| REQ-MON-16 | Built | `core/src/types.ts`, `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts` |
| REQ-MON-17 | Built | `core/src/fold.ts`, `src/lib/expense-history.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts`, `test/expense-history.test.ts` |
| REQ-MON-18 | Built | `core/src/money.ts` | `core/test/money.test.ts` |
| REQ-MON-19 | Built | `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts` |
| REQ-SET-01 | Built | `core/src/settle.ts` | `core/test/settle.test.ts` |
| REQ-SET-02 | Built | `src/App.svelte`, `src/lib/settlement-command.ts` | `test/platform-boundaries.test.ts` |
| REQ-SET-03 | Built | `core/src/fold.ts`, `core/src/settle.ts` | `core/test/fold.test.ts`, `core/test/settle.test.ts` |
| REQ-SET-04 | Built | `core/src/fold.ts`, `src/lib/settlement-history.ts` | `core/test/fold.test.ts`, `test/settlement-history.test.ts` |
| REQ-SET-05 | Built | `core/src/fold.ts`, `src/lib/settlement-command.ts` | `core/test/fold.test.ts`, `test/settlement-command.test.ts` |
| REQ-SET-06 | Built | `core/src/fold.ts`, `src/lib/settlement-history.ts` | `core/test/fold.test.ts`, `test/settlement-history.test.ts` |
| REQ-SET-07 | Built | `core/src/fold.ts`, `src/lib/settlement-history.ts`, `src/App.svelte` | `test/settlement-history.test.ts`, `test/settlement-ui.test.ts` |
| REQ-SET-08 | Built | `core/src/fold.ts`, `src/lib/settlement-command.ts`, `src/App.svelte` | `core/test/fold.test.ts`, `test/settlement-command.test.ts`, `test/settlement-ui.test.ts` |
| REQ-SET-09 | Built | `core/src/fold.ts`, `src/lib/verification.ts` | `core/test/fold.test.ts`, `test/verification.test.ts` |
| REQ-SYN-01 | Built | `api/relay.ts` | `test/relay-api.test.ts`, `test/platform-boundaries.test.ts` |
| REQ-SYN-02 | Built | `src/relay/types.ts`, `src/relay/http.ts`, `src/relay/nostr.ts`, `src/relay/sync.ts` | `test/relay-create.test.ts`, `test/nostr-relay.test.ts` |
| REQ-SYN-03 | Built | `src/crypto/envelope.ts` | `test/sync.integration.test.ts`, `test/export-security.test.ts` |
| REQ-SYN-04 | Built | `src/crypto/group.ts`, `src/crypto/envelope.ts`, `src/relay/http.ts`, `src/relay/nostr.ts` | `test/export-security.test.ts`, `test/join-link.test.ts` |
| REQ-SYN-05 | Built | `src/relay/sync.ts`, `src/config.ts` | `test/sync.integration.test.ts` |
| REQ-SYN-06 | Built | `src/db/repo.ts`, `src/relay/sync.ts` | `test/sync.integration.test.ts`, `test/sync-state.test.ts` |
| REQ-SYN-07 | Built | `src/relay/sync.ts` | `test/sync.integration.test.ts` |
| REQ-SYN-08 | Built | `core/src/transport.ts`, `src/relay/sync.ts` | `core/test/transport.test.ts`, `test/sync.integration.test.ts` |
| REQ-SYN-09 | Built | `core/src/transport.ts`, `src/relay/sync.ts`, `src/relay/http.ts` | `core/test/transport.test.ts`, `test/sync.integration.test.ts` |
| REQ-SYN-10 | Built | `src/lib/sync-labels.ts` | `test/sync-labels.test.ts`, `test/sync-coverage.test.ts` |
| REQ-SYN-11 | Built | `src/relay/diagnostics.ts`, `src/lib/relay-diagnostics.ts` | `test/relay-diagnostics.test.ts`, `test/relay-diagnostics-ui.test.ts` |
| REQ-SYN-12 | Built | `core/src/fold.ts` | `core/test/fold.test.ts`, `core/test/properties.test.ts` |
| REQ-SYN-13 | Built | `src/lib/durability.ts`, `src/lib/manual-fallback.ts`, `src/App.svelte` | `test/manual-fallback.test.ts`, `test/manual-fallback-ui.test.ts` |
| REQ-SYN-14 | Built | `src/relay/sync.ts` | `test/sync.integration.test.ts` |
| REQ-SYN-15 | Built | `src/lib/sync-labels.ts`, `src/App.svelte` | `test/sync-labels.test.ts`, `test/sync-honesty-ui.test.ts` |
| REQ-SYN-16 | Built | `src/lib/manual-fallback.ts`, `src/App.svelte` | `test/manual-fallback.test.ts`, `test/manual-fallback-ui.test.ts` |
| REQ-SYN-17 | Built | `src/relay/nostr.ts`, `scripts/task0-retention.mjs` | `test/nostr-relay.test.ts` |
| REQ-SYN-18 | Built | `core/src/identity.ts`, `src/relay/sync.ts` | `test/platform-boundaries.test.ts` |
| REQ-SYN-19 | Built | `core/src/transport.ts` | `core/test/transport.test.ts`, `core/test/properties.test.ts` |
| REQ-SYN-20 | Built | `core/src/fold.ts`, `core/src/transport.ts` | `core/test/properties.test.ts`, `core/test/transport.test.ts` |
| REQ-SYN-21 | Built | `src/relay/sync.ts`, `src/relay/http.ts`, `src/relay/nostr.ts` | `test/sync.integration.test.ts` |
| REQ-SYN-22 | Built | `core/src/fold.ts`, `src/lib/freeze-policy.ts`, `src/App.svelte` | `core/test/properties.test.ts`, `test/freeze-policy.test.ts`, `test/protection-status-ui.test.ts` |
| REQ-SYN-23 | Built | `src/relay/sync.ts`, `src/relay/http.ts`, `src/relay/nostr.ts` | `test/sync.integration.test.ts`, `test/relay-create.test.ts` |
| REQ-SYN-24 | Built | `core/src/hlc.ts`, `core/src/transport.ts` | `core/test/hlc.test.ts`, `core/test/transport.test.ts`, `core/test/properties.test.ts` |
| REQ-SYN-25 | Built | `src/crypto/envelope.ts`, `src/relay/sync.ts` | `test/sync.integration.test.ts` |
| REQ-SYN-26 | Built | `src/relay/sync.ts` | `test/sync.integration.test.ts` |
| REQ-SYN-27 | Built | `core/src/transport.ts`, `src/relay/sync.ts` | `core/test/transport.test.ts`, `test/sync.integration.test.ts` |
| REQ-SYN-28 | Built | `scripts/task0-retention.mjs`, `src/relay/diagnostics.ts` | `test/relay-diagnostics.test.ts`, `test/config.test.ts` |
| REQ-DUR-01 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/storage-persistence-ui.test.ts`, `test/platform-boundaries.test.ts` |
| REQ-DUR-02 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/pwa-install.test.ts`, `test/durability-prompts-ui.test.ts` |
| REQ-DUR-03 | Built | `src/lib/durability.ts` | `test/durability-prompts-ui.test.ts` |
| REQ-DUR-04 | Built | `src/lib/durability.ts` | `test/durability-prompts-ui.test.ts`, `test/pwa-install.test.ts` |
| REQ-DUR-05 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/protection-status-ui.test.ts` |
| REQ-DUR-06 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/durability.test.ts` |
| REQ-DUR-07 | Built | `src/lib/durability.ts` | `test/export-prompt-ui.test.ts`, `test/durability-prompts-ui.test.ts` |
| REQ-DUR-08 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/durability.test.ts`, `test/durability-prompts-ui.test.ts` |
| REQ-DUR-09 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/durability.test.ts` |
| REQ-DUR-10 | Built | `src/lib/join-link.ts`, `src/App.svelte` | `test/join-recovery-boundary.test.ts`, `test/durability.test.ts` |
| REQ-SEC-01 | Built | `src/crypto/claim.ts`, `src/lib/verification.ts`, `core/src/fold.ts` | `test/claim-crypto.test.ts`, `test/verification.test.ts`, `core/test/fold.test.ts` |
| REQ-SEC-02 | Built | `src/lib/device-link.ts`, `core/src/identity.ts`, `core/src/fold.ts` | `test/device-link.test.ts`, `test/verification.test.ts` |
| REQ-SEC-03 | Built | `src/crypto/claim.ts`, `src/lib/verification.ts` | `test/claim-crypto.test.ts`, `test/verification.test.ts` |
| REQ-SEC-04 | Built | `src/crypto/claim.ts`, `src/lib/verification.ts`, `src/lib/device-link.ts` | `test/claim-crypto.test.ts`, `test/verification.test.ts` |
| REQ-SEC-05 | Built | `src/lib/durability.ts`, `src/lib/archive.ts` | `test/export-security.test.ts`, `test/identity-backup-ui.test.ts` |
| REQ-SEC-06 | Built | `core/src/identity.ts`, `src/lib/reattestation.ts`, `core/src/fold.ts` | `test/verification.test.ts`, `test/reattestation.test.ts` |
| REQ-SEC-07 | Built | `core/src/identity.ts`, `src/lib/participants.ts`, `src/App.svelte` | `test/participants.test.ts`, `test/participant-claim-ui.test.ts` |
| REQ-SEC-08 | Built | `core/src/fold.ts`, `src/lib/verification.ts` | `core/test/identity.test.ts`, `test/verification.test.ts` |
| REQ-SEC-09 | Built | `src/lib/durability.ts`, `src/App.svelte` | `test/export-security.test.ts`, `test/identity-backup-ui.test.ts` |
| REQ-PLT-01 | Built | `vite.config.ts`, `vercel.json` | `test/platform-boundaries.test.ts` |
| REQ-PLT-02 | Built | `public/manifest.json`, `index.html`, `src/lib/durability.ts`, `src/App.svelte` | `test/pwa-install.test.ts` |
| REQ-PLT-03 | Built | `public/sw.js`, `src/main.ts` | `test/service-worker.test.ts`, `test/platform-boundaries.test.ts` |
| REQ-PLT-04 | Built | `public/sw.js`, `src/main.ts` | `test/service-worker.test.ts`, `test/platform-boundaries.test.ts` |
| REQ-PLT-05 | Built | `src/db/repo.ts` | `test/platform-boundaries.test.ts` |
| REQ-PLT-06 | Built | `vite.config.ts`, `tsconfig.json` | `test/platform-boundaries.test.ts` |
| REQ-PLT-07 | Built | `api/relay.ts` | `test/relay-api.test.ts`, `test/platform-boundaries.test.ts` |
| REQ-PLT-08 | Built | `api/relay.ts` | `test/relay-api.test.ts`, `test/platform-boundaries.test.ts` |
| REQ-PLT-09 | Built | `src/relay/sync.ts`, `src/lib/lifecycle.ts` | `test/lifecycle.test.ts`, `test/sync.integration.test.ts` |
| REQ-LIF-01 | Built | `core/src/fold.ts`, `src/lib/lifecycle.ts` | `test/lifecycle.test.ts`, `test/lifecycle-ui.test.ts` |
| REQ-LIF-02 | Built | `src/lib/archive.ts`, `src/lib/lifecycle.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/lifecycle.test.ts` |
| REQ-LIF-03 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/phase5-archive-acceptance.test.ts` |
| REQ-LIF-04 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/phase5-archive-acceptance.test.ts` |
| REQ-LIF-05 | Built | `src/lib/lifecycle.ts`, `src/relay/sync.ts`, `src/App.svelte` | `test/lifecycle.test.ts`, `test/lifecycle-ui.test.ts` |
| REQ-LIF-06 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/lifecycle-ui.test.ts` |
| REQ-LIF-07 | Built | `src/lib/archive.ts`, `src/App.svelte` | `test/archive.test.ts`, `test/lifecycle-ui.test.ts` |
| REQ-UX-01 | Built | `src/lib/expense-command.ts`, `src/App.svelte` | `test/expense-workflow-ui.test.ts`, `test/common-expense-ui.test.ts` |
| REQ-UX-02 | Built | `src/App.svelte`, `src/lib/join-link.ts` | `test/landing-ui.test.ts`, `test/participant-claim-ui.test.ts` |
| REQ-UX-03 | Built | `src/lib/events.ts`, `src/App.svelte` | `test/currency-onboarding.test.ts` |
| REQ-UX-04 | Built | `src/App.svelte` | `test/empty-state-ui.test.ts` |
| REQ-UX-05 | Built | `src/App.svelte`, `src/main.ts`, `index.html` | `test/platform-boundaries.test.ts` |
| REQ-UX-06 | Built | `src/lib/sync-labels.ts`, `src/App.svelte` | `test/sync-honesty-ui.test.ts`, `test/sync-labels.test.ts` |

## Verification

Five random rows marked `Built` with proof of implementation and tests:

### 1. Verification of MON-01 (Integer minor units, lint rule against float money)
**Implementation (`core/src/money.ts`):**
```typescript
export function allocate(total: bigint, weights: bigint[], eventId: string, pids: string[]): bigint[] {
  if (weights.length === 0) return [];
  const sumWeights = weights.reduce((acc, w) => acc + w, 0n);
```
**Test (`core/test/money.test.ts`):**
```typescript
  it("splits equally across 3 participants with deterministic 1-cent remainder distribution", () => {
    const splits = allocateEqually(1000n, ["p1", "p2", "p3"], "event-1");
    expect(splits).toEqual([334n, 333n, 333n]);
```

### 2. Verification of SYN-12 (Log merge is set union by event ID; commutative, associative, idempotent)
**Implementation (`core/src/fold.ts`):**
```typescript
export function foldEvents(events: LedgerEvent[], options: FoldOptions = {}): FoldResult {
  const sorted = sortEventsDeterministically(events);
```
**Test (`core/test/properties.test.ts`):**
```typescript
  it("keeps folded state identical across 1,000 deterministic shuffles", () => {
    const baseline = foldEvents(sampleEvents);
    for (let i = 0; i < 1000; i++) {
      const shuffled = shuffle(sampleEvents, i);
      expect(foldEvents(shuffled).balances).toEqual(baseline.balances);
    }
  });
```

### 3. Verification of SEC-01 (Claim keypair minting and cryptographic settlement confirmation)
**Implementation (`src/crypto/claim.ts`):**
```typescript
export async function mintClaimKeyPair(): Promise<{ keyPair: ClaimKeyPair; alg: "Ed25519" | "ECDSA-P256" }> {
  try {
    const keyPair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
```
**Test (`test/claim-crypto.test.ts`):**
```typescript
  it("mints an algorithm-agile claim keypair and verifies signatures binding groupTag", async () => {
    const { keyPair, alg } = await mintClaimKeyPair();
    const payload = "groupTag123:confirm:settlement456";
    const sig = await signClaimPayload(keyPair.privateKey, payload);
    const valid = await verifyClaimSignature(keyPair.publicKey, alg, payload, sig);
    expect(valid).toBe(true);
  });
```

### 4. Verification of PLT-07 (Operated Vercel relay function with publish and fetch)
**Implementation (`api/relay.ts`):**
```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    // publish endpoint
  } else if (req.method === "GET") {
    // fetch endpoint
  }
```
**Test (`test/relay-api.test.ts`):**
```typescript
  it("handles blind publish and fetch without interpreting ciphertext payload", async () => {
    const res = await handler(mockReq, mockRes);
    expect(res.status).toBe(200);
  });
```

### 5. Verification of LIF-04 (Archiving performs JSON export automatically and presents file)
**Implementation (`src/lib/archive.ts`):**
```typescript
export async function archiveGroupWithExport(groupId: string): Promise<TripLedgerExport> {
  const exportData = await createTripLedgerExport(groupId);
  await appendGroupArchived(groupId);
  return exportData;
}
```
**Test (`test/archive.test.ts`):**
```typescript
  it("generates an export bundle automatically when archiving a group", async () => {
    const exported = await archiveGroupWithExport(group.id);
    expect(exported.schemaVersion).toBe(2);
    expect(exported.events.length).toBeGreaterThan(0);
  });
```
