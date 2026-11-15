// Offline verification against example/Feed.htm
// Run: node test/classify.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const gff = require('../github-feed-filter.user.js');
const {
  classifyCard, classifyByText, resolveMode, mergeConfig, cloneDefault
} = gff;

// ---- helpers -------------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Extract top-level <article> blocks (nested group children excluded),
// mirroring isTopLevelCard() in the userscript.
function extractTopLevelArticles(html) {
  const tokens = [];
  const re = /<article\b[^>]*>|<\/article>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    tokens.push({ open: m[0] !== '</article>', index: m.index });
  }
  const stack = [];
  const tops = [];
  for (const tok of tokens) {
    if (tok.open) {
      stack.push(tok.index);
    } else {
      const open = stack.pop();
      if (stack.length === 0 && open !== undefined) {
        const end = html.indexOf('</article>', open);
        tops.push(html.slice(open, end));
      }
    }
  }
  return tops;
}

function feedCardOf(articleHtml) {
  const m = articleHtml.match(/data-hydro-view="([^"]*)"/);
  if (!m) return null;
  try {
    const obj = JSON.parse(decodeEntities(m[1]));
    return (obj && obj.payload && obj.payload.feed_card) || null;
  } catch (e) {
    return null;
  }
}

// ---- 1. classification over the real sample ------------------------------

const html = fs.readFileSync(
  path.join(__dirname, '..', 'example', 'Feed.htm'), 'utf8');
const articles = extractTopLevelArticles(html);
assert.strictEqual(articles.length, 85,
  `expected 85 top-level articles, got ${articles.length}`);

const counts = {};
let parsed = 0;
for (const a of articles) {
  const card = feedCardOf(a);
  let key;
  if (card && typeof card.card_type === 'string') {
    key = classifyCard(card);
    parsed++;
  } else {
    key = classifyByText(a.replace(/<[^>]*>/g, ' '));
  }
  counts[key] = (counts[key] || 0) + 1;
}

const expected = {
  merged: 34,          // MERGED_PULL_REQUEST
  release: 14,         // RELEASE
  'star.starred': 13,  // STARRED_REPOSITORY
  'star.list': 4,      // ADDED_TO_LIST
  recommend: 8,        // REPOSITORY_RECOMMENDATION (STARRED + CONTRIBUTED)
  popular: 3,          // REPOSITORY_RECOMMENDATION (FOLLOWED)
  created: 3,          // CREATED_REPOSITORY
  fork: 2,             // FORKED_REPOSITORY
  follow: 2,           // FOLLOW
  publicRepo: 1,       // PRIVATE_TO_PUBLIC_REPOSITORY
  trending: 1          // TRENDING_REPOSITORY
};

assert.strictEqual(parsed, 85,
  `all 85 articles should parse via data-hydro-view, got ${parsed}`);
assert.deepStrictEqual(counts, expected,
  `classification mismatch:\n  got      ${JSON.stringify(counts)}\n  expected ${JSON.stringify(expected)}`);
console.log('[1] classification over Feed.htm: OK (' +
  Object.entries(expected).map(([k, v]) => `${k}=${v}`).join(', ') + ')');

// ---- 2. card_type / relationship edge cases ------------------------------

assert.strictEqual(classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: 'FOLLOWED' }), 'popular');
assert.strictEqual(classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: 'STARRED' }), 'recommend');
assert.strictEqual(classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: 'CONTRIBUTED' }), 'recommend');
assert.strictEqual(classifyCard({ card_type: 'REPOSITORY_RECOMMENDATION', resource_relationship: '' }), 'recommend');
assert.strictEqual(classifyCard({ card_type: 'SOME_FUTURE_TYPE' }), 'other');
assert.strictEqual(classifyCard(null), 'other');
assert.strictEqual(classifyCard(undefined), 'other');
console.log('[2] card_type edge cases: OK');

// ---- 3. text fallback ----------------------------------------------------

assert.strictEqual(classifyByText('alice starred 3 repositories'), 'star.starred');
assert.strictEqual(classifyByText('bob added a repository to My list'), 'star.list');
assert.strictEqual(classifyByText('carol forked a repository'), 'fork');
assert.strictEqual(classifyByText('dave created a repository'), 'created');
assert.strictEqual(classifyByText('erin made this repository public'), 'publicRepo');
assert.strictEqual(classifyByText('frank followed'), 'follow');
assert.strictEqual(classifyByText('repo/v1.2 released'), 'release');
assert.strictEqual(classifyByText('Trending repositories'), 'trending');
assert.strictEqual(classifyByText('Recommended for you'), 'recommend');
assert.strictEqual(classifyByText('Popular projects among people you follow'), 'popular');
assert.strictEqual(classifyByText('mallory contributed to a/b'), 'merged');
assert.strictEqual(classifyByText('something unknown entirely'), 'other');
console.log('[3] text fallback: OK');

// ---- 4. mode resolution (inherit chain) ----------------------------------

const cfg = cloneDefault();
assert.strictEqual(resolveMode(cfg, 'merged'), 'show');       // default: show all
cfg.modes.star = 'hide';
assert.strictEqual(resolveMode(cfg, 'star.starred'), 'hide'); // inherit group
assert.strictEqual(resolveMode(cfg, 'star.list'), 'hide');
cfg.modes['star.starred'] = 'collapse';
assert.strictEqual(resolveMode(cfg, 'star.starred'), 'collapse'); // override
assert.strictEqual(resolveMode(cfg, 'star.list'), 'hide');        // still inherit
cfg.modes['star.list'] = 'show';
assert.strictEqual(resolveMode(cfg, 'star.list'), 'show');        // explicit show beats group hide
cfg.modes.merged = 'collapse';
assert.strictEqual(resolveMode(cfg, 'merged'), 'collapse');
assert.strictEqual(resolveMode(cfg, 'unknown-key'), 'show');      // unknown -> show
console.log('[4] resolveMode / inherit: OK');

// ---- 5. config merge with defaults ---------------------------------------

const merged = mergeConfig({ modes: { merged: 'hide' }, timeFilter: { enabled: true } });
assert.strictEqual(merged.modes.merged, 'hide');
assert.strictEqual(merged.modes.release, 'show');          // untouched default kept
assert.strictEqual(merged.timeFilter.enabled, true);
assert.strictEqual(merged.timeFilter.days, 3);             // default kept
assert.strictEqual(merged.autoLoad.enabled, false);
assert.strictEqual(merged.autoLoad.maxPages, 30);
assert.deepStrictEqual(mergeConfig(null), cloneDefault());
assert.deepStrictEqual(mergeConfig('garbage'), cloneDefault());
assert.deepStrictEqual(mergeConfig({}), cloneDefault());
console.log('[5] config merge: OK');

// ---- 6. defaults per requirements ----------------------------------------

const d = cloneDefault();
assert.strictEqual(d.timeFilter.enabled, false, 'time filter default OFF');
assert.strictEqual(d.timeFilter.days, 3, 'default threshold 3 days');
assert.strictEqual(d.autoLoad.enabled, false, 'auto-load default OFF');
assert.strictEqual(d.autoLoad.maxPages, 30, 'default page limit 30');
for (const cat of Object.values(d.modes)) {
  assert.ok(cat === 'show' || cat === 'inherit',
    'every category must default to show/inherit, got ' + cat);
}
for (const v of Object.values(d.right)) assert.strictEqual(v, 'show');
console.log('[6] defaults (all show, time off=3d, autoload off, limit 30): OK');

console.log('\nAll tests passed.');
