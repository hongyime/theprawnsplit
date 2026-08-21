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
