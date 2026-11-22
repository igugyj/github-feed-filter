import type { Config, Mode } from '../types';
import { RIGHT_ITEMS } from './labels';

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function ensurePlaceholder(el: Element, label: string): void {
  let ph = el.previousElementSibling as HTMLElement | null;
  if (!(ph && ph.dataset.gffRole === 'placeholder')) {
    ph = document.createElement('div');
    ph.dataset.gffRole = 'placeholder';
    ph.className = 'gff-placeholder';
    ph.addEventListener('click', () => {
      const expanded = el.classList.toggle('gff-expanded');
      ph!.classList.toggle('gff-expanded', expanded);
      setText(ph!, placeholderText(label, expanded));
    });
    el.parentElement!.insertBefore(ph, el);
  }
  if (!el.classList.contains('gff-expanded')) {
    setText(ph, placeholderText(label, false));
    ph.classList.remove('gff-expanded');
  } else {
    setText(ph, placeholderText(label, true));
    ph.classList.add('gff-expanded');
  }
}

function placeholderText(label: string, expanded: boolean): string {
  return expanded
    ? label + ' — click to collapse'
    : label + ' — collapsed, click to expand';
}

function removePlaceholder(el: Element): void {
  const ph = el.previousElementSibling as HTMLElement | null;
  if (ph && ph.dataset.gffRole === 'placeholder') ph.remove();
}

function applyMode(el: Element, mode: Mode, label: string): void {
  if (mode === 'hide') {
    el.classList.add('gff-hide');
    el.classList.remove('gff-collapsed');
    removePlaceholder(el);
  } else if (mode === 'collapse') {
    el.classList.remove('gff-hide');
    el.classList.add('gff-collapsed');
    ensurePlaceholder(el, label);
  } else {
    el.classList.remove('gff-hide', 'gff-collapsed', 'gff-expanded');
    removePlaceholder(el);
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