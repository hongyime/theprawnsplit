// @vitest-environment jsdom
// CR-012 Task 2 pilot — converted from source-text regex to a real render.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { mount, unmount } from "svelte";
import { webcrypto } from "node:crypto";

vi.mock("@/relay/sync", () => ({
  syncOnce: vi.fn(async () => ({
    published: 0,
    confirmed: 0,
    received: 0,
    buffered: 0,
    dropped: 0,
    snapshotsPublished: 0,
    snapshotsSeen: 0,
    errors: [],
    diagnostics: [],
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
const { defaultParticipant, makeEvent } = await import("@/lib/events");
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
    try {
      unmount(instance as never);
    } catch {
      /* torn down */
    }
    instance = null;
  }
});

describe("settlement rows (rendered)", () => {
  it("renders a recorded settlement as cash-unconfirmable with Dispute/Void and no Confirm", async () => {
    await resetRepositoryForTests(`settle-render-${Date.now()}`);
    const group = await ensureGroup();
    const factory = { deviceId: group.deviceId, nextCounter: group.nextCounter };
    const alice = defaultParticipant(factory, "Alice");
    factory.nextCounter += 1;
    const bob = defaultParticipant(factory, "Bob");
    factory.nextCounter += 1;
    const alicePid = (alice as { pid?: string }).pid ?? "";
    const bobPid = (bob as { pid?: string }).pid ?? "";
    const expense = makeEvent(factory, "ExpenseAdded", {
      xid: "x-render",
      financials: {
        minor: 3000n,
        payers: [{ pid: alicePid, minor: 3000n }],
        shares: [
          { pid: bobPid, minor: 1500n },
          { pid: alicePid, minor: 1500n },
        ],
      },
      desc: "Dinner",
      at: 1,
      date: "2026-08-25",
    });
    factory.nextCounter += 1;
    const settlement = makeEvent(factory, "SettlementRecorded", { sid: "s1", from: bobPid, to: alicePid, minor: 1000n });
    await appendEvents(group.groupId, [alice, bob, expense, settlement]);

    renderApp();
    await screen.findByText("Your Trips", {}, { timeout: 15000 });

    const card = await waitFor(
      () => {
        const el = document.querySelector<HTMLButtonElement>(".trip-card");
        if (!el) throw new Error("trip card not rendered yet");
        return el;
      },
      { timeout: 15000 },
    );
    fireEvent.click(card);
    await waitFor(
      () => {
        if (!document.querySelector(".app-shell")) throw new Error("app shell not open yet");
      },
      { timeout: 15000 },
    );

    // Rendered settlement row appears once fold completes. querySelector +
    // textContent sees descendant elements, unlike TL text-node matching.
    const row = await waitFor(() => {
      const el = document.querySelector(".settlement-row");
      if (!el || !(el.textContent ?? "").includes("USD 10.00")) throw new Error("settlement row not rendered yet");
      return el;
    }, { timeout: 20000 });

    expect(row).not.toBeNull();
    expect(row.textContent).toContain("USD 10.00");
    expect(row.textContent).toContain("cash");
    expect(row!.textContent).toContain("cash");

    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    const dispute = screen.getByRole("button", { name: "Dispute" }) as HTMLButtonElement;
    expect(dispute.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Void" })).not.toBeNull();
  }, 90_000);
});
