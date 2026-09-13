import { afterEach, expect, it, vi } from "vitest";
import { coordinatedSync, emptySyncResult } from "@/relay/sync-cycle";

afterEach(() => vi.unstubAllGlobals());

it("lets a different trip finish and releases a failed trip for retry", async () => {
  let reject!: (reason: Error) => void;
  const run = vi.fn(() => new Promise<ReturnType<typeof emptySyncResult>>((_, fail) => { reject = fail; }));
  const first = coordinatedSync("fixture-one", run);
  const failure = expect(first).rejects.toThrow("fixture database failure");
  let timer: ReturnType<typeof setTimeout>;
  try {
    const other = await Promise.race([coordinatedSync("fixture-two", async () => ({ ...emptySyncResult(), received: 2 })),
      new Promise<ReturnType<typeof emptySyncResult>>(done => { timer = setTimeout(() => done(emptySyncResult()), 500); })]);
    expect(other.received).toBe(2);
    expect(coordinatedSync("fixture-one", run)).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  } finally { clearTimeout(timer!); reject(new Error("fixture database failure")); await failure; }
  expect((await coordinatedSync("fixture-one", async () => ({ ...emptySyncResult(), received: 1 }))).received).toBe(1);
});

it("skips an occupied cross-tab lock without running a recovery attempt", async () => {
  const names: string[] = [];
  const request = vi.fn(async (name: string, options: { ifAvailable: boolean }, callback: (lock: object | null) => unknown) => {
    names.push(name); expect(options.ifAvailable).toBe(true);
    return callback(name.endsWith("busy") ? null : {});
  });
  vi.stubGlobal("navigator", { locks: { request } });
  const run = vi.fn(async () => emptySyncResult());
  const skipped = await coordinatedSync("busy", run);
  expect(skipped).toEqual({ ...emptySyncResult(), inProgress: true });
  expect(run).not.toHaveBeenCalled();
  const completed = await coordinatedSync("available", run);
  expect(completed.inProgress).toBeUndefined(); expect(run).toHaveBeenCalledTimes(1);
  expect(names).toEqual(["prawn-sync:busy", "prawn-sync:available"]);
});
