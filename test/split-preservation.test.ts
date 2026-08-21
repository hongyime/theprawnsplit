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
});
