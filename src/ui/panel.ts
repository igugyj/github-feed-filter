import type { Config } from '../types';
import type { OrgInfo } from '../core/ownership';
import {
  CATEGORIES,
  STAR_GROUP,
  RIGHT_ITEMS,
  MODE_LABELS,
  SUB_MODE_LABELS
} from '../core/labels';
import { parseKeywords } from '../core/keywords';
import { refreshStargazersOrgs } from '../core/stargazers';
import { ensureStyles } from './styles';

export interface PanelContext {
  getConfig(): Config;
  onChange(cfg: Config): void;
  onReset(): void;
  loadOrgInfo(extra: readonly string[], force?: boolean): Promise<OrgInfo>;
}

let overlay: HTMLElement | null = null;

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && overlay && !overlay.hidden) closePanel();
});

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function segControl(
  scope: string,
  key: string,
  current: string,
  labels: { value: string; label: string }[]
): HTMLElement {
  const wrap = el('span', 'gff-seg');
  for (const opt of labels) {
    const b = el('button');
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

function row(labelText: string, control: HTMLElement, sub?: HTMLElement): HTMLElement {
  const r = el('div', 'gff-row');
  const l = el('span', 'gff-row-label', labelText);
  r.appendChild(l);
  r.appendChild(control);
  if (sub) r.appendChild(sub);
  return r;
}

function checkRow(
  id: string,
  labelText: string,
  checked: boolean,
  onChange: (checked: boolean) => void
): HTMLLabelElement {
  const label = el('label', 'gff-check-row');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  label.appendChild(input);
  label.appendChild(el('span', undefined, labelText));
  return label;
}

function statusText(info: OrgInfo): string {
  switch (info.source) {
    case 'github':
      return 'Organizations loaded from GitHub.';
    case 'cache':
      return 'Using the cached organization list.';
    case 'error':
      return 'Could not load organizations — add them manually below.';
    case 'logged-out':
      return 'Sign in to GitHub to detect your organizations.';
    default:
      return '';
  }
}

function orgsText(info: OrgInfo): string {
  if (info.source === 'logged-out') return '—';
  if (info.orgs.length === 0) return 'none detected';
  return info.orgs.join(', ');
}

function buildPanel(ctx: PanelContext): HTMLElement {
  const cfg = ctx.getConfig();

  const overlayEl = el('div', 'gff-overlay');
  overlayEl.id = 'gff-overlay';
  overlayEl.hidden = true;

  const dialog = el('div', 'gff-dialog');
  overlayEl.appendChild(dialog);

  // ---- Header ----
  const head = el('div', 'gff-head');
  head.appendChild(el('h2', undefined, 'GitHub Feed Filter'));
  const closeBtn = el('button', 'gff-close', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close settings');
  closeBtn.addEventListener('click', () => closePanel());
  head.appendChild(closeBtn);
  dialog.appendChild(head);

  // ---- Features ----
  dialog.appendChild(el('h3', undefined, 'Features'));

  // Feed
  dialog.appendChild(
    checkRow('gff-feed-enabled', 'Feed filter', cfg.features.feed.enabled, v => {
      cfg.features.feed.enabled = v;
      ctx.onChange(cfg);
    })
  );
  dialog.appendChild(el('div', 'gff-hint', 'Feed filter URLs (one per line):'));
  const feedUrls = el('textarea', 'gff-textarea') as HTMLTextAreaElement;
  feedUrls.id = 'gff-feed-urls';
  feedUrls.value = cfg.features.feed.urls.join('\n');
  dialog.appendChild(feedUrls);

  // Right column
  dialog.appendChild(
    checkRow(
      'gff-right-enabled',
      'Right column (Explore)',
      cfg.features.rightColumn.enabled,
      v => {
        cfg.features.rightColumn.enabled = v;
        ctx.onChange(cfg);
      }
    )
  );
  dialog.appendChild(el('div', 'gff-hint', 'Right column URLs (one per line):'));
  const rightUrls = el('textarea', 'gff-textarea') as HTMLTextAreaElement;
  rightUrls.id = 'gff-right-urls';
  rightUrls.value = cfg.features.rightColumn.urls.join('\n');
  dialog.appendChild(rightUrls);

  // Stargazers
  dialog.appendChild(
    checkRow('gff-stg-enabled', 'Stargazers button', cfg.features.stargazers.enabled, v => {
      cfg.features.stargazers.enabled = v;
      ctx.onChange(cfg);
    })
  );
  dialog.appendChild(el('div', 'gff-hint', 'Stargazer URLs (one per line):'));
  const stgUrls = el('textarea', 'gff-textarea') as HTMLTextAreaElement;
  stgUrls.id = 'gff-stg-urls';
  stgUrls.value = cfg.features.stargazers.urls.join('\n');
  dialog.appendChild(stgUrls);
  dialog.appendChild(
    checkRow(
      'gff-stg-onlyown',
      'Only my repositories and organizations',
      cfg.features.stargazers.onlyOwn,
      v => {
        cfg.features.stargazers.onlyOwn = v;
        ctx.onChange(cfg);
        refreshStargazersOrgs();
      }
    )
  );

  const viewerRow = el('div', 'gff-row');
  viewerRow.appendChild(el('span', 'gff-row-label', 'Signed in as:'));
  const viewerSpan = el('span', 'gff-row-label', '…');
  viewerSpan.id = 'gff-stg-viewer';
  viewerRow.appendChild(viewerSpan);
  dialog.appendChild(viewerRow);

  const orgsRow = el('div', 'gff-row');
  const orgsLabel = el('span', 'gff-row-label');
  orgsLabel.appendChild(document.createTextNode('Organizations: '));
  const orgsSpan = el('span', undefined, '…');
  orgsSpan.id = 'gff-stg-orgs';
  orgsLabel.appendChild(orgsSpan);
  orgsRow.appendChild(orgsLabel);
  const refreshBtn = el('button', 'gff-btn', 'Refresh');
  refreshBtn.type = 'button';
  orgsRow.appendChild(refreshBtn);
  dialog.appendChild(orgsRow);

  dialog.appendChild(el('div', 'gff-hint', 'Additional organizations (one per line):'));
  const extraOrgs = el('textarea', 'gff-textarea') as HTMLTextAreaElement;
  extraOrgs.id = 'gff-stg-extra';
  extraOrgs.value = cfg.features.stargazers.extraOrgs.join('\n');
  dialog.appendChild(extraOrgs);

  const statusEl = el('div', 'gff-status');
  statusEl.id = 'gff-stg-status';
  dialog.appendChild(statusEl);

  const refreshOrgs = async (force: boolean): Promise<void> => {
    const info = await ctx.loadOrgInfo(parseKeywords(extraOrgs.value), force);
    viewerSpan.textContent = info.viewer ?? 'not signed in';
    orgsSpan.textContent = orgsText(info);
    statusEl.textContent = statusText(info);
  };
  void refreshOrgs(false);
  refreshBtn.addEventListener('click', () => void refreshOrgs(true));

  // ---- Feed filters ----
  dialog.appendChild(el('h3', undefined, 'Feed filters'));
  for (const cat of CATEGORIES) {
    dialog.appendChild(
      row(cat.label, segControl('modes', cat.key, cfg.modes[cat.key], MODE_LABELS))
    );
  }

  // Stars & lists group
  const groupRow = el('div', 'gff-row');
  const groupLabel = el('span', 'gff-row-label', STAR_GROUP.label);
  const expandBtn = el('button', 'gff-group-toggle', '▸');
  expandBtn.type = 'button';
  expandBtn.title = 'Show sub-types';
  groupRow.appendChild(groupLabel);
  groupRow.appendChild(expandBtn);
  groupRow.appendChild(segControl('modes', 'star', cfg.modes.star, MODE_LABELS));
  dialog.appendChild(groupRow);

  const subWrap = el('div', 'gff-sub');
  subWrap.hidden = true;
  for (const child of STAR_GROUP.children) {
    subWrap.appendChild(
      row(child.label, segControl('modes', child.key, cfg.modes[child.key], SUB_MODE_LABELS))
    );
  }
  dialog.appendChild(subWrap);
  expandBtn.addEventListener('click', () => {
    subWrap.hidden = !subWrap.hidden;
    expandBtn.textContent = subWrap.hidden ? '▸' : '▾';
  });

  // ---- Keywords ----
  dialog.appendChild(el('h3', undefined, 'Keywords'));
  dialog.appendChild(
    checkRow('gff-kw-enabled', 'Block by keyword', cfg.keywords.enabled, v => {
      cfg.keywords.enabled = v;
      ctx.onChange(cfg);
    })
  );
  dialog.appendChild(
    row(
      'When matched',
      segControl('keywords', 'mode', cfg.keywords.mode, MODE_LABELS)
    )
  );
  dialog.appendChild(el('div', 'gff-hint', 'One keyword per line (case-insensitive substring):'));
  const kwList = el('textarea', 'gff-textarea') as HTMLTextAreaElement;
  kwList.id = 'gff-kw-list';
  kwList.value = cfg.keywords.list.join('\n');
  dialog.appendChild(kwList);

  // ---- Right column ----
  dialog.appendChild(el('h3', undefined, 'Right column'));
  for (const item of RIGHT_ITEMS) {
    dialog.appendChild(
      row(item.label, segControl('right', item.key, cfg.right[item.key], MODE_LABELS))
    );
  }
  dialog.appendChild(
    el('div', 'gff-hint', 'Hiding both removes the whole Explore sidebar.')
  );

  // ---- Time filter ----
  dialog.appendChild(el('h3', undefined, 'Time filter'));
  const tfRow = el('label', 'gff-check-row');
  const tfCheck = el('input') as HTMLInputElement;
  tfCheck.type = 'checkbox';
  tfCheck.id = 'gff-time-enabled';
  tfCheck.checked = cfg.timeFilter.enabled;
  const tfLabel = el('span', undefined, 'Hide items older than ');
  const tfNum = el('input', 'gff-num') as HTMLInputElement;
  tfNum.type = 'number';
  tfNum.id = 'gff-time-days';
  tfNum.min = '1';
  tfNum.max = '3650';
  tfNum.value = String(cfg.timeFilter.days);
  tfNum.disabled = !cfg.timeFilter.enabled;
  const tfUnit = el('span', undefined, ' day(s)');
  tfRow.appendChild(tfCheck);
  tfRow.appendChild(tfLabel);
  tfRow.appendChild(tfNum);
  tfRow.appendChild(tfUnit);
  dialog.appendChild(tfRow);
  dialog.appendChild(
    el(
      'div',
      'gff-hint',
      'Older cards are removed from the bottom and the "More" button is dropped.'
    )
  );

  // ---- Auto-load ----
  dialog.appendChild(el('h3', undefined, 'Auto-load'));
  const alRow = el('label', 'gff-check-row');
  const alCheck = el('input') as HTMLInputElement;
  alCheck.type = 'checkbox';
  alCheck.id = 'gff-autoload';
  alCheck.checked = cfg.autoLoad.enabled;
  alRow.appendChild(alCheck);
  alRow.appendChild(el('span', undefined, 'Auto-load feed (auto-expand while scrolling)'));
  dialog.appendChild(alRow);

  const alRow2 = el('label', 'gff-check-row');
  const alNum = el('input', 'gff-num') as HTMLInputElement;
  alNum.type = 'number';
  alNum.id = 'gff-autoload-pages';
  alNum.min = '0';
  alNum.value = String(cfg.autoLoad.maxPages);
  alNum.disabled = !cfg.autoLoad.enabled;
  alRow2.appendChild(alNum);
  alRow2.appendChild(el('span', undefined, 'Page limit (0 = unlimited)'));
  dialog.appendChild(alRow2);

  // ---- Footer ----
  const footer = el('div', 'gff-footer');
  const count = el('span', undefined, 'Hidden: 0 items');
  count.id = 'gff-count';
  const reset = el('button', 'gff-btn', 'Reset to defaults');
  reset.type = 'button';
  reset.id = 'gff-reset';
  footer.appendChild(count);
  footer.appendChild(reset);
  dialog.appendChild(footer);

  // ---- Event wiring ----

  // Segmented controls (delegated).
  dialog.addEventListener('click', ev => {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest('.gff-seg button') as HTMLButtonElement | null;
    if (!btn) return;
    const { scope, key, value } = btn.dataset;
    if (scope === 'modes' && key) {
      (cfg.modes as unknown as Record<string, string>)[key] = value!;
    } else if (scope === 'right' && key) {
      (cfg.right as unknown as Record<string, string>)[key] = value!;
    } else if (scope === 'keywords' && key) {
      (cfg.keywords as unknown as Record<string, string>)[key] = value!;
    } else {
      return;
    }
    for (const b of btn.parentElement!.children) {
      b.classList.toggle('gff-active', b === btn);
    }
    ctx.onChange(cfg);
  });

  // URL textareas.
  feedUrls.addEventListener('change', () => {
    cfg.features.feed.urls = parseKeywords(feedUrls.value);
    ctx.onChange(cfg);
  });
  rightUrls.addEventListener('change', () => {
    cfg.features.rightColumn.urls = parseKeywords(rightUrls.value);
    ctx.onChange(cfg);
  });
  stgUrls.addEventListener('change', () => {
    cfg.features.stargazers.urls = parseKeywords(stgUrls.value);
    ctx.onChange(cfg);
  });
  extraOrgs.addEventListener('change', () => {
    cfg.features.stargazers.extraOrgs = parseKeywords(extraOrgs.value);
    ctx.onChange(cfg);
  });

  // Keywords.
  kwList.addEventListener('change', () => {
    cfg.keywords.list = parseKeywords(kwList.value);
    ctx.onChange(cfg);
  });

  // Time filter.
  tfCheck.addEventListener('change', () => {
    cfg.timeFilter.enabled = tfCheck.checked;
    tfNum.disabled = !tfCheck.checked;
    ctx.onChange(cfg);
  });
  tfNum.addEventListener('change', () => {
    let v = parseInt(tfNum.value, 10);
    if (Number.isNaN(v) || v < 1) v = 1;
    if (v > 3650) v = 3650;
    tfNum.value = String(v);
    cfg.timeFilter.days = v;
    ctx.onChange(cfg);
  });

  // Auto-load.
  alCheck.addEventListener('change', () => {
    cfg.autoLoad.enabled = alCheck.checked;
    alNum.disabled = !alCheck.checked;
    ctx.onChange(cfg);
  });
  alNum.addEventListener('change', () => {
    let v = parseInt(alNum.value, 10);
    if (Number.isNaN(v) || v < 0) v = 0;
    alNum.value = String(v);
    cfg.autoLoad.maxPages = v;
    ctx.onChange(cfg);
  });

  // Reset.
  reset.addEventListener('click', () => ctx.onReset());

  // Close on overlay click / Escape.
  overlayEl.addEventListener('click', ev => {
    if (ev.target === overlayEl) closePanel();
  });

  return overlayEl;
}

/** Open (or reopen) the settings overlay. */
export function openPanel(ctx: PanelContext): void {
  ensureStyles();
  closePanel();
  overlay = buildPanel(ctx);
  document.body.appendChild(overlay);
  overlay.hidden = false;
}

/** Close the settings overlay if it is open. */
export function closePanel(): void {
  if (overlay && overlay.parentElement) overlay.remove();
  overlay = null;
}

export function isPanelOpen(): boolean {
  return !!overlay && !overlay.hidden;
}