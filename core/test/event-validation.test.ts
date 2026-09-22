import { describe, expect, it } from "vitest";
import { parseEvent } from "../src/event-validation";
import type { Event } from "../src/types";

const dev = "d1";
const hlc = { wall: 1_700_000_000_000, ctr: 1, dev };
const supportedVersion = 1;

function valid<T extends Event>(event: T): T {
  return event;
}

const groupCreated = valid({ v: 1, id: `${dev}:1`, hlc, dev, t: "GroupCreated", name: "Trip", currency: "USD" });

describe("parseEvent — base fields and HLC", () => {
  it("accepts a well-formed known-variant event", () => {
    const result = parseEvent(groupCreated, { supportedVersion });
    expect(result).toEqual({ kind: "known", event: groupCreated });
  });

  it("rejects a non-object payload", () => {
    expect(parseEvent(null, { supportedVersion })).toMatchObject({ kind: "invalid" });
    expect(parseEvent("not an event", { supportedVersion })).toMatchObject({ kind: "invalid" });
    expect(parseEvent([], { supportedVersion })).toMatchObject({ kind: "invalid" });
  });

  it("rejects missing or wrong-typed base fields", () => {
    for (const bad of [
      { ...groupCreated, id: undefined },
      { ...groupCreated, id: 42 },
      { ...groupCreated, dev: "" },
      { ...groupCreated, v: "1" },
      { ...groupCreated, t: 123 },
    ]) {
      expect(parseEvent(bad, { supportedVersion })).toMatchObject({ kind: "invalid" });
    }
  });

  it("rejects HLC fields that are the wrong type, including values that pass typeof==='number' but are not finite/safe (NaN, Infinity, -Infinity)", () => {
    for (const badHlc of [
      { wall: Number.NaN, ctr: 1, dev },
      { wall: Number.POSITIVE_INFINITY, ctr: 1, dev },
      { wall: Number.NEGATIVE_INFINITY, ctr: 1, dev },
      { wall: 1, ctr: Number.NaN, dev },
      { wall: -1, ctr: 1, dev }, // negative wall clock is not a valid timestamp
      { wall: 1, ctr: -1, dev }, // negative counter
      { wall: "1700000000000", ctr: 1, dev }, // string masquerading as number
      { wall: 1, ctr: 1, dev: "" }, // empty device id
      { wall: 1, ctr: 1 }, // missing dev
    ]) {
      expect(parseEvent({ ...groupCreated, hlc: badHlc }, { supportedVersion })).toMatchObject({ kind: "invalid" });
    }
  });

  it("preserves a future-version event verbatim under quarantine instead of coercing or discarding it, while still requiring sane base/HLC fields", () => {
    const future = { v: 99, id: `${dev}:5`, hlc, dev, t: "SomeFutureKind", anythingAtAll: { nested: true } };
    const result = parseEvent(future, { supportedVersion });
    expect(result).toEqual({ kind: "quarantine-future", raw: future });
  });

  it("does not quarantine a future-version event with an unsafe HLC — base-field sanity still applies", () => {
    const future = { v: 99, id: `${dev}:5`, hlc: { wall: Number.NaN, ctr: 1, dev }, dev, t: "SomeFutureKind" };
    expect(parseEvent(future, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });
});

describe("parseEvent — ExpenseAdded / Financials (money rows and references)", () => {
  const base = { v: 1 as const, id: `${dev}:2`, hlc, dev, t: "ExpenseAdded" as const, xid: "x1", desc: "Lunch", at: 1_700_000_000_000, date: "2024-01-01" };

  it("accepts well-formed financials with balanced payers/shares", () => {
    const event = {
      ...base,
      financials: { minor: 1000n, payers: [{ pid: "p1", minor: 1000n }], shares: [{ pid: "p1", minor: 500n }, { pid: "p2", minor: 500n }] },
    };
    expect(parseEvent(event, { supportedVersion })).toEqual({ kind: "known", event });
  });

  it("rejects a money field that is not a bigint (structural check, independent of fold's own conservation check)", () => {
    for (const badMinor of [1000, "1000", null, undefined, 1000.5]) {
      const event = { ...base, financials: { minor: badMinor, payers: [], shares: [] } };
      expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
    }
  });

  it("rejects a payer/share row with a non-string or empty pid reference", () => {
    for (const badPid of [42, "", null, undefined]) {
      const event = { ...base, financials: { minor: 100n, payers: [{ pid: badPid, minor: 100n }], shares: [] } };
      expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
    }
  });

  it("rejects payers/shares that are not arrays", () => {
    for (const bad of [null, undefined, "not-an-array", {}]) {
      const event = { ...base, financials: { minor: 0n, payers: bad, shares: [] } };
      expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
    }
  });

  it("rejects a rate object with a non-finite toBase or malformed currency", () => {
    for (const badRate of [
      { currency: "usd", toBase: 1.2 }, // lowercase
      { currency: "US", toBase: 1.2 }, // wrong length
      { currency: "USD", toBase: Number.NaN },
      { currency: "USD", toBase: -1 },
      { currency: "USD", toBase: 0 },
    ]) {
      const event = { ...base, financials: { minor: 0n, payers: [], shares: [], rate: badRate } };
      expect(parseEvent(event, { supportedVersion: 2 })).toMatchObject({ kind: "invalid" });
    }
  });

  it("rejects a missing financials object entirely for ExpenseAdded", () => {
    const event = { ...base };
    expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });
});

describe("parseEvent — ExpenseEdited (optional financials)", () => {
  it("accepts an edit with no financials change (meta-only edit)", () => {
    const event = { v: 1 as const, id: `${dev}:3`, hlc, dev, t: "ExpenseEdited" as const, xid: "x1", meta: { desc: "Dinner" } };
    expect(parseEvent(event, { supportedVersion })).toEqual({ kind: "known", event });
  });

  it("rejects malformed financials when present, exactly as ExpenseAdded does", () => {
    const event = { v: 1 as const, id: `${dev}:3`, hlc, dev, t: "ExpenseEdited" as const, xid: "x1", financials: { minor: "not-a-bigint", payers: [], shares: [] } };
    expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });
});

describe("parseEvent — signature-bearing identity variants", () => {
  it("accepts a well-formed ParticipantClaimed event", () => {
    const event = { v: 1 as const, id: `${dev}:4`, hlc, dev, t: "ParticipantClaimed" as const, pid: "p1", deviceId: dev, claimPk: "a".repeat(64), alg: "ed25519" as const, sig: "b".repeat(128) };
    expect(parseEvent(event, { supportedVersion })).toEqual({ kind: "known", event });
  });

  it("rejects an invalid alg value", () => {
    const event = { v: 1 as const, id: `${dev}:4`, hlc, dev, t: "ParticipantClaimed" as const, pid: "p1", deviceId: dev, claimPk: "a".repeat(64), alg: "rsa", sig: "b".repeat(128) };
    expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });

  it("rejects a non-string or empty sig/claimPk", () => {
    for (const field of ["claimPk", "sig"] as const) {
      const event: Record<string, unknown> = { v: 1, id: `${dev}:4`, hlc, dev, t: "ParticipantClaimed", pid: "p1", deviceId: dev, claimPk: "a".repeat(64), alg: "ed25519", sig: "b".repeat(128) };
      event[field] = "";
      expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
    }
  });
});

describe("parseEvent — SettlementRecorded (money reference)", () => {
  it("accepts a well-formed settlement", () => {
    const event = { v: 1 as const, id: `${dev}:6`, hlc, dev, t: "SettlementRecorded" as const, sid: "s1", from: "p1", to: "p2", minor: 500n };
    expect(parseEvent(event, { supportedVersion })).toEqual({ kind: "known", event });
  });

  it("rejects a non-bigint minor amount", () => {
    const event = { v: 1 as const, id: `${dev}:6`, hlc, dev, t: "SettlementRecorded" as const, sid: "s1", from: "p1", to: "p2", minor: 500 };
    expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });

  it("rejects empty from/to participant references", () => {
    const event = { v: 1 as const, id: `${dev}:6`, hlc, dev, t: "SettlementRecorded" as const, sid: "s1", from: "", to: "p2", minor: 500n };
    expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });
});

describe("parseEvent — simple reference-only variants", () => {
  it("accepts and rejects ParticipantMerged correctly", () => {
    const good = { v: 1 as const, id: `${dev}:7`, hlc, dev, t: "ParticipantMerged" as const, from: "p1", into: "p2" };
    expect(parseEvent(good, { supportedVersion })).toEqual({ kind: "known", event: good });
    const bad = { ...good, into: "" };
    expect(parseEvent(bad, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });

  it("accepts and rejects EventVoided correctly", () => {
    const good = { v: 1 as const, id: `${dev}:8`, hlc, dev, t: "EventVoided" as const, targetId: "d1:1" };
    expect(parseEvent(good, { supportedVersion })).toEqual({ kind: "known", event: good });
    const bad = { ...good, targetId: 42 };
    expect(parseEvent(bad, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });

  it("accepts and rejects GroupArchived's outstanding rows correctly", () => {
    const good = { v: 1 as const, id: `${dev}:9`, hlc, dev, t: "GroupArchived" as const, outstanding: [{ from: "p1", to: "p2", minor: 100n }] };
    expect(parseEvent(good, { supportedVersion })).toEqual({ kind: "known", event: good });
    const bad = { ...good, outstanding: [{ from: "p1", to: "p2", minor: 100 }] };
    expect(parseEvent(bad, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });
});

describe("parseEvent — unknown t within a supported version is invalid, not quarantined", () => {
  it("rejects a bogus event kind at a currently-supported schema version", () => {
    const event = { v: 1, id: `${dev}:10`, hlc, dev, t: "NotARealEventKind" };
    expect(parseEvent(event, { supportedVersion })).toMatchObject({ kind: "invalid" });
  });
});
