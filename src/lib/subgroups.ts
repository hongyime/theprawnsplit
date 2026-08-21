export interface SubgroupPreset {
  id: string;
  name: string;
  pids: string[];
}

export function normalizeSubgroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function normalizeSubgroupPids(pids: Iterable<string>, validPids: Iterable<string>): string[] {
  const valid = new Set(validPids);
  return [...new Set([...pids].filter((pid) => valid.has(pid)))].sort();
}

export function upsertSubgroupPreset(
  presets: SubgroupPreset[] | undefined,
  preset: SubgroupPreset,
  validPids: Iterable<string>,
): SubgroupPreset[] {
  const name = normalizeSubgroupName(preset.name);
  const pids = normalizeSubgroupPids(preset.pids, validPids);
  if (!name || pids.length === 0) return presets ?? [];
  const next = { ...preset, name, pids };
  const existing = presets ?? [];
  return [...existing.filter((candidate) => candidate.id !== preset.id), next].sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteSubgroupPreset(presets: SubgroupPreset[] | undefined, id: string): SubgroupPreset[] {
  return (presets ?? []).filter((preset) => preset.id !== id);
}

export function applySubgroupSelection(preset: Pick<SubgroupPreset, "pids">, participantPids: string[]): Record<string, boolean> {
  const selected = new Set(preset.pids);
  return Object.fromEntries(participantPids.map((pid) => [pid, selected.has(pid)]));
}
