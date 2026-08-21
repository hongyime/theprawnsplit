import { describe, expect, it } from "vitest";
import { formatMinorInput, formatPercentageInput, parsePercentageBasisPoints, parseShareWeight } from "@/lib/money";

describe("money input formatting", () => {
  it("formats minor units for editable inputs without Number precision loss", () => {
    expect(formatMinorInput(9007199254740991n)).toBe("90071992547409.91");
    expect(formatMinorInput(-123n)).toBe("-1.23");
  });

  it("formats percentage inputs with two decimal places using integer rounding", () => {
    expect(formatPercentageInput(1n, 3n)).toBe("33.33");
    expect(formatPercentageInput(2n, 3n)).toBe("66.67");
    expect(formatPercentageInput(9007199254740991n, 18014398509481982n)).toBe("50.00");
  });

  it("parses percentage basis points without floating point arithmetic", () => {
    expect(parsePercentageBasisPoints("33.33")).toBe(3333n);
    expect(parsePercentageBasisPoints("33.3")).toBe(3330n);
    expect(parsePercentageBasisPoints("100")).toBe(10000n);
    expect(parsePercentageBasisPoints("bad")).toBeNull();
    expect(parsePercentageBasisPoints("12.345")).toBeNull();
  });

  it("parses share weights as strict whole-number text", () => {
    expect(parseShareWeight("0012")).toBe(12n);
    expect(parseShareWeight("0")).toBe(0n);
    expect(parseShareWeight("2abc")).toBeNull();
    expect(parseShareWeight("1.5")).toBeNull();
  });
});
