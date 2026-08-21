import type { Financials } from "@theprawnsplit/core";
import { parseMinor } from "./money";

export interface CurrencyAmountPreview {
  ok: true;
  enteredMinor: bigint;
  baseMinor: bigint;
  rate?: NonNullable<Financials["rate"]>;
}

export type CurrencyAmountResult = CurrencyAmountPreview | { ok: false; message: string };

interface DecimalRate {
  display: number;
  numerator: bigint;
  denominator: bigint;
}

export function parseExchangeRate(input: string): number | null {
  return parseDecimalRate(input)?.display ?? null;
}

function parseDecimalRate(input: string): DecimalRate | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole = "", fraction = ""] = trimmed.split(".");
  const digits = `${whole}${fraction}`;
  const numerator = BigInt(digits);
  const denominator = 10n ** BigInt(fraction.length);
  if (numerator <= 0n) return null;
  const display = Number(trimmed);
  return Number.isFinite(display) && display > 0 ? { display, numerator, denominator } : null;
}

export function currencyAmountPreview(input: {
  amountText: string;
  currency: string;
  baseCurrency: string;
  rateText: string;
}): CurrencyAmountResult {
  const enteredMinor = parseMinor(input.amountText);
  if (enteredMinor === null) return { ok: false, message: "Enter a valid total." };
  const currency = normalizeCurrency(input.currency);
  const baseCurrency = normalizeCurrency(input.baseCurrency);
  if (currency === baseCurrency) return { ok: true, enteredMinor, baseMinor: enteredMinor };

  const rate = parseDecimalRate(input.rateText);
  if (rate === null) return { ok: false, message: "Enter a valid exchange rate." };
  return {
    ok: true,
    enteredMinor,
    baseMinor: convertToBaseMinor(enteredMinor, rate),
    rate: { currency, toBase: rate.display },
  };
}

export function convertToBaseMinor(minor: bigint, toBase: DecimalRate): bigint {
  const scaled = minor * toBase.numerator;
  return (scaled + toBase.denominator / 2n) / toBase.denominator;
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}
