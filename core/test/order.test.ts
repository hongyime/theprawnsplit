import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareHlc, eventSortKey } from "../src/types";
import type { Event, HLC } from "../src/types";

// CR-011: fold() re-sorts its input with eventSortKey on every call, so every
// §16.2 order-independence property ultimately rests on eventSortKey being a
// strict total order. These tests pin that property directly.

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

const hlcArbitrary = fc.record({
  wall: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  ctr: fc.integer({ min: 0, max: 1000 }),
  dev: fc.constantFrom("dev_a", "dev_b", "dev:c", "device-d"),
});

// Real ids are `${deviceId}:${counter}` where deviceId may contain "_" (uuids).
// Include unicode and case variants that locale-aware collation may conflate.
const idArbitrary = fc.constantFrom(
  "dev_a:1",
  "dev_a:10",
  "dev_b:2",
  "dev:c:3",
  "device-d:4",
  "dev_a:ä",
  "DEV_A:1",
  "z:z",
);

const eventFrom = (hlc: HLC, id: string): Event =>
  ({ t: "ParticipantAdded", v: 1, id, hlc, dev: hlc.dev, pid: id, name: "x" }) as unknown as Event;

const eventArbitrary = fc
  .tuple(hlcArbitrary, idArbitrary)
  .map(([hlc, id]) => eventFrom(hlc, id));

describe("compareHlc total order over the finite domain", () => {
  it("is antisymmetric", () => {
    fc.assert(
      fc.property(hlcArbitrary, hlcArbitrary, (a, b) => {
        expect(sign(compareHlc(a, b))).toBe(-sign(compareHlc(b, a)));
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260825), numRuns: 200, verbose: true },
    );
  }, 20_000);

  it("is transitive over generated triples", () => {
    fc.assert(
      fc.property(hlcArbitrary, hlcArbitrary, hlcArbitrary, (a, b, c) => {
        fc.pre(compareHlc(a, b) <= 0);
        fc.pre(compareHlc(b, c) <= 0);
        expect(compareHlc(a, c)).toBeLessThanOrEqual(0);
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260825), numRuns: 300, verbose: true },
    );
  }, 20_000);

  it("orders by wall first, then ctr, then device codepoints", () => {
    expect(sign(compareHlc({ wall: 2, ctr: 0, dev: "b" }, { wall: 1, ctr: 9, dev: "a" }))).toBe(1);
    expect(sign(compareHlc({ wall: 1, ctr: 1, dev: "b" }, { wall: 1, ctr: 0, dev: "a" }))).toBe(1);
    // "_" is codepoint-greater than ":" even though some locales collate it lower.
    expect(sign(compareHlc({ wall: 1, ctr: 0, dev: "dev_x" }, { wall: 1, ctr: 0, dev: "dev:x" }))).toBe(1);
    // "z" (U+007A) sorts before "ä" (U+00E4) by codepoint; the collation used by
    // localeCompare on this machine returned the opposite sign before CR-011.
    expect(sign(compareHlc({ wall: 1, ctr: 0, dev: "zz" }, { wall: 1, ctr: 0, dev: "ää" }))).toBe(-1);
  });
});

describe("eventSortKey totality", () => {
  it("is antisymmetric", () => {
    fc.assert(
      fc.property(eventArbitrary, eventArbitrary, (a, b) => {
        expect(sign(eventSortKey(a, b))).toBe(-sign(eventSortKey(b, a)));
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260825), numRuns: 200, verbose: true },
    );
  }, 20_000);

  it("ties exactly on duplicate events (same id and same hlc)", () => {
    fc.assert(
      fc.property(hlcArbitrary, idArbitrary, (h, id) => {
        const a = eventFrom(h, id);
        const b = eventFrom({ ...h }, id);
        expect(eventSortKey(a, b)).toBe(0);
      }),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260825), numRuns: 100, verbose: true },
    );
  }, 20_000);

  it("never ties two distinct events", () => {
    fc.assert(
      fc.property(
        hlcArbitrary,
        hlcArbitrary,
        idArbitrary.filter((id) => true),
        idArbitrary,
        (ha, hb, idA, idB) => {
          fc.pre(idA !== idB);
          const a = eventFrom(ha, idA);
          const b = eventFrom(hb, idB);
          expect(eventSortKey(a, b)).not.toBe(0);
          expect(eventSortKey(b, a)).not.toBe(0);
        },
      ),
      { seed: Number(process.env.FAST_CHECK_SEED ?? 20260825), numRuns: 300, verbose: true },
    );
  }, 20_000);

  // Deterministic counterpart to the generated property above. Independent
  // generation almost never produces HLC collisions, so only this pinned case
  // actually exercises the id tiebreak (CR-011 mutation 3a proved the suite
  // stayed green with the tiebreak deleted).
  it("breaks HLC ties by id — two events with identical HLCs never tie", () => {
    const tied: HLC = { wall: 42, ctr: 7, dev: "dev_a" };
    const a = eventFrom(tied, "dev_a:1");
    const b = eventFrom({ ...tied }, "dev_a:2");
    expect(eventSortKey(a, b)).not.toBe(0);
    expect(sign(eventSortKey(a, b))).toBe(-sign(eventSortKey(b, a)));
    expect(sign(eventSortKey(a, b))).toBe(-1); // "dev_a:1" < "dev_a:2" codepoint-wise
  });
});

