/** Count UTF-8 wire bytes before decoding. The enclosing request deadline also
 * covers a stalled body. At most one delivered chunk can cross this threshold. */
export async function boundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) throw new Error("Empty relay response");
  const reader = body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error("Relay response exceeds its transfer limit");
      chunks.push(next.value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}
