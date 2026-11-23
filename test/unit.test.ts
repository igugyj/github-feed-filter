// Unit tests for pure logic (run with tsx).
// Run: npm run test:unit
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Provide DOMParser for the org parser.
const { window } = new JSDOM('');
(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
  window.DOMParser as unknown as typeof DOMParser;

import {
  classifyCard,
  classifyByText,
  resolveMode,
  readFeedCard,
  classifyArticle,
  isTopLevelCard,
  topLevelCards,
  cardTimestamp
} from '../src/core/classify';
import { labelFor, CATEGORIES, STAR_GROUP } from '../src/core/labels';
import { matchesUrl, matchesAny } from '../src/core/url-scope';
import { parseKeywords, normalizeText, matchesKeyword, findKeyword } from '../src/core/keywords';
import { cloneDefault, normalizeConfig } from '../src/config/defaults';
import { loadConfig, V1_KEY, V2_KEY } from '../src/config/storage';
import { parseOrgLogins, isOwnOrOrg, getViewerLogin, getRepoNwo } from '../src/core/ownership';

let passed = 0;
function ok(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`[ok] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    throw err;
  }
}

async function okAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`[ok] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    throw err;
  }
}

// ---- classify -------------------------------------------------------------

ok('classifyCard maps card_type to category', () => {
  assert.equal(classifyCard({ card_type: 'MERGED_PULL_REQUEST' }), 'merged');
  assert.equal(classifyCard({ card_type: 'RELEASE' }), 'release');
  assert.equal(classifyCard({ card_type: 'TRENDING_REPOSITORY' }), 'trending');
  assert.equal(classifyCard({ card_type: 'STARRED_REPOSITORY' }), 'star.starred');
  assert.equal(classifyCard({ card_type: 'ADDED_TO_LIST' }), 'star.list');
  assert.equal(classifyCard({ card_type: 'CREATED_REPOSITORY' }), 'created');
  assert.equal(classifyCard({ card_type: 'FORKED_REPOSITORY' }), 'fork');
  assert.equal(classifyCard({ card_type: 'PRIVATE_TO_PUBLIC_REPOSITORY' }), 'publicRepo');
  assert.equal(classifyCard({ card_type: 'FOLLOW' }), 'follow');
  assert.equal(classifyCard({ card_type: 'SOME_FUTURE_TYPE' }), 'other');
  assert.equal(classifyCard(null), 'other');
});

ok('classifyCard splits recommendations by relationship', () => {
  assert.equal(
    classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: 'FOLLOWED' }),
    'popular'
  );
  assert.equal(
    classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: 'STARRED' }),
    'recommend'
  );
  assert.equal(
    classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: 'CONTRIBUTED' }),
    'recommend'
  );
  assert.equal(classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION' }), 'recommend');
});

ok('classifyByText fallback heuristics', () => {
  assert.equal(classifyByText('alice starred 3 repositories'), 'star.starred');
  assert.equal(classifyByText('bob added a repository to My list'), 'star.list');
  assert.equal(classifyByText('carol forked a repository'), 'fork');
  assert.equal(classifyByText('dave created a repository'), 'created');
  assert.equal(classifyByText('erin made this repository public'), 'publicRepo');
  assert.equal(classifyByText('frank followed'), 'follow');
  assert.equal(classifyByText('repo/v1.2 released'), 'release');
  assert.equal(classifyByText('Trending repositories'), 'trending');
  assert.equal(classifyByText('Recommended for you'), 'recommend');
  assert.equal(classifyByText('Popular projects among people you follow'), 'popular');
  assert.equal(classifyByText('mallory contributed to a/b'), 'merged');
  assert.equal(classifyByText('something unknown entirely'), 'other');
});

ok('resolveMode honours inherit chain', () => {
  const cfg = cloneDefault();
  assert.equal(resolveMode(cfg, 'merged'), 'show');
  cfg.modes.star = 'hide';
  assert.equal(resolveMode(cfg, 'star.starred'), 'hide');
  assert.equal(resolveMode(cfg, 'star.list'), 'hide');
  cfg.modes['star.starred'] = 'collapse';
  assert.equal(resolveMode(cfg, 'star.starred'), 'collapse');
  assert.equal(resolveMode(cfg, 'star.list'), 'hide');
  cfg.modes['star.list'] = 'show';
  assert.equal(resolveMode(cfg, 'star.list'), 'show');
  cfg.modes.merged = 'collapse';
  assert.equal(resolveMode(cfg, 'merged'), 'collapse');
  assert.equal(resolveMode(cfg, 'other'), 'show');
});

