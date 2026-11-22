// DOM behaviour tests: run the built userscript inside jsdom.
// Run: npm run test:dom
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fs.readFileSync(path.join(ROOT, 'github-feed-filter.user.js'), 'utf8');

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

function card(
  type: string,
  rel: string,
  text: string,
  time = '2026-11-14T20:14:04Z'
): string {
  return (
    `<article class="js-feed-item-component" data-hydro-view="${hydro({
      card_type: type,
      resource_relationship: rel,
      created_at: time
    })}">` +
    `<relative-time datetime="${time}"></relative-time>` +
    `<p>${text}</p>` +
    `</article>`
  );
}

function feedHtml(): string {
  return `<!doctype html><html><head>
<meta name="user-login" content="Pfolg">
</head><body>
<div class="feed-container">
  <div data-target="feed-container.content">
    ${card('MERGED_PULL_REQUEST', '', 'alice merged pull request A')}
    ${card('MERGED_PULL_REQUEST', '', 'bob merged pull request B')}
    ${card('RELEASE', '', 'carol released v1.0')}
    ${card('STARRED_REPOSITORY', '', 'dave starred some/repo')}
    ${card('ADDED_TO_LIST', '', 'erin added a repository to My list')}
    ${card('CREATED_REPOSITORY', '', 'frank created a repository')}
    <article class="js-feed-item-component" data-hydro-view="${hydro({
      card_type: 'STARRED_REPOSITORY',
      resource_relationship: '',
      created_at: '2026-11-14T20:14:04Z'
    })}"><p>grace starred 2 repositories</p>
      <article class="js-feed-item-component" data-hydro-view="${hydro({
        card_type: 'STARRED_REPOSITORY',
        resource_relationship: ''
      })}"><p>nested star one</p></article>
      <article class="js-feed-item-component" data-hydro-view="${hydro({
        card_type: 'STARRED_REPOSITORY',
        resource_relationship: ''
      })}"><p>nested star two</p></article>
    </article>
    <form class="js-ajax-pagination"><button>More</button></form>
  </div>
  <aside class="feed-right-column">
    <div class="js-notice marketing-banner">Universe banner</div>
    <div class="dashboard-changelog">Changelog</div>
  </aside>
</div>
</body></html>`;
}

function repoHtml(opts: {
  viewer?: string;
  nwo?: string;
  header?: boolean;
} = {}): string {
  const { viewer = 'Pfolg', header = true } = opts;
  const nwo = 'nwo' in opts ? opts.nwo : 'Pfolg/demo';
  const metas = [
    viewer !== undefined ? `<meta name="user-login" content="${viewer}">` : '',
    nwo ? `<meta name="octolytics-dimension-repository_nwo" content="${nwo}">` : '',
    `<meta name="octolytics-dimension-repository_public" content="true">`
  ].join('\n');
  const actions = header
    ? `<ul data-testid="repo-header-actions">
        <li><a data-testid="fork-button" data-component="Button" href="/${nwo || 'x/y'}/fork">
          <svg viewBox="0 0 16 16"></svg>
          <span data-component="text">Fork</span>
        </a></li>
      </ul>`
    : '';
  return `<!doctype html><html><head>${metas}</head><body>${actions}</body></html>`;
}

const ORG_HTML = `<div>
  <a data-hovercard-type="organization" href="/orgs/acme">Acme</a>
  <a href="/organizations/other/settings/profile">Other</a>
</div>`;

// ---- boot -----------------------------------------------------------------

interface BootOptions {
  url: string;
  html: string;
  config?: object;
  orgsHtml?: string;
  now?: number;
}

async function boot(opts: BootOptions): Promise<{
  window: JSDOM['window'];
  store: Map<string, string>;
  menu: { name: string; fn: () => void }[];
}> {
  const dom = new JSDOM(opts.html, {
    url: opts.url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window as unknown as Record<string, any>;

  w.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const store = new Map<string, string>();
  if (opts.config) store.set('gff-config-v2', JSON.stringify(opts.config));
  w.GM_getValue = (k: string, d: unknown) => (store.has(k) ? store.get(k) : d);
  w.GM_setValue = (k: string, v: unknown) => {
    store.set(k, String(v));
  };
  const menu: { name: string; fn: () => void }[] = [];
  w.GM_registerMenuCommand = (name: string, fn: () => void) => {
    menu.push({ name, fn });
  };
  w.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => opts.orgsHtml ?? ''
  });
  if (opts.now) w.Date.now = () => opts.now;

  w.eval(SCRIPT);
  await sleep(180);

  return { window: dom.window, store, menu };
}

