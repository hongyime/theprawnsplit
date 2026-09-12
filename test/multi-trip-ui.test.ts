// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";

vi.mock("@/relay/sync", () => ({ syncOnce: vi.fn() }));
if (!globalThis.crypto.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
Object.defineProperty(document, "hidden", { configurable: true, value: false });
const repo = await import("@/db/repo");
const { syncOnce } = await import("@/relay/sync");
const { default: App } = await import("@/App.svelte");
const { buildJoinLink } = await import("@/lib/join-link");
const emptyResult = { published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0, snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [] };
let instance: ReturnType<typeof mount> | undefined;
let polls: Map<number, () => void>;
let registrations: Array<[string, EventListenerOrEventListenerObject]>;
let groups: Awaited<ReturnType<typeof repo.createGroup>>[];
let finish: (result: typeof emptyResult) => void;
let fail: (reason: Error) => void;

beforeEach(async () => {
  document.body.textContent = "";
  window.history.replaceState(null, "", "/");
  polls = new Map();
  registrations = [];
  let nextId = -100;
  const realInterval = window.setInterval.bind(window);
  const realClear = window.clearInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation(((callback: () => void, delay?: number) => {
    if (delay !== 5_000) return realInterval(callback, delay);
    const id = --nextId; polls.set(id, callback); return id;
  }) as typeof window.setInterval);
  vi.spyOn(window, "clearInterval").mockImplementation(id => { if (typeof id === "number" && polls.has(id)) polls.delete(id); else realClear(id); });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    if (listener) registrations.push([type, listener]);
    add(type, listener, options);
  });
  vi.mocked(syncOnce).mockReset().mockImplementation(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  await repo.resetRepositoryForTests(`trip-ui-${crypto.randomUUID()}`);
  groups = [await repo.createGroup("Fixture Alpha", "USD"), await repo.createGroup("Fixture Beta", "SGD")]
    .sort((a, b) => a.groupId < b.groupId ? -1 : 1);
  instance = mount(App, { target: document.body });
  await screen.findByText("Your Trips");
});

afterEach(async () => {
  if (instance) await unmount(instance);
  instance = undefined;
  // Baseline App leaks listeners. Clean the harness after asserting behavior so
  // independent scenarios remain meaningful on both the broken and fixed code.
  for (const [type, listener] of registrations) window.removeEventListener(type, listener);
  vi.restoreAllMocks();
});

async function select(index: number) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(groups[index]!.name) }));
  await waitFor(() => expect((document.querySelector<HTMLInputElement>('input[aria-label="Trip Name"]')!).value).toBe(groups[index]!.name));
}
async function startSync() {
  for (const poll of [...polls.values()]) poll();
  await waitFor(() => expect(syncOnce).toHaveBeenCalledTimes(1), { timeout: 15000 });
  expect(syncOnce).toHaveBeenCalledWith(groups[1]!.groupId);
}
async function settle() {
  // IDB and verification cross multiple task queues, not just one microtask.
  await new Promise(resolve => setTimeout(resolve, 120));
}

describe("selected trip lifetime", () => {
  it("reports a local storage failure without mislabelling a valid join link", async () => {
    vi.spyOn(repo, "ensureGroup").mockRejectedValueOnce(new Error("Fixture Local Storage Is Full"));
    window.history.replaceState(null, "", buildJoinLink(window.location.href, repo.createJoinSeed(groups[1]!)));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Fixture Local Storage Is Full");
    expect(await repo.listGroups()).toHaveLength(2);
  });

  it("keeps a delayed claim and its device identity on the original ledger", async () => {
    const createIdentity = repo.ensureClaimIdentity;
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const identity = vi.spyOn(repo, "ensureClaimIdentity").mockImplementation(async (...args) => {
      await paused; return createIdentity(...args);
    });
    await select(1);
    fireEvent.input(screen.getByPlaceholderText("e.g. John Smith"), { target: { value: "Fixture Delayed Claim" } });
    fireEvent.click(screen.getByRole("button", { name: "Create My Spot" }));
    await waitFor(() => expect(identity).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTitle("All Trips")); await screen.findByText("Your Trips"); await select(0);
    const preserved = await repo.readGroup(groups[0]!.groupId);
    release();
    await waitFor(async () => expect((await repo.readGroup(groups[1]!.groupId)).events.some(e => e.t === "ParticipantClaimed")).toBe(true));
    const after = await repo.readGroup(groups[0]!.groupId);
    expect(after.events).toEqual(preserved.events);
    expect(after.identities).toEqual(preserved.identities);
    expect(document.body.textContent).not.toContain("Fixture Delayed Claim");
  });

  it("ignores an older navigation read when a newer join link has opened", async () => {
    const read = repo.readGroup;
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const pending = vi.spyOn(repo, "readGroup").mockImplementation(async id => { await paused; return read(id); });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(groups[0]!.name) }));
    await waitFor(() => expect(pending).toHaveBeenCalled());
    window.history.replaceState(null, "", buildJoinLink(window.location.href, repo.createJoinSeed(groups[1]!)));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => expect(document.querySelector<HTMLInputElement>('input[aria-label="Trip Name"]')?.value).toBe(groups[1]!.name));
    release(); await settle();
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Trip Name"]')?.value).toBe(groups[1]!.name);
  });

  it("keeps the second trip selected after its sync finishes", async () => {
    await select(1); await startSync(); finish(emptyResult); await settle();
    expect((document.querySelector<HTMLInputElement>('input[aria-label="Trip Name"]')!).value).toBe(groups[1]!.name);
  });

  it("does not reopen a trip when its delayed sync finishes on the trip list", async () => {
    await select(1); await startSync(); fireEvent.click(screen.getByTitle("All Trips"));
    await screen.findByText("Your Trips"); finish(emptyResult); await settle();
    expect(screen.queryByText("Your Trips")).not.toBeNull();
    expect(document.querySelector('input[aria-label="Trip Name"]')).toBeNull();
  });

  it("does not carry an old trip's sync error or form state into another trip", async () => {
    await select(1); await startSync();
    fireEvent.input(screen.getByPlaceholderText("e.g. John Smith"), { target: { value: "Old Fixture Name" } });
    fireEvent.click(screen.getByTitle("All Trips")); await screen.findByText("Your Trips"); await select(0);
    fail(new Error("Fixture Old Trip Failure")); await settle();
    expect(document.body.textContent).not.toContain("Fixture Old Trip Failure");
    expect((screen.getByPlaceholderText("e.g. John Smith") as HTMLInputElement).value).toBe("");
  });

  it("stops the selected trip's poll timer when returning to the list", async () => {
    await select(1); expect(polls.size).toBe(1);
    fireEvent.click(screen.getByTitle("All Trips")); await screen.findByText("Your Trips");
    expect(polls.size).toBe(0);
  });
});
