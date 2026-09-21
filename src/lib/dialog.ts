/**
 * FE-003: one owned dialog keyboard lifecycle for the existing modal contract
 * (`role="dialog"` + `aria-modal="true"` divs in Trip.svelte) — initial focus,
 * tab containment, Escape, and focus restoration on teardown. No dependency;
 * each call owns exactly one dialog instance and its own cleanup.
 */

export interface DialogLifecycleOptions {
  /** Called when Escape is pressed while the dialog is active. */
  onEscape?: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(element: HTMLElement): boolean {
  return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true";
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Activate the lifecycle for `dialog`. Returns a teardown function that
 * restores focus to whatever had focus before activation. Safe to call
 * teardown more than once, and safe even if the prior opener element has
 * since been removed from the DOM.
 */
export function activateDialogLifecycle(dialog: HTMLElement, options: DialogLifecycleOptions = {}): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let active = true;

  const initial = focusableElements(dialog)[0] ?? dialog;
  if (!dialog.hasAttribute("tabindex") && initial === dialog) dialog.setAttribute("tabindex", "-1");
  initial.focus();

  function handleKeydown(event: KeyboardEvent): void {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      options.onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const current = document.activeElement;
    if (!current || !dialog.contains(current)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", handleKeydown, true);

  return function teardown(): void {
    if (!active) return;
    active = false;
    document.removeEventListener("keydown", handleKeydown, true);
    if (opener && document.contains(opener)) opener.focus();
  };
}

/**
 * Svelte action form for `use:dialogLifecycle={{ onEscape }}` on the actual
 * `role="dialog"` element. Re-runs are cheap: `update()` only swaps which
 * escape handler is live, it never re-steals initial focus or reattaches the
 * keydown listener — that only happens once, on mount, matching how a real
 * dialog should behave across reactive prop changes while it stays open.
 */
export function dialogLifecycle(node: HTMLElement, params: DialogLifecycleOptions = {}) {
  let current = params;
  const teardown = activateDialogLifecycle(node, { onEscape: () => current.onEscape?.() });
  return {
    update(next: DialogLifecycleOptions = {}) {
      current = next;
    },
    destroy() {
      teardown();
    },
  };
}