const has = (el: Element | null | undefined, cls: string): boolean =>
  !!el && el.classList.contains(cls);
const collapses = (w: JSDOM['window']) =>
  w.document.querySelectorAll('[data-gff-role="collapse"]');
const topCards = (w: JSDOM['window']) =>
  Array.from(w.document.querySelectorAll('article.js-feed-item-component')).filter(
    el => !el.parentElement?.closest('article.js-feed-item-component')
  );

// ---- tests ----------------------------------------------------------------

await ok('menu commands are registered', async () => {
  const { menu } = await boot({ url: 'https://github.com/feed', html: feedHtml() });
  assert.equal(menu.length, 2);
  assert.ok(menu.some(m => /Settings/.test(m.name)));
  assert.ok(menu.some(m => /Reset/.test(m.name)));
});

await ok('feed feature runs on /feed', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: { modes: { merged: 'hide' } }
  });
  const cs = topCards(w);
  assert.equal(cs.length, 7, 'seven top-level cards');
  assert.equal(cs.filter(c => has(c, 'gff-hide')).length, 2, 'two merged cards hidden');
  assert.equal(collapses(w).length, 0);
});

await ok('right column does NOT run on /feed', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: { right: { banner: 'hide', changelog: 'hide' } }
  });
  const aside = w.document.querySelector('aside.feed-right-column');
  assert.ok(!has(aside, 'gff-hide'), 'aside untouched on /feed');
  assert.ok(!has(aside?.querySelector('.js-notice.marketing-banner'), 'gff-hide'));
});

await ok('right column runs on / and feed does not', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/',
    html: feedHtml(),
    config: { modes: { merged: 'hide' }, right: { banner: 'hide', changelog: 'hide' } }
  });
  const aside = w.document.querySelector('aside.feed-right-column');
  assert.ok(has(aside, 'gff-hide'), 'aside removed on home');
  assert.equal(topCards(w).filter(c => has(c, 'gff-hide')).length, 0, 'feed not filtered on home');
});

await ok('collapse mode wraps cards in expandable containers and counts', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: { modes: { release: 'collapse' } }
  });
  const cs = topCards(w);
  const collapsed = cs.filter(c => has(c, 'gff-collapsed'));
  assert.equal(collapsed.length, 1, 'one release card collapsed');
  assert.equal(collapses(w).length, 1);
  const first = collapsed[0];
  const wrapper = first.parentElement as HTMLElement;
  assert.equal(wrapper.dataset.gffRole, 'collapse');
  const header = wrapper.querySelector('[data-gff-role="collapse-header"]') as HTMLElement;
  assert.ok(/Releases/.test(header.textContent || ''));
  assert.ok(/click to expand/.test(header.textContent || ''));
  header.dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.ok(has(first, 'gff-expanded'));
  assert.ok(/click to collapse/.test(header.textContent || ''));
});

await ok('star group inherit and sub override', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: { modes: { star: 'hide', 'star.list': 'collapse' } }
  });
  const cs = topCards(w);
  const starred = cs.filter(c => /starred/i.test(c.textContent || ''));
  assert.ok(starred.length >= 2, 'starred cards present');
  assert.ok(starred.every(c => has(c, 'gff-hide')), 'star.starred inherits group hide');
  const added = cs.filter(c => /added a repository to/i.test(c.textContent || ''));
  assert.equal(added.length, 1);
  assert.ok(added.every(c => has(c, 'gff-collapsed') && !has(c, 'gff-hide')));
});

await ok('keyword blocking uses its own mode and beats category mode', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: {
      modes: { merged: 'show' },
      keywords: { enabled: true, mode: 'hide', list: ['SECRET'] }
    }
  });
  // Inject a card containing the keyword.
  const container = w.document.querySelector('div[data-target="feed-container.content"]')!;
  const extra = w.document.createElement('article');
  extra.className = 'js-feed-item-component';
  extra.textContent = 'this card has a secret phrase';
  container.insertBefore(extra, container.firstChild);
  await sleep(150);
  const cs = topCards(w);
  assert.ok(has(extra, 'gff-hide'), 'keyword-matched card hidden');
  // Non-matching cards stay visible.
  assert.ok(!has(cs.find(c => /merged pull request/i.test(c.textContent || ''))!, 'gff-hide'));
});

