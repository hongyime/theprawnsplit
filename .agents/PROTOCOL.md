# Agent Protocol — permanent standing instructions

This file was installed by CR-013. It replaces the external reviewer.
Reference this file from STATE.md and from AGENTS.md if a pointer list exists.

---

# Part 2 — The verification protocol (permanent)

Run this against your own work at the end of **every** CR, before writing the report
and before declaring anything complete. Treat your own report as a hostile witness.

The rule underneath all of it: **a claim is not verified until you have re-derived it
by a different route than the one that produced it.**

## Loop A — before you claim a task is done

Repeat until every item passes. If an item fails, fix and restart Loop A from the top;
a late fix can invalidate an earlier pass.

**A1. Re-derive every number.**
Every count in your report must come from a command you just ran, not from memory or
arithmetic done while writing. Paste the command and its output.
```
# counts must be computed, never hand-counted
python3 -c "import re,collections; ..."   # phase histogram, status distribution
grep -c ...                               # row counts, test counts
```
Five CRs running, every hand-counted number was wrong. Compute or do not state.

**A2. Both suites, both numbers.**
```
npm run build            # must exit 0
npm test                 # root — state N/N
npm --prefix core test   # core — state N/N
npx svelte-check         # state errors/warnings
```
Never report one suite's number as the total.

**A3. Verify file existence for everything you cite.**
Every path, every line number, every function name in the report must be re-checked
with a fresh `rg`/`grep` at report-writing time. Paste real output. A citation you
remember writing is not a citation you verified.

**A4. Table and schema shape.**
Any markdown table you edited: assert cell counts match the header, programmatically.
Any enumerated list of IDs: assert it against a computed set, programmatically.

**A5. The report exists and matches.**
`.agents/cr-NNN-report.md` must exist and every claim in it must survive A1–A4.

## Loop B — adversarial self-review

After Loop A passes, review the work as if you were trying to discredit it.

**B1. Is this an instance of a class?**
The largest findings in this project all came from this question and none came from
row-by-row auditing.
- One requirement's convergence looked over-determined → *all twelve* §16.2 properties
  reduced to one untested comparator.
- One requirement's evidence was "source-shape only" → *all eighteen* UI test files
  were source-shape.
For every defect you found or fixed, ask: what category is this an example of, and how
many other instances exist? Then count them.

**B2. Can the test fail?**
A passing test proves nothing until you have seen it go red. For any new test:
- Break the code it covers. Confirm red. Revert.
- For anything load-bearing, break it three different ways.
A mutation that leaves the suite green is a finding and must be reported as one, not
tuned until it goes red.

**B3. RED before GREEN.**
For any bug fix: write the failing test first, run it against unfixed code, record the
actual failure output in the report, then fix. A fix without a recorded RED is an
assertion, not a proof.

**B4. Trace the whole path, across module boundaries.**
The Nostr cursor bug was invisible inside `nostr.ts` and obvious once the path
`nostr.ts → sync.ts → types.ts → http.ts` was read end to end — two implementations of
one implementation of one interface silently disagreeing about the same field. When two
things implement one contract, read both and diff the semantics, not just the types.

**B5. Check the boundary of every sweep.**
CR-011 hardened `core/` correctly and left `src/` unexamined; the next real bug was in
`src/`. When you fix a class of problem, state explicitly where you drew the scope line
and what is on the other side of it.

**B6. Does the conclusion survive your own evidence?**
CR-012 measured that source-text assertions are wrong ~1.3 times per file and then
wrote a grading standard that did not price that in. When your measurement and your
conclusion point different directions, the measurement wins.

**B7. What did you not check?**
End every report with an explicit "not verified this pass" section. An honest gap is
information. A silent gap is how the CR-009 fabrication survived a full review.

## Loop C — before declaring a CR complete

- [ ] Loop A passes, all items, with pasted output
- [ ] Loop B answered in writing, including B7
- [ ] `.agents/cr-NNN-report.md` written
- [ ] `STATE.md` and `JOURNAL.md` updated, no duplicate lines
- [ ] Working tree clean, pushed to main
- [ ] CI run on main is green — paste the run URL and conclusion, not the YAML diff
- [ ] Backlog in `PROTOCOL.md` Part 3 updated: items closed, items discovered

If any box is unchecked, the CR is not complete. Say so plainly rather than rounding up.

---

# Part 3 — Backlog (permanent; keep this updated)

Priority order. When the current CR is done, take the top open item, write it up as
`.agents/cr-NNN-prompt.md` in the same shape as the work orders above, and execute it
under Part 2.

### P0 — Watch this now

**A1 retention verdict may be arriving early.** The 2026-08-26 probe (t≈3.7d) shows
`wss://relay.primal.net` at **0/50, 0% retention** — it was 100% on prior checks. If
that is genuine deletion rather than a read failure, the healthy Nostr pool drops from
three relays to two (nos.lol, nostr.mom), which lands A1 in the pre-agreed "partial"
band: *operated relay carries recovery, Nostr is not genuine redundancy.*

