import { bytesToBase64, base64ToBytes, cryptoBytes, utf8 } from "./bytes";

export type ClaimAlg = "ed25519" | "ecdsa-p256";

export interface ClaimKeyPair {
  alg: ClaimAlg;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  publicKey: string;
}

export async function pickAlg(): Promise<ClaimAlg> {
  try {
    await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    return "ed25519";
  } catch {
    return "ecdsa-p256";
  }
}

function algorithm(alg: ClaimAlg): EcKeyGenParams | AlgorithmIdentifier {
  return alg === "ed25519" ? { name: "Ed25519" } : { name: "ECDSA", namedCurve: "P-256" };
}

function signAlgorithm(alg: ClaimAlg): AlgorithmIdentifier | EcdsaParams {
  return alg === "ed25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: "SHA-256" };
}

export async function mintClaimKey(alg?: ClaimAlg): Promise<ClaimKeyPair> {
  const selectedAlg = alg ?? (await pickAlg());
  const keys = await crypto.subtle.generateKey(algorithm(selectedAlg), true, ["sign", "verify"]);
  if (!("publicKey" in keys)) throw new Error("Expected key pair");
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keys.privateKey);
  return {
    alg: selectedAlg,
    publicJwk,
    privateJwk,
    publicKey: bytesToBase64(utf8.encode(JSON.stringify(publicJwk))),
  };
}

export async function importPrivateKey(alg: ClaimAlg, jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, algorithm(alg), false, ["sign"]);
}

export async function importPublicKey(alg: ClaimAlg, jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, algorithm(alg), false, ["verify"]);
}

export async function signClaim(privateJwk: JsonWebKey, alg: ClaimAlg, payload: string): Promise<string> {
  const key = await importPrivateKey(alg, privateJwk);
  const signature = await crypto.subtle.sign(signAlgorithm(alg), key, utf8.encode(payload));
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyClaim(publicJwk: JsonWebKey, alg: ClaimAlg, payload: string, signature: string): Promise<boolean> {
  try {
    const key = await importPublicKey(alg, publicJwk);
    return crypto.subtle.verify(signAlgorithm(alg), key, cryptoBytes(base64ToBytes(signature)), utf8.encode(payload));
  } catch {
    return false;
  }
}
