import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createExport,
  createIdentityBackup,
  ensureGroup,
  replaceFromExport,
  resetRepositoryForTests,
  restoreIdentityBackup,
  stringifyExport,
  type GroupRecord,
} from "@/db/repo";
import { latestArchiveEvent } from "@/lib/lifecycle";

function groupWithIdentity(): GroupRecord {
  return {
    groupId: "g_test",
    name: "Trip",
    currency: "USD",
    deviceId: "d_test",
    nextCounter: 2,
    createdAt: 1_787_280_000_000,
    secretB64: "secret-material",
    tagHex: "a".repeat(64),
    events: [
      {
        v: 1,
        id: "d_test:1",
        hlc: { wall: 1_787_280_000_000, ctr: 1, dev: "d_test" },
        dev: "d_test",
        t: "GroupCreated",
        name: "Trip",
        currency: "USD",
      },
    ],
    meta: {
      groupId: "g_test",
      versionVector: { d_test: 1 },
      discardVector: {},
      cursors: {},
      nostrSk: "nostr-secret",
    },
    identities: [
      {
        groupId: "g_test",
        pid: "p_alice",
        deviceId: "d_test",
        alg: "ecdsa-p256",
        claimPk: "claim-public",
        claimPkJwk: { kty: "EC", crv: "P-256", x: "public-x", y: "public-y" },
        claimSkJwk: { kty: "EC", crv: "P-256", x: "public-x", y: "public-y", d: "private-d" },
      },
    ],
  };
}

describe("export artifact split", () => {
  it("keeps TripLedgerExport free of device identity and group secret material", () => {
    const exported = createExport(groupWithIdentity());
    const json = stringifyExport(exported);

    expect(exported.type).toBe("TripLedgerExport");
    expect("identities" in exported).toBe(false);
    expect("secretB64" in exported.group).toBe(false);
    expect(json).not.toContain("claimSk");
    expect(json).not.toContain("private-d");
    expect(json).not.toContain("secret-material");
    expect(json).not.toContain("nostr-secret");
  });

  it("keeps DeviceIdentityBackup separate and explicitly credential-bearing", () => {
    const backup = createIdentityBackup(groupWithIdentity());
    const json = stringifyExport(backup);

    expect(backup.type).toBe("DeviceIdentityBackup");
    expect(backup.identities).toHaveLength(1);
    expect(json).toContain("claimSkJwk");
    expect(json).toContain("private-d");
  });

  it("restores identity backup onto a matching recovered trip by tag", async () => {
    const source = groupWithIdentity();
    const ledger = createExport(source);
    const backup = createIdentityBackup(source);

    await resetRepositoryForTests(`export-security-${crypto.randomUUID()}`);
    const recovered = await replaceFromExport(ledger);
    expect(recovered.groupId).toBe(source.groupId);
    expect(recovered.identities).toHaveLength(0);

    await resetRepositoryForTests(`export-security-${crypto.randomUUID()}`);
    const joined = await ensureGroup({ secretB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", tagHex: source.tagHex, name: "Trip", currency: "USD" });
    expect(joined.groupId).not.toBe(source.groupId);

    const restored = await restoreIdentityBackup(backup);
    expect(restored.groupId).toBe(joined.groupId);
    expect(restored.identities).toHaveLength(1);
    expect(restored.identities[0]?.claimSkJwk).toEqual(source.identities[0]?.claimSkJwk);
  });

  it("reconstructs archived groups with recorded outstanding balances from TripLedgerExport", async () => {
    const source: GroupRecord = {
      ...groupWithIdentity(),
      events: [
        ...groupWithIdentity().events,
        {
          v: 1,
          id: "d_test:2",
          hlc: { wall: 1_787_280_001_000, ctr: 2, dev: "d_test" },
          dev: "d_test",
          t: "GroupArchived",
          outstanding: [{ from: "p_bob", to: "p_alice", minor: 1250n }],
        },
      ],
    };

    await resetRepositoryForTests(`archive-export-${crypto.randomUUID()}`);
    const recovered = await replaceFromExport(createExport(source));
    const archive = latestArchiveEvent(recovered.events);

    expect(archive?.outstanding).toEqual([{ from: "p_bob", to: "p_alice", minor: 1250n }]);
  });
});
