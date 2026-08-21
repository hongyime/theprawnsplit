import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalStateBytes } from "../src/canonical";
import { fold } from "../src/fold";
import { authorisedKeys } from "../src/identity";
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
});
