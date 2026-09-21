// @vitest-environment jsdom
// FE-003: isolated real-DOM tests for the owned dialog keyboard lifecycle,
// (T14) plus a real Trip.svelte integration check that the wiring (T15)
// actually activates it for the Claim Participant dialog.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";
import { activateDialogLifecycle, type DialogLifecycleOptions } from "@/lib/dialog";

vi.mock("@/relay/sync", () => ({ syncOnce: vi.fn(async () => ({ published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0, snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [] })) }));
if (!(globalThis.crypto as Crypto).subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
if (!window.matchMedia) Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });

const { appendEvents, ensureGroup, resetRepositoryForTests } = await import("@/db/repo");
const { defaultParticipant } = await import("@/lib/events");
const { default: App } = await import("@/App.svelte");
function buildDialog(): { backdrop: HTMLDivElement; dialog: HTMLDivElement; first: HTMLButtonElement; last: HTMLButtonElement } {
  const backdrop = document.createElement("div");
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const first = document.createElement("button");
  first.textContent = "Cancel";
  const middle = document.createElement("input");
  const last = document.createElement("button");
  last.textContent = "Confirm";
  dialog.append(first, middle, last);
  backdrop.append(dialog);
  document.body.append(backdrop);
  return { backdrop, dialog, first, last };
}

function pressKey(key: string, options: { shiftKey?: boolean } = {}): boolean {
  const event = new KeyboardEvent("keydown", { key, shiftKey: options.shiftKey ?? false, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

let opener: HTMLButtonElement;
let pendingTeardowns: Array<() => void>;

/** Activates the lifecycle and registers its teardown so afterEach can always
 * clean it up, even when a test's own assertions fail before it calls
 * teardown itself — this is what prevents stale keydown listeners from one
 * test leaking into the next. */
function activate(dialog: HTMLElement, options?: DialogLifecycleOptions): () => void {
  const teardown = activateDialogLifecycle(dialog, options);
  pendingTeardowns.push(teardown);
  return teardown;
}

beforeEach(() => {
  document.body.textContent = "";
  pendingTeardowns = [];
  opener = document.createElement("button");
  opener.textContent = "Open Dialog";
  document.body.append(opener);
  opener.focus();
});
afterEach(() => {
  for (const teardown of pendingTeardowns) teardown();
  document.body.textContent = "";
});

describe("dialog keyboard lifecycle (FE-003)", () => {
  it("moves initial focus to the first focusable element inside the dialog", () => {
    const { dialog, first } = buildDialog();
    activate(dialog);
    expect(document.activeElement).toBe(first);
  });

  it("contains Tab within the dialog, wrapping from the last focusable element back to the first", () => {
    const { dialog, first, last } = buildDialog();
    activate(dialog);
    last.focus();
    const prevented = pressKey("Tab");
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("contains Shift+Tab within the dialog, wrapping from the first focusable element back to the last", () => {
    const { dialog, first, last } = buildDialog();
    activate(dialog);
    first.focus();
    const prevented = pressKey("Tab", { shiftKey: true });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("pulls focus back into the dialog if it somehow escaped to an outside element", () => {
    const { dialog, first } = buildDialog();
    activate(dialog);
    opener.focus(); // simulate focus escaping the dialog
    const prevented = pressKey("Tab");
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("invokes onEscape and prevents default when Escape is pressed", () => {
    const { dialog } = buildDialog();
    let escaped = 0;
    activate(dialog, { onEscape: () => { escaped += 1; } });
    const prevented = pressKey("Escape");
    expect(prevented).toBe(true);
    expect(escaped).toBe(1);
  });

  it("restores focus to the opener and stops handling keys after teardown", () => {
    const { dialog, last } = buildDialog();
    const teardown = activate(dialog);
    teardown();
    expect(document.activeElement).toBe(opener);
    last.focus();
    const prevented = pressKey("Tab");
    expect(prevented).toBe(false); // no longer trapped once torn down
  });

  it("does not throw when the opener has been removed from the DOM before teardown", () => {
    const { dialog } = buildDialog();
    const teardown = activate(dialog);
    opener.remove();
    expect(() => teardown()).not.toThrow();
  });

  it("is idempotent: calling teardown twice does not throw or double-remove listeners", () => {
    const { dialog } = buildDialog();
    const teardown = activate(dialog);
    teardown();
    expect(() => teardown()).not.toThrow();
  });

  it("supports a replaced dialog: activating a second lifecycle after the first is torn down traps focus in the new dialog only", () => {
    const { dialog: dialogA } = buildDialog();
    const teardownA = activate(dialogA);
    teardownA();
    const { dialog: dialogB, first: firstB, last: lastB } = buildDialog();
    activate(dialogB);
    expect(document.activeElement).toBe(firstB);
    lastB.focus();
    const prevented = pressKey("Tab");
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(firstB);
  });

  it("falls back to focusing the dialog itself when it has no focusable children", () => {
    const backdrop = document.createElement("div");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    backdrop.append(dialog);
    document.body.append(backdrop);
    activate(dialog);
    expect(document.activeElement).toBe(dialog);
  });
});

describe("dialog keyboard lifecycle integration (FE-003, T15 wiring)", () => {
  let instance: Record<string, unknown> | null = null;
  function renderApp(): void { instance = mount(App as never, { target: document.body }) as Record<string, unknown>; }
  afterEach(() => { if (instance) { try { unmount(instance as never); } catch { /* torn down */ } instance = null; } document.body.textContent = ""; });

  it("traps focus and Escape-closes the real Claim Participant dialog, restoring focus to the opener", async () => {
    await resetRepositoryForTests(`dialog-claim-render-${Date.now()}`);
    const group = await ensureGroup();
    const factory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    await appendEvents(group.groupId, [defaultParticipant(factory, "Alice")]);

    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });
    const card = await waitFor(() => { const el = document.querySelector<HTMLButtonElement>(".trip-card"); if (!el) throw new Error("no card"); return el; }, { timeout: 15000 });
    fireEvent.click(card);
    await waitFor(() => { if (!document.querySelector(".app-shell")) throw new Error("no shell"); }, { timeout: 15000 });

    const claimButton = await screen.findByTitle("Claim Participant", {}, { timeout: 15000 });
    claimButton.focus(); // fireEvent.click() alone doesn't reliably move focus in jsdom, unlike a real browser click
    fireEvent.click(claimButton);
    fireEvent.click(claimButton);

    const dialog = await waitFor(() => { const el = document.querySelector<HTMLElement>('.modal[role="dialog"][aria-label="Claim Participant"]'); if (!el) throw new Error("no claim dialog"); return el; }, { timeout: 15000 });
    // Initial focus lands inside the dialog (the lifecycle activated), not left on the trigger button.
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(claimButton);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => { if (document.querySelector('.modal[role="dialog"][aria-label="Claim Participant"]')) throw new Error("dialog still open"); }, { timeout: 15000 });
    // Escape closed the dialog (activeInstallLevel/claimCandidatePid path) and restored focus to the opener.
    expect(document.activeElement).toBe(claimButton);
  }, 30_000);
});
