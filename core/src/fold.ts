import { buildDSU, claimAnomalies, verifyConfirmation, voidedEventIds } from "./identity";
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
  const expenseVoids = new Set<string>();
  const settlementVoids = new Set<string>();
  for (const event of supported) {
    if (event.t === "ExpenseVoided") expenseVoids.add(event.xid);
    if (event.t === "SettlementVoided") settlementVoids.add(event.sid);
    if (event.t === "EventVoided") {
      const target = supported.find((candidate) => candidate.id === event.targetId);
      if (target?.t === "EventVoided") {
        anomalies.push({ code: "voids-void", eventId: event.id, relatedEventId: target.id, message: "EventVoided cannot be voided" });
      }
    }
  }

  const dsu = buildDSU(supported);
  const canonical = (pid: string): string => dsu.get(pid) ?? pid;
  const participants = new Map<string, ParticipantState>();
  const claimDevices = new Map<string, Set<string>>();
  const expenses = new Map<string, ExpenseState>();
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
    if (event.t === "ParticipantClaimed") {
      const root = canonical(event.pid);
      if (!claimDevices.has(root)) claimDevices.set(root, new Set());
      claimDevices.get(root)!.add(event.deviceId);
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
        next.financials = event.financials;
      }
      if (event.meta?.desc !== undefined) next.desc = event.meta.desc;
      if (event.meta?.date !== undefined) next.date = event.meta.date;
      expenses.set(event.xid, next);
    }
    if (event.t === "SettlementRecorded" && !settlementVoids.has(event.sid)) {
      settlements.set(event.sid, {
        sid: event.sid,
        from: event.from,
        to: event.to,
        minor: event.minor,
        confirmed: false,
        disputed: false,
        pending: true,
      });
    }
    if (event.t === "SettlementConfirmed") {
      const settlement = settlements.get(event.sid);
      if (settlement && ctx && verifyConfirmation(supported, event.sid, event.claimSig, ctx)) {
        settlements.set(event.sid, { ...settlement, confirmed: true, pending: false });
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
