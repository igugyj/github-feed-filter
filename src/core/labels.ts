import type { CategoryKey, Mode, SubMode } from '../types';

export interface CategoryDef {
  key: CategoryKey;
  label: string;
}

/** Activity categories shown in the panel, in display order (no star group). */
export const CATEGORIES: CategoryDef[] = [
  { key: 'merged', label: 'Merged pull requests' },
  { key: 'release', label: 'Releases' },
  { key: 'trending', label: 'Trending repositories' },
  { key: 'recommend', label: 'Recommended for you' },
  { key: 'popular', label: 'Popular among people you follow' },
  { key: 'created', label: 'Created repositories' },
  { key: 'fork', label: 'Forked repositories' },
  { key: 'publicRepo', label: 'Made public' },
  { key: 'follow', label: 'Follows' },
  { key: 'other', label: 'Other activity' }
];

export const STAR_GROUP: CategoryDef & {
  children: CategoryDef[];
} = {
  key: 'star',
  label: 'Stars & lists',
  children: [
    { key: 'star.starred', label: 'Starred repositories' },
    { key: 'star.list', label: 'Added to a list' }
  ]
};

export const RIGHT_ITEMS: { key: 'banner' | 'changelog'; label: string }[] = [
  { key: 'banner', label: 'Universe banner' },
  { key: 'changelog', label: 'Changelog' }
];

export interface ModeLabel {
  value: Mode;
  label: string;
}

export const MODE_LABELS: ModeLabel[] = [
  { value: 'show', label: 'Show' },
  { value: 'collapse', label: 'Collapse' },
  { value: 'hide', label: 'Hide' }
];

export const SUB_MODE_LABELS: { value: SubMode; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  ...MODE_LABELS
];

export function labelFor(key: CategoryKey): string {
  if (key === 'star.starred') return STAR_GROUP.children[0].label;
  if (key === 'star.list') return STAR_GROUP.children[1].label;
  if (key === 'star') return STAR_GROUP.label;
  const hit = CATEGORIES.find(c => c.key === key);
  return hit ? hit.label : 'Other activity';
}