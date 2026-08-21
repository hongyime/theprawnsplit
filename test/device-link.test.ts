import { describe, expect, it } from "vitest";
import { createDeviceLinkRequest, isDeviceLinkReplay, linkPayload, parseDeviceLinkRequest } from "@/lib/device-link";
import { makeEvent, type EventFactory } from "@/lib/events";

const tagHex = "a".repeat(64);
const nonce = "b".repeat(32);

describe("device link artifacts", () => {
  it("creates a shareable request with the signature payload fields", () => {
    const request = createDeviceLinkRequest({
      tagHex,
      pid: "alice",
      deviceId: "new-phone",
      identity: { claimPk: "new-key", alg: "ecdsa-p256" },
      nonce,
      createdAt: 1,
    });

    expect(request).toMatchObject({ type: "DeviceLinkRequest", version: 1, newDevice: "new-phone", newClaimPk: "new-key" });
    expect(linkPayload(request)).toBe(`${tagHex}:link:alice:new-phone:new-key:${nonce}`);
  });

  it("parses only supported link request artifacts", () => {
    const request = createDeviceLinkRequest({
      tagHex,
      pid: "alice",
      deviceId: "new-phone",
      identity: { claimPk: "new-key", alg: "ecdsa-p256" },
      nonce,
      createdAt: 1,
    });

    expect(parseDeviceLinkRequest(JSON.stringify(request))).toEqual(request);
    expect(() => parseDeviceLinkRequest(JSON.stringify({ ...request, alg: "rsa" }))).toThrow("Unsupported device link algorithm");
  });

  it("rejects weak replay-boundary fields", () => {
    const request = createDeviceLinkRequest({
      tagHex,
      pid: "alice",
      deviceId: "new-phone",
      identity: { claimPk: "new-key", alg: "ecdsa-p256" },
      nonce,
      createdAt: 1,
    });

    expect(() => parseDeviceLinkRequest(JSON.stringify({ ...request, tagHex: "A".repeat(64) }))).toThrow("Device link tag must be lowercase 64-hex");
    expect(() => parseDeviceLinkRequest(JSON.stringify({ ...request, nonce: "short" }))).toThrow("Device link nonce must be lowercase 128-bit hex");
    expect(() => createDeviceLinkRequest({ ...request, deviceId: request.newDevice, identity: { claimPk: request.newClaimPk, alg: request.alg }, nonce: "short" })).toThrow(
      "Device link nonce must be lowercase 128-bit hex",
    );
  });

  it("detects replayed device-link nonces for the same delegated device", () => {
    const request = createDeviceLinkRequest({
      tagHex,
      pid: "alice",
      deviceId: "new-phone",
      identity: { claimPk: "new-key", alg: "ecdsa-p256" },
      nonce,
      createdAt: 1,
    });
    const factory: EventFactory = { deviceId: "alice-phone", nextCounter: 1 };
    const linked = makeEvent(factory, "DeviceLinked", {
      pid: request.pid,
      parentDevice: "alice-phone",
      newDevice: request.newDevice,
      newClaimPk: request.newClaimPk,
      alg: request.alg,
      nonce: request.nonce,
      sig: "sig",
    });

    expect(isDeviceLinkReplay([linked], request)).toBe(true);
    expect(isDeviceLinkReplay([linked], { ...request, nonce: "c".repeat(32) })).toBe(false);
    expect(isDeviceLinkReplay([linked], { ...request, newDevice: "tablet" })).toBe(false);
  });
});
