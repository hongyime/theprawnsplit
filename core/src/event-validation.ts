// DATA-003: runtime parser for the full Event discriminated union. The
// import path previously only checked BaseEvent shape (t/id/dev/v/hlc as
// the right *typeof*) and never validated a single type-specific field —
// a malformed-but-base-shaped event (e.g. ExpenseAdded with financials
// missing entirely, or a non-bigint money field) could reach IndexedDB and
// later crash fold()'s projection for the whole group, since fold() trusts
// TypeScript's Event type at runtime with no such guarantee actually held.
//
// A future-version event (v > supportedVersion) is preserved verbatim
// under quarantine — its type-specific shape is unknowable, so only base
// fields are checked. Within a supported version, every known `t` gets a
// full per-variant parse; an unrecognized `t` at a SUPPORTED version is
// invalid, not quarantined (only version skew earns quarantine, per
// REQ-MON-12/REQ-SYN-22 — an unknown kind at a version we claim to support
// is a real defect, not a forward-compat signal).
import type { Event, Financials, HLC } from "./types";

export type ParseEventResult =
  | { kind: "known"; event: Event }
  | { kind: "quarantine-future"; raw: unknown }
  | { kind: "invalid"; errors: string[] };

export interface ParseEventOptions {
  supportedVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isMoney(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n;
}

function isAlg(value: unknown): value is "ed25519" | "ecdsa-p256" {
  return value === "ed25519" || value === "ecdsa-p256";
}

function parseHlc(value: unknown): HLC | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNonNegative(value.wall)) return null;
  if (!isFiniteNonNegative(value.ctr)) return null;
  if (!isNonEmptyString(value.dev)) return null;
  return { wall: value.wall, ctr: value.ctr, dev: value.dev };
}

function parseVv(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined; // treated as absent by callers; base fields are re-checked separately
  const out: Record<string, number> = {};
  for (const [dev, counter] of Object.entries(value)) {
    if (!isFiniteNonNegative(counter)) return undefined;
    out[dev] = counter;
  }
  return out;
}

interface BaseFields {
  v: number;
  id: string;
  hlc: HLC;
  dev: string;
  vv?: Record<string, number>;
}

function parseBaseFields(value: Record<string, unknown>): BaseFields | null {
  if (typeof value.v !== "number" || !Number.isFinite(value.v) || value.v < 1) return null;
  if (!isNonEmptyString(value.id)) return null;
  if (!isNonEmptyString(value.dev)) return null;
  const hlc = parseHlc(value.hlc);
  if (!hlc) return null;
  if (hlc.dev !== value.dev) return null; // an event's own hlc.dev must match its dev
  const base: BaseFields = { v: value.v, id: value.id, hlc, dev: value.dev };
  if (value.vv !== undefined) {
    const vv = parseVv(value.vv);
    if (vv === undefined) return null;
    base.vv = vv;
  }
  return base;
}

function parseMoneyRow(value: unknown): { pid: string; minor: bigint } | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.pid)) return null;
  if (!isMoney(value.minor)) return null;
  return { pid: value.pid, minor: value.minor };
}

function parseMoneyRows(value: unknown): { pid: string; minor: bigint }[] | null {
  if (!Array.isArray(value)) return null;
  const rows: { pid: string; minor: bigint }[] = [];
  for (const row of value) {
    const parsed = parseMoneyRow(row);
    if (!parsed) return null;
    rows.push(parsed);
  }
  return rows;
}

function parseFinancials(value: unknown): Financials | null {
  if (!isRecord(value)) return null;
  if (!isMoney(value.minor)) return null;
  const payers = parseMoneyRows(value.payers);
  if (!payers) return null;
  const shares = parseMoneyRows(value.shares);
  if (!shares) return null;
  const financials: Financials = { minor: value.minor, payers, shares };
  if (value.rate !== undefined) {
    if (!isRecord(value.rate)) return null;
    const currency = value.rate.currency;
    const toBase = value.rate.toBase;
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
    if (typeof toBase !== "number" || !Number.isFinite(toBase) || toBase <= 0) return null;
    financials.rate = { currency, toBase };
  }
  return financials;
}

function parseOutstandingRows(value: unknown): { from: string; to: string; minor: bigint }[] | null {
  if (!Array.isArray(value)) return null;
  const rows: { from: string; to: string; minor: bigint }[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isNonEmptyString(row.from) || !isNonEmptyString(row.to) || !isMoney(row.minor)) return null;
    rows.push({ from: row.from, to: row.to, minor: row.minor });
  }
  return rows;
}

