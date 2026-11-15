# GitHub Feed Filter

> A Tampermonkey userscript that filters the new GitHub feed — hide, collapse or keep each kind of card, cut off old items by age, and auto-load the feed while you scroll. Fully configurable.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-%E2%89%A54.19-brightgreen)](https://www.tampermonkey.net/)

## Features

- **Three filtering modes**, configured independently per category:
  - `Show` — do not filter (default)
  - `Collapse` — replace the card with a one-line placeholder; click it to expand or fold again
  - `Hide` — hide the card entirely (uncheck to restore immediately)
- **Fine-grained categories** (recognized from the card's `data-hydro-view`, field `feed_card.card_type`):

  | Category                        | card_type                                                          |
  | ------------------------------- | ------------------------------------------------------------------ |
  | Merged pull requests            | `MERGED_PULL_REQUEST`                                              |
  | Releases                        | `RELEASE`                                                          |
  | Trending repositories           | `TRENDING_REPOSITORY`                                              |
  | Recommended for you             | `REPOSITORY_RECOMMENDATION` (`STARRED` / `CONTRIBUTED`)            |
  | Popular among people you follow | `REPOSITORY_RECOMMENDATION` (`FOLLOWED`)                           |
  | Created repositories            | `CREATED_REPOSITORY`                                               |
  | Forked repositories             | `FORKED_REPOSITORY`                                                |
  | Made public                     | `PRIVATE_TO_PUBLIC_REPOSITORY`                                     |
  | Follows                         | `FOLLOW`                                                           |
  | Other activity                  | fallback for unrecognized cards                                    |
  | **Stars & lists** (group)       | `STARRED_REPOSITORY`, `ADDED_TO_LIST`; sub-items support `Inherit` |

- **Right column (Explore)**: `Universe banner` and `Changelog` can be filtered separately; **when both are set to Hide, the whole sidebar is removed as well**.
- **Time filter** (off by default): set a threshold in days (default 3). Cards older than the threshold are no longer shown, the feed ends with a "You've reached the end of the feed" marker, and the `More` button is removed.
- **Auto-load** (off by default): when enabled, scrolling to the bottom of the feed automatically clicks `More` to load the next page — no manual clicks needed. Page limit defaults to 30 (enter `0` for unlimited); loading stops when the time cutoff is reached or the tab is backgrounded.
- **Live counter and reset**: the panel shows how many items are currently filtered, and `Reset to defaults` restores everything in one click.
- Changes apply immediately and are persisted (`GM_setValue`) — no page reload required.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (>= 4.19).
2. Open [`github-feed-filter.user.js`](github-feed-filter.user.js); Tampermonkey will show its install page automatically. Alternatively, copy the file contents into a new script and save it.
3. Visit <https://github.com/feed>. A **Filter settings** button appears next to the native `Filter` button, to the right of the `Feed` heading.

> The script only matches `https://github.com/feed*` and does not run on any other page.

## Usage

Click **Filter settings** to open the panel:

```
FEED FILTERS
  Merged pull requests        [Show|Collapse|Hide]
  Releases                    [Show|Collapse|Hide]
  Trending repositories       [Show|Collapse|Hide]
  ...
  Stars & lists          >    [Show|Collapse|Hide]   (expand for sub-items)
                                Starred repositories  [Inherit|Show|Collapse|Hide]
                                Added to a list       [Inherit|Show|Collapse|Hide]

RIGHT COLUMN
  Universe banner              [Show|Collapse|Hide]
  Changelog                    [Show|Collapse|Hide]
  Hiding both removes the whole Explore sidebar.

TIME FILTER
  [ ] Hide items older than [3] day(s)

LOADING
  [ ] Auto-load feed (auto-expand while scrolling)
  Page limit [30] (0 = unlimited)

Hidden: 42 items                [Reset to defaults]
```

- Every change takes effect immediately and is saved automatically.
- Cards in `Collapse` mode become a placeholder row; click the placeholder to temporarily expand that card.
- The panel closes when you click outside it or press `Esc`.

## How it works

Each item in the new feed is an `<article class="js-feed-item-component">` carrying an inline JSON blob in its `data-hydro-view` attribute:

```json
{
  "payload": {
    "feed_card": {
      "card_type": "MERGED_PULL_REQUEST",
      "resource_relationship": "STARRED",
      "created_at": "2026-11-14T20:14:04.000-08:00",
      "gatherer": "pullrequest_for_you_feed_mysql"
    }
  }
}
```

The script uses `card_type` (plus `resource_relationship`) as the classification key, falling back to the card's text when the attribute is missing or unparsable. Grouped cards (for example "starred 3 repositories") nest child `<article>` elements; only top-level cards are processed, so children follow their parent automatically. Because the feed appends content through an infinitely scrolling turbo-frame, a `MutationObserver` keeps applying the current configuration to newly added cards (idempotently).

## Development and tests

```bash
npm install            # dev dependencies (jsdom)
npm run lint           # syntax check
npm run test:classify  # classification tests (6 groups)
npm run test:dom       # DOM behaviour tests (9 groups, requires jsdom)
npm test               # all of the above
```

- Tests run against `example/Feed.htm`, a locally saved copy of the feed page. That directory is gitignored because the sample contains personal data; drop your own saved page there to run the tests.
- `test/classify.test.js` runs in plain Node; `test/dom.test.js` loads the sample into jsdom and exercises the full userscript.

## Feedback

- Bug reports and feature requests: open an [Issue](https://github.com/igugyj/github-feed-filter/issues)
- Usage questions are welcome too — tag them with `[Question]` in the title
- Pull requests: target the `main` branch, keep the script a single file, and keep the UI copy in English

When reporting a problem, the following information helps a lot:

1. Tampermonkey version and browser
2. URL of the page where the problem occurs
3. Console (F12) error output
4. The relevant script settings (a panel screenshot is enough)

## License

[MIT](LICENSE) (c) 2026 Pfolg
