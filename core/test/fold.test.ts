import { describe, expect, it } from "vitest";
import { canonicalStateBytes } from "../src/canonical";
import { fold } from "../src/fold";
import { base, claim, confirm, financials, groupTag, hlc, link, sig, verifier } from "./helpers";

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

  it("folds v2 rate-bearing financials only when schema v2 is supported", () => {
    const expense = base("ExpenseAdded", {
      id: "eur-lunch",
      v: 2,
      xid: "x1",
      financials: {
        ...financials(1080n, [["alice", 1080n]], [["alice", 540n], ["bob", 540n]]),
        rate: { currency: "EUR", toBase: 1.08 },
      },
      desc: "Lunch",
      at: 1,
      date: "2026-08-21",
    } as never);

    const oldDevice = fold([expense], { supportedVersion: 1 });
    expect(oldDevice.quarantined).toEqual(["eur-lunch"]);
    expect(oldDevice.frozen).toBe(true);

    const currentDevice = fold([expense], { supportedVersion: 2 });
    expect(currentDevice.expenses.get("x1")?.financials.rate).toEqual({ currency: "EUR", toBase: 1.08 });
    expect(currentDevice.balances.get("alice")).toBe(540n);
    expect(currentDevice.balances.get("bob")).toBe(-540n);
  });

  it("quarantines rate-bearing financials that are mislabeled as schema v1", () => {
    const v1RateAdded = base("ExpenseAdded", {
      id: "v1-rate-add",
      xid: "x1",
      financials: {
        ...financials(1080n, [["alice", 1080n]], [["alice", 540n], ["bob", 540n]]),
        rate: { currency: "EUR", toBase: 1.08 },
      },
      desc: "Lunch",
      at: 1,
      date: "2026-08-21",
    } as never);
    const added = fold([v1RateAdded], { supportedVersion: 1 });
    expect(added.quarantined).toEqual(["v1-rate-add"]);
    expect(added.expenses.has("x1")).toBe(false);
    expect(added.frozen).toBe(true);

    const baseExpense = base("ExpenseAdded", {
      id: "base-add",
      xid: "x2",
      financials: financials(100n, [["alice", 100n]], [["bob", 100n]]),
      desc: "Lunch",
      at: 1,
      date: "2026-08-21",
    } as never);
    const v1RateEdit = base("ExpenseEdited", {
      id: "v1-rate-edit",
      xid: "x2",
      financials: {
        ...financials(1080n, [["alice", 1080n]], [["alice", 540n], ["bob", 540n]]),
        rate: { currency: "EUR", toBase: 1.08 },
      },
    } as never);

    const edited = fold([baseExpense, v1RateEdit], { supportedVersion: 1 });
    expect(edited.quarantined).toEqual(["v1-rate-edit"]);
    expect(edited.expenses.get("x2")?.financials.rate).toBeUndefined();
    expect(edited.expenses.get("x2")?.financials.minor).toBe(100n);
    expect(edited.frozen).toBe(true);
  });

  it("quarantines malformed schema v2 exchange rates", () => {
    const state = fold(
      [
        base("ExpenseAdded", {
          id: "bad-rate",
          v: 2,
          xid: "x1",
          financials: {
            ...financials(1080n, [["alice", 1080n]], [["alice", 540n], ["bob", 540n]]),
            rate: { currency: "eur", toBase: Number.NaN },
          },
          desc: "Lunch",
          at: 1,
          date: "2026-08-21",
        } as never),
      ],
      { supportedVersion: 2 },
    );

    expect(state.quarantined).toEqual(["bad-rate"]);
    expect(state.expenses.has("x1")).toBe(false);
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

  it("treats participant deactivation as a UI hint without changing balances", () => {
    const deactivated = base("ParticipantDeactivated", { id: "hide-bob", pid: "bob" } as never);
    const events = [
      base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
      base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
      base("ExpenseAdded", {
        xid: "x1",
        financials: financials(100n, [["alice", 100n]], [["alice", 50n], ["bob", 50n]]),
        desc: "Lunch",
        at: 1,
        date: "2026-08-21",
      } as never),
      deactivated,
    ];

    const hidden = fold(events, { supportedVersion: 1 });
    expect(hidden.participants.get("bob")?.deactivated).toBe(true);
    expect(hidden.balances.get("bob")).toBe(-50n);

    const restored = fold([...events, base("EventVoided", { targetId: deactivated.id } as never)], { supportedVersion: 1 });
    expect(restored.participants.get("bob")?.deactivated).toBe(false);
    expect(restored.balances.get("bob")).toBe(-50n);
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
    expect(state.expenses.get("x1")?.activeFinancialIndex).toBe(2);
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
    expect(state.expenses.get("x1")?.activeFinancialIndex).toBe(1);
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
      confirm("s1", "alice-key", "alice"),
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
      confirm("s1", "tablet-key", "alice"),
    ];
    const state = fold(events, { supportedVersion: 1 }, verifier);

    expect(state.anomalies.map((anomaly) => anomaly.code)).toContain("unverified-reclaim");
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

  it("does not confirm or mark contested when confirmation pid names a different participant", () => {
    const tabletConfirm = confirm("s1", "tablet-key");
    if (tabletConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");
    const state = fold(
      [
        claim("alice", "phone", "alice-key"),
        claim("alice", "tablet", "tablet-key"),
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n } as never),
        base("SettlementConfirmed", { sid: "s1", pid: "mallory", claimSig: tabletConfirm.claimSig } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.get("s1")?.pending).toBe(true);
    expect(state.settlements.get("s1")?.confirmed).toBe(false);
    expect(state.settlements.get("s1")?.contestedConfirmation).toBe(false);
    expect(state.anomalies.map((anomaly) => anomaly.code)).not.toContain("contested-settlement-confirmation");
  });

  it("SEC-001/T45: never marks a settlement confirmed merely because the recording event's dev string matches an authorised payee device -- unsigned attribution is not proof", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "alice-phone" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    // The OLD bug: a SettlementRecorded event whose dev happens to match
    // one of alice's authorised devices used to be treated as "born
    // confirmed" -- with ZERO actual signature proving alice consented.
    // This is exactly the unsigned-attribution vulnerability SEC-001
    // describes. It must now show as pending/unconfirmed until a genuine
    // signed SettlementConfirmed event exists.
    expect(state.settlements.get("s1")?.confirmed).toBe(false);
    expect(state.settlements.get("s1")?.pending).toBe(true);
    expect(state.settlements.get("s1")?.cashUnconfirmable).toBe(false);
  });

  it("confirms a settlement only via a genuinely signed SettlementConfirmed event, never from the recording event's dev alone", () => {
    const events = [
      claim("alice", "alice-phone", "alice-key"),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "alice-phone" } as never),
    ];
    const aliceConfirm = confirm("s1", "alice-key", "alice");
    if (aliceConfirm.t !== "SettlementConfirmed") throw new Error("test helper returned wrong event type");

    const state = fold([...events, aliceConfirm], { supportedVersion: 1 }, verifier);

    expect(state.settlements.get("s1")?.confirmed).toBe(true);
    expect(state.settlements.get("s1")?.pending).toBe(false);
  });

  it("never confirms a settlement from a forged dev attribution when NO genuine SettlementConfirmed signature ever arrives, even across a re-fold of the identical events", () => {
    const events = [
      claim("alice", "alice-phone", "alice-key"),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "attacker-forged-dev" } as never),
    ];

    const state = fold(events, { supportedVersion: 1 }, verifier);
    expect(state.settlements.get("s1")?.confirmed).toBe(false);
    expect(state.settlements.get("s1")?.pending).toBe(true);
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
    // FIXED (T48/LOGIC-001): from (bob, the payer/debtor) gains, to (alice,
    // the creditor) loses -- discharging the debt, never doubling it.
    expect(state.balances.get("alice")).toBe(-100n);
    expect(state.balances.get("bob")).toBe(100n);
  });

  it("LOGIC-001/T48: a settlement of the exact suggested transfer amount zeroes BOTH original balances, discharging the debt", () => {
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
        // The suggested transfer for this exact imbalance: bob (debtor,
        // -50) pays alice (creditor, +50) the full 50 owed.
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 50n } as never),
      ],
      { supportedVersion: 1 },
    );

    expect(state.balances.get("alice")).toBe(0n);
    expect(state.balances.get("bob")).toBe(0n);
    expect([...state.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("LOGIC-001/T48: a partial settlement payment reduces the debt without fully discharging it", () => {
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
        // bob owes alice 50; pays back only 20 -- a partial payment.
        base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 20n } as never),
      ],
      { supportedVersion: 1 },
    );

    // Debt reduced from 50 to 30 -- neither zeroed nor doubled.
    expect(state.balances.get("alice")).toBe(30n);
    expect(state.balances.get("bob")).toBe(-30n);
    expect([...state.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("LOGIC-001/T48: a validly authorized SettlementVoided restores the balance to exactly what it was before the settlement, never leaving it doubled or zeroed", () => {
    const events = [
      claim("carol", "carol-phone", "carol-key"), // any current group member, per SEC-002/T47
      base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
      base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
      base("ExpenseAdded", {
        xid: "x1",
        financials: financials(100n, [["alice", 100n]], [["alice", 50n], ["bob", 50n]]),
        desc: "Lunch",
        at: 1,
        date: "2026-08-21",
      } as never),
      base("SettlementRecorded", { sid: "s1", from: "bob", to: "alice", minor: 50n } as never),
    ];
    const before = fold(events, { supportedVersion: 1 }, verifier);
    // Confirms the settlement's own effect genuinely applied first (both zero).
    expect(before.balances.get("alice")).toBe(0n);
    expect(before.balances.get("bob")).toBe(0n);

    const voidPayload = `${groupTag}:void-settlement:s1`;
    const after = fold(
      [...events, base("SettlementVoided", { sid: "s1", pid: "carol", sig: sig("carol-key", voidPayload) } as never)],
      { supportedVersion: 1 },
      verifier,
    );

    // Restored to exactly the pre-settlement expense-only imbalance --
    // never left at zero (settlement effect never applied) and never
    // doubled (the old bug's failure mode).
    expect(after.balances.get("alice")).toBe(50n);
    expect(after.balances.get("bob")).toBe(-50n);
    expect([...after.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("voids a settlement via a genuinely signed SettlementVoided from ANY current group member, not just the original recorder (SEC-002/T47 B2 policy)", () => {
    const voidPayload = `${groupTag}:void-settlement:s1`;
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        claim("bob", "bob-phone", "bob-key"),
        claim("carol", "carol-phone", "carol-key"),
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        // carol is neither the payer nor the payee nor the recording
        // device -- exactly the "any current group member" case B2
        // approved and this task's acceptance criterion requires an
        // explicit outcome for.
        base("SettlementVoided", { sid: "s1", pid: "carol", sig: sig("carol-key", voidPayload) } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.has("s1")).toBe(false);
    expect([...state.balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
  });

  it("rejects a SettlementVoided with a forged signature, regardless of which pid it claims to be from", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        claim("bob", "bob-phone", "bob-key"),
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        base("SettlementVoided", { id: "void-1", sid: "s1", pid: "bob", sig: "totally-not-a-valid-signature" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.has("s1")).toBe(true);
    expect(state.anomalies.find((anomaly) => anomaly.code === "unauthorized-settlement-void")?.relatedEventId).toBe("settle-1");
    expect(state.balances.get("alice")).toBe(-100n);
    expect(state.balances.get("bob")).toBe(100n);
  });

  it("rejects a SettlementVoided from a pid with a contested claim, even with an otherwise valid signature", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        claim("bob", "bob-phone", "bob-key"),
        claim("bob", "bob-tablet", "bob-tablet-key"), // unpaired second claim -- contested
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        base("SettlementVoided", { sid: "s1", pid: "bob", sig: sig("bob-key", `${groupTag}:void-settlement:s1`) } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    expect(state.settlements.has("s1")).toBe(true);
  });

  it("never voids a settlement when no verification context is available to check the signature at all", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        claim("bob", "bob-phone", "bob-key"),
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        base("SettlementVoided", { sid: "s1", pid: "bob", sig: sig("bob-key", `${groupTag}:void-settlement:s1`) } as never),
      ],
      { supportedVersion: 1 },
      // no ctx passed -- a signature can never be checked without one.
    );

    expect(state.settlements.has("s1")).toBe(true);
  });

  it("flags a generic EventVoided targeting a SettlementRecorded event as a distinct anomaly, never silently cancelling its economic effect (SEC-002/T47)", () => {
    const state = fold(
      [
        claim("alice", "alice-phone", "alice-key"),
        claim("bob", "bob-phone", "bob-key"),
        base("SettlementRecorded", { id: "settle-1", sid: "s1", from: "bob", to: "alice", minor: 100n, dev: "bob-phone" } as never),
        base("EventVoided", { targetId: "settle-1" } as never),
      ],
      { supportedVersion: 1 },
      verifier,
    );

    // The settlement's economic effect and derived state are UNCHANGED --
    // a generic void never cancels it, only the signed SettlementVoided
    // contract can.
    expect(state.settlements.has("s1")).toBe(true);
    expect(state.balances.get("alice")).toBe(-100n);
    expect(state.balances.get("bob")).toBe(100n);
    expect(state.anomalies.find((anomaly) => anomaly.code === "generic-void-of-settlement-event")?.relatedEventId).toBe("settle-1");
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

  it("surfaces every merge edge involved in transitive marked-distinct contradictions", () => {
    const state = fold(
      [
        base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
        base("ParticipantAdded", { pid: "dave", name: "Dave" } as never),
        base("ParticipantAdded", { pid: "mika", name: "Mika" } as never),
        base("ParticipantMerged", { id: "merge-1", from: "dave", into: "alice" } as never),
        base("ParticipantMerged", { id: "merge-2", from: "mika", into: "dave" } as never),
        base("ParticipantsMarkedDistinct", { id: "distinct-1", a: "alice", b: "mika" } as never),
      ],
      { supportedVersion: 1 },
    );

    const anomaly = state.anomalies.find((candidate) => candidate.code === "distinct-participants-merged");
    expect(anomaly?.relatedEventId).toBe("merge-1");
    expect(anomaly?.relatedEventIds).toEqual(["merge-1", "merge-2"]);
    expect(state.participants.has("dave")).toBe(false);
    expect(state.participants.has("mika")).toBe(false);
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

describe("DATA-006/B3 base currency contract", () => {
  it("uses GroupCreated.currency when no correction exists", () => {
    const state = fold([base("GroupCreated", { name: "Trip", currency: "USD", hlc: hlc(1) } as never)], { supportedVersion: 1 });
    expect(state.currency).toBe("USD");
  });

  it("accepts a BaseCurrencyEstablished correction made before the first expense", () => {
    const state = fold(
      [
        base("GroupCreated", { name: "Trip", currency: "USD", hlc: hlc(1) } as never),
        base("BaseCurrencyEstablished", { currency: "EUR", hlc: hlc(2) } as never),
        base("ExpenseAdded", {
          xid: "x1",
          financials: financials(100n, [["alice", 100n]], [["alice", 100n]]),
          desc: "Lunch",
          at: 1,
          date: "2026-08-21",
          hlc: hlc(3),
        } as never),
      ],
      { supportedVersion: 1 },
    );
    expect(state.currency).toBe("EUR");
    expect(state.quarantined).toEqual([]);
  });

  it("quarantines a correction that arrives after the first expense", () => {
    const state = fold(
      [
        base("GroupCreated", { name: "Trip", currency: "USD", hlc: hlc(1) } as never),
        base("ExpenseAdded", {
          xid: "x1",
          financials: financials(100n, [["alice", 100n]], [["alice", 100n]]),
          desc: "Lunch",
          at: 1,
          date: "2026-08-21",
          hlc: hlc(2),
        } as never),
        base("BaseCurrencyEstablished", { id: "late-correction", currency: "EUR", hlc: hlc(3) } as never),
      ],
      { supportedVersion: 1 },
    );
    expect(state.currency).toBe("USD");
    expect(state.quarantined).toEqual(["late-correction"]);
    expect(state.frozen).toBe(true);
  });

  it("accepts only the earliest of two pre-expense corrections, quarantining the rest", () => {
    const state = fold(
      [
        base("GroupCreated", { name: "Trip", currency: "USD", hlc: hlc(1) } as never),
        base("BaseCurrencyEstablished", { id: "correction-a", currency: "EUR", hlc: hlc(2, 0, "dev-a") } as never),
        base("BaseCurrencyEstablished", { id: "correction-b", currency: "GBP", hlc: hlc(2, 0, "dev-b") } as never),
        base("ExpenseAdded", {
          xid: "x1",
          financials: financials(100n, [["alice", 100n]], [["alice", 100n]]),
          desc: "Lunch",
          at: 1,
          date: "2026-08-21",
          hlc: hlc(3),
        } as never),
      ],
      { supportedVersion: 1 },
    );
    expect(state.currency).toBe("EUR");
    expect(state.quarantined).toEqual(["correction-b"]);
  });

  it("ignores a voided correction entirely, neither accepting nor quarantining it", () => {
    const state = fold(
      [
        base("GroupCreated", { name: "Trip", currency: "USD", hlc: hlc(1) } as never),
        base("BaseCurrencyEstablished", { id: "voided-correction", currency: "EUR", hlc: hlc(2) } as never),
        base("EventVoided", { targetId: "voided-correction", hlc: hlc(3) } as never),
      ],
      { supportedVersion: 1 },
    );
    expect(state.currency).toBe("USD");
    expect(state.quarantined).toEqual([]);
  });
});