// Each per-variant parser assumes `value` already passed parseBaseFields and
// receives the ORIGINAL raw record (so it can read its own extra fields) plus
// the already-parsed base fields to splice into the returned Event.
type VariantParser = (value: Record<string, unknown>, base: BaseFields) => Event | null;

const variantParsers: Record<string, VariantParser> = {
  GroupCreated: (v, base) =>
    isNonEmptyString(v.name) && isNonEmptyString(v.currency)
      ? { ...base, t: "GroupCreated", name: v.name, currency: v.currency }
      : null,

  ParticipantAdded: (v, base) =>
    isNonEmptyString(v.pid) && isNonEmptyString(v.name) ? { ...base, t: "ParticipantAdded", pid: v.pid, name: v.name } : null,

  ParticipantRenamed: (v, base) =>
    isNonEmptyString(v.pid) && isNonEmptyString(v.name) ? { ...base, t: "ParticipantRenamed", pid: v.pid, name: v.name } : null,

  ParticipantClaimed: (v, base) =>
    isNonEmptyString(v.pid) && isNonEmptyString(v.deviceId) && isNonEmptyString(v.claimPk) && isAlg(v.alg) && isNonEmptyString(v.sig)
      ? { ...base, t: "ParticipantClaimed", pid: v.pid, deviceId: v.deviceId, claimPk: v.claimPk, alg: v.alg, sig: v.sig }
      : null,

  DeviceLinked: (v, base) =>
    isNonEmptyString(v.pid) &&
    isNonEmptyString(v.parentDevice) &&
    isNonEmptyString(v.newDevice) &&
    isNonEmptyString(v.newClaimPk) &&
    isAlg(v.alg) &&
    isNonEmptyString(v.nonce) &&
    isNonEmptyString(v.sig)
      ? {
          ...base,
          t: "DeviceLinked",
          pid: v.pid,
          parentDevice: v.parentDevice,
          newDevice: v.newDevice,
          newClaimPk: v.newClaimPk,
          alg: v.alg,
          nonce: v.nonce,
          sig: v.sig,
        }
      : null,

  ClaimReattested: (v, base) =>
    isNonEmptyString(v.pid) &&
    isNonEmptyString(v.newDevice) &&
    isNonEmptyString(v.newClaimPk) &&
    isAlg(v.alg) &&
    isNonEmptyString(v.attestor) &&
    isNonEmptyString(v.sig)
      ? {
          ...base,
          t: "ClaimReattested",
          pid: v.pid,
          newDevice: v.newDevice,
          newClaimPk: v.newClaimPk,
          alg: v.alg,
          attestor: v.attestor,
          sig: v.sig,
        }
      : null,

  ParticipantUnclaimed: (v, base) =>
    isNonEmptyString(v.pid) && isNonEmptyString(v.deviceId) ? { ...base, t: "ParticipantUnclaimed", pid: v.pid, deviceId: v.deviceId } : null,

  ParticipantMerged: (v, base) =>
    isNonEmptyString(v.from) && isNonEmptyString(v.into) ? { ...base, t: "ParticipantMerged", from: v.from, into: v.into } : null,

  ParticipantsMarkedDistinct: (v, base) =>
    isNonEmptyString(v.a) && isNonEmptyString(v.b) ? { ...base, t: "ParticipantsMarkedDistinct", a: v.a, b: v.b } : null,

  ParticipantDeactivated: (v, base) => (isNonEmptyString(v.pid) ? { ...base, t: "ParticipantDeactivated", pid: v.pid } : null),

  ExpenseAdded: (v, base) => {
    if (!isNonEmptyString(v.xid) || !isNonEmptyString(v.desc) || typeof v.at !== "number" || !Number.isFinite(v.at) || !isNonEmptyString(v.date)) {
      return null;
    }
    const financials = parseFinancials(v.financials);
    if (!financials) return null;
    return { ...base, t: "ExpenseAdded", xid: v.xid, financials, desc: v.desc, at: v.at, date: v.date };
  },

  ExpenseEdited: (v, base) => {
    if (!isNonEmptyString(v.xid)) return null;
    const event: Event & { t: "ExpenseEdited" } = { ...base, t: "ExpenseEdited", xid: v.xid };
    if (v.financials !== undefined) {
      const financials = parseFinancials(v.financials);
      if (!financials) return null;
      event.financials = financials;
    }
    if (v.meta !== undefined) {
      if (!isRecord(v.meta) || !isOptionalString(v.meta.desc) || !isOptionalString(v.meta.date)) return null;
      const meta: { desc?: string; date?: string } = {};
      if (v.meta.desc !== undefined) meta.desc = v.meta.desc;
      if (v.meta.date !== undefined) meta.date = v.meta.date;
      event.meta = meta;
    }
    return event;
  },

  ExpenseVoided: (v, base) => (isNonEmptyString(v.xid) ? { ...base, t: "ExpenseVoided", xid: v.xid } : null),

  SettlementRecorded: (v, base) =>
    isNonEmptyString(v.sid) && isNonEmptyString(v.from) && isNonEmptyString(v.to) && isMoney(v.minor)
      ? { ...base, t: "SettlementRecorded", sid: v.sid, from: v.from, to: v.to, minor: v.minor }
      : null,

  SettlementConfirmed: (v, base) =>
    isNonEmptyString(v.sid) && isNonEmptyString(v.pid) && isNonEmptyString(v.claimSig)
      ? { ...base, t: "SettlementConfirmed", sid: v.sid, pid: v.pid, claimSig: v.claimSig }
      : null,

  SettlementDisputed: (v, base) => {
    if (!isNonEmptyString(v.sid) || !isOptionalString(v.note)) return null;
    const event: Event & { t: "SettlementDisputed" } = { ...base, t: "SettlementDisputed", sid: v.sid };
    if (v.note !== undefined) event.note = v.note;
    return event;
  },

  SettlementVoided: (v, base) => (isNonEmptyString(v.sid) ? { ...base, t: "SettlementVoided", sid: v.sid } : null),

  GroupArchived: (v, base) => {
    const outstanding = parseOutstandingRows(v.outstanding);
    return outstanding ? { ...base, t: "GroupArchived", outstanding } : null;
  },

  GroupUnarchived: (_v, base) => ({ ...base, t: "GroupUnarchived" }),

  EventVoided: (v, base) => (isNonEmptyString(v.targetId) ? { ...base, t: "EventVoided", targetId: v.targetId } : null),
};

