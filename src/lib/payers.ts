import { parseMinor } from "./money";

export type PayerMode = "single" | "multiple";

export type PayerPreview =
  | { ok: true; payers: { pid: string; minor: bigint }[] }
  | { ok: false; message: string };

export function buildPayerPreview(
  total: bigint | null,
  mode: PayerMode,
  singlePayerPid: string,
  payerAmounts: Record<string, string>,
  participantPids: string[],
): PayerPreview {
  if (total === null) return { ok: false, message: "Enter a valid total." };
  if (mode === "single") {
    return singlePayerPid ? { ok: true, payers: [{ pid: singlePayerPid, minor: total }] } : { ok: false, message: "Choose who paid." };
  }
  const payers = participantPids.map((pid) => ({ pid, minor: parseMinor(payerAmounts[pid] ?? "0") ?? -1n }));
  if (payers.some((payer) => payer.minor < 0n)) return { ok: false, message: "Payment amounts must be valid." };
  const nonZero = payers.filter((payer) => payer.minor > 0n);
  if (nonZero.length === 0) return { ok: false, message: "Enter at least one payer amount." };
  const sum = nonZero.reduce((totalPaid, payer) => totalPaid + payer.minor, 0n);
  if (sum !== total) return { ok: false, message: "Payer amounts must sum to the total." };
  return { ok: true, payers: nonZero };
}
