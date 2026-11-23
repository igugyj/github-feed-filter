import type { Config, Mode } from '../types';
import {
  topLevelCards,
  classifyArticle,
  resolveMode,
  cardTimestamp
} from './classify';
import { labelFor } from './labels';
import { findKeyword } from './keywords';
import { applyCollapse, removeCollapse } from './collapse';

const END_MARKER_ID = 'gff-end-marker';

let currentCfg: Config | null = null;
let timeCutoffHit = false;
let autoObserver: IntersectionObserver | null = null;
let observedButton: Element | null = null;
let loadedPages = 0;
let lastClickAt = 0;

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function applyCardMode(el: Element, mode: Mode, label: string): void {
  if (mode === 'hide') {
    removeCollapse(el);
    el.classList.add('gff-hide');
  } else if (mode === 'collapse') {
    applyCollapse(el, label, () => {
      if (currentCfg) updateFeedCount(currentCfg);
    });
  } else {
    removeCollapse(el);
    el.classList.remove('gff-hide');
  }
}

function applyFeedCards(cfg: Config): void {
  const tf = cfg.timeFilter;
  const cutoff = tf.enabled && tf.days > 0 ? Date.now() - tf.days * 86400000 : null;
  const kw = cfg.keywords;
  const kwList = kw.enabled ? kw.list : [];

  timeCutoffHit = false;
  let oldCardFound = false;

  for (const el of topLevelCards(document)) {
    // Evaluate every card on its own: the feed is not guaranteed to be
    // strictly chronological, so one old card must not hide newer ones.
    if (cutoff !== null) {
      const ts = cardTimestamp(el);
      if (ts !== null && ts < cutoff) {
        oldCardFound = true;
        applyCardMode(el, 'hide', '');
        continue;
      }
    }

    const key = classifyArticle(el);
    let mode: Mode = resolveMode(cfg, key);
    let label = labelFor(key);

    // Keyword blocking takes precedence over the category mode.
    if (kwList.length > 0) {
      const hit = findKeyword(el.textContent || '', kwList);
      if (hit !== null) {
        mode = kw.mode;
        label = `Matched keyword: "${hit}"`;
      }
    }

    applyCardMode(el, mode, label);
  }

  timeCutoffHit = oldCardFound;
}

// Place the end marker at the bottom of the feed: right before the
// "More" form when it exists, otherwise as the last child of the feed
// content container. Re-checked on every apply because the marker may
// be created before the pagination form is rendered (it would then
// land at the top). Only moves the node when it is out of place, so
// the MutationObserver cannot loop.
function placeEndMarker(marker: Element, moreForm: Element | null, feedContent: Element | null): void {
  let parent: Element | null;
  let next: Element | null;
  if (moreForm && moreForm.parentElement) {
    parent = moreForm.parentElement;
    next = moreForm;
  } else if (feedContent) {
    parent = feedContent;
    next = null;
  } else {
    return;
  }
  if (marker.parentElement !== parent || marker.nextElementSibling !== next) {
    parent.insertBefore(marker, next);
  }
}

function applyTimeFilterUI(cfg: Config): void {
  const tf = cfg.timeFilter;
  const feedContent = document.querySelector('div[data-target="feed-container.content"]');
  // Scope the search to the feed: other ajax-pagination forms may exist
  // elsewhere on the page (higher up), which used to anchor the marker
  // near the top.
  const moreForm = feedContent ? feedContent.querySelector('form.js-ajax-pagination') : null;
  let marker = document.getElementById(END_MARKER_ID);

  const active = tf.enabled && timeCutoffHit;

  if (active) {
    if (!marker) {
      marker = document.createElement('div');
      marker.id = END_MARKER_ID;
      marker.className = 'gff-end-marker';
    }
    const text =
      'You’ve reached the end of the feed — items older than ' +
      tf.days +
      ' day' +
      (tf.days === 1 ? '' : 's') +
      ' are hidden.';
    setText(marker, text);
    placeEndMarker(marker, moreForm, feedContent);
    if (moreForm) moreForm.classList.add('gff-hide');
  } else {
    if (marker) marker.remove();
    if (moreForm) moreForm.classList.remove('gff-hide');
  }
}

function updateFeedCount(_cfg: Config): void {
  const el = document.getElementById('gff-count');
  if (!el) return;
  let n = 0;
  for (const card of topLevelCards(document)) {
    if (card.classList.contains('gff-hide')) {
      n++;
      continue;
    }
    if (card.classList.contains('gff-collapsed') && !card.classList.contains('gff-expanded')) n++;
  }
  const text = 'Hidden: ' + n + ' item' + (n === 1 ? '' : 's');
  setText(el, text);
}

function destroyAutoLoad(): void {
  if (autoObserver) autoObserver.disconnect();
  autoObserver = null;
  observedButton = null;
}

function armAutoLoad(cfg: Config): void {
  const feedContent = document.querySelector('div[data-target="feed-container.content"]');
  const btn = feedContent ? feedContent.querySelector('form.js-ajax-pagination button') : null;
  if (!cfg.autoLoad.enabled || !btn || timeCutoffHit) {
    destroyAutoLoad();
    return;
  }
  if (btn === observedButton) return;
  destroyAutoLoad();
  observedButton = btn;
  autoObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) maybeAutoClick(cfg);
    }
  }, { rootMargin: '240px' });
  autoObserver.observe(btn);
}

function maybeAutoClick(cfg: Config): void {
  const al = cfg.autoLoad;
  if (!al.enabled || timeCutoffHit || document.hidden) return;
  if (al.maxPages > 0 && loadedPages >= al.maxPages) return;
  const btn = observedButton;
  if (!btn || !btn.isConnected || (btn as HTMLButtonElement).disabled) return;
  const now = Date.now();
  if (now - lastClickAt < 800) return; // debounce double clicks
  lastClickAt = now;
  loadedPages++;
  (btn as HTMLElement).click();
}

/** Reset the auto-load page counter (called when the panel changes the limit). */
export function resetAutoLoadCount(): void {
  loadedPages = 0;
}

/** Apply the feed filter, time filter, auto-load and hidden count. */
export function applyFeed(cfg: Config): void {
  currentCfg = cfg;
  applyFeedCards(cfg);
  applyTimeFilterUI(cfg);
  armAutoLoad(cfg);
  updateFeedCount(cfg);
}

/** Called when the tab becomes visible again. */
export function onVisibilityChange(cfg: Config): void {
  if (!document.hidden) applyFeed(cfg);
}