describe("observed comparator behaviour on adversarial inputs (documented, not assumed)", () => {
  it("NaN wall silently falls through to ctr and then dev — pinned as characterisation", () => {
    // a.wall - b.wall is NaN for any NaN operand; NaN is falsy so `||` falls through.
    // Observed: comparison degenerates to (ctr, dev) ordering, ignoring wall entirely.
    const nan = { wall: Number.NaN, ctr: 5, dev: "m" };
    const low = { wall: 1, ctr: 0, dev: "z" };
    const high = { wall: 999, ctr: 0, dev: "a" };
    expect(sign(compareHlc(nan, low))).toBe(1); // falls to ctr 5 vs 0 — wall ignored entirely
    expect(sign(compareHlc(nan, high))).toBe(1); // same fall-through; high's wall 999 never consulted
    // With equal counters the dev term decides instead:
    const nanTied = { wall: Number.NaN, ctr: 0, dev: "m" };
  });

  it("NaN walls make the order intransitive — the reason transport must reject them", () => {
    // Constructive violation of transitivity under the current fall-through:
    // a > b (dev), b < c (dev), yet a < c (real wall difference). If such events
    // reached fold(), sort() output would depend on input permutation.
    const a = { wall: 20, ctr: 0, dev: "z" };
    const b = { wall: Number.NaN, ctr: 0, dev: "a" };
    const c = { wall: 30, ctr: 0, dev: "b" };
    expect(sign(compareHlc(a, b))).toBe(1); // a > b via dev
    expect(sign(compareHlc(b, c))).toBe(-1); // b < c via dev
    expect(sign(compareHlc(a, c))).toBe(-1); // but a < c via wall → cycle
  });

  it("±Infinity orders correctly against finite walls", () => {
    expect(sign(compareHlc({ wall: Number.POSITIVE_INFINITY, ctr: 0, dev: "a" }, { wall: 1, ctr: 0, dev: "z" }))).toBe(1);
    expect(sign(compareHlc({ wall: Number.NEGATIVE_INFINITY, ctr: 0, dev: "z" }, { wall: 1, ctr: 0, dev: "a" }))).toBe(-1);
    // Two +Infinity walls fall through to ctr deterministically.
    expect(sign(compareHlc({ wall: Number.POSITIVE_INFINITY, ctr: 1, dev: "a" }, { wall: Number.POSITIVE_INFINITY, ctr: 0, dev: "z" }))).toBe(1);
  });

  it("-0 and 0 are treated as the same wall instant (benign)", () => {
    // -0 - 0 is -0, which is falsy, so the wall term ties. Numerically -0 === 0,
    // so falling through to ctr/dev is the correct total-order behaviour.
    expect(sign(compareHlc({ wall: -0, ctr: 1, dev: "a" }, { wall: 0, ctr: 0, dev: "z" }))).toBe(1);
  });

  it("fractional walls compare consistently", () => {
    expect(sign(compareHlc({ wall: 1.5, ctr: 0, dev: "a" }, { wall: 2, ctr: 0, dev: "z" }))).toBe(-1);
    expect(sign(compareHlc({ wall: 2, ctr: 0, dev: "z" }, { wall: 1.5, ctr: 0, dev: "a" }))).toBe(1);
  });

  it("walls beyond MAX_SAFE_INTEGER lose distinctness to double precision — known bound", () => {
    // MAX_SAFE_INTEGER + 1 and + 2 both round to the same double, so distinct
    // logical instants compare equal on the wall term and fall through to
    // ctr/dev. HLCs minted from Date.now() are ~1.7e12, six orders of magnitude
    // below the danger zone; documented as a representability bound, not fixed here.
    expect(Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2).toBe(true);
  });
});
