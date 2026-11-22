/**
 * URL matching with Tampermonkey-style globs:
 *  - `*` matches any sequence of characters (including `/`)
 *  - no `*` means exact match (trailing slash tolerated)
 */
export function matchesUrl(url: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern.includes('*')) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const re = new RegExp('^' + escaped + '$');
    return re.test(url);
  }
  return url === pattern || url === pattern + '/' || pattern === url + '/';
}

export function matchesAny(url: string, patterns: readonly string[]): boolean {
  return patterns.some(p => matchesUrl(url, p));
}