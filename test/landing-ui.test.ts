// @vitest-environment jsdom
// CR-013 Task 2 pilot conversion.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";

vi.mock("@/relay/sync", () => ({ syncOnce: vi.fn(async () => ({ published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0, snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [] })) }));
if (!(globalThis.crypto as Crypto).subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
if (!window.matchMedia) Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });

const { createGroup, listGroups, resetRepositoryForTests } = await import("@/db/repo");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp() { instance = mount(App as never, { target: document.body }) as Record<string, unknown>; }
beforeEach(() => { document.body.textContent = ""; });
afterEach(() => { if (instance) { try { unmount(instance as never); } catch {} instance = null; } });

describe("landing and root routing UI (rendered)", () => {
  it("renders the landing screen when no groups exist", async () => {
    await resetRepositoryForTests(`landing-render-${Date.now()}`);
    renderApp();
    // Landing renders immediately with no groups.
    await screen.findByText("The Prawn Split", {}, { timeout: 15000 });
    expect(document.body.textContent).toContain("Split Trip Costs With Friends.");
    expect(document.body.textContent).toContain("No Accounts.");
    expect(screen.getByRole("button", { name: /Start a new trip/i })).toBeTruthy();
  }, 90_000);

  it("renders the group list screen when groups exist", async () => {
    await resetRepositoryForTests(`landing-groups-${Date.now()}`);
    await createGroup("My Trip", "USD");
    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });
    expect(screen.getByRole("button", { name: /Start a new trip/i })).toBeTruthy();
  }, 90_000);

  it("lists stored groups sorted by newest first", async () => {
    await resetRepositoryForTests(`landing-sort-${Date.now()}`);
    const g1 = await createGroup("First Trip", "USD");
    const g2 = await createGroup("Second Trip", "EUR");
    const stored = await listGroups();
    expect(stored.length).toBe(2);
    expect(stored[0]?.groupId).toBe(g2.groupId);
    expect(stored[1]?.groupId).toBe(g1.groupId);
  });
});
