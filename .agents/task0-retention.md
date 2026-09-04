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
| 2026-08-24 06:29 | 41.5h | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-08-24 06:29 | 41.5h | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-24 06:29 | 41.5h | wss://relay.primal.net | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-24 06:29 | 41.5h | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-24 06:29 | 41.5h | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |

## A13 batch publish probe (PRD §12 A13)

Measured 2026-08-24 14:09: 50 events x ~3000 B sent as ONE WebSocket message (221449 bytes total) to the current default pool. Verbatim rejection text preserved.

| relay | NIP-11 max_message_length | message bytes | accepted | OK replies | notes |
|---|---|---|---|---|---|
| wss://nos.lol | 131072 | 221449 | 0/50 | 0/50 | no OK replies — message dropped without rejection text |
| wss://relay.primal.net | 1000000 | 221449 | 1/50 | 1/50 | partial acknowledgement without rejection text |
| wss://nostr.mom | 131072 | 221449 | 0/50 | 0/50 | no OK replies — message dropped without rejection text |
| wss://offchain.pub | 131072 | 221449 | 0/50 | 0/50 | no OK replies — message dropped without rejection text |
| wss://relay.snort.social | 524288 | 221449 | 1/50 | 1/50 | partial acknowledgement without rejection text |
| 2026-08-25 06:22 | 2.7d | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-08-25 06:22 | 2.7d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-25 06:22 | 2.7d | wss://relay.primal.net | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-25 06:22 | 2.7d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-25 06:22 | 2.7d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-26 06:23 | 3.7d | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-08-26 06:23 | 3.7d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-26 06:23 | 3.7d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-08-26 06:23 | 3.7d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-26 06:23 | 3.7d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-27 16:54 | 5.2d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-08-27 16:54 | 5.2d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-27 16:54 | 5.2d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-08-27 16:54 | 5.2d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-27 16:54 | 5.2d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-28 17:45 | 6.2d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-08-28 17:45 | 6.2d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-28 17:45 | 6.2d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-08-28 17:45 | 6.2d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-28 17:45 | 6.2d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-29 11:49 | 7.0d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-08-29 11:49 | 7.0d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-29 11:49 | 7.0d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-08-29 11:49 | 7.0d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-29 11:49 | 7.0d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-30 10:46 | 7.9d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-08-30 10:46 | 7.9d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-30 10:46 | 7.9d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-08-30 10:46 | 7.9d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-30 10:46 | 7.9d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-08-31 11:55 | 9.0d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-08-31 11:55 | 9.0d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-31 11:55 | 9.0d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-08-31 11:55 | 9.0d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-08-31 11:55 | 9.0d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-09-01 10:35 | 9.9d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-09-01 10:35 | 9.9d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-01 10:35 | 9.9d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-09-01 10:35 | 9.9d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-01 10:35 | 9.9d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-09-02 10:00 | 10.9d | wss://relay.damus.io | 0/6 | 0% | 6/50 (12%) |  |
| 2026-09-02 10:00 | 10.9d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-02 10:00 | 10.9d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-09-02 10:00 | 10.9d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-02 10:00 | 10.9d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-09-03 10:11 | 11.9d | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-09-03 10:11 | 11.9d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-03 10:11 | 11.9d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-09-03 10:11 | 11.9d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-03 10:11 | 11.9d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
| 2026-09-04 10:06 | 12.9d | wss://relay.damus.io | 6/6 | 100% | 6/50 (12%) |  |
| 2026-09-04 10:06 | 12.9d | wss://nos.lol | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-04 10:06 | 12.9d | wss://relay.primal.net | 0/50 | 0% | 50/50 (100%) |  |
| 2026-09-04 10:06 | 12.9d | wss://nostr.mom | 50/50 | 100% | 50/50 (100%) |  |
| 2026-09-04 10:06 | 12.9d | wss://offchain.pub | 15/15 | 100% | 15/50 (30%) |  |
