import type { Financials } from "@theprawnsplit/core";
import { parseMinor } from "./money";

export interface CurrencyAmountPreview {
  ok: true;
  enteredMinor: bigint;
  baseMinor: bigint;
  rate?: NonNullable<Financials["rate"]>;
}

export type CurrencyAmountResult = CurrencyAmountPreview | { ok: false; message: string };

export function parseExchangeRate(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const rate = Number(trimmed);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
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

  const rate = parseExchangeRate(input.rateText);
  if (rate === null) return { ok: false, message: "Enter a valid exchange rate." };
  return {
    ok: true,
    enteredMinor,
    baseMinor: convertToBaseMinor(enteredMinor, rate),
    rate: { currency, toBase: rate },
  };
}

export function convertToBaseMinor(minor: bigint, toBase: number): bigint {
  return BigInt(Math.round(Number(minor) * toBase));
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}
