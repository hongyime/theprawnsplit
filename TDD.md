# ThePrawnSplit  — Technical Design Document
 
**Version:** 1.0
**Companion to:** `ThePrawnSplit -prd-v1.md` v1.7
**Scope:** how to build it. The PRD says what and why; requirement IDs (`REQ-*`) refer to it.
 
---
 
## 0. Read this first
 
**There is no application secret.** No API key authenticates users, no token authorises a
ledger write, no server holds credentials that protect your data. Security comes entirely
from `groupSecret` — 32 random bytes generated in the browser, living in the URL fragment
and IndexedDB, never transmitted to any server (REQ-SYN-04).
 
The only secret in the environment is the **Upstash token**, and it protects the relay's
storage bill, not your ledger. The relay stores ciphertext it cannot read (REQ-PLT-08).
 
If you find yourself adding an auth secret, stop — you are re-introducing accounts (D-01).
 
---
 
## 1. Repository layout
 
Single Vercel project. `core/` is the Phase 0 deliverable and has zero app dependencies.
 
```
ThePrawnSplit /
├── core/                       # PHASE 0 — pure functions, no I/O, no DOM
│   ├── src/
│   │   ├── types.ts            # §8.1 event schema
│   │   ├── money.ts            # allocate(), fnv1a()          REQ-MON-03/14/18
│   │   ├── settle.ts           # greedySettlement()           REQ-SET-01
│   │   ├── hlc.ts              # receive(), admissionGate()   REQ-SYN-24
│   │   ├── identity.ts         # buildDSU(), authorisedKeys() REQ-ID-13, REQ-SEC-08
│   │   ├── fold.ts             # fold(Event[]) -> State       §8.3, §8.5
│   │   └── index.ts
│   ├── test/
│   │   ├── money.test.ts       # §16.1
│   │   ├── settle.test.ts
│   │   ├── hlc.test.ts         # includes the 8-hour-gap regression
│   │   ├── properties.test.ts  # §16.2  fast-check
│   │   └── adversarial.test.ts # §16.2.1 one test per attack
│   ├── package.json
│   └── vitest.config.ts
│
├── src/                        # PHASE 1+ — the PWA
│   ├── main.ts
│   ├── App.svelte
│   ├── db/
│   │   ├── schema.ts           # IndexedDB stores
│   │   └── repo.ts             # read/write, imports core/fold
│   ├── crypto/
│   │   ├── group.ts            # groupSecret, groupTag, groupKey
│   │   ├── envelope.ts         # AES-GCM encrypt/decrypt
│   │   └── claim.ts            # Ed25519 / P-256 with feature detection
│   ├── relay/
│   │   ├── types.ts            # Relay interface (PRD §8.4)
│   │   ├── nostr.ts            # NostrRelay adapter
│   │   ├── http.ts             # HttpRelay adapter (our Vercel fn)
│   │   └── sync.ts             # quorum, outbox, version vectors
│   ├── ui/
│   └── sw.ts                   # service worker
│
├── api/
│   └── relay.ts                # THE ONLY SERVER CODE. ~80 lines.
│
├── public/
│   ├── manifest.webmanifest
│   └── icons/
│
├── .env.example                # committed
├── .env.local                  # gitignored — never commit
├── vercel.json
├── vite.config.ts
└── package.json
```
 
---
 
## 2. Stack
 
| Layer | Choice | Note |
|-------|--------|------|
| Build | Vite 5 + TypeScript 5 (`strict: true`) | |
| UI | Svelte 5 | Small bundle; the app must load on hotel wifi |
| Core tests | vitest + fast-check | Zero app deps (Phase 0) |
| Storage | IndexedDB via `idb` | REQ-PLT-05 — `localStorage` MUST NOT hold ledger data |
| Symmetric crypto | WebCrypto: AES-256-GCM, HKDF-SHA256, SHA-256 | Native |
| Claim signing | WebCrypto Ed25519, **fallback ECDSA P-256** | REQ-SEC-03, A14 |
| Nostr signing | `nostr-tools` (secp256k1 Schnorr) | **WebCrypto has no secp256k1** — a library is unavoidable |
| Relay storage | Upstash Redis Streams | Appendix D |
| Hosting | Vercel Hobby | D-19 |
 
