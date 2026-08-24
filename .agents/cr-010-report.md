**CR-010** — trunk-based workflow, CI coverage, §16.2 property gaps, status-register truthing, and A13 closure.

## Workflow change (effective now)

All work lands directly on `main`. No feature branches, no PRs. The rule is recorded in
`.agents/STATE.md`, deliberately not in `AGENTS.md` (overwritten by the sync-repo-settings workflow).

## Task 1 — CR-009 landed

- `cr-009-status-register` merged into main conflict-free (`6740971`); PR #5 auto-marked **MERGED** by
  GitHub when the merge commit landed (https://github.com/hongyime/theprawnsplit/pull/5).
- Remote branches `cr-009-status-register` and `cr-008-doc-reconcile` deleted; dependabot branches untouched.

## Task 2 — CI restored under trunk-based flow

`.github/workflows/ci.yml`: added a `push: branches: [main]` trigger alongside `pull_request`, and
`"**.svelte"` added to **both** path filter lists (`src/App.svelte` is 1,775 lines and never triggered Build Check).

Verified by the real run, not the diff: **https://github.com/hongyime/theprawnsplit/actions/runs/32734413881**
— event `push`, branch `main`, conclusion **success**, triggered by commit `8547faf`.

## Task 3 — PRD phase column un-corrupted

- `REQ-MON-08` phase cell restored `Built` → `5` (PRD.md:256).
- One line added under §7: *"The Phase column is scope planning (§15), not delivery status — STATUS.md owns status."*
- The CR-009 §8.1 schema-versioning rewrite was kept untouched (verified present at PRD.md:498).

## Task 4 — §16.2 gaps closed (3 new properties in `core/test/properties.test.ts`)

| Gap | New test | Evidence of teeth |
|---|---|---|
| REQ-SYN-24 single-replica | `yields identical drift verdicts on replicas ingesting the same future event at different times` — same future-dated event into two replicas (one before `retryAt`, one after), both advanced past it, canonical bytes asserted identical plus equal transport vectors | **RED proven**: temporary buffer-path mutation in `core/src/transport.ts` made this test fail while production code stayed correct otherwise; reverted |
| REQ-SYN-12 associativity | `keeps folds associative across merge regroupings` — `fold((A∪B)∪C) === fold(A∪(B∪C)) === fold(A∪B∪C)` over generated merge sets with batch-local HLC minting per regrouping | Structural pin; passes against production. No plausible mutation separates associativity from the already-pinned commutativity/idempotence because fold is one pass over a totally ordered array |
| REQ-ID-13 opposing merges | `converges concurrent opposing-direction participant merges in both delivery orders` — pinned `(a→b)`/`(b→a)` at identical wall+ctr across differing devices, both orders + 50 shuffles byte-equal, balances collapse to 2 zero-sum keys | Passes against production. Finding: convergence is **over-determined by four independent layers** — compareHlc dev tiebreak, eventSortKey id tiebreak, fold's internal pre-sort, direction-independent min-root DSU union. Compound degradation experiments (directional attach + unsorted buildDSU + dropped id tiebreak) diverged raw DSU output per order but fold's remaining layers masked it end-to-end |

Suite: 64 → **67 core tests**, all green. Full `npm run build` gate exit 0 (core + sync tests, money lint,
svelte-check 0 errors / 0 warnings, vite bundle). Committed as `8547faf`.

## Task 5 — status register truthing

Scope: every PRD row with phase ≥ 3 — **36 rows** (work order estimated 37; the PRD contains 36 rows with a
phase ≥ 3 component, including SEC-01's "2 (mint) / 4 (verify)" verify half). Each row: requirement text read,
cited tests read, judgement on whether the test asserts the requirement or merely touches the area.

Result: **33 Built / 3 Partial / 0 Not started**. Downgrades (one-line gap recorded in STATUS.md Notes column):

| Row | Gap |
|---|---|
| DUR-03 | Ladder rungs 1/4 and the `expenseCount >= 3` trigger branch unasserted; only session rungs 2–3 + dismissal cap tested |
| DUR-06 | Recovery-before-render ordering is source-shape containment only; no behavioural ordering or completion assertion |
| ID-12 | Fold-side duplicate anomaly asserted; the `possible-duplicate-participants` banner rendering itself has no test |

Also corrected: DUR-09/DUR-10 citations now point at `test/manual-fallback-ui.test.ts:32`, which carries the
actual import-primary / eviction-vs-first-join assertions (the previously cited durability tests do not).
Full evidence table appended to `STATUS.md` §CR-010 semantic re-audit. Drift guard green after edits.
Committed as `61be9df`.

## Task 6 — A13 closed: FALSE

New `batch50` and `nip11` commands in `scripts/task0-retention.mjs`. Measured 2026-08-24 against all five
current default relays (the work order said four; CR-007 added snort as a fifth default — probed all five):

| relay | NIP-11 max_message_length | 221,449-byte single message, 50 events |
|---|---|---|
| wss://nos.lol | 131072 | 0/50 accepted, no OK replies |
| wss://relay.primal.net | 1000000 | 1/50 accepted |
| wss://nostr.mom | 131072 | 0/50 accepted, no OK replies |
| wss://offchain.pub | 131072 | 0/50 accepted, no OK replies |
| wss://relay.snort.social | 524288 | 1/50 accepted |

Verdict recorded in PRD §12: **FALSE** — three relays reject the batch on message length alone, and even
relays whose limit accommodates it acknowledge only the first event of an array-form message. Per the work
order, the mitigation ("reduce batch size dynamically per relay") is now required follow-up work, recorded at
the end of PRD §15: NIP-11-derived dynamic batch sizing plus per-event fallback when a batch is not fully
acknowledged. Data preserved verbatim in `.agents/task0-retention.md` §A13. Committed as `62b321b`.

## Tests

Before: 64 core tests, 121 root test files count unchanged. After: **67 core tests** (+3 properties), root
suite green, svelte-check 0/0, entry chunk 55.87 kB gzip unchanged. Full `npm run build` passed before each
push that touched source.

## Commits (all on main, in order)

`6740971` merge CR-009 · `87b25a5` ci triggers · `1127bf4` PRD phase cell · `8547faf` §16.2 properties ·
`62b321b` A13 measurement · `61be9df` STATUS truthing
