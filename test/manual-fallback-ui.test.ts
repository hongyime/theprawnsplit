// @vitest-environment jsdom
// CR-012 Task 2 pilot — converted from source-text regex to a real render.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";

vi.mock("@/relay/sync", () => ({
  syncOnce: vi.fn(async () => ({
    published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0,
    snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [],
  })),
}));

if (!(globalThis.crypto as Crypto).subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
}

const { createJoinSeed, ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { buildJoinLink } = await import("@/lib/join-link");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp(): void {
  instance = mount(App as never, { target: document.body }) as Record<string, unknown>;
}

beforeEach(() => { document.body.textContent = ""; });
afterEach(() => {
  if (instance) {
    try { unmount(instance as never); } catch { /* torn down */ }
    instance = null;
  }
});

describe("eviction recovery panel (rendered)", () => {
  it("renders evicted-mode recovery with primary Import JSON and first-time vs had-it-before distinction", async () => {
    // Donor lives on ITS OWN device namespace: sharing the join link must not
    // leak the GroupCreated event of the donor into the joining device.
    await resetRepositoryForTests(`donor-${Date.now()}`);
    const donor = await ensureGroup();
    const link = buildJoinLink("https://app.test/", createJoinSeed(donor));

    // The joining device starts from an empty database.
    await resetRepositoryForTests(`joiner-${Date.now()}`);
    const fragmentIndex = link.indexOf("#");
    expect(fragmentIndex).toBeGreaterThanOrEqual(0);
    window.location.hash = `${link.slice(fragmentIndex + 1)}&recovery=evicted`;

    renderApp();

    // Evicted heading + both recovery-mode toggles render for real.
    await screen.findByText("Device Storage Empty", {}, { timeout: 15000 });
    expect(screen.getByText("Had it before")).toBeTruthy();
    expect(screen.getByText("First time here")).toBeTruthy();

    // Manual JSON import is a primary action in evicted mode.
    const importLinks = screen.getAllByText("Import JSON");
    expect(importLinks.length).toBeGreaterThan(0);
    expect(importLinks.some((node) => node.closest("a")?.classList.contains("primary-link"))).toBe(true);

    // The blocked-recovery copy is present while sync cannot recover.
    expect(screen.getByText(/Waiting for recovered trip data|Import is the fastest way back/)).toBeTruthy();
  });
}, 60_000);

