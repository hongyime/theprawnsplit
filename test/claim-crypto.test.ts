import { afterEach, describe, expect, it, vi } from "vitest";
import { pickAlg } from "@/crypto/claim";

describe("claim algorithm selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to ECDSA P-256 when Ed25519 key generation is unavailable", async () => {
    const generateKey = vi.spyOn(crypto.subtle, "generateKey").mockRejectedValue(new DOMException("unsupported", "NotSupportedError"));

    await expect(pickAlg()).resolves.toBe("ecdsa-p256");
    expect(generateKey).toHaveBeenCalledWith({ name: "Ed25519" }, false, ["sign", "verify"]);
  });
});
