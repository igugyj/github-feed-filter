// Source-module tests: drive src/ directly inside jsdom so c8 records
// coverage for the runtime modules. (test/dom.test.ts runs the bundled
// output, which V8 reports as a single eval and therefore contributes no
// source coverage.)
// Run: npm run test:coverage
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let passed = 0;
async function ok(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`[ok] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    throw err;
  }
}

// ---- fixtures -------------------------------------------------------------

function hydro(card: object): string {
  return JSON.stringify({ payload: { feed_card: card } })
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

const OLD = new Date(Date.now() - 10 * 86400000).toISOString();
const NEW = new Date(Date.now() - 60000).toISOString();

function card(type: string, text: string, time = NEW): string {
  return (
    `<article class="js-feed-item-component" data-hydro-view="${hydro({
      card_type: type,
      created_at: time
    })}"><relative-time datetime="${time}"></relative-time><p>${text}</p></article>`
  );
}

function feedHtml(): string {
  return `<!doctype html><html><head>
<meta name="user-login" content="Pfolg">
</head><body>
<div id="gff-count">Hidden: 0 items</div>
<div data-target="feed-container.content">
  <article class="js-feed-item-component" data-hydro-view="${hydro({
    card_type: 'STARRED_REPOSITORY',
    created_at: NEW
  })}"><p>erin starred 2 repositories</p>
    <article class="js-feed-item-component" data-hydro-view="${hydro({
      card_type: 'STARRED_REPOSITORY',
      created_at: NEW
    })}"><p>nested star</p></article>
  </article>
  ${card('MERGED_PULL_REQUEST', 'alice merged pull request A', OLD)}
  ${card('MERGED_PULL_REQUEST', 'bob merged pull request B', OLD)}
  ${card('RELEASE', 'carol released v1.0', OLD)}
  ${card('CREATED_REPOSITORY', 'dave created a repository', OLD)}
  <form class="js-ajax-pagination"><button type="button">More</button></form>
</div>
<aside class="feed-right-column">
  <div class="js-notice marketing-banner">Universe banner</div>
  <div class="dashboard-changelog">Changelog</div>
</aside>
</body></html>`;
}

function repoHtml(): string {
  return `<!doctype html><html><head>
<meta name="user-login" content="Pfolg">
<meta name="octolytics-dimension-repository_nwo" content="Pfolg/demo">
</head><body>
<ul data-testid="repo-header-actions">
  <li><a data-testid="fork-button" data-component="Button" href="/Pfolg/demo/fork">
    <svg viewBox="0 0 16 16"></svg>
    <span data-component="text">Fork</span>
  </a></li>
</ul>
</body></html>`;
}

const ORG_HTML = `<div>
  <a data-hovercard-type="organization" href="/orgs/acme">Acme</a>
</div>`;

// ---- environment ----------------------------------------------------------

class IOStub {
  static instances: IOStub[] = [];
  cb: (entries: { isIntersecting: boolean }[]) => void;
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    this.cb = cb;
    IOStub.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  fire(): void {
    this.cb([{ isIntersecting: true }]);
  }
}

interface Env {
  window: JSDOM['window'];
  store: Map<string, string>;
  menu: { name: string; fn: () => void }[];
}

function install(html: string, url: string): Env {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const w = dom.window as unknown as Record<string, any>;
  const g = globalThis as unknown as Record<string, any>;

  g.window = w;
  g.document = w.document;
  g.location = w.location;
  g.Node = w.Node;
  g.MutationObserver = w.MutationObserver;
  g.DOMParser = w.DOMParser;
  g.requestAnimationFrame = w.requestAnimationFrame.bind(w);
  g.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
  g.IntersectionObserver = IOStub;

  const store = new Map<string, string>();
  g.GM_getValue = (k: string, d: unknown) => (store.has(k) ? store.get(k) : d);
  g.GM_setValue = (k: string, v: unknown) => {
    store.set(k, String(v));
  };
  const menu: { name: string; fn: () => void }[] = [];
  g.GM_registerMenuCommand = (name: string, fn: () => void) => {
    menu.push({ name, fn });
  };
  g.fetch = async () => ({ ok: true, status: 200, text: async () => ORG_HTML });

  return { window: dom.window, store, menu };
}

