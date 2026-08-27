**CR-012** — the Nostr cursor correctness bug fixed with RED proof, and the UI test modality problem confronted head-on.

## Task 1 — Nostr cursor: FIXED, regression proven RED first

The bug: `selectNostrEntries` (extracted verbatim from `NostrRelay.fetch` in `590f92c` so it could be
tested without a live relay) sorted by `created_at` then filtered `event.id > cursor`. Event ids are sha256
digests — effectively random — and that client-side filter was the only cursor application.

**RED proof against current-main behaviour**: fixture with 5 round-1 events (cursor stored) + 8 brand-new
round-2 events created strictly after → old code returned **`[]` — all 8 of 8 fresh events dropped (100%)**
in this fixture; with a mid-range stored id roughly half would vanish per fetch, compounding as the cursor
ratchets. Exact number: **8/8 in the committed fixture**, not "lossy".

Fix (`772bc79`, rebased over retention-probe commits):
- `nostrFetchFilter` now emits NIP-01 `since`; `NostrRelay.fetch` converts the stored cursor to a numeric
  `since` watermark.
- `RelayEntry.cursor` on this path is now `String(created_at)`; within-response dedupe by event id handles
  pool-merge and boundary-second redelivery (ingest already dedupes by id, REQ-SYN-09).
- Contract split documented on `RelayEntry.cursor` in `src/relay/types.ts`: HttpRelay = opaque server token;
  NostrRelay = seconds watermark fed back as `since`. The two implementations no longer silently disagree.
- Also removed a stray `localeCompare` survivor in the sort (codepoint compare now).

Tests: watermark shape, post-watermark completeness regardless of hex order, boundary dedupe — plus the two
existing tag-validation tests still green. Sync suites untouched and green.

## Task 2 — real renderer pilot: 3 files converted, findings counted

Stack choice (justified in JOURNAL.md): **@testing-library/dom + jsdom + Svelte 5 native `mount()`**.
Two hard blockers were found and worked around:
1. `@testing-library/svelte`'s wrapper crashed ("Cannot access 'props' before initialization") mounting this
   legacy-mode component under vitest — bypassed by calling `mount()` from `svelte` directly.
2. `@lucide/svelte` precompiled icons throw `$props` TDZ under vitest browser conditions, killing the whole
   App subtree — stubbed via vitest-only alias (`test/stubs/lucide-icons.ts`). Production unaffected.
Also required: svelte plugin + `resolve.conditions:["browser"]` + `fileParallelism:false` (this Windows box's
fork-worker spawns time out under parallel load) in vitest.config.

Converted files (rendered through the REAL App.svelte, driving landing → trip-card → app-shell):
| file | source-passed claims that FAILED on first render | rendered truths now pinned |
|---|---|---|
| reconciliation-ui | 0 hard fails, 1 blindness: old regex covered both banner branches, could not tell which activates | duplicate hints render "may be the same as" with live Merge / Not same buttons |
| settlement-ui | **3 wrong assumptions**: currency is `USD 10.00` not `$10.00`; unclaimed payee renders **`cash`** not pending (REQ-SET-06 live); Confirm absent w/o local payee claim while Void present for recorder | row text/status/action gating asserted in DOM |
| manual-fallback-ui | **1 scenario landmine**: donor+joiner sharing one IndexedDB makes the recovery panel silently VANISH (GroupCreated leaks via shared tag) — naive conversion was green with zero panel | evicted heading, First-time/Had-it-before toggle, primary-link Import JSON, blocked-recovery copy |

Answer to the headline question: yes — assertions that passed as source-text DID fail once actually rendered
(4 across the pilot). The UI layer had never been rendered in a test before this CR.

Cost estimate for the remaining 15 files: harness/config/stubs are proven, ~30–60 min each including
state-driving and flake-hardening ≈ **1–2 working days of agent time**.

## Task 3 — grading standard, stated plainly

**Source-shape evidence alone is NOT sufficient for a `Built` grade when the requirement is a UI behaviour** —
the pilot proved source-passing claims can be false on render. But mass-downgrading ~40 rows would trade one
inaccuracy for another, so per instruction: STATUS.md gained an **`Evidence: rendered | source-shape`**
column on every row (currently 5 rendered / 111 source-shape), and the standard is recorded in the header:
Built requires assertion-level evidence matching requirement semantics; the column records the modality.
DUR-03/DUR-06 remain honestly Partial. ID-12 re-examined: its CR-011 closure was source-shape; the rendered
reconciliation pilot now covers the banner live → ID-12 upgraded to `rendered`.

## Task 4 — REQ-ID-17 + stop hand-counting

- ID-17 audited at assertion level (Notes cell added): `core/test/fold.test.ts` asserts contradiction
  surfacing WITHOUT altering merge balances (:382 region) and EVERY transitive merge edge with per-edge undo
  (:403); reconciliation-ui asserts one undo action per edge. Verdict: Built, source-shape.
- Enumeration corrected to **16 numeric phase-4 rows (ID-12/13/14/16/**17**/19, MON-17, SET-04..09,
  SEC-02/06/08) + SEC-01's verify half**; both STATUS prose spots now agree.
- New guard test in `test/config.test.ts`: computes the phase-column histogram from PRD §7 at runtime
  (expects 12×3, 16×4, 8×5, exactly one split cell SEC-01) and asserts STATUS.md's stated scope quotes those
  computed numbers. Hand-counted audit numbers can no longer drift from the PRD.

## Verification

Core: 81/81. Root: 196/196 (63 files). svelte-check 0 errors / 0 warnings. `npm run build` **exit 0**.
Stability work en route: explicit timeouts for load-sensitive sync/UI tests, `fileParallelism:false`
(fork-spawn timeouts under parallel load), lucide stub, TL wrapper bypass — all infra, no behaviour change.

## Commits (all on main, no PR)

`590f92c` extraction · `772bc79` cursor fix + contract · (pilot) config/stubs/tests · housekeeping +
histogram guard · mitigation timeouts. Report file: `.agents/cr-012-report.md`.