ok('labels are defined for every category', () => {
  for (const c of CATEGORIES) assert.ok(labelFor(c.key).length > 0);
  assert.equal(labelFor('star'), STAR_GROUP.label);
  assert.equal(labelFor('star.starred'), STAR_GROUP.children[0].label);
  assert.equal(labelFor('star.list'), STAR_GROUP.children[1].label);
});

// ---- DOM helpers ----------------------------------------------------------

function article(card: object | null, text: string): Element {
  const doc = new JSDOM('<!doctype html><html><body></body></html>').window.document;
  const a = doc.createElement('article');
  a.className = 'js-feed-item-component';
  if (card) a.setAttribute('data-hydro-view', JSON.stringify({ payload: { feed_card: card } }));
  a.textContent = text;
  return a;
}

ok('readFeedCard parses data-hydro-view', () => {
  const el = article({ card_type: 'RELEASE' }, 'released');
  const card = readFeedCard(el);
  assert.equal(card?.card_type, 'RELEASE');
  const bad = article(null, 'x');
  bad.setAttribute('data-hydro-view', '{not json');
  assert.equal(readFeedCard(bad), null);
});

ok('classifyArticle prefers card_type over text', () => {
  const el = article({ card_type: 'FOLLOW' }, 'starred something');
  assert.equal(classifyArticle(el), 'follow');
});

ok('isTopLevelCard excludes nested articles', () => {
  const doc = new JSDOM('<!doctype html><html><body></body></html>').window.document;
  const outer = doc.createElement('article');
  outer.className = 'js-feed-item-component';
  const inner = doc.createElement('article');
  inner.className = 'js-feed-item-component';
  outer.appendChild(inner);
  doc.body.appendChild(outer);
  assert.equal(isTopLevelCard(outer), true);
  assert.equal(isTopLevelCard(inner), false);
  assert.equal(topLevelCards(doc).length, 1);
});

ok('cardTimestamp reads the card own visible relative-time only', () => {
  const doc = new JSDOM('<!doctype html><html><body></body></html>').window.document;
  const a = doc.createElement('article');
  a.className = 'js-feed-item-component';
  const rt = doc.createElement('relative-time');
  rt.setAttribute('datetime', '2026-11-14T20:14:04Z');
  a.appendChild(rt);
  assert.equal(cardTimestamp(a), Date.parse('2026-11-14T20:14:04Z'));

  // No visible timestamp: created_at is not used (recommendation cards use
  // batch/creation dates that would cause false positives).
  const b = article({ card_type: 'RELEASE', created_at: '2026-11-10T00:00:00Z' }, 'x');
  assert.equal(cardTimestamp(b), null);

  // The card's own header wins over a nested repository timestamp.
  const headerCard = doc.createElement('article');
  headerCard.className = 'js-feed-item-component';
  const header = doc.createElement('header');
  const headerRt = doc.createElement('relative-time');
  headerRt.setAttribute('datetime', '2026-11-14T20:14:04Z');
  header.appendChild(headerRt);
  headerCard.appendChild(header);
  const repo = doc.createElement('div');
  const repoRt = doc.createElement('relative-time');
  repoRt.setAttribute('datetime', '2026-11-01T00:00:00Z');
  repo.appendChild(repoRt);
  headerCard.appendChild(repo);
  assert.equal(cardTimestamp(headerCard), Date.parse('2026-11-14T20:14:04Z'));

  // A nested card's timestamp must not be attributed to the outer card.
  const outer = doc.createElement('article');
  outer.className = 'js-feed-item-component';
  const inner = doc.createElement('article');
  inner.className = 'js-feed-item-component';
  const innerRt = doc.createElement('relative-time');
  innerRt.setAttribute('datetime', '2026-11-01T00:00:00Z');
  inner.appendChild(innerRt);
  outer.appendChild(inner);
  assert.equal(cardTimestamp(outer), null);

  const c = article(null, 'x');
  assert.equal(cardTimestamp(c), null);
});

// ---- url scope ------------------------------------------------------------