function fire(el: Element, type: string): void {
  const w = (globalThis as unknown as Record<string, any>).window;
  el.dispatchEvent(new w.Event(type, { bubbles: true }));
}

const topCards = (): Element[] =>
  Array.from(document.querySelectorAll('article.js-feed-item-component')).filter(
    el => !el.parentElement?.closest('article.js-feed-item-component')
  );

// ---- boot the feed page ---------------------------------------------------

// The document must exist before panel.ts is imported: it registers a
// document-level keydown listener at module scope.
const env = install(feedHtml(), 'https://github.com/feed');

const styles = await import('../src/ui/styles');
const panel = await import('../src/ui/panel');
const feed = await import('../src/core/feed');
const rightColumn = await import('../src/core/right-column');
const defaults = await import('../src/config/defaults');
const stargazers = await import('../src/core/stargazers');
const ownership = await import('../src/core/ownership');

// ---- styles ---------------------------------------------------------------

await ok('ensureStyles injects a single stylesheet', () => {
  styles.ensureStyles();
  styles.ensureStyles();
  assert.equal(document.querySelectorAll('#gff-style').length, 1);
  assert.ok((document.getElementById('gff-style')?.textContent || '').includes('.gff-hide'));
});

// ---- panel ----------------------------------------------------------------

function panelCtx(cfg: ReturnType<typeof defaults.cloneDefault>) {
  return {
    getConfig: () => cfg,
    onChange: () => {},
    onReset: () => {},
    loadOrgInfo: async () => ({
      viewer: 'Pfolg',
      orgs: ['acme'],
      source: 'github' as const
    })
  };
}

