import { compareCodepoints } from "./types";
import type { State } from "./types";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function canonicalize(value: unknown): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) return value === 0 ? 0 : String(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Set) return [...value].map(canonicalize).sort(compareCanonical);
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([a], [b]) => compareCodepoints(String(a), String(b)))
      .map(([key, entry]) => [canonicalize(key), canonicalize(entry)]);
  }
  if (typeof value === "object") {
    const out: { [key: string]: CanonicalValue } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) out[key] = canonicalize(entry);
    }
    return out;
  }
  return null;
}

const compareCanonical = (a: CanonicalValue, b: CanonicalValue): number =>
  compareCodepoints(JSON.stringify(a), JSON.stringify(b));

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalState(state: State): CanonicalValue {
  return canonicalize(state);
}

export function canonicalStateBytes(state: State): string {
  return stableStringify(canonicalState(state));
}
