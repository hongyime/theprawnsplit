<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "@/lib/Icon.svelte";
  import NeoCard from "@/lib/NeoCard.svelte";
  import NeoButton from "@/lib/NeoButton.svelte";
  import { allocate, eventSortKey, fold, greedySettlement, type Event, type Financials, type VerificationContext, type State } from "@theprawnsplit/core";
  import {
    appendReservedEvents,
    applyDelta,
    createDelta,
    createExport,
    createIdentityBackup,
    createJoinSeed,
    ensureClaimIdentity,
    parseExport,
    pendingOutboundEvents,
    readGroup,
    recordAppLaunch,
    replaceFromExport,
    reserveEventIds,
    restoreIdentityBackup,
    saveGroup,
    stringifyExport,
    syncCounts,
    updateMeta,
    type GroupRecord,
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
  import { peerClockSkewWarning } from "@/lib/clock-skew";
  import { commonCurrencies, currencyOptions } from "@/lib/currencies";
  import { defaultExpenseDate, defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
  import { formatMinor, formatMinorInput, parseMinor, parsePercentageBasisPoints, parseShareWeight, type SplitMode } from "@/lib/money";
  import { isArchivedEventLog } from "@/lib/archive";
  import { createDeviceLinkRequest, isDeviceLinkReplay, linkPayload, parseDeviceLinkRequest, type DeviceLinkRequest } from "@/lib/device-link";
  import { canAppendExpense } from "@/lib/expense-command";
  import { editFinancialsForTotal } from "@/lib/expense-edit";
  import { expenseDisplayRows } from "@/lib/expense-display";
  import { expenseHistoryRows } from "@/lib/expense-history";
  import { frozenViewPolicy } from "@/lib/freeze-policy";
  import { buildJoinLink } from "@/lib/join-link";
  import { dialogLifecycle } from "@/lib/dialog";
  import { isManualFallbackDue } from "@/lib/manual-fallback";
  import {
    archiveConfirmationText,
    canEditGroupProfile,
    createArchiveTransitionPlan,
    groupWithPendingArchiveEvent,
    isSettledViewPredicate,
    latestArchiveEvent,
    shouldPollGroup,
    unarchiveConfirmationText,
  } from "@/lib/lifecycle";
  import { currencyAmountPreview, normalizeCurrency, type CurrencyAmountResult } from "@/lib/multicurrency";
  import { buildPayerPreview, type PayerMode } from "@/lib/payers";
  import { claimAttributionText, defaultPayerPid, defaultSplitSelection, findParticipantNameMatch, groupParticipantsForClaim, type ParticipantNameMatch } from "@/lib/participants";
  import { relayDiagnosticActionText } from "@/lib/relay-diagnostics";
  import { normalizeRelaySettings, parseNostrRelayText, relaySettingsTargetCount, type RelaySettings } from "@/lib/relay-settings";
  import { reattestationStatus } from "@/lib/reattestation";
  import { canConfirmSettlement, canRecordSettlement, hasActiveClaimAnomaly } from "@/lib/settlement-command";
  import { canVoidRecordedSettlement, settlementClaimView, usableVoidAuthorityPid } from "@/lib/settlement-history";
  import { preserveSplitInputs } from "@/lib/split-preservation";
  import { applySubgroupSelection, deleteSubgroupPreset, upsertSubgroupPreset } from "@/lib/subgroups";
  import { isEventCoveredByEveryKnownDevice } from "@/lib/sync-coverage";
  import { syncSurfaceLabels } from "@/lib/sync-labels";
  import { buildVerificationContext } from "@/lib/verification";
  import type { SyncResult } from "@/relay/types";
  import ExpensePanel from "@/trip/ExpensePanel.svelte";
  import PeoplePanel from "@/trip/PeoplePanel.svelte";
  import SettlementPanel from "@/trip/SettlementPanel.svelte";
  import LedgerPanel from "@/trip/LedgerPanel.svelte";

  export let initialGroup: GroupRecord;
  export let showTripList: () => void;
  export let openImportedTrip: (groupId: string) => void;
  // App keys this component by navigation. Its identity never changes, so any
  // in-flight signing, IDB or sync work stays attached to the original ledger.
  const tripId = initialGroup.groupId;
  let group: GroupRecord | null = initialGroup;
  let disposed = false;
  let state: State | null = null;
  let verificationContext: VerificationContext | undefined;
  let loading = true;
  let error = "";
  let participantName = "";
  let setupName = "";
  let toast = "";
  let toastHandle: number | undefined;
  let expenseBlockReason = "";
  let showExpenseHint = false;
  let importPanelOpen = false;
  let linkCopied = false;
  let linkCopiedHandle: number | undefined;
  let payerPid = "";
  let payerMode: PayerMode = "single";
  let payerAmounts: Record<string, string> = {};
  let expenseDesc = "";
  // LOGIC-005 (T55): stable draft identifier reused across every preview call
  // for one draft AND used as the ExpenseAdded xid on commit — so preview
  // allocation matches committed shares AND tied remainders rotate across
  // separate drafts instead of always favouring the same participant. Reset
  // to a fresh UUID after each successful addExpense.
  let draftXid = crypto.randomUUID();
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
  export let joiningFromLink = false;
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
  export let recoveryMode: "first-join" | "evicted" = "first-join";
  let claimCandidatePid = "";
  let relaySettingsOpen = false;
  let relayUseOperated = true;
  let relayOperatedEndpoint = "";
  let relayNostrText = "";
  let relaySettingsError = "";
  let subgroupName = "";
  let participantNameInput: HTMLInputElement | undefined;

  $: participants = state ? [...state.participants.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  $: balances = state && group ? [...state.balances.entries()].sort(([a], [b]) => participantLabel(a).localeCompare(participantLabel(b))) : [];
  // Largest absolute balance, used to scale the proportional bars in the Balances hero.
  $: balanceScale = balances.reduce((max, [, minor]) => { const abs = minor < 0n ? -minor : minor; return abs > max ? abs : max; }, 0n);
  $: expenses = state ? expenseDisplayRows(state.expenses.values()) : [];
  $: settlements = state ? [...state.settlements.values()] : [];
  $: anomalies = state ? state.anomalies : [];
  $: currency = state?.currency || group?.currency || "USD";
  $: reconciliationAnomalies = anomalies.filter((anomaly) =>
    ["possible-duplicate-participants", "distinct-participants-merged", "unverified-reclaim"].includes(anomaly.code),
  );
  $: selectedParticipants = participants.filter((p) => selectedPids[p.pid]);
  $: participantPids = participants.map((participant) => participant.pid);
  $: suggestedSettlements = state ? greedySettlement(state.balances) : [];
  $: amountPreview = currencyAmountPreview({
    amountText: expenseTotal,
    currency: expenseCurrency || currency,
    baseCurrency: currency,
    rateText: exchangeRate,
  });
  $: sharePreview = buildSharePreview(amountPreview, participants, selectedPids, splitMode, exactShares, shareWeights, percentages, draftXid);
  $: payerPreview = buildPayerPreview(amountPreview.ok ? amountPreview.baseMinor : null, payerMode, payerPid, payerAmounts, participantPids);
  $: localClaimPids = new Set(group?.identities.map((identity) => identity.pid) ?? []);
  $: hasLocalClaim = localClaimPids.size > 0;
  $: needsSetup = Boolean(group && state && participants.length === 0 && !recoveryActive && !archived);
  $: unconfirmedCount = counts.local + counts.published;
  $: manualFallbackDue = isManualFallbackDue(group?.meta.unsyncedSince, nowMs);
  $: joinBlocked = Boolean(group && !group.events.some((event) => event.t === "GroupCreated"));
  $: recoveryActive = Boolean(joiningFromLink && joinBlocked);
  $: canSaveExpense = canAppendExpense({ archived, hasLocalClaim, description: expenseDesc, amountOk: amountPreview.ok, sharesOk: sharePreview.ok, payersOk: payerPreview.ok });
  $: {
    if (archived) expenseBlockReason = "This trip is archived.";
    else if (!hasLocalClaim) expenseBlockReason = participants.length === 0 ? "Add and claim yourself first." : "Claim yourself before saving expenses.";
    else if (!expenseDesc.trim()) expenseBlockReason = "Add a short description.";
    else if (!amountPreview.ok) expenseBlockReason = amountPreview.message;
    else if (!payerPreview.ok) expenseBlockReason = payerPreview.message;
    else if (!sharePreview.ok) expenseBlockReason = sharePreview.message;
    else expenseBlockReason = "";
  }
  $: canRecordManualSettlement = canRecordSettlement({
    archived,
    allowSettlementActions: frozenPolicy.allowSettlementActions,
    from: settleFrom,
    to: settleTo,
    minor: parseMinor(settleAmount),
  });
  $: storageLabel = persistedStorage === null ? "storage unknown" : persistedStorage ? "storage protected" : "storage best effort";
  $: syncLabels = syncSurfaceLabels({ unconfirmedCount, quarantinedCount: state?.quarantined.length ?? 0 });
  $: topbarSyncLabel = properCase(syncLabels.topbar);
  $: protectionCopy = [isStandalone ? "Installed" : "Browser Tab", properCase(storageLabel), properCase(syncLabels.protection)];
  $: archived = isGroupArchived();
  $: groupProfileEditable = canEditGroupProfile(archived);
  $: settledView = state ? isSettledViewPredicate(state.balances, archived, state.frozen) : false;
  $: archiveSummary = group ? latestArchiveEvent(group.events) : undefined;
  $: frozenPolicy = frozenViewPolicy(state);
  $: clockSkewWarning = group ? peerClockSkewWarning({ events: group.events, localDeviceId: group.deviceId, now: nowMs }) : undefined;
  $: showInstallHint = !isStandalone && !isDesktop && isOnline && !archived;
  $: relaySettings = currentRelaySettings();
  $: relayTargetLabel = `${relaySettingsTargetCount(relaySettings)} relay target${relaySettingsTargetCount(relaySettings) === 1 ? "" : "s"}`;
  $: subgroupPresets = group?.meta.subgroups ?? [];
  $: participantNameMatch = findParticipantNameMatch(participantName, participants);
  $: setupNameMatch = findParticipantNameMatch(setupName, participants);
  $: participantClaimGroups = groupParticipantsForClaim(participants);
  $: claimCandidate = claimCandidatePid ? participants.find((participant) => participant.pid === claimCandidatePid) : undefined;
  $: groupCurrencyOptions = currencyOptions(currency);
  $: expenseCurrencyOptions = currencyOptions(expenseCurrency || currency);

  function showToast(message: string): void {
    if (disposed) return;
    toast = message;
    if (toastHandle) window.clearTimeout(toastHandle);
    toastHandle = window.setTimeout(() => {
      toast = "";
      toastHandle = undefined;
    }, 2800);
  }

  function properCase(text: string): string {
    return text.replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }

  function splitModeLabel(mode: SplitMode): string {
    return properCase(mode);
  }

  async function initGroupSession(): Promise<void> {
    if (!group) return;
    launchDurability = normalizeDurabilityPromptState(group.meta.durability);
    group = { ...group, meta: await recordAppLaunch(group.groupId) };
    expenseCurrency = group.currency;
    resetRelaySettingsForm();
    await refreshState();
    await refreshCounts();
    await refreshProtectionStatus();
    await refreshDurabilityPrompts();
    if (joinBlocked) await runSync();
    if (participants.length === 0) {
      selectedPids = {};
    }
  }

  async function refreshState(): Promise<void> {
    if (!group) return;
    verificationContext = await buildVerificationContext(group);
    state = fold(group.events, { supportedVersion: config.schemaVersion }, verificationContext);
    selectedPids = defaultSplitSelection([...state.participants.values()], selectedPids);
    payerPid = defaultPayerPid([...state.participants.values()], payerPid, new Set(group.identities.map((identity) => identity.pid)));
    for (const participant of state.participants.values()) {
      if (payerAmounts[participant.pid] === undefined) payerAmounts[participant.pid] = "";
    }
  }

  async function refreshCounts(): Promise<void> {
    if (!group) return;
    counts = await syncCounts(group.groupId);
  }

  // CONC-001/T38: reserve counters atomically FIRST (via reserveEventIds),
  // build/sign the events using the reservation OUTSIDE any transaction,
  // then insert via appendReservedEvents (collision-safe, add() not put()).
  // Replaces the old factory()/commit() pattern, which read group.nextCounter
  // directly (a stale-snapshot race between concurrent actions) and used
  // put() (silent-overwrite) semantics on insert.
  async function commitReserved<T extends Event[]>(count: number, build: (f: EventFactory) => Promise<T> | T): Promise<T> {
    if (!group) throw new Error("No Group");
    const commandId = crypto.randomUUID();
    const reservation = await reserveEventIds(group.groupId, commandId, count);
    const f: EventFactory = { deviceId: reservation.deviceId, nextCounter: reservation.counters[0]!, hlcFloor: reservation.hlcFloor };
    const events = await build(f);
    group = await appendReservedEvents(group.groupId, commandId, events);
    await refreshCounts();
    await refreshState();
    await refreshDurabilityPrompts();
    return events;
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
    await commitReserved(1, (f) => [defaultParticipant(f, name)]);
    participantName = "";
    showToast(`${name} Added.`);
  }

  async function completeSetup(): Promise<void> {
    const name = setupName.trim();
    if (!name || !group || joinBlocked || archived || setupNameMatch) return;
    const [event] = await commitReserved(1, (f) => [defaultParticipant(f, name)]);
    if (event.t !== "ParticipantAdded") return;
    setupName = "";
    const identity = await ensureClaimIdentity(group, event.pid);
    const sig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:${event.pid}:${group.deviceId}:${identity.claimPk}`);
    await commitReserved(1, (f) => [
      makeEvent(f, "ParticipantClaimed", {
        pid: event.pid,
        deviceId: group!.deviceId,
        claimPk: identity.claimPk,
        alg: identity.alg,
        sig,
      }),
    ]);
    selectedPids = { ...selectedPids, [event.pid]: true };
    payerPid = event.pid;
    showToast(`${name} is ready. Add the first expense.`);
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

  async function claimParticipant(pid: string, options: { quiet?: boolean } = {}): Promise<void> {
    if (!group || localClaimPids.has(pid) || archived) return;
    const participant = participants.find((p) => p.pid === pid);
    if (!participant || participant.devices.length > 0) {
      error = "This participant already has a claiming device. Phase 2 does not self-authorise extra devices.";
      claimCandidatePid = "";
      return;
    }
    const identity = await ensureClaimIdentity(group, pid);
    const sig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:${pid}:${group.deviceId}:${identity.claimPk}`);
    await commitReserved(1, (f) => [
      makeEvent(f, "ParticipantClaimed", {
        pid,
        deviceId: group!.deviceId,
        claimPk: identity.claimPk,
        alg: identity.alg,
        sig,
      }),
    ]);
    claimCandidatePid = "";
    if (!options.quiet) showToast(`${participantLabel(pid)} claimed on this device.`);
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
      if (!disposed) window.prompt("Copy device link request", text);
    }
    group = await readGroup(tripId);
    await refreshState();
  }

  async function acceptDeviceLinkRequest(request: DeviceLinkRequest): Promise<void> {
    if (!group || archived) return;
    if (request.tagHex !== group.tagHex) throw new Error("Device link request does not match this trip");
    if (isDeviceLinkReplay(group.events, request)) throw new Error("Device link request was already used");
    const signer = localIdentityForPid(request.pid);
    if (!signer) throw new Error(`Claim ${participantLabel(request.pid)} on this device before authorising another device`);
    const sig = await signClaim(signer.claimSkJwk, signer.alg, linkPayload(request));
    await commitReserved(1, (f) => [
      makeEvent(f, "DeviceLinked", {
        pid: request.pid,
        parentDevice: group!.deviceId,
        newDevice: request.newDevice,
        newClaimPk: request.newClaimPk,
        alg: request.alg,
        nonce: request.nonce,
        sig,
      }),
    ]);
    syncStatus = `Device linked for ${participantLabel(request.pid)}.`;
  }

  async function mergeParticipants(from: string, into: string): Promise<void> {
    if (!group || archived || from === into) return;
    await commitReserved(1, (f) => [makeEvent(f, "ParticipantMerged", { from, into })]);
  }

  async function markParticipantsDistinct(a: string, b: string): Promise<void> {
    if (!group || archived || a === b) return;
    await commitReserved(1, (f) => [makeEvent(f, "ParticipantsMarkedDistinct", { a, b })]);
  }

  async function deactivateParticipant(pid: string): Promise<void> {
    if (!group || archived) return;
    const ok = window.confirm(`${participantLabel(pid)} will be removed from default new-expense split selections. Historical balances and settlements stay unchanged.`);
    if (!ok) return;
    await commitReserved(1, (f) => [makeEvent(f, "ParticipantDeactivated", { pid })]);
  }

  async function voidEvent(targetId: string): Promise<void> {
    if (!group || archived) return;
    await commitReserved(1, (f) => [makeEvent(f, "EventVoided", { targetId })]);
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
    if (!wall) return "Unknown Time";
    return new Date(wall).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function shortDevice(deviceId?: string): string {
    if (!deviceId) return "Unknown Device";
    if (deviceId === group?.deviceId) return "This Device";
    return "Another Device";
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
    return formatMinor(state?.balances.get(pid) ?? 0n, currency);
  }

  function matchText(match: ParticipantNameMatch): string {
    if (match.kind === "exact") return `${match.name} already exists.`;
    if (match.kind === "prefix") return `${match.name} Looks like the same person.`;
    return `${match.name} is within two edits of this name.`;
  }

  function reattestationMessage(eventId?: string): string {
    const claim = participantClaimEvent(eventId);
    if (!group || !claim) return "Peer Re-Attestation is required before this device can confirm settlements.";
    const status = reattestationStatus({
      events: group.events,
      participants,
      targetPid: claim.pid,
      newDevice: claim.deviceId,
      newClaimPk: claim.claimPk,
    });
    const base = `${status.attestedCount}/${status.threshold} Peer Re-Attestation${status.threshold === 1 ? "" : "s"} Recorded.`;
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
    const sig = await signClaim(attestor.claimSkJwk, attestor.alg, `${group.tagHex}:reattest:${claim.pid}:${claim.deviceId}:${claim.claimPk}`);
    await commitReserved(1, (f) => [
      makeEvent(f, "ClaimReattested", {
        pid: claim.pid,
        newDevice: claim.deviceId,
        newClaimPk: claim.claimPk,
        alg: claim.alg,
        attestor: attestor.pid,
        sig,
      }),
    ]);
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

  function buildSharePreview(
    amount: CurrencyAmountResult,
    currentParticipants: typeof participants,
    currentSelectedPids: Record<string, boolean>,
    currentSplitMode: SplitMode,
    currentExactShares: Record<string, string>,
    currentShareWeights: Record<string, string>,
    currentPercentages: Record<string, string>,
    salt: string,
  ): { ok: true; shares: { pid: string; minor: bigint }[]; remainderPid?: string } | { ok: false; message: string } {
    if (!amount.ok) return { ok: false, message: amount.message };
    const total = amount.baseMinor;
    const pids = currentParticipants.filter((participant) => currentSelectedPids[participant.pid]).map((participant) => participant.pid);
    if (pids.length === 0) return { ok: false, message: "Select at least one participant." };
    if (currentSplitMode === "equal") {
      const result = allocatedShares(total, pids.map(() => 1n), salt, pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    if (currentSplitMode === "exact") {
      const shares = pids.map((pid) => ({ pid, minor: parseMinor(currentExactShares[pid] ?? "") ?? -1n }));
      if (shares.some((share) => share.minor < 0n)) return { ok: false, message: "Every exact share needs an amount." };
      const sum = shares.reduce((a, b) => a + b.minor, 0n);
      if (sum !== total) return { ok: false, message: "Exact shares must sum to the total." };
      return { ok: true, shares };
    }
    if (currentSplitMode === "shares") {
      const weights = pids.map((pid) => parseShareWeight(currentShareWeights[pid] ?? "0") ?? -1n);
      if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Share weights must be whole numbers." };
      if (weights.every((weight) => weight === 0n)) return { ok: false, message: "Enter at least one share weight." };
      const result = allocatedShares(total, weights, salt, pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    const weights = pids.map((pid) => parsePercentageBasisPoints(currentPercentages[pid] ?? "0") ?? -1n);
    if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Percentages must be valid." };
    if (weights.reduce((a, b) => a + b, 0n) !== 10_000n) return { ok: false, message: "Percentages Must Total 100%." };
    const result = allocatedShares(total, weights, salt, pids);
    return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
  }

  function changeSplitMode(nextMode: SplitMode): void {
    if (archived) return;
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
    payerMode = nextMode;
    if (nextMode === "multiple") {
      if (amountPreview.ok && payerPid) payerAmounts = { ...payerAmounts, [payerPid]: formatMinorInput(amountPreview.baseMinor) };
    }
  }

  function payerSummary(payers: { pid: string; minor: bigint }[]): string {
    if (payers.length <= 1) return `${participantLabel(payers[0]?.pid ?? "")} Paid`;
    return payers.map((payer) => `${participantLabel(payer.pid)} ${formatMinor(payer.minor, currency)}`).join(" · ");
  }

  function expenseCoverageLabel(xid: string): string {
    if (!group) return "Sync status unknown";
    const event = [...group.events]
      .filter((candidate) => (candidate.t === "ExpenseAdded" || candidate.t === "ExpenseEdited") && candidate.xid === xid)
      .sort(eventSortKey)
      .at(-1);
    if (!event) return "Sync status unknown";
    // DATA-007: never claim "Everyone has this" from legacy vector-only
    // evidence -- only from genuine durable-coverage proof. "unknown"
    // (no coverage evidence from some known device at all) is shown
    // distinctly rather than defaulting to either extreme.
    const status = isEventCoveredByEveryKnownDevice(group.events, event);
    if (status === "covered") return "Everyone has this";
    if (status === "not-covered") return "Not yet on every known device";
    return "Coverage Unknown";
  }

  function rateSummary(rate: Financials["rate"]): string {
    if (!rate || !group) return "";
    return `${rate.currency} At ${rate.toBase} ${currency}`;
  }

  async function addExpense(): Promise<void> {
    if (!group || !sharePreview.ok || !payerPreview.ok || !canSaveExpense) {
      showExpenseHint = true;
      if (expenseBlockReason) showToast(expenseBlockReason);
      return;
    }
    if (!amountPreview.ok) return;
    const wasFirstExpense = expenses.length === 0;
    const dates = defaultExpenseDate();
    const financials = makeExpenseFinancials(amountPreview.baseMinor, payerPreview.payers, sharePreview.shares);
    if (amountPreview.rate) financials.rate = amountPreview.rate;
    await commitReserved(1, (f) => [makeEvent(f, "ExpenseAdded", {
      xid: draftXid,
      financials,
      desc: expenseDesc.trim(),
      ...dates,
    }, amountPreview.rate ? 2 : 1)]);
    if (wasFirstExpense) {
      await requestStoragePersistenceAfterFirstExpense();
      await markFirstExpensePersistenceRequested();
    }
    expenseDesc = "";
    expenseTotal = "";
    exchangeRate = "";
    payerAmounts = {};
    draftXid = crypto.randomUUID();
    showExpenseHint = false;
    showToast("Expense saved.");
  }

  async function voidExpense(xid: string): Promise<void> {
    if (archived) return;
    await commitReserved(1, (f) => [makeEvent(f, "ExpenseVoided", { xid })]);
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
    await commitReserved(1, (f) => {
      const id = `${f.deviceId}:${f.nextCounter}`;
      const financials = editFinancialsForTotal({ current: expense.financials, nextMinor: minor, eventId: id });
      return [makeEvent(f, "ExpenseEdited", {
        xid,
        financials,
        meta: { desc: desc.trim() || expense.desc },
      }, financials.rate ? 2 : 1)];
    });
  }

  async function recordSettlement(from: string, to: string, amount: string): Promise<void> {
    const minor = parseMinor(amount);
    if (minor === null) return;
    if (!canRecordSettlement({ archived, allowSettlementActions: frozenPolicy.allowSettlementActions, from, to, minor })) return;
    const sid = crypto.randomUUID();
    // SEC-001/T45: fold.ts no longer treats a matching recording device
    // as proof of payee confirmation (the exact unsigned-attribution
    // vulnerability this finding closed). When THIS device already holds
    // the payee's own local claim identity and has no active claim
    // anomaly, atomically pair the record with a GENUINELY signed
    // SettlementConfirmed event instead -- reusing the same reserved
    // counter pair pattern as archiveGroup/T38, never fabricating a
    // signature for a payee this device does not actually hold.
    const payeeIdentity = localIdentityForPid(to);
    if (group && payeeIdentity && !hasActiveClaimAnomaly(anomalies, to)) {
      const claimSig = await signClaim(payeeIdentity.claimSkJwk, payeeIdentity.alg, `${group.tagHex}:confirm:${sid}`);
      await commitReserved(2, (f) => [
        makeEvent(f, "SettlementRecorded", { sid, from, to, minor }),
        makeEvent(f, "SettlementConfirmed", { sid, pid: to, claimSig }),
      ]);
    } else {
      await commitReserved(1, (f) => [makeEvent(f, "SettlementRecorded", { sid, from, to, minor })]);
    }
    settleAmount = "";
    showToast("Settlement recorded.");
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
    if (
      !canConfirmSettlement({
        archived,
        allowSettlementActions: frozenPolicy.allowSettlementActions,
        pending: settlement.pending,
        hasLocalPayeeIdentity: true,
        payeeHasActiveClaimAnomaly: hasActiveClaimAnomaly(anomalies, settlement.to),
      })
    ) {
      return;
    }
    const claimSig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:confirm:${sid}`);
    await commitReserved(1, (f) => [makeEvent(f, "SettlementConfirmed", { sid, pid: settlement.to, claimSig })]);
  }

  async function disputeSettlement(sid: string): Promise<void> {
    if (!group || archived || !frozenPolicy.allowSettlementActions) return;
    const note = window.prompt("Dispute Note", "Payment not received");
    if (note === null) return;
    const trimmed = note.trim();
    await commitReserved(1, (f) => [makeEvent(f, "SettlementDisputed", trimmed ? { sid, note: trimmed } : { sid })]);
  }

  async function voidSettlement(sid: string): Promise<void> {
    if (!group || archived || !frozenPolicy.allowSettlementActions || !verificationContext) return;
    const localPids = group.identities.map((identity) => identity.pid);
    if (!canVoidRecordedSettlement(group.events, sid, localPids, verificationContext)) return;
    // SEC-002/T47: reversal authority belongs to ANY current group member
    // (design.md §B2 point 1); sign with whichever local claim identity
    // canVoidRecordedSettlement above already confirmed is usable -- never
    // fabricate a device-string attribution.
    const votingPid = usableVoidAuthorityPid(group.events, localPids, verificationContext);
    const identity = votingPid ? localIdentityForPid(votingPid) : undefined;
    if (!votingPid || !identity) return;
    const claimSig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:void-settlement:${sid}`);
    await commitReserved(1, (f) => [makeEvent(f, "SettlementVoided", { sid, pid: votingPid, sig: claimSig })]);
  }

  function downloadExport(reason?: ExportPromptReason, sourceGroup = group): void {
    if (!sourceGroup) return;
    const blob = new Blob([stringifyExport(createExport(sourceGroup))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sourceGroup.name || "trip"}-ledger.json`;
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
      title: `${group.name || "Trip"} Ledger Delta`,
      text: "Import This TripLedgerDelta In The Prawn Split.",
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
    if (!group || archived || !frozenPolicy.allowSettlementActions) return;
    const plan = createArchiveTransitionPlan(suggestedSettlements);
    const outstandingLabels = plan.outstanding.map((transfer) => `${participantLabel(transfer.from)} Pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group!.currency)}`);
    const ok = window.confirm(archiveConfirmationText(outstandingLabels));
    if (!ok) return;
    const commandId = crypto.randomUUID();
    const reservation = await reserveEventIds(group.groupId, commandId, 1);
    const f: EventFactory = { deviceId: reservation.deviceId, nextCounter: reservation.counters[0]!, hlcFloor: reservation.hlcFloor };
    const archiveEvent = makeEvent(f, "GroupArchived", {
      outstanding: plan.outstanding,
    });
    const archivedExportGroup = groupWithPendingArchiveEvent(group, archiveEvent, reservation.counters[0]!);
    for (const action of plan.actions) {
      if (action === "download-export") {
        downloadExport(undefined, archivedExportGroup);
      } else {
        group = await appendReservedEvents(group.groupId, commandId, [archiveEvent]);
        await refreshCounts();
        await refreshState();
        await refreshDurabilityPrompts();
      }
    }
  }

  async function unarchiveGroup(): Promise<void> {
    if (!group || !archived) return;
    const ok = window.confirm(unarchiveConfirmationText());
    if (!ok) return;
    await commitReserved(1, (f) => [makeEvent(f, "GroupUnarchived", {})]);
  }

  function archiveOutstandingLabels(event: NonNullable<typeof archiveSummary>): string[] {
    return event.outstanding.map((transfer) => `${participantLabel(transfer.from)} Pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group?.currency ?? "USD")}`);
  }

  async function copyJoinLink(): Promise<void> {
    if (!group) return;
    // DATA-002: this group's secret/tag pair is not verified against any
    // real trip — sharing a link built from it would never let anyone join
    // the actual trip this was imported from.
    if (group.linked === false) {
      syncStatus = "This trip was imported without a verified join link. Ask the trip owner for their join link to connect it.";
      return;
    }
    let url: string;
    try {
      url = buildJoinLink(window.location.href, createJoinSeed(group));
    } catch (err) {
      if (!disposed) syncStatus = err instanceof Error ? err.message : "Failed to build join link.";
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      if (disposed) return;
      linkCopied = true;
      if (linkCopiedHandle) window.clearTimeout(linkCopiedHandle);
      linkCopiedHandle = window.setTimeout(() => {
        linkCopied = false;
        linkCopiedHandle = undefined;
      }, 2200);
      syncStatus = "Join link copied.";
      showToast("Join link copied.");
    } catch {
      if (!disposed) window.prompt("Copy join link", url);
    }
  }

  async function showJoinQrCode(): Promise<void> {
    if (!group) return;
    if (group.linked === false) {
      syncStatus = "This trip was imported without a verified join link. Ask the trip owner for their join link to connect it.";
      return;
    }
    try {
      const link = buildJoinLink(window.location.href, createJoinSeed(group));
      const QRCode = await import("qrcode");
      joinQrDataUrl = await QRCode.toDataURL(link, { margin: 2, width: 240, errorCorrectionLevel: "M" });
    } catch (err) {
      syncStatus = err instanceof Error ? err.message : "Failed to generate QR code.";
    }
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
        const imported =
          artifact.type === "TripLedgerExport"
            ? await replaceFromExport(artifact)
            : artifact.type === "DeviceIdentityBackup"
              ? await restoreIdentityBackup(artifact)
              : await applyDelta(artifact);
        if (disposed) return;
        if (imported.groupId !== tripId) {
          openImportedTrip(imported.groupId);
          return;
        }
        group = imported;
        syncStatus = artifact.type === "DeviceIdentityBackup" ? "Identity backup restored." : artifact.type === "TripLedgerDelta" ? "Ledger delta imported." : syncStatus;
      }
      resetRelaySettingsForm();
      importText = "";
      importPanelOpen = false;
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

  async function setCurrency(newCurrency: string): Promise<void> {
    if (!group || !groupProfileEditable || expenses.length > 0) return;
    await commitReserved(1, (f) => [makeEvent(f, "BaseCurrencyEstablished", { currency: normalizeCurrency(newCurrency) })]);
    expenseCurrency = state?.currency ?? normalizeCurrency(newCurrency);
    showToast(`Currency set to ${state?.currency ?? normalizeCurrency(newCurrency)}.`);
  }

  async function runSync(): Promise<void> {
    if (!group || syncing || disposed) return;
    syncing = true;
    error = "";
    try {
      const { syncOnce } = await import("@/relay/sync");
      if (disposed) return;
      const result = await syncOnce(tripId);
      if (result.inProgress) {
        if (!disposed) syncStatus = "Sync is already running for this trip";
        return;
      }
      if (disposed) return;
      recoveryAttempted = true;
      lastSyncResult = result;
      group = await readGroup(tripId);
      resetRelaySettingsForm();
      await refreshState();
      await refreshCounts();
      await refreshDurabilityPrompts();
      const relayIssues = result.diagnostics.filter((diagnostic) => diagnostic.severity !== "info").length;
      syncStatus = `${result.published} Published, ${result.confirmed} Confirmed, ${result.received} Received, ${result.buffered} Buffered, ${result.dropped} Dropped, ${result.snapshotsSeen} Snapshots Seen, ${result.snapshotsPublished} Snapshots Published${relayIssues ? `; ${relayIssues} Relay Issue${relayIssues === 1 ? "" : "s"}.` : result.errors.length ? `; ${result.errors[0]}` : "."}`;
    } catch (err) {
      if (disposed) return;
      syncStatus = "Sync failed. Manual Export/Import is still available.";
      error = err instanceof Error ? err.message : String(err);
    } finally {
      syncing = false;
    }
  }

  function recoveryMessage(): string {
    if (!recoveryAttempted || syncing) {
      return recoveryMode === "evicted"
        ? "This device looks empty. Recovering from Relays before showing anything stale."
        : "Recovering from Relays before rendering an empty ledger.";
    }
    if (!lastSyncResult) {
      return recoveryMode === "evicted"
        ? "Relay recovery did not complete. Import Your Latest TripLedgerExport To restore this device."
        : "Relay recovery did not complete. Manual import is available.";
    }
    if (lastSyncResult.received > 0) return "Raw events were recovered. Balances will render from the event log.";
    if (lastSyncResult.snapshotsSeen > 0) {
      return "A relay snapshot was found. Raw event history is still reconciling.";
    }
    if (lastSyncResult.errors.length > 0) return `Relay Recovery Failed: ${lastSyncResult.errors[0]}`;
    return recoveryMode === "evicted"
      ? "No raw events were recovered yet. Import is the fastest way back onto this trip."
      : "No raw events were recovered yet. Import A TripLedgerExport Or retry sync.";
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
    if (!frozenPolicy.allowSettlementActions) return false;
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
          hasPendingOutbox: unconfirmedCount > 0,
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
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onConnectivityChange);
    window.addEventListener("offline", onConnectivityChange);
  }

  function onVisibilityChange(): void { void refreshProtectionStatus(); }
  function onConnectivityChange(): void { void refreshDurabilityPrompts(); }

  onDestroy(() => {
    disposed = true;
    window.clearInterval(pollHandle);
    window.clearTimeout(toastHandle);
    window.clearTimeout(linkCopiedHandle);
    window.removeEventListener("pointerdown", markActivity);
    window.removeEventListener("keydown", markActivity);
    window.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", onConnectivityChange);
    window.removeEventListener("offline", onConnectivityChange);
  });
  void initGroupSession().catch((err) => {
    error = err instanceof Error ? err.message : String(err);
  }).finally(() => { loading = false; });
  startPolling();
</script>

{#if loading}
  <main class="center">Loading local ledger...</main>
{:else if group && state}
  <main class="app-shell">
    <header class="topbar">
      <div>
        <input class="title-input" value={group.name} aria-label="Trip Name" disabled={!groupProfileEditable} on:change={(e) => renameGroup((e.currentTarget as HTMLInputElement).value)} />
        <div class="subtle">{participants.length} {participants.length === 1 ? "Person" : "People"} · {currency} · {expenses.length} {expenses.length === 1 ? "Expense" : "Expenses"} · {unconfirmedCount} Unconfirmed · {topbarSyncLabel}</div>
      </div>
      <div class="header-actions">
        <button type="button" class:copied={linkCopied} on:click={copyJoinLink} title="Copy Join Link"><Icon name="link" size={18} /> {linkCopied ? "Copied" : "Copy Link"}</button>
        <button type="button" class="secondary" on:click={showJoinQrCode} title="Show Join QR"><Icon name="qr-code" size={18} /> QR</button>
        <details class="more-menu">
          <summary aria-label="More Actions" title="More Actions">···</summary>
          <div role="menu">
            <button type="button" class="secondary" on:click={showTripList} title="All Trips">Trips</button>
            <button type="button" class="secondary" on:click={() => (importPanelOpen = !importPanelOpen)} title="Import Recovery JSON"><Icon name="upload" size={18} /> Import</button>
            <button type="button" class="secondary" on:click={archived ? unarchiveGroup : archiveGroup} title={archived ? "Unarchive Trip" : "Archive Trip"}><Icon name="archive" size={18} /> {archived ? "Unarchive" : "Archive"}</button>
          </div>
        </details>
      </div>
    </header>

    {#if toast}<div class="toast" role="status">{toast}</div>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if importPanelOpen}
      <section class="panel import-panel top-import-panel" id="manual-import">
        <h2><Icon name="upload" size={18} /> Import Recovery JSON</h2>
        <textarea bind:value={importText} placeholder="Paste TripLedgerExport, TripLedgerDelta, DeviceIdentityBackup, or DeviceLinkRequest JSON Here"></textarea>
        <button type="button" disabled={!importText.trim()} on:click={importExport}>Import</button>
      </section>
    {/if}
    {#if needsSetup}
      <section class="setup-card" aria-label="Trip Setup">
        <div class="setup-receipt">
          <span class="receipt-kicker">First Receipt</span>
          <h2>Set up the split before adding bills.</h2>
          <p>Add yourself first. This device will claim that person so expense saving unlocks immediately.</p>
        </div>
        <NeoCard class="setup-form">
          <label>
            <span>Trip Name</span>
            <input value={group.name} disabled={!groupProfileEditable} on:change={(e) => renameGroup((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label>
            <span>Main Currency</span>
            <select value={currency} aria-label="Main Currency" disabled={!groupProfileEditable || expenses.length > 0} on:change={(e) => setCurrency((e.currentTarget as HTMLSelectElement).value)}>
              {#each groupCurrencyOptions as code}
                <option value={code}>{code}{commonCurrencies.includes(code as typeof commonCurrencies[number]) ? " · Common" : ""}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Your Name</span>
            <input bind:value={setupName} placeholder="e.g. John Smith" />
          </label>
          {#if setupNameMatch}<p class="hint duplicate-hint">{matchText(setupNameMatch)} Use that person instead.</p>{/if}
          <NeoButton class="setup-primary" disabled={!setupName.trim() || Boolean(setupNameMatch)} onclick={completeSetup}>Create my spot</NeoButton>
        </NeoCard>
      </section>
    {/if}
    {#if archived}<p class="warning">This trip is archived. The ledger remains readable and exportable. Relay retention is outside this app's Control; Archiving does not delete Relay data.</p>{/if}
    {#if clockSkewWarning}<p class="warning">{clockSkewWarning}</p>{/if}
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
          <strong>Archive Summary</strong>
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
          <button type="button" on:click={shareDelta}><Icon name="share" size={17} /> Share Delta</button>
          <button type="button" class="secondary" on:click={() => downloadExport()}><Icon name="download" size={17} /> Export</button>
          <button type="button" class="secondary" on:click={copyJoinLink}><Icon name="link" size={17} /> Copy Link</button>
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
          <button type="button" on:click={() => markPinLinkPromptHandled(true)}><Icon name="link" size={17} /> Copy Link</button>
          <button type="button" class="secondary" on:click={() => markPinLinkPromptHandled(false)}>Dismiss</button>
        </div>
      </section>
    {/if}
    {#if showIdentityBackupPrompt && hasLocalClaim}
      <section class="prompt-banner important">
        <div>
          <strong>Back up this device identity</strong>
          <p>This file grants impersonation power for this trip. It is separate from the shareable trip export and restores settlement authority if this browser loses storage.</p>
        </div>
        <div class="prompt-actions">
          <button type="button" on:click={downloadPromptIdentityBackup}><Icon name="key-round" size={17} /> Identity Backup</button>
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
          <button type="button" on:click={downloadPromptExport}><Icon name="download" size={17} /> Export</button>
          <button type="button" class="secondary" on:click={dismissActiveExportPrompt}>Dismiss</button>
        </div>
      </section>
    {/if}
    {#if activeInstallLevel && activeInstallLevel < 3}
      <section class:sticky-install={activeInstallLevel === 2} class="prompt-banner install">
        <div>
          <strong>{activeInstallLevel === 1 ? "Install for safer storage" : "Protect this trip"}</strong>
          <p>Use Add To Home Screen to reduce browser storage eviction risk.</p>
        </div>
        <div class="prompt-actions">
          <button type="button" class="secondary" on:click={dismissActiveInstallPrompt}>Dismiss</button>
        </div>
      </section>
    {/if}
    {#if recoveryActive}
      <section class="recovery-panel">
        <div>
          <h2>{recoveryMode === "evicted" ? "Device storage empty" : "Join Trip"}</h2>
          <p>{recoveryMessage()}</p>
          <div class="recovery-mode" aria-label="Recovery Mode">
            <button type="button" class:active={recoveryMode === "first-join"} on:click={() => (recoveryMode = "first-join")}>First time here</button>
            <button type="button" class:active={recoveryMode === "evicted"} on:click={() => (recoveryMode = "evicted")}>Had it before</button>
          </div>
        </div>
        <div class="recovery-actions">
          {#if recoveryMode === "evicted"}
            <button type="button" on:click={() => (importPanelOpen = true)}>Import JSON</button>
            <button type="button" disabled={syncing} on:click={runSync}><Icon name="refresh-ccw" size={17} /> {syncing ? "Recovering" : "Retry Sync"}</button>
          {:else}
            <button type="button" disabled={syncing} on:click={runSync}><Icon name="refresh-ccw" size={17} /> {syncing ? "Recovering" : "Retry Sync"}</button>
            <button type="button" class="secondary" on:click={() => (importPanelOpen = true)}>Import JSON</button>
          {/if}
        </div>
      </section>
    {/if}
    {#if !needsSetup}
      <section class="sync-strip" aria-label="Trip Status">
        <span><Icon name="shield" size={17} /> {syncStatus}</span>
        <span class="protection-status" aria-label="Protection Status">
          <span class:ok={isStandalone}>{protectionCopy[0]}</span>
          <span class:ok={persistedStorage === true} class:warn={persistedStorage === false}>{protectionCopy[1]}</span>
          <span class:ok={unconfirmedCount === 0 && state.quarantined.length === 0} class:warn={unconfirmedCount > 0 || state.quarantined.length > 0}>{protectionCopy[2]}</span>
        </span>
      </section>
      {#if reconciliationAnomalies.length}
        <section class="reconcile-panel" aria-label="Reconciliation Issues">
          <h2><Icon name="git-merge" size={18} /> Reconcile People</h2>
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
                  <span>{shortDevice(participantClaimEvent(anomaly.eventId)?.deviceId)} needs peer re-attestation before it can confirm settlements. {reattestationMessage(anomaly.eventId)}</span>
                {:else}
                  <strong>{anomaly.code}</strong>
                  <span>{anomaly.message}</span>
                {/if}
              </div>
              <div class="reconcile-actions">
                {#if anomaly.code === "possible-duplicate-participants" && anomaly.pid && anomaly.relatedPid}
                  <button type="button" disabled={archived} on:click={() => mergeParticipants(anomaly.relatedPid!, anomaly.pid!)}>Merge</button>
                  <button type="button" class="secondary" disabled={archived} on:click={() => markParticipantsDistinct(anomaly.pid!, anomaly.relatedPid!)}>Not Same</button>
                {:else if anomaly.code === "distinct-participants-merged"}
                  {#each mergeUndoEventIds(anomaly) as mergeEventId, index}
                    <button type="button" disabled={archived} on:click={() => voidEvent(mergeEventId)}>Undo Merge {index + 1}</button>
                  {/each}
                  {#if anomaly.eventId}
                    <button type="button" class="secondary" disabled={archived} on:click={() => voidEvent(anomaly.eventId!)}>Remove Mark</button>
                  {/if}
                {:else if anomaly.code === "unverified-reclaim" && anomaly.pid}
                  {#if localPeerIdentityFor(anomaly.pid)}
                    <button type="button" disabled={archived} on:click={() => reattestClaim(anomaly.eventId)}>Re-attest</button>
                  {/if}
                  {#if anomaly.eventId}
                    <button type="button" class="secondary" disabled={archived} on:click={() => voidEvent(anomaly.eventId!)}>Void Claim</button>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </section>
      {/if}
      <details class="advanced-panel">
        <summary><Icon name="settings" size={17} /> Sync, backup, and recovery</summary>
        {#if showInstallHint}<p class="subtle">On iOS, use Share then Add To Home Screen for offline launch.</p>{/if}
        <section class="sync-strip">
          {#if hasLocalClaim}
            <button type="button" on:click={() => { if (downloadIdentityBackup()) void markIdentityBackupPromptHandled(); }}><Icon name="key-round" size={17} /> Identity Backup</button>
          {:else}
            <span>Claim a person before adding expenses.</span>
          {/if}
          <button type="button" class="secondary" on:click={() => downloadExport()}><Icon name="download" size={17} /> Export</button>
          <button type="button" class="secondary" on:click={shareDelta}><Icon name="share" size={17} /> Share Delta</button>
          <button type="button" class="secondary" on:click={() => (relaySettingsOpen = !relaySettingsOpen)} title="Relay Settings"><Icon name="settings" size={17} /> Relays</button>
        </section>
    {#if relaySettingsOpen}
      <section class="relay-settings-panel" aria-label="Relay Settings">
        <div>
          <h2>Relay Settings</h2>
          <p>{properCase(relayTargetLabel)} Active on this device.</p>
        </div>
        <label class="relay-toggle">
          <input type="checkbox" bind:checked={relayUseOperated} />
          <span>Operated Relay</span>
        </label>
        <input bind:value={relayOperatedEndpoint} disabled={!relayUseOperated} placeholder="/api/relay" aria-label="Operated relay endpoint" />
        <label>
          <span>Nostr Relays</span>
          <textarea bind:value={relayNostrText} rows="4" placeholder="wss://relay.example"></textarea>
        </label>
        {#if relaySettingsError}<p class="error compact-warning">{relaySettingsError}</p>{/if}
        <div class="prompt-actions">
          <button type="button" on:click={saveRelaySettings}>Save</button>
          <button type="button" class="secondary" on:click={resetRelaySettings}>Reset Defaults</button>
        </div>
      </section>
    {/if}
    {#if lastSyncResult?.diagnostics.length}
      <section class="relay-diagnostics" aria-label="Relay Diagnostics">
        <h2>Relay Diagnostics</h2>
        {#each lastSyncResult.diagnostics as diagnostic}
          <div class:error-diagnostic={diagnostic.severity === "error"} class="diagnostic-row">
            <strong>{diagnostic.relay} {diagnostic.operation}: {diagnostic.code}</strong>
            <span>{relayDiagnosticActionText(diagnostic)}</span>
          </div>
        {/each}
      </section>
    {/if}
      </details>
    {/if}

    {#if !needsSetup}
    <section class="grid">
      <PeoplePanel
        {participants}
        {participantClaimGroups}
        {localClaimPids}
        {archived}
        {joinBlocked}
        {recoveryActive}
        {syncing}
        {participantNameMatch}
        bind:participantName
        bind:selectedPids
        bind:participantNameInput
        {addParticipant}
        {requestClaimParticipant}
        {requestDeviceLink}
        {voidParticipantClaim}
        {deactivateParticipant}
        {voidEvent}
        {activeDeactivationEvent}
        {participantStatusText}
        {participantClaimAttribution}
        {matchText}
        {runSync}
        {downloadExport}
      />

      <article class="panel balances">
        <h2><Icon name="wallet" size={18} /> Balances</h2>
        {#if frozenPolicy.displayBalances}
          {#each balances as [pid, minor]}
            <div class:positive={minor > 0n} class:negative={minor < 0n} class="balance-row" style="--pct: {balanceScale > 0n ? Number((minor < 0n ? -minor : minor) * 1000n / balanceScale) / 1000 : 0}">
              <span>{participantLabel(pid)}</span>
              <span class="balance-bar" aria-hidden="true"></span>
              <strong>{formatMinor(minor, currency)}</strong>
            </div>
          {/each}
        {:else}
          <p class="warning compact-warning">Balances hidden until this app supports every retained event.</p>
        {/if}
      </article>

      <ExpensePanel
        {archived}
        {hasLocalClaim}
        {currency}
        {participants}
        {selectedParticipants}
        {expenseCurrencyOptions}
        {subgroupPresets}
        {amountPreview}
        {sharePreview}
        {expenseBlockReason}
        {canSaveExpense}
        bind:expenseDesc
        bind:expenseTotal
        bind:expenseCurrency
        bind:exchangeRate
        bind:payerMode
        bind:payerPid
        bind:payerAmounts
        bind:splitMode
        bind:exactShares
        bind:shareWeights
        bind:percentages
        bind:subgroupName
        bind:showExpenseHint
        {changePayerMode}
        {changeSplitMode}
        {saveSubgroupPreset}
        {applySubgroup}
        {deleteSubgroup}
        {addExpense}
        {participantLabel}
        {splitModeLabel}
      />

      <SettlementPanel
        {archived}
        {currency}
        {participants}
        {suggestedSettlements}
        {settlements}
        {frozenPolicy}
        {group}
        {anomalies}
        {verificationContext}
        {canRecordManualSettlement}
        bind:settleFrom
        bind:settleTo
        bind:settleAmount
        {recordSettlement}
        {confirmSettlement}
        {disputeSettlement}
        {voidSettlement}
        {participantLabel}
        {localIdentityForPid}
      />

      <LedgerPanel
        {expenses}
        {archived}
        {currency}
        {expenseCoverageLabel}
        {payerSummary}
        {rateSummary}
        {editExpense}
        {voidExpense}
      />
    </section>

    {/if}
    {#if claimCandidate}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Claim Participant" use:dialogLifecycle={{ onEscape: () => (claimCandidatePid = "") }}>
          <h2>Claim {claimCandidate.name}</h2>
          <dl class="claim-details">
            <div>
              <dt>Added</dt>
              <dd>{participantAddAttribution(claimCandidate.pid)}</dd>
            </div>
            <div>
              <dt>Current Balance</dt>
              <dd>{claimBalance(claimCandidate.pid)}</dd>
            </div>
            <div>
              <dt>This Device</dt>
              <dd>{shortDevice(group.deviceId)} Will Be Able To Confirm Settlements For {claimCandidate.name}.</dd>
            </div>
          </dl>
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={() => (claimCandidatePid = "")}>Cancel</button>
            <button type="button" on:click={() => claimParticipant(claimCandidate.pid)}><Icon name="key-round" size={16} /> Claim</button>
          </div>
        </div>
      </div>
    {/if}
    {#if activeInstallLevel && activeInstallLevel >= 3}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Protect this trip" use:dialogLifecycle={{ onEscape: dismissActiveInstallPrompt }}>
          <h2>{activeInstallLevel === 4 ? "Storage Survived" : "Storage is still best effort"}</h2>
          <p>{activeInstallLevel === 4 ? "This trip returned after more than 7 days. Keep a fresh export and install the app when possible." : "Install the app so the browser can give this trip stronger storage protection."}</p>
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={dismissActiveInstallPrompt}>Dismiss</button>
          </div>
        </div>
      </div>
    {/if}
    {#if joinQrDataUrl}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Join QR Code" use:dialogLifecycle={{ onEscape: () => (joinQrDataUrl = "") }}>
          <h2>Join QR</h2>
          <img class="join-qr" src={joinQrDataUrl} alt="Join QR Code" />
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={() => (joinQrDataUrl = "")}>Close</button>
            <button type="button" on:click={copyJoinLink}><Icon name="link" size={16} /> Copy Link</button>
          </div>
        </div>
      </div>
    {/if}
  </main>
{:else}
  <main class="center">Unable to open local ledger.</main>
{/if}
