import { allocate } from "@theprawnsplit/core";
import { parseMinor, parsePercentageBasisPoints, parseShareWeight, type SplitMode } from "@/lib/money";
import type { CurrencyAmountResult } from "@/lib/multicurrency";
import type { Financials } from "@theprawnsplit/core";

export interface ExpenseDraftPayload {
  xid: string;
  description: string;
  baseMinor: bigint;
  rate: Financials["rate"];
  payers: { pid: string; minor: bigint }[];
  shares: { pid: string; minor: bigint }[];
}

export type SharePreview =
  | { ok: true; shares: { pid: string; minor: bigint }[]; remainderPid?: string }
  | { ok: false; message: string };

function allocatedShares(total: bigint, weights: bigint[], eventId: string, pids: string[]) {
  const shares = allocate(total, weights, eventId, pids).map((minor, index) => ({ pid: pids[index]!, minor }));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  const base = weights.map((weight) => (total * weight) / weightTotal);
  const remainderPid = shares.find((share, index) => share.minor > (base[index] ?? 0n))?.pid;
  return remainderPid ? { shares, remainderPid } : { shares };
}

/**
 * Build the preview with the draft's eventual event ID as its allocation salt.
 * Keep this ID stable until submit so the saved event exactly matches preview.
 */
export function buildSharePreview(
  amount: CurrencyAmountResult,
  participants: { pid: string }[],
  selectedPids: Record<string, boolean>,
  splitMode: SplitMode,
  exactShares: Record<string, string>,
  shareWeights: Record<string, string>,
  percentages: Record<string, string>,
  draftXid: string,
): SharePreview {
  if (!amount.ok) return { ok: false, message: amount.message };
  const total = amount.baseMinor;
  const pids = participants.filter((participant) => selectedPids[participant.pid]).map((participant) => participant.pid);
  if (pids.length === 0) return { ok: false, message: "Select at least one participant." };
  if (splitMode === "equal") {
    const result = allocatedShares(total, pids.map(() => 1n), draftXid, pids);
    return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
  }
  if (splitMode === "exact") {
    const shares = pids.map((pid) => ({ pid, minor: parseMinor(exactShares[pid] ?? "") ?? -1n }));
    if (shares.some((share) => share.minor < 0n)) return { ok: false, message: "Every exact share needs an amount." };
    const sum = shares.reduce((left, right) => left + right.minor, 0n);
    if (sum !== total) return { ok: false, message: "Exact shares must sum to the total." };
    return { ok: true, shares };
  }
  if (splitMode === "shares") {
    const weights = pids.map((pid) => parseShareWeight(shareWeights[pid] ?? "0") ?? -1n);
    if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Share weights must be whole numbers." };
    if (weights.every((weight) => weight === 0n)) return { ok: false, message: "Enter at least one share weight." };
    const result = allocatedShares(total, weights, draftXid, pids);
    return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
  }
  const weights = pids.map((pid) => parsePercentageBasisPoints(percentages[pid] ?? "0") ?? -1n);
  if (weights.some((weight) => weight < 0n)) return { ok: false, message: "Percentages must be valid." };
  if (weights.reduce((sum, weight) => sum + weight, 0n) !== 10_000n) return { ok: false, message: "Percentages Must Total 100%." };
  const result = allocatedShares(total, weights, draftXid, pids);
  return result.remainderPid ? { ok: true, shares: result.shares, remainderPid: result.remainderPid } : { ok: true, shares: result.shares };
}
