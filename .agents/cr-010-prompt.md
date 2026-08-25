CR-010 — trunk-based workflow, CI coverage, and status-register truthing.

WORKFLOW CHANGE, effective now: work directly on main. No feature branches,
no PRs. Commit and push to main. Record this rule in .agents/STATE.md, NOT in
AGENTS.md (AGENTS.md is overwritten by the sync-repo-settings workflow).

Task 1 — land CR-009 and clean up
- Merge cr-009-status-register into main (verified conflict-free) and close PR #5.
- Delete remote branches cr-009-status-register and cr-008-doc-reconcile
  (cr-008 is already fully merged into main).
- Leave the two dependabot branches alone.

Task 2 — restore CI under the new workflow
In .github/workflows/ci.yml:
- Add a `push: branches: [main]` trigger alongside the existing pull_request one.
- Add "**.svelte" to BOTH path filter lists. src/App.svelte is 1,775 lines and
  has never triggered Build Check.
- Push and paste the resulting Actions run URL and conclusion. Do not report
  this task complete on the basis of the YAML diff alone.

Task 3 — revert the PRD phase-column corruption
- REQ-MON-08's phase cell currently reads "Built". Restore it to "5".
- The phase column is scope planning (§15), not status. STATUS.md owns status.
  Add one line under the PRD §7 requirements table stating this, so the
  distinction is written down and not re-litigated.
- Keep the §8.1 schema-versioning rewrite from CR-009. That part was correct.

Task 4 — close the §16.2 gaps (diff supplied, do not re-derive)
Ten of twelve §16.2 properties are covered by core/test/properties.test.ts.
Three need work:

  4a. REQ-SYN-24, "drift verdicts identical on every replica regardless of
      ingestion time" — GAP. properties.test.ts:485 is single-replica. Add a
      property that ingests the SAME future-dated event into two simulated
      replicas at different `now` values (one before retryAt, one after),
      advances both past retryAt, and asserts canonicalStateBytes are identical.
      This is the PRD row's actual assertion.

  4b. REQ-SYN-12 associativity — PARTIAL. properties.test.ts:112 asserts
      commutativity (reversal) and idempotence (duplication) only. Add
      re-grouping: fold((A∪B)∪C) === fold(A∪(B∪C)) over generated event sets.

  4c. REQ-ID-13 opposing-direction merges — WEAK. The pair arbitrary can emit
      (a,b) and (b,a) but nothing forces it. Pin an explicit case: concurrent
      ParticipantMerged(a→b) and ParticipantMerged(b→a) at concurrent HLCs,
      asserted convergent in both delivery orders.

Task 5 — status register truthing (this is the real work)
STATUS.md currently reads 116 Built / 0 Partial / 0 Not started. For a project
whose STATE.md says Phase 2 is in progress, that distribution is not credible.
The CR-009 pass verified that referenced files EXIST. It did not verify that
the requirement's assertion HOLDS.

Re-audit every row where the PRD phase column is 3, 4, or 5 (37 rows). For each:
- Read the requirement text. Read the cited test. Answer one question: does that
  test actually assert what the requirement says, or does it just touch the same
  area of code?
- Downgrade to Partial (with a one-line note on what is missing) or Not started
  wherever the answer is no.
- I expect a non-zero number of downgrades. A second all-green result will be
  treated as an unperformed audit, not as good news.

Do not fabricate evidence. If you cannot verify a row, mark it Unverified and say
so. An honest Unverified is a correct answer; an invented citation is not.

Task 6 — close A13
- Read limitation.max_message_length from the NIP-11 document of each of the four
  default relays. Record the values in .agents/task0-retention.md.
- Publish one batch of 50 ledger events as a single message. Record accept/reject
  per relay, verbatim reason text on rejection.
- Update PRD §12 A13 with the verdict: verified, false, or relay-dependent. If
  relay-dependent, note that the mitigation ("reduce batch size dynamically per
  relay") is now required work, not a contingency, and add it as a follow-up.

Report in the .agents/cr-XXX-report.md house style. Update STATE.md and
JOURNAL.md. Do not open a PR.