/**
 * Parse one raw (already-JSON-decoded, but untrusted) value against the
 * full Event discriminated union.
 *
 * - A value whose declared schema version exceeds `supportedVersion` is
 *   returned verbatim under `quarantine-future`, once its BASE fields
 *   (v/id/dev/hlc) pass sanity — this device cannot know its type-specific
 *   shape, so it must be retained unmodified rather than coerced.
 * - Otherwise, every field of the matching variant is parsed; anything
 *   that fails, including an unrecognized `t` at a version we claim to
 *   support, is `invalid` (never silently written).
 */
export function parseEvent(value: unknown, opts: ParseEventOptions): ParseEventResult {
  if (!isRecord(value)) return { kind: "invalid", errors: ["event is not an object"] };
  if (typeof value.t !== "string" || value.t.length === 0) return { kind: "invalid", errors: ["missing or invalid t"] };

  // Version gate happens before full base-field parsing so that a future
  // event with an otherwise-valid-looking version still gets a chance to be
  // quarantined even if some base-field detail this device doesn't yet know
  // about would otherwise look odd — but wall/ctr/dev sanity is still
  // required, since compareHlc's arithmetic ordering depends on it for
  // every device regardless of schema version.
  const versionIsFuture = typeof value.v === "number" && Number.isFinite(value.v) && value.v > opts.supportedVersion;
  if (versionIsFuture) {
    if (!isNonEmptyString(value.id) || !isNonEmptyString(value.dev) || !parseHlc(value.hlc)) {
      return { kind: "invalid", errors: ["future-version event has an unsafe base field"] };
    }
    return { kind: "quarantine-future", raw: value };
  }

  const base = parseBaseFields(value);
  if (!base) return { kind: "invalid", errors: ["malformed base event fields"] };

  const parser = variantParsers[value.t];
  if (!parser) return { kind: "invalid", errors: [`unrecognized event kind "${value.t}" at a supported schema version`] };

  const event = parser(value, base);
  if (!event) return { kind: "invalid", errors: [`malformed fields for event kind "${value.t}"`] };
  return { kind: "known", event };
}
