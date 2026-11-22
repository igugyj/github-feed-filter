import type { Config, Mode, Modes, SubMode } from '../types';

const MODES_SET = new Set<string>(['show', 'collapse', 'hide']);
const SUB_MODES_SET = new Set<string>(['show', 'collapse', 'hide', 'inherit']);

const DEFAULT_MODES: Modes = {
  merged: 'show',
  release: 'show',
  trending: 'show',
  recommend: 'show',
  popular: 'show',
  created: 'show',
  fork: 'show',
  publicRepo: 'show',
  follow: 'show',
  other: 'show',
  star: 'show',
  'star.starred': 'inherit',
  'star.list': 'inherit'
};

export function cloneDefault(): Config {
  return {
    version: 2,
    features: {
      feed: { enabled: true, urls: ['https://github.com/feed*'] },
      rightColumn: { enabled: true, urls: ['https://github.com/'] },
      stargazers: {
        enabled: true,
        urls: ['https://github.com/*/*'],
        onlyOwn: true,
        extraOrgs: []
      }
    },
    modes: { ...DEFAULT_MODES },
    right: { banner: 'show', changelog: 'show' },
    keywords: { enabled: false, mode: 'hide', list: [] },
    timeFilter: { enabled: false, days: 3 },
    autoLoad: { enabled: false, maxPages: 30 }
  };
}

function sanitizeMode(value: unknown, fallback: Mode): Mode {
  return typeof value === 'string' && MODES_SET.has(value)
    ? (value as Mode)
    : fallback;
}

function sanitizeSubMode(value: unknown, fallback: SubMode): SubMode {
  return typeof value === 'string' && SUB_MODES_SET.has(value)
    ? (value as SubMode)
    : fallback;
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Merge a saved config (v1 or v2) with the defaults, producing a valid
 * v2 Config. v1 configs (modes/right/timeFilter/autoLoad only) are migrated
 * automatically; the new features/keywords fields get default values.
 */
export function normalizeConfig(saved: unknown): Config {
  const def = cloneDefault();
  if (!saved || typeof saved !== 'object') return def;
  const s = saved as Record<string, any>;

  const out = cloneDefault();

  // modes
  if (s.modes && typeof s.modes === 'object') {
    const m = s.modes as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_MODES) as (keyof Modes)[]) {
      if (key === 'star.starred' || key === 'star.list') {
        out.modes[key] = sanitizeSubMode(m[key], DEFAULT_MODES[key]);
      } else {
        out.modes[key] = sanitizeMode(m[key], DEFAULT_MODES[key]);
      }
    }
  }

  // right column
  if (s.right && typeof s.right === 'object') {
    const r = s.right as Record<string, unknown>;
    out.right.banner = sanitizeMode(r.banner, def.right.banner);
    out.right.changelog = sanitizeMode(r.changelog, def.right.changelog);
  }

  // time filter
  if (s.timeFilter && typeof s.timeFilter === 'object') {
    const t = s.timeFilter as Record<string, unknown>;
    out.timeFilter.enabled = t.enabled === true;
    const days = Number(t.days);
    out.timeFilter.days = Number.isFinite(days) && days >= 1 ? Math.min(days, 3650) : def.timeFilter.days;
  }

  // auto-load
  if (s.autoLoad && typeof s.autoLoad === 'object') {
    const a = s.autoLoad as Record<string, unknown>;
    out.autoLoad.enabled = a.enabled === true;
    const pages = Number(a.maxPages);
    out.autoLoad.maxPages = Number.isFinite(pages) && pages >= 0 ? Math.floor(pages) : def.autoLoad.maxPages;
  }

  // keywords (v2)
  if (s.keywords && typeof s.keywords === 'object') {
    const k = s.keywords as Record<string, unknown>;
    out.keywords.enabled = k.enabled === true;
    out.keywords.mode = sanitizeMode(k.mode, def.keywords.mode);
    const list = sanitizeStringArray(k.list);
    if (list) out.keywords.list = list;
  }

  // features (v2)
  if (s.features && typeof s.features === 'object') {
    const f = s.features as Record<string, any>;
    if (f.feed && typeof f.feed === 'object') {
      out.features.feed.enabled = f.feed.enabled !== false;
      const urls = sanitizeStringArray(f.feed.urls);
      if (urls) out.features.feed.urls = urls;
    }
    if (f.rightColumn && typeof f.rightColumn === 'object') {
      out.features.rightColumn.enabled = f.rightColumn.enabled !== false;
      const urls = sanitizeStringArray(f.rightColumn.urls);
      if (urls) out.features.rightColumn.urls = urls;
    }
    if (f.stargazers && typeof f.stargazers === 'object') {
      out.features.stargazers.enabled = f.stargazers.enabled !== false;
      const urls = sanitizeStringArray(f.stargazers.urls);
      if (urls) out.features.stargazers.urls = urls;
      out.features.stargazers.onlyOwn = f.stargazers.onlyOwn !== false;
      const extra = sanitizeStringArray(f.stargazers.extraOrgs);
      if (extra) out.features.stargazers.extraOrgs = extra;
    }
  }

  out.version = 2;
  return out;
}