**CR-007** — relay admission diagnosis and correction.

## Key finding

CR-006 reported rate limiting. **Incorrect.** Direct re-probe at 2.5s spacing produced no `rate-limited` messages.

- `offchain.pub`: `accepted=false reason="Policy violated and pubkey is not in our web of trust."` — structural WoT admission block. TripSplit mints ephemeral keys (§9.10); no social graph, no WoT membership. Pacing cannot fix this.
- `relay.damus.io`: Socket silently refused to open. No OK text, no error code. Nothing for REQ-SYN-11 to act on.

## D-23

User chose Option 2: operated Vercel relay is **primary** (mandatory). Nostr relays are **secondary redundancy** (≥1 ACK quorum). Data: 2 of 5 volunteer Nostr relays are structurally incompatible with ephemeral keys.

## What changed

| File | Change |
|---|---|
| `src/config.ts` | Removed `relay.damus.io`, added `relay.snort.social` (vetted PASS 4/4) |
| `.env.example` | Same relay list update |
| `src/relay/diagnostics.ts` | WoT pattern matching maps free-form "web of trust" text to `blocked`; unknown-rejection escalation → `drop-relay` after 3 strikes |
| `test/relay-diagnostics.test.ts` | 3 new tests: verbatim offchain WoT string → `blocked`; WoT classification → `drop-relay`; escalation threshold |
| `scripts/task0-retention.mjs` | Added `vet <relay>` command: 4-event fresh-key probe → PASS/WARN/FAIL verdict |
| `package.json` | Added `task0:vet` script |
| `.agents/task0-retention.md` | Gate table split into Admission + Retention components |
| `.agents/STATE.md` | WoT correction + D-23 decision recorded |
| `.agents/JOURNAL.md` | D-23 and CR-007 entries appended |

## Relay changes

- **Dropped**: `wss://relay.damus.io` (silent socket failure)
- **Vetted**: `relay.snort.social` → PASS 4/4 ✓ | `relay.nostr.band` → FAIL (socket refused all 3 attempts)
- **Added**: `wss://relay.snort.social`

## Tests

Before: 177 root tests. After: **180 root tests** (3 new relay-diagnostics tests). 64 core tests. 0 Svelte warnings. Entry chunk 55.87 kB gzip unchanged.
