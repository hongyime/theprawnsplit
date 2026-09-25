import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { mergeCoverageCounter, type CoverageIntervals } from "@/db/repo";

// DATA-007: versionVector/transportVector track TRANSPORT PROGRESS -- what
// counter has been OBSERVED from each author, including buffered/dropped/
// conflicted events that were never actually stored (see the same finding's
// existing bug: a device's vector can show "seen up through counter N" even
// though some counters 1..N were dropped/buffered/conflicted and never
// durably retained). coverage is a SEPARATE, exact record of which
// counters have a REAL event row present, as sorted non-overlapping
// [start, end] intervals -- so a hole in the middle of an otherwise-covered
// run is represented explicitly instead of being silently erased by a
// single running maximum.

describe("DATA-007 mergeCoverageCounter (pure interval merge)", () => {
  it("starts a fresh interval from an empty list", () => {
    expect(mergeCoverageCounter([], 5)).toEqual([[5, 5]]);
  });

  it("extends an existing interval forward and backward", () => {
    expect(mergeCoverageCounter([[3, 5]], 6)).toEqual([[3, 6]]);
    expect(mergeCoverageCounter([[3, 5]], 2)).toEqual([[2, 5]]);
  });

  it("keeps a non-adjacent counter as its own separate interval, representing a hole explicitly", () => {
    expect(mergeCoverageCounter([[1, 3]], 6)).toEqual([
      [1, 3],
      [6, 6],
    ]);
  });

  it("bridges two previously-separate intervals into one when the inserted counter fills the exact gap", () => {
    expect(
      mergeCoverageCounter(
        [
          [1, 2],
          [4, 5],
        ],
        3,
      ),
    ).toEqual([[1, 5]]);
  });

  it("is idempotent for a counter already covered", () => {
    const existing: CoverageIntervals = [[1, 5]];
    expect(mergeCoverageCounter(existing, 3)).toEqual([[1, 5]]);
  });

  it("never mutates the input array", () => {
    const existing: CoverageIntervals = [[1, 2]];
    const frozen = JSON.parse(JSON.stringify(existing));
    mergeCoverageCounter(existing, 10);
    expect(existing).toEqual(frozen);
  });
});
