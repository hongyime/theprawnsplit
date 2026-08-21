import { describe, expect, it } from "vitest";
import { canonicalStateBytes } from "../src/canonical";
import { fold } from "../src/fold";
import { base, claim, confirm, financials, groupTag, link, sig, verifier } from "./helpers";

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

  it("does not let a causally older financial edit overwrite a newer one by HLC skew", () => {
    const added = base("ExpenseAdded", {
      id: "a:1",
      dev: "a",
      hlc: { wall: 1, ctr: 1, dev: "a" },
      vv: { a: 1 },
      xid: "x1",
      financials: financials(100n, [["alice", 100n]], [["bob", 100n]]),
      desc: "Lunch",
      at: 1,
      date: "2026-08-21",
    } as never);
    const oldCorrection = base("ExpenseEdited", {
      id: "b:1",
      dev: "b",
      hlc: { wall: 30, ctr: 1, dev: "b" },
      vv: { a: 1, b: 1 },
      xid: "x1",
      financials: financials(120n, [["alice", 120n]], [["bob", 120n]]),
    } as never);
    const newCorrection = base("ExpenseEdited", {
      id: "a:2",
      dev: "a",
      hlc: { wall: 20, ctr: 2, dev: "a" },
      vv: { a: 2, b: 1 },
      xid: "x1",
      financials: financials(140n, [["alice", 140n]], [["bob", 140n]]),
    } as never);

    const state = fold([oldCorrection, added, newCorrection], { supportedVersion: 1 });

    expect(state.expenses.get("x1")?.financials.minor).toBe(140n);
    expect(state.expenses.get("x1")?.financialHistory.map((f) => f.minor)).toEqual([100n, 140n, 120n]);
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

  it("keeps contested settlement confirmations pending in folded state", () => {
    const events = [
      claim("alice", "phone", "alice-key"),
      claim("alice", "tablet", "tablet-key"),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n } as never),
      confirm("s1", "tablet-key"),
    ];
    const state = fold(events, { supportedVersion: 1 }, verifier);

    expect(state.anomalies.map((anomaly) => anomaly.code)).toContain("contested-participant-claim");
    expect(state.settlements.get("s1")?.pending).toBe(true);
    expect(state.settlements.get("s1")?.confirmed).toBe(false);
    expect(state.settlements.get("s1")?.contestedConfirmation).toBe(true);
    expect(state.anomalies.map((anomaly) => anomaly.code)).toContain("contested-settlement-confirmation");
  });

  it("ignores invalid confirmations for contested payees", () => {
    const state = fold(
      [
        claim("alice", "phone", "alice-key"),
        claim("alice", "tablet", "tablet-key"),
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n } as never),
        base("SettlementConfirmed", { sid: "s1", pid: "alice", claimSig: "not-a-valid-signature" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.get("s1")?.pending).toBe(true);
    expect(state.settlements.get("s1")?.confirmed).toBe(false);
    expect(state.settlements.get("s1")?.contestedConfirmation).toBe(false);
    expect(state.anomalies.map((anomaly) => anomaly.code)).not.toContain("contested-settlement-confirmation");
  });

  it("marks settlements recorded by an uncontested payee device born confirmed", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "alice-phone" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.get("s1")?.confirmed).toBe(true);
    expect(state.settlements.get("s1")?.pending).toBe(false);
    expect(state.settlements.get("s1")?.cashUnconfirmable).toBe(false);
  });

  it("marks settlements to shadow payees cash-unconfirmable without pending nag state", () => {
    const state = fold(
      [base("ParticipantAdded", { pid: "shadow", name: "Shadow" } as never), base("SettlementRecorded", { sid: "s1", from: "bob", to: "shadow", minor: 100n } as never)],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.get("s1")?.confirmed).toBe(false);
    expect(state.settlements.get("s1")?.pending).toBe(false);
    expect(state.settlements.get("s1")?.cashUnconfirmable).toBe(true);
  });

  it("displays disputes without reversing settlement balances", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n } as never),
        base("SettlementDisputed", { sid: "s1", note: "Cash was not received" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.get("s1")?.disputed).toBe(true);
    expect(state.settlements.get("s1")?.pending).toBe(true);
    expect(state.balances.get("alice")).toBe(100n);
    expect(state.balances.get("bob")).toBe(-100n);
  });

  it("allows the recording device to void its own settlement", () => {
    const state = fold(
      [
        base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
        base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        base("SettlementVoided", { sid: "s1", dev: "bob-phone" } as never),
      ],
      { supportedVersion: 1 },
    );

    expect(state.settlements.has("s1")).toBe(false);
    expect([...state.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("rejects settlement voids from another device", () => {
    const state = fold(
      [
        base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
        base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        base("SettlementVoided", { id: "void-1", sid: "s1", dev: "alice-phone" } as never),
      ],
      { supportedVersion: 1 },
    );

    expect(state.settlements.has("s1")).toBe(true);
    expect(state.anomalies.find((anomaly) => anomaly.code === "unauthorized-settlement-void")?.relatedEventId).toBe("settle-1");
    expect(state.balances.get("alice")).toBe(100n);
    expect(state.balances.get("bob")).toBe(-100n);
  });

  it("surfaces duplicate participant names unless marked distinct", () => {
    const aliceA = base("ParticipantAdded", { pid: "alice-a", name: "Dave" } as never);
    const aliceB = base("ParticipantAdded", { pid: "alice-b", name: " dave " } as never);
    const duplicate = fold([aliceA, aliceB], { supportedVersion: 1 });
    expect(duplicate.anomalies.map((anomaly) => anomaly.code)).toContain("possible-duplicate-participants");

    const distinct = fold(
      [aliceA, aliceB, base("ParticipantsMarkedDistinct", { a: "alice-a", b: "alice-b" } as never)],
      { supportedVersion: 1 },
    );
    expect(distinct.anomalies.map((anomaly) => anomaly.code)).not.toContain("possible-duplicate-participants");
    expect(distinct.participants.get("alice-a")?.canonicalPid).toBe("alice-a");
    expect(distinct.participants.get("alice-b")?.canonicalPid).toBe("alice-b");
  });

  it("surfaces marked-distinct contradictions without altering merge balances", () => {
    const events = [
      base("ParticipantAdded", { pid: "alice", name: "Alex" } as never),
      base("ParticipantAdded", { pid: "bob", name: "Blake" } as never),
      base("ParticipantMerged", { id: "merge-1", from: "bob", into: "alice" } as never),
      base("ParticipantsMarkedDistinct", { id: "distinct-1", a: "alice", b: "bob" } as never),
      base("ExpenseAdded", {
        xid: "x1",
        financials: financials(100n, [["alice", 100n]], [["bob", 100n]]),
        desc: "Lunch",
        at: 1,
        date: "2026-08-21",
      } as never),
    ];
    const state = fold(events, { supportedVersion: 1 });

    expect(state.anomalies.find((anomaly) => anomaly.code === "distinct-participants-merged")?.relatedEventId).toBe("merge-1");
    expect(state.participants.has("bob")).toBe(false);
    expect(state.balances.get("alice")).toBe(0n);
  });

  it("undoes merges by voiding the merge event", () => {
    const merge = base("ParticipantMerged", { id: "merge-1", from: "bob", into: "alice" } as never);
    const state = fold(
      [
        base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
        base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
        merge,
        base("EventVoided", { targetId: "merge-1" } as never),
      ],
      { supportedVersion: 1 },
    );

    expect(state.participants.get("alice")?.canonicalPid).toBe("alice");
    expect(state.participants.get("bob")?.canonicalPid).toBe("bob");
  });

  it("unions claimed, linked, and reattested devices for merged participant display", () => {
    const reattestPayload = `${groupTag}:reattest:alice:restored:restored-key`;
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        link("alice", "alice-key", "alice-tablet", "tablet-key", "n1"),
        claim("bob", "bob-phone", "bob-key"),
        base("ClaimReattested", {
          pid: "alice",
          newDevice: "restored",
          newClaimPk: "restored-key",
          alg: "ed25519",
          attestor: "bob",
          sig: sig("bob-key", reattestPayload),
        } as never),
        base("ParticipantMerged", { from: "bob", into: "alice" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.participants.get("alice")?.devices).toEqual(["alice-phone", "alice-tablet", "bob-phone", "restored"]);
  });

  it("excludes voided linked devices from participant display", () => {
    const linked = link("alice", "alice-key", "alice-tablet", "tablet-key", "n1");
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        linked,
        base("EventVoided", { targetId: linked.id } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.participants.get("alice")?.devices).toEqual(["alice-phone"]);
  });

  it("does not display unauthorised linked devices when verifying claim chains", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        base("DeviceLinked", {
          pid: "alice",
          parentDevice: "alice-phone",
          newDevice: "forged-tablet",
          newClaimPk: "forged-key",
          alg: "ed25519",
          nonce: "n1",
          sig: sig("forged-key", `${groupTag}:link:alice:forged-tablet:forged-key:n1`),
        } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.participants.get("alice")?.devices).toEqual(["alice-phone"]);
  });
});
