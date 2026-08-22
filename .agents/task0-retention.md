# Task 0 — relay retention probe (PRD A1)

Published **50 events** of kind **1512** (~3000 B each)
to 5 relays at **2026-08-22T12:59:41.810Z**, using a throwaway key and tag.

Decision gates — agreed **before** seeing data (see CR-005 Task 3):

| 30-day result | Verdict | Consequence |
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
