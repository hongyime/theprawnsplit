# Task 0 — relay retention probe (PRD A1)

Published **20 events** of kind **1512** (~3000 B each)
to 2 relays at **2026-08-22T13:33:04.092Z**, using a throwaway key and tag.

Decision gates — agreed **before** seeing data (see CR-005 Task 3):

| 30-day result | Verdict | Consequence |
|---|---|---|
| ≥95% on ≥3 of 5 relays | **A1 holds** | Nostr pool is genuine redundancy alongside the operated relay |
| 50–95%, or <3 relays healthy | **A1 partially holds** | Nostr is best-effort; the operated relay carries recovery |
| <50% | **A1 false** | Nostr is opportunistic only; consider dropping it from defaults |

| date (UTC) | elapsed | relay | retention | ret % | ingest | note |
|---|---|---|---|---|---|---|
| 2026-08-22 13:33 | 0m | wss://relay.damus.io | 10/10 | 100% | 10/20 (50%) |  |
| 2026-08-22 13:33 | 0m | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-22 13:36 | 3m | wss://relay.damus.io | 10/10 | 100% | 10/20 (50%) |  |
| 2026-08-22 13:36 | 3m | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-23 06:18 | 16.8h | wss://relay.damus.io | 10/10 | 100% | 10/20 (50%) |  |
| 2026-08-23 06:18 | 16.8h | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-24 06:29 | 40.9h | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-24 06:29 | 40.9h | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-25 06:22 | 2.7d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-25 06:22 | 2.7d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-26 06:23 | 3.7d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-26 06:23 | 3.7d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-27 16:54 | 5.1d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-27 16:54 | 5.1d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-28 17:45 | 6.2d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-28 17:45 | 6.2d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-29 11:49 | 6.9d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-29 11:49 | 6.9d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-30 10:46 | 7.9d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-08-30 10:46 | 7.9d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-08-31 11:55 | 8.9d | wss://relay.damus.io | 10/10 | 100% | 10/20 (50%) |  |
| 2026-08-31 11:55 | 8.9d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-09-01 10:35 | 9.9d | wss://relay.damus.io | 10/10 | 100% | 10/20 (50%) |  |
| 2026-09-01 10:35 | 9.9d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
| 2026-09-02 10:00 | 10.9d | wss://relay.damus.io | 0/10 | 0% | 10/20 (50%) |  |
| 2026-09-02 10:00 | 10.9d | wss://offchain.pub | 18/18 | 100% | 18/20 (90%) |  |
