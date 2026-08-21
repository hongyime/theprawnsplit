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
});