await ok('panel opens, edits every control and closes', async () => {
  const cfg = defaults.cloneDefault();
  const ctx = panelCtx(cfg);
  let resets = 0;
  ctx.onReset = () => {
    resets++;
  };

  panel.openPanel(ctx);
  assert.equal(panel.isPanelOpen(), true);
  const overlay = document.getElementById('gff-overlay')!;
  assert.ok(overlay);
  assert.ok(overlay.querySelector('.gff-dialog'));

  // Segmented mode control.
  const seg = overlay.querySelector(
    '.gff-seg button[data-scope="modes"][data-key="merged"][data-value="hide"]'
  ) as HTMLButtonElement;
  seg.click();
  assert.equal(cfg.modes.merged, 'hide');
  assert.ok(seg.classList.contains('gff-active'));

  // Right-column control.
  const rightSeg = overlay.querySelector(
    '.gff-seg button[data-scope="right"][data-key="banner"][data-value="collapse"]'
  ) as HTMLButtonElement;
  rightSeg.click();
  assert.equal(cfg.right.banner, 'collapse');

  // Keyword mode control.
  const kwSeg = overlay.querySelector(
    '.gff-seg button[data-scope="keywords"][data-key="mode"][data-value="collapse"]'
  ) as HTMLButtonElement;
  kwSeg.click();
  assert.equal(cfg.keywords.mode, 'collapse');

  // Feature toggles.
  const feedToggle = document.getElementById('gff-feed-enabled') as HTMLInputElement;
  feedToggle.checked = false;
  fire(feedToggle, 'change');
  assert.equal(cfg.features.feed.enabled, false);

  const rightToggle = document.getElementById('gff-right-enabled') as HTMLInputElement;
  rightToggle.checked = false;
  fire(rightToggle, 'change');
  assert.equal(cfg.features.rightColumn.enabled, false);

  const stgToggle = document.getElementById('gff-stg-enabled') as HTMLInputElement;
  stgToggle.checked = false;
  fire(stgToggle, 'change');
  assert.equal(cfg.features.stargazers.enabled, false);

  const onlyOwn = document.getElementById('gff-stg-onlyown') as HTMLInputElement;
  onlyOwn.checked = false;
  fire(onlyOwn, 'change');
  assert.equal(cfg.features.stargazers.onlyOwn, false);

  // URL and keyword textareas.
  const feedUrls = document.getElementById('gff-feed-urls') as HTMLTextAreaElement;
  feedUrls.value = 'https://github.com/feed*\nhttps://github.com/';
  fire(feedUrls, 'change');
  assert.deepEqual(cfg.features.feed.urls, ['https://github.com/feed*', 'https://github.com/']);

  const rightUrls = document.getElementById('gff-right-urls') as HTMLTextAreaElement;
  rightUrls.value = 'https://github.com/';
  fire(rightUrls, 'change');
  assert.deepEqual(cfg.features.rightColumn.urls, ['https://github.com/']);

  const stgUrls = document.getElementById('gff-stg-urls') as HTMLTextAreaElement;
  stgUrls.value = 'https://github.com/*/*';
  fire(stgUrls, 'change');
  assert.deepEqual(cfg.features.stargazers.urls, ['https://github.com/*/*']);

  const extraOrgs = document.getElementById('gff-stg-extra') as HTMLTextAreaElement;
  extraOrgs.value = 'extra\n';
  fire(extraOrgs, 'change');
  assert.deepEqual(cfg.features.stargazers.extraOrgs, ['extra']);

  const kwToggle = document.getElementById('gff-kw-enabled') as HTMLInputElement;
  kwToggle.checked = true;
  fire(kwToggle, 'change');
  assert.equal(cfg.keywords.enabled, true);

  const kwList = document.getElementById('gff-kw-list') as HTMLTextAreaElement;
  kwList.value = 'one\ntwo';
  fire(kwList, 'change');
  assert.deepEqual(cfg.keywords.list, ['one', 'two']);

  // Time filter.
  const tf = document.getElementById('gff-time-enabled') as HTMLInputElement;
  const days = document.getElementById('gff-time-days') as HTMLInputElement;
  assert.equal(days.disabled, true);
  tf.checked = true;
  fire(tf, 'change');
  assert.equal(cfg.timeFilter.enabled, true);
  assert.equal(days.disabled, false);
  days.value = '7';
  fire(days, 'change');
  assert.equal(cfg.timeFilter.days, 7);
  days.value = '0';
  fire(days, 'change');
  assert.equal(cfg.timeFilter.days, 1);
  days.value = '99999';
  fire(days, 'change');
  assert.equal(cfg.timeFilter.days, 3650);

  // Auto-load.
  const al = document.getElementById('gff-autoload') as HTMLInputElement;
  const pages = document.getElementById('gff-autoload-pages') as HTMLInputElement;
  assert.equal(pages.disabled, true);
  al.checked = true;
  fire(al, 'change');
  assert.equal(cfg.autoLoad.enabled, true);
  assert.equal(pages.disabled, false);
  pages.value = '5';
  fire(pages, 'change');
  assert.equal(cfg.autoLoad.maxPages, 5);
  pages.value = '-1';
  fire(pages, 'change');
  assert.equal(cfg.autoLoad.maxPages, 0);

  // Stars & lists sub-items expander.
  const toggle = overlay.querySelector('.gff-group-toggle') as HTMLButtonElement;
  const sub = overlay.querySelector('.gff-sub') as HTMLElement;
  assert.equal(sub.hidden, true);
  toggle.click();
  assert.equal(sub.hidden, false);
  assert.equal(toggle.textContent, '\u25be');
  toggle.click();
  assert.equal(sub.hidden, true);

  // Refresh organizations (covers the forced load path).
  const refresh = Array.from(overlay.querySelectorAll('.gff-btn')).find(b =>
    /Refresh/.test(b.textContent || '')
  ) as HTMLButtonElement;
  refresh.click();
  await sleep(20);
  assert.equal((document.getElementById('gff-stg-viewer')?.textContent || ''), 'Pfolg');

  // Reset button.
  (document.getElementById('gff-reset') as HTMLButtonElement).click();
  assert.equal(resets, 1);

  // Close button.
  (overlay.querySelector('.gff-close') as HTMLButtonElement).click();
  assert.equal(panel.isPanelOpen(), false);
  assert.equal(document.getElementById('gff-overlay'), null);
});