ok('matchesUrl supports globs across slashes', () => {
  assert.equal(matchesUrl('https://github.com/feed', 'https://github.com/feed*'), true);
  assert.equal(matchesUrl('https://github.com/feed/xxx', 'https://github.com/feed*'), true);
  assert.equal(matchesUrl('https://github.com/', 'https://github.com/feed*'), false);
  assert.equal(matchesUrl('https://github.com/', 'https://github.com/'), true);
  assert.equal(matchesUrl('https://github.com/feed', 'https://github.com/'), false);
  assert.equal(
    matchesUrl('https://github.com/igugyj/github-feed-filter', 'https://github.com/*/*'),
    true
  );
  assert.equal(
    matchesUrl('https://github.com/igugyj/repo/issues', 'https://github.com/*/*'),
    true
  );
  assert.equal(matchesUrl('https://github.com/', 'https://github.com/*/*'), false);
  // Exact patterns tolerate a trailing slash.
  assert.equal(matchesUrl('https://github.com/feed/', 'https://github.com/feed'), true);
});

ok('matchesAny returns true when any pattern matches', () => {
  assert.equal(
    matchesAny('https://github.com/feed', ['https://github.com/', 'https://github.com/feed*']),
    true
  );
  assert.equal(matchesAny('https://example.com', ['https://github.com/']), false);
});

// ---- keywords -------------------------------------------------------------

ok('parseKeywords trims and drops empty lines', () => {
  assert.deepEqual(parseKeywords('  a \n\n b\t\nc  '), ['a', 'b', 'c']);
  assert.deepEqual(parseKeywords(''), []);
});

ok('normalizeText collapses whitespace and lowercases', () => {
  assert.equal(normalizeText('  Hello   World \n'), 'hello world');
});

ok('matchesKeyword is case-insensitive substring', () => {
  const kws = ['rust', 'AI agent'];
  assert.equal(matchesKeyword('I love RUST', kws), true);
  assert.equal(matchesKeyword('an AI Agent appears', kws), true);
  assert.equal(matchesKeyword('python only', kws), false);
  assert.equal(matchesKeyword('', kws), false);
});

ok('findKeyword returns the first matching keyword in its configured form', () => {
  const kws = ['rust', 'AI agent'];
  assert.equal(findKeyword('I love RUST', kws), 'rust');
  assert.equal(findKeyword('an AI Agent appears', kws), 'AI agent');
  assert.equal(findKeyword('python only', kws), null);
  assert.equal(findKeyword('', kws), null);
});

// ---- config ---------------------------------------------------------------

ok('cloneDefault has the required defaults', () => {
  const d = cloneDefault();
  assert.equal(d.version, 2);
  assert.equal(d.timeFilter.enabled, false);
  assert.equal(d.timeFilter.days, 3);
  assert.equal(d.autoLoad.enabled, false);
  assert.equal(d.autoLoad.maxPages, 30);
  assert.equal(d.keywords.enabled, false);
  assert.equal(d.keywords.mode, 'hide');
  assert.deepEqual(d.keywords.list, []);
  assert.deepEqual(d.features.feed.urls, ['https://github.com/feed*']);
  assert.deepEqual(d.features.rightColumn.urls, ['https://github.com/']);
  assert.deepEqual(d.features.stargazers.urls, ['https://github.com/*/*']);
  assert.equal(d.features.stargazers.onlyOwn, true);
  for (const v of Object.values(d.modes)) {
    assert.ok(v === 'show' || v === 'inherit', `bad default mode ${v}`);
  }
});

ok('normalizeConfig merges partial saved config', () => {
  const cfg = normalizeConfig({ modes: { merged: 'hide' }, timeFilter: { enabled: true } });
  assert.equal(cfg.modes.merged, 'hide');
  assert.equal(cfg.modes.release, 'show');
  assert.equal(cfg.timeFilter.enabled, true);
  assert.equal(cfg.timeFilter.days, 3);
  assert.equal(cfg.autoLoad.enabled, false);
});

ok('normalizeConfig migrates a v1 config', () => {
  const v1 = {
    modes: { merged: 'collapse', star: 'hide', 'star.list': 'collapse' },
    right: { banner: 'hide' },
    timeFilter: { enabled: true, days: 7 },
    autoLoad: { enabled: true, maxPages: 0 }
  };
  const cfg = normalizeConfig(v1);
  assert.equal(cfg.version, 2);
  assert.equal(cfg.modes.merged, 'collapse');
  assert.equal(cfg.modes.star, 'hide');
  assert.equal(cfg.modes['star.list'], 'collapse');
  assert.equal(cfg.modes['star.starred'], 'inherit');
  assert.equal(cfg.right.banner, 'hide');
  assert.equal(cfg.right.changelog, 'show');
  assert.equal(cfg.timeFilter.enabled, true);
  assert.equal(cfg.timeFilter.days, 7);
  assert.equal(cfg.autoLoad.enabled, true);
  assert.equal(cfg.autoLoad.maxPages, 0);
  // New fields get defaults.
  assert.deepEqual(cfg.features.feed.urls, ['https://github.com/feed*']);
  assert.equal(cfg.keywords.enabled, false);
  assert.equal(cfg.features.stargazers.onlyOwn, true);
});

