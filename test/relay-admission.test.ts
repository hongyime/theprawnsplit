import { describe, expect, it } from "vitest";
import { DEFAULT_ADMISSION_BUDGETS, reserveAdmission, admissionKeyPrefix, type AdmissionStore } from "../server/relay-admission";

// In-memory fake implementing the exact same atomic-primitive contract the
// real Upstash-backed store will use (reserveSetSlot as one Lua EVAL there).
// Here, "atomic" just means each method body is fully synchronous before its
// first (and only) await-yielding return — JS's single-threadedness makes a
// synchronous function body un-interruptible, the same guarantee a Lua
// script gives against other Redis clients. Matches real Redis: an empty
// Set/counter-free key is treated as absent, not as an empty collection.
class FakeAdmissionStore implements AdmissionStore {
  private sets = new Map<string, Set<string>>();
  private counters = new Map<string, number>();
  calls: string[] = [];

  async reserveSetSlot(key: string, member: string, maxSize: number): Promise<"added" | "existing" | "rejected"> {
    this.calls.push(`reserveSetSlot ${key} ${member}`);
    const set = this.sets.get(key);
    if (set?.has(member)) return "existing";
    const next = set ? new Set(set) : new Set<string>();
    next.add(member);
    if (next.size > maxSize) return "rejected";
    this.sets.set(key, next);
    return "added";
  }

  async releaseSetSlot(key: string, member: string): Promise<void> {
    this.calls.push(`releaseSetSlot ${key} ${member}`);
    const set = this.sets.get(key);
    if (!set) return;
    set.delete(member);
    if (set.size === 0) this.sets.delete(key); // real Redis deletes an emptied collection
  }

  async incrby(key: string, amount: number): Promise<number> {
    this.calls.push(`incrby ${key} ${amount}`);
    const next = (this.counters.get(key) ?? 0) + amount;
    this.counters.set(key, next);
    return next;
  }

  async decrby(key: string, amount: number): Promise<void> {
    this.calls.push(`decrby ${key} ${amount}`);
    const next = (this.counters.get(key) ?? 0) - amount;
    if (next === 0) this.counters.delete(key); // real Redis deletes a counter that returns to 0
    else this.counters.set(key, next);
  }

  scard(key: string): number {
    return this.sets.get(key)?.size ?? 0;
  }

  snapshot() {
    return {
      sets: new Map([...this.sets].map(([k, v]) => [k, new Set(v)])),
      counters: new Map(this.counters),
    };
  }
}

const tag = "a".repeat(64);

describe("reserveAdmission", () => {
  it("admits a first write from a new author into a fresh tag under all four budgets", async () => {
    const store = new FakeAdmissionStore();
    const decision = await reserveAdmission(store, tag, "device-a", 1000);
    expect(decision).toEqual({ admitted: true });
  });

  it("rejects the 3rd distinct author on one tag and leaves the store unchanged", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxEnrollmentsPerGroup: 2 };
    expect(await reserveAdmission(store, tag, "device-a", 10, budgets)).toEqual({ admitted: true });
    expect(await reserveAdmission(store, tag, "device-b", 10, budgets)).toEqual({ admitted: true });
    const before = store.snapshot();
    const decision = await reserveAdmission(store, tag, "device-c", 10, budgets);
    expect(decision).toEqual({ admitted: false, retryAfterSeconds: 60 });
    const after = store.snapshot();
    expect(after.sets).toEqual(before.sets);
    expect(after.counters).toEqual(before.counters);
  });

  it("rejects the 3rd distinct group for one author and leaves the store unchanged", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxGroupsPerAuthor: 2 };
    expect(await reserveAdmission(store, "1".repeat(64), "device-a", 10, budgets)).toEqual({ admitted: true });
    expect(await reserveAdmission(store, "2".repeat(64), "device-a", 10, budgets)).toEqual({ admitted: true });
    const before = store.snapshot();
    const decision = await reserveAdmission(store, "3".repeat(64), "device-a", 10, budgets);
    expect(decision).toEqual({ admitted: false, retryAfterSeconds: 60 });
    const after = store.snapshot();
    expect(after.sets).toEqual(before.sets);
    expect(after.counters).toEqual(before.counters);
  });

  it("rejects the 6th event/sec on one tag with a 1-second retry hint and leaves the store unchanged", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxEventsPerSecondPerGroup: 5 };
    for (let i = 0; i < 5; i++) {
      expect(await reserveAdmission(store, tag, `device-${i}`, 10, budgets)).toEqual({ admitted: true });
    }
    const before = store.snapshot();
    const decision = await reserveAdmission(store, tag, "device-overflow", 10, budgets);
    expect(decision).toEqual({ admitted: false, retryAfterSeconds: 1 });
    const after = store.snapshot();
    expect(after.sets).toEqual(before.sets);
    expect(after.counters).toEqual(before.counters);
  });

  it("rejects a write that would exceed the per-tag storage budget and leaves the store unchanged", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxBytesPerGroup: 1000 };
    expect(await reserveAdmission(store, tag, "device-a", 900, budgets)).toEqual({ admitted: true });
    const before = store.snapshot();
    const decision = await reserveAdmission(store, tag, "device-b", 200, budgets);
    expect(decision).toEqual({ admitted: false, retryAfterSeconds: 60 });
    const after = store.snapshot();
    expect(after.sets).toEqual(before.sets);
    expect(after.counters).toEqual(before.counters);
  });

  it("never admits more than the enrollment budget under real concurrent Promise interleaving", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxEnrollmentsPerGroup: 3 };
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => reserveAdmission(store, tag, `device-${i}`, 10, budgets)),
    );
    const admitted = results.filter((r) => r.admitted).length;
    expect(admitted).toBe(3);
    expect(store.scard(`${admissionKeyPrefix}enroll:${tag}`)).toBe(3);
  });

  it("never admits more than the group-per-author budget under real concurrent Promise interleaving", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxGroupsPerAuthor: 4 };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => reserveAdmission(store, i.toString(16).padStart(64, "0"), "device-a", 10, budgets)),
    );
    const admitted = results.filter((r) => r.admitted).length;
    expect(admitted).toBe(4);
    expect(store.scard(`${admissionKeyPrefix}groups:device-a`)).toBe(4);
  });

  it("does not consume an enrollment or group slot for an already-enrolled author's repeat writes", async () => {
    const store = new FakeAdmissionStore();
    const budgets = { ...DEFAULT_ADMISSION_BUDGETS, maxEnrollmentsPerGroup: 1, maxGroupsPerAuthor: 1 };
    expect(await reserveAdmission(store, tag, "device-a", 10, budgets)).toEqual({ admitted: true });
    // Same author, same tag, again: must not be treated as a 2nd distinct enrollment/group.
    expect(await reserveAdmission(store, tag, "device-a", 10, budgets)).toEqual({ admitted: true });
    expect(store.scard(`${admissionKeyPrefix}enroll:${tag}`)).toBe(1);
    expect(store.scard(`${admissionKeyPrefix}groups:device-a`)).toBe(1);
  });

  it("only touches keys under the ad: prefix, never the write-proof or stream keyspace", async () => {
    const store = new FakeAdmissionStore();
    await reserveAdmission(store, tag, "device-a", 10);
    expect(store.calls.length).toBeGreaterThan(0);
    for (const call of store.calls) {
      const key = call.split(" ")[1]!;
      expect(key.startsWith(admissionKeyPrefix)).toBe(true);
    }
  });
});
