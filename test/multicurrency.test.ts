import { describe, expect, it } from "vitest";
import { currencyAmountPreview, parseExchangeRate } from "@/lib/multicurrency";

describe("multi-currency amount preview", () => {
  it("uses group currency amounts without a rate", () => {
    expect(currencyAmountPreview({ amountText: "12.34", currency: "usd", baseCurrency: "USD", rateText: "" })).toEqual({
      ok: true,
      enteredMinor: 1234n,
      baseMinor: 1234n,
    });
  });

  it("freezes a positive exchange rate and converts entered minor units to base minor units", () => {
    expect(currencyAmountPreview({ amountText: "10.00", currency: "EUR", baseCurrency: "USD", rateText: "1.08" })).toEqual({
      ok: true,
      enteredMinor: 1000n,
      baseMinor: 1080n,
      rate: { currency: "EUR", toBase: 1.08 },
    });
  });

  it("rejects missing or non-positive exchange rates", () => {
    expect(parseExchangeRate("0")).toBeNull();
    expect(parseExchangeRate("abc")).toBeNull();
    expect(currencyAmountPreview({ amountText: "10.00", currency: "EUR", baseCurrency: "USD", rateText: "" })).toEqual({
      ok: false,
      message: "Enter a valid exchange rate.",
    });
  });
});
