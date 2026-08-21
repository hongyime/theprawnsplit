import { describe, expect, it } from "vitest";
import { formatMinorInput, formatPercentageInput } from "@/lib/money";

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
});
