import { describe, expect, it, vi } from "vitest";
import { createUpstashAdmissionStore } from "../server/relay-admission";

describe("createUpstashAdmissionStore", () => {
  it("reserveSetSlot runs the reservation as a single atomic EVAL and maps the Lua result through", async () => {
    const eval_ = vi.fn().mockResolvedValue("added");
    const redis = { eval: eval_, incrby: vi.fn(), expire: vi.fn(), decrby: vi.fn(), srem: vi.fn() };
    const store = createUpstashAdmissionStore(redis as never);

    const result = await store.reserveSetSlot("ad:enroll:tag", "device-a", 20);

    expect(result).toBe("added");
    expect(eval_).toHaveBeenCalledTimes(1);
    const [script, keys, args] = eval_.mock.calls[0]!;
    expect(typeof script).toBe("string");
    expect(script).toContain("SADD");
    expect(script).toContain("SCARD");
    expect(script).toContain("SREM");
    expect(keys).toEqual(["ad:enroll:tag"]);
    expect(args).toEqual(["device-a", "20"]);
  });

  it("reserveSetSlot passes through 'existing' and 'rejected' from the script unchanged", async () => {
    const redisExisting = { eval: vi.fn().mockResolvedValue("existing"), incrby: vi.fn(), expire: vi.fn(), decrby: vi.fn(), srem: vi.fn() };
    const redisRejected = { eval: vi.fn().mockResolvedValue("rejected"), incrby: vi.fn(), expire: vi.fn(), decrby: vi.fn(), srem: vi.fn() };
    expect(await createUpstashAdmissionStore(redisExisting as never).reserveSetSlot("k", "m", 1)).toBe("existing");
    expect(await createUpstashAdmissionStore(redisRejected as never).reserveSetSlot("k", "m", 1)).toBe("rejected");
  });

  it("releaseSetSlot issues a plain SREM", async () => {
    const srem = vi.fn().mockResolvedValue(1);
    const redis = { eval: vi.fn(), incrby: vi.fn(), expire: vi.fn(), decrby: vi.fn(), srem };
    await createUpstashAdmissionStore(redis as never).releaseSetSlot("ad:enroll:tag", "device-a");
    expect(srem).toHaveBeenCalledWith("ad:enroll:tag", "device-a");
  });

  it("incrby sets a TTL only on the increment that newly creates the key", async () => {
    const incrby = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const expire = vi.fn().mockResolvedValue(1);
    const redis = { eval: vi.fn(), incrby, expire, decrby: vi.fn(), srem: vi.fn() };
    const store = createUpstashAdmissionStore(redis as never);

    expect(await store.incrby("ad:rate:tag:1", 1, 2)).toBe(1);
    expect(expire).toHaveBeenCalledWith("ad:rate:tag:1", 2);

    expire.mockClear();
    expect(await store.incrby("ad:rate:tag:1", 1, 2)).toBe(2);
    expect(expire).not.toHaveBeenCalled();
  });

  it("incrby never sets a TTL when none is requested", async () => {
    const incrby = vi.fn().mockResolvedValue(1);
    const expire = vi.fn();
    const redis = { eval: vi.fn(), incrby, expire, decrby: vi.fn(), srem: vi.fn() };
    await createUpstashAdmissionStore(redis as never).incrby("ad:bytes:tag", 500);
    expect(expire).not.toHaveBeenCalled();
  });

  it("decrby issues a plain DECRBY", async () => {
    const decrby = vi.fn().mockResolvedValue(0);
    const redis = { eval: vi.fn(), incrby: vi.fn(), expire: vi.fn(), decrby, srem: vi.fn() };
    await createUpstashAdmissionStore(redis as never).decrby("ad:bytes:tag", 500);
    expect(decrby).toHaveBeenCalledWith("ad:bytes:tag", 500);
  });
});
