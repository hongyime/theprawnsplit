import { describe, expect, it } from "vitest";
import type { GroupRecord } from "@/db/repo";
import { HttpRelay } from "@/relay/http";
import { NostrRelay } from "@/relay/nostr";
import { createRelays } from "@/relay/sync";

function groupWithRelaySettings(settings: NonNullable<GroupRecord["meta"]["relaySettings"]>): GroupRecord {
  return {
    groupId: "g_relays",
    name: "Trip",
    currency: "USD",
    deviceId: "d_relays",
    nextCounter: 1,
    createdAt: 1_787_280_000_000,
    secretB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    tagHex: "a".repeat(64),
    events: [],
    identities: [],
    meta: {
      groupId: "g_relays",
      versionVector: {},
      discardVector: {},
      cursors: {},
      nostrSk: "1".repeat(64),
      relaySettings: settings,
    },
  };
}

describe("relay creation from local settings", () => {
  it("builds operated and Nostr adapters from device-local relay settings", () => {
    const group = groupWithRelaySettings({
      useOperated: true,
      operatedEndpoint: "https://relay.example/api",
      nostrRelays: ["wss://one.example/", "wss://two.example"],
    });

    const relays = createRelays(group);

    expect(relays).toHaveLength(2);
    expect(relays[0]).toBeInstanceOf(HttpRelay);
    expect((relays[0] as HttpRelay).endpoint).toBe("https://relay.example/api");
    expect(relays[1]).toBeInstanceOf(NostrRelay);
    expect((relays[1] as NostrRelay).relayUrls).toEqual(["wss://one.example", "wss://two.example"]);
    expect(group.meta.relaySettings).toEqual({
      useOperated: true,
      operatedEndpoint: "https://relay.example/api",
      nostrRelays: ["wss://one.example", "wss://two.example"],
    });
  });

  it("honors disabling all relay targets instead of silently falling back", () => {
    const group = groupWithRelaySettings({
      useOperated: false,
      operatedEndpoint: "/api/relay",
      nostrRelays: [],
    });

    expect(createRelays(group)).toEqual([]);
    expect(group.meta.relaySettings).toEqual({
      useOperated: false,
      operatedEndpoint: "/api/relay",
      nostrRelays: [],
    });
  });

  it("REL-002: skips a backed-off operated endpoint this cycle, exactly like the useOperated=false toggle already does", () => {
    const group = groupWithRelaySettings({
      useOperated: true,
      operatedEndpoint: "https://relay.example/api",
      nostrRelays: [],
    });
    group.meta.relayPolicy = { operated: { consecutiveFailures: 1, backoffUntil: 5_000 } };

    // Fake-clock: still within the backoff window -- the operated relay is
    // not instantiated at all this cycle.
    expect(createRelays(group, 3_000)).toEqual([]);
    // Once the backoff window has elapsed, it becomes available again.
    const relays = createRelays(group, 5_000);
    expect(relays).toHaveLength(1);
    expect(relays[0]).toBeInstanceOf(HttpRelay);
  });

  it("REL-002: skips a permanently dropped operated endpoint regardless of elapsed time, until an explicit reset", () => {
    const group = groupWithRelaySettings({
      useOperated: true,
      operatedEndpoint: "https://relay.example/api",
      nostrRelays: [],
    });
    group.meta.relayPolicy = { operated: { consecutiveFailures: 5, dropped: true } };

    expect(createRelays(group, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it("REL-002: primes the NostrRelay instance with the group's current per-endpoint policy so it can skip its own backed-off URLs", () => {
    const group = groupWithRelaySettings({
      useOperated: false,
      operatedEndpoint: "/api/relay",
      nostrRelays: ["wss://one.example", "wss://two.example"],
    });
    group.meta.relayPolicy = { "wss://one.example": { consecutiveFailures: 3, dropped: true } };

    const relays = createRelays(group);

    expect(relays).toHaveLength(1);
    expect((relays[0] as NostrRelay).policy).toEqual(group.meta.relayPolicy);
  });
});
