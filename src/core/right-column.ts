import type { Config, Mode } from '../types';
import { RIGHT_ITEMS } from './labels';
import { applyCollapse, removeCollapse } from './collapse';

function applyMode(el: Element, mode: Mode, label: string): void {
  if (mode === 'hide') {
    removeCollapse(el);
    el.classList.add('gff-hide');
  } else if (mode === 'collapse') {
    el.classList.remove('gff-hide');
    applyCollapse(el, label);
  } else {
    removeCollapse(el);
    el.classList.remove('gff-hide');
  }
}

/** Apply the right-column (Explore) filtering. */
export function applyRightColumn(cfg: Config): void {
  const aside = document.querySelector('aside.feed-right-column');
  if (!aside) return;
  let visibleParts = 0;
  for (const item of RIGHT_ITEMS) {
    const sel = item.key === 'banner' ? '.js-notice.marketing-banner' : '.dashboard-changelog';
    const el = aside.querySelector(sel);
    if (!el) continue;
    const mode = cfg.right[item.key] || 'show';
    applyMode(el, mode, item.label);
    if (mode !== 'hide') visibleParts++;
  }
  // Both big elements hidden -> remove the whole aside as well.
  aside.classList.toggle('gff-hide', visibleParts === 0);
}