---
 
## 3. Environment variables
 
### 3.1 The security boundary — read before adding anything
 
Vite inlines **any variable prefixed `VITE_` into the client bundle as plain text.**
Anyone can read it with devtools. This is not a leak; it is documented behaviour.
 
```
VITE_*        →  PUBLIC. Shipped to every browser. Configuration only.
everything else → server-only. Available in api/ functions. Never bundled.
```
 
**A secret placed behind a `VITE_` prefix is a published secret.** The Upstash token is
the one real credential here — if it ever appears as `VITE_UPSTASH_...`, anyone who opens
your app can read, write, and delete your entire relay database.
 
### 3.2 `.env.example` — commit this
 
```bash
# ─────────────────────────────────────────────────────────────────────────────
# ThePrawnSplit  — environment
#
# Copy to .env.local for development:   cp .env.example .env.local
# .env.local is gitignored. .env.example must contain NO real values.
# ─────────────────────────────────────────────────────────────────────────────
 
 
# ═══════════════════════════════════════════════════════════════════════════
# CLIENT — PUBLIC. Inlined into the JS bundle. Visible to everyone.
# Never put a credential here.
# ═══════════════════════════════════════════════════════════════════════════
 
# Nostr event kind. Regular (non-replaceable) range 1000–9999.
# PRD Q1: 1512 is provisional — Phase 2 Task 0 must confirm it is unallocated
# and accepted by every relay below.
VITE_NOSTR_KIND=1512
 
# Default public relay pool. Comma-separated, no spaces. User-editable in-app.
# Publish to all; ACK quorum is 2 (REQ-SYN-05).
VITE_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net,wss://nostr.mom,wss://offchain.pub
 
# Our operated relay (D-19). Same origin, so a path — not an absolute URL.
VITE_RELAY_ENDPOINT=/api/relay
 
# Ledger schema version (REQ-MON-12). Bump ONLY with a migration plan:
# older clients quarantine anything above their supported version.
VITE_SCHEMA_VERSION=1
 
# Sync tuning (REQ-PLT-09 adaptive polling).
VITE_POLL_ACTIVE_MS=10000
VITE_POLL_IDLE_MS=120000
VITE_IDLE_AFTER_MS=120000
 
# Publish policy (REQ-SYN-05, §12.4).
VITE_ACK_QUORUM=2
VITE_BATCH_MAX_EVENTS=50
 
# Ingestion caps (REQ-SYN-19/20). Enforced CLIENT-SIDE during fold.
VITE_CAP_UNKNOWN_AUTHOR=50
VITE_CAP_KNOWN_AUTHOR=1000
VITE_CAP_GROUP_TOTAL=10000
 
# Clock-drift admission gate (REQ-SYN-24, §9.12).
VITE_MAX_FUTURE_DRIFT_MS=120000
VITE_DRIFT_BUFFER_MAX=500
 
# Snapshot cadence (REQ-SYN-14).
VITE_SNAPSHOT_EVERY=100
 
 
# ═══════════════════════════════════════════════════════════════════════════
# SERVER — SECRET. Available only in api/ functions. Never bundled.
# Auto-injected by Vercel when the Upstash Marketplace integration is connected;
# set manually only for local development.
# ═══════════════════════════════════════════════════════════════════════════
 
# Upstash Redis REST endpoint and token.
# The token is the ONLY real credential in this project. It grants full
# read/write/delete on the relay database. It protects the storage bill,
# NOT user data — the relay stores ciphertext it cannot decrypt (REQ-PLT-08).
UPSTASH_REDIS_REST_URL=https://example-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace_me_never_commit_a_real_token
 
# Relay input validation. Rejects anything that is not a well-formed group tag,
# preventing use as a general-purpose object store.
RELAY_MAX_BLOB_BYTES=131072
RELAY_MAX_FETCH_LIMIT=500
 
 
# ═══════════════════════════════════════════════════════════════════════════
# NOT ENVIRONMENT VARIABLES — listed so nobody looks for them
# ═══════════════════════════════════════════════════════════════════════════
#
#   groupSecret   32 random bytes, generated in-browser at group creation.
#                 Lives in the URL fragment and IndexedDB. Never sent to any
#                 server, including ours (REQ-SYN-04).
#
#   groupKey      Derived: HKDF-SHA256(groupSecret, info="enc"). Never stored
#                 as config, never transmitted.
#
#   claimSk       Per-device signing key (REQ-SEC-01). IndexedDB only. Leaves
#                 the device solely via DeviceIdentityBackup (REQ-SEC-05).
#
# There is no auth secret, session key, JWT secret, or admin token.
# If you are adding one, re-read D-01.
```
 
