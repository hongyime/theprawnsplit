// @vitest-environment jsdom
// CR-013 Task 2.
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

describe("sync honesty UI boundary (rendered)", () => {
  it("shows the unconfirmed count and never claims synced while local events are pending", async () => {
    await resetRepositoryForTests(`sync-honesty-render-${Date.now()}`);
    await ensureGroup(); // GroupCreated event → local, not yet confirmed

    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });
    const card = await waitFor(() => { const el = document.querySelector<HTMLButtonElement>(".trip-card"); if (!el) throw new Error("no card"); return el; }, { timeout: 15000 });
    fireEvent.click(card);
    await waitFor(() => { if (!document.querySelector(".app-shell")) throw new Error("no shell"); }, { timeout: 15000 });

    // Topbar shows unconfirmed count — at least one event is local/unconfirmed.
    await waitFor(() => {
      const topbar = document.querySelector("header.topbar");
      if (!topbar?.textContent?.match(/\d+ unconfirmed/)) throw new Error("no unconfirmed count");
    }, { timeout: 15000 });
    const topbarText = document.querySelector("header.topbar")?.textContent ?? "";
    expect(topbarText).toMatch(/\d+ unconfirmed/);
    // The topbar must NOT claim events are synced/shared while local events remain.
    expect(topbarText).not.toMatch(/\b(synced|shared|success|confirmed)\b/i);
  }, 90_000);
});
