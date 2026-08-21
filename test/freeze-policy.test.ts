import { describe, expect, it } from "vitest";
import { frozenViewPolicy } from "@/lib/freeze-policy";

describe("frozen ledger view policy", () => {
  it("allows authoritative money surfaces when no event is quarantined", () => {
    expect(frozenViewPolicy({ frozen: false, quarantined: [] })).toEqual({
      displayBalances: true,
      allowSettlementActions: true,
      message: undefined,
    });
  });

  it("hides balances and freezes settlement actions when newer events are quarantined", () => {
    expect(frozenViewPolicy({ frozen: true, quarantined: ["future"] })).toEqual({
      displayBalances: false,
      allowSettlementActions: false,
      message: "1 newer ledger event retained but excluded. Update before trusting balances or settlements.",
    });
  });
});
