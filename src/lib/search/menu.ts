// AC-2: matching of menu pages is pure and runs in the browser over the nav the user may see.

/** Lowercase, accent-free form used for comparing ("Studentët" -> "studentet"). */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export type MenuItem = { id: string; label: string; href: string; section: string | null };

/** Items whose label (or section heading) contains every word of the query; label hits first. */
export function matchMenu<T extends MenuItem>(items: readonly T[], query: string, limit = 8): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const label = normalize(item.label);
    const haystack = `${label} ${normalize(item.section ?? "")}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    const score = label.startsWith(words[0]!) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((s) => s.item);
}
