import { describe, expect, it } from "vitest";
import { expenseHistoryRows } from "@/lib/expense-history";

const money = (minor: bigint) => ({
  minor,
  payers: [{ pid: "alice", minor }],
  shares: [{ pid: "bob", minor }],
});

describe("expense history rows", () => {
  it("keeps superseded financial corrections visible and marks the active one", () => {
    const original = money(100n);
    const active = money(140n);
    const superseded = money(120n);

    const rows = expenseHistoryRows({
      financials: active,
      financialHistory: [original, active, superseded],
    });

    expect(rows.map((row) => row.label)).toEqual(["Original", "Correction 1", "Correction 2"]);
    expect(rows.map((row) => row.financials.minor)).toEqual([100n, 140n, 120n]);
    expect(rows.map((row) => row.active)).toEqual([false, true, false]);
  });
});
