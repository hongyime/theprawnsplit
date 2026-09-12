/** Covers the entire operation, including reading a response body. Aborting the
 * fetch releases network resources; the race also bounds a non-cooperative fetch. */
export async function withRequestDeadline<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Relay request timed out after 15 seconds"));
      controller.abort();
    }, 15_000);
  });
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
