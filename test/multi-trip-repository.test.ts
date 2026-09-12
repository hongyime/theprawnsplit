import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createGroup, createJoinSeed, ensureClaimIdentity, ensureGroup, listGroups, readGroup, resetRepositoryForTests } from "@/db/repo";

beforeEach(async () => resetRepositoryForTests(`trip-isolation-${crypto.randomUUID()}`));

describe("joining a trip alongside existing ledgers", () => {
  it("reopens the matching stored trip without replacing its device, events or identity", async () => {
    const groups = [await createGroup("Fixture Alpha", "USD"), await createGroup("Fixture Beta", "SGD")]
      .sort((a, b) => a.groupId < b.groupId ? -1 : 1);
    const wanted = groups[1]!;
    await ensureClaimIdentity(wanted, "fixture-person");
    const before = await Promise.all(groups.map(g => readGroup(g.groupId)));
    const result = await ensureGroup(createJoinSeed(wanted));
    expect(result).toEqual(before[1]);
    expect(await Promise.all(groups.map(g => readGroup(g.groupId)))).toEqual(before);
    expect(await listGroups()).toHaveLength(2);
  });

  it("joins a previously unseen seed and preserves every existing ledger", async () => {
    const donor = await createGroup("Fixture Shared Trip", "EUR");
    const seed = createJoinSeed(donor);
    await resetRepositoryForTests(`trip-receiver-${crypto.randomUUID()}`);
    const local = [await createGroup("Fixture Local One", "USD"), await createGroup("Fixture Local Two", "SGD")];
    const before = await Promise.all(local.map(g => readGroup(g.groupId)));
    const joined = await ensureGroup(seed);
    expect(joined.tagHex).toBe(seed.tagHex);
    expect(joined.secretB64).toBe(seed.secretB64);
    expect(joined.deviceId).not.toBe(donor.deviceId);
    expect(joined.events).toEqual([]);
    expect(joined.identities).toEqual([]);
    expect(await Promise.all(local.map(g => readGroup(g.groupId)))).toEqual(before);
    expect(await listGroups()).toHaveLength(3);
  });

  it("serializes concurrent joins to one local trip and one device identity", async () => {
    const donor = await createGroup("Fixture Donor", "USD");
    const seed = createJoinSeed(donor);
    await resetRepositoryForTests(`trip-concurrent-${crypto.randomUUID()}`);
    const results = await Promise.all(Array.from({ length: 6 }, () => ensureGroup(seed)));
    expect(new Set(results.map(g => g.groupId)).size).toBe(1);
    expect(new Set(results.map(g => g.deviceId)).size).toBe(1);
    expect(await listGroups()).toHaveLength(1);
    expect(results.every(g => g.tagHex === seed.tagHex && g.events.length === 0)).toBe(true);
  });

  it("rejects a mismatched seed without selecting or modifying an existing ledger", async () => {
    const local = await createGroup("Fixture Preserved", "SGD");
    const before = await readGroup(local.groupId);
    const seed = createJoinSeed(local);
    seed.tagHex = (seed.tagHex[0] === "0" ? "1" : "0") + seed.tagHex.slice(1);
    await expect(ensureGroup(seed)).rejects.toThrow(/join|secret/i);
    expect(await readGroup(local.groupId)).toEqual(before);
    expect(await listGroups()).toHaveLength(1);
  });

  it("rejects malformed join data without creating a phantom trip", async () => {
    const invalid = [null, {}, { secretB64: "!", tagHex: "a".repeat(64) },
      { secretB64: btoa("short"), tagHex: "a".repeat(64) }];
    for (const seed of invalid) {
      await expect(ensureGroup(seed as never)).rejects.toThrow();
      expect(await listGroups()).toHaveLength(0);
    }
  });
});
