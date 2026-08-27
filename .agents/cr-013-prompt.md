# CR-013 — final work order and standing handover

Delivered as a chat message on 2026-08-26. Parts 2, 3, 4 installed verbatim in
`.agents/PROTOCOL.md`. This file records the task list for audit.

---

## Part 0 — Context

The continuation hook fires more than once on completed state (CR-012 summary emitted
twice verbatim; JOURNAL.md has verbatim duplicate entries). Find root cause in Task 1.

The engineering has been sound; self-reporting has been unreliable every CR. Part 2
exists to close that gap without a human reviewer.

---

## Part 1 — Tasks

### Task 1 — integrity fixes and protocol installation

- Create `.agents/PROTOCOL.md` with Parts 2, 3, 4 verbatim
- Write `.agents/cr-012-report.md` retroactively (missing; every prior CR has one)
- De-duplicate `JOURNAL.md` (both CR-011 entries twice); add dedup test; find + name the double-append cause
- Fix `STATUS.md` REQ-ID-17: 7 cells instead of 6 (stray empty cell at position 5)
- Extend drift guard in `test/config.test.ts`: assert every STATUS row has exactly header cell count; Evidence cell is exactly `rendered` or `source-shape`
- Restore two-suite gate report: report both core (81) and root numbers always
- Fix `test/settlement-ui.test.ts:114-115`: same `toContain("cash")` assertion twice
- Add report-existence gate: fail build if `.agents/cr-NNN-report.md` absent for CR in most recent commit
- Silence idle loop: record in `STATE.md` that when no prompt and no started backlog item, correct behaviour is stop — not re-emit summary

### Task 2 — convert the remaining 15 UI test files

```
common-expense-ui        device-id-privacy-ui     duplicate-banner-ui
durability-prompts-ui    empty-state-ui           expense-workflow-ui
export-prompt-ui         identity-backup-ui       join-recovery-boundary
landing-ui               lifecycle-ui             participant-claim-ui
protection-status-ui     storage-persistence-ui   sync-honesty-ui
```

For each file report: (1) source-text assertions that failed on render; (2) for each
failure — was the TEST wrong or the APP wrong? A stuck file with honest reason is fine.
Never adjust a test to match broken behaviour.

### Task 3 — re-grade against what you now know

Update Evidence column across all 116 rows. State the grading standard with the
measured error rate (~1.3 wrong per file from pilot). State plainly: how many Built on
rendered, how many on source-shape, and whether source-shape is still sufficient.

### Task 4 — run Part 2 against your own CR-013 work

Execute the full verification protocol against Tasks 1–3. Include completed checklist
in `.agents/cr-013-report.md` with pass/fail per item and command output for numerics.

---

Parts 2, 3, 4 (permanent protocol, backlog, standing rules) are in `.agents/PROTOCOL.md`.
