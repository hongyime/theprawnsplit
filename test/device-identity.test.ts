import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createJoinSeed, ensureClaimIdentity, ensureGroup, readGroup, resetRepositoryForTests } from "@/db/repo";

const deviceUuidPattern = /^d_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("local device identity", () => {
  it("generates a stable local device UUID for the first browser database", async () => {
    await resetRepositoryForTests(`device-id-local-${crypto.randomUUID()}`);

    const created = await ensureGroup();
    const reread = await readGroup(created.groupId);
    const ensuredAgain = await ensureGroup();

    expect(created.deviceId).toMatch(deviceUuidPattern);
    expect(reread.deviceId).toBe(created.deviceId);
    expect(ensuredAgain.deviceId).toBe(created.deviceId);
    expect(created.events[0]).toMatchObject({
      id: `${created.deviceId}:1`,
      dev: created.deviceId,
      t: "GroupCreated",
    });
  });

  it("creates a distinct local device UUID when opening a join seed on another database", async () => {
    await resetRepositoryForTests(`device-id-source-${crypto.randomUUID()}`);
    const source = await ensureGroup();
    const seed = createJoinSeed(source);

    await resetRepositoryForTests(`device-id-joined-${crypto.randomUUID()}`);
    const joined = await ensureGroup(seed);
    const reread = await readGroup(joined.groupId);

    expect(joined.deviceId).toMatch(deviceUuidPattern);
    expect(joined.deviceId).not.toBe(source.deviceId);
    expect(reread.deviceId).toBe(joined.deviceId);
    expect(joined.events).toEqual([]);
  });

  it("returns the same persisted claim identity for concurrent ensureClaimIdentity calls, never a discarded candidate (CONC-003)", async () => {
    await resetRepositoryForTests(`device-identity-race-${crypto.randomUUID()}`);
    const group = await ensureGroup();

    // mintClaimKey does real crypto.subtle work — genuinely async, giving a
    // natural race window between the missing-identity check and the
    // eventual put if both calls proceed independently.
    const [first, second] = await Promise.all([ensureClaimIdentity(group, "shared-pid"), ensureClaimIdentity(group, "shared-pid")]);
    expect(first.claimPk).toBe(second.claimPk);
    expect(first.claimSkJwk).toEqual(second.claimSkJwk);

    const persisted = (await readGroup(group.groupId)).identities.filter((identity) => identity.pid === "shared-pid");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.claimPk).toBe(first.claimPk);
  });
});
