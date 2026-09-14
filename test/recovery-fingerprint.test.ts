import { expect, it } from "vitest";
import { defaultParticipant } from "@/lib/events";
import { eventFingerprint } from "@/relay/migrated-sync";
import type { Event } from "@theprawnsplit/core";

it("preserves own prototype-named JSON data when deciding whether an event is covered", async () => {
  const event = defaultParticipant({ deviceId: "fixture", nextCounter: 1 }, "Fixture");
  const plain = { ...event, evidence: {} };
  const retained = { ...event, evidence: JSON.parse('{"__proto__":{"retained":true}}') };
  expect(await eventFingerprint(retained)).not.toBe(await eventFingerprint(plain));
});

it("ignores JSON object-key order without equating bigint values with strings", async () => {
  const event = defaultParticipant({ deviceId: "fixture", nextCounter: 1 }, "Fixture");
  const reordered = Object.fromEntries(Object.entries(event).reverse()) as unknown as Event;
  expect(await eventFingerprint(reordered)).toBe(await eventFingerprint(event));
  const bigintPayload = { ...event, evidence: { amount: 1n } };
  const stringPayload = { ...event, evidence: { amount: "1" } };
  expect(await eventFingerprint(bigintPayload)).not.toBe(await eventFingerprint(stringPayload));
});