Do this before the 30-day gate (clock started 2026-08-22T12:59:41Z, gate ≈2026-09-21):
- Distinguish read failure from deletion. CR-006 added retry and `—` markers for
  unreachable relays; a successful query returning 0/50 is a different claim from a
  failed query. Confirm which this is, with raw output.
- If deletion: record it in `task0-retention.md`, and note that REQ-SYN-05 quorum
  (operated + ≥1 Nostr ACK) still holds at two relays but has no margin left.
- Do not wait until day 30 to react if the trend is unambiguous before then.

### P1 — Test-suite trustworthiness

- **Mutation-test beyond the comparator.** CR-011 mutation-tested `eventSortKey` and
  found 2 of 3 mutations undetectable. No other module has been mutation-tested. Apply
  B2 to `fold.ts`, `money.ts`, `settle.ts`, `identity.ts`, `transport.ts` — one CR each
  if needed. Expect more decorative tests.
- **Map §16.2.1 adversarial suite properly.** Eight attacks are listed in the PRD. Five
  were spot-confirmed to exist somewhere in the suite; the mapping was never completed
  attack-by-attack. Produce the full table: attack → test file → line → assertion.
- **Semantic audit of phase 1–2 rows.** CR-010 audited only the 36 phase≥3 rows plus
  SEC-01. The remaining ~79 rows have never had an assertion-level audit — they carry
  CR-009 file-existence grading, which is the same pass that contained fabricated
  evidence. This is the single largest untrusted area in STATUS.md.

### P2 — Known gaps with named owners

- **REQ-DUR-03** (Partial): ladder rungs 1 and 4 and the `expenseCount >= 3` trigger
  are unasserted; only session rungs 2–3 and the dismissal cap are tested.
- **REQ-DUR-06** (Partial): recovery-before-render ordering is source-shape containment
  only. CR-013 Task 2 converted join-recovery-boundary.test.ts to rendered — the recovery
  panel renders correctly, but the ordering (recovery attempted BEFORE first render) is still
  only source-shape. DUR-06 remains Partial.
- **A13 mitigation is untested against real relays.** Dynamic batch sizing and
  per-event fallback shipped in CR-011 and were tested against recorded measurements,
  not live. Run the real batch publish against all five defaults and record it.
- **jsdom test-setup blocks (CR-013 discoveries):** Two test scenarios failed to drive app
  state in jsdom and remain undiagnosed: (1) `identity-backup-ui` — `refreshDurabilityPrompts`
  runs once at session init before Svelte re-evaluates `$: hasLocalClaim`; the backup prompt
  never shows with a fake-sig claim. (2) `lifecycle-ui` archived branch — `isGroupArchived()`
  never returns true after seeding a GroupArchived event via makeEvent+appendEvents. Both need
  a follow-up investigation before those two tests can be marked rendered.
- **A15** — awaiting Phase 3 instrumentation.

### P3 — Product work not yet started

- Phase 5 lifecycle rows (LIF-01..07, MON-08) are graded Built but sit in phase 5;
  confirm against the §15 phase plan whether that is accurate or optimistic.
- Operated Vercel relay production env vars (Upstash) — server-side, never verified in
  production.

---

# Part 4 — Standing rules (permanent)

**Workflow.** Work directly on main. No feature branches, no PRs. This rule lives in
`STATE.md` and `PROTOCOL.md`, never in `AGENTS.md`, which is overwritten by the
sync-repo-settings workflow.

**Prompts and reports.** One file per CR: `.agents/cr-NNN-prompt.md` and
`.agents/cr-NNN-report.md`. Never overwrite either. The pair is the audit trail.

**Honesty rules, in order of importance.**
1. Never fabricate evidence. If you cannot verify something, write `Unverified` and
   say why. An honest `Unverified` is a correct answer; an invented citation is a
   corrupted record that outlives the session.
2. Never weaken a test to make it pass. If an assertion fails, either the test is wrong
   or the app is wrong — determine which, in writing, before changing either.
3. Never report an aggregate you did not compute.
4. Never claim complete with an unchecked box in Loop C.
5. Report deviations from the work order explicitly, as their own section. Every
   useful finding in this project's history came from a deviation that was reported
   rather than hidden.

**When idle.** If no prompt file exists and no backlog item is started, stop. Do not
re-emit summaries. Do not invent work. The correct response to a continuation hook
firing on a completed state is a single sentence: "Nothing to do — no prompt file,
no started backlog item." Do not repeat completion summaries.

**When you disagree with a work order.** Say so, do the work, and record the
disagreement in the report. CR-010's "36 vs 37" correction was right on the substance
and wrong on the arithmetic — both facts mattered and both belonged in the report.

**Definition of done for this project.** STATUS.md is only as true as its weakest
evidence class. It is finished when every row is Built on evidence that has been seen
to fail — not when every row says Built.