### 3.3 `.gitignore`
 
```gitignore
.env
.env.local
.env.*.local
.vercel
node_modules
dist
```
 
### 3.4 Vercel dashboard configuration
 
Settings → Environment Variables. Scope each to the right environments.
 
| Variable | Development | Preview | Production | Type |
|---|:--:|:--:|:--:|---|
| `VITE_NOSTR_KIND` | ✓ | ✓ | ✓ | Plain |
| `VITE_NOSTR_RELAYS` | ✓ | ✓ | ✓ | Plain |
| `VITE_RELAY_ENDPOINT` | ✓ | ✓ | ✓ | Plain |
| `VITE_SCHEMA_VERSION` | ✓ | ✓ | ✓ | Plain |
| `VITE_*` (tuning) | ✓ | ✓ | ✓ | Plain |
| `UPSTASH_REDIS_REST_URL` | ✓ | ✓ | ✓ | **Sensitive** |
| `UPSTASH_REDIS_REST_TOKEN` | ✓ | ✓ | ✓ | **Sensitive** |
| `RELAY_MAX_*` | ✓ | ✓ | ✓ | Plain |
 
**Use a separate Upstash database for Preview.** Preview deployments are publicly
reachable by URL; pointing them at production storage means any preview link can write to
the real relay.
 
Pull configured variables locally:
 
```bash
npx vercel link
npx vercel env pull .env.local
```
 
### 3.5 Rotating the Upstash token
 
Rotate in the Upstash console, then update Vercel and redeploy. **No client impact and no
data loss** — the token never reaches the browser, and every device holds the full log
(§5 invariants). Worst case is a sync gap until redeploy, during which manual fallbacks
still work (REQ-SYN-13).
 
---
 
## 4. The relay function
 
The entire server. Blind append-only store: no decryption, no ledger logic, no
coordination (REQ-PLT-08).
 
