export type SplitMode = "equal" | "exact" | "shares" | "percentage";

export function parseMinor(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (whole === undefined) return null;
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

export function parsePercentageBasisPoints(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (whole === undefined) return null;
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

export function parseShareWeight(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

export function formatMinor(minor: bigint, currency: string): string {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const cents = String(abs % 100n).padStart(2, "0");
  return `${sign}${currency} ${whole}.${cents}`;
}

export function formatMinorInput(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const cents = String(abs % 100n).padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

export function formatPercentageInput(part: bigint, total: bigint): string {
  if (total <= 0n) return "0.00";
  const scaledPercent = (part * 10_000n + total / 2n) / total;
  const whole = scaledPercent / 100n;
  const fraction = String(scaledPercent % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function formatBasisPoints(basisPoints: bigint): string {
  const whole = basisPoints / 100n;
  const fraction = String(basisPoints % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/**
 * LOGIC-004: allocate exactly 10,000 basis points across `parts` (which are
 * assumed to sum to `total`) using the largest-remainder method, so the
 * formatted percentages always sum to exactly 100.00% — unlike formatting
 * each part's percentage independently via formatPercentageInput, which can
 * under- or overshoot 100% once more than one share is involved (e.g. three
 * equal one-cent shares of a three-cent total round to 33.33% each, summing
 * to 99.99%).
 */
export function allocatePercentageBasisPoints(parts: bigint[], total: bigint): bigint[] {
  if (total <= 0n) return parts.map(() => 0n);
  const scaled = parts.map((part) => part * 10_000n);
  const floors = scaled.map((value) => value / total);
  let remaining = 10_000n - floors.reduce((sum, value) => sum + value, 0n);
  if (remaining <= 0n) return floors;
  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value % total }))
    .sort((a, b) => (b.remainder !== a.remainder ? Number(b.remainder - a.remainder) : a.index - b.index));
  const result = [...floors];
  for (const { index } of byRemainder) {
    if (remaining <= 0n) break;
    result[index] = (result[index] ?? 0n) + 1n;
    remaining -= 1n;
  }
  return result;
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { __bigint: value.toString() };
  return value;
}

export function bigintReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "__bigint" in value &&
    typeof (value as { __bigint: unknown }).__bigint === "string"
  ) {
    return BigInt((value as { __bigint: string }).__bigint);
  }
  return value;
}
