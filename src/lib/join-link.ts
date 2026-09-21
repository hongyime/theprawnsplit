export interface JoinTokenSeed {
  secretB64: string;
  tagHex: string;
  name?: string;
  currency?: string;
}

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * FE-002: decode the base64url payload to bytes, then try UTF-8 first (covers
 * both plain-ASCII and correctly UTF-8 encoded Unicode names/currencies). If
 * the bytes are not valid UTF-8, fall back to treating them as Latin1 — this
 * recovers tokens created by the pre-fix encoder, which called btoa() directly
 * on the JSON string and so stored each UTF-16 code unit as one Latin1 byte
 * (correct only for accented names whose code units happened to be <= 255;
 * it threw outright for CJK/emoji, which is exactly why this fix exists).
 */
function base64UrlToText(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return binary;
  }
}

function isJoinTokenSeed(value: unknown): value is JoinTokenSeed {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.secretB64 !== "string" || record.secretB64.length === 0) return false;
  if (typeof record.tagHex !== "string" || record.tagHex.length === 0) return false;
  if (record.name !== undefined && typeof record.name !== "string") return false;
  if (record.currency !== undefined && typeof record.currency !== "string") return false;
  return true;
}

export function encodeJoinSeed(seed: JoinTokenSeed): string {
  return utf8ToBase64Url(JSON.stringify(seed));
}

export function decodeJoinSeed(value: string): JoinTokenSeed {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlToText(value));
  } catch {
    throw new Error("Join link is malformed.");
  }
  if (!isJoinTokenSeed(parsed)) throw new Error("Join link is malformed.");
  return parsed;
}

export function buildJoinLink(baseHref: string, seed: JoinTokenSeed): string {
  const url = new URL(baseHref);
  url.hash = `join=${encodeJoinSeed(seed)}`;
  return url.toString();
}
