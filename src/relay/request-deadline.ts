/** Covers the entire operation, including reading a response body. Aborting the
 * fetch releases network resources; the race also bounds a non-cooperative fetch. */
export async function withRequestDeadline<T>(request: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  if (parent?.aborted) throw parent.reason;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    abort = () => { reject(parent?.reason); controller.abort(parent?.reason); };
    parent?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      reject(new Error("Relay request timed out after 15 seconds"));
      controller.abort();
    }, 15_000);
  });
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
    controller.abort();
  }
}
