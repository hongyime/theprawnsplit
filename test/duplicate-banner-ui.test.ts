// @vitest-environment jsdom
// CR-013 Task 2. The duplicate-banner assertions are also covered by
// reconciliation-ui.test.ts (CR-012 pilot); this file provides its own rendered version.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";

vi.mock("@/relay/sync", () => ({ syncOnce: vi.fn(async () => ({ published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0, snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [] })) }));
if (!(globalThis.crypto as Crypto).subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
if (!window.matchMedia) Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });

const { appendEvents, ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { defaultParticipant } = await import("@/lib/events");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp() { instance = mount(App as never, { target: document.body }) as Record<string, unknown>; }
beforeEach(() => { document.body.textContent = ""; });
afterEach(() => { if (instance) { try { unmount(instance as never); } catch {} instance = null; } });

describe("duplicate participant banner (rendered)", () => {
  it("renders the possible-duplicate hint with non-blocking Merge and Not same actions", async () => {
    await resetRepositoryForTests(`dup-banner-render-${Date.now()}`);
    const group = await ensureGroup();
    const factory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const p1 = defaultParticipant(factory, "Dana");
    factory.nextCounter += 1;
    const p2 = defaultParticipant(factory, "dana "); // normalises to the same name
    await appendEvents(group.groupId, [p1, p2]);

    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });
    const card = await waitFor(() => { const el = document.querySelector<HTMLButtonElement>(".trip-card"); if (!el) throw new Error("no card"); return el; }, { timeout: 15000 });
    fireEvent.click(card);
    await waitFor(() => { if (!document.querySelector(".app-shell")) throw new Error("no shell"); }, { timeout: 15000 });

    await screen.findByText(/may be the same as/, {}, { timeout: 15000 });
    expect(screen.getByRole("button", { name: "Merge" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not Same" })).toBeTruthy();
    // Balance text confirms duplicate detection does not automatically alter balances.
    expect(document.body.textContent).toContain("Without Changing Balances Automatically");
  }, 90_000);
});
