import { describe, expect, it } from "vitest";
import { canRecordSettlement } from "@/lib/settlement-command";

const valid = {
  archived: false,
  allowSettlementActions: true,
  from: "bob",
  to: "alice",
  minor: 100n,
};

describe("settlement command eligibility", () => {
  it("allows recording only for active, unfrozen, positive transfers between different participants", () => {
    expect(canRecordSettlement(valid)).toBe(true);
    expect(canRecordSettlement({ ...valid, archived: true })).toBe(false);
    expect(canRecordSettlement({ ...valid, allowSettlementActions: false })).toBe(false);
    expect(canRecordSettlement({ ...valid, from: "" })).toBe(false);
    expect(canRecordSettlement({ ...valid, to: "" })).toBe(false);
    expect(canRecordSettlement({ ...valid, to: "bob" })).toBe(false);
    expect(canRecordSettlement({ ...valid, minor: null })).toBe(false);
    expect(canRecordSettlement({ ...valid, minor: 0n })).toBe(false);
  });
});
