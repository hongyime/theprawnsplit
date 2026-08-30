// @vitest-environment jsdom
// CR-012 Task 2 pilot — converted from source-text regex to a real render.
// Harness note: we mount with Svelte 5 native mount() instead of
// @testing-library/svelte (its wrapper crashed with "Cannot access props
// before initialization" on this legacy-mode component under vitest).
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
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

const { appendEvents, ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { defaultParticipant } = await import("@/lib/events");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp(): void {
  instance = mount(App as never, { target: document.body }) as Record<string, unknown>;
}

beforeEach(() => {
  document.body.textContent = "";
});

afterEach(() => {
  if (instance) {
    try { unmount(instance as never); } catch { /* already torn down */ }
    instance = null;
  }
});

describe("reconciliation banner (rendered)", () => {
  it("renders the duplicate hint with Merge / Not same actions when a trip with same-named participants is opened", { timeout: 60_000 }, async () => {
    await resetRepositoryForTests(`reconcile-render-${Date.now()}`);
    const group = await ensureGroup();
    const factory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const first = defaultParticipant(factory, "Dana");
    factory.nextCounter += 1;
    const second = defaultParticipant(factory, "dana "); // normalizes to the same name
    await appendEvents(group.groupId, [first, second]);

    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });

    const card = document.querySelector<HTMLButtonElement>(".trip-card");
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    await screen.findByText(/may be the same as/, {}, { timeout: 15000 });

    const merge = screen.getByRole("button", { name: "Merge" }) as HTMLButtonElement;
    const notSame = screen.getByRole("button", { name: "Not Same" });
    expect(merge.disabled).toBe(false);
    expect(notSame).toBeTruthy();
  });
});
