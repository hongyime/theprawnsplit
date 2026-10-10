<script lang="ts">
  // Expense draft state and preview calculations stay beside this form. Trip
  // retains shared roster selection, event creation, reserved IDs and commit.
  import { tick } from "svelte";
  import Icon from "@/lib/Icon.svelte";
  import NeoButton from "@/lib/NeoButton.svelte";
  import { formatMinor, formatMinorInput, type SplitMode } from "@/lib/money";
  import { currencyAmountPreview, normalizeCurrency } from "@/lib/multicurrency";
  import { canAppendExpense } from "@/lib/expense-command";
  import { buildPayerPreview, type PayerMode } from "@/lib/payers";
  import { preserveSplitInputs } from "@/lib/split-preservation";
  import { currencyOptions } from "@/lib/currencies";
  import { buildSharePreview, type ExpenseDraftPayload, type SharePreview } from "@/trip/expense-draft";

  interface Participant { pid: string; name: string }
  interface SubgroupPreset { id: string; name: string; pids: string[] }

  export let archived: boolean;
  export let hasLocalClaim: boolean;
  export let currency: string;
  export let participants: Participant[];
  export let selectedPids: Record<string, boolean>;
  export let subgroupPresets: SubgroupPreset[];
  export let expenseCurrency: string;
  export let payerPid: string;
  export let payerAmounts: Record<string, string>;
  export let addExpense: (draft: ExpenseDraftPayload) => void | Promise<void>;
  export let notify: (message: string) => void;
  export let saveSubgroupPreset: (name: string, pids: string[]) => void | Promise<void>;
  export let applySubgroup: (id: string) => void;
  export let deleteSubgroup: (id: string) => void | Promise<void>;
  export let participantLabel: (pid: string) => string;

  let expenseDesc = "";
  let expenseTotal = "";
  let exchangeRate = "";
  let payerMode: PayerMode = "single";
  let splitMode: SplitMode = "equal";
  let exactShares: Record<string, string> = {};
  let shareWeights: Record<string, string> = {};
  let percentages: Record<string, string> = {};
  let subgroupName = "";
  let showExpenseHint = false;
  let expenseBlockReason = "";
  let saveStatus = "";
  let saveStatusEl: HTMLParagraphElement | undefined;
  let draftXid = crypto.randomUUID();

  $: selectedParticipants = participants.filter((participant) => selectedPids[participant.pid]);
  $: participantPids = participants.map((participant) => participant.pid);
  $: expenseCurrencyOptions = currencyOptions(expenseCurrency || currency);
  $: amountPreview = currencyAmountPreview({
    amountText: expenseTotal,
    currency: expenseCurrency || currency,
    baseCurrency: currency,
    rateText: exchangeRate,
  });
  $: sharePreview = buildSharePreview(amountPreview, participants, selectedPids, splitMode, exactShares, shareWeights, percentages, draftXid);
  $: payerPreview = buildPayerPreview(amountPreview.ok ? amountPreview.baseMinor : null, payerMode, payerPid, payerAmounts, participantPids);
  $: canSaveExpense = canAppendExpense({
    archived,
    hasLocalClaim,
    description: expenseDesc,
    amountOk: amountPreview.ok,
    sharesOk: sharePreview.ok,
    payersOk: payerPreview.ok,
  });
  $: {
    if (archived) expenseBlockReason = "This trip is archived.";
    else if (!hasLocalClaim) expenseBlockReason = participants.length === 0 ? "Add and claim yourself first." : "Claim yourself before saving expenses.";
    else if (!expenseDesc.trim()) expenseBlockReason = "Add a short description.";
    else if (!amountPreview.ok) expenseBlockReason = amountPreview.message;
    else if (!payerPreview.ok) expenseBlockReason = payerPreview.message;
    else if (!sharePreview.ok) expenseBlockReason = sharePreview.message;
    else expenseBlockReason = "";
  }

  function selectedPidList(): string[] {
    return selectedParticipants.map((participant) => participant.pid);
  }

  function splitModeLabel(mode: SplitMode): string {
    return mode.replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }

  function changeSplitMode(nextMode: SplitMode): void {
    if (archived) return;
    saveStatus = "";
    const fromMode = splitMode;
    const preview = sharePreview;
    const total = amountPreview.ok ? amountPreview.baseMinor : null;
    splitMode = nextMode;
    if (!preview.ok || total === null || total === 0n) {
      for (const participant of selectedParticipants) {
        shareWeights[participant.pid] ||= "1";
        percentages[participant.pid] ||= "";
      }
      return;
    }
    const preserved = preserveSplitInputs({ fromMode, toMode: nextMode, preview, selectedPids: selectedPidList(), total });
    exactShares = preserved.exactShares;
    shareWeights = preserved.shareWeights;
    percentages = preserved.percentages;
  }

  function changePayerMode(nextMode: PayerMode): void {
    if (archived) return;
    saveStatus = "";
    payerMode = nextMode;
    if (nextMode === "multiple" && amountPreview.ok && payerPid) {
      payerAmounts = { ...payerAmounts, [payerPid]: formatMinorInput(amountPreview.baseMinor) };
    }
  }

  async function submitExpense(): Promise<void> {
    if (!sharePreview.ok || !payerPreview.ok || !canSaveExpense || !amountPreview.ok) {
      showExpenseHint = true;
      if (expenseBlockReason) notify(expenseBlockReason);
      return;
    }
    saveStatus = "";
    await addExpense({
      xid: draftXid,
      description: expenseDesc.trim(),
      baseMinor: amountPreview.baseMinor,
      rate: amountPreview.rate,
      payers: payerPreview.payers,
      shares: sharePreview.shares,
    });
    saveStatus = "Expense saved.";
    expenseDesc = "";
    expenseTotal = "";
    exchangeRate = "";
    payerAmounts = {};
    draftXid = crypto.randomUUID();
    showExpenseHint = false;
    await tick();
    if (window.matchMedia?.("(max-width: 720px)").matches) {
      saveStatusEl?.scrollIntoView?.({ block: "center" });
    }
  }

  async function submitSubgroupPreset(): Promise<void> {
    await saveSubgroupPreset(subgroupName, selectedPidList());
    subgroupName = "";
  }
