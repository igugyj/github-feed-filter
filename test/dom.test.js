// DOM-level smoke test using jsdom + example/Feed.htm
// Run: node test/dom.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const SAMPLE = path.join(__dirname, '..', 'example', 'Feed.htm');
const SCRIPT = path.join(__dirname, '..', 'github-feed-filter.user.js');
const STORAGE_KEY = 'gff-config-v1';
const html = fs.readFileSync(SAMPLE, 'utf8');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function boot(config, opts = {}) {
  const dom = new JSDOM(html, {
    url: 'https://github.com/feed',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  // jsdom windows have their own Date realm; patch it there for time tests.
  if (opts.now) window.Date.now = () => opts.now;
  // Minimal shims for APIs jsdom lacks / Tampermonkey provides.
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {} unobserve() {} disconnect() {}
  };
  const storage = {};
  if (config) storage[STORAGE_KEY] = JSON.stringify(config);
  window.GM_getValue = (k, d) => (k in storage ? storage[k] : d);
  window.GM_setValue = (k, v) => { storage[k] = v; };

  window.eval(fs.readFileSync(SCRIPT, 'utf8'));
  await sleep(150); // let rAF-scheduled apply() run
  return { dom, window, storage };
}

function cards(window) {
  return Array.from(
    window.document.querySelectorAll('article.js-feed-item-component')
  ).filter(el => !el.parentElement.closest('article.js-feed-item-component'));
}

const has = (el, cls) => el.classList.contains(cls);
const placeholders = (window) =>
  window.document.querySelectorAll('[data-gff-role="placeholder"]');

// Read card_type straight from data-hydro-view for precise selection.
function cardType(el) {
  try {
    const raw = el.getAttribute('data-hydro-view');
    if (!raw) return null;
    return JSON.parse(raw).payload.feed_card.card_type || null;
  } catch (e) { return null; }
}
const byType = (cs, type) => cs.filter(c => cardType(c) === type);

async function main() {
  // ---- 1. defaults: nothing filtered -------------------------------------
  {
    const { window } = await boot(null);
    const cs = cards(window);
    assert.strictEqual(cs.length, 85, 'expected 85 top-level cards');
    assert.strictEqual(cs.filter(c => has(c, 'gff-hide')).length, 0,
      'default must not hide anything');
    assert.strictEqual(cs.filter(c => has(c, 'gff-collapsed')).length, 0,
      'default must not collapse anything');
    assert.strictEqual(placeholders(window).length, 0);
    assert.ok(!window.document.getElementById('gff-end-marker'),
      'no end marker by default');
    assert.ok(window.document.getElementById('gff-trigger'),
      'settings trigger injected next to Feed title');
    // must sit in the right-hand controls group, right after the native
    // Filter button (not centred after the Feed title)
    const nativeFilter = window.document.getElementById('feed-filter-menu');
    assert.ok(nativeFilter, 'native Filter button present in sample');
    const trigger = window.document.getElementById('gff-trigger');
    const wrap = trigger.parentElement;             // .gff-wrap
    const toggle = nativeFilter.parentElement;      // <details-toggle>
    const controls = toggle.parentElement;          // right-hand flex group
    assert.strictEqual(wrap.parentElement, controls,
      'trigger wrap lives in the native Filter controls group');
    const kids = Array.from(controls.children);
    assert.strictEqual(kids.indexOf(wrap), kids.indexOf(toggle) + 1,
      'trigger immediately follows the native Filter button');
    // ... and NOT directly after the <h2>Feed</h2> title
    const title = window.document.querySelector(
      'h2[data-target="feed-container.feedTitle"]');
    assert.notStrictEqual(wrap.previousElementSibling, title,
      'trigger must not be placed right after the Feed title');
    assert.ok(window.document.getElementById('gff-panel').hidden,
      'panel starts hidden');
    assert.strictEqual(
      window.document.getElementById('gff-count').textContent,
      'Hidden: 0 items');
    window.close();
    console.log('[1] defaults: no filtering, UI injected: OK');
  }

  // ---- 2. hide mode -------------------------------------------------------
  {
    const { window } = await boot({ modes: { merged: 'hide' } });
    const cs = cards(window);
    const hidden = cs.filter(c => has(c, 'gff-hide'));
    assert.strictEqual(hidden.length, 34, 'all 34 merged cards hidden');
    // spot check: no release card hidden
    const releaseVisible = cs.filter(c =>
      !has(c, 'gff-hide') && /released|published/i.test(c.textContent));
    assert.ok(releaseVisible.length > 0, 'release cards stay visible');
    assert.strictEqual(placeholders(window).length, 0,
      'hide mode inserts no placeholder');
    window.close();
    console.log('[2] hide mode (merged=hide -> 34 hidden): OK');
  }

  // ---- 3. collapse mode + expand toggle ----------------------------------
  {
    const { window } = await boot({ modes: { release: 'collapse' } });
    const cs = cards(window);
    const collapsed = cs.filter(c => has(c, 'gff-collapsed'));
    assert.strictEqual(collapsed.length, 14, 'all 14 release cards collapsed');
    assert.strictEqual(collapsed.filter(c => has(c, 'gff-hide')).length, 0);
    assert.strictEqual(placeholders(window).length, 14,
      'one placeholder per collapsed card');
    assert.ok(!has(cs.find(c => has(c, 'gff-collapsed')), 'gff-expanded'));

    // click first placeholder -> expands its card
    const first = cs.find(c => has(c, 'gff-collapsed'));
    const ph = first.previousElementSibling;
    assert.ok(ph.dataset.gffRole === 'placeholder');
    assert.ok(/click to expand/.test(ph.textContent));
    ph.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.ok(has(first, 'gff-expanded'), 'click expands the card');
    assert.ok(/click to collapse/.test(ph.textContent),
      'placeholder label flips');
    // count excludes the expanded card now
    assert.strictEqual(window.document.getElementById('gff-count').textContent,
      'Hidden: 13 items');
    window.close();
    console.log('[3] collapse mode + expand toggle: OK');
  }

  // ---- 4. star group with inherit / override -----------------------------
  {
    const { window } = await boot({
      modes: { star: 'hide', 'star.list': 'collapse' }
    });
    const cs = cards(window);
    // 13 STARRED_REPOSITORY cards inherit group hide
    const starred = byType(cs, 'STARRED_REPOSITORY');
    assert.strictEqual(starred.length, 13, 'found 13 starred cards');
    assert.ok(starred.every(c => has(c, 'gff-hide')),
      'star.starred inherits group hide');
    // 4 ADDED_TO_LIST cards override with collapse
    const added = byType(cs, 'ADDED_TO_LIST');
    assert.strictEqual(added.length, 4, 'found 4 added-to-list cards');
    assert.ok(added.every(c => has(c, 'gff-collapsed') && !has(c, 'gff-hide')),
      'star.list override collapse wins over group hide');
    assert.strictEqual(placeholders(window).length, 4);
    window.close();
    console.log('[4] star group inherit + sub override: OK');
  }

  // ---- 5. right column: both hidden -> remove aside ----------------------
  {
    const { window } = await boot({ right: { banner: 'hide' } });
    let aside = window.document.querySelector('aside.feed-right-column');
    assert.ok(aside && !has(aside, 'gff-hide'),
      'only one hidden -> aside stays');
    const banner = aside.querySelector('.js-notice.marketing-banner');
    assert.ok(has(banner, 'gff-hide'), 'banner hidden');
    assert.ok(!has(aside.querySelector('.dashboard-changelog'), 'gff-hide'));
    window.close();

    const b2 = await boot({ right: { banner: 'hide', changelog: 'hide' } });
    aside = b2.window.document.querySelector('aside.feed-right-column');
    assert.ok(has(aside, 'gff-hide'), 'both hidden -> whole aside removed');
    b2.window.close();

    const b3 = await boot({ right: { banner: 'collapse', changelog: 'collapse' } });
    aside = b3.window.document.querySelector('aside.feed-right-column');
    assert.ok(!has(aside, 'gff-hide'),
      'collapse is not hide -> aside stays with placeholders');
    assert.strictEqual(placeholders(b3.window).length, 2);
    b3.window.close();
    console.log('[5] right column both-hide removes aside: OK');
  }

  // ---- 6. time filter: cutoff + end marker + More removed ----------------
  {
    // Sample timestamps are Nov 2026; force "now" far in the future so
    // every card is older than 3 days.
    const { window } = await boot(
      { timeFilter: { enabled: true, days: 3 } },
      { now: Date.parse('2026-12-15T00:00:00Z') }
    );
    const cs = cards(window);
    assert.strictEqual(cs.filter(c => has(c, 'gff-hide')).length, 85,
      'time filter hides every card past the threshold');
    const marker = window.document.getElementById('gff-end-marker');
    assert.ok(marker, 'end-of-feed marker inserted');
    assert.ok(/older than 3 days/.test(marker.textContent),
      'marker mentions the threshold');
    const more = window.document.querySelector('form.js-ajax-pagination');
    assert.ok(has(more, 'gff-hide'), '"More" button removed');
    window.close();

    // Same config but time filter OFF -> nothing time-hidden, More present.
    const b2 = await boot({ timeFilter: { enabled: false, days: 3 } });
    assert.strictEqual(cards(b2.window).filter(c => has(c, 'gff-hide')).length, 0);
    assert.ok(!b2.window.document.getElementById('gff-end-marker'));
    assert.ok(!has(b2.window.document.querySelector('form.js-ajax-pagination'),
      'gff-hide'), 'More button stays when time filter is off');
    b2.window.close();
    console.log('[6] time filter cutoff + end marker + More removal: OK');
  }

  // ---- 7. auto-load default off, limit default 30 ------------------------
  {
    const { window, storage } = await boot(null);
    const cfg = JSON.parse(storage[STORAGE_KEY] || 'null') ||
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    // defaults are not written until first save; panel reflects them instead
    const panel = window.document.getElementById('gff-panel');
    const autoload = panel.querySelector('#gff-autoload');
    const pages = panel.querySelector('#gff-autoload-pages');
    const time = panel.querySelector('#gff-time-enabled');
    const days = panel.querySelector('#gff-time-days');
    assert.strictEqual(autoload.checked, false, 'auto-load default unchecked');
    assert.strictEqual(pages.value, '30', 'page limit default 30');
    assert.strictEqual(time.checked, false, 'time filter default unchecked');
    assert.strictEqual(days.value, '3', 'days default 3');
    window.close();
    console.log('[7] defaults in panel (time off/3d, autoload off/30): OK');
  }

  // ---- 8. panel interaction: toggle a mode, persists to storage ----------
  {
    const { window, storage } = await boot(null);
    const trigger = window.document.getElementById('gff-trigger');
    trigger.click();
    assert.ok(!window.document.getElementById('gff-panel').hidden,
      'panel opens on click');

    // click "Hide" on the "Merged pull requests" row
    const seg = window.document.querySelector(
      '.gff-seg button[data-key="merged"][data-value="hide"]');
    assert.ok(seg, 'merged Hide button present');
    seg.click();
    await sleep(50);

    const saved = JSON.parse(storage[STORAGE_KEY]);
    assert.strictEqual(saved.modes.merged, 'hide', 'mode persisted');
    assert.strictEqual(cards(window).filter(c => has(c, 'gff-hide')).length, 34,
      'UI click applies filtering immediately');

    // Reset restores defaults
    const reset = window.document.querySelector('.gff-reset');
    reset.click();
    await sleep(50);
    assert.strictEqual(cards(window).filter(c => has(c, 'gff-hide')).length, 0,
      'reset clears filtering');
    const saved2 = JSON.parse(storage[STORAGE_KEY]);
    assert.strictEqual(saved2.modes.merged, 'show');
    window.close();
    console.log('[8] panel interaction + persistence + reset: OK');
  }

  // ---- 9. unknown card_type falls back to "other" ------------------------
  {
    const { window } = await boot({ modes: { other: 'hide' } });
    // No card should be classified 'other' in this sample -> nothing hidden
    assert.strictEqual(cards(window).filter(c => has(c, 'gff-hide')).length, 0,
      'sample has no unmatched cards; other=hide hides nothing');
    window.close();
    console.log('[9] fallback category behaves: OK');
  }

  console.log('\nAll DOM tests passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
