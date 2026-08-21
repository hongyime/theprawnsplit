import { describe, expect, it } from "vitest";
import { expenseDisplayRows } from "@/lib/expense-display";

describe("expense display rows", () => {
  it("orders and displays by stored local date instead of deriving a day from UTC timestamp", () => {
    const lateLocalDay = {
      xid: "late-local",
      desc: "Late local day",
      date: "2026-08-22",
      at: Date.UTC(2026, 7, 21, 16, 30),
    };
    const earlierLocalDay = {
      xid: "earlier-local",
      desc: "Earlier local day",
      date: "2026-08-21",
      at: Date.UTC(2026, 7, 21, 23, 30),
    };

    const rows = expenseDisplayRows([earlierLocalDay, lateLocalDay]);

    expect(rows.map((row) => row.xid)).toEqual(["late-local", "earlier-local"]);
    expect(rows.map((row) => row.date)).toEqual(["2026-08-22", "2026-08-21"]);
  });
});
