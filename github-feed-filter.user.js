// ==UserScript==
// @name         GitHub Feed Filter
// @name:zh-CN   GitHub Feed 过滤器
// @namespace    https://github.com/igugyj/github-feed-filter
// @version      1.0.1
// @description  Filter, collapse or hide GitHub feed cards by type, age the feed with time cutoff and auto-load. Fully configurable.
// @description:zh-CN  按类型屏蔽/折叠/隐藏 GitHub Feed 卡片，支持时间截断与自动加载，全部可配置。
// @author       Pfolg
// @license      MIT
// @homepageURL  https://github.com/igugyj/github-feed-filter
// @supportURL   https://github.com/igugyj/github-feed-filter/issues
// @match        https://github.com/feed*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ======================================================================
   * 1. Configuration model
   * ==================================================================== */

  const STORAGE_KEY = 'gff-config-v1';

  // Modes: 'show' (do not filter) | 'collapse' | 'hide'
  // Sub keys under "star" may also be 'inherit' (follow the group mode).
  const DEFAULT_CONFIG = {
    modes: {
      merged: 'show',        // MERGED_PULL_REQUEST
      release: 'show',       // RELEASE
      trending: 'show',      // TRENDING_REPOSITORY
      recommend: 'show',     // REPOSITORY_RECOMMENDATION + STARRED/CONTRIBUTED
      popular: 'show',       // REPOSITORY_RECOMMENDATION + FOLLOWED
      created: 'show',       // CREATED_REPOSITORY
      fork: 'show',          // FORKED_REPOSITORY
      publicRepo: 'show',    // PRIVATE_TO_PUBLIC_REPOSITORY
      follow: 'show',        // FOLLOW
      other: 'show',         // any unmatched card_type (fallback)
      star: 'show',          // group header for starred / added-to-list
      'star.starred': 'inherit', // STARRED_REPOSITORY
      'star.list': 'inherit'     // ADDED_TO_LIST
    },
    right: {
      banner: 'show',        // .js-notice.marketing-banner (Universe banner)
      changelog: 'show'      // .dashboard-changelog
    },
    timeFilter: {
      enabled: false,        // checkbox, off by default
      days: 3                // threshold in days
    },
    autoLoad: {
      enabled: false,        // checkbox, off by default
      maxPages: 30           // safety limit; 0 = unlimited
    }
  };

  // Activity categories shown in the panel, in display order.
  const CATEGORIES = [
    { key: 'merged',      label: 'Merged pull requests' },
    { key: 'release',     label: 'Releases' },
    { key: 'trending',    label: 'Trending repositories' },
    { key: 'recommend',   label: 'Recommended for you' },
    { key: 'popular',     label: 'Popular among people you follow' },
    { key: 'created',     label: 'Created repositories' },
    { key: 'fork',        label: 'Forked repositories' },
    { key: 'publicRepo',  label: 'Made public' },
    { key: 'follow',      label: 'Follows' },
    { key: 'other',       label: 'Other activity' }
  ];

  const STAR_GROUP = {
    key: 'star',
    label: 'Stars & lists',
    children: [
      { key: 'star.starred', label: 'Starred repositories' },
      { key: 'star.list',    label: 'Added to a list' }
    ]
  };

  const RIGHT_ITEMS = [
    { key: 'banner',    label: 'Universe banner' },
    { key: 'changelog', label: 'Changelog' }
  ];

  const MODE_LABELS = [
    { value: 'show',     label: 'Show' },
    { value: 'collapse', label: 'Collapse' },
    { value: 'hide',     label: 'Hide' }
  ];

  const SUB_MODE_LABELS = [
    { value: 'inherit', label: 'Inherit' },
    ...MODE_LABELS
  ];

  function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  function mergeConfig(saved) {
    const def = cloneDefault();
    if (!saved || typeof saved !== 'object') return def;
    return {
      modes: Object.assign(def.modes, saved.modes || {}),
      right: Object.assign(def.right, saved.right || {}),
      timeFilter: Object.assign(def.timeFilter, saved.timeFilter || {}),
      autoLoad: Object.assign(def.autoLoad, saved.autoLoad || {})
    };
  }

  function loadConfig() {
    let raw = null;
    try {
      if (typeof GM_getValue === 'function') raw = GM_getValue(STORAGE_KEY, null);
    } catch (e) { /* ignore */ }
    if (raw == null) {
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
    if (!raw) return cloneDefault();
    try { return mergeConfig(JSON.parse(raw)); } catch (e) { return cloneDefault(); }
  }

  function saveConfig() {
    const raw = JSON.stringify(config);
    try {
      if (typeof GM_setValue === 'function') { GM_setValue(STORAGE_KEY, raw); return; }
    } catch (e) { /* fall through */ }
    try { localStorage.setItem(STORAGE_KEY, raw); } catch (e) { /* ignore */ }
  }

  let config = loadConfig();

  /* ======================================================================
   * 2. Classification — pure functions (also exported for offline tests)
   *
   * Data source: each feed card is an <article class="js-feed-item-component">
   * whose data-hydro-view attribute holds (HTML-escaped) JSON:
   *   { payload: { feed_card: { card_type, resource_relationship,
   *                             created_at, gatherer, ... } } }
   * ==================================================================== */

  function classifyCard(card) {
    if (!card || typeof card.card_type !== 'string') return 'other';
    const rel = card.resource_relationship || '';
    switch (card.card_type) {
      case 'MERGED_PULL_REQUEST':          return 'merged';
      case 'RELEASE':                      return 'release';
      case 'TRENDING_REPOSITORY':          return 'trending';
      case 'REPOSITORY_RECOMMENDATION':
        return rel === 'FOLLOWED' ? 'popular' : 'recommend';
      case 'STARRED_REPOSITORY':           return 'star.starred';
      case 'ADDED_TO_LIST':                return 'star.list';
      case 'CREATED_REPOSITORY':           return 'created';
      case 'FORKED_REPOSITORY':            return 'fork';
      case 'PRIVATE_TO_PUBLIC_REPOSITORY': return 'publicRepo';
      case 'FOLLOW':                       return 'follow';
      default:                             return 'other';
    }
  }

  // Text fallback when data-hydro-view is missing or unparsable.
  function classifyByText(text) {
    const s = (text || '').toLowerCase();
    if (/added a repository to/.test(s))  return 'star.list';
    if (/\bstarred\b/.test(s))            return 'star.starred';
    if (/forked a repository/.test(s))    return 'fork';
    if (/made this repository public/.test(s)) return 'publicRepo';
    if (/created a repository/.test(s))   return 'created';
    if (/released|published \d* ?release/.test(s)) return 'release';
    if (/trending repositories/.test(s))  return 'trending';
    if (/recommended for you/.test(s))    return 'recommend';
    if (/popular projects among/.test(s)) return 'popular';
    if (/followed\b/.test(s))             return 'follow';
    if (/contributed to|merged/.test(s))  return 'merged';
    return 'other';
  }

  // Resolve the effective mode for a category key, honouring 'inherit'
  // on the star sub-items.
  function resolveMode(cfg, key) {
    if (key === 'star.starred' || key === 'star.list') {
      const own = cfg.modes[key];
      if (own && own !== 'inherit') return own;
      return cfg.modes.star || 'show';
    }
    return cfg.modes[key] || 'show';
  }

  function labelFor(key) {
    if (key === 'star.starred') return STAR_GROUP.children[0].label;
    if (key === 'star.list')    return STAR_GROUP.children[1].label;
    if (key === 'star')         return STAR_GROUP.label;
    const hit = CATEGORIES.find(c => c.key === key);
    return hit ? hit.label : 'Other activity';
  }

  // Parse the data-hydro-view attribute of an article into its feed_card.
  function readFeedCard(article) {
    const raw = article.getAttribute('data-hydro-view');
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return (obj && obj.payload && obj.payload.feed_card) || null;
    } catch (e) {
      return null;
    }
  }

  function classifyArticle(article) {
    const card = readFeedCard(article);
    if (card && typeof card.card_type === 'string') return classifyCard(card);
    return classifyByText(article.textContent || '');
  }

  // Top-level card = an article that is not nested inside another feed card.
  // (Grouped cards like "starred 3 repositories" nest child articles.)
  function isTopLevelCard(el) {
    return el.tagName === 'ARTICLE' &&
      !!el.classList.contains('js-feed-item-component') &&
      !el.parentElement.closest('article.js-feed-item-component');
  }

  function topLevelCards(root) {
    return Array.from(root.querySelectorAll('article.js-feed-item-component'))
      .filter(isTopLevelCard);
  }

  // Best-effort timestamp for a card: its own relative-time, else any
  // descendant relative-time, else feed_card.created_at.
  function cardTimestamp(article) {
    const rt = article.querySelector('relative-time[datetime]');
    if (rt) {
      const t = Date.parse(rt.getAttribute('datetime'));
      if (!Number.isNaN(t)) return t;
    }
    const card = readFeedCard(article);
    if (card && card.created_at) {
      const t = Date.parse(card.created_at);
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEFAULT_CONFIG, CATEGORIES, STAR_GROUP, RIGHT_ITEMS,
      classifyCard, classifyByText, resolveMode, mergeConfig, cloneDefault
    };
    // In a test (Node) context there is no DOM; stop before the runtime.
    if (typeof document === 'undefined') return;
  }

  /* ======================================================================
   * 3. Styles
   * ==================================================================== */

  const STYLE_ID = 'gff-style';

  const CSS = `
.gff-hide { display: none !important; }
.gff-collapsed:not(.gff-expanded) { display: none !important; }

.gff-placeholder {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; margin: 4px 0;
  border: 1px dashed var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  background: var(--bgColor-muted, rgba(175,184,193,.2));
  color: var(--fgColor-muted, #656d76);
  font-size: 12px; cursor: pointer; user-select: none;
}
.gff-placeholder:hover { border-color: var(--fgColor-muted, #656d76); }
.gff-placeholder::before { content: "\\25B8"; font-size: 10px; }
.gff-placeholder.gff-expanded::before { content: "\\25BE"; }

.gff-end-marker {
  padding: 24px 16px; text-align: center;
  color: var(--fgColor-muted, #656d76);
  font-size: 14px;
  border-top: 1px solid var(--borderColor-muted, #d8dee4);
  margin-top: 8px;
}

.gff-trigger { margin-left: 8px; }

.gff-wrap { position: relative; display: inline-block; }

.gff-panel {
  position: absolute; top: calc(100% + 6px); right: 0;
  width: 360px; max-height: 75vh; overflow-y: auto;
  z-index: 1000;
  padding: 12px 14px;
  background: var(--bgColor-default, #fff);
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(140,149,159,.25);
  font-size: 13px;
  color: var(--fgColor-default, #1f2328);
  text-align: left;
}
.gff-panel[hidden] { display: none; }

.gff-panel h3 {
  margin: 10px 0 6px; font-size: 12px; font-weight: 600;
  color: var(--fgColor-muted, #656d76);
  text-transform: uppercase; letter-spacing: .04em;
}
.gff-panel h3:first-child { margin-top: 0; }

.gff-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 3px 0;
}
.gff-row-label { flex: 1; min-width: 0; }
.gff-row-label small {
  display: block; color: var(--fgColor-muted, #656d76); font-size: 11px;
}

.gff-seg {
  display: inline-flex; flex-shrink: 0;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px; overflow: hidden;
}
.gff-seg button {
  padding: 2px 9px; font-size: 12px; line-height: 18px;
  background: transparent; border: 0; cursor: pointer;
  color: var(--fgColor-muted, #656d76);
}
.gff-seg button + button { border-left: 1px solid var(--borderColor-default, #d0d7de); }
.gff-seg button:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }
.gff-seg button.gff-active {
  background: var(--bgColor-accent-emphasis, #0969da);
  color: var(--fgColor-onEmphasis, #fff);
  font-weight: 600;
}

.gff-group-toggle {
  background: transparent; border: 0; cursor: pointer; padding: 0 4px;
  color: var(--fgColor-muted, #656d76); font-size: 10px;
}
.gff-sub { padding-left: 14px; border-left: 2px solid var(--borderColor-muted, #d8dee4); margin-left: 3px; }
.gff-sub[hidden] { display: none; }

.gff-check-row {
  display: flex; align-items: center; gap: 7px; padding: 4px 0;
  cursor: pointer;
}
.gff-check-row input { cursor: pointer; }
.gff-num {
  width: 56px; padding: 2px 5px; font-size: 12px;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  background: var(--bgColor-default, #fff);
  color: var(--fgColor-default, #1f2328);
}
.gff-hint { color: var(--fgColor-muted, #656d76); font-size: 11px; }

.gff-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-top: 10px; padding-top: 8px;
  border-top: 1px solid var(--borderColor-muted, #d8dee4);
  color: var(--fgColor-muted, #656d76); font-size: 12px;
}
.gff-reset {
  padding: 3px 10px; font-size: 12px; cursor: pointer;
  background: transparent;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  color: var(--fgColor-default, #1f2328);
}
.gff-reset:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }
`;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ======================================================================
   * 4. Filtering engine
   * ==================================================================== */

  const END_MARKER_ID = 'gff-end-marker';
  let timeCutoffHit = false; // set during apply(); stops auto-load

  function ensurePlaceholder(el, label) {
    let ph = el.previousElementSibling;
    if (!(ph && ph.dataset.gffRole === 'placeholder')) {
      ph = document.createElement('div');
      ph.dataset.gffRole = 'placeholder';
      ph.className = 'gff-placeholder';
      ph.addEventListener('click', () => {
        const expanded = el.classList.toggle('gff-expanded');
        ph.classList.toggle('gff-expanded', expanded);
        ph.textContent = placeholderText(label, expanded);
        updateCount();
      });
      el.parentElement.insertBefore(ph, el);
    }
    if (!el.classList.contains('gff-expanded')) {
      ph.textContent = placeholderText(label, false);
      ph.classList.remove('gff-expanded');
    } else {
      ph.textContent = placeholderText(label, true);
      ph.classList.add('gff-expanded');
    }
    return ph;
  }

  function placeholderText(label, expanded) {
    return expanded
      ? label + ' — click to collapse'
      : label + ' — collapsed, click to expand';
  }

  function removePlaceholder(el) {
    const ph = el.previousElementSibling;
    if (ph && ph.dataset.gffRole === 'placeholder') ph.remove();
  }

  function applyCardMode(el, mode, key) {
    if (mode === 'hide') {
      el.classList.add('gff-hide');
      el.classList.remove('gff-collapsed');
      removePlaceholder(el);
    } else if (mode === 'collapse') {
      el.classList.remove('gff-hide');
      el.classList.add('gff-collapsed');
      ensurePlaceholder(el, labelFor(key));
    } else { // show
      el.classList.remove('gff-hide', 'gff-collapsed', 'gff-expanded');
      removePlaceholder(el);
    }
  }

  function applyFeedCards() {
    const tf = config.timeFilter;
    const cutoff = (tf.enabled && tf.days > 0)
      ? Date.now() - tf.days * 86400000
      : null;

    timeCutoffHit = false;
    let cutoffReached = false;

    for (const el of topLevelCards(document)) {
      // --- time cutoff (takes precedence, feed is chronological) ---
      if (cutoff !== null) {
        if (!cutoffReached) {
          const ts = cardTimestamp(el);
          if (ts !== null && ts < cutoff) cutoffReached = true;
        }
        if (cutoffReached) {
          timeCutoffHit = true;
          applyCardMode(el, 'hide', classifyArticle(el));
          continue;
        }
      }
      // --- category mode ---
      const key = classifyArticle(el);
      applyCardMode(el, resolveMode(config, key), key);
    }
  }

  // Place the end marker at the bottom of the feed: right before the
  // "More" form when it exists, otherwise as the last child of the feed
  // content container. Re-checked on every apply because the marker may
  // be created before the pagination form is rendered (it would then
  // land at the top). Only moves the node when it is out of place, so
  // the MutationObserver cannot loop.
  function placeEndMarker(marker, moreForm, feedContent) {
    let parent, next;
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

  function applyTimeFilterUI() {
    const tf = config.timeFilter;
    const feedContent =
      document.querySelector('div[data-target="feed-container.content"]');
    // Scope the search to the feed: other ajax-pagination forms may exist
    // elsewhere on the page (higher up), which used to anchor the marker
    // near the top.
    const moreForm = feedContent
      ? feedContent.querySelector('form.js-ajax-pagination')
      : null;
    let marker = document.getElementById(END_MARKER_ID);

    const active = tf.enabled && timeCutoffHit;

    if (active) {
      if (!marker) {
        marker = document.createElement('div');
        marker.id = END_MARKER_ID;
        marker.className = 'gff-end-marker';
      }
      marker.textContent =
        'You’ve reached the end of the feed — items older than ' +
        tf.days + ' day' + (tf.days === 1 ? '' : 's') + ' are hidden.';
      placeEndMarker(marker, moreForm, feedContent);
      if (moreForm) moreForm.classList.add('gff-hide');
    } else {
      if (marker) marker.remove();
      if (moreForm) moreForm.classList.remove('gff-hide');
    }
  }

  function applyRightColumn() {
    const aside = document.querySelector('aside.feed-right-column');
    if (!aside) return;
    let visibleParts = 0;
    for (const item of RIGHT_ITEMS) {
      const sel = item.key === 'banner'
        ? '.js-notice.marketing-banner'
        : '.dashboard-changelog';
      const el = aside.querySelector(sel);
      if (!el) continue;
      applyCardMode(el, config.right[item.key] || 'show', item.key);
      if ((config.right[item.key] || 'show') !== 'hide') visibleParts++;
    }
    // Both big elements hidden -> remove the whole aside as well.
    aside.classList.toggle('gff-hide', visibleParts === 0);
  }

  function updateCount() {
    const el = document.getElementById('gff-count');
    if (!el) return;
    let n = 0;
    for (const card of topLevelCards(document)) {
      if (card.classList.contains('gff-hide')) { n++; continue; }
      if (card.classList.contains('gff-collapsed') &&
          !card.classList.contains('gff-expanded')) n++;
    }
    el.textContent = 'Hidden: ' + n + ' item' + (n === 1 ? '' : 's');
  }

  let applyScheduled = false;
  function apply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      applyFeedCards();
      applyTimeFilterUI();
      applyRightColumn();
      armAutoLoad();
      updateCount();
    });
  }

  /* ======================================================================
   * 5. Auto-load (auto-expand) — clicks the "More" button automatically
   *    when it scrolls into view, until the limit / cutoff / no button.
   * ==================================================================== */

  let autoObserver = null;
  let observedButton = null;
  let loadedPages = 0;
  let lastClickAt = 0;

  function destroyAutoLoad() {
    if (autoObserver) autoObserver.disconnect();
    autoObserver = null;
    observedButton = null;
  }

  function armAutoLoad() {
    const feedContent =
      document.querySelector('div[data-target="feed-container.content"]');
    const btn = feedContent
      ? feedContent.querySelector('form.js-ajax-pagination button')
      : null;
    if (!config.autoLoad.enabled || !btn || timeCutoffHit) {
      destroyAutoLoad();
      return;
    }
    if (btn === observedButton) return;
    destroyAutoLoad();
    observedButton = btn;
    autoObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) maybeAutoClick();
      }
    }, { rootMargin: '240px' });
    autoObserver.observe(btn);
  }

  function maybeAutoClick() {
    const al = config.autoLoad;
    if (!al.enabled || timeCutoffHit || document.hidden) return;
    if (al.maxPages > 0 && loadedPages >= al.maxPages) return;
    const btn = observedButton;
    if (!btn || !btn.isConnected || btn.disabled) return;
    const now = Date.now();
    if (now - lastClickAt < 800) return; // debounce double clicks
    lastClickAt = now;
    loadedPages++;
    btn.click();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) apply();
  });

  /* ======================================================================
   * 6. Settings panel UI — injected next to the "Feed" heading
   * ==================================================================== */

  const TRIGGER_ID = 'gff-trigger';
  const PANEL_ID = 'gff-panel';
  let panelRef = null;

  function segControl(scope, key, current, labels) {
    const wrap = document.createElement('span');
    wrap.className = 'gff-seg';
    for (const opt of labels) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.dataset.scope = scope;
      b.dataset.key = key;
      b.dataset.value = opt.value;
      if (opt.value === current) b.classList.add('gff-active');
      wrap.appendChild(b);
    }
    return wrap;
  }

  function row(labelText, control, sub) {
    const r = document.createElement('div');
    r.className = 'gff-row';
    const l = document.createElement('span');
    l.className = 'gff-row-label';
    l.textContent = labelText;
    r.appendChild(l);
    r.appendChild(control);
    if (sub) r.appendChild(sub);
    return r;
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'gff-panel';
    panel.hidden = true;

    const h1 = document.createElement('h3');
    h1.textContent = 'Feed filters';
    panel.appendChild(h1);

    for (const cat of CATEGORIES) {
      panel.appendChild(row(
        cat.label,
        segControl('modes', cat.key, config.modes[cat.key], MODE_LABELS)
      ));
    }

    // --- Stars & lists group (3-way group switch + inheritable children) ---
    const groupRow = document.createElement('div');
    groupRow.className = 'gff-row';
    const groupLabel = document.createElement('span');
    groupLabel.className = 'gff-row-label';
    groupLabel.textContent = STAR_GROUP.label;
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'gff-group-toggle';
    expandBtn.textContent = '\u25B8';
    expandBtn.title = 'Show sub-types';
    groupRow.appendChild(groupLabel);
    groupRow.appendChild(expandBtn);
    groupRow.appendChild(
      segControl('modes', 'star', config.modes.star, MODE_LABELS)
    );
    panel.appendChild(groupRow);

    const subWrap = document.createElement('div');
    subWrap.className = 'gff-sub';
    subWrap.hidden = true;
    for (const child of STAR_GROUP.children) {
      subWrap.appendChild(row(
        child.label,
        segControl('modes', child.key, config.modes[child.key], SUB_MODE_LABELS)
      ));
    }
    panel.appendChild(subWrap);
    expandBtn.addEventListener('click', () => {
      subWrap.hidden = !subWrap.hidden;
      expandBtn.textContent = subWrap.hidden ? '\u25B8' : '\u25BE';
    });

    // --- Right column ---
    const h2 = document.createElement('h3');
    h2.textContent = 'Right column';
    panel.appendChild(h2);
    for (const item of RIGHT_ITEMS) {
      panel.appendChild(row(
        item.label,
        segControl('right', item.key, config.right[item.key], MODE_LABELS)
      ));
    }
    const bothHint = document.createElement('div');
    bothHint.className = 'gff-hint';
    bothHint.textContent = 'Hiding both removes the whole Explore sidebar.';
    panel.appendChild(bothHint);

    // --- Time filter ---
    const h3 = document.createElement('h3');
    h3.textContent = 'Time filter';
    panel.appendChild(h3);

    const tfRow = document.createElement('label');
    tfRow.className = 'gff-check-row';
    const tfCheck = document.createElement('input');
    tfCheck.type = 'checkbox';
    tfCheck.id = 'gff-time-enabled';
    tfCheck.checked = !!config.timeFilter.enabled;
    const tfLabel = document.createElement('span');
    tfLabel.textContent = 'Hide items older than ';
    const tfNum = document.createElement('input');
    tfNum.type = 'number';
    tfNum.className = 'gff-num';
    tfNum.id = 'gff-time-days';
    tfNum.min = '1';
    tfNum.max = '3650';
    tfNum.value = String(config.timeFilter.days);
    tfNum.disabled = !config.timeFilter.enabled;
    const tfUnit = document.createElement('span');
    tfUnit.textContent = ' day(s)';
    tfRow.appendChild(tfCheck);
    tfRow.appendChild(tfLabel);
    tfRow.appendChild(tfNum);
    tfRow.appendChild(tfUnit);
    panel.appendChild(tfRow);

    const tfHint = document.createElement('div');
    tfHint.className = 'gff-hint';
    tfHint.textContent = 'Older cards are removed from the bottom and the "More" button is dropped.';
    panel.appendChild(tfHint);

    tfCheck.addEventListener('change', () => {
      config.timeFilter.enabled = tfCheck.checked;
      tfNum.disabled = !tfCheck.checked;
      saveConfig();
      apply();
    });
    tfNum.addEventListener('change', () => {
      let v = parseInt(tfNum.value, 10);
      if (Number.isNaN(v) || v < 1) v = 1;
      if (v > 3650) v = 3650;
      tfNum.value = String(v);
      config.timeFilter.days = v;
      saveConfig();
      apply();
    });

    // --- Loading ---
    const h4 = document.createElement('h3');
    h4.textContent = 'Loading';
    panel.appendChild(h4);

    const alRow = document.createElement('label');
    alRow.className = 'gff-check-row';
    const alCheck = document.createElement('input');
    alCheck.type = 'checkbox';
    alCheck.id = 'gff-autoload';
    alCheck.checked = !!config.autoLoad.enabled;
    const alLabel = document.createElement('span');
    alLabel.textContent = 'Auto-load feed (auto-expand while scrolling)';
    alRow.appendChild(alCheck);
    alRow.appendChild(alLabel);
    panel.appendChild(alRow);

    const alRow2 = document.createElement('label');
    alRow2.className = 'gff-check-row';
    const alNum = document.createElement('input');
    alNum.type = 'number';
    alNum.className = 'gff-num';
    alNum.id = 'gff-autoload-pages';
    alNum.min = '0';
    alNum.value = String(config.autoLoad.maxPages);
    alNum.disabled = !config.autoLoad.enabled;
    const alLabel2 = document.createElement('span');
    alLabel2.textContent = 'Page limit (0 = unlimited)';
    alRow2.appendChild(alNum);
    alRow2.appendChild(alLabel2);
    panel.appendChild(alRow2);

    alCheck.addEventListener('change', () => {
      config.autoLoad.enabled = alCheck.checked;
      alNum.disabled = !alCheck.checked;
      loadedPages = 0;
      saveConfig();
      apply();
    });
    alNum.addEventListener('change', () => {
      let v = parseInt(alNum.value, 10);
      if (Number.isNaN(v) || v < 0) v = 0;
      alNum.value = String(v);
      config.autoLoad.maxPages = v;
      loadedPages = 0;
      saveConfig();
      apply();
    });

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'gff-footer';
    const count = document.createElement('span');
    count.id = 'gff-count';
    count.textContent = 'Hidden: 0 items';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'gff-reset';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      config = cloneDefault();
      saveConfig();
      rebuildPanel();
      apply();
    });
    footer.appendChild(count);
    footer.appendChild(reset);
    panel.appendChild(footer);

    // --- Delegated mode switching ---
    panel.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.gff-seg button');
      if (!btn) return;
      const { scope, key, value } = btn.dataset;
      config[scope][key] = value;
      // reflect in the segmented control
      for (const b of btn.parentElement.children) {
        b.classList.toggle('gff-active', b === btn);
      }
      saveConfig();
      apply();
    });

    return panel;
  }

  function rebuildPanel() {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    panelRef = buildPanel();
    wrapRef.appendChild(panelRef);
  }

  let wrapRef = null;

  function injectUI() {
    if (document.getElementById(TRIGGER_ID)) return;
    const title = document.querySelector('h2[data-target="feed-container.feedTitle"]') ||
      Array.from(document.querySelectorAll('h2'))
        .find(h => h.textContent.trim() === 'Feed');
    if (!title) return;

    ensureStyles();

    const wrap = document.createElement('span');
    wrap.className = 'gff-wrap';
    wrapRef = wrap;

    const trigger = document.createElement('button');
    trigger.id = TRIGGER_ID;
    trigger.type = 'button';
    trigger.className = 'btn btn-sm gff-trigger';
    trigger.textContent = 'Filter settings';
    trigger.addEventListener('click', (ev) => {
      ev.stopPropagation();
      panelRef.hidden = !panelRef.hidden;
    });
    wrap.appendChild(trigger);

    panelRef = buildPanel();
    wrap.appendChild(panelRef);

    // Place the trigger directly next to the native Filter button
    // (the right-hand controls group), not after the Feed title where
    // flex-justify-between would centre it.
    const nativeFilter = document.querySelector('details#feed-filter-menu');
    if (nativeFilter && nativeFilter.parentElement) {
      nativeFilter.parentElement.insertAdjacentElement('afterend', wrap);
    } else if (title.nextElementSibling) {
      title.nextElementSibling.appendChild(wrap);
    } else {
      title.insertAdjacentElement('afterend', wrap);
    }

    // Close panel on outside click / Escape.
    document.addEventListener('click', (ev) => {
      if (!panelRef || panelRef.hidden) return;
      if (!wrap.contains(ev.target)) panelRef.hidden = true;
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && panelRef && !panelRef.hidden) {
        panelRef.hidden = true;
      }
    });
  }

  /* ======================================================================
   * 7. Bootstrap — run on load, react to turbo/DOM changes
   * ==================================================================== */

  function bootstrap() {
    injectUI();
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

  // GitHub feeds are turbo-driven and paginate via AJAX; watch the DOM.
  let observerTimer = null;
  const domObserver = new MutationObserver(() => {
    injectUI(); // idempotent
    if (observerTimer) clearTimeout(observerTimer);
    observerTimer = setTimeout(apply, 100);
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  for (const evt of ['turbo:load', 'turbo:frame-load', 'pjax:end']) {
    document.addEventListener(evt, () => setTimeout(apply, 0));
  }
})();
