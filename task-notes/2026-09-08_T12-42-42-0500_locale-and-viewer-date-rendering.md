Timestamp: 2026-09-08T12:42:42-05:00

# British English locale and viewer-formatted dates

The application now uses a shared `en-GB` locale for deterministic build-time and maintenance behavior. Visible semantic video dates are formatted in the visitor's browser according to the visitor's system locale. Canonical timestamps and calendar dates remain UTC so regional formatting cannot move a date across a time-zone boundary.

## Final behavior

- `src/locale.ts` exports `britishEnglishLocale` as the shared `en-GB` constant for repository and Astro build code.
- Build-time sorting, case normalization, count formatting and diagnostics use the shared British English locale instead of scattered `en-US` or generic `en` literals.
- Generated `videoDateLabel` values use a deterministic British English fallback, such as `6 Sept 2026`.
- Browser-visible `<time datetime="...">` values use `Intl.DateTimeFormat(undefined, ...)`, which selects the visitor's browser or system locale.
- Date formatting keeps `timeZone: "UTC"` and retains the original ISO `datetime` attribute.
- The browser date formatter runs on static page dates and observes later DOM additions, including dates inserted into Pagefind search results.
- Invalid `datetime` values retain their generated fallback text.
- JavaScript-disabled pages, static metadata and the generated search index retain the deterministic British English fallback because a static build has no viewer locale.

## Implementation details

Pagefind derives its index language bucket from the document `lang` attribute, and the production search contract uses the `en` bucket. The layout therefore keeps `lang="en"` and exposes the application locale separately as `data-site-locale="en-GB"`. Standalone emitted search assets read that data attribute for deterministic search normalization and tie-breaking.

Files imported with Astro's `?url` query are emitted as standalone browser assets. Those assets do not import `src/locale.ts` at runtime. Server-rendered Astro modules import the shared constant normally, while browser assets receive the application locale through the document data attribute.

The rendered-date validator remains regional-format agnostic for visible labels. It continues to require canonical ISO timestamps, nonempty generated labels and exact agreement between generated data, rendered HTML and Pagefind metadata.

Natural topic sorting uses British English collation with `numeric: true`, so numbered slugs and aliases sort as `series-9`, `series-54`, `series-100`.

## Files changed

- `src/locale.ts` - Define the shared British English locale.
- `site/src/layouts/BaseLayout.astro` - Publish the application locale data attribute and load the global viewer-date formatter while preserving the Pagefind `en` language bucket.
- `site/src/scripts/localize-dates.js` - Format static and dynamically inserted semantic dates with the viewer locale, reuse one default formatter and preserve UTC.
- `src/site/localize-dates.test.ts` - Cover US and GB display order and invalid-date fallback behavior.
- `src/site/archive-data.ts` - Use British English for generated date and numeric fallback labels.
- `src/site/archive-data.test.ts` - Assert the deterministic British English generated date label.
- `src/site/rendered-video-date-validation.ts` - Validate canonical timestamps without prescribing one regional visible-date layout.
- `src/site/rendered-video-date-validation.test.ts` - Cover British English generated labels and alternate regional labels.
- `site/src/scripts/site-search.js` - Read the application locale from the document data attribute for cache keys while remaining a standalone emitted asset.
- `site/src/scripts/search-ranking.js` - Use the document application locale in browsers and an `en-GB` fallback in Node tests.
- `site/src/components/ArchivePagination.astro` - Format pagination counts with British English.
- `site/src/data/archive.ts` - Use British English collation for public topic, video and segment ordering tie-breaks.
- `site/src/pages/index.astro` - Use British English collation for featured-watch-point tie-breaks.
- `site/src/pages/search-topic-lookup.json.ts` - Use British English normalization and deterministic lookup ordering.
- `site/src/pages/topics/browse/all.astro` - Use British English case conversion and count formatting.
- `site/src/pages/topics/index.astro` - Use British English topic ordering and count formatting.
- `site/src/pages/videos/index.astro` - Use British English video-count formatting.
- `src/content/schemas/site-content-processing-config.ts` - Use British English case folding for case-insensitive duplicate checks.
- `src/content/video-topic-usage-report.ts` - Use British English collation throughout topic report ordering.
- `src/scripts/check-pagefind-contract.ts` - Format reported page counts with British English.
- `src/scripts/check-search-ranking.ts` - Use British English for diagnostic numbers, normalization and deterministic tie-breaks.
- `src/scripts/rank-video-segment-audit-risk.ts` - Use British English case folding for normalized titles.
- `src/scripts/site-validation-output.ts` - Format validation counts and byte totals with British English.
- `src/scripts/sort-video-segment-topics.ts` - Use natural British English ordering for authored topic arrays and British English path case folding on Windows.
- `src/scripts/sort-video-segment-topics.test.ts` - Cover natural numeric topic ordering.
- `src/scripts/sort-video-segments-by-start.ts` - Use British English path case folding on Windows.
- `src/scripts/sort-video-topic-registry.ts` - Use natural British English ordering for topic records and aliases and British English path case folding on Windows.
- `src/scripts/sort-video-topic-registry.test.ts` - Cover natural numeric registry and alias ordering.
- `src/site/seo-validation.ts` - Format oversized-page diagnostic byte counts with British English.

## Browser verification

The same production build was opened in headless Chrome with the locale overridden through the Chrome DevTools protocol.

| Surface | `en-US` viewer | `en-GB` viewer | Canonical timestamp |
| --- | --- | --- | --- |
| Home page latest-video date | `Sep 6, 2026` | `6 Sept 2026` | `2026-09-06T18:51:37Z` |
| Pagefind search-result date | `Mar 6, 2025` | `6 Mar 2025` | `2025-03-06T19:59:14Z` |

Both browser runs loaded the search page without JavaScript errors. The document retained `lang="en"`, exposed `data-site-locale="en-GB"`, and displayed each semantic date using the simulated viewer locale.

## Validation

- `npm test` passed: 274 tests.
- `npm run site:check:generated` passed: 33 Astro files, zero errors, warnings or hints.
- `npm run generate:site-data` passed: 2,165 videos, 69,352 segments and 29,823 topics.
- `npm run site:build:astro` passed.
- `npm run site:build:pagefind` passed: one `en` language index and 101,316 indexed pages.
- `npm run check:rendered-video-dates` passed: 2,165 videos, 103,435 HTML files, 743,482 semantic dates and 101,316 Pagefind fragments.
- Focused locale, rendered-date and search-ranking tests passed after final source changes.
- `git diff --check` passed.
