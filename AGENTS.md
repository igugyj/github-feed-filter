# AGENTS.md

Tampermonkey userscript for GitHub. TypeScript sources in `src/` are bundled by esbuild into one IIFE. Single package; no framework, linter, formatter, or test runner.

## Commands

- `npm ci` - install from the committed lockfile.
- `npm test` - build, typecheck, unit + source tests, then DOM tests. Run before committing.
- `npm run build` - writes `github-feed-filter.user.js` at the repo root (gitignored).
- `npm run typecheck` - `tsc --noEmit`.
- `npm run test:unit` / `test:coverage` / `test:dom` - individual suites.
- `npm run coverage` - `test:all` under c8; writes `coverage/coverage-summary.json`.

Tests are standalone `tsx` scripts using an `ok()` helper, not a framework. There is no single-test flag; isolate by editing/skipping tests in the file.

## Testing gotchas

- `test/dom.test.ts` reads `github-feed-filter.user.js` from the repo root at import time. Run `npm run build` first (`npm test` does).
- `test/coverage.test.ts` imports `src/` modules directly because the bundled eval contributes no source coverage. It installs jsdom globals before importing `src/ui/panel.ts` (module-scope `document` listener) and imports `src/main.ts` last (boots observers and menu commands). It ends with `process.exit(0)` to stop the stargazers interval.
- `scripts/gen-readme.mjs` parses the summary lines `N unit tests passed.`, `N source tests passed.`, and `N DOM tests passed.`; keep that wording or update its regexes.

## Build and release

- `build/build.mjs` bundles `src/main.ts` with the banner from `build/banner.txt` (`{{VERSION}}` defaults to `package.json`). `--version`/`GFF_VERSION` and `--outfile`/`GFF_OUTFILE` override.
- `master` is the source/default branch. The `release` branch is generated and contains only `main.js` and `README.md`; never edit it by hand.
- `.github/workflows/release.yml` runs on `v*` tags or manual dispatch: builds the root bundle, copies it to `dist/main.js`, writes coverage + DOM test logs to `.ci/`, generates `dist/README.md`, then pushes the two artifacts to `release`.
- `scripts/gen-readme.mjs` requires `dist/main.js`, `coverage/coverage-summary.json`, `.ci/tests.log`, and `.ci/dom.log`; the workflow supplies its `GFF_*` env vars.
- `README.md` is the source README; `README.template.md` is only the template for the generated release README.
- The artifact is named `main.js`, so Tampermonkey does not auto-open its install page. The banner carries `@downloadURL`/`@updateURL` for the release branch.

## Repo conventions

- UI copy and docs are English, no emoji.
- Config is schema v2 at `gff-config-v2`; `gff-config-v1` is migrated on load and left in place. The org cache key is `gff-orgs-v1`.
- Feed, right column, and Stargazers are URL-gated and independently toggleable. Defaults: `https://github.com/feed*`, `https://github.com/`, `https://github.com/*/*`.
- The time filter uses each card's own visible `relative-time`; cards without one (recommendations, trending) are ignored instead of falling back to `created_at`, which can be a batch/creation date.
- Keyword matching is case-insensitive substring only (no regex); keyword mode overrides the category mode.
- Feature modules are idempotent and rerun on DOM mutations. Collapsed cards/items are wrapped by `src/core/collapse.ts`; update its header or the end marker through `setText()` to avoid MutationObserver feedback loops.
- Settings live in a full-screen overlay opened from the bottom-right badge or the single Tampermonkey `Settings` menu command; reset stays in the panel footer.
- The Stargazers button is only injected when `meta[name="user-login"]` exists; logged-out GitHub returns 404 for `/stargazers`.
- `github-feed-filter.user.js`, `dist/`, `coverage/`, `.ci/`, `example`, and `r.js` are gitignored/local-only.

## Entry points

- `src/main.ts` - config load, styles, menu commands, navigation listeners, MutationObserver, initial apply.
- `src/config/` - defaults/normalization and GM/localStorage persistence.
- `src/core/` - classification, collapse wrapper, feed filtering, right column, URL scope, keywords, ownership, stargazers.
- `src/ui/` - injected styles, the bottom-right badge, and the settings overlay.
