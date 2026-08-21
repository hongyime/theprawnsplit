<script lang="ts">
  import {
    Download,
    Plus,
    ReceiptText,
    RefreshCcw,
    KeyRound,
    Link,
    QrCode,
    ShieldCheck,
    Trash2,
    Upload,
    Users,
    WalletCards,
    Archive,
    GitMerge,
    Share2,
    Settings,
  } from "@lucide/svelte";
  import * as QRCode from "qrcode";
  import { allocate, eventSortKey, fold, greedySettlement, type Event, type Financials, type VerificationContext, type State } from "@theprawnsplit/core";
  import {
    appendEvents,
    applyDelta,
    createDelta,
    createExport,
    createIdentityBackup,
    createJoinSeed,
    ensureClaimIdentity,
    ensureGroup,
    parseExport,
    pendingOutboundEvents,
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
    exportPromptReason,
    installPromptLevel,
    normalizeDurabilityPromptState,
    shouldPromptIdentityBackup,
    shouldPromptPinLink,
    type DurabilityPromptState,
    type ExportPromptReason,
    type InstallPromptLevel,
  } from "@/lib/durability";
  import { signClaim } from "@/crypto/claim";
  import { config } from "@/config";
  import { defaultExpenseDate, defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
  import { formatMinor, formatMinorInput, formatPercentageInput, parseMinor, parsePercentageBasisPoints, parseShareWeight, type SplitMode } from "@/lib/money";
  import { isArchivedEventLog } from "@/lib/archive";
  import { createDeviceLinkRequest, linkPayload, parseDeviceLinkRequest, type DeviceLinkRequest } from "@/lib/device-link";
  import { expenseHistoryRows } from "@/lib/expense-history";
  import { frozenViewPolicy } from "@/lib/freeze-policy";
  import { buildJoinLink, decodeJoinSeed } from "@/lib/join-link";
  import { isManualFallbackDue } from "@/lib/manual-fallback";
  import {
    archiveConfirmationText,
    canEditGroupProfile,
    createArchiveTransitionPlan,
    isSettledViewPredicate,
    latestArchiveEvent,
    shouldPollGroup,
    unarchiveConfirmationText,
  } from "@/lib/lifecycle";
  import { currencyAmountPreview, normalizeCurrency } from "@/lib/multicurrency";
  import { buildPayerPreview, type PayerMode } from "@/lib/payers";
  import { claimAttributionText, defaultSplitSelection, findParticipantNameMatch, groupParticipantsForClaim, type ParticipantNameMatch } from "@/lib/participants";
  import { relayDiagnosticActionText } from "@/lib/relay-diagnostics";
  import { normalizeRelaySettings, parseNostrRelayText, relaySettingsTargetCount, type RelaySettings } from "@/lib/relay-settings";
  import { reattestationStatus } from "@/lib/reattestation";
  import { canVoidRecordedSettlement, settlementClaimView } from "@/lib/settlement-history";
  import { applySubgroupSelection, deleteSubgroupPreset, upsertSubgroupPreset } from "@/lib/subgroups";
  import { isEventCoveredByEveryKnownDevice } from "@/lib/sync-coverage";
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
  let payerMode: PayerMode = "single";
  let payerAmounts: Record<string, string> = {};
  let expenseDesc = "";
  let expenseTotal = "";
  let expenseCurrency = "";
  let exchangeRate = "";
  let splitMode: SplitMode = "equal";
  let exactShares: Record<string, string> = {};
  let shareWeights: Record<string, string> = {};
  let percentages: Record<string, string> = {};
  let selectedPids: Record<string, boolean> = {};
  let settleFrom = "";
  let settleTo = "";
  let settleAmount = "";
  let importText = "";
  let joinQrDataUrl = "";
  let syncStatus = "Not synced yet.";
  let syncing = false;
  let joiningFromLink = false;
  let recoveryAttempted = false;
  let lastSyncResult: SyncResult | null = null;
  let counts: SyncCounts = { local: 0, published: 0, confirmed: 0 };
  let lastActivityAt = Date.now();
  let nowMs = Date.now();
  let pollHandle: number | undefined;
  let isStandalone = false;
  let persistedStorage: boolean | null = null;
  let persistenceRequested = false;
  let isDesktop = false;
  let isOnline = navigator.onLine;
  let activeInstallLevel: InstallPromptLevel | null = null;
  let showPinLinkPrompt = false;
  let showIdentityBackupPrompt = false;
  let activeExportPrompt: ExportPromptReason | null = null;
  let launchDurability: DurabilityPromptState | null = null;
  let recoveryMode: "first-join" | "evicted" = "first-join";
  let claimCandidatePid = "";
  let relaySettingsOpen = false;
  let relayUseOperated = true;
  let relayOperatedEndpoint = "";
  let relayNostrText = "";
  let relaySettingsError = "";
  let subgroupName = "";

  $: participants = state ? [...state.participants.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  $: balances = state && group ? [...state.balances.entries()].sort(([a], [b]) => participantLabel(a).localeCompare(participantLabel(b))) : [];
  $: expenses = state ? [...state.expenses.values()].sort((a, b) => b.date.localeCompare(a.date)) : [];
  $: settlements = state ? [...state.settlements.values()] : [];
  $: anomalies = state ? state.anomalies : [];
  $: reconciliationAnomalies = anomalies.filter((anomaly) =>
    ["possible-duplicate-participants", "distinct-participants-merged", "unverified-reclaim"].includes(anomaly.code),
  );
  $: selectedParticipants = participants.filter((p) => selectedPids[p.pid]);
  $: participantPids = participants.map((participant) => participant.pid);
  $: suggestedSettlements = state ? greedySettlement(state.balances) : [];
  $: amountPreview = currencyAmountPreview({
    amountText: expenseTotal,
    currency: expenseCurrency || group?.currency || "USD",
    baseCurrency: group?.currency || "USD",
    rateText: exchangeRate,
  });
  $: sharePreview = buildSharePreview();
  $: payerPreview = buildPayerPreview(amountPreview.ok ? amountPreview.baseMinor : null, payerMode, payerPid, payerAmounts, participantPids);
  $: localClaimPids = new Set(group?.identities.map((identity) => identity.pid) ?? []);
  $: hasLocalClaim = localClaimPids.size > 0;
  $: unconfirmedCount = counts.local + counts.published;
  $: manualFallbackDue = isManualFallbackDue(group?.meta.unsyncedSince, nowMs);
  $: joinBlocked = Boolean(group && !group.events.some((event) => event.t === "GroupCreated"));
  $: recoveryActive = Boolean(joiningFromLink && joinBlocked);
  $: canSaveExpense = Boolean(!archived && hasLocalClaim && expenseDesc.trim() && amountPreview.ok && sharePreview.ok && payerPreview.ok);
  $: storageLabel = persistedStorage === null ? "storage unknown" : persistedStorage ? "storage protected" : "storage best effort";
  $: syncLabel = unconfirmedCount === 0 ? "sync current" : `${unconfirmedCount} unsynced`;
  $: archived = isGroupArchived();
  $: groupProfileEditable = canEditGroupProfile(archived);
  $: settledView = state ? isSettledViewPredicate(state.balances, archived) : false;
  $: archiveSummary = group ? latestArchiveEvent(group.events) : undefined;
  $: frozenPolicy = frozenViewPolicy(state);
  $: showInstallHint = !isStandalone && !isDesktop && isOnline && !archived;
  $: relaySettings = currentRelaySettings();
  $: relayTargetLabel = `${relaySettingsTargetCount(relaySettings)} relay target${relaySettingsTargetCount(relaySettings) === 1 ? "" : "s"}`;
  $: subgroupPresets = group?.meta.subgroups ?? [];
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
      expenseCurrency ||= group.currency;
      resetRelaySettingsForm();
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
    state = fold(group.events, { supportedVersion: config.schemaVersion }, verificationContext);
    selectedPids = defaultSplitSelection([...state.participants.values()], selectedPids);
    payerPid ||= [...state.participants.keys()][0] ?? "";
    for (const participant of state.participants.values()) {
      if (payerAmounts[participant.pid] === undefined) payerAmounts[participant.pid] = "";
    }
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

  async function requestDeviceLink(pid: string): Promise<void> {
    if (!group || archived) return;
    const identity = await ensureClaimIdentity(group, pid);
    const request = createDeviceLinkRequest({ tagHex: group.tagHex, pid, deviceId: group.deviceId, identity });
    const text = JSON.stringify(request, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      syncStatus = "Device link request copied.";
    } catch {
      window.prompt("Copy device link request", text);
    }
    group = await ensureGroup();
    await refreshState();
  }

  async function acceptDeviceLinkRequest(request: DeviceLinkRequest): Promise<void> {
    if (!group || archived) return;
    if (request.tagHex !== group.tagHex) throw new Error("Device link request does not match this trip");
    const signer = localIdentityForPid(request.pid);
    if (!signer) throw new Error(`Claim ${participantLabel(request.pid)} on this device before authorising another device`);
    const f = factory();
    const sig = await signClaim(signer.claimSkJwk, signer.alg, linkPayload(request));
    await commit(
      [
        makeEvent(f, "DeviceLinked", {
          pid: request.pid,
          parentDevice: group.deviceId,
          newDevice: request.newDevice,
          newClaimPk: request.newClaimPk,
          alg: request.alg,
          nonce: request.nonce,
          sig,
        }),
      ],
      f,
    );
    syncStatus = `Device linked for ${participantLabel(request.pid)}.`;
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

  async function deactivateParticipant(pid: string): Promise<void> {
    if (!group || archived) return;
    const ok = window.confirm(`${participantLabel(pid)} will be removed from default new-expense split selections. Historical balances and settlements stay unchanged.`);
    if (!ok) return;
    const f = factory();
    await commit([makeEvent(f, "ParticipantDeactivated", { pid })], f);
  }

  async function voidEvent(targetId: string): Promise<void> {
    if (!group || archived) return;
    const f = factory();
    await commit([makeEvent(f, "EventVoided", { targetId })], f);
  }

  async function voidParticipantClaim(pid: string): Promise<void> {
    if (!group || archived || localClaimPids.has(pid)) return;
    const claim = firstParticipantClaim(pid);
    if (!claim) return;
    const ok = window.confirm(`${participantLabel(pid)} was claimed by ${shortDevice(claim.deviceId)} on ${formatEventTime(claim.hlc.wall)}. Void this claim so the participant can be reclaimed?`);
    if (!ok) return;
    await voidEvent(claim.id);
  }

  function participantClaimEvent(eventId?: string): Extract<Event, { t: "ParticipantClaimed" }> | undefined {
    return group?.events.find((event): event is Extract<Event, { t: "ParticipantClaimed" }> => event.t === "ParticipantClaimed" && event.id === eventId);
  }

  function participantAddedEvent(pid: string): Extract<Event, { t: "ParticipantAdded" }> | undefined {
    return group?.events.find((event): event is Extract<Event, { t: "ParticipantAdded" }> => event.t === "ParticipantAdded" && event.pid === pid);
  }

  function activeDeactivationEvent(pid: string): Extract<Event, { t: "ParticipantDeactivated" }> | undefined {
    const events = group?.events ?? [];
    const voided = new Set(events.filter((event): event is Extract<Event, { t: "EventVoided" }> => event.t === "EventVoided").map((event) => event.targetId));
    return [...events]
      .sort(eventSortKey)
      .filter((event): event is Extract<Event, { t: "ParticipantDeactivated" }> => event.t === "ParticipantDeactivated" && event.pid === pid && !voided.has(event.id))
      .at(-1);
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

  function mergeUndoEventIds(anomaly: State["anomalies"][number]): string[] {
    return anomaly.relatedEventIds ?? (anomaly.relatedEventId ? [anomaly.relatedEventId] : []);
  }

  function participantClaimAttribution(pid: string): string {
    const claim = firstParticipantClaim(pid);
    if (!claim) return "Not claimed yet";
    return claimAttributionText({
      name: participantLabel(pid),
      device: shortDevice(claim.deviceId),
      claimedAt: formatEventTime(claim.hlc.wall),
      balance: claimBalance(pid),
    });
  }

  function participantAddAttribution(pid: string): string {
    const added = participantAddedEvent(pid);
    if (!added) return "Added by unknown device";
    return `Added by ${shortDevice(added.dev)} on ${formatEventTime(added.hlc.wall)}`;
  }

  function participantStatusText(pid: string): string {
    const hidden = activeDeactivationEvent(pid);
    return hidden ? `Hidden from default splits since ${formatEventTime(hidden.hlc.wall)}` : participantAddAttribution(pid);
  }

  function claimBalance(pid: string): string {
    return formatMinor(state?.balances.get(pid) ?? 0n, group?.currency ?? "USD");
  }

  function matchText(match: ParticipantNameMatch): string {
    if (match.kind === "exact") return `${match.name} already exists.`;
    if (match.kind === "prefix") return `${match.name} looks like the same person.`;
    return `${match.name} is within two edits of this name.`;
  }

  function reattestationMessage(eventId?: string): string {
    const claim = participantClaimEvent(eventId);
    if (!group || !claim) return "Peer re-attestation is required before this device can confirm settlements.";
    const status = reattestationStatus({
      events: group.events,
      participants,
      targetPid: claim.pid,
      newDevice: claim.deviceId,
      newClaimPk: claim.claimPk,
    });
    const base = `${status.attestedCount}/${status.threshold} peer re-attestation${status.threshold === 1 ? "" : "s"} recorded.`;
    return status.caveat ? `${base} ${status.caveat}` : base;
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
    if (!amountPreview.ok) return { ok: false, message: amountPreview.message };
    const total = amountPreview.baseMinor;
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
      const weights = pids.map((pid) => parseShareWeight(shareWeights[pid] ?? "0") ?? -1n);
      if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Share weights must be whole numbers." };
      if (weights.every((weight) => weight === 0n)) return { ok: false, message: "Enter at least one share weight." };
      const result = allocatedShares(total, weights, "preview", pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    const weights = pids.map((pid) => parsePercentageBasisPoints(percentages[pid] ?? "0") ?? -1n);
    if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Percentages must be valid." };
    if (weights.reduce((a, b) => a + b, 0n) !== 10_000n) return { ok: false, message: "Percentages must total 100%." };
    const result = allocatedShares(total, weights, "preview", pids);
    return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
  }

  function changeSplitMode(nextMode: SplitMode): void {
    if (archived) return;
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
    exactShares = Object.fromEntries(preview.shares.map((share) => [share.pid, formatMinorInput(share.minor)]));
    shareWeights = Object.fromEntries(preview.shares.map((share) => [share.pid, share.minor > 0n ? share.minor.toString() : "0"]));
    percentages = Object.fromEntries(preview.shares.map((share) => [share.pid, formatPercentageInput(share.minor, total)]));
  }

  function changePayerMode(nextMode: PayerMode): void {
    if (archived) return;
    payerMode = nextMode;
    if (nextMode === "multiple") {
      if (amountPreview.ok && payerPid) payerAmounts = { ...payerAmounts, [payerPid]: formatMinorInput(amountPreview.baseMinor) };
    }
  }

  function payerSummary(payers: { pid: string; minor: bigint }[]): string {
    if (payers.length <= 1) return `${participantLabel(payers[0]?.pid ?? "")} paid`;
    return payers.map((payer) => `${participantLabel(payer.pid)} ${formatMinor(payer.minor, group?.currency ?? "USD")}`).join(" · ");
  }

  function expenseCoverageLabel(xid: string): string {
    if (!group) return "sync status unknown";
    const event = [...group.events]
      .filter((candidate) => (candidate.t === "ExpenseAdded" || candidate.t === "ExpenseEdited") && candidate.xid === xid)
      .sort(eventSortKey)
      .at(-1);
    if (!event) return "sync status unknown";
    return isEventCoveredByEveryKnownDevice(group.events, event) ? "everyone has this" : "not yet on every known device";
  }

  function rateSummary(rate: Financials["rate"]): string {
    if (!rate || !group) return "";
    return `${rate.currency} at ${rate.toBase} ${group.currency}`;
  }

  async function addExpense(): Promise<void> {
    if (!group || !sharePreview.ok || !payerPreview.ok || archived) return;
    if (!amountPreview.ok) return;
    const wasFirstExpense = expenses.length === 0;
    const f = factory();
    const dates = defaultExpenseDate();
    const financials = makeExpenseFinancials(amountPreview.baseMinor, payerPreview.payers, sharePreview.shares);
    if (amountPreview.rate) financials.rate = amountPreview.rate;
    const event = makeEvent(f, "ExpenseAdded", {
      xid: crypto.randomUUID(),
      financials,
      desc: expenseDesc.trim(),
      ...dates,
    }, amountPreview.rate ? 2 : 1);
    await commit([event], f);
    if (wasFirstExpense) {
      await requestStoragePersistenceAfterFirstExpense();
      await markFirstExpensePersistenceRequested();
    }
    expenseDesc = "";
    expenseTotal = "";
    exchangeRate = "";
    payerAmounts = {};
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
    const amount = window.prompt("Total", formatMinorInput(expense.financials.minor));
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
    if (archived || !frozenPolicy.allowSettlementActions) return;
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
    if (!group || archived || !frozenPolicy.allowSettlementActions) return;
    const settlement = state?.settlements.get(sid);
    if (!settlement) return;
    const identity = localIdentityForPid(settlement.to);
    if (!identity) return;
    const f = factory();
    const claimSig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:confirm:${sid}`);
    await commit([makeEvent(f, "SettlementConfirmed", { sid, pid: settlement.to, claimSig })], f);
  }

  async function disputeSettlement(sid: string): Promise<void> {
    if (!group || archived || !frozenPolicy.allowSettlementActions) return;
    const note = window.prompt("Dispute note", "Payment not received");
    if (note === null) return;
    const f = factory();
    const trimmed = note.trim();
    await commit([makeEvent(f, "SettlementDisputed", trimmed ? { sid, note: trimmed } : { sid })], f);
  }

  async function voidSettlement(sid: string): Promise<void> {
    if (!group || archived || !frozenPolicy.allowSettlementActions || !canVoidRecordedSettlement(group.events, sid, group.deviceId)) return;
    const f = factory();
    await commit([makeEvent(f, "SettlementVoided", { sid })], f);
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

  function downloadJsonFile(filename: string, contents: string): void {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareDelta(): Promise<void> {
    if (!group) return;
    const events = await pendingOutboundEvents(group.groupId);
    if (events.length === 0) {
      syncStatus = "No unsynced events to share.";
      return;
    }
    const filename = `${group.name || "trip"}-delta.json`;
    const contents = stringifyExport(createDelta(group, events));
    const file = new File([contents], filename, { type: "application/json" });
    const shareData: ShareData = {
      title: `${group.name || "Trip"} ledger delta`,
      text: "Import this TripLedgerDelta in ThePrawnSplit.",
      files: [file],
    };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        syncStatus = "Ledger delta shared.";
      } else {
        downloadJsonFile(filename, contents);
        syncStatus = "Ledger delta downloaded.";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      downloadJsonFile(filename, contents);
      syncStatus = "Ledger delta downloaded.";
    }
  }

  function downloadIdentityBackup(): boolean {
    if (!group || group.identities.length === 0) return false;
    const ok = window.confirm("This file contains your claim signing key. Anyone with it can impersonate your device for this trip.");
    if (!ok) return false;
    const blob = new Blob([stringifyExport(createIdentityBackup(group))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${group.name || "trip"}-identity-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  async function archiveGroup(): Promise<void> {
    if (!group || archived) return;
    const plan = createArchiveTransitionPlan(suggestedSettlements);
    const outstandingLabels = plan.outstanding.map((transfer) => `${participantLabel(transfer.from)} pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group!.currency)}`);
    const ok = window.confirm(archiveConfirmationText(outstandingLabels));
    if (!ok) return;
    for (const action of plan.actions) {
      if (action === "download-export") {
        downloadExport();
      } else {
        const f = factory();
        await commit(
          [
            makeEvent(f, "GroupArchived", {
              outstanding: plan.outstanding,
            }),
          ],
          f,
        );
      }
    }
  }

  async function unarchiveGroup(): Promise<void> {
    if (!group || !archived) return;
    const ok = window.confirm(unarchiveConfirmationText());
    if (!ok) return;
    const f = factory();
    await commit([makeEvent(f, "GroupUnarchived", {})], f);
  }

  function archiveOutstandingLabels(event: NonNullable<typeof archiveSummary>): string[] {
    return event.outstanding.map((transfer) => `${participantLabel(transfer.from)} pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group?.currency ?? "USD")}`);
  }

  function readJoinSeed(): JoinSeed | undefined {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const encoded = params.get("join");
    if (!encoded) return undefined;
    try {
      return decodeJoinSeed(encoded) as JoinSeed;
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
    const url = buildJoinLink(window.location.href, createJoinSeed(group));
    try {
      await navigator.clipboard.writeText(url);
      syncStatus = "Join link copied.";
    } catch {
      window.prompt("Copy join link", url);
    }
  }

  async function showJoinQrCode(): Promise<void> {
    if (!group) return;
    const link = buildJoinLink(window.location.href, createJoinSeed(group));
    joinQrDataUrl = await QRCode.toDataURL(link, { margin: 2, width: 240, errorCorrectionLevel: "M" });
  }

  async function importExport(): Promise<void> {
    error = "";
    try {
      const text = importText;
      const artifactType = (JSON.parse(text) as { type?: string }).type;
      if (artifactType === "DeviceLinkRequest") {
        await acceptDeviceLinkRequest(parseDeviceLinkRequest(text));
      } else {
        const artifact = parseExport(text);
        group =
          artifact.type === "TripLedgerExport"
            ? await replaceFromExport(artifact)
            : artifact.type === "DeviceIdentityBackup"
              ? await restoreIdentityBackup(artifact)
              : await applyDelta(artifact);
        syncStatus = artifact.type === "DeviceIdentityBackup" ? "Identity backup restored." : artifact.type === "TripLedgerDelta" ? "Ledger delta imported." : syncStatus;
      }
      resetRelaySettingsForm();
      importText = "";
      joiningFromLink = false;
      recoveryAttempted = false;
      lastSyncResult = null;
      await refreshState();
      await refreshCounts();
      await refreshDurabilityPrompts();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function renameGroup(name: string): Promise<void> {
    if (!group || !groupProfileEditable) return;
    group = { ...group, name };
    await saveGroup(group);
  }

  async function setCurrency(currency: string): Promise<void> {
    if (!group || !groupProfileEditable) return;
    group = { ...group, currency: normalizeCurrency(currency) };
    expenseCurrency ||= group.currency;
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
      resetRelaySettingsForm();
      await refreshState();
      await refreshCounts();
      await refreshDurabilityPrompts();
      const relayIssues = result.diagnostics.filter((diagnostic) => diagnostic.severity !== "info").length;
      syncStatus = `${result.published} published, ${result.confirmed} confirmed, ${result.received} received, ${result.buffered} buffered, ${result.dropped} dropped, ${result.snapshotsSeen} snapshots seen, ${result.snapshotsPublished} snapshots published${relayIssues ? `; ${relayIssues} relay issue${relayIssues === 1 ? "" : "s"}.` : result.errors.length ? `; ${result.errors[0]}` : "."}`;
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

  function relayDefaults() {
    return { operatedEndpoint: config.relayEndpoint, nostrRelays: config.nostrRelays };
  }

  function currentRelaySettings(): RelaySettings {
    return normalizeRelaySettings(group?.meta.relaySettings, relayDefaults());
  }

  function resetRelaySettingsForm(settings = currentRelaySettings()): void {
    relayUseOperated = settings.useOperated;
    relayOperatedEndpoint = settings.operatedEndpoint;
    relayNostrText = settings.nostrRelays.join("\n");
    relaySettingsError = "";
  }

  async function saveRelaySettings(): Promise<void> {
    if (!group) return;
    const nextSettings = normalizeRelaySettings(
      {
        useOperated: relayUseOperated,
        operatedEndpoint: relayOperatedEndpoint,
        nostrRelays: parseNostrRelayText(relayNostrText),
      },
      relayDefaults(),
    );
    if (relaySettingsTargetCount(nextSettings) === 0) {
      relaySettingsError = "Keep at least one relay target enabled.";
      return;
    }
    group = { ...group, meta: await updateMeta(group.groupId, (meta) => ({ ...meta, relaySettings: nextSettings })) };
    resetRelaySettingsForm(nextSettings);
    syncStatus = "Relay settings saved.";
  }

  async function resetRelaySettings(): Promise<void> {
    if (!group) return;
    group = {
      ...group,
      meta: await updateMeta(group.groupId, (meta) => {
        const next = { ...meta };
        delete next.relaySettings;
        return next;
      }),
    };
    resetRelaySettingsForm();
    syncStatus = "Relay settings reset.";
  }

  async function saveSubgroupPreset(): Promise<void> {
    if (!group || archived) return;
    const pids = selectedPidList();
    const id = crypto.randomUUID();
    const meta = await updateMeta(group.groupId, (current) => ({
      ...current,
      subgroups: upsertSubgroupPreset(current.subgroups, { id, name: subgroupName, pids }, participantPids),
    }));
    group = { ...group, meta };
    subgroupName = "";
  }

  async function deleteSubgroup(id: string): Promise<void> {
    if (!group || archived) return;
    group = { ...group, meta: await updateMeta(group.groupId, (current) => ({ ...current, subgroups: deleteSubgroupPreset(current.subgroups, id) })) };
  }

  function applySubgroup(id: string): void {
    if (archived) return;
    const preset = subgroupPresets.find((candidate) => candidate.id === id);
    if (!preset) return;
    selectedPids = applySubgroupSelection(preset, participantPids);
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
    showIdentityBackupPrompt = shouldPromptIdentityBackup(current, hasLocalClaim);
    activeExportPrompt = exportPromptReason(returnWindow, allBalancesZero(), persistedStorage, Date.now());
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

  async function markIdentityBackupPromptHandled(): Promise<void> {
    showIdentityBackupPrompt = false;
    await patchDurability((durability) => ({ ...durability, identityBackupPromptedAt: Date.now() }));
    await refreshDurabilityPrompts();
  }

  async function downloadPromptIdentityBackup(): Promise<void> {
    if (downloadIdentityBackup()) await markIdentityBackupPromptHandled();
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
    nowMs = Date.now();
    lastActivityAt = nowMs;
  }

  function startPolling(): void {
    if (pollHandle !== undefined) window.clearInterval(pollHandle);
    pollHandle = window.setInterval(() => {
      const now = Date.now();
      nowMs = now;
      if (
        shouldPollGroup({
          hasGroup: Boolean(group),
          documentHidden: document.hidden,
          archived: isGroupArchived(),
          now,
          lastActivityAt,
          lastSyncAt: group?.meta.lastSyncAt,
          idleAfterMs: config.idleAfterMs,
          pollActiveMs: config.pollActiveMs,
          pollBackoffMs: config.pollBackoffMs,
          pollIdleMs: config.pollIdleMs,
        })
      ) {
        void runSync();
      }
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
        <input class="title-input" value={group.name} aria-label="Trip name" disabled={!groupProfileEditable} on:change={(e) => renameGroup((e.currentTarget as HTMLInputElement).value)} />
        <div class="subtle">No accounts · {unconfirmedCount} unconfirmed · {state.quarantined.length ? "update required" : "ready offline"}</div>
        {#if showInstallHint}<div class="subtle">On iOS, use Share then Add to Home Screen for offline launch.</div>{/if}
      </div>
      <div class="header-actions">
        <input class="currency" value={group.currency} aria-label="Currency" disabled={!groupProfileEditable} on:change={(e) => setCurrency((e.currentTarget as HTMLInputElement).value)} />
        <button type="button" disabled={syncing} on:click={runSync} title="Sync now"><RefreshCcw size={18} /> {syncing ? "Syncing" : "Sync"}</button>
        <button type="button" on:click={copyJoinLink} title="Copy join link"><Link size={18} /> Link</button>
        <button type="button" on:click={showJoinQrCode} title="Show join QR"><QrCode size={18} /> QR</button>
        <button type="button" on:click={shareDelta} title="Share unsynced delta"><Share2 size={18} /> Share</button>
        <button type="button" on:click={() => downloadExport()} title="Export ledger"><Download size={18} /> Export</button>
        {#if archived}
          <button type="button" on:click={unarchiveGroup} title="Unarchive trip"><RefreshCcw size={18} /> Unarchive</button>
        {:else}
          <button type="button" on:click={archiveGroup} title="Archive trip"><Archive size={18} /> Archive</button>
        {/if}
      </div>
    </header>

    {#if error}<p class="error">{error}</p>{/if}
    {#if archived}<p class="warning">This trip is archived. The ledger remains readable and exportable. Relay retention is outside this app's control; archiving does not delete relay data.</p>{/if}
    {#if settledView}
      <section class="prompt-banner settled-banner">
        <div>
          <strong>Balances are settled</strong>
          <p>This trip is still active. Adding a new expense will update balances automatically.</p>
        </div>
      </section>
    {/if}
    {#if archived && archiveSummary}
      {@const archivedOutstanding = archiveOutstandingLabels(archiveSummary)}
      <section class="prompt-banner archive-summary">
        <div>
          <strong>Archive summary</strong>
          {#if archivedOutstanding.length}
            <p>{archivedOutstanding.join(" · ")}</p>
          {:else}
            <p>Archived with all balances zero.</p>
          {/if}
        </div>
      </section>
    {/if}
    {#if frozenPolicy.message}<p class="warning">{frozenPolicy.message}</p>{/if}
    {#if manualFallbackDue}
      <section class="prompt-banner important manual-fallback-banner" aria-label="Manual sharing fallback">
        <div>
          <strong>Relay confirmation pending</strong>
          <p>Use manual sharing now so another device can catch up without waiting for relay quorum.</p>
        </div>
        <div class="prompt-actions">
          <button type="button" on:click={shareDelta}><Share2 size={17} /> Share delta</button>
          <button type="button" class="secondary" on:click={() => downloadExport()}><Download size={17} /> Export</button>
          <button type="button" class="secondary" on:click={copyJoinLink}><Link size={17} /> Copy link</button>
        </div>
      </section>
    {/if}
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
    {#if showIdentityBackupPrompt && hasLocalClaim}
      <section class="prompt-banner important">
        <div>
          <strong>Back up this device identity</strong>
          <p>This file is separate from the shareable trip export and restores settlement authority if this browser loses storage.</p>
        </div>
        <div class="prompt-actions">
          <button type="button" on:click={downloadPromptIdentityBackup}><KeyRound size={17} /> Identity backup</button>
          <button type="button" class="secondary" on:click={markIdentityBackupPromptHandled}>Later</button>
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
        <button type="button" on:click={() => { if (downloadIdentityBackup()) void markIdentityBackupPromptHandled(); }}><KeyRound size={17} /> Identity backup</button>
      {:else}
        <span>Claim a person before adding expenses.</span>
      {/if}
      <button type="button" class="secondary" on:click={() => (relaySettingsOpen = !relaySettingsOpen)} title="Relay settings"><Settings size={17} /> Relays</button>
    </section>
    {#if relaySettingsOpen}
      <section class="relay-settings-panel" aria-label="Relay settings">
        <div>
          <h2>Relay Settings</h2>
          <p>{relayTargetLabel} active on this device.</p>
        </div>
        <label class="relay-toggle">
          <input type="checkbox" bind:checked={relayUseOperated} />
          <span>Operated relay</span>
        </label>
        <input bind:value={relayOperatedEndpoint} disabled={!relayUseOperated} placeholder="/api/relay" aria-label="Operated relay endpoint" />
        <label>
          <span>Nostr relays</span>
          <textarea bind:value={relayNostrText} rows="4" placeholder="wss://relay.example"></textarea>
        </label>
        {#if relaySettingsError}<p class="error compact-warning">{relaySettingsError}</p>{/if}
        <div class="prompt-actions">
          <button type="button" on:click={saveRelaySettings}>Save</button>
          <button type="button" class="secondary" on:click={resetRelaySettings}>Reset defaults</button>
        </div>
      </section>
    {/if}
    {#if lastSyncResult?.diagnostics.length}
      <section class="relay-diagnostics" aria-label="Relay diagnostics">
        <h2>Relay Diagnostics</h2>
        {#each lastSyncResult.diagnostics as diagnostic}
          <div class:error-diagnostic={diagnostic.severity === "error"} class="diagnostic-row">
            <strong>{diagnostic.relay} {diagnostic.operation}: {diagnostic.code}</strong>
            <span>{relayDiagnosticActionText(diagnostic)}</span>
          </div>
        {/each}
      </section>
    {/if}

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
              {:else if anomaly.code === "unverified-reclaim" && anomaly.pid}
                <strong>{participantLabel(anomaly.pid)} has an unverified recovered device</strong>
                <span>{participantClaimEvent(anomaly.eventId)?.deviceId ?? "A device"} needs peer re-attestation before it can confirm settlements. {reattestationMessage(anomaly.eventId)}</span>
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
                {#each mergeUndoEventIds(anomaly) as mergeEventId, index}
                  <button type="button" disabled={archived} on:click={() => voidEvent(mergeEventId)}>Undo merge {index + 1}</button>
                {/each}
                {#if anomaly.eventId}
                  <button type="button" class="secondary" disabled={archived} on:click={() => voidEvent(anomaly.eventId!)}>Remove mark</button>
                {/if}
              {:else if anomaly.code === "unverified-reclaim" && anomaly.pid}
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
                  {@const hiddenEvent = activeDeactivationEvent(participant.pid)}
                  <li class:inactive-person={participant.deactivated}>
                    <label>
                      <input type="checkbox" bind:checked={selectedPids[participant.pid]} disabled={archived} />
                      <span>
                        <strong>{participant.name}</strong>
                        <small>{participantStatusText(participant.pid)}</small>
                      </span>
                    </label>
                    <span class="person-actions">
                      {participant.deactivated ? "hidden" : "shadow"}
                      {#if !archived}
                        <button type="button" on:click={() => requestClaimParticipant(participant.pid)} title="Claim participant"><KeyRound size={15} /> Claim</button>
                        {#if hiddenEvent}
                          <button type="button" class="secondary" on:click={() => voidEvent(hiddenEvent.id)} title="Restore default splits">Restore</button>
                        {:else}
                          <button type="button" class="secondary" on:click={() => deactivateParticipant(participant.pid)} title="Hide from default splits">Hide</button>
                        {/if}
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
                  {@const hiddenEvent = activeDeactivationEvent(participant.pid)}
                  <li class:inactive-person={participant.deactivated}>
                    <label>
                      <input type="checkbox" bind:checked={selectedPids[participant.pid]} disabled={archived} />
                      <span>
                        <strong>{participant.name}</strong>
                        <small>{participant.deactivated ? participantStatusText(participant.pid) : participantClaimAttribution(participant.pid)}</small>
                      </span>
                    </label>
                    <span class="person-actions">
                      {participant.deactivated ? "hidden" : `${participant.devices.length} device`}
                      {#if localClaimPids.has(participant.pid)}
                        <span>you</span>
                      {:else if !archived}
                        <button type="button" class="secondary" on:click={() => requestDeviceLink(participant.pid)} title="Request device link"><Link size={15} /> Link</button>
                      {/if}
                      {#if !archived}
                        {#if !localClaimPids.has(participant.pid)}
                          <button type="button" class="secondary danger-action" on:click={() => voidParticipantClaim(participant.pid)} title="Void disputed claim">Void claim</button>
                        {/if}
                        {#if hiddenEvent}
                          <button type="button" class="secondary" on:click={() => voidEvent(hiddenEvent.id)} title="Restore default splits">Restore</button>
                        {:else}
                          <button type="button" class="secondary" on:click={() => deactivateParticipant(participant.pid)} title="Hide from default splits">Hide</button>
                        {/if}
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        {/if}
        <form class="row create-person" on:submit|preventDefault={addParticipant}>
          <input bind:value={participantName} placeholder="Add shadow participant" disabled={archived} />
          <button type="submit" disabled={joinBlocked || archived}><Plus size={17} /> Add</button>
        </form>
        {#if participantNameMatch}
          <p class="hint duplicate-hint">{matchText(participantNameMatch)} Select the existing person before creating a new one.</p>
        {/if}
      </article>

      <article class="panel balances">
        <h2><WalletCards size={18} /> Balances</h2>
        {#if frozenPolicy.displayBalances}
          {#each balances as [pid, minor]}
            <div class:positive={minor > 0n} class:negative={minor < 0n} class="balance-row">
              <span>{participantLabel(pid)}</span>
              <strong>{formatMinor(minor, group.currency)}</strong>
            </div>
          {/each}
        {:else}
          <p class="warning compact-warning">Balances hidden until this app supports every retained event.</p>
        {/if}
      </article>

      <article class="panel expense">
        <h2><ReceiptText size={18} /> Expense</h2>
        <div class="form-grid">
          <input bind:value={expenseDesc} placeholder="Description" disabled={archived} />
          <input bind:value={expenseTotal} inputmode="decimal" placeholder="Total" disabled={archived} />
          <div class="currency-row">
            <input class="currency" bind:value={expenseCurrency} aria-label="Expense currency" disabled={archived} on:change={() => (expenseCurrency = normalizeCurrency(expenseCurrency || group!.currency))} />
            {#if normalizeCurrency(expenseCurrency || group.currency) !== group.currency}
              <input bind:value={exchangeRate} inputmode="decimal" placeholder={`1 ${normalizeCurrency(expenseCurrency)} to ${group.currency}`} aria-label="Exchange rate to group currency" disabled={archived} />
            {/if}
          </div>
          <div class="segmented payer-mode" aria-label="Payer mode">
            <button type="button" class:active={payerMode === "single"} disabled={archived} on:click={() => changePayerMode("single")}>one paid</button>
            <button type="button" class:active={payerMode === "multiple"} disabled={archived} on:click={() => changePayerMode("multiple")}>many paid</button>
          </div>
          {#if payerMode === "single"}
            <select bind:value={payerPid} disabled={archived}>
              {#each participants as participant}<option value={participant.pid}>{participant.name} paid</option>{/each}
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
              <button type="button" class:active={splitMode === mode} disabled={archived} on:click={() => changeSplitMode(mode as SplitMode)}>{mode}</button>
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
                  <span>{sharePreview.ok ? formatMinor(sharePreview.shares.find((s) => s.pid === participant.pid)?.minor ?? 0n, group.currency) : "—"}</span>
                {/if}
              </label>
            {/each}
          </div>
        {/if}
        <div class="subgroup-tools">
          <div class="row subgroup-save">
            <input bind:value={subgroupName} placeholder="Save subgroup" disabled={archived} />
            <button type="button" class="secondary" disabled={archived || !subgroupName.trim() || selectedParticipants.length === 0} on:click={saveSubgroupPreset}>Save</button>
          </div>
          {#if subgroupPresets.length}
            <div class="subgroup-list" aria-label="Subgroups">
              {#each subgroupPresets as preset}
                <span>
                  <button type="button" class="secondary" disabled={archived} on:click={() => applySubgroup(preset.id)}>{preset.name}</button>
                  <button type="button" class="secondary" disabled={archived} on:click={() => deleteSubgroup(preset.id)} title="Delete subgroup">x</button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
        {#if archived}<p class="hint">Archived trips are read-only.</p>{:else if !hasLocalClaim}<p class="hint">Viewing is enabled. Expense creation requires claiming one participant on this device.</p>{/if}
        {#if !payerPreview.ok}<p class="hint">{payerPreview.message}</p>{/if}
        {#if !amountPreview.ok}<p class="hint">{amountPreview.message}</p>{:else if !sharePreview.ok}<p class="hint">{sharePreview.message}</p>{:else if sharePreview.remainderPid}<p class="hint">Rounding remainder goes to {participantLabel(sharePreview.remainderPid)}.</p>{/if}
        <button type="button" disabled={!canSaveExpense} on:click={addExpense}><Plus size={17} /> Save expense</button>
      </article>

      <article class="panel settlements">
        <h2><RefreshCcw size={18} /> Settle</h2>
        {#if !frozenPolicy.allowSettlementActions}
          <p class="warning compact-warning">Settlement is frozen until the newer retained event can be folded.</p>
        {:else}
          {#each suggestedSettlements as transfer}
            <button type="button" class="settle-suggestion" disabled={archived} on:click={() => recordSettlement(transfer.from, transfer.to, formatMinorInput(transfer.minor))}>
              {participantLabel(transfer.from)} pays {participantLabel(transfer.to)} {formatMinor(transfer.minor, group.currency)}
            </button>
          {/each}
          <div class="form-grid">
            <select bind:value={settleFrom} disabled={archived}><option value="">From</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
            <select bind:value={settleTo} disabled={archived}><option value="">To</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
            <input bind:value={settleAmount} inputmode="decimal" placeholder="Amount" disabled={archived} />
            <button type="button" disabled={archived} on:click={() => recordSettlement(settleFrom, settleTo, settleAmount)}>Record</button>
          </div>
        {/if}
        {#if settlements.length && frozenPolicy.allowSettlementActions}
          <div class="settlement-list">
            {#each settlements as settlement}
              {@const claims = settlementClaimView(group.events, settlement.sid)}
              <div class="settlement-row">
                <span class="settlement-claims">
                  <strong>{participantLabel(settlement.from)} paid {participantLabel(settlement.to)} {formatMinor(settlement.minor, group.currency)}</strong>
                  {#if claims.dispute}
                    <span>Dispute: {claims.dispute.note || "Payment disputed"}</span>
                  {/if}
                </span>
                <span class="settlement-state">
                  <strong class:positive={settlement.confirmed} class:negative={settlement.disputed || settlement.contestedConfirmation}>
                    {settlement.disputed ? "disputed" : settlement.contestedConfirmation ? "contested" : settlement.confirmed ? "confirmed" : settlement.cashUnconfirmable ? "cash" : "pending"}
                  </strong>
                  {#if settlement.pending && localIdentityForPid(settlement.to)}
                    <button type="button" disabled={archived} on:click={() => confirmSettlement(settlement.sid)}>Confirm</button>
                  {/if}
                  {#if !settlement.disputed}
                    <button type="button" class="secondary" disabled={archived} on:click={() => disputeSettlement(settlement.sid)}>Dispute</button>
                  {/if}
                  {#if canVoidRecordedSettlement(group.events, settlement.sid, group.deviceId)}
                    <button type="button" class="secondary danger-action" disabled={archived} on:click={() => voidSettlement(settlement.sid)}>Void</button>
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
        {@const coverage = expenseCoverageLabel(expense.xid)}
        <div class="ledger-row">
          <div>
            <strong>{expense.desc}</strong>
            <span>{expense.date}</span>
            <span class="sync-coverage" class:ok-coverage={coverage === "everyone has this"}>{coverage}</span>
            <span class="payer-summary">{payerSummary(expense.financials.payers)}</span>
            {#if expense.financials.rate}<span class="payer-summary">{rateSummary(expense.financials.rate)}</span>{/if}
            {#if expense.financialHistory.length > 1}
              <details class="expense-history">
                <summary>{expense.financialHistory.length - 1} correction{expense.financialHistory.length === 2 ? "" : "s"}</summary>
                {#each expenseHistoryRows(expense) as row}
                  <span class:active-history={row.active}>
                    {row.label}: {formatMinor(row.financials.minor, group.currency)}{row.active ? " active" : ""}
                  </span>
                {/each}
              </details>
            {/if}
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
      <textarea bind:value={importText} placeholder="Paste a TripLedgerExport, TripLedgerDelta, DeviceIdentityBackup, or DeviceLinkRequest JSON file here"></textarea>
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
    {#if joinQrDataUrl}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Join QR code">
          <h2>Join QR</h2>
          <img class="join-qr" src={joinQrDataUrl} alt="Join QR code" />
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={() => (joinQrDataUrl = "")}>Close</button>
            <button type="button" on:click={copyJoinLink}><Link size={16} /> Copy link</button>
          </div>
        </div>
      </div>
    {/if}
  </main>
{:else}
  <main class="center">Unable to open local ledger.</main>
{/if}