await ok('keyword collapse shows the matched keyword in the container header', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: {
      modes: { merged: 'hide' },
      keywords: { enabled: true, mode: 'collapse', list: ['SECRET'] }
    }
  });
  const container = w.document.querySelector('div[data-target="feed-container.content"]')!;
  const extra = w.document.createElement('article');
  extra.className = 'js-feed-item-component';
  extra.textContent = 'this card has a secret phrase';
  container.insertBefore(extra, container.firstChild);
  await sleep(150);

  assert.ok(has(extra, 'gff-collapsed'), 'keyword-matched card collapsed');
  assert.ok(!has(extra, 'gff-hide'));
  const wrapper = extra.parentElement as HTMLElement;
  assert.equal(wrapper.dataset.gffRole, 'collapse');
  const header = wrapper.querySelector('[data-gff-role="collapse-header"]') as HTMLElement;
  assert.match(header.textContent || '', /Matched keyword: "SECRET"/);
  assert.doesNotMatch(header.textContent || '', /Other activity/);
  assert.match(header.textContent || '', /click to expand/);
});

await ok('time filter hides old cards, inserts end marker at bottom, drops More', async () => {
  const { window: w, menu } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml(),
    config: { timeFilter: { enabled: true, days: 3 } },
    now: Date.parse('2026-12-15T00:00:00Z')
  });
  const cs = topCards(w);
  assert.equal(cs.filter(c => has(c, 'gff-hide')).length, cs.length, 'all cards hidden');
  const marker = w.document.getElementById('gff-end-marker');
  assert.ok(marker, 'end marker inserted');
  assert.ok(/older than 3 days/.test(marker!.textContent || ''));
  const more = w.document.querySelector('form.js-ajax-pagination');
  assert.ok(has(more, 'gff-hide'), 'More hidden');

  const lastCard = cs[cs.length - 1];
  assert.ok(
    !!(lastCard.compareDocumentPosition(marker!) & w.Node.DOCUMENT_POSITION_FOLLOWING),
    'marker after last card'
  );

  // Regression: moving the marker to the top must be corrected on re-apply.
  menu.find(m => /Settings/.test(m.name))!.fn();
  await sleep(50);
  const feed = w.document.querySelector('div[data-target="feed-container.content"]')!;
  feed.insertBefore(w.document.getElementById('gff-end-marker')!, feed.firstChild);
  const seg = w.document.querySelector(
    '.gff-seg button[data-key="merged"][data-value="collapse"]'
  );
  seg!.dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(150);
  const marker2 = w.document.getElementById('gff-end-marker');
  assert.ok(marker2, 'marker survives re-apply');
  assert.ok(
    !!(lastCard.compareDocumentPosition(marker2!) & w.Node.DOCUMENT_POSITION_FOLLOWING),
    'marker re-positioned to bottom'
  );
});

await ok('right column both-hide removes the whole aside', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/',
    html: feedHtml(),
    config: { right: { banner: 'hide' } }
  });
  let aside = w.document.querySelector('aside.feed-right-column');
  assert.ok(!has(aside, 'gff-hide'), 'one hidden -> aside stays');
  aside = w.document.querySelector('aside.feed-right-column');

  const b2 = await boot({
    url: 'https://github.com/',
    html: feedHtml(),
    config: { right: { banner: 'hide', changelog: 'hide' } }
  });
  aside = b2.window.document.querySelector('aside.feed-right-column');
  assert.ok(has(aside, 'gff-hide'), 'both hidden -> aside removed');
});

await ok('panel opens from the menu and persists changes', async () => {
  const { window: w, store, menu } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml()
  });
  assert.ok(!w.document.getElementById('gff-overlay'), 'no overlay before menu');
  const settings = menu.find(m => /Settings/.test(m.name))!;
  settings.fn();
  await sleep(50);
  const overlay = w.document.getElementById('gff-overlay');
  assert.ok(overlay, 'overlay opened');
  assert.ok(!overlay!.hidden);

  const seg = w.document.querySelector(
    '.gff-seg button[data-key="merged"][data-value="hide"]'
  ) as HTMLButtonElement;
  assert.ok(seg, 'merged Hide button present');
  seg.click();
  await sleep(80);

  const saved = JSON.parse(store.get('gff-config-v2')!);
  assert.equal(saved.modes.merged, 'hide', 'mode persisted');
  assert.equal(topCards(w).filter(c => has(c, 'gff-hide')).length, 2, 'applied immediately');

  // Reset restores defaults.
  const reset = w.document.getElementById('gff-reset') as HTMLButtonElement;
  reset.click();
  await sleep(80);
  assert.equal(topCards(w).filter(c => has(c, 'gff-hide')).length, 0, 'reset clears filtering');
  const saved2 = JSON.parse(store.get('gff-config-v2')!);
  assert.equal(saved2.modes.merged, 'show');
});

