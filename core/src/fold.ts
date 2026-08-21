import {
  authorisedDevices,
  buildDSU,
  claimAnomalies,
  contestedClaimPids,
  matchesPayeeClaimSignature,
  verifyConfirmation,
  voidedEventIds,
} from "./identity";
import type {
  Anomaly,
  Event,
  ExpenseState,
  Financials,
  FoldOptions,
  Money,
  ParticipantState,
  SettlementState,
  State,
  VerificationContext,
} from "./types";
import { compareHlc, eventSortKey } from "./types";

const add = (balances: Map<string, Money>, pid: string, minor: Money): void => {
  balances.set(pid, (balances.get(pid) ?? 0n) + minor);
};

const sumRows = (rows: { minor: Money }[]): Money => rows.reduce((a, row) => a + row.minor, 0n);

const validateFinancials = (financials: Financials): boolean =>
  financials.minor >= 0n &&
  financials.payers.every((payer) => payer.minor >= 0n) &&
  financials.shares.every((share) => share.minor >= 0n) &&
  sumRows(financials.payers) === financials.minor &&
  sumRows(financials.shares) === financials.minor;

const eventCounter = (event: Event): number => {
  const suffix = event.id.startsWith(`${event.dev}:`) ? Number(event.id.slice(event.dev.length + 1)) : Number.NaN;
  return Number.isSafeInteger(suffix) ? suffix : event.hlc.ctr;
};

const versionCovers = (event: Event, other: Event): boolean => (event.vv?.[other.dev] ?? 0) >= eventCounter(other);

const financialWinner = (current: Event, candidate: Event): Event => {
  const candidateCoversCurrent = versionCovers(candidate, current);
  const currentCoversCandidate = versionCovers(current, candidate);
  if (candidateCoversCurrent && !currentCoversCandidate) return candidate;
  if (currentCoversCandidate && !candidateCoversCurrent) return current;
  return compareHlc(candidate.hlc, current.hlc) >= 0 ? candidate : current;
};

const pairKey = (a: string, b: string): string => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

const normalizeName = (name: string): string => name.trim().toLocaleLowerCase().replace(/\s+/g, " ");

function activeMergeEdges(events: Event[]): Map<string, { eventId: string; from: string; into: string }> {
  const voided = voidedEventIds(events);
  const edges = new Map<string, { eventId: string; from: string; into: string }>();
  for (const event of [...events].sort(eventSortKey)) {
    if (event.t === "ParticipantMerged" && !voided.has(event.id)) {
      edges.set(pairKey(event.from, event.into), { eventId: event.id, from: event.from, into: event.into });
    }
  }
  return edges;
}

function mergePath(
  start: string,
  target: string,
  edges: Map<string, { eventId: string; from: string; into: string }>,
): { eventId: string; from: string; into: string }[] {
  const adjacency = new Map<string, { eventId: string; from: string; into: string; next: string }[]>();
  for (const edge of edges.values()) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), { ...edge, next: edge.into }]);
    adjacency.set(edge.into, [...(adjacency.get(edge.into) ?? []), { ...edge, next: edge.from }]);
  }
  const seen = new Set([start]);
  const queue: { pid: string; path: { eventId: string; from: string; into: string }[] }[] = [{ pid: start, path: [] }];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    if (current.pid === target) return current.path;
    for (const edge of adjacency.get(current.pid) ?? []) {
      if (seen.has(edge.next)) continue;
      seen.add(edge.next);
      queue.push({ pid: edge.next, path: [...current.path, { eventId: edge.eventId, from: edge.from, into: edge.into }] });
    }
  }
  return [];
}

function settlementVoidDecisions(events: Event[]): { voided: Set<string>; anomalies: Anomaly[] } {
  const settlementBySid = new Map<string, Extract<Event, { t: "SettlementRecorded" }>>();
  const voided = new Set<string>();
  const anomalies: Anomaly[] = [];

  for (const event of [...events].sort(eventSortKey)) {
    if (event.t === "SettlementRecorded" && !settlementBySid.has(event.sid)) settlementBySid.set(event.sid, event);
  }
  for (const event of [...events].sort(eventSortKey)) {
    if (event.t !== "SettlementVoided") continue;
    const settlement = settlementBySid.get(event.sid);
    if (!settlement) continue;
    if (event.dev === settlement.dev) {
      voided.add(event.sid);
    } else {
      anomalies.push({
        code: "unauthorized-settlement-void",
        sid: event.sid,
        eventId: event.id,
        relatedEventId: settlement.id,
        message: "SettlementVoided must be emitted by the device that recorded the settlement",
      });
    }
  }

  return { voided, anomalies };
}

