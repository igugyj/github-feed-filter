const WRAPPER_ROLE = 'collapse';
const HEADER_ROLE = 'collapse-header';

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function headerText(label: string, expanded: boolean): string {
  return expanded
    ? label + ' — click to collapse'
    : label + ' — collapsed, click to expand';
}

function wrapperFor(el: Element): HTMLElement | null {
  const parent = el.parentElement;
  return parent && parent.dataset.gffRole === WRAPPER_ROLE
    ? (parent as HTMLElement)
    : null;
}

function headerFor(wrapper: HTMLElement): HTMLElement | null {
  const header = wrapper.firstElementChild as HTMLElement | null;
  return header && header.dataset.gffRole === HEADER_ROLE ? header : null;
}

const labels = new WeakMap<HTMLElement, string>();
const toggles = new WeakMap<HTMLElement, () => void>();

function createWrapper(el: Element): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'gff-collapse';
  wrapper.dataset.gffRole = WRAPPER_ROLE;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'gff-collapse-header';
  header.dataset.gffRole = HEADER_ROLE;

  wrapper.appendChild(header);
  el.parentElement!.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  header.addEventListener('click', () => {
    const expanded = el.classList.toggle('gff-expanded');
    wrapper.classList.toggle('gff-expanded', expanded);
    header.setAttribute('aria-expanded', String(expanded));
    setText(header, headerText(labels.get(wrapper) || '', expanded));
    toggles.get(wrapper)?.();
  });

  return wrapper;
}

/** Wrap `el` in a collapsible container and refresh its header text. */
export function applyCollapse(el: Element, label: string, onToggle?: () => void): void {
  let wrapper = wrapperFor(el);
  if (!wrapper) {
    if (!el.parentElement) return;
    wrapper = createWrapper(el);
  }
  labels.set(wrapper, label);
  if (onToggle) toggles.set(wrapper, onToggle);

  const header = headerFor(wrapper);
  if (!header) return;

  const expanded = el.classList.contains('gff-expanded');
  wrapper.classList.toggle('gff-expanded', expanded);
  header.setAttribute('aria-expanded', String(expanded));
  setText(header, headerText(label, expanded));

  el.classList.add('gff-collapsed');
  el.classList.remove('gff-hide');
}

/** Move `el` back out of its collapsible container and remove the container. */
export function removeCollapse(el: Element): void {
  const wrapper = wrapperFor(el);
  if (wrapper) {
    if (wrapper.parentElement) wrapper.parentElement.insertBefore(el, wrapper);
    wrapper.remove();
  }
  el.classList.remove('gff-collapsed', 'gff-expanded');
}
