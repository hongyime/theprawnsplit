import { describe, expect, it } from "vitest";
import { editFinancialsForTotal } from "@/lib/expense-edit";

describe("expense edit financials", () => {
  it("rescales payers and shares while preserving multi-payer structure and rate", () => {
    const financials = editFinancialsForTotal({
      eventId: "phone:7",
      nextMinor: 2160n,
      current: {
        minor: 1080n,
        payers: [
          { pid: "alice", minor: 700n },
          { pid: "bob", minor: 380n },
        ],
        shares: [
          { pid: "alice", minor: 360n },
          { pid: "bob", minor: 360n },
          { pid: "chris", minor: 360n },
        ],
        rate: { currency: "EUR", toBase: 1.08 },
      },
    });

    expect(financials).toEqual({
      minor: 2160n,
      payers: [
        { pid: "alice", minor: 1400n },
        { pid: "bob", minor: 760n },
      ],
      shares: [
        { pid: "alice", minor: 720n },
        { pid: "bob", minor: 720n },
        { pid: "chris", minor: 720n },
      ],
      rate: { currency: "EUR", toBase: 1.08 },
    });
  });

  it("keeps edited payer and share totals exact after rounding", () => {
    const financials = editFinancialsForTotal({
      eventId: "phone:8",
      nextMinor: 100n,
      current: {
        minor: 99n,
        payers: [
          { pid: "alice", minor: 50n },
          { pid: "bob", minor: 49n },
        ],
        shares: [
          { pid: "alice", minor: 33n },
          { pid: "bob", minor: 33n },
          { pid: "chris", minor: 33n },
        ],
      },
    });

    expect(financials.payers.reduce((sum, payer) => sum + payer.minor, 0n)).toBe(100n);
    expect(financials.shares.reduce((sum, share) => sum + share.minor, 0n)).toBe(100n);
    expect(financials.payers.map((payer) => payer.pid)).toEqual(["alice", "bob"]);
    expect(financials.shares.map((share) => share.pid)).toEqual(["alice", "bob", "chris"]);
  });

  it("keeps all-zero imported financial rows editable", () => {
    const financials = editFinancialsForTotal({
      eventId: "phone:9",
      nextMinor: 100n,
      current: {
        minor: 0n,
        payers: [
          { pid: "alice", minor: 0n },
          { pid: "bob", minor: 0n },
        ],
        shares: [
          { pid: "alice", minor: 0n },
          { pid: "bob", minor: 0n },
        ],
      },
    });

    expect(financials.payers.reduce((sum, payer) => sum + payer.minor, 0n)).toBe(100n);
    expect(financials.shares.reduce((sum, share) => sum + share.minor, 0n)).toBe(100n);
    expect(financials.payers.map((payer) => payer.pid)).toEqual(["alice", "bob"]);
    expect(financials.shares.map((share) => share.pid)).toEqual(["alice", "bob"]);
  });
});
