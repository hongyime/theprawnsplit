// DATA-002: replaceFromExport's "no local trip matches this tag" branch
// generated a brand-new random secret but kept the IMPORT FILE's original
// tagHex verbatim. Since a trip's tagHex is derived FROM its secret
// (groupTag(secret)), pairing a fresh unrelated secret with someone else's
// original tag produces an internally-inconsistent group: its stored
// tagHex looks like the real trip's identity, but the paired secret has no
// cryptographic relationship to it at all, so it can never decrypt or
// authenticate against that trip's actual relay history, and would reject
// the trip's own real join link as "does not match" if the user later
// tried to properly join it.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  attachVerifiedSeed,
  createExport,
  createJoinSeed,
  ensureGroup,
  readGroup,
  replaceFromExport,
  resetRepositoryForTests,
  type TripLedgerExport,
} from "@/db/repo";
import { createGroupSecret, groupTag, secretFromBase64, secretToBase64 } from "@/crypto/group";

describe("replaceFromExport — no-match branch tag/secret consistency (DATA-002)", () => {
  it("derives the stored tagHex from the freshly generated secret, never reusing the import file's original tag", async () => {
    await resetRepositoryForTests(`data-002-consistency-${crypto.randomUUID()}`);
    const source = await ensureGroup();
    const exported: TripLedgerExport = createExport(await readGroup(source.groupId));
    // Force a "no local match" scenario: no group on this device has this tag.
    exported.group = { ...exported.group, tagHex: "d".repeat(64), groupId: "g_from_elsewhere" };

    const created = await replaceFromExport(exported);

    // The stored tagHex must actually correspond to the stored secret --
    // never the import file's original (now-unrelated) tag.
    const derivedFromStoredSecret = await groupTag(secretFromBase64(created.secretB64));
    expect(created.tagHex).toBe(derivedFromStoredSecret);
    expect(created.tagHex).not.toBe("d".repeat(64));
  });

  it("marks a keyless (no-match) import as explicitly unlinked/offline and records the original source tag", async () => {
    await resetRepositoryForTests(`data-002-unlinked-${crypto.randomUUID()}`);
    const source = await ensureGroup();
    const exported: TripLedgerExport = createExport(await readGroup(source.groupId));
    exported.group = { ...exported.group, tagHex: "e".repeat(64), groupId: "g_offline_import" };

    const created = await replaceFromExport(exported);

    expect(created.linked).toBe(false);
    expect(created.sourceTagHex).toBe("e".repeat(64));
  });

  it("treats a normally-created group (via ensureGroup/createGroup) as linked by default", async () => {
    await resetRepositoryForTests(`data-002-linked-default-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    expect(group.linked).not.toBe(false);
  });

  it("keeps a union-into-existing-tag import (the T30/DATA-001 path) linked, since it reuses the existing group's own verified secret", async () => {
    await resetRepositoryForTests(`data-002-union-stays-linked-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const exported = createExport(await readGroup(group.groupId));

    const restored = await replaceFromExport(exported);

    expect(restored.linked).not.toBe(false);
  });
});

describe("attachVerifiedSeed (DATA-002)", () => {
  it("upgrades an unlinked group to linked when the seed's tag matches the recorded source tag", async () => {
    await resetRepositoryForTests(`data-002-attach-${crypto.randomUUID()}`);
    // A genuinely independent trip identity -- NOT created locally via
    // ensureGroup, so importing its export necessarily takes the no-match/
    // unlinked branch rather than DATA-001's union-into-existing path.
    const realSecret = createGroupSecret();
    const seed = { secretB64: secretToBase64(realSecret), tagHex: await groupTag(realSecret) };
    const anchor = await ensureGroup();
    const exported: TripLedgerExport = createExport(await readGroup(anchor.groupId));
    exported.group = { ...exported.group, tagHex: seed.tagHex, groupId: "g_needs_linking" };
    const unlinked = await replaceFromExport(exported);
    expect(unlinked.linked).toBe(false);

    const attached = await attachVerifiedSeed(unlinked.groupId, seed);

    expect(attached.linked).not.toBe(false);
    expect(attached.tagHex).toBe(seed.tagHex);
    expect(attached.secretB64).toBe(seed.secretB64);
    // All previously-imported events/identities survive the attachment untouched.
    expect(attached.events.map((event) => event.id).sort()).toEqual(unlinked.events.map((event) => event.id).sort());
  });

  it("rejects a seed whose tag does not match this unlinked group's recorded source tag, without touching anything", async () => {
    await resetRepositoryForTests(`data-002-attach-mismatch-${crypto.randomUUID()}`);
    const original = await ensureGroup();
    const exported: TripLedgerExport = createExport(await readGroup(original.groupId));
    exported.group = { ...exported.group, tagHex: "f".repeat(64), groupId: "g_needs_linking_2" };
    const unlinked = await replaceFromExport(exported);

    const wrongSeed = { secretB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", tagHex: "1".repeat(64) };

    await expect(attachVerifiedSeed(unlinked.groupId, wrongSeed)).rejects.toThrow();
    const after = await readGroup(unlinked.groupId);
    expect(after.linked).toBe(false);
    expect(after.tagHex).toBe(unlinked.tagHex);
    expect(after.secretB64).toBe(unlinked.secretB64);
  });

  it("refuses to silently replace a group that is already linked, even if a seed is supplied", async () => {
    await resetRepositoryForTests(`data-002-attach-already-linked-${crypto.randomUUID()}`);
    const group = await ensureGroup();
    const seed = createJoinSeed(await readGroup(group.groupId));

    await expect(attachVerifiedSeed(group.groupId, seed)).rejects.toThrow();
    const after = await readGroup(group.groupId);
    expect(after.secretB64).toBe(group.secretB64);
  });
});
