// @vitest-environment jsdom
// CR-013 Task 2. Same harness as manual-fallback-ui.test.ts pilot (CR-012).
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";

vi.mock("@/relay/sync", () => ({ syncOnce: vi.fn(async () => ({ published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0, snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [] })) }));
if (!(globalThis.crypto as Crypto).subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
if (!window.matchMedia) Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });

const { createJoinSeed, ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { buildJoinLink } = await import("@/lib/join-link");
const { default: App } = await import("@/App.svelte");

let instance: Record<string, unknown> | null = null;
function renderApp() { instance = mount(App as never, { target: document.body }) as Record<string, unknown>; }
beforeEach(() => { document.body.textContent = ""; });
afterEach(() => { if (instance) { try { unmount(instance as never); } catch {} instance = null; } });

describe("join recovery boundary (rendered)", () => {
  it("blocks participant creation and shows waiting copy until recovered data arrives", async () => {
    // Donor device has GroupCreated; joining device starts empty — this is the real-world model.
    await resetRepositoryForTests(`join-donor-${Date.now()}`);
    const donor = await ensureGroup();
    const link = buildJoinLink("https://app.test/", createJoinSeed(donor));
    const frag = link.slice(link.indexOf("#") + 1);

    await resetRepositoryForTests(`join-joiner-${Date.now()}`);
    window.location.hash = frag; // joinBlocked = true on this device

    renderApp();

    // Recovery panel appears instead of empty roster.
    await screen.findByText("Waiting for recovered trip data.", {}, { timeout: 15000 });

    // Participant creation is blocked (Add submit button disabled).
    const addBtn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (addBtn) expect(addBtn.disabled).toBe(true);

    // Retry sync action is present.
    const retryBtns = [...document.querySelectorAll("button")].filter((b) => /Retry|Recovering/i.test(b.textContent ?? ""));
    expect(retryBtns.length).toBeGreaterThan(0);
  }, 90_000);
});