export function fold(events: Event[], opts: FoldOptions, ctx?: VerificationContext): State {
  const ordered = [...events].sort(eventSortKey);
  const quarantined: string[] = [];
  const anomalies: Anomaly[] = [];
  const supported = ordered.filter((event) => {
    if (event.v > opts.supportedVersion) {
      quarantined.push(event.id);
      return false;
    }
    return true;
  });

  const voided = voidedEventIds(supported);
  if (ctx) anomalies.push(...claimAnomalies(supported, ctx));
  const contestedPids = ctx ? contestedClaimPids(supported, ctx) : new Set<string>();
  const mergeEdges = activeMergeEdges(supported);
  const markedDistinct = new Map<string, { eventId: string; a: string; b: string }>();
  const settlementVoidDecision = settlementVoidDecisions(supported);
  anomalies.push(...settlementVoidDecision.anomalies);
  const expenseVoids = new Set<string>();
  const settlementVoids = settlementVoidDecision.voided;
  for (const event of supported) {
    if (event.t === "ExpenseVoided") expenseVoids.add(event.xid);
    if (event.t === "EventVoided") {
      const target = supported.find((candidate) => candidate.id === event.targetId);
      if (target?.t === "EventVoided") {
        anomalies.push({ code: "voids-void", eventId: event.id, relatedEventId: target.id, message: "EventVoided cannot be voided" });
      }
    }
    if (event.t === "ParticipantsMarkedDistinct" && !voided.has(event.id)) {
      markedDistinct.set(pairKey(event.a, event.b), { eventId: event.id, a: event.a, b: event.b });
    }
  }

  const dsu = buildDSU(supported);
  const canonical = (pid: string): string => dsu.get(pid) ?? pid;
  const participants = new Map<string, ParticipantState>();
  const claimDevices = new Map<string, Set<string>>();
  const expenses = new Map<string, ExpenseState>();
  const expenseFinancialEvents = new Map<string, Event>();
  const settlements = new Map<string, SettlementState>();
  const balances = new Map<string, Money>();

  for (const event of supported) {
    if ("pid" in event) {
      const root = canonical(event.pid);
      if (!participants.has(root)) {
        participants.set(root, { pid: root, canonicalPid: root, name: root, devices: [], deactivated: false });
      }
    }
    if (event.t === "ParticipantAdded") {
      const root = canonical(event.pid);
      participants.set(root, { ...(participants.get(root) ?? { pid: root, canonicalPid: root, devices: [], deactivated: false }), name: event.name });
    }
    if (event.t === "ParticipantClaimed" && !voided.has(event.id)) {
      const root = canonical(event.pid);
      if (!claimDevices.has(root)) claimDevices.set(root, new Set());
      claimDevices.get(root)!.add(event.deviceId);
    }
    if (!ctx && (event.t === "DeviceLinked" || event.t === "ClaimReattested") && !voided.has(event.id)) {
      const root = canonical(event.pid);
      if (!claimDevices.has(root)) claimDevices.set(root, new Set());
      claimDevices.get(root)!.add(event.newDevice);
    }
  }

  if (ctx) {
    const pids = new Set(supported.flatMap((event) => ("pid" in event ? [event.pid] : [])));
    for (const pid of pids) {
      const root = canonical(pid);
      if (!claimDevices.has(root)) claimDevices.set(root, new Set());
      for (const deviceId of authorisedDevices(supported, pid, ctx)) {
        claimDevices.get(root)!.add(deviceId);
      }
    }
  }

  for (const event of supported) {
    if (voided.has(event.id)) continue;
    if (event.t === "ParticipantRenamed") {
      const root = canonical(event.pid);
      const existing = participants.get(root);
      const shouldReplace = !existing || !("renameHlc" in existing) || true;
      if (shouldReplace) participants.set(root, { ...(existing ?? { pid: root, canonicalPid: root, devices: [], deactivated: false }), name: event.name });
    }
    if (event.t === "ParticipantDeactivated") {
      const root = canonical(event.pid);
      const existing = participants.get(root) ?? { pid: root, canonicalPid: root, name: root, devices: [], deactivated: false };
      participants.set(root, { ...existing, deactivated: true });
    }
    if (event.t === "ExpenseAdded" && !expenseVoids.has(event.xid)) {
      if (!validateFinancials(event.financials)) {
        quarantined.push(event.id);
        continue;
      }
      expenses.set(event.xid, {
        xid: event.xid,
        financials: event.financials,
        desc: event.desc,
        date: event.date,
        financialHistory: [event.financials],
      });
      expenseFinancialEvents.set(event.xid, event);
    }
    if (event.t === "ExpenseEdited" && !expenseVoids.has(event.xid)) {
      const existing = expenses.get(event.xid);
      if (!existing) continue;
      const next: ExpenseState = { ...existing };
      if (event.financials) {
        if (!validateFinancials(event.financials)) {
          quarantined.push(event.id);
          continue;
        }
        next.financialHistory = [...existing.financialHistory, event.financials];
        const winningEvent = financialWinner(expenseFinancialEvents.get(event.xid) ?? event, event);
        expenseFinancialEvents.set(event.xid, winningEvent);
        next.financials = winningEvent === event ? event.financials : existing.financials;
      }
      if (event.meta?.desc !== undefined) next.desc = event.meta.desc;
      if (event.meta?.date !== undefined) next.date = event.meta.date;
      expenses.set(event.xid, next);
    }
    if (event.t === "SettlementRecorded" && !settlementVoids.has(event.sid)) {
      const payeeDevices = ctx ? authorisedDevices(supported, event.to, ctx) : new Set<string>();
      const bornConfirmed = ctx ? payeeDevices.has(event.dev) && !contestedPids.has(event.to) : false;
      const cashUnconfirmable = ctx ? payeeDevices.size === 0 : false;
      settlements.set(event.sid, {
        sid: event.sid,
        from: event.from,
        to: event.to,
        minor: event.minor,
        confirmed: bornConfirmed,
        disputed: false,
        contestedConfirmation: false,
        pending: !bornConfirmed && !cashUnconfirmable,
        cashUnconfirmable,
      });
    }
    if (event.t === "SettlementConfirmed") {
      const settlement = settlements.get(event.sid);
      if (settlement && ctx && verifyConfirmation(supported, event.sid, event.claimSig, ctx)) {
        settlements.set(event.sid, { ...settlement, confirmed: true, pending: false });
      } else if (settlement && ctx && contestedPids.has(settlement.to) && matchesPayeeClaimSignature(supported, event.sid, event.claimSig, ctx)) {
        settlements.set(event.sid, { ...settlement, contestedConfirmation: true, pending: true });
        anomalies.push({
          code: "contested-settlement-confirmation",
          pid: settlement.to,
          sid: event.sid,
          eventId: event.id,
          message: "Settlement confirmation came from a payee with an active claim anomaly",
        });
      }
    }
    if (event.t === "SettlementDisputed") {
      const settlement = settlements.get(event.sid);
      if (settlement) settlements.set(event.sid, { ...settlement, disputed: true });
    }
  }

  for (const [pid, participant] of participants) {
    const devices = [...(claimDevices.get(pid) ?? [])].sort();
    participants.set(pid, { ...participant, devices });
    balances.set(pid, 0n);
  }

  for (const mark of markedDistinct.values()) {
    if (canonical(mark.a) === canonical(mark.b)) {
      const path = mergePath(mark.a, mark.b, mergeEdges);
      const anomaly: Anomaly = {
        code: "distinct-participants-merged",
        pid: canonical(mark.a),
        eventId: mark.eventId,
        message: `Participants marked distinct are merged via ${path.map((edge) => `${edge.from}->${edge.into}`).join(", ")}`,
      };
      if (path[0]) anomaly.relatedEventId = path[0].eventId;
      anomalies.push(anomaly);
    }
  }

  const names = new Map<string, ParticipantState[]>();
  for (const participant of participants.values()) {
    if (participant.deactivated) continue;
    const key = normalizeName(participant.name);
    if (!key) continue;
    names.set(key, [...(names.get(key) ?? []), participant]);
  }
  for (const candidates of names.values()) {
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i]!;
        const b = candidates[j]!;
        if (a.canonicalPid === b.canonicalPid || markedDistinct.has(pairKey(a.pid, b.pid))) continue;
        anomalies.push({
          code: "possible-duplicate-participants",
          pid: a.pid,
          relatedPid: b.pid,
          message: `${a.name} appears more than once`,
        });
      }
    }
  }

  for (const expense of expenses.values()) {
    for (const payer of expense.financials.payers) add(balances, canonical(payer.pid), payer.minor);
    for (const share of expense.financials.shares) add(balances, canonical(share.pid), -share.minor);
  }

  for (const settlement of settlements.values()) {
    add(balances, canonical(settlement.to), settlement.minor);
    add(balances, canonical(settlement.from), -settlement.minor);
  }

  const balanceSum = [...balances.values()].reduce((a, b) => a + b, 0n);
  if (balanceSum !== 0n) {
    anomalies.push({ code: "balance-not-zero", message: `Balance invariant failed: ${balanceSum}` });
  }

  anomalies.sort((a, b) =>
    a.code.localeCompare(b.code) ||
    (a.eventId ?? "").localeCompare(b.eventId ?? "") ||
    (a.relatedEventId ?? "").localeCompare(b.relatedEventId ?? "") ||
    (a.pid ?? "").localeCompare(b.pid ?? "") ||
    (a.relatedPid ?? "").localeCompare(b.relatedPid ?? "") ||
    (a.sid ?? "").localeCompare(b.sid ?? ""),
  );

  return {
    participants: new Map([...participants.entries()].sort(([a], [b]) => a.localeCompare(b))),
    expenses: new Map([...expenses.entries()].sort(([a], [b]) => a.localeCompare(b))),
    settlements: new Map([...settlements.entries()].sort(([a], [b]) => a.localeCompare(b))),
    balances: new Map([...balances.entries()].sort(([a], [b]) => a.localeCompare(b))),
    anomalies,
    quarantined: [...new Set(quarantined)].sort(),
    frozen: quarantined.length > 0,
  };
}

export const later = (a: Event, b: Event): Event => (compareHlc(a.hlc, b.hlc) >= 0 ? a : b);
