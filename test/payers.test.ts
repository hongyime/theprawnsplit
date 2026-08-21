import { describe, expect, it } from "vitest";
import { buildPayerPreview } from "@/lib/payers";

describe("payer preview", () => {
  it("builds the existing single-payer shape", () => {
    expect(buildPayerPreview(1200n, "single", "p_alice", {}, ["p_alice", "p_bob"])).toEqual({
      ok: true,
      payers: [{ pid: "p_alice", minor: 1200n }],
    });
  });

  it("builds multi-payer rows when entered amounts sum to the total", () => {
    expect(
      buildPayerPreview(1200n, "multiple", "p_alice", { p_alice: "7.00", p_bob: "5.00", p_chris: "0" }, [
        "p_alice",
        "p_bob",
        "p_chris",
      ]),
    ).toEqual({
      ok: true,
      payers: [
        { pid: "p_alice", minor: 700n },
        { pid: "p_bob", minor: 500n },
      ],
    });
  });

  it("rejects invalid or unbalanced multi-payer rows", () => {
    expect(buildPayerPreview(1200n, "multiple", "p_alice", { p_alice: "bad", p_bob: "5.00" }, ["p_alice", "p_bob"])).toEqual({
      ok: false,
      message: "Payment amounts must be valid.",
    });
    expect(buildPayerPreview(1200n, "multiple", "p_alice", { p_alice: "5.00", p_bob: "5.00" }, ["p_alice", "p_bob"])).toEqual({
      ok: false,
      message: "Payer amounts must sum to the total.",
    });
  });
});
