// DATA-003: restoreIdentityBackup previously wrote claimPkJwk/claimSkJwk into
// IndexedDB after only checking they were record-shaped objects — never that
// they actually imported under the declared algorithm, that claimPk matched
// the public JWK, or that the private and public keys corresponded to the
// same real keypair at all. A malformed or mismatched backup could silently
// overwrite usable identity material with keys that later fail every sign/
// verify attempt (the impact DATA-003 names). This runs entirely async,
// outside any IDB transaction, per repo.ts's own established rule that
// crypto.subtle work must finish before a transaction opens.
import { importPrivateKey, importPublicKey, signClaim, verifyClaim, type ClaimAlg } from "@/crypto/claim";
import { bytesToBase64, utf8 } from "@/crypto/bytes";

export interface CandidateIdentityKeypair {
  alg: ClaimAlg;
  claimPk: string;
  claimPkJwk: JsonWebKey;
  claimSkJwk: JsonWebKey;
}

export type KeypairValidationResult = { ok: true } | { ok: false; reason: string };

const PROBE_PAYLOAD_PREFIX = "identity-backup-keypair-probe:";

/**
 * Proves a candidate identity's public/private JWKs are a real, matching
 * keypair under the declared algorithm, and that claimPk is the exact
 * public key any other event referencing it by that string would expect.
 * Never throws — callers get a discriminated result instead.
 */
export async function validateIdentityKeypair(candidate: CandidateIdentityKeypair): Promise<KeypairValidationResult> {
  try {
    await importPrivateKey(candidate.alg, candidate.claimSkJwk);
    await importPublicKey(candidate.alg, candidate.claimPkJwk);
  } catch {
    return { ok: false, reason: "keys do not import under the declared algorithm" };
  }

  const derivedPublicKey = bytesToBase64(utf8.encode(JSON.stringify(candidate.claimPkJwk)));
  if (derivedPublicKey !== candidate.claimPk) {
    return { ok: false, reason: "claimPk does not match the public JWK" };
  }

  const probe = `${PROBE_PAYLOAD_PREFIX}${crypto.randomUUID()}`;
  const signature = await signClaim(candidate.claimSkJwk, candidate.alg, probe);
  const verified = await verifyClaim(candidate.claimPkJwk, candidate.alg, probe, signature);
  if (!verified) return { ok: false, reason: "private and public keys do not correspond to the same keypair" };

  return { ok: true };
}
