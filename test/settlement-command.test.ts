import { describe, expect, it } from "vitest";
import { canConfirmSettlement, canRecordSettlement, hasActiveClaimAnomaly } from "@/lib/settlement-command";

const valid = {
  archived: false,
  allowSettlementActions: true,
  from: "bob",
  to: "alice",
  minor: 100n,
};

describe("settlement command eligibility", () => {
  it("allows recording only for active, unfrozen, positive transfers between different participants", () => {
    expect(canRecordSettlement(valid)).toBe(true);
    expect(canRecordSettlement({ ...valid, archived: true })).toBe(false);
    expect(canRecordSettlement({ ...valid, allowSettlementActions: false })).toBe(false);
    expect(canRecordSettlement({ ...valid, from: "" })).toBe(false);
    expect(canRecordSettlement({ ...valid, to: "" })).toBe(false);
    expect(canRecordSettlement({ ...valid, to: "bob" })).toBe(false);
    expect(canRecordSettlement({ ...valid, minor: null })).toBe(false);
    expect(canRecordSettlement({ ...valid, minor: 0n })).toBe(false);
  });

  it("allows confirmation only for a local uncontested payee identity", () => {
    const confirmable = {
      archived: false,
      allowSettlementActions: true,
      pending: true,
      hasLocalPayeeIdentity: true,
      payeeHasActiveClaimAnomaly: false,
    };

    expect(canConfirmSettlement(confirmable)).toBe(true);
    expect(canConfirmSettlement({ ...confirmable, archived: true })).toBe(false);
    expect(canConfirmSettlement({ ...confirmable, allowSettlementActions: false })).toBe(false);
    expect(canConfirmSettlement({ ...confirmable, pending: false })).toBe(false);
    expect(canConfirmSettlement({ ...confirmable, hasLocalPayeeIdentity: false })).toBe(false);
    expect(canConfirmSettlement({ ...confirmable, payeeHasActiveClaimAnomaly: true })).toBe(false);
  });

  it("treats payee claim anomalies as active confirmation blockers", () => {
    expect(hasActiveClaimAnomaly([{ code: "unverified-reclaim", pid: "alice" }], "alice")).toBe(true);
    expect(hasActiveClaimAnomaly([{ code: "device-claims-multiple-participants", pid: "alice" }], "alice")).toBe(true);
    expect(hasActiveClaimAnomaly([{ code: "unverified-reclaim", pid: "bob" }], "alice")).toBe(false);
    expect(hasActiveClaimAnomaly([{ code: "possible-duplicate-participants", pid: "alice" }], "alice")).toBe(false);
  });
});
