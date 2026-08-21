import { describe, expect, it } from "vitest";
import { isArchivedEventLog } from "@/lib/archive";
import type { Event } from "@theprawnsplit/core";

function event(id: string, ctr: number, t: "GroupArchived" | "GroupUnarchived"): Event {
  return {
    v: 1,
    id,
    hlc: { wall: 1_787_280_000_000 + ctr, ctr, dev: "d_test" },
    dev: "d_test",
    t,
    ...(t === "GroupArchived" ? { outstanding: [] } : {}),
  } as Event;
}

describe("archive lifecycle", () => {
  it("computes the latest archive state by event order", () => {
    expect(isArchivedEventLog([])).toBe(false);
    expect(isArchivedEventLog([event("d_test:1", 1, "GroupArchived")])).toBe(true);
    expect(isArchivedEventLog([event("d_test:2", 2, "GroupUnarchived"), event("d_test:1", 1, "GroupArchived")])).toBe(false);
    expect(isArchivedEventLog([event("d_test:1", 1, "GroupArchived"), event("d_test:2", 2, "GroupUnarchived"), event("d_test:3", 3, "GroupArchived")])).toBe(true);
  });
});