await ok('panel closes on Escape and on overlay click', () => {
  const cfg = defaults.cloneDefault();
  panel.openPanel(panelCtx(cfg));
  assert.equal(panel.isPanelOpen(), true);
  const w = (globalThis as unknown as Record<string, any>).window;
  document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(panel.isPanelOpen(), false);

  panel.openPanel(panelCtx(cfg));
  const overlay = document.getElementById('gff-overlay')!;
  overlay.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(panel.isPanelOpen(), false);
});

await ok('panel reports signed-out and error organization states', async () => {
  const cfg = defaults.cloneDefault();
  const sources: Array<'logged-out' | 'error'> = ['logged-out', 'error'];
  for (const source of sources) {
    panel.openPanel({
      getConfig: () => cfg,
      onChange: () => {},
      onReset: () => {},
      loadOrgInfo: async () => ({
        viewer: source === 'logged-out' ? null : 'Pfolg',
        orgs: [],
        source
      })
    });
    await sleep(10);
    assert.ok(document.getElementById('gff-stg-status'));
  }
  panel.closePanel();
});

// ---- right column ---------------------------------------------------------

await ok('right column filters banner and changelog independently', () => {
  const cfg = defaults.cloneDefault();
  cfg.right.banner = 'hide';
  cfg.right.changelog = 'collapse';
  rightColumn.applyRightColumn(cfg);

  const aside = document.querySelector('aside.feed-right-column')!;
  const banner = aside.querySelector('.js-notice.marketing-banner')!;
  const log = aside.querySelector('.dashboard-changelog')!;
  assert.ok(banner.classList.contains('gff-hide'));
  assert.ok(log.classList.contains('gff-collapsed'));
  assert.ok(!aside.classList.contains('gff-hide'));

  const wrapper = log.parentElement as HTMLElement;
  assert.equal(wrapper.dataset.gffRole, 'collapse');
  const header = wrapper.querySelector('[data-gff-role="collapse-header"]') as HTMLElement;
  header.click();
  assert.ok(log.classList.contains('gff-expanded'));
  header.click();
  assert.ok(!log.classList.contains('gff-expanded'));

  cfg.right.changelog = 'hide';
  rightColumn.applyRightColumn(cfg);
  assert.ok(log.classList.contains('gff-hide'));
  assert.ok(!log.classList.contains('gff-collapsed'));
  assert.ok(aside.classList.contains('gff-hide'));
  assert.equal(aside.querySelectorAll('[data-gff-role="collapse"]').length, 0);

  cfg.right.banner = 'show';
  cfg.right.changelog = 'show';
  rightColumn.applyRightColumn(cfg);
  assert.ok(!banner.classList.contains('gff-hide'));
  assert.ok(!aside.classList.contains('gff-hide'));
  assert.equal(aside.querySelectorAll('[data-gff-role="collapse"]').length, 0);
});

await ok('right column ignores pages without an aside', () => {
  const aside = document.querySelector('aside.feed-right-column')!;
  aside.remove();
  rightColumn.applyRightColumn(defaults.cloneDefault());
  document.body.appendChild(aside);
});

// ---- feed -----------------------------------------------------------------

