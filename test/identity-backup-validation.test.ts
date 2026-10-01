import { describe, expect, it } from "vitest";
import { mintClaimKey } from "@/crypto/claim";
import { bytesToBase64, utf8 } from "@/crypto/bytes";
import { validateIdentityKeypair } from "@/lib/identity-backup-validation";

describe("validateIdentityKeypair (DATA-003)", () => {
  it("accepts a genuinely matching keypair for both supported algorithms", async () => {
    for (const alg of ["ed25519", "ecdsa-p256"] as const) {
      const key = await mintClaimKey(alg);
      const result = await validateIdentityKeypair({ alg, claimPk: key.publicKey, claimPkJwk: key.publicJwk, claimSkJwk: key.privateJwk });
      expect(result).toEqual({ ok: true });
    }
  });

  it("rejects a private key that does not correspond to the given public key, even though both individually import fine", async () => {
    const a = await mintClaimKey("ed25519");
    const b = await mintClaimKey("ed25519");
    const result = await validateIdentityKeypair({ alg: "ed25519", claimPk: a.publicKey, claimPkJwk: a.publicJwk, claimSkJwk: b.privateJwk });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/correspond/) });
  });

  it("rejects a claimPk string that does not match the derived public JWK, even if the keypair itself is valid", async () => {
    const key = await mintClaimKey("ed25519");
    const other = await mintClaimKey("ed25519");
    const result = await validateIdentityKeypair({ alg: "ed25519", claimPk: other.publicKey, claimPkJwk: key.publicJwk, claimSkJwk: key.privateJwk });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/claimPk/) });
  });

  it("rejects a JWK that does not import under the declared algorithm (e.g. an ecdsa-p256 JWK claimed as ed25519)", async () => {
    const key = await mintClaimKey("ecdsa-p256");
    const result = await validateIdentityKeypair({ alg: "ed25519", claimPk: key.publicKey, claimPkJwk: key.publicJwk, claimSkJwk: key.privateJwk });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/import/) });
  });

  it("rejects a record-shaped but garbage JWK object (the old check only verified it was an object)", async () => {
    const key = await mintClaimKey("ed25519");
    const result = await validateIdentityKeypair({
      alg: "ed25519",
      claimPk: key.publicKey,
      claimPkJwk: { kty: "not-a-real-jwk" } as JsonWebKey,
      claimSkJwk: key.privateJwk,
    });
    expect(result.ok).toBe(false);
  });

  it("computes the derived public key string the same way mintClaimKey does, so genuine backups from this app always match", async () => {
    const key = await mintClaimKey("ed25519");
    expect(key.publicKey).toBe(bytesToBase64(utf8.encode(JSON.stringify(key.publicJwk))));
  });
});
