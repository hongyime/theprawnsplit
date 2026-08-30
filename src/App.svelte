<script lang="ts">
  import Icon from "@/lib/Icon.svelte";
  import { allocate, eventSortKey, fold, greedySettlement, type Event, type Financials, type VerificationContext, type State } from "@theprawnsplit/core";
  import {
    appendEvents,
    applyDelta,
    createDelta,
    createExport,
    createGroup,
    createIdentityBackup,
    createJoinSeed,
    ensureClaimIdentity,
    ensureGroup,
    listGroups,
    parseExport,
    pendingOutboundEvents,
    readGroup,
    recordAppLaunch,
    replaceFromExport,
    restoreIdentityBackup,
    saveGroup,
    stringifyExport,
    syncCounts,
    updateMeta,
    type GroupRecord,
    type JoinSeed,
    type StoredGroup,
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
  import { buildJoinLink, decodeJoinSeed } from "@/lib/join-link";
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
  import { canVoidRecordedSettlement, settlementClaimView } from "@/lib/settlement-history";
  import { preserveSplitInputs } from "@/lib/split-preservation";
  import { applySubgroupSelection, deleteSubgroupPreset, upsertSubgroupPreset } from "@/lib/subgroups";
  import { isEventCoveredByEveryKnownDevice } from "@/lib/sync-coverage";
  import { syncSurfaceLabels } from "@/lib/sync-labels";
  import { buildVerificationContext } from "@/lib/verification";
  import type { SyncResult } from "@/relay/types";

  let group: GroupRecord | null = null;
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
  let syncStatus = "Not Synced Yet.";
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
  let participantNameInput: HTMLInputElement | undefined;
  let storedGroups: StoredGroup[] = [];

  $: participants = state ? [...state.participants.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  $: balances = state && group ? [...state.balances.entries()].sort(([a], [b]) => participantLabel(a).localeCompare(participantLabel(b))) : [];
  $: expenses = state ? expenseDisplayRows(state.expenses.values()) : [];
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
  $: sharePreview = buildSharePreview(amountPreview, participants, selectedPids, splitMode, exactShares, shareWeights, percentages);
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
    if (archived) expenseBlockReason = "This Trip Is Archived.";
    else if (!hasLocalClaim) expenseBlockReason = participants.length === 0 ? "Add And Claim Yourself First." : "Claim Yourself Before Saving Expenses.";
    else if (!expenseDesc.trim()) expenseBlockReason = "Add A Short Description.";
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
  $: settledView = state ? isSettledViewPredicate(state.balances, archived) : false;
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
  $: groupCurrencyOptions = currencyOptions(group?.currency);
  $: expenseCurrencyOptions = currencyOptions(expenseCurrency || group?.currency);

  function showToast(message: string): void {
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

  async function load(): Promise<void> {
    loading = true;
    error = "";
    try {
      const seed = readJoinSeed();
      joiningFromLink = Boolean(seed);
      recoveryMode = seed ? readRecoveryMode() : "first-join";
      if (seed) {
        group = await ensureGroup(seed);
        await initGroupSession();
      } else {
        storedGroups = await listGroups();
        group = null;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
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

  async function startNewTrip(): Promise<void> {
    loading = true;
    error = "";
    try {
      group = await createGroup();
      await initGroupSession();
      storedGroups = await listGroups();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function selectTrip(groupId: string): Promise<void> {
    loading = true;
    error = "";
    try {
      group = await readGroup(groupId);
      await initGroupSession();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function showTripList(): Promise<void> {
    group = null;
    storedGroups = await listGroups();
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

  function factory(): EventFactory {
    if (!group) throw new Error("No Group");
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
      error = `${match.name} Already Exists. Claim That Person Or Resolve The Duplicate Before Adding Another Record.`;
      return;
    }
    const f = factory();
    await commit([defaultParticipant(f, name)], f);
    participantName = "";
    showToast(`${name} Added.`);
  }

  async function completeSetup(): Promise<void> {
    const name = setupName.trim();
    if (!name || !group || joinBlocked || archived || setupNameMatch) return;
    const f = factory();
    const event = defaultParticipant(f, name);
    if (event.t !== "ParticipantAdded") return;
    await commit([event], f);
    setupName = "";
    const identity = await ensureClaimIdentity(group, event.pid);
    const claimFactory = factory();
    const sig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:${event.pid}:${group.deviceId}:${identity.claimPk}`);
    await commit(
      [
        makeEvent(claimFactory, "ParticipantClaimed", {
          pid: event.pid,
          deviceId: group.deviceId,
          claimPk: identity.claimPk,
          alg: identity.alg,
          sig,
        }),
      ],
      claimFactory,
    );
    selectedPids = { ...selectedPids, [event.pid]: true };
    payerPid = event.pid;
    showToast(`${name} Is Ready. Add The First Expense.`);
  }

  function requestClaimParticipant(pid: string): void {
    if (!group || localClaimPids.has(pid) || archived) return;
    const participant = participants.find((p) => p.pid === pid);
    if (!participant || participant.devices.length > 0) {
      error = "This Participant Already Has A Claiming Device. Phase 2 Does Not Self-Authorise Extra Devices.";
      return;
    }
    claimCandidatePid = pid;
  }

  async function claimParticipant(pid: string, options: { quiet?: boolean } = {}): Promise<void> {
    if (!group || localClaimPids.has(pid) || archived) return;
    const participant = participants.find((p) => p.pid === pid);
    if (!participant || participant.devices.length > 0) {
      error = "This Participant Already Has A Claiming Device. Phase 2 Does Not Self-Authorise Extra Devices.";
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
    if (!options.quiet) showToast(`${participantLabel(pid)} Claimed On This Device.`);
  }

  async function requestDeviceLink(pid: string): Promise<void> {
    if (!group || archived) return;
    const identity = await ensureClaimIdentity(group, pid);
    const request = createDeviceLinkRequest({ tagHex: group.tagHex, pid, deviceId: group.deviceId, identity });
    const text = JSON.stringify(request, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      syncStatus = "Device Link Request Copied.";
    } catch {
      window.prompt("Copy Device Link Request", text);
    }
    group = await ensureGroup();
    await refreshState();
  }

  async function acceptDeviceLinkRequest(request: DeviceLinkRequest): Promise<void> {
    if (!group || archived) return;
    if (request.tagHex !== group.tagHex) throw new Error("Device Link Request Does Not Match This Trip");
    if (isDeviceLinkReplay(group.events, request)) throw new Error("Device Link Request Was Already Used");
    const signer = localIdentityForPid(request.pid);
    if (!signer) throw new Error(`Claim ${participantLabel(request.pid)} On This Device Before Authorising Another Device`);
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
    syncStatus = `Device Linked For ${participantLabel(request.pid)}.`;
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
    const ok = window.confirm(`${participantLabel(pid)} Will Be Removed From Default New-Expense Split Selections. Historical Balances And Settlements Stay Unchanged.`);
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
    const ok = window.confirm(`${participantLabel(pid)} Was Claimed By ${shortDevice(claim.deviceId)} On ${formatEventTime(claim.hlc.wall)}. Void This Claim So The Participant Can Be Reclaimed?`);
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
    if (!claim) return "Not Claimed Yet";
    return claimAttributionText({
      name: participantLabel(pid),
      device: shortDevice(claim.deviceId),
      claimedAt: formatEventTime(claim.hlc.wall),
      balance: claimBalance(pid),
    });
  }

  function participantAddAttribution(pid: string): string {
    const added = participantAddedEvent(pid);
    if (!added) return "Added By Unknown Device";
    return `Added By ${shortDevice(added.dev)} On ${formatEventTime(added.hlc.wall)}`;
  }

  function participantStatusText(pid: string): string {
    const hidden = activeDeactivationEvent(pid);
    return hidden ? `Hidden From Default Splits Since ${formatEventTime(hidden.hlc.wall)}` : participantAddAttribution(pid);
  }

  function claimBalance(pid: string): string {
    return formatMinor(state?.balances.get(pid) ?? 0n, group?.currency ?? "USD");
  }

  function matchText(match: ParticipantNameMatch): string {
    if (match.kind === "exact") return `${match.name} Already Exists.`;
    if (match.kind === "prefix") return `${match.name} Looks Like The Same Person.`;
    return `${match.name} Is Within Two Edits Of This Name.`;
  }

  function reattestationMessage(eventId?: string): string {
    const claim = participantClaimEvent(eventId);
    if (!group || !claim) return "Peer Re-Attestation Is Required Before This Device Can Confirm Settlements.";
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

  function buildSharePreview(
    amount: CurrencyAmountResult,
    currentParticipants: typeof participants,
    currentSelectedPids: Record<string, boolean>,
    currentSplitMode: SplitMode,
    currentExactShares: Record<string, string>,
    currentShareWeights: Record<string, string>,
    currentPercentages: Record<string, string>,
  ): { ok: true; shares: { pid: string; minor: bigint }[]; remainderPid?: string } | { ok: false; message: string } {
    if (!amount.ok) return { ok: false, message: amount.message };
    const total = amount.baseMinor;
    const pids = currentParticipants.filter((participant) => currentSelectedPids[participant.pid]).map((participant) => participant.pid);
    if (pids.length === 0) return { ok: false, message: "Select At Least One Participant." };
    if (currentSplitMode === "equal") {
      const result = allocatedShares(total, pids.map(() => 1n), "preview", pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    if (currentSplitMode === "exact") {
      const shares = pids.map((pid) => ({ pid, minor: parseMinor(currentExactShares[pid] ?? "") ?? -1n }));
      if (shares.some((share) => share.minor < 0n)) return { ok: false, message: "Every Exact Share Needs An Amount." };
      const sum = shares.reduce((a, b) => a + b.minor, 0n);
      if (sum !== total) return { ok: false, message: "Exact Shares Must Sum To The Total." };
      return { ok: true, shares };
    }
    if (currentSplitMode === "shares") {
      const weights = pids.map((pid) => parseShareWeight(currentShareWeights[pid] ?? "0") ?? -1n);
      if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Share Weights Must Be Whole Numbers." };
      if (weights.every((weight) => weight === 0n)) return { ok: false, message: "Enter At Least One Share Weight." };
      const result = allocatedShares(total, weights, "preview", pids);
      return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
    }
    const weights = pids.map((pid) => parsePercentageBasisPoints(currentPercentages[pid] ?? "0") ?? -1n);
    if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Percentages Must Be Valid." };
    if (weights.reduce((a, b) => a + b, 0n) !== 10_000n) return { ok: false, message: "Percentages Must Total 100%." };
    const result = allocatedShares(total, weights, "preview", pids);
    return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
  }

  function changeSplitMode(nextMode: SplitMode): void {
    if (archived) return;
    const fromMode = splitMode;
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
    return payers.map((payer) => `${participantLabel(payer.pid)} ${formatMinor(payer.minor, group?.currency ?? "USD")}`).join(" · ");
  }

  function expenseCoverageLabel(xid: string): string {
    if (!group) return "Sync Status Unknown";
    const event = [...group.events]
      .filter((candidate) => (candidate.t === "ExpenseAdded" || candidate.t === "ExpenseEdited") && candidate.xid === xid)
      .sort(eventSortKey)
      .at(-1);
    if (!event) return "Sync Status Unknown";
    return isEventCoveredByEveryKnownDevice(group.events, event) ? "Everyone Has This" : "Not Yet On Every Known Device";
  }

  function rateSummary(rate: Financials["rate"]): string {
    if (!rate || !group) return "";
    return `${rate.currency} At ${rate.toBase} ${group.currency}`;
  }

  async function addExpense(): Promise<void> {
    if (!group || !sharePreview.ok || !payerPreview.ok || !canSaveExpense) {
      showExpenseHint = true;
      if (expenseBlockReason) showToast(expenseBlockReason);
      return;
    }
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
    showExpenseHint = false;
    showToast("Expense Saved.");
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
    const event = makeEvent(f, "ExpenseEdited", {
      xid,
      financials: editFinancialsForTotal({ current: expense.financials, nextMinor: minor, eventId: id }),
      meta: { desc: desc.trim() || expense.desc },
    });
    await commit([event], f);
  }

  async function recordSettlement(from: string, to: string, amount: string): Promise<void> {
    const minor = parseMinor(amount);
    if (minor === null) return;
    if (!canRecordSettlement({ archived, allowSettlementActions: frozenPolicy.allowSettlementActions, from, to, minor })) return;
    const f = factory();
    await commit([makeEvent(f, "SettlementRecorded", { sid: crypto.randomUUID(), from, to, minor })], f);
    settleAmount = "";
    showToast("Settlement Recorded.");
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
    const f = factory();
    const claimSig = await signClaim(identity.claimSkJwk, identity.alg, `${group.tagHex}:confirm:${sid}`);
    await commit([makeEvent(f, "SettlementConfirmed", { sid, pid: settlement.to, claimSig })], f);
  }

  async function disputeSettlement(sid: string): Promise<void> {
    if (!group || archived || !frozenPolicy.allowSettlementActions) return;
    const note = window.prompt("Dispute Note", "Payment Not Received");
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
      syncStatus = "No Unsynced Events To Share.";
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
        syncStatus = "Ledger Delta Shared.";
      } else {
        downloadJsonFile(filename, contents);
        syncStatus = "Ledger Delta Downloaded.";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      downloadJsonFile(filename, contents);
      syncStatus = "Ledger Delta Downloaded.";
    }
  }

  function downloadIdentityBackup(): boolean {
    if (!group || group.identities.length === 0) return false;
    const ok = window.confirm("This File Contains Your Claim Signing Key. Anyone With It Can Impersonate Your Device For This Trip.");
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
    const outstandingLabels = plan.outstanding.map((transfer) => `${participantLabel(transfer.from)} Pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group!.currency)}`);
    const ok = window.confirm(archiveConfirmationText(outstandingLabels));
    if (!ok) return;
    const f = factory();
    const archiveEvent = makeEvent(f, "GroupArchived", {
      outstanding: plan.outstanding,
    });
    const archivedExportGroup = groupWithPendingArchiveEvent(group, archiveEvent, f.nextCounter);
    for (const action of plan.actions) {
      if (action === "download-export") {
        downloadExport(undefined, archivedExportGroup);
      } else {
        await commit([archiveEvent], f);
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
    return event.outstanding.map((transfer) => `${participantLabel(transfer.from)} Pays ${participantLabel(transfer.to)} ${formatMinor(transfer.minor, group?.currency ?? "USD")}`);
  }

  function readJoinSeed(): JoinSeed | undefined {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const encoded = params.get("join");
    if (!encoded) return undefined;
    try {
      return decodeJoinSeed(encoded) as JoinSeed;
    } catch {
      error = "Join Link Is Malformed.";
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
      linkCopied = true;
      if (linkCopiedHandle) window.clearTimeout(linkCopiedHandle);
      linkCopiedHandle = window.setTimeout(() => {
        linkCopied = false;
        linkCopiedHandle = undefined;
      }, 2200);
      syncStatus = "Join Link Copied.";
      showToast("Join Link Copied.");
    } catch {
      window.prompt("Copy Join Link", url);
    }
  }

  async function showJoinQrCode(): Promise<void> {
    if (!group) return;
    try {
      const link = buildJoinLink(window.location.href, createJoinSeed(group));
      const QRCode = await import("qrcode");
      joinQrDataUrl = await QRCode.toDataURL(link, { margin: 2, width: 240, errorCorrectionLevel: "M" });
    } catch (err) {
      syncStatus = err instanceof Error ? err.message : "Failed To Generate QR Code.";
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
        group =
          artifact.type === "TripLedgerExport"
            ? await replaceFromExport(artifact)
            : artifact.type === "DeviceIdentityBackup"
              ? await restoreIdentityBackup(artifact)
              : await applyDelta(artifact);
        syncStatus = artifact.type === "DeviceIdentityBackup" ? "Identity Backup Restored." : artifact.type === "TripLedgerDelta" ? "Ledger Delta Imported." : syncStatus;
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

  async function setCurrency(currency: string): Promise<void> {
    if (!group || !groupProfileEditable) return;
    group = { ...group, currency: normalizeCurrency(currency) };
    expenseCurrency = group.currency;
    await saveGroup(group);
    showToast(`Currency Set To ${group.currency}.`);
  }

  async function runSync(): Promise<void> {
    if (!group || syncing) return;
    syncing = true;
    error = "";
    try {
      const { syncOnce } = await import("@/relay/sync");
      const result = await syncOnce(group.groupId);
      recoveryAttempted = true;
      lastSyncResult = result;
      group = await ensureGroup();
      resetRelaySettingsForm();
      await refreshState();
      await refreshCounts();
      await refreshDurabilityPrompts();
      const relayIssues = result.diagnostics.filter((diagnostic) => diagnostic.severity !== "info").length;
      syncStatus = `${result.published} Published, ${result.confirmed} Confirmed, ${result.received} Received, ${result.buffered} Buffered, ${result.dropped} Dropped, ${result.snapshotsSeen} Snapshots Seen, ${result.snapshotsPublished} Snapshots Published${relayIssues ? `; ${relayIssues} Relay Issue${relayIssues === 1 ? "" : "s"}.` : result.errors.length ? `; ${result.errors[0]}` : "."}`;
    } catch (err) {
      syncStatus = "Sync Failed. Manual Export/Import Is Still Available.";
      error = err instanceof Error ? err.message : String(err);
    } finally {
      syncing = false;
    }
  }

  function recoveryMessage(): string {
    if (!recoveryAttempted || syncing) {
      return recoveryMode === "evicted"
        ? "This Device Looks Empty. Recovering From Relays Before Showing Anything Stale."
        : "Recovering From Relays Before Rendering An Empty Ledger.";
    }
    if (!lastSyncResult) {
      return recoveryMode === "evicted"
        ? "Relay Recovery Did Not Complete. Import Your Latest TripLedgerExport To Restore This Device."
        : "Relay Recovery Did Not Complete. Manual Import Is Available.";
    }
    if (lastSyncResult.received > 0) return "Raw Events Were Recovered. Balances Will Render From The Event Log.";
    if (lastSyncResult.snapshotsSeen > 0) {
      return "A Relay Snapshot Was Found And Used Only For Transport Bootstrap. Raw Event History Is Still Reconciling.";
    }
    if (lastSyncResult.errors.length > 0) return `Relay Recovery Failed: ${lastSyncResult.errors[0]}`;
    return recoveryMode === "evicted"
      ? "No Raw Events Were Recovered Yet. Import Is The Fastest Way Back Onto This Trip."
      : "No Raw Events Were Recovered Yet. Import A TripLedgerExport Or Retry Sync.";
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
      relaySettingsError = "Keep At Least One Relay Target Enabled.";
      return;
    }
    group = { ...group, meta: await updateMeta(group.groupId, (meta) => ({ ...meta, relaySettings: nextSettings })) };
    resetRelaySettingsForm(nextSettings);
    syncStatus = "Relay Settings Saved.";
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
    syncStatus = "Relay Settings Reset.";
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
    window.addEventListener("hashchange", () => void load());
  }

  load();
  startPolling();
</script>

{#if loading}
  <main class="center">Loading Local Ledger...</main>
{:else if !group && storedGroups.length === 0}
  <main class="landing-screen">
    <div class="landing-content">
      <img src="/favicon.svg" alt="The Prawn Split" class="landing-logo" width="64" height="64" />
      <h1>The Prawn Split</h1>
      <p class="tagline">
        Split Trip Costs With Friends.<br />
        No Accounts. No Ads. Works Offline.
      </p>
      <button type="button" class="landing-btn" on:click={startNewTrip}>Start A New Trip</button>
      <p class="hint-note">Got A Link From A Friend? Just Open It.</p>
    </div>
  </main>
{:else if !group && storedGroups.length > 0}
  <main class="landing-screen group-list-screen">
    <div class="landing-content group-list-content">
      <div class="brand-header">
        <img src="/favicon.svg" alt="The Prawn Split" width="40" height="40" />
        <h1>The Prawn Split</h1>
      </div>
      <div class="trips-header">
        <h2>Your Trips</h2>
        <button type="button" on:click={startNewTrip}>+ Start A New Trip</button>
      </div>
      <div class="trips-list" role="list">
        {#each storedGroups as g}
          <button type="button" class="trip-card" on:click={() => selectTrip(g.groupId)}>
            <div class="trip-card-info">
              <strong>{g.name || "Trip"}</strong>
              <span>{g.currency} · Created {new Date(g.createdAt).toLocaleDateString()}</span>
            </div>
            <span class="trip-arrow">→</span>
          </button>
        {/each}
      </div>
    </div>
  </main>
{:else if group && state}
  <main class="app-shell">
    <header class="topbar">
      <div>
        <input class="title-input" value={group.name} aria-label="Trip Name" disabled={!groupProfileEditable} on:change={(e) => renameGroup((e.currentTarget as HTMLInputElement).value)} />
        <div class="subtle">Private Trip Ledger · {unconfirmedCount} Unconfirmed · {topbarSyncLabel}</div>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary" on:click={showTripList} title="All Trips">Trips</button>
        <button type="button" class="secondary" on:click={() => (importPanelOpen = !importPanelOpen)} title="Import Recovery JSON"><Icon name="upload" size={18} /> Import</button>
        <button type="button" class="secondary" on:click={showJoinQrCode} title="Show Join QR"><Icon name="qr-code" size={18} /> QR</button>
        <button type="button" class:copied={linkCopied} on:click={copyJoinLink} title="Copy Join Link"><Icon name="link" size={18} /> {linkCopied ? "Copied" : "Copy Link"}</button>
        <button type="button" class="secondary" on:click={archived ? unarchiveGroup : archiveGroup} title={archived ? "Unarchive Trip" : "Archive Trip"}><Icon name="archive" size={18} /> {archived ? "Unarchive" : "Archive"}</button>
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
          <h2>Set Up The Split Before Adding Bills.</h2>
          <p>Add Yourself First. This Device Will Claim That Person So Expense Saving Unlocks Immediately.</p>
        </div>
        <div class="setup-form">
          <label>
            <span>Trip Name</span>
            <input value={group.name} disabled={!groupProfileEditable} on:change={(e) => renameGroup((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label>
            <span>Main Currency</span>
            <select value={group.currency} aria-label="Main Currency" disabled={!groupProfileEditable} on:change={(e) => setCurrency((e.currentTarget as HTMLSelectElement).value)}>
              {#each groupCurrencyOptions as code}
                <option value={code}>{code}{commonCurrencies.includes(code as typeof commonCurrencies[number]) ? " · Common" : ""}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Your Name</span>
            <input bind:value={setupName} placeholder="e.g. Bryan" />
          </label>
          {#if setupNameMatch}<p class="hint duplicate-hint">{matchText(setupNameMatch)} Use That Person Instead.</p>{/if}
          <button type="button" class="setup-primary" disabled={!setupName.trim() || Boolean(setupNameMatch)} on:click={completeSetup}>Create My Spot</button>
        </div>
      </section>
    {/if}
    {#if archived}<p class="warning">This Trip Is Archived. The Ledger Remains Readable And Exportable. Relay Retention Is Outside This App's Control; Archiving Does Not Delete Relay Data.</p>{/if}
    {#if clockSkewWarning}<p class="warning">{clockSkewWarning}</p>{/if}
    {#if settledView}
      <section class="prompt-banner settled-banner">
        <div>
          <strong>Balances Are Settled</strong>
          <p>This Trip Is Still Active. Adding A New Expense Will Update Balances Automatically.</p>
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
            <p>Archived With All Balances Zero.</p>
          {/if}
        </div>
      </section>
    {/if}
    {#if frozenPolicy.message}<p class="warning">{frozenPolicy.message}</p>{/if}
    {#if manualFallbackDue}
      <section class="prompt-banner important manual-fallback-banner" aria-label="Manual Sharing Fallback">
        <div>
          <strong>Relay Confirmation Pending</strong>
          <p>Use Manual Sharing Now So Another Device Can Catch Up Without Waiting For Relay Quorum.</p>
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
          <strong>Pin The Trip Link</strong>
          <p>Keep The Join Link In Your Group Chat So A Wiped Device Can Recover Before Showing An Empty Ledger.</p>
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
          <strong>Back Up This Device Identity</strong>
          <p>This File Grants Impersonation Power For This Trip. It Is Separate From The Shareable Trip Export And Restores Settlement Authority If This Browser Loses Storage.</p>
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
          <strong>{activeExportPrompt === "first-zero" ? "Balances Are Settled" : "Export A Recovery Copy"}</strong>
          <p>{activeExportPrompt === "first-zero" ? "All Balances Reached Zero For The First Time." : "This Device Returned After More Than 7 Days Without Protected Storage."}</p>
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
          <strong>{activeInstallLevel === 1 ? "Install For Safer Storage" : "Protect This Trip"}</strong>
          <p>Use Add To Home Screen To Reduce Browser Storage Eviction Risk.</p>
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
          <div class="recovery-mode" aria-label="Recovery Mode">
            <button type="button" class:active={recoveryMode === "first-join"} on:click={() => (recoveryMode = "first-join")}>First Time Here</button>
            <button type="button" class:active={recoveryMode === "evicted"} on:click={() => (recoveryMode = "evicted")}>Had It Before</button>
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
      <details class="advanced-panel">
        <summary><Icon name="settings" size={17} /> Sync, Backup, And Recovery</summary>
        {#if showInstallHint}<p class="subtle">On iOS, Use Share Then Add To Home Screen For Offline Launch.</p>{/if}
        <section class="sync-strip">
      <span><Icon name="shield" size={17} /> {syncStatus}</span>
      <span class="protection-status" aria-label="Protection Status">
        <span class:ok={isStandalone}>{protectionCopy[0]}</span>
        <span class:ok={persistedStorage === true} class:warn={persistedStorage === false}>{protectionCopy[1]}</span>
        <span class:ok={unconfirmedCount === 0 && state.quarantined.length === 0} class:warn={unconfirmedCount > 0 || state.quarantined.length > 0}>{protectionCopy[2]}</span>
      </span>
      {#if hasLocalClaim}
        <button type="button" on:click={() => { if (downloadIdentityBackup()) void markIdentityBackupPromptHandled(); }}><Icon name="key-round" size={17} /> Identity Backup</button>
      {:else}
        <span>Claim A Person Before Adding Expenses.</span>
      {/if}
      <button type="button" class="secondary" on:click={() => (relaySettingsOpen = !relaySettingsOpen)} title="Relay Settings"><Icon name="settings" size={17} /> Relays</button>
        </section>
    {#if relaySettingsOpen}
      <section class="relay-settings-panel" aria-label="Relay Settings">
        <div>
          <h2>Relay Settings</h2>
          <p>{properCase(relayTargetLabel)} Active On This Device.</p>
        </div>
        <label class="relay-toggle">
          <input type="checkbox" bind:checked={relayUseOperated} />
          <span>Operated Relay</span>
        </label>
        <input bind:value={relayOperatedEndpoint} disabled={!relayUseOperated} placeholder="/api/relay" aria-label="Operated Relay Endpoint" />
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

    {#if reconciliationAnomalies.length}
      <section class="reconcile-panel" aria-label="Reconciliation Issues">
        <h2><Icon name="git-merge" size={18} /> Reconcile People</h2>
        {#each reconciliationAnomalies as anomaly}
          <div class="reconcile-row">
            <div>
              {#if anomaly.code === "possible-duplicate-participants" && anomaly.pid && anomaly.relatedPid}
                <strong>{participantLabel(anomaly.pid)} may be the same as {participantLabel(anomaly.relatedPid)}</strong>
                <span>Resolve The Duplicate Hint Without Changing Balances Automatically.</span>
              {:else if anomaly.code === "distinct-participants-merged"}
                <strong>People Marked Distinct Are Currently Merged</strong>
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
      </details>
    {/if}

    {#if !needsSetup}
    <section class="grid">
      <article class="panel roster">
        <h2><Icon name="users" size={18} /> People</h2>
        {#if participants.length === 0}
          <div class="empty">
            {#if recoveryActive}
              <p>Waiting For Recovered Trip Data.</p>
              <button type="button" disabled={syncing} on:click={runSync}><Icon name="refresh-ccw" size={17} /> Retry Sync</button>
            {:else}
              <p>Add People To Start A Trip Ledger.</p>
              <div class="empty-actions">
                <button type="button" on:click={() => participantNameInput?.focus()}><Icon name="users" size={17} /> Add People</button>
                <button type="button" on:click={() => downloadExport()}><Icon name="download" size={17} /> Share Trip File</button>
              </div>
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
                      {participant.deactivated ? "Hidden" : "Shadow"}
                      {#if !archived}
                        <button type="button" on:click={() => requestClaimParticipant(participant.pid)} title="Claim Participant"><Icon name="key-round" size={15} /> Claim</button>
                        {#if hiddenEvent}
                          <button type="button" class="secondary" on:click={() => voidEvent(hiddenEvent.id)} title="Restore Default Splits">Restore</button>
                        {:else}
                          <button type="button" class="secondary" on:click={() => deactivateParticipant(participant.pid)} title="Hide From Default Splits">Hide</button>
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
              <summary>Claimed People ({participantClaimGroups.claimed.length})</summary>
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
                      {participant.deactivated ? "Hidden" : `${participant.devices.length} Device`}
                      {#if localClaimPids.has(participant.pid)}
                        <span>you</span>
                      {:else if !archived}
                        <button type="button" class="secondary" on:click={() => requestDeviceLink(participant.pid)} title="Request Device Link"><Icon name="link" size={15} /> Link</button>
                      {/if}
                      {#if !archived}
                        {#if !localClaimPids.has(participant.pid)}
                          <button type="button" class="secondary danger-action" on:click={() => voidParticipantClaim(participant.pid)} title="Void Disputed Claim">Void Claim</button>
                        {/if}
                        {#if hiddenEvent}
                          <button type="button" class="secondary" on:click={() => voidEvent(hiddenEvent.id)} title="Restore Default Splits">Restore</button>
                        {:else}
                          <button type="button" class="secondary" on:click={() => deactivateParticipant(participant.pid)} title="Hide From Default Splits">Hide</button>
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
          <input bind:this={participantNameInput} bind:value={participantName} placeholder="Add Shadow Participant" disabled={archived} />
          <button type="submit" disabled={joinBlocked || archived}><Icon name="plus" size={17} /> Add</button>
        </form>
        {#if participantNameMatch}
          <p class="hint duplicate-hint">{matchText(participantNameMatch)} Select The Existing Person Before Creating A New One.</p>
        {/if}
      </article>

      <article class="panel balances">
        <h2><Icon name="wallet" size={18} /> Balances</h2>
        {#if frozenPolicy.displayBalances}
          {#each balances as [pid, minor]}
            <div class:positive={minor > 0n} class:negative={minor < 0n} class="balance-row">
              <span>{participantLabel(pid)}</span>
              <strong>{formatMinor(minor, group.currency)}</strong>
            </div>
          {/each}
        {:else}
          <p class="warning compact-warning">Balances Hidden Until This App Supports Every Retained Event.</p>
        {/if}
      </article>

      <article class="panel expense">
        <h2><Icon name="receipt-text" size={18} /> Add Expense</h2>
        <div class="form-grid">
          <input value={expenseDesc} placeholder="Description" disabled={archived} on:input={(e) => { expenseDesc = (e.currentTarget as HTMLInputElement).value; showExpenseHint = true; }} />
          <input value={expenseTotal} inputmode="decimal" placeholder="Total" disabled={archived} on:input={(e) => { expenseTotal = (e.currentTarget as HTMLInputElement).value; showExpenseHint = true; }} />
          <div class="currency-row">
            <select class="currency" bind:value={expenseCurrency} aria-label="Expense Currency" disabled={archived} on:change={() => (expenseCurrency = normalizeCurrency(expenseCurrency || group!.currency))}>
              {#each expenseCurrencyOptions as code}
                <option value={code}>{code}</option>
              {/each}
            </select>
            {#if normalizeCurrency(expenseCurrency || group.currency) !== group.currency}
              <input bind:value={exchangeRate} inputmode="decimal" placeholder={`1 ${normalizeCurrency(expenseCurrency)} To ${group.currency}`} aria-label="Exchange Rate To Group Currency" disabled={archived} on:input={() => (showExpenseHint = true)} />
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
                  <span>{sharePreview.ok ? formatMinor(sharePreview.shares.find((s) => s.pid === participant.pid)?.minor ?? 0n, group.currency) : "—"}</span>
                {/if}
              </label>
            {/each}
          </div>
        {/if}
        <div class="subgroup-tools">
          <div class="row subgroup-save">
            <input bind:value={subgroupName} placeholder="Save Subgroup" disabled={archived} />
            <button type="button" class="secondary" disabled={archived || !subgroupName.trim() || selectedParticipants.length === 0} on:click={saveSubgroupPreset}>Save</button>
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
        {#if expenseBlockReason && (showExpenseHint || !hasLocalClaim || archived)}<p class="hint action-hint">{expenseBlockReason}</p>{/if}
        {#if amountPreview.ok && sharePreview.ok && sharePreview.remainderPid}<p class="hint">Rounding Remainder Goes To {participantLabel(sharePreview.remainderPid)}.</p>{/if}
        <button type="button" class:blocked={!canSaveExpense} disabled={!canSaveExpense} on:click={addExpense}><Icon name="plus" size={17} /> Save Expense</button>
      </article>

      <article class="panel settlements">
        <h2><Icon name="refresh-ccw" size={18} /> Settle</h2>
        {#if !frozenPolicy.allowSettlementActions}
          <p class="warning compact-warning">Settlement Is Frozen Until The Newer Retained Event Can Be Folded.</p>
        {:else}
          {#each suggestedSettlements as transfer}
            <button type="button" class="settle-suggestion" disabled={archived} on:click={() => recordSettlement(transfer.from, transfer.to, formatMinorInput(transfer.minor))}>
              {participantLabel(transfer.from)} Pays {participantLabel(transfer.to)} {formatMinor(transfer.minor, group.currency)}
            </button>
          {/each}
          <div class="form-grid">
            <select bind:value={settleFrom} disabled={archived}><option value="">From</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
            <select bind:value={settleTo} disabled={archived}><option value="">To</option>{#each participants as p}<option value={p.pid}>{p.name}</option>{/each}</select>
            <input bind:value={settleAmount} inputmode="decimal" placeholder="Amount" disabled={archived} />
            <button type="button" disabled={!canRecordManualSettlement} on:click={() => recordSettlement(settleFrom, settleTo, settleAmount)}>Record</button>
          </div>
        {/if}
        {#if settlements.length && frozenPolicy.allowSettlementActions}
          <div class="settlement-list">
            {#each settlements as settlement}
              {@const claims = settlementClaimView(group.events, settlement.sid)}
              <div class="settlement-row">
                <span class="settlement-claims">
                  <strong>{participantLabel(settlement.from)} Paid {participantLabel(settlement.to)} {formatMinor(settlement.minor, group.currency)}</strong>
                  {#if claims.dispute}
                    <span>Dispute: {claims.dispute.note || "Payment Disputed"}</span>
                  {/if}
                </span>
                <span class="settlement-state">
                  <strong class:positive={settlement.confirmed} class:negative={settlement.disputed || settlement.contestedConfirmation}>
                    {settlement.disputed ? "Disputed" : settlement.contestedConfirmation ? "Contested" : settlement.confirmed ? "Confirmed" : settlement.cashUnconfirmable ? "Cash" : "Pending"}
                  </strong>
                  {#if canConfirmSettlement({
                    archived,
                    allowSettlementActions: frozenPolicy.allowSettlementActions,
                    pending: settlement.pending,
                    hasLocalPayeeIdentity: Boolean(localIdentityForPid(settlement.to)),
                    payeeHasActiveClaimAnomaly: hasActiveClaimAnomaly(anomalies, settlement.to),
                  })}
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
            <span class="sync-coverage" class:ok-coverage={coverage === "Everyone Has This"}>{coverage}</span>
            <span class="payer-summary">{payerSummary(expense.financials.payers)}</span>
            {#if expense.financials.rate}<span class="payer-summary">{rateSummary(expense.financials.rate)}</span>{/if}
            {#if expense.financialHistory.length > 1}
              <details class="expense-history">
                <summary>{expense.financialHistory.length - 1} Correction{expense.financialHistory.length === 2 ? "" : "s"}</summary>
                {#each expenseHistoryRows(expense) as row}
                  <span class:active-history={row.active}>
                    {row.label}: {formatMinor(row.financials.minor, group.currency)}{row.active ? " Active" : ""}
                  </span>
                {/each}
              </details>
            {/if}
          </div>
          <div>
            <strong>{formatMinor(expense.financials.minor, group.currency)}</strong>
            <button type="button" disabled={archived} on:click={() => editExpense(expense.xid)} title="Edit Expense"><Icon name="receipt-text" size={16} /></button>
            <button type="button" disabled={archived} on:click={() => voidExpense(expense.xid)} title="Void Expense"><Icon name="trash" size={16} /></button>
          </div>
        </div>
      {/each}
      {#if expenses.length === 0}<p class="hint">No Expenses Yet.</p>{/if}
    </section>

    {/if}
    {#if claimCandidate}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Claim Participant">
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
        <div class="modal" role="dialog" aria-modal="true" aria-label="Protect This Trip">
          <h2>{activeInstallLevel === 4 ? "Storage Survived" : "Storage Is Still Best Effort"}</h2>
          <p>{activeInstallLevel === 4 ? "This Trip Returned After More Than 7 Days. Keep A Fresh Export And Install The App When Possible." : "Install The App So The Browser Can Give This Trip Stronger Storage Protection."}</p>
          <div class="prompt-actions">
            <button type="button" class="secondary" on:click={dismissActiveInstallPrompt}>Dismiss</button>
          </div>
        </div>
      </div>
    {/if}
    {#if joinQrDataUrl}
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Join QR Code">
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
  <main class="center">Unable To Open Local Ledger.</main>
{/if}
