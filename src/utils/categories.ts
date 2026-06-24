// Shared category helpers. Categories are free-text on bets (often a football
// competition name), so we group "close" spellings together for browsing and
// for suggesting existing ones when creating a bet.

// The World Cup is featured as a special category and flagged "Trending" until
// the 2026 final (19 July 2026).
export const WORLD_CUP_KEY = 'worldcup';
export const WORLD_CUP_LABEL = 'World Cup';
export const WORLD_CUP_TRENDING_UNTIL = Date.UTC(2026, 6, 19, 23, 59, 59); // 2026-07-19

export function worldCupIsTrending(now = Date.now()) {
  return now <= WORLD_CUP_TRENDING_UNTIL;
}

export function cleanCategory(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

// Canonical key used to group close names: lowercase, strip everything that
// isn't a letter/number. So "Football", "football", "foot-ball" all collapse,
// and any competition containing "world cup" maps onto the World Cup feature.
export function categoryKey(raw: string) {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.includes('worldcup')) return WORLD_CUP_KEY;
  return key;
}

export interface CategoryGroup {
  key: string;
  label: string; // representative display name
  count: number;
  names: string[]; // all original spellings in this group
}

// Group raw category strings by canonical key. The representative label is the
// most frequent original spelling (ties broken by the longer, more specific one).
export function groupCategories(categories: string[]): CategoryGroup[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  categories.forEach((raw) => {
    const label = cleanCategory(raw);
    if (!label) return;
    const key = categoryKey(label);
    if (!key) return;
    const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    group.count += 1;
    group.spellings.set(label, (group.spellings.get(label) ?? 0) + 1);
    groups.set(key, group);
  });
  return Array.from(groups.entries())
    .map(([key, group]) => {
      const names = Array.from(group.spellings.keys());
      const label = key === WORLD_CUP_KEY
        ? WORLD_CUP_LABEL
        : Array.from(group.spellings.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
      return { key, label, count: group.count, names };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
