<script lang="ts">
  // T64 (STRUCT-001): ledger (expense history) panel view extracted from
  // Trip.svelte. Controller retains coverage evaluation, edit/void commands,
  // and all persistence. No database or relay ownership here.
  import Icon from "@/lib/Icon.svelte";
  import { formatMinor } from "@/lib/money";
  import { expenseHistoryRows } from "@/lib/expense-history";
  import type { ExpenseState } from "@theprawnsplit/core";

  type ExpenseRow = Pick<ExpenseState, "financials" | "financialHistory" | "activeFinancialIndex"> & {
    xid: string;
    desc: string;
    date: string;
  };

  export let expenses: ExpenseRow[];
  export let archived: boolean;
  export let currency: string;

  export let expenseCoverageLabel: (xid: string) => string;
  export let payerSummary: (payers: { pid: string; minor: bigint }[]) => string;
  export let rateSummary: (rate: { currency: string; toBase: number } | undefined) => string;
  export let editExpense: (xid: string) => void | Promise<void>;
  export let voidExpense: (xid: string) => void | Promise<void>;
</script>

<section class="panel ledger">
  <h2>Ledger</h2>
  {#each expenses as expense}
    {@const coverage = expenseCoverageLabel(expense.xid)}
    <div class="ledger-row">
      <div>
        <strong>{expense.desc}</strong>
        <span>{expense.date}</span>
        <span class="sync-coverage" class:ok-coverage={coverage === "Everyone Has This"}>{coverage}</span>
        <span class="payer-summary">{payerSummary(expense.financials.payers)}</span>
        {#if expense.financials.rate}<span class="payer-summary">{rateSummary(expense.financials.rate)}</span>{/if}
        {#if expense.financialHistory.length > 1}
          <details class="expense-history">
            <summary>{expense.financialHistory.length - 1} Correction{expense.financialHistory.length === 2 ? "" : "s"}</summary>
            {#each expenseHistoryRows(expense) as row}
              <span class:active-history={row.active}>
                {row.label}: {formatMinor(row.financials.minor, currency)}{row.active ? " Active" : ""}
              </span>
            {/each}
          </details>
        {/if}
      </div>
      <div>
        <strong>{formatMinor(expense.financials.minor, currency)}</strong>
        <button type="button" disabled={archived} on:click={() => editExpense(expense.xid)} title="Edit Expense"><Icon name="receipt-text" size={16} /></button>
        <button type="button" disabled={archived} on:click={() => voidExpense(expense.xid)} title="Void Expense"><Icon name="trash" size={16} /></button>
      </div>
    </div>
  {/each}
  {#if expenses.length === 0}<p class="hint">No Expenses Yet.</p>{/if}
</section>
