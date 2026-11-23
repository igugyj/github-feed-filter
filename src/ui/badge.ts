const BADGE_ID = "gff-badge";

/** Add the bottom-right settings badge if it is not present yet. */
export function ensureBadge(onOpen: () => void): void {
  if (document.getElementById(BADGE_ID)) return;
  const button = document.createElement("button");
  button.id = BADGE_ID;
  button.type = "button";
  button.className = "gff-badge";
  button.textContent = "Filter";
  button.title = "Open GitHub Feed Filter settings";
  button.setAttribute("aria-label", "Open GitHub Feed Filter settings");
  button.addEventListener("click", onOpen);
  (document.body || document.documentElement).appendChild(button);
}