```ts
// api/relay.ts
import { Redis } from "@upstash/redis";
 
export const config = { runtime: "edge" };
 
const redis = Redis.fromEnv();               // reads UPSTASH_REDIS_REST_URL + _TOKEN
const MAX_BLOB  = Number(process.env.RELAY_MAX_BLOB_BYTES  ?? 131072);
const MAX_LIMIT = Number(process.env.RELAY_MAX_FETCH_LIMIT ?? 500);
 
const TAG_RE = /^[0-9a-f]{64}$/;             // lowercase hex only (REQ-SYN-17)
const key = (tag: string) => `ts:${tag}`;
 
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
 
  // ── POST /api/relay  { tag, blob, author } ──────────────────────────────
  if (req.method === "POST") {
    const { tag, blob, author } = await req.json();
 
    if (!TAG_RE.test(tag ?? "")) return bad("invalid tag");
    if (typeof blob !== "string" || blob.length > MAX_BLOB) return bad("invalid blob");
    if (typeof author !== "string" || author.length > 128) return bad("invalid author");
 
    // XADD ts:{tag} * blob <b64> author <pubkey>  → server-generated monotonic ID
    const cursor = await redis.xadd(key(tag), "*", { blob, author });
    return json({ cursor });
  }
 
  // ── GET /api/relay?tag=&cursor=&author=&limit= ──────────────────────────
  if (req.method === "GET") {
    const tag    = url.searchParams.get("tag") ?? "";
    const cursor = url.searchParams.get("cursor");
    const author = url.searchParams.get("author");        // Mode B (PRD §9.5)
    const limit  = Math.min(Number(url.searchParams.get("limit") ?? 100), MAX_LIMIT);
 
    if (!TAG_RE.test(tag)) return bad("invalid tag");
 
    // Exclusive range from cursor; "-" means from the beginning (Mode A bootstrap)
    const start = cursor ? `(${cursor}` : "-";
    const rows  = await redis.xrange(key(tag), start, "+", limit);
 
    let entries = Object.entries(rows).map(([cursor, f]: [string, any]) => ({
      cursor, blob: f.blob, author: f.author,
    }));
 
    if (author) entries = entries.filter(e => e.author === author);
 
    return json({ entries });
  }
 
  return new Response("method not allowed", { status: 405 });
}
 
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
const bad = (m: string) =>
  new Response(JSON.stringify({ error: m }), { status: 400 });
```
 
**Verify the `@upstash/redis` stream method signatures against current SDK docs before
implementing.** `xadd`/`xrange` argument shapes have changed between major versions, and
this is written from the documented pattern rather than a running build.
 
### 4.1 Deliberate omissions
 
| Not implemented | Why |
|---|---|
| Authentication | The join link is already an unrevocable bearer credential (PRD §10.2). Adding auth here protects nothing and reintroduces accounts. |
| Per-author rate limiting | Caps are enforced **client-side during fold** (REQ-SYN-19). A server-side cap would be a remote kill-switch — the exact bug D-18 fixed. |
| Deletion | Void is terminal and expressed as events (D-13). Nothing is ever removed. |
| `subscribe` / WebSocket | The client polls (REQ-PLT-03/04). Edge functions cannot hold connections, and nothing needs one. |
| Decryption, validation of payloads | REQ-PLT-08. The relay must not be able to interpret content. |
 
### 4.2 Cost model
 
| Operation | Redis commands |
|---|---|
| Publish one batch (≤50 events) | 1 × `XADD` |
| Poll (idle, nothing new) | 1 × `XRANGE` |
| Bootstrap fetch | ~1–3 × `XRANGE` |
 
Six devices, adaptive polling, 14-day trip ≈ **80k commands**. Upstash free tier is
**500k commands/month** (raised from 10k/day on 12 Mar 2025 — A18). Comfortable.
 
---
 
## 5. Core module signatures (Phase 0)
 
```ts
// core/src/money.ts
export function fnv1a(str: string): number;
export function allocate(
  total: bigint, weights: bigint[], eventId: string, pids: string[]
): bigint[];                                   // Σ result === total, always
 
// core/src/settle.ts
export interface Transfer { from: string; to: string; minor: number }
export function greedySettlement(balances: Map<string, number>): Transfer[];
 
// core/src/hlc.ts
export interface HLC { wall: number; ctr: number; dev: string }
export function receive(local: HLC, remote: HLC, now: number): HLC;
export type Admission = { ok: true } | { ok: false; reason: "future"; retryAt: number };
export function admissionGate(e: Event, now: number, maxDriftMs: number): Admission;
 
// core/src/identity.ts
export function buildDSU(events: Event[]): Map<string, string>;   // pid -> canonical
export function authorisedKeys(events: Event[], pid: string): Set<string>;
export function verifyConfirmation(                                // REQ-SEC-08
  events: Event[], sid: string, claimSig: string
): boolean;   // resolves against the LITERAL pre-merge payee pid, never canonical
 
// core/src/fold.ts
export interface State {
  participants: Map<string, Participant>;
  expenses:     Map<string, Expense>;
  settlements:  Map<string, Settlement>;
  balances:     Map<string, number>;      // Σ === 0 invariant (REQ-MON-15)
  anomalies:    Anomaly[];
  quarantined:  string[];                 // event ids, v > supported
  buffered:     string[];                 // future-dated, held
  frozen:       boolean;                  // true when quarantined.length > 0
}
export function fold(events: Event[], opts: FoldOptions): State;
```
 
`fold` is **pure and total**: same input → same output, no throws on malformed input
(malformed events are quarantined, not fatal). This is what makes the §16.2 property
suite possible.
 
---
 
## 6. IndexedDB schema
 
```ts
// src/db/schema.ts — database "ThePrawnSplit ", version 1
{
  groups:   { key: groupId,
              value: { groupId, name, currency, tagHex, secretB64,
                       state: "ACTIVE" | "ARCHIVED", createdAt } },
 
  events:   { key: [groupId, eventId],
              indexes: { byGroup: [groupId],
                         byDevCtr: [groupId, dev, ctr],
                         bySync:   [groupId, syncState] },   // local|published|confirmed
              value: { groupId, eventId, event, syncState, publishedAt } },
 
  buffer:   { key: [groupId, eventId], value: { event, retryAt } },   // REQ-SYN-24
 
  identity: { key: [groupId, pid],
              value: { pid, deviceId, claimPkJwk, claimSkJwk, alg } },  // REQ-SEC-01
 
  meta:     { key: groupId,
              value: { versionVector, discardVector, cursors,          // REQ-SYN-27
                       lastSnapshotSeq, nostrSkHex } }
}
```
 
**`secretB64` is stored deliberately.** The URL fragment is gone once the PWA is launched
from the home screen; without a local copy, an installed app could not decrypt its own
group. This is why storage eviction is recoverable only via the link or an export
(REQ-DUR-06).
 
---
 
## 7. Crypto
 
```ts
// src/crypto/group.ts
createGroupSecret(): Uint8Array                    // crypto.getRandomValues(32)
groupTag(secret): Promise<string>                  // SHA-256(secret‖"tag") → LOWERCASE hex
groupKey(secret): Promise<CryptoKey>               // HKDF-SHA256 info="enc" → AES-256-GCM
 
// src/crypto/envelope.ts
encrypt(key, events): Promise<string>              // base64(iv ‖ ciphertext)
decrypt(key, b64):   Promise<Event[]>
 
// src/crypto/claim.ts
pickAlg(): Promise<"ed25519" | "ecdsa-p256">       // feature-detect, REQ-SEC-03
mintClaimKey(alg): Promise<ClaimKeyPair>
signClaim(sk, alg, payload): Promise<string>       // payload ALWAYS prefixed groupTag
verifyClaim(pkJwk, alg, payload, sig): Promise<boolean>
```
 
Feature detection, because Ed25519 reached Chrome only mid-2025 (A14):
 
```ts
async function pickAlg(): Promise<"ed25519" | "ecdsa-p256"> {
  try {
    await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    return "ed25519";
  } catch {
    return "ecdsa-p256";
  }
}
```
 
Every signed payload begins with `groupTag` (REQ-SEC-04):
 
```
claim:   `${groupTag}:${pid}:${deviceId}:${claimPk}`
link:    `${groupTag}:link:${pid}:${newDevice}:${newClaimPk}:${nonce}`   // Q13 nonce
confirm: `${groupTag}:confirm:${sid}`
```
 
---
 
## 8. Build and deploy
 
```jsonc
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```
 
```jsonc
// package.json (scripts)
{
  "dev":        "vite",
  "build":      "npm run test:core && vite build",
  "test:core":  "vitest run --dir core",
  "test:watch": "vitest --dir core",
  "deploy":     "vercel --prod"
}
```
 
`build` runs the core suite first. **A failing property test blocks deployment** — the
mechanism that makes §16.5 more than an intention.
 
---
 
## 9. Local development
 
```bash
git clone <repo> && cd ThePrawnSplit 
npm install
cp .env.example .env.local          # then paste real Upstash values
 
npm run test:watch                  # Phase 0 loop — no server needed
npx vercel dev                      # full app + api/relay locally
```
 
Phase 0 needs no Upstash account, no Vercel login, and no network. Only Phase 2 onward
touches infrastructure.
 
---
 
## 10. Build order
 
| Step | Needs | Output |
|---|---|---|
| **Phase 0** | Nothing | `core/` green against §16.1, §16.2, §16.2.1 |
| **Task 0** | A throwaway Nostr key | A1/A11/A12/A13/Q1 resolved with data |
| **Phase 1** | Phase 0 | Single-device app importing the core |
| **Phase 2** | Task 0, Upstash, Vercel | Sync, crypto, relay dual-write |
| Phases 3–5 | — | Per PRD §15 |
 
Phase 0 and Task 0 are independent — if one stalls, the other still moves.
