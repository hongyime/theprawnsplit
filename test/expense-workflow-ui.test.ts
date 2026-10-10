// CR-013 Task 2 — BLOCKED from rendered conversion.
// Extensive assertions about changeSplitMode, changePayerMode, addExpense, editExpense, voidExpense function bodies. Source-level only.
// Evidence for all assertions in this file: source-shape.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

function panelSource(name: string): string {
  // Expense draft state and split/payer transitions live beside ExpensePanel.
  return readFileSync(join(process.cwd(), "src", "trip", name), "utf8");
}

describe("expense workflow UI boundary", () => {
  it("keeps money entry wired to preserved splits, multi-payer rows, stored dates, and append-only corrections", () => {
    const source = appSource();
    const expensePanelSource = panelSource("ExpensePanel.svelte");
    const expensePanel = expensePanelSource.match(/<article class="panel expense">([\s\S]*?)<\/article>/)?.[1] ?? "";
    const ledgerPanel = panelSource("LedgerPanel.svelte").match(/<section class="panel ledger">([\s\S]*?)<\/section>/)?.[1] ?? "";
    const changeSplitMode = expensePanelSource.match(/function changeSplitMode\(nextMode: SplitMode\): void \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const changePayerMode = expensePanelSource.match(/function changePayerMode\(nextMode: PayerMode\): void \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const submitExpense = expensePanelSource.match(/async function submitExpense\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const addExpense = source.match(/async function addExpense\(draft: ExpenseDraftPayload\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const editExpense = source.match(/async function editExpense\(xid: string\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const voidExpense = source.match(/async function voidExpense\(xid: string\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(expensePanelSource).toContain("$: payerPreview = buildPayerPreview(amountPreview.ok ? amountPreview.baseMinor : null, payerMode, payerPid, payerAmounts, participantPids);");
    expect(changeSplitMode).toContain("const preserved = preserveSplitInputs({ fromMode, toMode: nextMode, preview, selectedPids: selectedPidList(), total });");
    expect(changeSplitMode).toContain("exactShares = preserved.exactShares;");
    expect(changeSplitMode).toContain("shareWeights = preserved.shareWeights;");
    expect(changeSplitMode).toContain("percentages = preserved.percentages;");
    expect(changePayerMode).toContain('if (nextMode === "multiple" && amountPreview.ok && payerPid)');
    expect(changePayerMode).toContain("payerAmounts = { ...payerAmounts, [payerPid]: formatMinorInput(amountPreview.baseMinor) };");

    expect(expensePanel).toContain('aria-label="Payer Mode"');
    expect(expensePanel).toContain('on:click={() => changePayerMode("multiple")}>Many Paid');
    expect(expensePanel).toContain('bind:value={payerAmounts[participant.pid]} inputmode="decimal"');
    expect(expensePanel).toContain("{#each [\"equal\", \"exact\", \"shares\", \"percentage\"] as mode}");
    expect(expensePanel).toContain("on:click={() => changeSplitMode(mode as SplitMode)}");
    expect(expensePanel).toContain("Rounding Remainder Goes To {participantLabel(sharePreview.remainderPid)}.");

    expect(submitExpense).toContain("await addExpense({");
    expect(submitExpense).toContain("xid: draftXid,");
    expect(addExpense).toContain("const dates = defaultExpenseDate();");
    expect(addExpense).toContain("const financials = makeExpenseFinancials(draft.baseMinor, draft.payers, draft.shares);");
    expect(addExpense).toContain('makeEvent(f, "ExpenseAdded"');
    expect(addExpense).toContain("...dates,");
    expect(addExpense).toContain("xid: draft.xid,");
    expect(addExpense).toContain("draft.rate ? 2 : 1");
    expect(editExpense).toContain('makeEvent(f, "ExpenseEdited"');
    expect(editExpense).toContain("financials.rate ? 2 : 1");
    expect(editExpense).toContain("editFinancialsForTotal({ current: expense.financials, nextMinor: minor, eventId: id })");
    expect(editExpense).toContain("meta: { desc: desc.trim() || expense.desc }");
    expect(voidExpense).toContain('makeEvent(f, "ExpenseVoided", { xid })');

    expect(ledgerPanel).toContain("<span>{expense.date}</span>");
    expect(ledgerPanel).toContain("{payerSummary(expense.financials.payers)}");
    expect(ledgerPanel).toContain("{rateSummary(expense.financials.rate)}");
    expect(ledgerPanel).toContain("{expense.financialHistory.length - 1} Correction");
    expect(ledgerPanel).toContain("on:click={() => editExpense(expense.xid)}");
    expect(ledgerPanel).toContain("on:click={() => voidExpense(expense.xid)}");
    expect(ledgerPanel).not.toMatch(/new Date\(expense\.at\)|toLocaleDateString\(.*expense\.at/);
  });
});
