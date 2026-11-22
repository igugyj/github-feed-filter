const STYLE_ID = 'gff-style';

export const CSS = `
.gff-hide { display: none !important; }
.gff-collapsed:not(.gff-expanded) { display: none !important; }

.gff-placeholder {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; margin: 4px 0;
  border: 1px dashed var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  background: var(--bgColor-muted, rgba(175,184,193,.2));
  color: var(--fgColor-muted, #656d76);
  font-size: 12px; cursor: pointer; user-select: none;
}
.gff-placeholder:hover { border-color: var(--fgColor-muted, #656d76); }
.gff-placeholder::before { content: "\\25B8"; font-size: 10px; }
.gff-placeholder.gff-expanded::before { content: "\\25BE"; }

.gff-end-marker {
  padding: 24px 16px; text-align: center;
  color: var(--fgColor-muted, #656d76);
  font-size: 14px;
  border-top: 1px solid var(--borderColor-muted, #d8dee4);
  margin-top: 8px;
}

/* ---------- Settings overlay ---------- */

.gff-overlay {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(1,4,9,.55);
  padding: 24px;
}
.gff-overlay[hidden] { display: none; }

.gff-dialog {
  width: min(760px, 96vw);
  max-height: 90vh; overflow-y: auto;
  background: var(--bgColor-default, #fff);
  color: var(--fgColor-default, #1f2328);
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(1,4,9,.45);
  padding: 18px 22px 22px;
  font-size: 13px;
  text-align: left;
}
.gff-dialog h2 {
  margin: 0 0 4px; font-size: 16px; font-weight: 600;
}
.gff-dialog h3 {
  margin: 16px 0 6px; font-size: 12px; font-weight: 600;
  color: var(--fgColor-muted, #656d76);
  text-transform: uppercase; letter-spacing: .04em;
  border-bottom: 1px solid var(--borderColor-muted, #d8dee4);
  padding-bottom: 4px;
}
.gff-dialog h3:first-of-type { margin-top: 8px; }

.gff-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
}
.gff-close {
  background: transparent; border: 0; cursor: pointer;
  font-size: 20px; line-height: 1; color: var(--fgColor-muted, #656d76);
  padding: 2px 6px; border-radius: 6px;
}
.gff-close:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }

.gff-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 3px 0;
}
.gff-row-label { flex: 1; min-width: 0; }
.gff-row-label small {
  display: block; color: var(--fgColor-muted, #656d76); font-size: 11px;
}

.gff-seg {
  display: inline-flex; flex-shrink: 0;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px; overflow: hidden;
}
.gff-seg button {
  padding: 2px 9px; font-size: 12px; line-height: 18px;
  background: transparent; border: 0; cursor: pointer;
  color: var(--fgColor-muted, #656d76);
}
.gff-seg button + button { border-left: 1px solid var(--borderColor-default, #d0d7de); }
.gff-seg button:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }
.gff-seg button.gff-active {
  background: var(--bgColor-accent-emphasis, #0969da);
  color: var(--fgColor-onEmphasis, #fff);
  font-weight: 600;
}

.gff-group-toggle {
  background: transparent; border: 0; cursor: pointer; padding: 0 4px;
  color: var(--fgColor-muted, #656d76); font-size: 10px;
}
.gff-sub {
  padding-left: 14px; border-left: 2px solid var(--borderColor-muted, #d8dee4);
  margin-left: 3px;
}
.gff-sub[hidden] { display: none; }

.gff-check-row {
  display: flex; align-items: center; gap: 7px; padding: 4px 0;
  cursor: pointer;
}
.gff-check-row input { cursor: pointer; }

.gff-num, .gff-text, .gff-textarea {
  padding: 3px 6px; font-size: 12px;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  background: var(--bgColor-default, #fff);
  color: var(--fgColor-default, #1f2328);
}
.gff-num { width: 64px; }
.gff-text { width: 220px; }
.gff-textarea {
  width: 100%; min-height: 72px; resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.5;
}
.gff-textarea[disabled], .gff-num[disabled] { opacity: .55; }

.gff-hint { color: var(--fgColor-muted, #656d76); font-size: 11px; margin: 2px 0 6px; }
.gff-status { color: var(--fgColor-muted, #656d76); font-size: 11px; margin-top: 4px; }

.gff-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-top: 14px; padding-top: 10px;
  border-top: 1px solid var(--borderColor-muted, #d8dee4);
  color: var(--fgColor-muted, #656d76); font-size: 12px;
}
.gff-btn {
  padding: 4px 12px; font-size: 12px; cursor: pointer;
  background: transparent;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  color: var(--fgColor-default, #1f2328);
}
.gff-btn:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }
`;

export function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}