export type Mode = 'show' | 'collapse' | 'hide';

export type SubMode = Mode | 'inherit';

export type CategoryKey =
  | 'merged'
  | 'release'
  | 'trending'
  | 'recommend'
  | 'popular'
  | 'created'
  | 'fork'
  | 'publicRepo'
  | 'follow'
  | 'other'
  | 'star'
  | 'star.starred'
  | 'star.list';

export interface Modes {
  merged: Mode;
  release: Mode;
  trending: Mode;
  recommend: Mode;
  popular: Mode;
  created: Mode;
  fork: Mode;
  publicRepo: Mode;
  follow: Mode;
  other: Mode;
  star: Mode;
  'star.starred': SubMode;
  'star.list': SubMode;
}

export type RightKey = 'banner' | 'changelog';

export interface Right {
  banner: Mode;
  changelog: Mode;
}

export interface Keywords {
  enabled: boolean;
  mode: Mode;
  list: string[];
}

export interface TimeFilter {
  enabled: boolean;
  days: number;
}

export interface AutoLoad {
  enabled: boolean;
  maxPages: number; // 0 = unlimited
}

export interface FeatureGate {
  enabled: boolean;
  urls: string[];
}

export interface StargazersFeature extends FeatureGate {
  onlyOwn: boolean;
  extraOrgs: string[];
}

export interface Config {
  version: 2;
  features: {
    feed: FeatureGate;
    rightColumn: FeatureGate;
    stargazers: StargazersFeature;
  };
  modes: Modes;
  right: Right;
  keywords: Keywords;
  timeFilter: TimeFilter;
  autoLoad: AutoLoad;
}

/** Cached list of organizations the signed-in user belongs to. */
export interface OrgCache {
  logins: string[];
  fetchedAt: number;
}