export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function allocate(total: bigint, weights: bigint[], eventId: string, pids: string[]): bigint[] {
  if (total < 0n) throw new Error("total must be non-negative");
  if (weights.length === 0) throw new Error("weights must not be empty");
  if (weights.length !== pids.length) throw new Error("weights and pids length mismatch");
  if (new Set(pids).size !== pids.length) throw new Error("pids must be unique");
  if (pids.some((pid) => pid.length === 0)) throw new Error("pids must be non-empty");
  if (weights.some((weight) => weight < 0n)) throw new Error("weights must be non-negative");

  const weightTotal = weights.reduce((a, b) => a + b, 0n);
  if (weightTotal === 0n) throw new Error("zero total weight");

  const base: bigint[] = [];
  const remainders: bigint[] = [];
  for (const weight of weights) {
    const numerator = total * weight;
    base.push(numerator / weightTotal);
    remainders.push(numerator % weightTotal);
  }

  const leftover = total - base.reduce((a, b) => a + b, 0n);
  const order = base.map((_, i) => i).sort((a, b) => {
    const remA = remainders[a];
    const remB = remainders[b];
    if (remA === undefined || remB === undefined) throw new Error("internal remainder mismatch");
    if (remA !== remB) return remB > remA ? 1 : -1;
    const hashA = fnv1a(`${eventId}${pids[a]}`);
    const hashB = fnv1a(`${eventId}${pids[b]}`);
    if (hashA !== hashB) return hashA - hashB;
    // Local codepoint tiebreak: money.ts stays import-free by design, and this
    // ordering must not depend on locale (CR-011).
    const pa = pids[a]!;
    const pb = pids[b]!;
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });

  for (let k = 0; k < Number(leftover); k += 1) {
    const index = order[k];
    if (index === undefined) throw new Error("allocation order exhausted");
    const current = base[index];
    if (current === undefined) throw new Error("allocation base mismatch");
    base[index] = current + 1n;
  }

  const sum = base.reduce((a, b) => a + b, 0n);
  if (sum !== total) throw new Error(`allocation invariant violated: ${sum} !== ${total}`);
  return base;
}
