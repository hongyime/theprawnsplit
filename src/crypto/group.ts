import { base64ToBytes, bytesToBase64, bytesToHex, cryptoBytes, utf8 } from "./bytes";

export function createGroupSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

export function secretToBase64(secret: Uint8Array): string {
  return bytesToBase64(secret);
}

export function secretFromBase64(secret: string): Uint8Array {
  return base64ToBytes(secret);
}

async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", cryptoBytes(bytes)));
}

export async function groupTag(secret: Uint8Array): Promise<string> {
  const suffix = utf8.encode("tag");
  const input = new Uint8Array(secret.length + suffix.length);
  input.set(secret);
  input.set(suffix, secret.length);
  return bytesToHex(await digest(input));
}

export async function groupKey(secret: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", cryptoBytes(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8.encode("enc") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function relayWriteProof(secret: Uint8Array, tag: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", cryptoBytes(secret), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: utf8.encode(tag), info: utf8.encode("relay-write-proof") },
    material,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}
