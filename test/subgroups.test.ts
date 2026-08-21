import { describe, expect, it } from "vitest";
import { applySubgroupSelection, deleteSubgroupPreset, normalizeSubgroupName, upsertSubgroupPreset } from "@/lib/subgroups";

describe("subgroup presets", () => {
  it("normalizes names and keeps only valid participant ids", () => {
    const presets = upsertSubgroupPreset(
      [],
      { id: "room", name: "  Room   A  ", pids: ["bob", "missing", "alice", "bob"] },
      ["alice", "bob", "chris"],
    );

    expect(presets).toEqual([{ id: "room", name: "Room A", pids: ["alice", "bob"] }]);
  });

  it("replaces an existing preset by id and sorts by display name", () => {
    const presets = upsertSubgroupPreset(
      [
        { id: "b", name: "Zoo", pids: ["alice"] },
        { id: "a", name: "Old", pids: ["bob"] },
      ],
      { id: "a", name: "Alpha", pids: ["chris"] },
      ["alice", "bob", "chris"],
    );

    expect(presets.map((preset) => preset.name)).toEqual(["Alpha", "Zoo"]);
    expect(presets.find((preset) => preset.id === "a")?.pids).toEqual(["chris"]);
  });

  it("applies and deletes presets without touching money state", () => {
    expect(applySubgroupSelection({ pids: ["bob"] }, ["alice", "bob", "chris"])).toEqual({
      alice: false,
      bob: true,
      chris: false,
    });
    expect(deleteSubgroupPreset([{ id: "a", name: "A", pids: ["alice"] }], "a")).toEqual([]);
  });

  it("trims long names", () => {
    expect(normalizeSubgroupName("x".repeat(50))).toHaveLength(40);
  });
});