</script>

<article class="panel expense">
  <h2><Icon name="receipt-text" size={18} /> Add Expense</h2>
  <div class="form-grid">
    <input value={expenseDesc} placeholder="Description" disabled={archived} on:input={(e) => { expenseDesc = (e.currentTarget as HTMLInputElement).value; showExpenseHint = true; saveStatus = ""; }} />
    <input value={expenseTotal} inputmode="decimal" placeholder="Total" disabled={archived} on:input={(e) => { expenseTotal = (e.currentTarget as HTMLInputElement).value; showExpenseHint = true; saveStatus = ""; }} />
    <div class="currency-row">
      <select class="currency" bind:value={expenseCurrency} aria-label="Expense Currency" disabled={archived} on:change={() => (expenseCurrency = normalizeCurrency(expenseCurrency || currency))}>
        {#each expenseCurrencyOptions as code}
          <option value={code}>{code}</option>
        {/each}
      </select>
      {#if normalizeCurrency(expenseCurrency || currency) !== currency}
        <input bind:value={exchangeRate} inputmode="decimal" placeholder={`1 ${normalizeCurrency(expenseCurrency)} To ${currency}`} aria-label="Exchange rate to group currency" disabled={archived} on:input={() => (showExpenseHint = true)} />
      {/if}
    </div>
    <div class="segmented payer-mode" aria-label="Payer Mode">
      <button type="button" class:active={payerMode === "single"} disabled={archived} on:click={() => changePayerMode("single")}>One Paid</button>
      <button type="button" class:active={payerMode === "multiple"} disabled={archived} on:click={() => changePayerMode("multiple")}>Many Paid</button>
    </div>
    {#if payerMode === "single"}
      <select bind:value={payerPid} disabled={archived}>
        {#each participants as participant}<option value={participant.pid}>{participant.name} Paid</option>{/each}
      </select>
    {:else}
      <div class="split-table payer-table">
        {#each participants as participant}
          <label>
            <span>{participant.name}</span>
            <input bind:value={payerAmounts[participant.pid]} inputmode="decimal" placeholder="0.00" disabled={archived} />
          </label>
        {/each}
      </div>
    {/if}
    <div class="segmented">
      {#each ["equal", "exact", "shares", "percentage"] as mode}
        <button type="button" class:active={splitMode === mode} disabled={archived} on:click={() => changeSplitMode(mode as SplitMode)}>{splitModeLabel(mode as SplitMode)}</button>
      {/each}
    </div>
  </div>

  {#if selectedParticipants.length}
    <div class="split-table">
      {#each selectedParticipants as participant}
        <label>
          <span>{participant.name}</span>
          {#if splitMode === "exact"}
            <input bind:value={exactShares[participant.pid]} inputmode="decimal" placeholder="0.00" disabled={archived} />
          {:else if splitMode === "shares"}
            <input bind:value={shareWeights[participant.pid]} inputmode="numeric" placeholder="1" disabled={archived} />
          {:else if splitMode === "percentage"}
            <input bind:value={percentages[participant.pid]} inputmode="decimal" placeholder="%" disabled={archived} />
          {:else}
            <span>{sharePreview.ok ? formatMinor(sharePreview.shares.find((s) => s.pid === participant.pid)?.minor ?? 0n, currency) : "—"}</span>
          {/if}
        </label>
      {/each}
    </div>
  {/if}
  <!-- Subgroup presets only make sense with 3+ people (a saved subset of 2 is
       just 'the other person'). Hidden below that so a small trip's form stays small. -->
  {#if participants.length >= 3 || subgroupPresets.length}
  <div class="subgroup-tools">
    <div class="row subgroup-save">
      <input bind:value={subgroupName} placeholder="Save Subgroup" disabled={archived} />
      <button type="button" class="secondary" disabled={archived || !subgroupName.trim() || selectedParticipants.length === 0} on:click={submitSubgroupPreset}>Save</button>
    </div>
    {#if subgroupPresets.length}
      <div class="subgroup-list" aria-label="Subgroups">
        {#each subgroupPresets as preset}
          <span>
            <button type="button" class="secondary" disabled={archived} on:click={() => applySubgroup(preset.id)}>{preset.name}</button>
            <button type="button" class="secondary" disabled={archived} on:click={() => deleteSubgroup(preset.id)} title="Delete Subgroup">x</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>
  {/if}
  {#if expenseBlockReason && (showExpenseHint || !hasLocalClaim || archived)}<p class="hint action-hint">{expenseBlockReason}</p>{/if}
  {#if amountPreview.ok && sharePreview.ok && sharePreview.remainderPid}<p class="hint">Rounding Remainder Goes To {participantLabel(sharePreview.remainderPid)}.</p>{/if}
  <NeoButton class={!canSaveExpense ? 'blocked' : ''} disabled={!canSaveExpense} onclick={submitExpense}><Icon name="plus" size={17} /> Save Expense</NeoButton>
  {#if saveStatus}<p bind:this={saveStatusEl} class="expense-save-status" role="status">{saveStatus}</p>{/if}
</article>
