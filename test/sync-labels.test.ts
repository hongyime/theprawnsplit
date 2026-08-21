import { describe, expect, it } from "vitest";
import { syncSurfaceLabels } from "@/lib/sync-labels";

describe("sync surface labels", () => {
  it("does not show ready copy while local or published events remain unconfirmed", () => {
    expect(syncSurfaceLabels({ unconfirmedCount: 2, quarantinedCount: 0 })).toEqual({
      topbar: "offline, changes unconfirmed",
      protection: "2 unsynced",
    });
  });

  it("uses ready copy only when sync is current and no newer schema event is quarantined", () => {
    expect(syncSurfaceLabels({ unconfirmedCount: 0, quarantinedCount: 0 })).toEqual({
      topbar: "ready offline",
      protection: "sync current",
    });
  });

  it("prioritizes update-required copy over ordinary unsynced status", () => {
    expect(syncSurfaceLabels({ unconfirmedCount: 1, quarantinedCount: 1 })).toEqual({
      topbar: "update required",
      protection: "sync blocked",
    });
  });
});
