import type { CategoryKey, Mode, Modes } from '../types';

export interface FeedCard {
  card_type?: string;
  resource_relationship?: string;
  created_at?: string;
}

/**
 * Classify a feed card from its data-hydro-view payload.
 * Pure function; returns the category key used by the modes map.
 */
export function classifyCard(card: FeedCard | null | undefined): CategoryKey {
  if (!card || typeof card.card_type !== 'string') return 'other';
  const rel = card.resource_relationship || '';
  switch (card.card_type) {
    case 'MERGED_PULL_REQUEST':
      return 'merged';
    case 'RELEASE':
      return 'release';
    case 'TRENDING_REPOSITORY':
      return 'trending';
    case 'REPOSITORY_RECOMMENDATION':
      return rel === 'FOLLOWED' ? 'popular' : 'recommend';
    case 'STARRED_REPOSITORY':
      return 'star.starred';
    case 'ADDED_TO_LIST':
      return 'star.list';
    case 'CREATED_REPOSITORY':
      return 'created';
    case 'FORKED_REPOSITORY':
      return 'fork';
    case 'PRIVATE_TO_PUBLIC_REPOSITORY':
      return 'publicRepo';
    case 'FOLLOW':
      return 'follow';
    default:
      return 'other';
  }
}

/**
 * Text fallback when data-hydro-view is missing or unparsable.
 * Uses simple keyword heuristics on the lowercased card text.
 */
export function classifyByText(text: string): CategoryKey {
  const s = (text || '').toLowerCase();
  if (/added a repository to/.test(s)) return 'star.list';
  if (/\bstarred\b/.test(s)) return 'star.starred';
  if (/forked a repository/.test(s)) return 'fork';
  if (/made this repository public/.test(s)) return 'publicRepo';
  if (/created a repository/.test(s)) return 'created';
  if (/released|published \d* ?release/.test(s)) return 'release';
  if (/trending repositories/.test(s)) return 'trending';
  if (/recommended for you/.test(s)) return 'recommend';
  if (/popular projects among/.test(s)) return 'popular';
  if (/followed\b/.test(s)) return 'follow';
  if (/contributed to|merged/.test(s)) return 'merged';
  return 'other';
}

/**
 * Resolve the effective mode for a category key, honouring 'inherit' on
 * the star sub-items (they fall back to the group mode).
 */
export function resolveMode(cfg: { modes: Modes }, key: CategoryKey): Mode {
  if (key === 'star.starred' || key === 'star.list') {
    const own = cfg.modes[key];
    if (own && own !== 'inherit') return own as Mode;
    return cfg.modes.star || 'show';
  }
  return (cfg.modes[key] as Mode) || 'show';
}

/** Parse the data-hydro-view attribute of an article into its feed_card. */
export function readFeedCard(article: Element): FeedCard | null {
  const raw = article.getAttribute('data-hydro-view');
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as {
      payload?: { feed_card?: FeedCard };
    };
    return (obj && obj.payload && obj.payload.feed_card) || null;
  } catch {
    return null;
  }
}

export function classifyArticle(article: Element): CategoryKey {
  const card = readFeedCard(article);
  if (card && typeof card.card_type === 'string') return classifyCard(card);
  return classifyByText(article.textContent || '');
}

/**
 * Top-level card = an article that is not nested inside another feed card.
 * (Grouped cards like "starred 3 repositories" nest child articles.)
 */
export function isTopLevelCard(el: Element): boolean {
  return (
    el.tagName === 'ARTICLE' &&
    !!el.classList.contains('js-feed-item-component') &&
    !el.parentElement?.closest('article.js-feed-item-component')
  );
}

export function topLevelCards(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('article.js-feed-item-component')).filter(
    isTopLevelCard
  );
}

/**
 * Timestamp shown on the card itself. Prefer the card's own header
 * `relative-time` so nested repository sections cannot contribute an
 * unrelated timestamp. Cards without a visible timestamp (recommendations,
 * trending, ...) have no reliable age, so they are ignored by the time
 * filter instead of falling back to `feed_card.created_at`, which is often
 * a batch/creation date.
 */
export function cardTimestamp(article: Element): number | null {
  const ownHeader = Array.from(article.querySelectorAll('header')).find(
    h => h.closest('article.js-feed-item-component') === article
  );
  const headerRt = ownHeader
    ? ownHeader.querySelector('relative-time[datetime]')
    : null;
  const own = headerRt || Array.from(article.querySelectorAll('relative-time[datetime]')).find(
    rt => rt.closest('article.js-feed-item-component') === article
  );
  if (!own) return null;
  const t = Date.parse(own.getAttribute('datetime') || '');
  return Number.isNaN(t) ? null : t;
}
