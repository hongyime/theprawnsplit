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

const { ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp() { instance = mount(App as never, { target: document.body }) as Record<string, unknown>; }
beforeEach(() => { document.body.textContent = ""; });
afterEach(() => { if (instance) { try { unmount(instance as never); } catch {} instance = null; } });

describe("empty state UI (rendered)", () => {
  it("presents add-people and share-trip as primary actions when the trip has no participants", async () => {
    await resetRepositoryForTests(`empty-state-render-${Date.now()}`);
    await ensureGroup();

    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });
    const card = await waitFor(() => { const el = document.querySelector<HTMLButtonElement>(".trip-card"); if (!el) throw new Error("no card"); return el; }, { timeout: 15000 });
    fireEvent.click(card);
    await waitFor(() => { if (!document.querySelector(".app-shell")) throw new Error("no shell"); }, { timeout: 15000 });

    // Empty participants list renders the two primary actions.
    await screen.findByText("Add people to start a trip ledger.", {}, { timeout: 15000 });
    // "Add people" button exists and is enabled.
    const addBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!btn) throw new Error("no submit");
      return btn;
    }, { timeout: 10000 });
    expect(addBtn.disabled).toBe(false);
    // Share trip file download action present.
    expect(document.body.textContent).toContain("Share trip file");
  }, 90_000);
});
