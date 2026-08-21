import { describe, expect, it } from "vitest";
import { defaultRelaySettings, normalizeRelaySettings, parseNostrRelayText, relaySettingsTargetCount } from "@/lib/relay-settings";

const defaults = {
  operatedEndpoint: "/api/relay",
  nostrRelays: ["wss://relay.example", "wss://relay-two.example/"],
};

describe("relay settings", () => {
  it("builds defaults from configured operated and Nostr relays", () => {
    expect(defaultRelaySettings(defaults)).toEqual({
      useOperated: true,
      operatedEndpoint: "/api/relay",
      nostrRelays: ["wss://relay.example", "wss://relay-two.example"],
    });
  });

  it("normalizes custom endpoints and removes invalid or duplicate Nostr relays", () => {
    const settings = normalizeRelaySettings(
      {
        useOperated: false,
        operatedEndpoint: "https://relay.example/api",
        nostrRelays: ["wss://relay.example/", "notaurl", "https://wrong.example", "wss://relay.example"],
      },
      defaults,
    );

    expect(settings).toEqual({
      useOperated: false,
      operatedEndpoint: "https://relay.example/api",
      nostrRelays: ["wss://relay.example"],
    });
    expect(relaySettingsTargetCount(settings)).toBe(1);
  });

  it("parses comma and newline separated relay lists", () => {
    expect(parseNostrRelayText("wss://one.example,\nwss://two.example wss://one.example/")).toEqual([
      "wss://one.example",
      "wss://two.example",
    ]);
  });

  it("counts no active relay targets when operated relay is disabled and Nostr list is empty", () => {
    const settings = normalizeRelaySettings({ useOperated: false, nostrRelays: [] }, defaults);

    expect(settings.nostrRelays).toEqual([]);
    expect(relaySettingsTargetCount(settings)).toBe(0);
  });
});
