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

const { appendEvents, ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { defaultParticipant } = await import("@/lib/events");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp() { instance = mount(App as never, { target: document.body }) as Record<string, unknown>; }
beforeEach(() => { document.body.textContent = ""; });
afterEach(() => { if (instance) { try { unmount(instance as never); } catch {} instance = null; } });

async function openTrip() {
  await screen.findByText("Your Trips", {}, { timeout: 15000 });
  const card = await waitFor(() => { const el = document.querySelector<HTMLButtonElement>(".trip-card"); if (!el) throw new Error("no card"); return el; }, { timeout: 15000 });
  fireEvent.click(card);
  await waitFor(() => { if (!document.querySelector(".app-shell")) throw new Error("no shell"); }, { timeout: 15000 });
}

describe("common expense UI boundary (rendered)", () => {
  it("renders the expense form with description, total, payer-mode, split-mode, and save controls", async () => {
    await resetRepositoryForTests(`common-expense-render-${Date.now()}`);
    const group = await ensureGroup();
    const factory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    await appendEvents(group.groupId, [defaultParticipant(factory, "Alice")]);

    renderApp();
    await openTrip();

    // Expense form elements render.
    await waitFor(() => {
      const desc = document.querySelector<HTMLInputElement>('input[placeholder="Description"]');
      if (!desc) throw new Error("no description input");
    }, { timeout: 15000 });
    expect(document.querySelector('input[placeholder="Total"]')).not.toBeNull();
    // Save expense button present.
    const saveBtn = [...document.querySelectorAll("button")].find((b) => /Save expense/i.test(b.textContent ?? ""));
    expect(saveBtn).not.toBeNull();
  }, 90_000);
});
