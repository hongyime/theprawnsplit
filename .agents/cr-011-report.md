**CR-011** — total-order comparator: tested, hardened, and mutation-proved; A13 mitigation shipped.

## Key finding

The twelve §16.2 order-independence properties verify ONE thing — that `eventSortKey` is a total order —
and before CR-011 nothing verified it directly. Mutation runs proved two of three comparator mutations left
the entire suite green. Also: all 14 core `localeCompare` call sites (not just the 2 in the comparator) sat
on convergence-critical paths and were replaced with codepoint comparison.

## Task 1+2 — direct tests + hardening (`78ef655`)

New `core/test/order.test.ts`: antisymmetry, transitivity over triples, totality (ties iff duplicate), plus
observed adversarial behaviour:

| input | observed |
|---|---|
| NaN wall | falls through to ctr then dev; constructive intransitivity proven: `{20,z} > {NaN,a} > {30,b}` yet `{20,z} < {30,b}` |
| ±Infinity | orders correctly vs finite; Inf-vs-Inf falls to ctr deterministically |
| -0 vs 0 | wall term ties (-0 falsy); numerically correct, benign |
| fractional | consistent |
| > MAX_SAFE_INTEGER | doubles lose distinctness (+1 === +2); known bound, Date.now() is ~1.7e12 |

Hardening: `compareCodepoints()` in types.ts replaces both localeCompare calls AND the same defect class in
canonical.ts (canonicalStateBytes Map/array sorts!), fold.ts (returned Map order + anomaly sort),
identity.ts, money.ts (local inline — stays import-free), settle.ts. **Convergence decision recorded in
JOURNAL.md**: non-finite HLC numbers are REJECTED at transport admission (`reason: "malformed"`,
discardVector advanced) rather than ordered last — admission rejection keeps the ledger domain finite so the
comparator needs no runtime branching.

## Task 3 — mutation table (the deliverable)

| mutation | §16.2 properties red | other reds |
|---|---|---|
| **3a** drop id tiebreak | **NONE — entire suite GREEN** (finding: decorative for totality) | none; after CR-011 added the pinned same-HLC/distinct-id case → exactly that test goes red |
| **3b** drop ctr term | **NONE of the twelve** (finding: every generator mints distinct walls) | only new order.test.ts characterisations (3) |
| **3c** non-transitive (\|Δwall\|<1000 → 0) | SYN-12 1,000-shuffles; MON-16 atomicity; MON-17 retrievability; ID-13 opposing-merge pin — 4 of 12 | fold.test ×3, order.test ×2 |

Two decorative findings as predicted. The pinned tiebreak test was added so totality is no longer unguarded.
All mutations reverted between runs; final state clean.

## Task 4 — housekeeping (`1d3a6dd`)

- STATUS.md stray duplicate header row deleted.
- SEC-01 stated plainly: it DID receive an assertion-level audit in CR-010 (evidence now in its Notes cell:
  verification.test.ts :24/:47/:47 real-signature clear, cross-tag replay, contested-pending; fold.test
  :237/:253/:271). Count corrected to: 35 numeric phase≥3 rows + SEC-01's verify half = 36 audited units
  across 37 register rows; CR-010 report's "36 including SEC-01" phrasing conflated the counts.
- PRD:1759 rewritten: A11/A12 VERIFIED 2026-08-22; A13 FALSE 2026-08-24; A1 still on the 30-day clock.
- Drift guard extended: every `A-NN` referenced outside §12 must exist in the register (deleted-ID mentions
  like A9 allowed). RED-proven with phantom A99 → fails naming PRD.md line.

## Task 5 — ID-12 closed (`1d3a6dd`)

`test/duplicate-banner-ui.test.ts` asserts the possible-duplicate-participants banner (both participant
labels, "without changing balances automatically", Merge / Not same append-only actions). ID-12 → Built;
DUR-03/DUR-06 deliberately remain Partial per instruction.

## Task 6 — A13 mitigation shipped (`4ba8a34`)

- `src/relay/nip11.ts`: NIP-11 `limitation.max_message_length` fetcher, cached per relay, Accept:
  application/nostr+json, null on failure.
- `src/relay/batch-limits.ts`: pure limit resolution (min of known limits) + binary-search batch fitting with
  a probe-encryption size projection.
- `src/relay/sync.ts`: batch sliced to the weakest relay's limit minus 4 KiB margin before publish
  (remainder waits for next cycle); if quorum still fails, **per-event fallback** publishes each pending
  event individually — the load-bearing half per CR-010's partial-ACK measurements.
- Tests against recorded measurements: limits 131072/1000000/524288, measured 221,449 B for 50 events →
  nos.lol-class relays cap below 50, primal/snort-class keep all; integration tests prove slicing +
  full fallback delivery under rejecting relays.

## Verification

Core: 81/81. Root: 194/194. svelte-check 0/0. Full build exit 0. Commits on main, no PR:
`78ef655` comparator · `a30d84c` prompt move · `d26a425` pinned tiebreak · `1d3a6dd` housekeeping/ID-12 ·
`4ba8a34` A13 mitigation. STATE.md/JOURNAL.md updated.
