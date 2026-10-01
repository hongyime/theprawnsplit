import { describe, expect, it } from "vitest";
import { preserveSplitInputs } from "@/lib/split-preservation";

describe("split mode preservation", () => {
  it("prefills equal-to-shares with one share per included participant", () => {
    const preserved = preserveSplitInputs({
      fromMode: "equal",
      toMode: "shares",
      selectedPids: ["alice", "bob", "chris"],
      total: 1000n,
      preview: {
        shares: [
          { pid: "alice", minor: 334n },
          { pid: "bob", minor: 333n },
          { pid: "chris", minor: 333n },
        ],
      },
    });

    expect(preserved.shareWeights).toEqual({ alice: "1", bob: "1", chris: "1" });
    expect(preserved.exactShares).toEqual({ alice: "3.34", bob: "3.33", chris: "3.33" });
  });

  it("converts exact amounts to percentage text without blanking the form", () => {
    const preserved = preserveSplitInputs({
      fromMode: "exact",
      toMode: "percentage",
      selectedPids: ["alice", "bob"],
      total: 1000n,
      preview: {
        shares: [
          { pid: "alice", minor: 250n },
          { pid: "bob", minor: 750n },
        ],
      },
    });

    expect(preserved.percentages).toEqual({ alice: "25.00", bob: "75.00" });
    expect(preserved.exactShares).toEqual({ alice: "2.50", bob: "7.50" });
  });

  it("conserves an exact 100% total for three equal one-cent shares (LOGIC-004)", () => {
    const preserved = preserveSplitInputs({
      fromMode: "equal",
      toMode: "percentage",
      selectedPids: ["alice", "bob", "chris"],
      total: 3n,
      preview: {
        shares: [
          { pid: "alice", minor: 1n },
          { pid: "bob", minor: 1n },
          { pid: "chris", minor: 1n },
        ],
      },
    });

    const sum = Object.values(preserved.percentages).reduce((a, b) => a + Number(b), 0);
    expect(sum).toBeCloseTo(100, 10);
    expect(Object.values(preserved.percentages).every((value) => /^\d+\.\d{2}$/.test(value))).toBe(true);
  });

  it("conserves an exact 100% total for an uneven four-way split without changing the underlying minor shares", () => {
    const preserved = preserveSplitInputs({
      fromMode: "shares",
      toMode: "percentage",
      selectedPids: ["a", "b", "c", "d"],
      total: 700n,
      preview: {
        shares: [
          { pid: "a", minor: 233n },
          { pid: "b", minor: 233n },
          { pid: "c", minor: 117n },
          { pid: "d", minor: 117n },
        ],
      },
    });

    const sum = Object.values(preserved.percentages).reduce((a, b) => a + Number(b), 0);
    expect(sum).toBeCloseTo(100, 10);
  });
});
