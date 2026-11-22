import type { Config } from '../types';
import {
  getViewerLogin,
  getRepoNwo,
  isOwnOrOrg,
  getEffectiveOrgs
} from './ownership';
import { matchesAny } from './url-scope';

const BTN_ID = 'gff-stargazers-btn';
const LABEL = 'Stargazers';

const PEOPLE_SVG =
  '<svg data-component="Octicon" aria-hidden="true" focusable="false" ' +
  'class="octicon octicon-people" viewBox="0 0 16 16" width="16" height="16" ' +
  'fill="currentColor" display="inline-block" overflow="visible" ' +
  'style="vertical-align: text-bottom;">' +
  '<path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 ' +
  "0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 " +
  "3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 " +
  "5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 " +
  "3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 " +
  ".416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 0 11 5.5Zm-5.5-.5a2 2 0 1 0-.001 " +
  '3.999A2 2 0 0 0 5.5 3.5Z"></path></svg>';

let getCfg: (() => Config) | null = null;
let orgsSet: Set<string> | null = null;
let orgsPromise: Promise<Set<string>> | null = null;
let orgsExtraKey = '';
let wired = false;
let scheduled = false;

function scheduleInject(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    inject();
  });
}

async function ensureOrgs(extra: readonly string[]): Promise<Set<string>> {
  const key = extra.join('\n');
  if (orgsPromise && key === orgsExtraKey) return orgsPromise;
  orgsExtraKey = key;
  orgsPromise = getEffectiveOrgs(extra).catch(() => new Set<string>());
  return orgsPromise;
}

function inject(): void {
  if (!getCfg) return;
  const cfg = getCfg().features.stargazers;
  if (!cfg.enabled) return;
  if (!matchesAny(location.href, cfg.urls)) return;

  const viewer = getViewerLogin();
  if (!viewer) return;

  const nwo = getRepoNwo();
  if (!nwo) return;
  const owner = nwo.split('/')[0];
  const repo = nwo.split('/')[1];
  if (!owner || !repo) return;

  const header = document.querySelector('ul[data-testid="repo-header-actions"]');
  if (!header) return;

  // Update an existing button if we already injected one for this repo.
  const existing = document.getElementById(BTN_ID);
  if (existing && existing.isConnected) {
    const want = `/${owner}/${repo}/stargazers`;
    if (existing.getAttribute('href') !== want) {
      existing.setAttribute('href', want);
    }
    return;
  }

  if (cfg.onlyOwn) {
    // Ownership needs the org list; load it once, then retry.
    void ensureOrgs(cfg.extraOrgs).then(set => {
      orgsSet = set;
      scheduleInject();
    });
    if (!orgsSet) return;
    if (!isOwnOrOrg(owner, viewer, orgsSet)) return;
  }

  const sample =
    header.querySelector('a[data-testid="fork-button"]') ||
    header.querySelector('a[data-component="Button"]');
  if (!sample) return;

  const a = sample.cloneNode(true) as HTMLAnchorElement;
  a.id = BTN_ID;
  a.href = `/${owner}/${repo}/stargazers`;
  a.removeAttribute('aria-describedby');
  a.setAttribute('data-testid', 'stargazers-button');
  a.setAttribute('aria-label', `View stargazers of ${owner}/${repo}`);
  a.removeAttribute('target');
  a.removeAttribute('rel');

  const oldSvg = a.querySelector('svg');
  if (oldSvg) {
    const tmp = document.createElement('div');
    tmp.innerHTML = PEOPLE_SVG;
    oldSvg.replaceWith(tmp.firstElementChild!);
  }

  const label =
    a.querySelector('[data-component="text"]') ||
    a.querySelector('.prc-Button-Label-FWkx3') ||
    a.querySelector('span[data-component="buttonContent"] span:last-child');
  if (label) {
    while (label.firstChild) label.removeChild(label.firstChild);
    label.textContent = LABEL;
  }

  const li = document.createElement('li');
  li.appendChild(a);
  header.appendChild(li);
}

const SPA_EVENTS = [
  'turbo:load',
  'turbo:render',
  'turbo:frame-load',
  'turbo:before-render',
  'pjax:end',
  'soft-nav:end',
  'soft-nav:render'
];

/** Start the Stargazers feature (idempotent). */
export function initStargazers(cfgGetter: () => Config): void {
  getCfg = cfgGetter;
  if (wired) {
    scheduleInject();
    return;
  }
  wired = true;

  // Initial attempt.
  scheduleInject();

  // React to soft navigation.
  for (const ev of SPA_EVENTS) {
    document.addEventListener(ev, scheduleInject);
  }
  window.addEventListener('popstate', scheduleInject);
  window.addEventListener('hashchange', scheduleInject);

  // DOM changes (React re-renders the repo header).
  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Fallback polling for render paths that trigger no events.
  window.setInterval(scheduleInject, 1000);
}

/** Called after the org list changes (panel edit) to force a refresh. */
export function refreshStargazersOrgs(): void {
  orgsSet = null;
  orgsPromise = null;
  orgsExtraKey = '';
  scheduleInject();
}