import { readOrgCache, writeOrgCache } from '../config/storage';

const ORG_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Signed-in user login from the page meta; empty when logged out. */
export function getViewerLogin(): string | null {
  const el = document.querySelector('meta[name="user-login"]');
  const v = el?.getAttribute('content')?.trim();
  return v ? v : null;
}

/** Current repository as "owner/name" from the page meta. */
export function getRepoNwo(): string | null {
  const el = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');
  const v = el?.getAttribute('content')?.trim();
  return v && v.includes('/') ? v : null;
}

export function getRepoOwner(): string | null {
  const nwo = getRepoNwo();
  return nwo ? nwo.split('/')[0].toLowerCase() : null;
}

export function getRepoName(): string | null {
  const nwo = getRepoNwo();
  return nwo ? nwo.split('/')[1] : null;
}

export function isRepoPage(): boolean {
  return !!getRepoNwo();
}

/**
 * Extract organization logins from the HTML of /settings/organizations.
 * Tries DOM parsing first, then a regex fallback for raw HTML.
 */
export function parseOrgLogins(html: string): string[] {
  const found = new Set<string>();

  const addFromHref = (href: string | null | undefined): void => {
    if (!href) return;
    const path = href.split('?')[0].split('#')[0];
    let m = path.match(/^\/orgs\/([^/]+)/);
    if (m) {
      found.add(m[1].toLowerCase());
      return;
    }
    m = path.match(/^\/organizations\/([^/]+)/);
    if (m) {
      found.add(m[1].toLowerCase());
      return;
    }
    // Org profile links are just /{login}
    m = path.match(/^\/([A-Za-z0-9-]+)\/?$/);
    if (m && !isReservedPath(m[1])) {
      found.add(m[1].toLowerCase());
    }
  };

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const a of doc.querySelectorAll('a[href]')) {
      if (a.getAttribute('data-hovercard-type') === 'organization') {
        addFromHref(a.getAttribute('href'));
        continue;
      }
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/orgs/') || href.startsWith('/organizations/')) {
        addFromHref(href);
      }
    }
    for (const el of doc.querySelectorAll('[data-hovercard-url]')) {
      const u = el.getAttribute('data-hovercard-url') || '';
      const m = u.match(/^\/orgs\/([^/]+)/);
      if (m) found.add(m[1].toLowerCase());
    }
  } catch {
    /* DOMParser failed; fall through to regex */
  }

  // Regex fallback in case the DOM parser missed server-rendered markup.
  const re = /href="\/(?:orgs|organizations)\/([^/"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    found.add(m[1].toLowerCase());
  }

  return Array.from(found);
}

const RESERVED = new Set([
  'settings',
  'orgs',
  'organizations',
  'users',
  'topics',
  'collections',
  'sponsors',
  'notifications',
  'new',
  'login',
  'signup',
  'marketplace',
  'trending',
  'explore',
  'features',
  'pricing',
  'about',
  'site',
  'apps',
  'codespaces',
  'account',
  'search',
  'pulls',
  'issues',
  'dashboard',
  'enterprises',
  'customer-stories',
  'resources',
  'readme',
  'team',
  'enterprise',
  'blog',
  'contact',
  'security',
  'terms',
  'privacy',
  'github',
  'copilot',
  'solutions'
]);

function isReservedPath(s: string): boolean {
  return RESERVED.has(s.toLowerCase());
}

/** Fetch the signed-in user's organizations from GitHub settings. */
export async function fetchOrgLogins(): Promise<string[]> {
  const res = await fetch('/settings/organizations', {
    credentials: 'same-origin'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseOrgLogins(html);
}

export interface OrgInfo {
  viewer: string | null;
  orgs: string[];
  source: 'github' | 'cache' | 'error' | 'logged-out';
}

/**
 * Load organization info for the panel and for ownership checks.
 * Cached GitHub orgs (24h TTL) plus the user's manual additions.
 * Set `force` to bypass the cache.
 */
export async function loadOrgInfo(
  extra: readonly string[],
  force = false
): Promise<OrgInfo> {
  const viewer = getViewerLogin();
  if (!viewer) return { viewer: null, orgs: [], source: 'logged-out' };

  const now = Date.now();
  let cache = readOrgCache();
  let source: OrgInfo['source'] = 'cache';
  if (force || !cache || now - cache.fetchedAt > ORG_TTL_MS) {
    try {
      const logins = await fetchOrgLogins();
      cache = { logins, fetchedAt: now };
      writeOrgCache(cache);
      source = 'github';
    } catch {
      source = cache ? 'cache' : 'error';
    }
  }

  const set = new Set<string>();
  for (const l of cache?.logins ?? []) set.add(l.toLowerCase());
  for (const l of extra) {
    const v = l.trim().toLowerCase();
    if (v) set.add(v);
  }
  return { viewer, orgs: Array.from(set), source };
}

/** Effective organization set for ownership checks. */
export async function getEffectiveOrgs(
  extra: readonly string[]
): Promise<Set<string>> {
  const info = await loadOrgInfo(extra);
  return new Set(info.orgs);
}

/** Is the repo owner the signed-in user or one of their organizations? */
export function isOwnOrOrg(
  owner: string,
  viewer: string | null,
  orgs: ReadonlySet<string>
): boolean {
  const o = owner.toLowerCase();
  if (viewer && o === viewer.toLowerCase()) return true;
  return orgs.has(o);
}