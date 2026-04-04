/**
 * Parses admin input like "1-50", "1, 2, 3", or "1-5,10,12-14" into unique unit number strings.
 */
export function parseUnitRangeInput(input: string): string[] {
  const raw = input.trim();
  if (!raw) return [];

  const out = new Set<string>();
  const segments = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const rangeMatch = segment.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (end < start) continue;
      for (let i = start; i <= end; i++) {
        out.add(String(i));
      }
      continue;
    }
    out.add(segment);
  }

  return [...out].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === a && String(nb) === b) {
      return na - nb;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}
