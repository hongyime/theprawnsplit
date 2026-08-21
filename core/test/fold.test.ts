import { describe, expect, it } from "vitest";
import { canonicalStateBytes } from "../src/canonical";
import { fold } from "../src/fold";
import { base, claim, confirm, financials, verifier } from "./helpers";

describe("REQ-MON-15/REQ-SYN-12 fold", () => {
  it("computes zero-sum balances over live admitted events", () => {
    const state = fold(
      [
        base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
        base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
        base("ExpenseAdded", {
          xid: "x1",
          financials: financials(100n, [["alice", 100n]], [["alice", 50n], ["bob", 50n]]),
          desc: "Lunch",
          at: 1,
          date: "2026-08-21",
        } as never),
      ],
      { supportedVersion: 1 },
    );
    expect(state.balances.get("alice")).toBe(50n);
    expect(state.balances.get("bob")).toBe(-50n);
    expect([...state.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("quarantines unsupported schema events and freezes authoritative balances", () => {
    const state = fold([base("ParticipantAdded", { id: "future-schema", v: 2, pid: "alice", name: "Alice" } as never)], { supportedVersion: 1 });
    expect(state.quarantined).toEqual(["future-schema"]);
    expect(state.frozen).toBe(true);
  });

  it("void cascade removes edited expenses from balances", () => {
    const added = base("ExpenseAdded", {
      id: "add-x",
      xid: "x1",
      financials: financials(100n, [["alice", 100n]], [["bob", 100n]]),
      desc: "Lunch",
      at: 1,
      date: "2026-08-21",
    } as never);
    const state = fold([added, base("ExpenseVoided", { xid: "x1" } as never)], { supportedVersion: 1 });
    expect(state.expenses.has("x1")).toBe(false);
    expect([...state.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("keeps concurrent financial edits visible in history", () => {
    const added = base("ExpenseAdded", {
      xid: "x1",
      financials: financials(100n, [["alice", 100n]], [["bob", 100n]]),
      desc: "Lunch",
      at: 1,
      date: "2026-08-21",
    } as never);
    const editA = base("ExpenseEdited", {
      xid: "x1",
      financials: financials(120n, [["alice", 120n]], [["bob", 120n]]),
    } as never);
    const editB = base("ExpenseEdited", {
      xid: "x1",
      financials: financials(140n, [["alice", 140n]], [["bob", 140n]]),
    } as never);
    const state = fold([editB, added, editA], { supportedVersion: 1 });
    expect(state.expenses.get("x1")?.financialHistory.map((f) => f.minor)).toEqual([100n, 120n, 140n]);
  });

  it("produces canonical bytes independent of delivery order", () => {
    const events = [
      claim("alice", "phone", "alice-key"),
      base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
      base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
      base("ExpenseAdded", {
        xid: "x1",
        financials: financials(100n, [["alice", 100n]], [["bob", 100n]]),
        desc: "Lunch",
        at: 1,
        date: "2026-08-21",
      } as never),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n } as never),
      confirm("s1", "alice-key"),
    ];
    const a = canonicalStateBytes(fold(events, { supportedVersion: 1 }, verifier));
    const b = canonicalStateBytes(fold([...events].reverse(), { supportedVersion: 1 }, verifier));
    expect(b).toBe(a);
  });
});
