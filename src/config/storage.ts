import type { Config, OrgCache } from '../types';
import { normalizeConfig, cloneDefault } from './defaults';

export const V2_KEY = 'gff-config-v2';
export const V1_KEY = 'gff-config-v1';
export const ORG_CACHE_KEY = 'gff-orgs-v1';

function gmGet(key: string): string | null {
  try {
    if (typeof GM_getValue === 'function') {
      const v = GM_getValue(key, null);
      return typeof v === 'string' ? v : v == null ? null : String(v);
    }
  } catch {
    /* fall through */
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function gmSet(key: string, value: string): void {
  try {
    if (typeof GM_setValue === 'function') {
      GM_setValue(key, value);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readJson(key: string): unknown {
  const raw = gmGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  gmSet(key, JSON.stringify(value));
}

/**
 * Load the config, migrating from v1 if necessary. The migrated config is
 * written back to the v2 key; the old v1 key is left untouched.
 */
export function loadConfig(): Config {
  let saved = readJson(V2_KEY);
  if (saved == null) {
    saved = readJson(V1_KEY);
  }
  const cfg = normalizeConfig(saved);
  // Persist the migrated v2 config so the next load is direct.
  if (saved != null) writeJson(V2_KEY, cfg);
  return cfg;
}

export function saveConfig(cfg: Config): void {
  writeJson(V2_KEY, cfg);
}

export function readOrgCache(): OrgCache | null {
  const raw = readJson(ORG_CACHE_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<OrgCache>;
  if (!Array.isArray(o.logins)) return null;
  return {
    logins: o.logins.filter((l): l is string => typeof l === 'string'),
    fetchedAt: typeof o.fetchedAt === 'number' ? o.fetchedAt : 0
  };
}

export function writeOrgCache(cache: OrgCache): void {
  writeJson(ORG_CACHE_KEY, cache);
}

export { cloneDefault };