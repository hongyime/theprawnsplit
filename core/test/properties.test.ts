import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalStateBytes } from "../src/canonical";
import { fold } from "../src/fold";
import type { Event } from "../src/types";
import { base, financials, resetIds } from "./helpers";

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
  });
});