await ok('applyFeed hides cards by category and updates the counter', () => {
  const cfg = defaults.cloneDefault();
  cfg.modes.merged = 'hide';
  feed.applyFeed(cfg);
  const cards = topCards();
  assert.equal(cards.length, 5);
  assert.equal(cards.filter(c => c.classList.contains('gff-hide')).length, 2);
  assert.equal(document.getElementById('gff-count')!.textContent, 'Hidden: 2 items');
});

await ok('collapse wraps the card in a reusable clickable container', () => {
  const cfg = defaults.cloneDefault();
  cfg.modes.release = 'collapse';
  feed.applyFeed(cfg);
  feed.applyFeed(cfg); // second pass reuses the existing wrapper

  const rel = topCards().find(a => /released v1\.0/.test(a.textContent || ''))!;
  assert.ok(rel.classList.contains('gff-collapsed'));
  const wrapper = rel.parentElement as HTMLElement;
  assert.equal(wrapper.dataset.gffRole, 'collapse');
  assert.ok(wrapper.classList.contains('gff-collapse'));
  const header = wrapper.querySelector('[data-gff-role="collapse-header"]') as HTMLElement;
  assert.ok(/Releases/.test(header.textContent || ''));
  assert.ok(/click to expand/.test(header.textContent || ''));

  header.click();
  assert.ok(rel.classList.contains('gff-expanded'));
  assert.ok(wrapper.classList.contains('gff-expanded'));
  assert.ok(/click to collapse/.test(header.textContent || ''));
  assert.equal(document.getElementById('gff-count')!.textContent, 'Hidden: 0 items');
  assert.equal(document.querySelectorAll('[data-gff-role="collapse"]').length, 1);

  // A second pass preserves the expanded state and the wrapper.
  feed.applyFeed(cfg);
  assert.equal(document.querySelectorAll('[data-gff-role="collapse"]').length, 1);
  assert.ok(rel.classList.contains('gff-expanded'));
});

await ok('keyword blocking overrides the category mode', () => {
  const cfg = defaults.cloneDefault();
  cfg.keywords = { enabled: true, mode: 'hide', list: ['ZEBRA'] };
  feed.applyFeed(cfg);

  const created = topCards().find(a => /created a repository/.test(a.textContent || ''))!;
  assert.ok(!created.classList.contains('gff-hide'));

  const container = document.querySelector('div[data-target="feed-container.content"]')!;
  const extra = document.createElement('article');
  extra.className = 'js-feed-item-component';
  extra.textContent = 'a zebra appears';
  container.insertBefore(extra, container.firstChild);

  feed.applyFeed(cfg);
  assert.ok(extra.classList.contains('gff-hide'));

  cfg.keywords.mode = 'collapse';
  feed.applyFeed(cfg);
  assert.ok(extra.classList.contains('gff-collapsed'));
  const wrapper = extra.parentElement as HTMLElement;
  const header = wrapper.querySelector('[data-gff-role="collapse-header"]') as HTMLElement;
  assert.equal(wrapper.dataset.gffRole, 'collapse');
  assert.match(header.textContent || '', /Matched keyword: "ZEBRA"/);
  assert.doesNotMatch(header.textContent || '', /Other activity/);

  // When the keyword no longer applies, the header falls back to the category.
  cfg.keywords.enabled = false;
  cfg.modes.other = 'collapse';
  feed.applyFeed(cfg);
  assert.match(header.textContent || '', /Other activity/);
  assert.doesNotMatch(header.textContent || '', /Matched keyword/);

  cfg.modes.other = 'show';
  feed.applyFeed(cfg);
  assert.equal(document.querySelectorAll('[data-gff-role="collapse"]').length, 0);
  extra.remove();
});

