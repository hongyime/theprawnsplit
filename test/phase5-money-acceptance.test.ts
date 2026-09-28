import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { fold } from "@theprawnsplit/core";
import { appendEvents, createExport, ensureGroup, replaceFromExport, resetRepositoryForTests, saveGroup } from "@/db/repo";
import { defaultParticipant, makeEvent, makeExpenseFinancials, type EventFactory } from "@/lib/events";
import { currencyAmountPreview } from "@/lib/multicurrency";
import { editFinancialsForTotal } from "@/lib/expense-edit";
import { buildPayerPreview } from "@/lib/payers";

type ParticipantAdded = ReturnType<typeof defaultParticipant> & { t: "ParticipantAdded" };

describe("Phase 5 money acceptance", () => {
  it("exports and restores a v2 multi-currency expense with multiple payers", async () => {
    await resetRepositoryForTests(`phase5-money-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    await saveGroup({ ...group, currency: "USD" });
    let factory: EventFactory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const alice = defaultParticipant(factory, "Alice") as ParticipantAdded;
    const bob = defaultParticipant(factory, "Bob") as ParticipantAdded;
    const chris = defaultParticipant(factory, "Chris") as ParticipantAdded;
    const withPeople = await appendEvents(group.groupId, [alice, bob, chris]);

    const amount = currencyAmountPreview({ amountText: "10.00", currency: "EUR", baseCurrency: "USD", rateText: "1.08" });
    expect(amount).toMatchObject({ ok: true, enteredMinor: 1000n, baseMinor: 1080n, rate: { currency: "EUR", toBase: 1.08 } });
    if (!amount.ok) throw new Error(amount.message);

    const payers = buildPayerPreview(amount.baseMinor, "multiple", alice.pid, { [alice.pid]: "7.00", [bob.pid]: "3.80" }, [
      alice.pid,
      bob.pid,
      chris.pid,
    ]);
    expect(payers).toMatchObject({
      ok: true,
      payers: [
        { pid: alice.pid, minor: 700n },
        { pid: bob.pid, minor: 380n },
      ],
    });
    if (!payers.ok) throw new Error(payers.message);

    factory = { deviceId: withPeople.deviceId, nextCounter: withPeople.nextCounter };
    const financials = makeExpenseFinancials(amount.baseMinor, payers.payers, [
      { pid: alice.pid, minor: 360n },
      { pid: bob.pid, minor: 360n },
      { pid: chris.pid, minor: 360n },
    ]);
    financials.rate = amount.rate!;
    const expense = makeEvent(
      factory,
      "ExpenseAdded",
      {
        xid: "eur-dinner",
        financials,
        desc: "EUR dinner",
        at: 1_787_280_000_000,
        date: "2026-08-21",
      },
      2,
    );
    const withExpense = await appendEvents(group.groupId, [expense]);

    await resetRepositoryForTests(`phase5-money-restore-${crypto.randomUUID()}`);
    const restored = await replaceFromExport(createExport(withExpense));
    const restoredExpense = restored.events.find((event) => event.t === "ExpenseAdded");
    const restoredState = fold(restored.events, { supportedVersion: 2 });

    expect(restoredExpense).toMatchObject({
      t: "ExpenseAdded",
      v: 2,
      financials: {
        minor: 1080n,
        payers: [
          { pid: alice.pid, minor: 700n },
          { pid: bob.pid, minor: 380n },
        ],
        rate: { currency: "EUR", toBase: 1.08 },
      },
    });
    expect(restoredState.balances.get(alice.pid)).toBe(340n);
    expect(restoredState.balances.get(bob.pid)).toBe(20n);
    expect(restoredState.balances.get(chris.pid)).toBe(-360n);
  });

  it("keeps a rate-bearing total edit foldable instead of quarantining itself as schema v1", async () => {
    await resetRepositoryForTests(`phase5-money-edit-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    await saveGroup({ ...group, currency: "USD" });
    let factory: EventFactory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const alice = defaultParticipant(factory, "Alice") as ParticipantAdded;
    const bob = defaultParticipant(factory, "Bob") as ParticipantAdded;
    const withPeople = await appendEvents(group.groupId, [alice, bob]);

    const amount = currencyAmountPreview({ amountText: "10.00", currency: "EUR", baseCurrency: "USD", rateText: "1.08" });
    if (!amount.ok) throw new Error(amount.message);

    factory = { deviceId: withPeople.deviceId, nextCounter: withPeople.nextCounter };
    const financials = makeExpenseFinancials(amount.baseMinor, alice.pid, [
      { pid: alice.pid, minor: 540n },
      { pid: bob.pid, minor: 540n },
    ]);
    financials.rate = amount.rate!;
    const added = makeEvent(
      factory,
      "ExpenseAdded",
      { xid: "eur-lunch", financials, desc: "EUR lunch", at: 1_787_280_000_000, date: "2026-08-21" },
      2,
    );
    const withExpense = await appendEvents(group.groupId, [added]);

    // Mirror Trip.svelte's editExpense exactly: rescale the retained rows for the
    // new total via editFinancialsForTotal (which preserves `rate` per LOGIC-003's
    // fix approach), then derive the event's schema version from whether the
    // RESULTING financials still carry a rate -- never default to v1 unconditionally.
    factory = { deviceId: withExpense.deviceId, nextCounter: withExpense.nextCounter };
    const editId = `${factory.deviceId}:${factory.nextCounter}`;
    const editedFinancials = editFinancialsForTotal({ current: financials, nextMinor: 2160n, eventId: editId });
    const edited = makeEvent(
      factory,
      "ExpenseEdited",
      { xid: "eur-lunch", financials: editedFinancials },
      editedFinancials.rate ? 2 : 1,
    );
    const withEdit = await appendEvents(group.groupId, [edited]);

    const state = fold(withEdit.events, { supportedVersion: 2 });
    expect(state.quarantined).toEqual([]);
    expect(state.frozen).toBe(false);
    expect(state.expenses.get("eur-lunch")?.financials).toMatchObject({
      minor: 2160n,
      rate: { currency: "EUR", toBase: 1.08 },
    });
  });

  it("keeps a base-only total edit at its compatible version 1", async () => {
    await resetRepositoryForTests(`phase5-money-edit-base-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    await saveGroup({ ...group, currency: "USD" });
    let factory: EventFactory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const alice = defaultParticipant(factory, "Alice") as ParticipantAdded;
    const bob = defaultParticipant(factory, "Bob") as ParticipantAdded;
    const withPeople = await appendEvents(group.groupId, [alice, bob]);

    factory = { deviceId: withPeople.deviceId, nextCounter: withPeople.nextCounter };
    const financials = makeExpenseFinancials(1000n, alice.pid, [
      { pid: alice.pid, minor: 500n },
      { pid: bob.pid, minor: 500n },
    ]);
    const added = makeEvent(
      factory,
      "ExpenseAdded",
      { xid: "usd-lunch", financials, desc: "USD lunch", at: 1_787_280_000_000, date: "2026-08-21" },
      financials.rate ? 2 : 1,
    );
    const withExpense = await appendEvents(group.groupId, [added]);

    factory = { deviceId: withExpense.deviceId, nextCounter: withExpense.nextCounter };
    const editId = `${factory.deviceId}:${factory.nextCounter}`;
    const editedFinancials = editFinancialsForTotal({ current: financials, nextMinor: 2000n, eventId: editId });
    const edited = makeEvent(
      factory,
      "ExpenseEdited",
      { xid: "usd-lunch", financials: editedFinancials },
      editedFinancials.rate ? 2 : 1,
    );
    const withEdit = await appendEvents(group.groupId, [edited]);

    expect(withEdit.events.find((event) => event.t === "ExpenseEdited")?.v).toBe(1);
    const state = fold(withEdit.events, { supportedVersion: 2 });
    expect(state.quarantined).toEqual([]);
    expect(state.expenses.get("usd-lunch")?.financials.minor).toBe(2000n);
  });
});
