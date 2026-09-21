// @vitest-environment jsdom
// FE-003: isolated real-DOM tests for the owned dialog keyboard lifecycle,
// independent of any specific Trip.svelte dialog (that wiring is T15).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activateDialogLifecycle, type DialogLifecycleOptions } from "@/lib/dialog";

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
