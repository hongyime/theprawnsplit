import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createGroup, readGroup, resetRepositoryForTests, updateMeta } from "@/db/repo";
import { resetRelayEndpoint } from "@/relay/sync";

describe("REL-002 explicit relay policy reset (never silently resurrected)", () => {
  it("clears a single endpoint's demoted/backed-off policy without touching any other endpoint's policy or the configured relay list", async () => {
    await resetRepositoryForTests(`rel-002-reset-single-${crypto.randomUUID()}`);
    const group = await createGroup("Synthetic Reset", "SGD");
    await updateMeta(group.groupId, (meta) => ({
      ...meta,
      relaySettings: { useOperated: true, operatedEndpoint: "/api/relay", nostrRelays: ["wss://one.example", "wss://two.example"] },
      relayPolicy: {
        operated: { consecutiveFailures: 4, dropped: true },
        "wss://one.example": { consecutiveFailures: 2, backoffUntil: 999_999_999 },
      },
    }));

    await resetRelayEndpoint(group.groupId, "operated");
    const after = await readGroup(group.groupId);

    expect(after.meta.relayPolicy?.operated).toEqual({ consecutiveFailures: 0 });
    // The OTHER endpoint's policy is untouched -- a reset is scoped to the
    // one endpoint named, never a blanket clear of every tracked endpoint.
    expect(after.meta.relayPolicy?.["wss://one.example"]).toEqual({ consecutiveFailures: 2, backoffUntil: 999_999_999 });
    // The user-configured relay list itself is never touched by a reset.
    expect(after.meta.relaySettings).toEqual({
      useOperated: true,
      operatedEndpoint: "/api/relay",
      nostrRelays: ["wss://one.example", "wss://two.example"],
    });
  });

  it("clears every tracked endpoint's policy when no specific endpoint is named", async () => {
    await resetRepositoryForTests(`rel-002-reset-all-${crypto.randomUUID()}`);
    const group = await createGroup("Synthetic reset all", "SGD");
    await updateMeta(group.groupId, (meta) => ({
      ...meta,
      relayPolicy: {
        operated: { consecutiveFailures: 4, dropped: true },
        "wss://one.example": { consecutiveFailures: 2, backoffUntil: 999_999_999 },
      },
    }));

    await resetRelayEndpoint(group.groupId);

    const after = await readGroup(group.groupId);
    expect(after.meta.relayPolicy).toEqual({});
  });
});
