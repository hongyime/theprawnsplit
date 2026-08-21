import { describe, expect, it } from "vitest";
import { allocate, fnv1a } from "../src/money";

describe("REQ-MON-03/14/18 allocate", () => {
  it("allocates largest remainders exactly with bigint math", () => {
    expect(allocate(1000n, [1n, 1n, 1n], "event-1", ["a", "b", "c"]).reduce((a, b) => a + b, 0n)).toBe(1000n);
    expect(allocate(1000n, [1n, 1n, 1n], "event-1", ["a", "b", "c"]).sort((a, b) => Number(b - a))).toEqual([334n, 333n, 333n]);
  });

  it("rejects invalid inputs instead of coercing", () => {
    expect(() => allocate(-1n, [1n], "e", ["a"])).toThrow(/non-negative/);
    expect(() => allocate(1n, [-1n], "e", ["a"])).toThrow(/non-negative/);
    expect(() => allocate(1n, [], "e", [])).toThrow(/empty/);
    expect(() => allocate(1n, [1n], "e", ["a", "b"])).toThrow(/mismatch/);
    expect(() => allocate(1n, [1n, 1n], "e", ["a", "a"])).toThrow(/unique/);
    expect(() => allocate(1n, [0n], "e", ["a"])).toThrow(/zero total weight/);
  });

  it("uses stable FNV-1a vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("hello")).toBe(0x4f9f2cab);
  });

  it("has deterministic tie-breaking", () => {
    const first = allocate(1n, [1n, 1n, 1n], "same", ["c", "b", "a"]);
    const second = allocate(1n, [1n, 1n, 1n], "same", ["c", "b", "a"]);
    expect(second).toEqual(first);
  });

  it("falls back to participant id order when FNV-1a hashes collide", () => {
    expect(fnv1a("collision:p4tzl")).toBe(fnv1a("collision:pj3ap"));
    expect(allocate(1n, [1n, 1n], "collision:", ["p4tzl", "pj3ap"])).toEqual([1n, 0n]);
    expect(allocate(1n, [1n, 1n], "collision:", ["pj3ap", "p4tzl"])).toEqual([0n, 1n]);
  });
});
