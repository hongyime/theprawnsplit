import { describe, expect, it } from "vitest";
import { greedySettlement } from "../src/settle";

describe("REQ-SET-01 greedySettlement", () => {
  it("zeros balances with at most n-1 deterministic transfers", () => {
    const balances = new Map([
      ["debtor-b", -5n],
      ["debtor-a", -5n],
      ["creditor-b", 5n],
      ["creditor-a", 5n],
    ]);
    const transfers = greedySettlement(balances);
    expect(transfers).toEqual([
      { from: "debtor-a", to: "creditor-a", minor: 5n },
      { from: "debtor-b", to: "creditor-b", minor: 5n },
    ]);
    expect(transfers.length).toBeLessThanOrEqual(balances.size - 1);
  });

  it("returns no transfers for an already settled group", () => {
    expect(greedySettlement(new Map([["a", 0n], ["b", 0n]]))).toEqual([]);
  });
});
