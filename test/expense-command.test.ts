import { describe, expect, it } from "vitest";
import { canAppendExpense } from "@/lib/expense-command";

const valid = {
  archived: false,
  hasLocalClaim: true,
  description: "Dinner",
  amountOk: true,
  sharesOk: true,
  payersOk: true,
};

describe("expense command eligibility", () => {
  it("allows appending only when claim, description, and money previews are valid", () => {
    expect(canAppendExpense(valid)).toBe(true);
    expect(canAppendExpense({ ...valid, archived: true })).toBe(false);
    expect(canAppendExpense({ ...valid, hasLocalClaim: false })).toBe(false);
    expect(canAppendExpense({ ...valid, description: "  " })).toBe(false);
    expect(canAppendExpense({ ...valid, amountOk: false })).toBe(false);
    expect(canAppendExpense({ ...valid, sharesOk: false })).toBe(false);
    expect(canAppendExpense({ ...valid, payersOk: false })).toBe(false);
  });
});
