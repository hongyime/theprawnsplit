// PERF-003: saveGroup must persist exactly the StoredGroup shape, never the
// hydrated events/meta/identities that Trip.svelte spreads onto its in-memory
// GroupRecord before calling saveGroup (rename, currency change, every
// commit()). Inspects the raw IndexedDB "groups" row directly — bypassing
// readGroup's own hydration — so a regression can't hide behind it.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createGroup, resetRepositoryForTests, saveGroup, type GroupRecord } from "@/db/repo";

let dbName: string;
beforeEach(async () => {
  dbName = `group-storage-shape-${crypto.randomUUID()}`;
  await resetRepositoryForTests(dbName);
});

function readRawGroupRow(groupId: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(dbName);
    openRequest.onerror = () => reject(openRequest.error ?? new Error("open failed"));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const tx = database.transaction("groups", "readonly");
      const getRequest = tx.objectStore("groups").get(groupId);
      getRequest.onerror = () => reject(getRequest.error ?? new Error("get failed"));
      getRequest.onsuccess = () => {
        database.close();
        resolve(getRequest.result as Record<string, unknown>);
      };
    };
  });
}

describe("group storage shape (PERF-003)", () => {
  it("does not persist hydrated events/meta/identities when saveGroup receives a full GroupRecord", async () => {
    const group = await createGroup("Synthetic Storage", "SGD");

    // Simulate exactly what Trip.svelte's renameGroup/setCurrency/commit do:
    // spread the full hydrated GroupRecord and pass it straight to saveGroup.
    const hydrated: GroupRecord = { ...group, name: "Renamed Trip" };
    await saveGroup(hydrated);

    const row = await readRawGroupRow(group.groupId);
    expect(row.name).toBe("Renamed Trip");
    expect(row).not.toHaveProperty("events");
    expect(row).not.toHaveProperty("meta");
    expect(row).not.toHaveProperty("identities");
    // Legitimate StoredGroup fields must still all survive the write.
    expect(row.groupId).toBe(group.groupId);
    expect(row.currency).toBe(group.currency);
    expect(row.deviceId).toBe(group.deviceId);
    expect(row.nextCounter).toBe(group.nextCounter);
    expect(row.createdAt).toBe(group.createdAt);
    expect(row.secretB64).toBe(group.secretB64);
    expect(row.tagHex).toBe(group.tagHex);
  });
});