ok('normalizeConfig sanitizes bad values', () => {
  const cfg = normalizeConfig({
    modes: { merged: 'bogus' },
    timeFilter: { days: -5 },
    autoLoad: { maxPages: 'x' },
    keywords: { mode: 'nope', list: ['a', 42] },
    features: { feed: { urls: ['ok', 7] } }
  });
  assert.equal(cfg.modes.merged, 'show');
  assert.equal(cfg.timeFilter.days, 3);
  assert.equal(cfg.autoLoad.maxPages, 30);
  assert.equal(cfg.keywords.mode, 'hide');
  assert.deepEqual(cfg.keywords.list, ['a']);
  assert.deepEqual(cfg.features.feed.urls, ['ok']);
});

// ---- storage migration ----------------------------------------------------

await okAsync('loadConfig migrates v1 storage to v2', async () => {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<string, unknown>).GM_getValue = (k: string, d: unknown) =>
    store.has(k) ? store.get(k) : d;
  (globalThis as unknown as Record<string, unknown>).GM_setValue = (k: string, v: unknown) => {
    store.set(k, String(v));
  };

  store.set(
    V1_KEY,
    JSON.stringify({
      modes: { merged: 'hide' },
      timeFilter: { enabled: true, days: 5 }
    })
  );
  const cfg = loadConfig();
  assert.equal(cfg.version, 2);
  assert.equal(cfg.modes.merged, 'hide');
  assert.equal(cfg.timeFilter.days, 5);
  assert.equal(cfg.features.stargazers.onlyOwn, true);
  // v2 key now exists; v1 key untouched.
  assert.ok(store.has(V2_KEY));
  assert.ok(store.has(V1_KEY));

  // Second load reads v2 directly.
  const cfg2 = loadConfig();
  assert.equal(cfg2.modes.merged, 'hide');
});

// ---- ownership ------------------------------------------------------------

ok('parseOrgLogins extracts orgs from settings HTML', () => {
  const html = `
    <div>
      <a data-hovercard-type="organization" href="/orgs/acme">Acme</a>
      <a href="/organizations/other/settings/profile">Other</a>
      <a data-hovercard-url="/orgs/zen/hovercard"></a>
      <a href="/settings/profile">Not an org</a>
      <a href="/someuser">Not an org either</a>
    </div>`;
  const orgs = parseOrgLogins(html);
  assert.ok(orgs.includes('acme'));
  assert.ok(orgs.includes('other'));
  assert.ok(orgs.includes('zen'));
  assert.ok(!orgs.includes('settings'));
  assert.ok(!orgs.includes('someuser'));
});

ok('isOwnOrOrg matches viewer and org owners', () => {
  const orgs = new Set(['acme']);
  assert.equal(isOwnOrOrg('me', 'me', orgs), true);
  assert.equal(isOwnOrOrg('ME', 'me', orgs), true);
  assert.equal(isOwnOrOrg('acme', 'me', orgs), true);
  assert.equal(isOwnOrOrg('someone', 'me', orgs), false);
  assert.equal(isOwnOrOrg('acme', null, orgs), true);
  assert.equal(isOwnOrOrg('other', null, orgs), false);
});

ok('getViewerLogin and getRepoNwo read page meta', () => {
  const doc = new JSDOM(
    `<!doctype html><html><head>
      <meta name="user-login" content="Pfolg">
      <meta name="octolytics-dimension-repository_nwo" content="Pfolg/demo">
    </head><body></body></html>`
  ).window.document;
  const orig = (globalThis as unknown as { document: unknown }).document;
  (globalThis as unknown as { document: unknown }).document = doc;
  try {
    assert.equal(getViewerLogin(), 'Pfolg');
    assert.equal(getRepoNwo(), 'Pfolg/demo');
  } finally {
    (globalThis as unknown as { document: unknown }).document = orig;
  }
});

console.log(`\n${passed} unit tests passed.`);