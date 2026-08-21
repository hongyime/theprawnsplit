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
    Archive,
    GitMerge,
  } from "@lucide/svelte";
  import { allocate, fold, greedySettlement, type Event, type VerificationContext, type State } from "@theprawnsplit/core";
  import {
    appendEvents,
    createExport,
    createIdentityBackup,
    createJoinSeed,
    ensureClaimIdentity,
    ensureGroup,
    parseExport,
    recordAppLaunch,
    replaceFromExport,
    restoreIdentityBackup,
    saveGroup,
    stringifyExport,
    syncCounts,
    updateMeta,
    type GroupRecord,
    type JoinSeed,
    type SyncCounts,
  } from "@/db/repo";
  import {
    dismissInstallPrompt,
    installPromptLevel,
    normalizeDurabilityPromptState,
    shouldPromptFirstZeroExport,
    shouldPromptPinLink,
    shouldPromptSevenDayExport,
    type DurabilityPromptState,
    type ExportPromptReason,
    type InstallPromptLevel,
  } from "@/lib/durability";
  import { signClaim } from "@/crypto/claim";
  import { config } from "@/config";
  import { defaultExpenseDate, defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
  import { formatMinor, parseMinor, type SplitMode } from "@/lib/money";
  import { isArchivedEventLog } from "@/lib/archive";
  import { findParticipantNameMatch, groupParticipantsForClaim, type ParticipantNameMatch } from "@/lib/participants";
  import { buildVerificationContext } from "@/lib/verification";
  import { syncOnce } from "@/relay/sync";
  import type { SyncResult } from "@/relay/types";

  let group: GroupRecord | null = null;
  let state: State | null = null;
  let verificationContext: VerificationContext | undefined;
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
  let isDesktop = false;
  let isOnline = navigator.onLine;
  let activeInstallLevel: InstallPromptLevel | null = null;
  let showPinLinkPrompt = false;
  let activeExportPrompt: ExportPromptReason | null = null;
  let launchDurability: DurabilityPromptState | null = null;
  let recoveryMode: "first-join" | "evicted" = "first-join";
  let claimCandidatePid = "";

  $: participants = state ? [...state.participants.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  $: balances = state && group ? [...state.balances.entries()].sort(([a], [b]) => participantLabel(a).localeCompare(participantLabel(b))) : [];
  $: expenses = state ? [...state.expenses.values()].sort((a, b) => b.date.localeCompare(a.date)) : [];
  $: settlements = state ? [...state.settlements.values()] : [];
  $: anomalies = state ? state.anomalies : [];
  $: reconciliationAnomalies = anomalies.filter((anomaly) =>
    ["possible-duplicate-participants", "distinct-participants-merged", "contested-participant-claim"].includes(anomaly.code),
  );
  $: selectedParticipants = participants.filter((p) => selectedPids[p.pid]);
  $: suggestedSettlements = state ? greedySettlement(state.balances) : [];
  $: sharePreview = buildSharePreview();
  $: localClaimPids = new Set(group?.identities.map((identity) => identity.pid) ?? []);
  $: hasLocalClaim = localClaimPids.size > 0;
  $: unconfirmedCount = counts.local + counts.published;
  $: manualFallbackDue = Boolean(group?.meta.unsyncedSince && Date.now() - group.meta.unsyncedSince > 600_000);
  $: joinBlocked = Boolean(group && !group.events.some((event) => event.t === "GroupCreated"));
  $: recoveryActive = Boolean(joiningFromLink && joinBlocked);
  $: canSaveExpense = Boolean(!archived && hasLocalClaim && payerPid && expenseDesc.trim() && parseMinor(expenseTotal) !== null && sharePreview.ok);
  $: storageLabel = persistedStorage === null ? "storage unknown" : persistedStorage ? "storage protected" : "storage best effort";
  $: syncLabel = unconfirmedCount === 0 ? "sync current" : `${unconfirmedCount} unsynced`;
  $: archived = isGroupArchived();
  $: showInstallHint = !isStandalone && !isDesktop && isOnline && !archived;
  $: participantNameMatch = findParticipantNameMatch(participantName, participants);
  $: participantClaimGroups = groupParticipantsForClaim(participants);
  $: claimCandidate = claimCandidatePid ? participants.find((participant) => participant.pid === claimCandidatePid) : undefined;

  async function load(): Promise<void> {
    loading = true;
    error = "";
    try {
      const seed = readJoinSeed();
      joiningFromLink = Boolean(seed);
      recoveryMode = seed ? readRecoveryMode() : "first-join";
      group = await ensureGroup(seed);
      launchDurability = normalizeDurabilityPromptState(group.meta.durability);
      group = { ...group, meta: await recordAppLaunch(group.groupId) };
      await refreshState();
      await refreshCounts();
      await refreshProtectionStatus();
      await refreshDurabilityPrompts();
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

  async function refreshState(): Promise<void> {
    if (!group) return;
    verificationContext = await buildVerificationContext(group);
    state = fold(group.events, { supportedVersion: 1 }, verificationContext);
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
    await refreshState();
    await refreshDurabilityPrompts();
  }

  async function addParticipant(): Promise<void> {
    const name = participantName.trim();
    if (!name || !group || joinBlocked || archived) return;
    const match = findParticipantNameMatch(name, participants);
    if (match) {
      selectedPids = { ...selectedPids, [match.pid]: true };
      error = `${match.name} already exists. Claim that person or resolve the duplicate before adding another record.`;
      return;
    }
    const f = factory();
    await commit([defaultParticipant(f, name)], f);
    participantName = "";
  }

  function requestClaimParticipant(pid: string): void {
    if (!group || localClaimPids.has(pid) || archived) return;
    const participant = participants.find((p) => p.pid === pid);
    if (!participant || participant.devices.length > 0) {
      error = "This participant already has a claiming device. Phase 2 does not self-authorise extra devices.";
      return;
    }
    claimCandidatePid = pid;
  }

  async function claimParticipant(pid: string): Promise<void> {
    if (!group || localClaimPids.has(pid) || archived) return;
    const participant = participants.find((p) => p.pid === pid);
    if (!participant || participant.devices.length > 0) {
      error = "This participant already has a claiming device. Phase 2 does not self-authorise extra devices.";
      claimCandidatePid = "";
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
    claimCandidatePid = "";
  }

  async function mergeParticipants(from: string, into: string): Promise<void> {
    if (!group || archived || from === into) return;
    const f = factory();
    await commit([makeEvent(f, "ParticipantMerged", { from, into })], f);
  }

  async function markParticipantsDistinct(a: string, b: string): Promise<void> {
    if (!group || archived || a === b) return;
    const f = factory();
    await commit([makeEvent(f, "ParticipantsMarkedDistinct", { a, b })], f);
  }

  async function voidEvent(targetId: string): Promise<void> {
    if (!group || archived) return;
    const f = factory();
    await commit([makeEvent(f, "EventVoided", { targetId })], f);
  }

  function participantClaimEvent(eventId?: string): Extract<Event, { t: "ParticipantClaimed" }> | undefined {
    return group?.events.find((event): event is Extract<Event, { t: "ParticipantClaimed" }> => event.t === "ParticipantClaimed" && event.id === eventId);
  }

  function participantAddedEvent(pid: string): Extract<Event, { t: "ParticipantAdded" }> | undefined {
    return group?.events.find((event): event is Extract<Event, { t: "ParticipantAdded" }> => event.t === "ParticipantAdded" && event.pid === pid);
  }

  function firstParticipantClaim(pid: string): Extract<Event, { t: "ParticipantClaimed" }> | undefined {
    return group?.events.find((event): event is Extract<Event, { t: "ParticipantClaimed" }> => event.t === "ParticipantClaimed" && event.pid === pid);
  }

  function formatEventTime(wall?: number): string {
    if (!wall) return "unknown time";
    return new Date(wall).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function shortDevice(deviceId?: string): string {
    if (!deviceId) return "unknown device";
    if (deviceId === group?.deviceId) return "this device";
    return `device ${deviceId.slice(0, 8)}`;
  }

  function participantClaimAttribution(pid: string): string {
    const claim = firstParticipantClaim(pid);
    if (!claim) return "Not claimed yet";
    return `Claimed by ${shortDevice(claim.deviceId)} on ${formatEventTime(claim.hlc.wall)}`;
  }

  function participantAddAttribution(pid: string): string {
    const added = participantAddedEvent(pid);
    if (!added) return "Added by unknown device";
    return `Added by ${shortDevice(added.dev)} on ${formatEventTime(added.hlc.wall)}`;
  }

  function claimBalance(pid: string): string {
    return formatMinor(state?.balances.get(pid) ?? 0n, group?.currency ?? "USD");
  }

  function matchText(match: ParticipantNameMatch): string {
    if (match.kind === "exact") return `${match.name} already exists.`;
    if (match.kind === "prefix") return `${match.name} looks like the same person.`;
    return `${match.name} is within two edits of this name.`;
  }

  function localPeerIdentityFor(pid: string) {
    return group?.identities.find((identity) => identity.pid !== pid);
  }

  async function reattestClaim(eventId?: string): Promise<void> {
    if (!group || archived) return;
    const claim = participantClaimEvent(eventId);
    if (!claim) return;
    const attestor = localPeerIdentityFor(claim.pid);
    if (!attestor) return;
    const f = factory();
    const sig = await signClaim(attestor.claimSkJwk, attestor.alg, `${group.tagHex}:reattest:${claim.pid}:${claim.deviceId}:${claim.claimPk}`);
    await commit(
      [
        makeEvent(f, "ClaimReattested", {
          pid: claim.pid,
          newDevice: claim.deviceId,
          newClaimPk: claim.claimPk,
          alg: claim.alg,
          attestor: attestor.pid,
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
    if (!group || !sharePreview.ok || !payerPid || archived) return;
    const total = parseMinor(expenseTotal);
    if (total === null) return;
    const wasFirstExpense = expenses.length === 0;
    const f = factory();
    const dates = defaultExpenseDate();
    const event = makeEvent(f, "ExpenseAdded", {
      xid: crypto.randomUUID(),
      financials: makeExpenseFinancials(total, payerPid, sharePreview.shares),
      desc: expenseDesc.trim(),
      ...dates,
    });
    await commit([event], f);
    if (wasFirstExpense) {
      await requestStoragePersistenceAfterFirstExpense();
      await markFirstExpensePersistenceRequested();
    }
    expenseDesc = "";
    expenseTotal = "";
  }

  async function voidExpense(xid: string): Promise<void> {
    if (archived) return;
    const f = factory();
    await commit([makeEvent(f, "ExpenseVoided", { xid })], f);
  }

  async function editExpense(xid: string): Promise<void> {
    if (archived) return;
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
    if (archived) return;
    const minor = parseMinor(amount);
    if (!minor || !from || !to || from === to) return;
    const f = factory();
    await commit([makeEvent(f, "SettlementRecorded", { sid: crypto.randomUUID(), from, to, minor })], f);
    settleAmount = "";
  }

  function localIdentityForPid(pid: string) {
    return group?.identities.find((identity) => identity.pid === pid);
  }

  async function confirmSettlement(sid: string): Promise<void> {
    if (!group || archived) return;
    const settlement = state?.settlements.get(sid);
    if (!settlement) return;
    const identity = localIdentityForPid(settlement.to);
    if (!identity) return;
    const f = factory();
    const claimSig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:confirm:${sid}`);
    await commit([makeEvent(f, "SettlementConfirmed", { sid, pid: settlement.to, claimSig })], f);
  }

  function downloadExport(reason?: ExportPromptReason): void {
    if (!group) return;
    const blob = new Blob([stringifyExport(createExport(group))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${group.name || "trip"}-ledger.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (reason) void markExportPromptHandled(reason);
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

  async function archiveGroup(): Promise<void> {
    if (!group || archived) return;
    const label = suggestedSettlements.length
      ? suggestedSettlements.map((transfer) => `${participantLabel(transfer.from)} pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group!.currency)}`).join("\n")
      : "All balances are zero.";
    const ok = window.confirm(`Archive this trip?\n\nOutstanding balances:\n${label}\n\nA ledger export will download before the archive event is recorded.`);
    if (!ok) return;
    downloadExport();
    const f = factory();
    await commit(
      [
        makeEvent(f, "GroupArchived", {
          outstanding: suggestedSettlements.map((transfer) => ({ from: transfer.from, to: transfer.to, minor: transfer.minor })),
        }),
      ],
      f,
    );
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

  function readRecoveryMode(): "first-join" | "evicted" {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return params.get("recovery") === "evicted" ? "evicted" : "first-join";
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
      const artifact = parseExport(importText);
      group = artifact.type === "TripLedgerExport" ? await replaceFromExport(artifact) : await restoreIdentityBackup(artifact);
      importText = "";
      joiningFromLink = false;
      recoveryAttempted = false;
      lastSyncResult = null;
      syncStatus = artifact.type === "DeviceIdentityBackup" ? "Identity backup restored." : syncStatus;
      await refreshState();
      await refreshCounts();
      await refreshDurabilityPrompts();
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
      await refreshState();
      await refreshCounts();
      await refreshDurabilityPrompts();
      syncStatus = `${result.published} published, ${result.confirmed} confirmed, ${result.received} received, ${result.buffered} buffered, ${result.dropped} dropped, ${result.snapshotsSeen} snapshots seen, ${result.snapshotsPublished} snapshots published${result.errors.length ? `; ${result.errors[0]}` : "."}`;
    } catch (err) {
      syncStatus = "Sync failed. Manual export/import is still available.";
      error = err instanceof Error ? err.message : String(err);
    } finally {
      syncing = false;
    }
  }

  function recoveryMessage(): string {
    if (!recoveryAttempted || syncing) {
      return recoveryMode === "evicted"
        ? "This device looks empty. Recovering from relays before showing anything stale."
        : "Recovering from relays before rendering an empty ledger.";
    }
    if (!lastSyncResult) {
      return recoveryMode === "evicted"
        ? "Relay recovery did not complete. Import your latest TripLedgerExport to restore this device."
        : "Relay recovery did not complete. Manual import is available.";
    }
    if (lastSyncResult.received > 0) return "Raw events were recovered. Balances will render from the event log.";
    if (lastSyncResult.snapshotsSeen > 0) {
      return "A relay snapshot was found and used only for transport bootstrap. Raw event history is still reconciling.";
    }
    if (lastSyncResult.errors.length > 0) return `Relay recovery failed: ${lastSyncResult.errors[0]}`;
    return recoveryMode === "evicted"
      ? "No raw events were recovered yet. Import is the fastest way back onto this trip."
      : "No raw events were recovered yet. Import a TripLedgerExport or retry sync.";
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
    isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    isOnline = navigator.onLine;
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

  function isGroupArchived(): boolean {
    return isArchivedEventLog(group?.events ?? []);
  }

  function allBalancesZero(): boolean {
    return balances.length > 0 && balances.every(([, minor]) => minor === 0n);
  }

  function hasNonZeroBalance(): boolean {
    return balances.some(([, minor]) => minor !== 0n);
  }

  async function patchDurability(update: (state: DurabilityPromptState) => DurabilityPromptState): Promise<void> {
    if (!group) return;
    const meta = await updateMeta(group.groupId, (current) => ({
      ...current,
      durability: update(normalizeDurabilityPromptState(current.durability)),
    }));
    group = { ...group, meta };
  }

  async function refreshDurabilityPrompts(): Promise<void> {
    if (!group || !state) return;
    await refreshProtectionStatus();
    if (hasNonZeroBalance() && !group.meta.durability?.hadNonZeroBalance) {
      await patchDurability((durability) => ({ ...durability, hadNonZeroBalance: true }));
    }
    const current = normalizeDurabilityPromptState(group.meta.durability);
    const returnWindow = launchDurability ? { ...current, lastSeenAt: launchDurability.lastSeenAt } : current;
    activeInstallLevel = installPromptLevel({
      state: returnWindow,
      expenseCount: expenses.length,
      isStandalone,
      isArchived: isGroupArchived(),
      isOnline,
      isDesktop,
      persisted: persistedStorage,
      now: Date.now(),
    });
    if (activeInstallLevel === 3 && current.installModalShownSession !== current.sessionCount) {
      await patchDurability((durability) => ({ ...durability, installModalShownSession: durability.sessionCount }));
    }
    showPinLinkPrompt = shouldPromptPinLink(current);
    activeExportPrompt = shouldPromptFirstZeroExport(current, allBalancesZero())
      ? "first-zero"
      : shouldPromptSevenDayExport(returnWindow, persistedStorage, Date.now())
        ? "seven-day"
        : null;
  }

  async function dismissActiveInstallPrompt(): Promise<void> {
    if (!activeInstallLevel) return;
    const level = activeInstallLevel;
    activeInstallLevel = null;
    await patchDurability((durability) => dismissInstallPrompt(durability, level));
    await refreshDurabilityPrompts();
  }

  async function markPinLinkPromptHandled(copy = false): Promise<void> {
    if (copy) await copyJoinLink();
    showPinLinkPrompt = false;
    await patchDurability((durability) => ({ ...durability, pinLinkPromptedAt: Date.now() }));
    await refreshDurabilityPrompts();
  }

  async function markExportPromptHandled(reason: ExportPromptReason): Promise<void> {
    activeExportPrompt = null;
    await patchDurability((durability) => ({
      ...durability,
      firstZeroExportPromptedAt: reason === "first-zero" ? Date.now() : durability.firstZeroExportPromptedAt,
      sevenDayExportPromptedAt: reason === "seven-day" ? Date.now() : durability.sevenDayExportPromptedAt,
    }));
    await refreshDurabilityPrompts();
  }

  function downloadPromptExport(): void {
    if (!activeExportPrompt) return;
    downloadExport(activeExportPrompt);
  }

  async function dismissActiveExportPrompt(): Promise<void> {
    if (!activeExportPrompt) return;
    await markExportPromptHandled(activeExportPrompt);
  }

  async function markFirstExpensePersistenceRequested(): Promise<void> {
    if (!group || group.meta.durability?.firstExpensePersistRequestedAt) return;
    await patchDurability((durability) => ({ ...durability, firstExpensePersistRequestedAt: Date.now() }));
  }

  function markActivity(): void {
    lastActivityAt = Date.now();
  }

  function startPolling(): void {
    if (pollHandle !== undefined) window.clearInterval(pollHandle);
    pollHandle = window.setInterval(() => {
      if (!group || document.hidden || isGroupArchived()) return;
      const idle = Date.now() - lastActivityAt > config.idleAfterMs;
      const cadence = idle ? config.pollIdleMs : config.pollActiveMs;
      if (Date.now() - (group.meta.lastSyncAt ?? 0) >= cadence) void runSync();
    }, 5_000);
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("visibilitychange", () => void refreshProtectionStatus());
    window.addEventListener("online", () => void refreshDurabilityPrompts());
    window.addEventListener("offline", () => void refreshDurabilityPrompts());
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
        {#if showInstallHint}<div class="subtle">On iOS, use Share then Add to Home Screen for offline launch.</div>{/if}
      </div>
      <div class="header-actions">
        <input class="currency" value={group.currency} aria-label="Currency" on:change={(e) => setCurrency((e.currentTarget as HTMLInputElement).value)} />
        <button type="button" disabled={syncing} on:click={runSync} title="Sync now"><RefreshCcw size={18} /> {syncing ? "Syncing" : "Sync"}</button>
        <button type="button" on:click={copyJoinLink} title="Copy join link"><Link size={18} /> Link</button>
        <button type="button" on:click={() => downloadExport()} title="Export ledger"><Download size={18} /> Export</button>
        <button type="button" disabled={archived} on:click={archiveGroup} title="Archive trip"><Archive size={18} /> Archive</button>
      </div>
    </header>

    {#if error}<p class="error">{error}</p>{/if}
    {#if archived}<p class="warning">This trip is archived. The ledger remains readable and exportable.</p>{/if}
    {#if state.frozen}<p class="warning">A newer ledger event was retained but excluded. Balances are not authoritative until the app is updated.</p>{/if}
    {#if manualFallbackDue}<p class="warning">Relay confirmation is still pending. Export the ledger or copy the join link to share manually.</p>{/if}
    {#if showPinLinkPrompt}
      <section class="prompt-banner">
        <div>
          <strong>Pin the trip link</strong>
          <p>Keep the join link in your group chat so a wiped device can recover before showing an empty ledger.</p>
        </div>
        <div class="prompt-actions">
          <button type="button" on:click={() => markPinLinkPromptHandled(true)}><Link size={17} /> Copy link</button>
          <button type="button" class="secondary" on:click={() => markPinLinkPromptHandled(false)}>Dismiss</button>
        </div>
      </section>
    {/if}
    {#if activeExportPrompt}
      <section class="prompt-banner important">
        <div>
          <strong>{activeExportPrompt === "first-zero" ? "Balances are settled" : "Export a recovery copy"}</strong>
          <p>{activeExportPrompt === "first-zero" ? "All balances reached zero for the first time." : "This device returned after more than 7 days without protected storage."}</p>
        </div>
        <div class="prompt-actions">
          <button type="button" on:click={downloadPromptExport}><Download size={17} /> Export</button>
          <button type="button" class="secondary" on:click={dismissActiveExportPrompt}>Dismiss</button>
        </div>
      </section>
    {/if}
    {#if activeInstallLevel && activeInstallLevel < 3}
      <section class:sticky-install={activeInstallLevel === 2} class="prompt-banner install">
        <div>
          <strong>{activeInstallLevel === 1 ? "Install for safer storage" : "Protect this trip"}</strong>
          <p>Use Add to Home Screen to reduce browser storage eviction risk.</p>
        </div>
        <div class="prompt-actions">
          <button type="button" class="secondary" on:click={dismissActiveInstallPrompt}>Dismiss</button>
        </div>
      </section>
    {/if}
    {#if recoveryActive}
      <section class="recovery-panel">
        <div>
          <h2>{recoveryMode === "evicted" ? "Device Storage Empty" : "Join Trip"}</h2>
          <p>{recoveryMessage()}</p>
          <div class="recovery-mode" aria-label="Recovery mode">
            <button type="button" class:active={recoveryMode === "first-join"} on:click={() => (recoveryMode = "first-join")}>First time here</button>
            <button type="button" class:active={recoveryMode === "evicted"} on:click={() => (recoveryMode = "evicted")}>Had it before</button>
          </div>
        </div>
        <div class="recovery-actions">
          {#if recoveryMode === "evicted"}
            <a class="primary-link" href="#manual-import">Import JSON</a>
            <button type="button" disabled={syncing} on:click={runSync}><RefreshCcw size={17} /> {syncing ? "Recovering" : "Retry sync"}</button>
          {:else}
            <button type="button" disabled={syncing} on:click={runSync}><RefreshCcw size={17} /> {syncing ? "Recovering" : "Retry sync"}</button>
            <a href="#manual-import">Import JSON</a>
          {/if}
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

    {#if reconciliationAnomalies.length}
      <section class="reconcile-panel" aria-label="Reconciliation issues">
        <h2><GitMerge size={18} /> Reconcile People</h2>
        {#each reconciliationAnomalies as anomaly}
          <div class="reconcile-row">
            <div>
              {#if anomaly.code === "possible-duplicate-participants" && anomaly.pid && anomaly.relatedPid}
                <strong>{participantLabel(anomaly.pid)} may be the same as {participantLabel(anomaly.relatedPid)}</strong>
                <span>Resolve the duplicate hint without changing balances automatically.</span>
              {:else if anomaly.code === "distinct-participants-merged"}
                <strong>People marked distinct are currently merged</strong>
                <span>{anomaly.message}</span>
              {:else if anomaly.code === "contested-participant-claim" && anomaly.pid}
                <strong>{participantLabel(anomaly.pid)} has an unverified recovered device</strong>
                <span>{participantClaimEvent(anomaly.eventId)?.deviceId ?? "A device"} needs peer re-attestation before it can confirm settlements.</span>
              {:else}
                <strong>{anomaly.code}</strong>
                <span>{anomaly.message}</span>
              {/if}
            </div>
            <div class="reconcile-actions">
              {#if anomaly.code === "possible-duplicate-participants" && anomaly.pid && anomaly.relatedPid}
                <button type="button" disabled={archived} on:click={() => mergeParticipants(anomaly.relatedPid!, anomaly.pid!)}>Merge</button>
                <button type="button" class="secondary" disabled={archived} on:click={() => markParticipantsDistinct(anomaly.pid!, anomaly.relatedPid!)}>Not same</button>
              {:else if anomaly.code === "distinct-participants-merged"}
                {#if anomaly.relatedEventId}
                  <button type="button" disabled={archived} on:click={() => voidEvent(anomaly.relatedEventId!)}>Undo merge</button>
                {/if}
                {#if anomaly.eventId}
                  <button type="button" class="secondary" disabled={archived} on:click={() => voidEvent(anomaly.eventId!)}>Remove mark</button>
                {/if}
              {:else if anomaly.code === "contested-participant-claim" && anomaly.pid}
                {#if localPeerIdentityFor(anomaly.pid)}
                  <button type="button" disabled={archived} on:click={() => reattestClaim(anomaly.eventId)}>Re-attest</button>
                {/if}
                {#if anomaly.eventId}
                  <button type="button" class="secondary" disabled={archived} on:click={() => voidEvent(anomaly.eventId!)}>Void claim</button>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      </section>
    {/if}

    <section class="grid">
      <article class="panel roster">
        <h2><Users size={18} /> People</h2>
        {#if participants.length === 0}
          <div class="empty">
            {#if recoveryActive}
              <p>Waiting for recovered trip data.</p>
              <button type="button" disabled={syncing} on:click={runSync}><RefreshCcw size={17} /> Retry sync</button>
            {:else}
              <p>Add people to start a trip ledger.</p>
              <button type="button" on:click={() => downloadExport()}><Download size={17} /> Share trip file</button>
            {/if}
          </div>
        {:else}
          {#if participantClaimGroups.unclaimed.length}
            <div class="claim-section primary-claim">
              <h3>Unclaimed</h3>
              <ul class="people-list">
                {#each participantClaimGroups.unclaimed as participant}
                  <li>
                    <label>
                      <input type="checkbox" bind:checked={selectedPids[participant.pid]} />
                      <span>
                        <strong>{participant.name}</strong>
                        <small>{participantAddAttribution(participant.pid)}</small>
                      </span>
                    </label>
                    <span class="person-actions">
                      shadow
                      {#if !archived}
                        <button type="button" on:click={() => requestClaimParticipant(participant.pid)} title="Claim participant"><KeyRound size={15} /> Claim</button>
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if participantClaimGroups.claimed.length}
            <details class="claim-section claimed-section">
              <summary>Claimed people ({participantClaimGroups.claimed.length})</summary>
              <ul class="people-list">
                {#each participantClaimGroups.claimed as participant}
                  <li>
                    <label>
                      <input type="checkbox" bind:checked={selectedPids[participant.pid]} />
                      <span>
                        <strong>{participant.name}</strong>
                        <small>{participantClaimAttribution(participant.pid)}</small>
                      </span>
                    </label>
                    <span class="person-actions">
                      {participant.devices.length} device
                      {#if localClaimPids.has(participant.pid)}
                        <span>you</span>
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        {/if}
        <form class="row create-person" on:submit|preventDefault={addParticipant}>
          <input bind:value={participantName} placeholder="Add shadow participant" />
          <button type="submit" disabled={joinBlocked || archived}><Plus size={17} /> Add</button>
        </form>
        {#if participantNameMatch}
          <p class="hint duplicate-hint">{matchText(participantNameMatch)} Select the existing person before creating a new one.</p>
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
        {#if archived}<p class="hint">Archived trips are read-only.</p>{:else if !hasLocalClaim}<p class="hint">Viewing is enabled. Expense creation requires claiming one participant on this device.</p>{/if}
        {#if !sharePreview.ok}<p class="hint">{sharePreview.message}</p>{:else if sharePreview.remainderPid}<p class="hint">Rounding remainder goes to {participantLabel(sharePreview.remainderPid)}.</p>{/if}
        <button type="button" disabled={!canSaveExpense} on:click={addExpense}><Plus size={17} /> Save expense</button>
      </article>

      <article class="panel settlements">
        <h2><RefreshCcw size={18} /> Settle</h2>
        {#each suggestedSettlements as transfer}
          <button type="button" class="settle-suggestion" disabled={archived} on:click={() => recordSettlement(transfer.from, transfer.to, String(Number(transfer.minor) / 100))}>
            {participantLabel(transfer.from)} pays {participantLabel(transfer.to)} {formatMinor(transfer.minor, group.currency)}
          </button>
        {/each}
        <div class="form-grid">
          <select bind:value={settleFrom}><option value="">From</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
          <select bind:value={settleTo}><option value="">To</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
          <input bind:value={settleAmount} inputmode="decimal" placeholder="Amount" />
          <button type="button" disabled={archived} on:click={() => recordSettlement(settleFrom, settleTo, settleAmount)}>Record</button>
        </div>
        {#if settlements.length}
          <div class="settlement-list">
            {#each settlements as settlement}
              <div class="settlement-row">
                <span>{participantLabel(settlement.from)} paid {participantLabel(settlement.to)} {formatMinor(settlement.minor, group.currency)}</span>
                <span class="settlement-state">
                  <strong class:positive={settlement.confirmed} class:negative={settlement.disputed || settlement.contestedConfirmation}>
                    {settlement.disputed ? "disputed" : settlement.contestedConfirmation ? "contested" : settlement.confirmed ? "confirmed" : settlement.cashUnconfirmable ? "cash" : "pending"}
                  </strong>
                  {#if settlement.pending && localIdentityForPid(settlement.to)}
                    <button type="button" disabled={archived} on:click={() => confirmSettlement(settlement.sid)}>Confirm</button>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
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
            <button type="button" disabled={archived} on:click={() => editExpense(expense.xid)} title="Edit expense"><ReceiptText size={16} /></button>
            <button type="button" disabled={archived} on:click={() => voidExpense(expense.xid)} title="Void expense"><Trash2 size={16} /></button>
          </div>
        </div>
      {/each}
      {#if expenses.length === 0}<p class="hint">No expenses yet.</p>{/if}
    </section>

    <section class="panel import-panel" id="manual-import">
      <h2><Upload size={18} /> Import Recovery JSON</h2>
      <textarea bind:value={importText} placeholder="Paste a TripLedgerExport or DeviceIdentityBackup JSON file here"></textarea>
      <button type="button" disabled={!importText.trim()} on:click={importExport}>Import</button>
    </section>
    {#if claimCandidate}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Claim participant">
          <h2>Claim {claimCandidate.name}</h2>
          <dl class="claim-details">
            <div>
              <dt>Added</dt>
              <dd>{participantAddAttribution(claimCandidate.pid)}</dd>
            </div>
            <div>
              <dt>Current balance</dt>
              <dd>{claimBalance(claimCandidate.pid)}</dd>
            </div>
            <div>
              <dt>This device</dt>
              <dd>{shortDevice(group.deviceId)} will be able to confirm settlements for {claimCandidate.name}.</dd>
            </div>
          </dl>
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={() => (claimCandidatePid = "")}>Cancel</button>
            <button type="button" on:click={() => claimParticipant(claimCandidate.pid)}><KeyRound size={16} /> Claim</button>
          </div>
        </div>
      </div>
    {/if}
    {#if activeInstallLevel && activeInstallLevel >= 3}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Protect this trip">
          <h2>{activeInstallLevel === 4 ? "Storage survived" : "Storage is still best effort"}</h2>
          <p>{activeInstallLevel === 4 ? "This trip returned after more than 7 days. Keep a fresh export and install the app when possible." : "Install the app so the browser can give this trip stronger storage protection."}</p>
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={dismissActiveInstallPrompt}>Dismiss</button>
          </div>
        </div>
      </div>
    {/if}
  </main>
{:else}
  <main class="center">Unable to open local ledger.</main>
{/if}
