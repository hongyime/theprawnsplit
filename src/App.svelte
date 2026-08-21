<script lang="ts">
  import {
    Download,
    Plus,
    ReceiptText,
    RefreshCcw,
    KeyRound,
    Link,
    ShieldCheck,
    Trash2,
    Upload,
    Users,
    WalletCards,
  } from "@lucide/svelte";
  import { allocate, fold, greedySettlement, type Event, type State } from "@theprawnsplit/core";
  import {
    appendEvents,
    createExport,
    createIdentityBackup,
    createJoinSeed,
    ensureClaimIdentity,
    ensureGroup,
    parseExport,
    replaceFromExport,
    saveGroup,
    stringifyExport,
    syncCounts,
    type GroupRecord,
    type JoinSeed,
    type SyncCounts,
  } from "@/db/repo";
  import { signClaim } from "@/crypto/claim";
  import { config } from "@/config";
  import { defaultExpenseDate, defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
  import { formatMinor, parseMinor, type SplitMode } from "@/lib/money";
  import { syncOnce } from "@/relay/sync";
  import type { SyncResult } from "@/relay/types";

  let group: GroupRecord | null = null;
  let state: State | null = null;
  let loading = true;
  let error = "";
  let participantName = "";
  let payerPid = "";
  let expenseDesc = "";
  let expenseTotal = "";
  let splitMode: SplitMode = "equal";
  let exactShares: Record<string, string> = {};
  let shareWeights: Record<string, string> = {};
  let percentages: Record<string, string> = {};
  let selectedPids: Record<string, boolean> = {};
  let settleFrom = "";
  let settleTo = "";
  let settleAmount = "";
  let importText = "";
  let syncStatus = "Not synced yet.";
  let syncing = false;
  let joiningFromLink = false;
  let recoveryAttempted = false;
  let lastSyncResult: SyncResult | null = null;
  let counts: SyncCounts = { local: 0, published: 0, confirmed: 0 };
  let lastActivityAt = Date.now();
  let pollHandle: number | undefined;
  let isStandalone = false;
  let persistedStorage: boolean | null = null;
  let persistenceRequested = false;

  $: participants = state ? [...state.participants.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  $: balances = state && group ? [...state.balances.entries()].sort(([a], [b]) => participantLabel(a).localeCompare(participantLabel(b))) : [];
  $: expenses = state ? [...state.expenses.values()].sort((a, b) => b.date.localeCompare(a.date)) : [];
  $: settlements = state ? [...state.settlements.values()] : [];
  $: selectedParticipants = participants.filter((p) => selectedPids[p.pid]);
  $: suggestedSettlements = state ? greedySettlement(state.balances) : [];
  $: sharePreview = buildSharePreview();
  $: localClaimPids = new Set(group?.identities.map((identity) => identity.pid) ?? []);
  $: hasLocalClaim = localClaimPids.size > 0;
  $: unconfirmedCount = counts.local + counts.published;
  $: manualFallbackDue = Boolean(group?.meta.unsyncedSince && Date.now() - group.meta.unsyncedSince > 600_000);
  $: joinBlocked = Boolean(group && !group.events.some((event) => event.t === "GroupCreated"));
  $: recoveryActive = Boolean(joiningFromLink && joinBlocked);
  $: canSaveExpense = Boolean(hasLocalClaim && payerPid && expenseDesc.trim() && parseMinor(expenseTotal) !== null && sharePreview.ok);
  $: storageLabel = persistedStorage === null ? "storage unknown" : persistedStorage ? "storage protected" : "storage best effort";
  $: syncLabel = unconfirmedCount === 0 ? "sync current" : `${unconfirmedCount} unsynced`;

  async function load(): Promise<void> {
    loading = true;
    error = "";
    try {
      const seed = readJoinSeed();
      joiningFromLink = Boolean(seed);
      group = await ensureGroup(seed);
      refreshState();
      await refreshCounts();
      await refreshProtectionStatus();
      if (joinBlocked) await runSync();
      if (participants.length === 0) {
        selectedPids = {};
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function refreshState(): void {
    if (!group) return;
    state = fold(group.events, { supportedVersion: 1 });
    const nextSelected: Record<string, boolean> = { ...selectedPids };
    for (const participant of state.participants.values()) {
      if (nextSelected[participant.pid] === undefined) nextSelected[participant.pid] = true;
    }
    selectedPids = nextSelected;
    payerPid ||= [...state.participants.keys()][0] ?? "";
  }

  async function refreshCounts(): Promise<void> {
    if (!group) return;
    counts = await syncCounts(group.groupId);
  }

  function factory(): EventFactory {
    if (!group) throw new Error("No group");
    return { deviceId: group.deviceId, nextCounter: group.nextCounter };
  }

  async function commit(events: Event[], nextFactory: EventFactory): Promise<void> {
    if (!group) return;
    const updatedGroup = { ...group, nextCounter: nextFactory.nextCounter };
    await saveGroup(updatedGroup);
    group = await appendEvents(group.groupId, events);
    await refreshCounts();
    refreshState();
  }

  async function addParticipant(): Promise<void> {
    const name = participantName.trim();
    if (!name || !group || joinBlocked) return;
    const f = factory();
    await commit([defaultParticipant(f, name)], f);
    participantName = "";
  }

  async function claimParticipant(pid: string): Promise<void> {
    if (!group || localClaimPids.has(pid)) return;
    const participant = participants.find((p) => p.pid === pid);
    if (!participant || participant.devices.length > 0) {
      error = "This participant already has a claiming device. Phase 2 does not self-authorise extra devices.";
      return;
    }
    const identity = await ensureClaimIdentity(group, pid);
    const f = factory();
    const sig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:${pid}:${group.deviceId}:${identity.claimPk}`);
    await commit(
      [
        makeEvent(f, "ParticipantClaimed", {
          pid,
          deviceId: group.deviceId,
          claimPk: identity.claimPk,
          alg: identity.alg,
          sig,
        }),
      ],
      f,
    );
  }

  function participantLabel(pid: string): string {
    return state?.participants.get(pid)?.name ?? pid;
  }

  function selectedPidList(): string[] {
    return participants.filter((participant) => selectedPids[participant.pid]).map((participant) => participant.pid);
  }

  function allocatedShares(total: bigint, weights: bigint[], eventId: string, pids: string[]) {
    const shares = allocate(total, weights, eventId, pids).map((minor, i) => ({ pid: pids[i]!, minor }));
    const weightTotal = weights.reduce((a, b) => a + b, 0n);
    const base = weights.map((weight) => (total * weight) / weightTotal);
    const remainderPid = shares.find((share, index) => share.minor > (base[index] ?? 0n))?.pid;
    return remainderPid ? { shares, remainderPid } : { shares };
  }

  function buildSharePreview(): { ok: true; shares: { pid: string; minor: bigint }[]; remainderPid?: string } | { ok: false; message: string } {
    const total = parseMinor(expenseTotal);
    if (total === null) return { ok: false, message: "Enter a valid total." };
    const pids = selectedPidList();
    if (pids.length === 0) return { ok: false, message: "Select at least one participant." };
    if (splitMode === "equal") {
      const result = allocatedShares(total, pids.map(() => 1n), "preview", pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    if (splitMode === "exact") {
      const shares = pids.map((pid) => ({ pid, minor: parseMinor(exactShares[pid] ?? "") ?? -1n }));
      if (shares.some((share) => share.minor < 0n)) return { ok: false, message: "Every exact share needs an amount." };
      const sum = shares.reduce((a, b) => a + b.minor, 0n);
      if (sum !== total) return { ok: false, message: "Exact shares must sum to the total." };
      return { ok: true, shares };
    }
    if (splitMode === "shares") {
      const weights = pids.map((pid) => BigInt(Math.max(0, Number.parseInt(shareWeights[pid] ?? "0", 10) || 0)));
      if (weights.every((weight) => weight === 0n)) return { ok: false, message: "Enter at least one share weight." };
      const result = allocatedShares(total, weights, "preview", pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    const weights = pids.map((pid) => BigInt(Math.max(0, Math.round(Number(percentages[pid] ?? "0") * 100))));
    if (weights.reduce((a, b) => a + b, 0n) !== 10_000n) return { ok: false, message: "Percentages must total 100%." };
    const result = allocatedShares(total, weights, "preview", pids);
    return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
  }

  function changeSplitMode(nextMode: SplitMode): void {
    const preview = sharePreview;
    const total = parseMinor(expenseTotal);
    splitMode = nextMode;
    if (!preview.ok || total === null || total === 0n) {
      for (const participant of selectedParticipants) {
        shareWeights[participant.pid] ||= "1";
        percentages[participant.pid] ||= "";
      }
      return;
    }
    exactShares = Object.fromEntries(preview.shares.map((share) => [share.pid, (Number(share.minor) / 100).toFixed(2)]));
    shareWeights = Object.fromEntries(preview.shares.map((share) => [share.pid, share.minor > 0n ? share.minor.toString() : "0"]));
    percentages = Object.fromEntries(
      preview.shares.map((share) => [share.pid, ((Number(share.minor) / Number(total)) * 100).toFixed(2)]),
    );
  }

  async function addExpense(): Promise<void> {
    if (!group || !sharePreview.ok || !payerPid) return;
    const total = parseMinor(expenseTotal);
    if (total === null) return;
    const f = factory();
    const dates = defaultExpenseDate();
    const event = makeEvent(f, "ExpenseAdded", {
      xid: crypto.randomUUID(),
      financials: makeExpenseFinancials(total, payerPid, sharePreview.shares),
      desc: expenseDesc.trim(),
      ...dates,
    });
    await commit([event], f);
    await requestStoragePersistenceAfterFirstExpense();
    expenseDesc = "";
    expenseTotal = "";
  }

  async function voidExpense(xid: string): Promise<void> {
    const f = factory();
    await commit([makeEvent(f, "ExpenseVoided", { xid })], f);
  }

  async function editExpense(xid: string): Promise<void> {
    const expense = state?.expenses.get(xid);
    if (!expense) return;
    const desc = window.prompt("Description", expense.desc);
    if (desc === null) return;
    const amount = window.prompt("Total", (Number(expense.financials.minor) / 100).toFixed(2));
    if (amount === null) return;
    const minor = parseMinor(amount);
    if (minor === null) return;
    const f = factory();
    const id = `${f.deviceId}:${f.nextCounter}`;
    const pids = expense.financials.shares.map((share) => share.pid);
    const weights = expense.financials.shares.map((share) => (share.minor > 0n ? share.minor : 1n));
    const shares = allocate(minor, weights, id, pids).map((shareMinor, index) => ({ pid: pids[index]!, minor: shareMinor }));
    const event = makeEvent(f, "ExpenseEdited", {
      xid,
      financials: makeExpenseFinancials(minor, expense.financials.payers[0]?.pid ?? payerPid, shares),
      meta: { desc: desc.trim() || expense.desc },
    });
    await commit([event], f);
  }

  async function recordSettlement(from: string, to: string, amount: string): Promise<void> {
    const minor = parseMinor(amount);
    if (!minor || !from || !to || from === to) return;
    const f = factory();
    await commit([makeEvent(f, "SettlementRecorded", { sid: crypto.randomUUID(), from, to, minor })], f);
    settleAmount = "";
  }

  function downloadExport(): void {
    if (!group) return;
    const blob = new Blob([stringifyExport(createExport(group))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${group.name || "trip"}-ledger.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadIdentityBackup(): void {
    if (!group || group.identities.length === 0) return;
    const ok = window.confirm("This file contains your claim signing key. Anyone with it can impersonate your device for this trip.");
    if (!ok) return;
    const blob = new Blob([stringifyExport(createIdentityBackup(group))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${group.name || "trip"}-identity-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function encodeJoinSeed(seed: JoinSeed): string {
    return btoa(JSON.stringify(seed)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function decodeJoinSeed(value: string): JoinSeed {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JoinSeed;
  }

  function readJoinSeed(): JoinSeed | undefined {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const encoded = params.get("join");
    if (!encoded) return undefined;
    try {
      return decodeJoinSeed(encoded);
    } catch {
      error = "Join link is malformed.";
      return undefined;
    }
  }

  async function copyJoinLink(): Promise<void> {
    if (!group) return;
    const url = new URL(window.location.href);
    url.hash = `join=${encodeJoinSeed(createJoinSeed(group))}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      syncStatus = "Join link copied.";
    } catch {
      window.prompt("Copy join link", url.toString());
    }
  }

  async function importExport(): Promise<void> {
    error = "";
    try {
      group = await replaceFromExport(parseExport(importText));
      importText = "";
      joiningFromLink = false;
      recoveryAttempted = false;
      lastSyncResult = null;
      refreshState();
      await refreshCounts();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function renameGroup(name: string): Promise<void> {
    if (!group) return;
    group = { ...group, name };
    await saveGroup(group);
  }

  async function setCurrency(currency: string): Promise<void> {
    if (!group) return;
    group = { ...group, currency: currency.toUpperCase().slice(0, 3) };
    await saveGroup(group);
  }

  async function runSync(): Promise<void> {
    if (!group || syncing) return;
    syncing = true;
    error = "";
    try {
      const result = await syncOnce(group.groupId);
      recoveryAttempted = true;
      lastSyncResult = result;
      group = await ensureGroup();
      refreshState();
      await refreshCounts();
      syncStatus = `${result.published} published, ${result.confirmed} confirmed, ${result.received} received, ${result.buffered} buffered, ${result.dropped} dropped, ${result.snapshotsSeen} snapshots seen, ${result.snapshotsPublished} snapshots published${result.errors.length ? `; ${result.errors[0]}` : "."}`;
    } catch (err) {
      syncStatus = "Sync failed. Manual export/import is still available.";
      error = err instanceof Error ? err.message : String(err);
    } finally {
      syncing = false;
    }
  }

  function recoveryMessage(): string {
    if (!recoveryAttempted || syncing) return "Recovering from relays before rendering an empty ledger.";
    if (!lastSyncResult) return "Relay recovery did not complete. Manual import is available.";
    if (lastSyncResult.received > 0) return "Raw events were recovered. Balances will render from the event log.";
    if (lastSyncResult.snapshotsSeen > 0) {
      return "A relay snapshot was found and used only for transport bootstrap. Raw event history is still reconciling.";
    }
    if (lastSyncResult.errors.length > 0) return `Relay recovery failed: ${lastSyncResult.errors[0]}`;
    return "No raw events were recovered yet. Import a TripLedgerExport or retry sync.";
  }

  function detectStandalone(): boolean {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  async function refreshProtectionStatus(): Promise<void> {
    isStandalone = detectStandalone();
    persistedStorage = (await navigator.storage?.persisted?.()) ?? null;
  }

  async function requestStoragePersistenceAfterFirstExpense(): Promise<void> {
    if (persistenceRequested || !navigator.storage?.persist) {
      await refreshProtectionStatus();
      return;
    }
    persistenceRequested = true;
    persistedStorage = await navigator.storage.persist();
    isStandalone = detectStandalone();
  }

  function markActivity(): void {
    lastActivityAt = Date.now();
  }

  function startPolling(): void {
    if (pollHandle !== undefined) window.clearInterval(pollHandle);
    pollHandle = window.setInterval(() => {
      if (!group || document.hidden) return;
      const idle = Date.now() - lastActivityAt > config.idleAfterMs;
      const cadence = idle ? config.pollIdleMs : config.pollActiveMs;
      if (Date.now() - (group.meta.lastSyncAt ?? 0) >= cadence) void runSync();
    }, 5_000);
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("visibilitychange", () => void refreshProtectionStatus());
  }

  load();
  startPolling();
</script>

{#if loading}
  <main class="center">Loading local ledger...</main>
{:else if group && state}
  <main class="app-shell">
    <header class="topbar">
      <div>
        <input class="title-input" value={group.name} aria-label="Trip name" on:change={(e) => renameGroup((e.currentTarget as HTMLInputElement).value)} />
        <div class="subtle">No accounts · {unconfirmedCount} unconfirmed · {state.quarantined.length ? "update required" : "ready offline"}</div>
        {#if !isStandalone}<div class="subtle">On iOS, use Share then Add to Home Screen for offline launch.</div>{/if}
      </div>
      <div class="header-actions">
        <input class="currency" value={group.currency} aria-label="Currency" on:change={(e) => setCurrency((e.currentTarget as HTMLInputElement).value)} />
        <button type="button" disabled={syncing} on:click={runSync} title="Sync now"><RefreshCcw size={18} /> {syncing ? "Syncing" : "Sync"}</button>
        <button type="button" on:click={copyJoinLink} title="Copy join link"><Link size={18} /> Link</button>
        <button type="button" on:click={downloadExport} title="Export ledger"><Download size={18} /> Export</button>
      </div>
    </header>

    {#if error}<p class="error">{error}</p>{/if}
    {#if state.frozen}<p class="warning">A newer ledger event was retained but excluded. Balances are not authoritative until the app is updated.</p>{/if}
    {#if manualFallbackDue}<p class="warning">Relay confirmation is still pending. Export the ledger or copy the join link to share manually.</p>{/if}
    {#if recoveryActive}
      <section class="recovery-panel">
        <div>
          <h2>Recover Trip</h2>
          <p>{recoveryMessage()}</p>
        </div>
        <div class="recovery-actions">
          <button type="button" disabled={syncing} on:click={runSync}><RefreshCcw size={17} /> {syncing ? "Recovering" : "Retry sync"}</button>
          <a href="#manual-import">Import JSON</a>
        </div>
      </section>
    {/if}
    <section class="sync-strip">
      <span><ShieldCheck size={17} /> {syncStatus}</span>
      <span class="protection-status" aria-label="Protection status">
        <span class:ok={isStandalone}>{isStandalone ? "installed" : "browser tab"}</span>
        <span class:ok={persistedStorage === true} class:warn={persistedStorage === false}>{storageLabel}</span>
        <span class:ok={unconfirmedCount === 0} class:warn={unconfirmedCount > 0}>{syncLabel}</span>
      </span>
      {#if hasLocalClaim}
        <button type="button" on:click={downloadIdentityBackup}><KeyRound size={17} /> Identity backup</button>
      {:else}
        <span>Claim a person before adding expenses.</span>
      {/if}
    </section>

    <section class="grid">
      <article class="panel roster">
        <h2><Users size={18} /> People</h2>
        <form class="row" on:submit|preventDefault={addParticipant}>
          <input bind:value={participantName} placeholder="Add shadow participant" />
          <button type="submit" disabled={joinBlocked}><Plus size={17} /> Add</button>
        </form>
        {#if participants.length === 0}
          <div class="empty">
            {#if recoveryActive}
              <p>Waiting for recovered trip data.</p>
              <button type="button" disabled={syncing} on:click={runSync}><RefreshCcw size={17} /> Retry sync</button>
            {:else}
              <p>Add people to start a trip ledger.</p>
              <button type="button" on:click={downloadExport}><Download size={17} /> Share trip file</button>
            {/if}
          </div>
        {:else}
          <ul class="people-list">
            {#each participants as participant}
              <li>
                <label><input type="checkbox" bind:checked={selectedPids[participant.pid]} /> {participant.name}</label>
                <span class="person-actions">
                  {participant.devices.length ? `${participant.devices.length} device` : "shadow"}
                  {#if localClaimPids.has(participant.pid)}
                    <span>you</span>
                  {:else if participant.devices.length === 0}
                    <button type="button" on:click={() => claimParticipant(participant.pid)} title="Claim participant"><KeyRound size={15} /> Claim</button>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>

      <article class="panel balances">
        <h2><WalletCards size={18} /> Balances</h2>
        {#each balances as [pid, minor]}
          <div class:positive={minor > 0n} class:negative={minor < 0n} class="balance-row">
            <span>{participantLabel(pid)}</span>
            <strong>{formatMinor(minor, group.currency)}</strong>
          </div>
        {/each}
      </article>

      <article class="panel expense">
        <h2><ReceiptText size={18} /> Expense</h2>
        <div class="form-grid">
          <input bind:value={expenseDesc} placeholder="Description" />
          <input bind:value={expenseTotal} inputmode="decimal" placeholder="Total" />
          <select bind:value={payerPid}>
            {#each participants as participant}<option value={participant.pid}>{participant.name} paid</option>{/each}
          </select>
          <div class="segmented">
            {#each ["equal", "exact", "shares", "percentage"] as mode}
              <button type="button" class:active={splitMode === mode} on:click={() => changeSplitMode(mode as SplitMode)}>{mode}</button>
            {/each}
          </div>
        </div>

        {#if selectedParticipants.length}
          <div class="split-table">
            {#each selectedParticipants as participant}
              <label>
                <span>{participant.name}</span>
                {#if splitMode === "exact"}
                  <input bind:value={exactShares[participant.pid]} inputmode="decimal" placeholder="0.00" />
                {:else if splitMode === "shares"}
                  <input bind:value={shareWeights[participant.pid]} inputmode="numeric" placeholder="1" />
                {:else if splitMode === "percentage"}
                  <input bind:value={percentages[participant.pid]} inputmode="decimal" placeholder="%" />
                {:else}
                  <span>{sharePreview.ok ? formatMinor(sharePreview.shares.find((s) => s.pid === participant.pid)?.minor ?? 0n, group.currency) : "—"}</span>
                {/if}
              </label>
            {/each}
          </div>
        {/if}
        {#if !hasLocalClaim}<p class="hint">Viewing is enabled. Expense creation requires claiming one participant on this device.</p>{/if}
        {#if !sharePreview.ok}<p class="hint">{sharePreview.message}</p>{:else if sharePreview.remainderPid}<p class="hint">Rounding remainder goes to {participantLabel(sharePreview.remainderPid)}.</p>{/if}
        <button type="button" disabled={!canSaveExpense} on:click={addExpense}><Plus size={17} /> Save expense</button>
      </article>

      <article class="panel settlements">
        <h2><RefreshCcw size={18} /> Settle</h2>
        {#each suggestedSettlements as transfer}
          <button type="button" class="settle-suggestion" on:click={() => recordSettlement(transfer.from, transfer.to, String(Number(transfer.minor) / 100))}>
            {participantLabel(transfer.from)} pays {participantLabel(transfer.to)} {formatMinor(transfer.minor, group.currency)}
          </button>
        {/each}
        <div class="form-grid">
          <select bind:value={settleFrom}><option value="">From</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
          <select bind:value={settleTo}><option value="">To</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
          <input bind:value={settleAmount} inputmode="decimal" placeholder="Amount" />
          <button type="button" on:click={() => recordSettlement(settleFrom, settleTo, settleAmount)}>Record</button>
        </div>
        {#if settlements.length}<p class="hint">{settlements.length} settlement event{settlements.length === 1 ? "" : "s"} recorded.</p>{/if}
      </article>
    </section>

    <section class="panel ledger">
      <h2>Ledger</h2>
      {#each expenses as expense}
        <div class="ledger-row">
          <div>
            <strong>{expense.desc}</strong>
            <span>{expense.date}</span>
          </div>
          <div>
            <strong>{formatMinor(expense.financials.minor, group.currency)}</strong>
            <button type="button" on:click={() => editExpense(expense.xid)} title="Edit expense"><ReceiptText size={16} /></button>
            <button type="button" on:click={() => voidExpense(expense.xid)} title="Void expense"><Trash2 size={16} /></button>
          </div>
        </div>
      {/each}
      {#if expenses.length === 0}<p class="hint">No expenses yet.</p>{/if}
    </section>

    <section class="panel import-panel" id="manual-import">
      <h2><Upload size={18} /> Import TripLedgerExport</h2>
      <textarea bind:value={importText} placeholder="Paste a TripLedgerExport JSON file here"></textarea>
      <button type="button" disabled={!importText.trim()} on:click={importExport}>Import</button>
    </section>
  </main>
{:else}
  <main class="center">Unable to open local ledger.</main>
{/if}