await ok('time filter hides old cards and pins the end marker at the bottom', () => {
  const cfg = defaults.cloneDefault();
  cfg.timeFilter = { enabled: true, days: 3 };
  feed.applyFeed(cfg);

  const cards = topCards();
  assert.equal(cards.filter(c => c.classList.contains('gff-hide')).length, 4);
  const marker = document.getElementById('gff-end-marker')!;
  assert.ok(marker);
  assert.ok(/older than 3 days/.test(marker.textContent || ''));
  const more = document.querySelector('form.js-ajax-pagination')!;
  assert.ok(more.classList.contains('gff-hide'));

  // Move the marker to the top; re-applying must reposition it.
  const container = document.querySelector('div[data-target="feed-container.content"]')!;
  container.insertBefore(marker, container.firstChild);
  feed.applyFeed(cfg);
  const marker2 = document.getElementById('gff-end-marker')!;
  const lastCard = cards[cards.length - 1];
  assert.ok(
    !!(lastCard.compareDocumentPosition(marker2) & env.window.Node.DOCUMENT_POSITION_FOLLOWING)
  );

  cfg.timeFilter.enabled = false;
  feed.applyFeed(cfg);
  assert.equal(document.getElementById('gff-end-marker'), null);
  assert.ok(!more.classList.contains('gff-hide'));
  assert.equal(topCards().filter(c => c.classList.contains('gff-hide')).length, 0);
});

await ok('auto-load clicks More once per page and stops at the limit', () => {
  const cfg = defaults.cloneDefault();
  cfg.autoLoad = { enabled: true, maxPages: 1 };
  feed.applyFeed(cfg);

  const btn = document.querySelector('form.js-ajax-pagination button') as HTMLButtonElement;
  let clicks = 0;
  btn.addEventListener('click', () => {
    clicks++;
  });

  const io = IOStub.instances[IOStub.instances.length - 1];
  io.fire();
  assert.equal(clicks, 1, 'first intersection clicks More');
  io.fire();
  assert.equal(clicks, 1, 'page limit reached');

  // Unlimited: the 800 ms debounce blocks an immediate second click.
  cfg.autoLoad.maxPages = 0;
  feed.resetAutoLoadCount();
  feed.applyFeed(cfg);
  const io2 = IOStub.instances[IOStub.instances.length - 1];
  io2.fire();
  assert.equal(clicks, 1, 'debounced');

  // Disabled button and background tab are ignored.
  btn.disabled = true;
  io2.fire();
  assert.equal(clicks, 1, 'disabled button');
  btn.disabled = false;

  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  io2.fire();
  assert.equal(clicks, 1, 'hidden tab');
  delete (document as unknown as Record<string, unknown>).hidden;

  // Auto-load disabled: the observer is torn down.
  cfg.autoLoad.enabled = false;
  feed.applyFeed(cfg);
  assert.equal(IOStub.instances[IOStub.instances.length - 1], io2);
  cfg.autoLoad.enabled = true;
  io2.fire();
  assert.equal(clicks, 1, 'observer destroyed');

  // Time cutoff reached: auto-load is disarmed.
  cfg.timeFilter = { enabled: true, days: 1 };
  feed.applyFeed(cfg);
  io2.fire();
  assert.equal(clicks, 1, 'time cutoff reached');
  cfg.timeFilter.enabled = false;
  cfg.autoLoad.enabled = false;
  feed.applyFeed(cfg);

  feed.onVisibilityChange(defaults.cloneDefault());
});

// ---- ownership ------------------------------------------------------------

await ok('loadOrgInfo handles logged-out, github, cache and error states', async () => {
  const meta = document.querySelector('meta[name="user-login"]')!;
  meta.remove();
  let info = await ownership.loadOrgInfo([]);
  assert.equal(info.source, 'logged-out');
  assert.equal(info.viewer, null);
  assert.deepEqual(info.orgs, []);
  document.head.appendChild(meta);

  info = await ownership.loadOrgInfo(['Extra'], true);
  assert.equal(info.source, 'github');
  assert.equal(info.viewer, 'Pfolg');
  assert.deepEqual(info.orgs.sort(), ['acme', 'extra']);

  info = await ownership.loadOrgInfo([]);
  assert.equal(info.source, 'cache');

  env.store.delete('gff-orgs-v1');
  const g = globalThis as unknown as Record<string, any>;
  const origFetch = g.fetch;
  g.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
  info = await ownership.loadOrgInfo([]);
  assert.equal(info.source, 'error');
  g.fetch = origFetch;

  const set = await ownership.getEffectiveOrgs(['other']);
  assert.ok(set.has('acme'));
  assert.ok(set.has('other'));
});

