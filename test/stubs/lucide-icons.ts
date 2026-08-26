// Vitest-only stub for @lucide/svelte (CR-012): the package's precompiled
// .svelte icon components throw "$props before initialization" when mounted
// under vitest jsdom, killing the whole App subtree. Icons are irrelevant to
// these structural assertions, so every name renders nothing.
/* eslint-disable @typescript-eslint/no-explicit-any */
function icon(): any {
  const component = (_target: HTMLElement, _props?: Record<string, unknown>) => ({
    $destroy() {},
    $set() {},
    $on() {
      return () => {};
    },
  });
  (component as any).render = () => null;
  return component;
}

export const Download = icon();
export const Plus = icon();
export const ReceiptText = icon();
export const RefreshCcw = icon();
export const KeyRound = icon();
export const Link = icon();
export const QrCode = icon();
export const ShieldCheck = icon();
export const Trash2 = icon();
export const Upload = icon();
export const Users = icon();
export const WalletCards = icon();
export const Archive = icon();
export const GitMerge = icon();
export const Share2 = icon();
export const Settings = icon();
