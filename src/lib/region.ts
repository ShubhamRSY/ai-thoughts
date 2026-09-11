/**
 * Region-aware Voices — surface takes in languages common to the reader's
 * continent first, without hiding the rest of the world.
 */

export type ContinentId =
  | "americas"
  | "europe"
  | "africa"
  | "asia"
  | "middle-east"
  | "oceania";

export const CONTINENTS: {
  id: ContinentId;
  label: string;
  languages: string[];
}[] = [
  {
    id: "americas",
    label: "Americas",
    languages: ["en", "es", "pt", "fr"],
  },
  {
    id: "europe",
    label: "Europe",
    languages: ["en", "de", "fr", "es", "it", "nl", "pl", "ro", "sv", "el", "uk", "ru", "tr", "pt"],
  },
  {
    id: "africa",
    label: "Africa",
    languages: ["en", "fr", "ar", "sw", "am", "ha", "pt"],
  },
  {
    id: "middle-east",
    label: "Middle East",
    languages: ["ar", "he", "fa", "tr", "en"],
  },
  {
    id: "asia",
    label: "Asia",
    languages: ["zh", "hi", "ja", "ko", "id", "ms", "th", "vi", "tl", "bn", "ta", "te", "mr", "gu", "pa", "ur", "en"],
  },
  {
    id: "oceania",
    label: "Oceania",
    languages: ["en", "id", "ms", "tl"],
  },
];

const TZ_HINTS: { match: RegExp; continent: ContinentId }[] = [
  { match: /^America\//, continent: "americas" },
  { match: /^Canada\//, continent: "americas" },
  { match: /^Brazil\//, continent: "americas" },
  { match: /^Chile\//, continent: "americas" },
  { match: /^Mexico\//, continent: "americas" },
  { match: /^Europe\//, continent: "europe" },
  { match: /^Atlantic\/(Reykjavik|Faroe|Canary)/, continent: "europe" },
  { match: /^Africa\//, continent: "africa" },
  { match: /^Asia\/(Riyadh|Dubai|Kuwait|Qatar|Bahrain|Muscat|Baghdad|Damascus|Beirut|Amman|Jerusalem|Gaza|Hebron|Tehran|Aden)/, continent: "middle-east" },
  { match: /^Asia\//, continent: "asia" },
  { match: /^Indian\//, continent: "asia" },
  { match: /^Australia\//, continent: "oceania" },
  { match: /^Pacific\//, continent: "oceania" },
];

const LANG_CONTINENT: Record<string, ContinentId> = {};
for (const c of CONTINENTS) {
  for (const lang of c.languages) {
    if (!LANG_CONTINENT[lang]) LANG_CONTINENT[lang] = c.id;
  }
}
// Prefer more specific homes for shared langs where helpful
LANG_CONTINENT.ar = "middle-east";
LANG_CONTINENT.he = "middle-east";
LANG_CONTINENT.fa = "middle-east";
LANG_CONTINENT.sw = "africa";
LANG_CONTINENT.hi = "asia";
LANG_CONTINENT.zh = "asia";
LANG_CONTINENT.ja = "asia";
LANG_CONTINENT.ko = "asia";
LANG_CONTINENT.es = "americas";
LANG_CONTINENT.pt = "americas";

export function continentOfLanguage(code?: string | null): ContinentId | null {
  if (!code) return null;
  const base = code.toLowerCase().split(/[-_]/)[0];
  return LANG_CONTINENT[base] ?? null;
}

export function continentLabel(id: ContinentId): string {
  return CONTINENTS.find((c) => c.id === id)?.label ?? id;
}

export function detectContinent(): ContinentId {
  if (typeof window === "undefined") return "americas";

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    for (const hint of TZ_HINTS) {
      if (hint.match.test(tz)) return hint.continent;
    }
  } catch {
    /* ignore */
  }

  const langs =
    typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : ["en"];

  for (const tag of langs) {
    const base = tag?.split("-")[0]?.toLowerCase();
    if (base && LANG_CONTINENT[base] && base !== "en") return LANG_CONTINENT[base];
  }

  return "americas";
}

/** Browser languages first, then regional languages for the continent. */
export function preferredLanguages(continent: ContinentId): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (code?: string | null) => {
    if (!code) return;
    const base = code.toLowerCase().split(/[-_]/)[0];
    if (!base || seen.has(base)) return;
    seen.add(base);
    out.push(base);
  };

  if (typeof navigator !== "undefined") {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of tags) push(tag);
  }

  const regional = CONTINENTS.find((c) => c.id === continent)?.languages ?? [];
  for (const lang of regional) push(lang);

  push("en");
  return out;
}

export function rankByRegion<T extends { language?: string | null }>(
  items: T[],
  preferred: string[]
): T[] {
  const rank = new Map(preferred.map((l, i) => [l, i]));
  return [...items].sort((a, b) => {
    const aBase = (a.language || "").toLowerCase().split(/[-_]/)[0];
    const bBase = (b.language || "").toLowerCase().split(/[-_]/)[0];
    const ar = rank.has(aBase) ? rank.get(aBase)! : 1000;
    const br = rank.has(bBase) ? rank.get(bBase)! : 1000;
    return ar - br;
  });
}
