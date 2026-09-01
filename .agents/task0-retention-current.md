# Task 0 — relay retention probe (PRD A1)

Published **20 events** of kind **1512** (~3000 B each)
to 5 relays at **2026-08-23T02:08:26.477Z**, using a throwaway key and tag.

Decision gates — agreed **before** seeing data (see CR-005 Task 3):

| 30-day result | Verdict | Consequence |
|---|---|---|
| ≥95% on ≥3 of 5 relays | **A1 holds** | Nostr pool is genuine redundancy alongside the operated relay |
| 50–95%, or <3 relays healthy | **A1 partially holds** | Nostr is best-effort; the operated relay carries recovery |
| <50% | **A1 false** | Nostr is opportunistic only; consider dropping it from defaults |

| date (UTC) | elapsed | relay | retention | ret % | ingest | note |
|---|---|---|---|---|---|---|
| 2026-08-23 15:27 | 13.3h | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-23 15:27 | 13.3h | wss://relay.primal.net | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-23 15:27 | 13.3h | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-23 15:27 | 13.3h | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-23 15:27 | 13.3h | wss://relay.snort.social | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-24 06:29 | 28.4h | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-24 06:29 | 28.4h | wss://relay.primal.net | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-24 06:29 | 28.4h | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-24 06:29 | 28.4h | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-24 06:29 | 28.4h | wss://relay.snort.social | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-25 06:22 | 2.2d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-25 06:22 | 2.2d | wss://relay.primal.net | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-25 06:22 | 2.2d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-25 06:22 | 2.2d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-25 06:22 | 2.2d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-26 06:24 | 3.2d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-26 06:24 | 3.2d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-26 06:24 | 3.2d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-26 06:24 | 3.2d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-26 06:24 | 3.2d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-27 16:54 | 4.6d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-27 16:54 | 4.6d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-27 16:54 | 4.6d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-27 16:54 | 4.6d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-27 16:54 | 4.6d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-28 17:45 | 5.7d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-28 17:45 | 5.7d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-28 17:45 | 5.7d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-28 17:45 | 5.7d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-28 17:45 | 5.7d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-29 11:49 | 6.4d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-29 11:49 | 6.4d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-29 11:49 | 6.4d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-29 11:49 | 6.4d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-29 11:49 | 6.4d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-30 10:46 | 7.4d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-30 10:46 | 7.4d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-30 10:46 | 7.4d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-30 10:46 | 7.4d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-30 10:46 | 7.4d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-31 11:55 | 8.4d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-31 11:55 | 8.4d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-08-31 11:55 | 8.4d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-08-31 11:55 | 8.4d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-08-31 11:55 | 8.4d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
| 2026-09-01 10:35 | 9.4d | wss://nos.lol | 20/20 | 100% | 20/20 (100%) |  |
| 2026-09-01 10:35 | 9.4d | wss://relay.primal.net | 0/20 | 0% | 20/20 (100%) |  |
| 2026-09-01 10:35 | 9.4d | wss://nostr.mom | 20/20 | 100% | 20/20 (100%) |  |
| 2026-09-01 10:35 | 9.4d | wss://offchain.pub | 19/19 | 100% | 19/20 (95%) |  |
| 2026-09-01 10:35 | 9.4d | wss://relay.snort.social | 0/20 | 0% | 20/20 (100%) |  |
