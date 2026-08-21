import { describe, expect, it } from "vitest";
import { createDeviceLinkRequest, linkPayload, parseDeviceLinkRequest } from "@/lib/device-link";

describe("device link artifacts", () => {
  it("creates a shareable request with the signature payload fields", () => {
    const request = createDeviceLinkRequest({
      tagHex: "tag",
      pid: "alice",
      deviceId: "new-phone",
      identity: { claimPk: "new-key", alg: "ecdsa-p256" },
      nonce: "nonce",
      createdAt: 1,
    });

    expect(request).toMatchObject({ type: "DeviceLinkRequest", version: 1, newDevice: "new-phone", newClaimPk: "new-key" });
    expect(linkPayload(request)).toBe("tag:link:alice:new-phone:new-key:nonce");
  });

  it("parses only supported link request artifacts", () => {
    const request = createDeviceLinkRequest({
      tagHex: "tag",
      pid: "alice",
      deviceId: "new-phone",
      identity: { claimPk: "new-key", alg: "ecdsa-p256" },
      nonce: "nonce",
      createdAt: 1,
    });

    expect(parseDeviceLinkRequest(JSON.stringify(request))).toEqual(request);
    expect(() => parseDeviceLinkRequest(JSON.stringify({ ...request, alg: "rsa" }))).toThrow("Unsupported device link algorithm");
  });
});
