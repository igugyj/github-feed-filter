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

/** Case-insensitive substring match of any keyword against the text. */
export function matchesKeyword(text: string, keywords: readonly string[]): boolean {
  const norm = normalizeText(text);
  if (!norm) return false;
  return keywords.some(kw => kw.length > 0 && norm.includes(kw.toLowerCase()));
}