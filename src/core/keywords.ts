/** Split a textarea value into non-empty keyword lines. */
export function parseKeywords(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/** Normalize whitespace and case for substring matching. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Return the first keyword matching the text (original casing), or null. */
export function findKeyword(text: string, keywords: readonly string[]): string | null {
  const norm = normalizeText(text);
  if (!norm) return null;
  for (const kw of keywords) {
    if (kw.length > 0 && norm.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

/** Case-insensitive substring match of any keyword against the text. */
export function matchesKeyword(text: string, keywords: readonly string[]): boolean {
  return findKeyword(text, keywords) !== null;
}