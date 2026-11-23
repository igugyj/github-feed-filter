import type { Config } from './types';
import { loadConfig, saveConfig, cloneDefault } from './config/storage';
import { matchesAny } from './core/url-scope';
import { applyFeed } from './core/feed';
import { applyRightColumn } from './core/right-column';
import { initStargazers } from './core/stargazers';
import { loadOrgInfo } from './core/ownership';
import { openPanel, type PanelContext } from './ui/panel';
import { ensureStyles } from './ui/styles';
import { ensureBadge } from "./ui/badge";

let config: Config = loadConfig();

function getConfig(): Config {
  return config;
}

let applyScheduled = false;
function scheduleApply(): void {
  if (applyScheduled) return;
  applyScheduled = true;
  requestAnimationFrame(() => {
    applyScheduled = false;
    applyAll();
  });
}

function applyAll(): void {
  // Re-add the badge after soft navigation replaces the body.
  ensureBadge(() => openPanel(panelCtx));
  const url = location.href;
  const feedActive =
    config.features.feed.enabled && matchesAny(url, config.features.feed.urls);
  const rightActive =
    config.features.rightColumn.enabled &&
    matchesAny(url, config.features.rightColumn.urls);
  if (feedActive) applyFeed(config);
  if (rightActive) applyRightColumn(config);
}

function onChange(cfg: Config): void {
  config = cfg;
  saveConfig(config);
  scheduleApply();
}

function onReset(): void {
  config = cloneDefault();
  saveConfig(config);
  scheduleApply();
  openPanel(panelCtx); // rebuild with defaults
}

const panelCtx: PanelContext = {
  getConfig,
  onChange,
  onReset,
  loadOrgInfo
};

// Inject styles up front so filtering works before the panel is opened.
ensureStyles();
ensureBadge(() => openPanel(panelCtx));

// Tampermonkey menu command: settings only; reset lives in the panel footer.
if (typeof GM_registerMenuCommand === 'function') {
  GM_registerMenuCommand("GitHub Feed Filter Settings", () =>
    openPanel(panelCtx),
  );
}

// React to soft navigation and DOM changes.
for (const ev of ['turbo:load', 'turbo:frame-load', 'pjax:end']) {
  document.addEventListener(ev, () => setTimeout(scheduleApply, 0));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleApply();
});

if (document.body) {
  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.body, { childList: true, subtree: true });
}

// Stargazers feature (self-contained scheduler).
initStargazers(getConfig);

// Initial pass.
scheduleApply();