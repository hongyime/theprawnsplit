# Task 0 — relay retention probe (PRD A1)

Published **50 events** of kind **1512** (~3000 B each)
to 5 relays at **2026-08-22T12:59:41.810Z**, using a throwaway key and tag.

Decision gates — agreed **before** seeing data (see CR-005 Task 3). Two-component structure applied CR-007.

### Component 1 — Admission

Admission measures what fraction of published events a relay accepts at write time.
Measured from `baselines[relay]` in the manifest — events actually ACKed at publish.

| Relay | Burst admission (400ms) | Slow admission (30s) | Classification |
|---|---|---|---|
| wss://nos.lol | 50/50 (100%) | n/a | **Open** |
| wss://relay.primal.net | 50/50 (100%) | n/a | **Open** |
| wss://nostr.mom | 50/50 (100%) | n/a | **Open** |
| wss://offchain.pub | 15/50 (30%) | 18/20 (90%) | **WoT-gated** — structural policy rejection |
| wss://relay.damus.io | 6/50 (12%) | 10/20 (50%) | **Dropped** — socket unreliable, WoT-like silencing |

**Finding (CR-007):** offchain.pub and relay.damus.io are structurally incompatible with ephemeral
keys (TripSplit mints a fresh Nostr key per device, §9.10). The offchain.pub rejection reason was
verbatim: `"Policy violated and pubkey is not in our web of trust."` This is WoT gating, not rate
limiting. Pacing does not fix it. D-23 decided: operated Vercel relay is mandatory primary;
Nostr relays (nos.lol, primal, nostr.mom) are secondary redundancy with ≥1 ACK quorum.
relay.damus.io dropped from defaults. wss://relay.snort.social added (vetted PASS: 3/3).

### Component 2 — Retention

Retention measures whether admitted events are still retrievable after elapsed time.
REQ-SYN-17 VALIDATED: `#t` tag queries return counts identical to `ids` queries — tag addressing works.

| 30-day result (of admitted events) | Verdict | Consequence |
|---|---|---|
| ≥95% on ≥3 of 5 relays | **A1 holds** | Nostr pool is genuine redundancy alongside the operated relay |
| 50–95%, or <3 relays healthy | **A1 partially holds** | Nostr is best-effort; the operated relay carries recovery |
| <50% | **A1 false** | Nostr is opportunistic only; consider dropping it from defaults |

| date (UTC) | elapsed | relay | retrieved | % | note |
|---|---|---|---|---|---|
| 2026-08-22 13:00 | 1m | wss://relay.damus.io | 0/50 | 0% |  |
| 2026-08-22 13:00 | 1m | wss://nos.lol | 50/50 | 100% |  |
| 2026-08-22 13:00 | 1m | wss://relay.primal.net | 50/50 | 100% |  |
| 2026-08-22 13:00 | 1m | wss://nostr.mom | 50/50 | 100% |  |
| 2026-08-22 13:00 | 1m | wss://offchain.pub | 15/50 | 30% |  |
| 2026-08-22 13:10 | 11m | wss://relay.damus.io | 6/50 | 12% |  |
| 2026-08-22 13:10 | 11m | wss://nos.lol | 50/50 | 100% |  |
| 2026-08-22 13:10 | 11m | wss://relay.primal.net | 50/50 | 100% |  |
| 2026-08-22 13:10 | 11m | wss://nostr.mom | 50/50 | 100% |  |
| 2026-08-22 13:10 | 11m | wss://offchain.pub | 15/50 | 30% |  |
| 2026-08-22 13:21 | 21m | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-08-22 13:21 | 21m | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-22 13:21 | 21m | wss://relay.primal.net | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-22 13:21 | 21m | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-22 13:21 | 21m | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-22 13:36 | 37m | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-08-22 13:36 | 37m | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-22 13:36 | 37m | wss://relay.primal.net | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-22 13:36 | 37m | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-22 13:36 | 37m | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-23 06:18 | 17.3h | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-08-23 06:18 | 17.3h | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-23 06:18 | 17.3h | wss://relay.primal.net | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-23 06:18 | 17.3h | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-23 06:18 | 17.3h | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
