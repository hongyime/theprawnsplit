import { describe, expect, it } from "vitest";
import { admissionGate, receive } from "../src/hlc";
import { base, hlc } from "./helpers";

describe("REQ-SYN-24 HLC and admissionGate", () => {
  it("never decreases when the local clock moves backwards", () => {
    expect(receive(hlc(1000, 2, "local"), hlc(900, 0, "remote"), 800)).toEqual({ wall: 1000, ctr: 3, dev: "local" });
  });

  it("admits a normal 8-hour gap", () => {
    const event = base("ExpenseAdded", {
      hlc: hlc(20 * 60 * 60 * 1000),
      xid: "dinner",
      financials: { minor: 1n, payers: [{ pid: "a", minor: 1n }], shares: [{ pid: "a", minor: 1n }] },
      desc: "Dinner",
      at: 20 * 60 * 60 * 1000,
      date: "2026-08-21",
    } as never);
    expect(admissionGate(event, 20 * 60 * 60 * 1000, 120_000)).toEqual({ ok: true });
  });

  it("admits a 3-day-old offline event", () => {
    const event = base("ParticipantAdded", { hlc: hlc(1_000), pid: "a", name: "A" } as never);
    expect(admissionGate(event, 3 * 24 * 60 * 60 * 1000, 120_000)).toEqual({ ok: true });
  });

  it("buffers a clock 5 minutes fast without mutating the event", () => {
    const event = base("ParticipantAdded", { hlc: hlc(300_000), pid: "a", name: "A" } as never);
    expect(admissionGate(event, 0, 120_000)).toEqual({ ok: false, reason: "future", retryAt: 180_000 });
    expect(event.hlc.wall).toBe(300_000);
  });
});
