import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalStateBytes } from "../src/canonical";
import { fold } from "../src/fold";
import { authorisedKeys } from "../src/identity";
import { admitTransportEvents } from "../src/transport";
import type { Event } from "../src/types";
import { base, financials, groupTag, hlc, resetIds, sig, verifier } from "./helpers";

const shuffleWithSeed = <T>(items: T[], seed: number): T[] => {
  const out = [...items];
  let state = seed >>> 0;
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

describe("REQ-SYN-12 property convergence", () => {
  it("canonicalStateBytes are identical across deterministic shuffles", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 20 }), (amounts) => {
        resetIds();
        const events: Event[] = [
          base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
          base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
          ...amounts.map((amount, index) =>
            base("ExpenseAdded", {
              xid: `x${index}`,
              financials: financials(BigInt(amount), [["alice", BigInt(amount)]], [["bob", BigInt(amount)]]),
              desc: `Expense ${index}`,
              at: index,
              date: "2026-08-21",
            } as never),
          ),
        ];
        const expected = canonicalStateBytes(fold(events, { supportedVersion: 1 }));
        for (let i = 0; i < 25; i += 1) {
          expect(canonicalStateBytes(fold(shuffleWithSeed(events, i + 1), { supportedVersion: 1 }))).toBe(expected);
        }
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260821), numRuns: 50, verbose: true },
    );
  }, 20_000);

  it("keeps balances zero-sum at every valid event prefix", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 40 }), (amounts) => {
        resetIds();
        const events: Event[] = [
          base("ParticipantAdded", { pid: "alice", name: "Alice" } as never),
          base("ParticipantAdded", { pid: "bob", name: "Bob" } as never),
          ...amounts.map((amount, index) =>
            base("ExpenseAdded", {
              xid: `x${index}`,
              financials: financials(BigInt(amount), [["alice", BigInt(amount)]], [["bob", BigInt(amount)]]),
              desc: `Expense ${index}`,
              at: index,
              date: "2026-08-22",
            } as never),
          ),
        ];

        for (let prefixLength = 1; prefixLength <= events.length; prefixLength += 1) {
          const state = fold(events.slice(0, prefixLength), { supportedVersion: 1 });
          const balanceSum = [...state.balances.values()].reduce((sum, minor) => sum + minor, 0n);
          expect(balanceSum).toBe(0n);
          expect(state.anomalies.map((anomaly) => anomaly.code)).not.toContain("balance-not-zero");
        }
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);

  it("keeps participant merges commutative and idempotent", () => {
    const pids = ["alice", "bob", "chris", "dave"] as const;
    const pairArbitrary = fc.tuple(fc.constantFrom(...pids), fc.constantFrom(...pids)).filter(([from, into]) => from !== into);

    fc.assert(
      fc.property(fc.array(pairArbitrary, { minLength: 1, maxLength: 8 }), (pairs) => {
        const participants: Event[] = pids.map((pid, index) =>
          base("ParticipantAdded", {
            id: `participant-${pid}`,
            hlc: hlc(index + 1),
            pid,
            name: pid,
          } as never),
        );
        const mergeEvents = (orderedPairs: typeof pairs, offset: number): Event[] =>
          orderedPairs.map(([from, into], index) =>
            base("ParticipantMerged", {
              id: `merge-${offset}-${index}`,
              hlc: hlc(offset + index + 1),
              from,
              into,
            } as never),
          );

        const reference = canonicalStateBytes(fold([...participants, ...mergeEvents(pairs, 10)], { supportedVersion: 1 }));
        const reversed = canonicalStateBytes(fold([...participants, ...mergeEvents([...pairs].reverse(), 100)], { supportedVersion: 1 }));
        const duplicated = canonicalStateBytes(fold([...participants, ...mergeEvents([...pairs, ...pairs], 200)], { supportedVersion: 1 }));

        expect(reversed).toBe(reference);
        expect(duplicated).toBe(reference);
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);

  it("keeps authorised key delegation convergent across arrival order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (linkCount) => {
        const events: Event[] = [
          base("ParticipantClaimed", {
            id: "claim-0",
            hlc: hlc(1),
            pid: "alice",
            deviceId: "device-0",
            claimPk: "key-0",
            alg: "ed25519",
            sig: sig("key-0", `${groupTag}:alice:device-0:key-0`),
          } as never),
          ...Array.from({ length: linkCount }, (_, index) => {
            const next = index + 1;
            const payload = `${groupTag}:link:alice:device-${next}:key-${next}:nonce-${next}`;
            return base("DeviceLinked", {
              id: `link-${next}`,
              hlc: hlc(next + 1),
              pid: "alice",
              parentDevice: `device-${index}`,
              newDevice: `device-${next}`,
              newClaimPk: `key-${next}`,
              alg: "ed25519",
              nonce: `nonce-${next}`,
              sig: sig(`key-${index}`, payload),
            } as never);
          }),
        ];
        const expected = Array.from({ length: linkCount + 1 }, (_, index) => `key-${index}`);

        for (let seed = 1; seed <= 20; seed += 1) {
          expect([...authorisedKeys(shuffleWithSeed(events, seed), "alice", verifier)]).toEqual(expected);
        }
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 50, verbose: true },
    );
  }, 20_000);

  it("keeps void cascades stable across delivery order", () => {
    fc.assert(
      fc.property(
        fc.record({
          original: fc.integer({ min: 1, max: 1000 }),
          edits: fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 8 }),
        }),
        ({ original, edits }) => {
          const add = base("ExpenseAdded", {
            id: "expense-add",
            hlc: hlc(3),
            xid: "x-voided",
            financials: financials(BigInt(original), [["alice", BigInt(original)]], [["bob", BigInt(original)]]),
            desc: "Voided expense",
            at: 1,
            date: "2026-08-22",
          } as never);
          const events: Event[] = [
            base("ParticipantAdded", { id: "participant-alice", hlc: hlc(1), pid: "alice", name: "Alice" } as never),
            base("ParticipantAdded", { id: "participant-bob", hlc: hlc(2), pid: "bob", name: "Bob" } as never),
            add,
            ...edits.map((amount, index) =>
              base("ExpenseEdited", {
                id: `expense-edit-${index}`,
                hlc: hlc(4 + index),
                xid: "x-voided",
                financials: financials(BigInt(amount), [["alice", BigInt(amount)]], [["bob", BigInt(amount)]]),
              } as never),
            ),
            base("EventVoided", { id: "expense-void", hlc: hlc(100), targetId: add.id } as never),
          ];

          for (let seed = 1; seed <= 20; seed += 1) {
            const state = fold(shuffleWithSeed(events, seed), { supportedVersion: 1 });
            expect(state.expenses.has("x-voided")).toBe(false);
            expect([...state.balances.values()].reduce((sum, minor) => sum + minor, 0n)).toBe(0n);
            expect(state.balances.get("alice")).toBe(0n);
            expect(state.balances.get("bob")).toBe(0n);
          }
        },
      ),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);

  it("keeps Financials edits atomic across delivery order", () => {
    fc.assert(
      fc.property(
        fc.record({
          addedMinor: fc.integer({ min: 1, max: 1000 }),
          firstEditMinor: fc.integer({ min: 1, max: 1000 }),
          secondEditMinor: fc.integer({ min: 1, max: 1000 }),
        }),
        ({ addedMinor, firstEditMinor, secondEditMinor }) => {
          const added = financials(BigInt(addedMinor), [["alice", BigInt(addedMinor)]], [["bob", BigInt(addedMinor)]]);
          const firstEdit = {
            ...financials(BigInt(firstEditMinor), [["alice", BigInt(firstEditMinor)]], [["chris", BigInt(firstEditMinor)]]),
            rate: { currency: "EUR", toBase: 2 },
          };
          const secondEdit = {
            ...financials(BigInt(secondEditMinor), [["bob", BigInt(secondEditMinor)]], [["alice", BigInt(secondEditMinor)]]),
            rate: { currency: "JPY", toBase: 3 },
          };
          const events: Event[] = [
            base("ParticipantAdded", { id: "participant-alice", hlc: hlc(1), pid: "alice", name: "Alice" } as never),
            base("ParticipantAdded", { id: "participant-bob", hlc: hlc(2), pid: "bob", name: "Bob" } as never),
            base("ParticipantAdded", { id: "participant-chris", hlc: hlc(3), pid: "chris", name: "Chris" } as never),
            base("ExpenseAdded", {
              id: "expense-add",
              v: 2,
              hlc: hlc(4),
              xid: "x-atomic",
              financials: added,
              desc: "Atomic edit",
              at: 1,
              date: "2026-08-22",
            } as never),
            base("ExpenseEdited", {
              id: "expense-edit-1",
              v: 2,
              hlc: hlc(5),
              xid: "x-atomic",
              financials: firstEdit,
            } as never),
            base("ExpenseEdited", {
              id: "expense-edit-2",
              v: 2,
              hlc: hlc(6),
              xid: "x-atomic",
              financials: secondEdit,
            } as never),
          ];

          for (let seed = 1; seed <= 20; seed += 1) {
            const state = fold(shuffleWithSeed(events, seed), { supportedVersion: 2 });
            const expense = state.expenses.get("x-atomic");
            expect(expense?.financials).toEqual(secondEdit);
            expect(expense?.financialHistory).toEqual([added, firstEdit, secondEdit]);
            expect(state.balances.get("bob")).toBe(BigInt(secondEditMinor));
            expect(state.balances.get("alice")).toBe(-BigInt(secondEditMinor));
            expect(state.balances.get("chris")).toBe(0n);
          }
        },
      ),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);

  it("keeps superseded concurrent financial edits retrievable", () => {
    fc.assert(
      fc.property(
        fc.record({
          addedMinor: fc.integer({ min: 1, max: 1000 }),
          editAMinor: fc.integer({ min: 1, max: 1000 }),
          editBMinor: fc.integer({ min: 1, max: 1000 }),
        }),
        ({ addedMinor, editAMinor, editBMinor }) => {
          const added = financials(BigInt(addedMinor), [["alice", BigInt(addedMinor)]], [["bob", BigInt(addedMinor)]]);
          const editA = financials(BigInt(editAMinor), [["alice", BigInt(editAMinor)]], [["bob", BigInt(editAMinor)]]);
          const editB = financials(BigInt(editBMinor), [["alice", BigInt(editBMinor)]], [["chris", BigInt(editBMinor)]]);
          const events: Event[] = [
            base("ParticipantAdded", { id: "participant-alice", hlc: hlc(1), pid: "alice", name: "Alice" } as never),
            base("ParticipantAdded", { id: "participant-bob", hlc: hlc(2), pid: "bob", name: "Bob" } as never),
            base("ParticipantAdded", { id: "participant-chris", hlc: hlc(3), pid: "chris", name: "Chris" } as never),
            base("ExpenseAdded", {
              id: "creator:1",
              dev: "creator",
              hlc: { wall: 4, ctr: 1, dev: "creator" },
              vv: { creator: 1 },
              xid: "x-concurrent",
              financials: added,
              desc: "Concurrent edit",
              at: 1,
              date: "2026-08-22",
            } as never),
            base("ExpenseEdited", {
              id: "a:1",
              dev: "a",
              hlc: { wall: 5, ctr: 1, dev: "a" },
              vv: { creator: 1, a: 1 },
              xid: "x-concurrent",
              financials: editA,
            } as never),
            base("ExpenseEdited", {
              id: "b:1",
              dev: "b",
              hlc: { wall: 6, ctr: 1, dev: "b" },
              vv: { creator: 1, b: 1 },
              xid: "x-concurrent",
              financials: editB,
            } as never),
          ];

          for (let seed = 1; seed <= 20; seed += 1) {
            const expense = fold(shuffleWithSeed(events, seed), { supportedVersion: 1 }).expenses.get("x-concurrent");
            expect(expense?.financials).toEqual(editB);
            expect(expense?.financialHistory).toEqual([added, editA, editB]);
            expect(expense?.activeFinancialIndex).toBe(2);
          }
        },
      ),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);

  it("keeps per-author caps from changing state derived from admitted events", () => {
    fc.assert(
      fc.property(
        fc.record({
          cap: fc.integer({ min: 1, max: 8 }),
          surplus: fc.integer({ min: 1, max: 8 }),
          peerCount: fc.integer({ min: 1, max: 8 }),
        }),
        ({ cap, surplus, peerCount }) => {
          const participants: Event[] = [
            base("ParticipantAdded", { id: "participant-alice", hlc: hlc(1), pid: "alice", name: "Alice" } as never),
            base("ParticipantAdded", { id: "participant-bob", hlc: hlc(2), pid: "bob", name: "Bob" } as never),
          ];
          const expense = (dev: string, ctr: number): Event =>
            base("ExpenseAdded", {
              id: `${dev}:${ctr}`,
              dev,
              hlc: hlc(10 + ctr, ctr, dev),
              xid: `${dev}-${ctr}`,
              financials: financials(1n, [["alice", 1n]], [["bob", 1n]]),
              desc: `${dev}-${ctr}`,
              at: ctr,
              date: "2026-08-22",
            } as never);
          const throwaway = Array.from({ length: cap + surplus }, (_, index) => expense("throwaway", index + 1));
          const peers = Array.from({ length: peerCount }, (_, index) => expense(`peer-${index}`, 1));
          const incoming = [...throwaway, ...peers];

          const result = admitTransportEvents(incoming, participants, {}, {
            now: 10_000,
            supportedVersion: 1,
            maxFutureDriftMs: 120_000,
            capUnknownAuthor: cap,
            capKnownAuthor: 1000,
            capGroupTotal: 10_000,
            bufferMaxEvents: 500,
          });
          const expectedAdmitted = [...throwaway.slice(0, cap), ...peers];
          const actualState = canonicalStateBytes(fold([...participants, ...result.admitted], { supportedVersion: 1 }));
          const expectedState = canonicalStateBytes(fold([...participants, ...expectedAdmitted], { supportedVersion: 1 }));

          expect(result.admitted.map((event) => event.id)).toEqual(expectedAdmitted.map((event) => event.id));
          expect(result.dropped.map((drop) => drop.event.id)).toEqual(throwaway.slice(cap).map((event) => event.id));
          expect(result.discardVector.throwaway).toBe(cap + surplus);
          expect(actualState).toBe(expectedState);
        },
      ),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);

  it("advances transport vectors for quarantined schema events without changing balances", () => {
    fc.assert(
      fc.property(
        fc.record({
          unsupportedCounter: fc.integer({ min: 1, max: 1000 }),
          unsupportedMinor: fc.integer({ min: 1, max: 1000 }),
        }),
        ({ unsupportedCounter, unsupportedMinor }) => {
          const current: Event[] = [
            base("ParticipantAdded", { id: "participant-alice", hlc: hlc(1), pid: "alice", name: "Alice" } as never),
            base("ParticipantAdded", { id: "participant-bob", hlc: hlc(2), pid: "bob", name: "Bob" } as never),
          ];
          const futureSchema = base("ExpenseAdded", {
            id: `future:${unsupportedCounter}`,
            dev: "future",
            v: 2,
            hlc: hlc(10 + unsupportedCounter, unsupportedCounter, "future"),
            xid: "x-future-schema",
            financials: {
              ...financials(BigInt(unsupportedMinor), [["alice", BigInt(unsupportedMinor)]], [["bob", BigInt(unsupportedMinor)]]),
              rate: { currency: "EUR", toBase: 2 },
            },
            desc: "Future schema",
            at: unsupportedCounter,
            date: "2026-08-22",
          } as never);

          const admitted = admitTransportEvents([futureSchema], current, {}, {
            now: 10_000,
            supportedVersion: 1,
            maxFutureDriftMs: 120_000,
            capUnknownAuthor: 50,
            capKnownAuthor: 1000,
            capGroupTotal: 10_000,
            bufferMaxEvents: 500,
          });
          const state = fold([...current, ...admitted.admitted], { supportedVersion: 1 });

          expect(admitted.transportVector.future).toBe(unsupportedCounter);
          expect(admitted.admitted.map((event) => event.id)).toEqual([futureSchema.id]);
          expect(state.quarantined).toEqual([futureSchema.id]);
          expect(state.frozen).toBe(true);
          expect(state.expenses.has("x-future-schema")).toBe(false);
          expect(state.balances.get("alice")).toBe(0n);
          expect(state.balances.get("bob")).toBe(0n);
        },
      ),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260822), numRuns: 75, verbose: true },
    );
  }, 20_000);
});