await ok('repo helpers return null outside a repository page', () => {
  assert.equal(ownership.getRepoNwo(), null);
  assert.equal(ownership.getRepoOwner(), null);
  assert.equal(ownership.getRepoName(), null);
  assert.equal(ownership.isRepoPage(), false);
});

// ---- stargazers -----------------------------------------------------------

await ok('initStargazers injects a single button on an own repository', async () => {
  const repo = install(repoHtml(), 'https://github.com/Pfolg/demo');
  assert.equal(ownership.getRepoOwner(), 'pfolg');
  assert.equal(ownership.getRepoName(), 'demo');
  assert.equal(ownership.isRepoPage(), true);

  stargazers.initStargazers(() => defaults.cloneDefault());
  await sleep(200);

  const btn = document.getElementById('gff-stargazers-btn') as HTMLAnchorElement;
  assert.ok(btn, 'button injected');
  assert.equal(btn.getAttribute('href'), '/Pfolg/demo/stargazers');
  assert.equal(btn.getAttribute('data-testid'), 'stargazers-button');
  assert.ok(/Stargazers/.test(btn.textContent || ''));
  assert.ok(btn.querySelector('svg.octicon-people'));

  stargazers.initStargazers(() => defaults.cloneDefault());
  stargazers.refreshStargazersOrgs();
  await sleep(150);
  assert.equal(document.querySelectorAll('#gff-stargazers-btn').length, 1);

  // Existing button is reused when the repo changes.
  const meta = document.querySelector(
    'meta[name="octolytics-dimension-repository_nwo"]'
  ) as HTMLMetaElement;
  meta.setAttribute('content', 'acme/other');
  stargazers.refreshStargazersOrgs();
  await sleep(150);
  const btn2 = document.getElementById('gff-stargazers-btn') as HTMLAnchorElement;
  assert.equal(btn2.getAttribute('href'), '/acme/other/stargazers');
  assert.equal(document.querySelectorAll('#gff-stargazers-btn').length, 1);

  repo.window.close();
});

// ---- main -----------------------------------------------------------------

await ok('main boot registers menu commands and filters the feed', async () => {
  const seeded = defaults.cloneDefault();
  seeded.modes.merged = 'hide';
  const mainEnv = install(feedHtml(), 'https://github.com/feed');
  mainEnv.store.set('gff-config-v2', JSON.stringify(seeded));

  await import('../src/main');
  await sleep(250);

  assert.equal(mainEnv.menu.length, 2);
  assert.ok(mainEnv.menu.some(m => /Settings/.test(m.name)));
  assert.ok(mainEnv.menu.some(m => /Reset/.test(m.name)));
  assert.ok(document.getElementById('gff-style'));

  const cards = topCards();
  assert.equal(cards.filter(c => c.classList.contains('gff-hide')).length, 2);

  // Settings command opens the overlay.
  mainEnv.menu.find(m => /Settings/.test(m.name))!.fn();
  assert.ok(document.getElementById('gff-overlay'));
  panel.closePanel();

  // Reset command restores the defaults and re-applies.
  mainEnv.menu.find(m => /Reset/.test(m.name))!.fn();
  const saved = JSON.parse(mainEnv.store.get('gff-config-v2')!);
  assert.equal(saved.modes.merged, 'show');
  await sleep(150);
  assert.equal(cards.filter(c => c.classList.contains('gff-hide')).length, 0);

  mainEnv.window.close();
});

console.log(`\n${passed} source tests passed.`);
process.exit(0);