await ok('panel shows default time/auto-load/keyword values', async () => {
  const { window: w, menu } = await boot({
    url: 'https://github.com/feed',
    html: feedHtml()
  });
  menu.find(m => /Settings/.test(m.name))!.fn();
  await sleep(50);
  const doc = w.document;
  assert.equal((doc.getElementById('gff-time-enabled') as HTMLInputElement).checked, false);
  assert.equal((doc.getElementById('gff-time-days') as HTMLInputElement).value, '3');
  assert.equal((doc.getElementById('gff-autoload') as HTMLInputElement).checked, false);
  assert.equal((doc.getElementById('gff-autoload-pages') as HTMLInputElement).value, '30');
  assert.equal((doc.getElementById('gff-kw-enabled') as HTMLInputElement).checked, false);
});

// ---- Stargazers -----------------------------------------------------------

const BASE_STG = {
  features: {
    feed: { enabled: false, urls: [] },
    rightColumn: { enabled: false, urls: [] },
    stargazers: {
      enabled: true,
      urls: ['https://github.com/*/*'],
      onlyOwn: true,
      extraOrgs: []
    }
  }
};

function stgButton(w: JSDOM['window']): HTMLAnchorElement | null {
  return w.document.getElementById('gff-stargazers-btn') as HTMLAnchorElement | null;
}

await ok('stargazers button injected on own repo', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/Pfolg/demo',
    html: repoHtml({ viewer: 'Pfolg', nwo: 'Pfolg/demo' }),
    config: BASE_STG,
    orgsHtml: ORG_HTML
  });
  const btn = stgButton(w);
  assert.ok(btn, 'button exists');
  assert.equal(btn!.getAttribute('href'), '/Pfolg/demo/stargazers');
  assert.equal(btn!.getAttribute('data-testid'), 'stargazers-button');
  assert.ok(/Stargazers/.test(btn!.textContent || ''));
  assert.ok(btn!.querySelector('svg.octicon-people'), 'people octicon present');
  // Only one button even after a while (idempotent).
  await sleep(1200);
  assert.equal(w.document.querySelectorAll('#gff-stargazers-btn').length, 1);
});

await ok('stargazers button injected on org repo', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/acme/demo',
    html: repoHtml({ viewer: 'Pfolg', nwo: 'acme/demo' }),
    config: BASE_STG,
    orgsHtml: ORG_HTML
  });
  const btn = stgButton(w);
  assert.ok(btn, 'button exists on org repo');
  assert.equal(btn!.getAttribute('href'), '/acme/demo/stargazers');
});

await ok('stargazers NOT injected on someone else repo by default', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/someone/demo',
    html: repoHtml({ viewer: 'Pfolg', nwo: 'someone/demo' }),
    config: BASE_STG,
    orgsHtml: ORG_HTML
  });
  assert.equal(stgButton(w), null, 'no button on foreign repo');
});

await ok('stargazers injected on foreign repo when onlyOwn disabled', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/someone/demo',
    html: repoHtml({ viewer: 'Pfolg', nwo: 'someone/demo' }),
    config: {
      features: {
        feed: { enabled: false, urls: [] },
        rightColumn: { enabled: false, urls: [] },
        stargazers: {
          enabled: true,
          urls: ['https://github.com/*/*'],
          onlyOwn: false,
          extraOrgs: []
        }
      }
    },
    orgsHtml: ORG_HTML
  });
  assert.ok(stgButton(w), 'button exists when onlyOwn is off');
});

await ok('stargazers NOT injected when logged out', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/Pfolg/demo',
    html: repoHtml({ viewer: '', nwo: 'Pfolg/demo' }),
    config: BASE_STG,
    orgsHtml: ORG_HTML
  });
  assert.equal(stgButton(w), null, 'no button when logged out');
});

await ok('stargazers NOT injected on non-repo page', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/settings/profile',
    html: repoHtml({ viewer: 'Pfolg', nwo: undefined, header: true }),
    config: BASE_STG,
    orgsHtml: ORG_HTML
  });
  assert.equal(stgButton(w), null, 'no button without repository meta');
});

await ok('stargazers feature disabled -> no button', async () => {
  const { window: w } = await boot({
    url: 'https://github.com/Pfolg/demo',
    html: repoHtml({ viewer: 'Pfolg', nwo: 'Pfolg/demo' }),
    config: {
      features: {
        feed: { enabled: false, urls: [] },
        rightColumn: { enabled: false, urls: [] },
        stargazers: {
          enabled: false,
          urls: ['https://github.com/*/*'],
          onlyOwn: true,
          extraOrgs: []
        }
      }
    },
    orgsHtml: ORG_HTML
  });
  assert.equal(stgButton(w), null, 'no button when feature disabled');
});

console.log(`\n${passed} DOM tests passed.`);
process.exit(0);