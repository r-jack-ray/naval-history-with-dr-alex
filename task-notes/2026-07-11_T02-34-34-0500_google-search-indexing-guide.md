Timestamp: 2026-07-11T02:34:34-05:00
Last updated: 2026-07-11T04:24:13-05:00

# Google Search Discovery and Indexing Implementation Plan

## Status

Planning only. This revision records the repository, generated-output, deployed-site, and current official-documentation audit. It resolves route eligibility, oversized crawl hubs, metadata fallbacks, validation architecture, and local-versus-deployed acceptance. Do not implement it until implementation is explicitly authorized.

## Project

- Repository: `https://github.com/r-jack-ray/naval-history-with-dr-alex`
- Production site: `https://r-jack-ray.github.io/naval-history-with-dr-alex/`
- Hosting: GitHub Pages project site
- Framework: Astro 7 static output
- Search index: Pagefind, generated after the Astro build
- Production origin: `https://r-jack-ray.github.io`
- Astro base path: `/naval-history-with-dr-alex`

## Objective

Make every substantive study-guide page discoverable, self-canonical, and technically indexable without changing transcript-backed editorial content, adding keyword-stuffed text, or promising rankings.

The implementation can improve crawling and indexing signals. It cannot guarantee that Google will crawl, index, or rank every URL.

## Current Audit Snapshot

Audit date: 2026-07-11.

### Repository findings

- `astro.config.mjs` already sets the correct production origin and GitHub Pages base path.
- The site is statically rendered. Primary video, segment, topic, index, and navigation content is present in HTML; JavaScript is only required for interactive search and theme switching.
- The actual public route model is:
  - `/`
  - `/videos/` and `/videos/<slug>/`
  - `/segments/` and `/segments/<slug>/`
  - `/topics/` and `/topics/<slug>/`
  - `/search/`
- There are no separate question routes. Q&A entries are `kind: qa` segments under `/segments/<slug>/`.
- The checked-in generated archive currently contains 788 videos, 13,021 segments, and 8,761 topics. Including the five static/index routes, the current build has 22,575 HTML routes before pagination or sitemap exclusion.
- Those counts describe `site/src/data/generated/archive.json`, not a settled live-source snapshot. Lock-free transcript lanes were actively adding shards during this audit. Recompute all counts after a coordinated quiet generation window.
- The current local generated indexes are too large to support the existing complete-link-discovery claim:
  - `site/dist/videos/index.html`: 543,626 bytes
  - `site/dist/segments/index.html`: 11,048,613 bytes
  - `site/dist/topics/index.html`: 2,298,433 bytes
  - `site/dist/search/index.html`: 21,048,373 bytes
- Google currently documents a 2 MB uncompressed fetch limit for Googlebot on supported file types. The Segment index exceeds it substantially and the Topic index exceeds it. Static pagination is therefore part of this indexing task, not an optional performance follow-up.
- `BaseLayout.astro` accepts page-specific titles and descriptions and provides base-aware navigation and assets, but the current metadata is not uniformly complete or distinct:
  - The archive contains three duplicate video-title groups, four duplicate segment-title groups, and one duplicate topic-title group.
  - Sixteen current Q&A segments have no `summary`; their route passes that empty value directly to the description meta element.
  - Video descriptions include the title but are otherwise generic.
  - Topic pages use stored summaries, but 8,573 of 8,761 are deterministic synchronizer scaffold text rather than custom summaries.
- Thirty-four current topics have both `videoCount: 0` and `segmentCount: 0`. They are registry records, not substantive public landing pages, and should not produce public archive routes or sitemap entries until referenced.
- If the checked-in snapshot were implemented unchanged, filtering those topics and paginating at 500 records would yield 27 Segment index pages, 18 Topic index pages, 22,584 HTML routes, and 22,583 sitemap URLs. These are audit expectations only; derive final counts from the settled implementation archive.
- All 788 current videos have an ISO 8601 `publishedAt` date-time with an explicit timezone, an absolute video-specific thumbnail URL, and an embed URL. Source metadata also has a valid ISO 8601 duration for all 788, but the generated archive currently preserves only a human-readable duration label.
- No canonical link, robots meta support, Open Graph metadata, Twitter card metadata, or JSON-LD is emitted by the shared layout.
- No sitemap package is installed or configured.
- No `robots.txt` exists under `site/public/`. That is appropriate for the current project-site hosting: a file deployed at `/naval-history-with-dr-alex/robots.txt` would be below the host root and would not be a valid robots control file.
- No template contains an accidental `noindex` or `nofollow` directive.
- Internal discovery relationships are already strong in source: indexes link to dynamic detail pages, video pages link to their segments, segments link to source videos and topics, and topic pages link to related segments and videos. Oversized index responses currently prevent treating all of those links as Google-visible.
- The Search page renders navigation and topic starting points in static HTML, but query results are client-generated. It should remain usable but should not be a search landing page in Google.

### Deployed-site findings

Read-only checks against production were repeated at 2026-07-11T04:13:43-05:00 and found:

- Homepage: HTTP 200.
- Project-path `https://r-jack-ray.github.io/naval-history-with-dr-alex/robots.txt`: HTTP 404.
- Host-root `https://r-jack-ray.github.io/robots.txt`: HTTP 404, which means no host-level crawl restrictions were found.
- `sitemap-index.xml`: HTTP 404.
- `sitemap.xml`: HTTP 404.
- Homepage head: no canonical, robots meta, Open Graph block, or JSON-LD.
- Homepage: crawlable internal links are present in delivered HTML.

## Decisions

1. Use the official `@astrojs/sitemap` integration instead of a custom sitemap generator.
2. Treat `sitemap-index.xml` as the public submission endpoint. The Astro integration emits an index plus numbered child sitemap files; do not require a separate hand-authored `sitemap.xml`.
3. Keep the integration's default 45,000-entry limit. The current post-filter route count should produce one `sitemap-0.xml`, but validation must discover children from the index instead of hard-coding that assumption.
4. Treat a topic as a public route only when it has at least one related video or segment. Filter zero-relation topics from the generated public archive without deleting or rewriting the shared topic registry.
5. Paginate Segment and Topic indexes at 500 records per page. Preserve `/segments/` and `/topics/` as page 1; add `/segments/page/<n>/` and `/topics/page/<n>/` for `n >= 2`.
6. Give every pagination page ordinary previous/next and page-navigation anchors, a self-canonical, a stable trailing-slash URL, and sitemap inclusion. Do not canonicalize later pages to page 1, and do not use fragments or JavaScript-only controls for pagination.
7. Include the homepage, video index and detail pages, all paginated Segment and Topic indexes, and every substantive video, segment, and topic detail page in the sitemap.
8. Exclude `/search/` from the sitemap and emit only `noindex` on that page. The absence of `nofollow` preserves normal link discovery; an explicit positive `follow` token is unnecessary.
9. Use absolute self-canonicals with the production origin, repository base path, and trailing slash. The shared layout may also emit a self-canonical on Search for consistency, but it is not an indexing signal for a noindexed page.
10. Centralize canonical, robots, social, and JSON-LD serialization in `BaseLayout.astro` or one small shared SEO component. Pass page-specific values from routes.
11. Keep visible headings and transcript-backed body text unchanged. Improve metadata deterministically from already visible/archive-backed facts:
    - Disambiguate duplicate video SEO names with the ISO publication date; use the video ID only as a final fallback if title plus date is still duplicated.
    - Include the source video title and timestamp context in Segment page titles.
    - Use `summary`, then `answerShort`, then `body` as the nonempty Segment description fallback order, with whitespace normalization and a bounded metadata-only length.
    - Build the video description from its title, time-note count, and up to four linked topics; use the same description in the visible lede, meta, social metadata, and `VideoObject`.
    - Treat remaining duplicate Topic titles and scaffold summaries as a reported taxonomy/content follow-up, not a reason to invent keywords or expose slugs in public titles.
12. Add `VideoObject` only to video-guide pages, where the embedded video and all required values are available. Missing required values should fail generated-output validation rather than emit partial markup.
13. Extend the generated archive with an optional source-preserved `durationIso` value. Copy it only from a valid YouTube ISO 8601 duration; never reconstruct it from `durationLabel`.
14. Do not mark segment pages as standalone `VideoObject` pages. They describe moments within the source video.
15. Add matching visible and JSON-LD breadcrumbs to video, segment, and topic detail pages:
    - Videos > current video
    - Videos > source video > current time note
    - Topics > current topic
16. Do not add FAQ, QAPage, Article, BroadcastEvent, or Clip markup in this task:
    - Q&A segments are not an eligible public forum or publisher FAQ feature.
    - Segment pages are study-guide notes, not separate articles or videos.
    - Archived streams are not currently live.
    - The site does not provide a same-page seek URL contract required for accurate Clip links.
17. Defer `WebSite` site-name markup while the site remains a GitHub Pages subdirectory. Google does not support site-name selection at the subdirectory level.
18. Do not add analytics, tracking scripts, paid SEO tooling, or automated Search Console API credentials.
19. Do not add `site/public/robots.txt` while the site is hosted below `/naval-history-with-dr-alex/`. Google only applies `robots.txt` at the protocol-and-host root (`https://r-jack-ray.github.io/robots.txt`), which this repository does not deploy. A missing root file permits crawling by default. Submit the sitemap directly through Search Console instead.
20. Retain Astro's documented `<link rel="sitemap">` head hint as a general-crawler hint, but do not describe it as a Google submission method. Search Console submission is the Google-critical discovery step.
21. Defer externalizing the large Search-page JSON payload to a separate performance task. Search remains crawlable so Google can read its early head `noindex`, but it is excluded from the indexable-page size gate.
22. Store the durable owner runbook at `docs/operations/google-search-console-setup.md`, which is tracked but not deployed by the Astro build. Keep the implementation evidence report under ignored `reports/` output.

## Implementation Plan

### Phase 0: Stable implementation snapshot

- Use a clean dedicated implementation worktree based on a settled commit. If that is unavailable, require the repository owner to confirm that all generator inputs and `src/derived/video-segments/topics.json` are settled, synchronized, and committed before generation.
- Inspect `git status --short --branch` and diffs for every target file before editing. Preserve unrelated changes outside the dedicated scope.
- Coordinate a quiet content-pipeline window before the first shared generation. No lock-free transcript lane may be writing shards while `generate:site-data` reads them, and existing untracked shards from another checkout must not be ingested implicitly.
- Do not claim existing untracked shards, schedule rows, lane logs, the dirty stylesheet, or other transcript outputs as indexing changes.
- Generate shared archive data only once in the final validation sequence. `generate:site-data` synchronizes `topics.json` before writing the archive, so an unstable input window is a stop condition.
- If generation changes `src/derived/video-segments/topics.json`, stop before accepting generated output and return registry synchronization to the content coordinator. Among shared derived outputs, the indexing implementation may legitimately change only the generated archive through topic filtering and `durationIso` support.
- Recompute archive counts, orphan-topic count, metadata gaps, pagination count, and generated file sizes from that stable snapshot. Record them in the implementation report.

### Phase 1: Public route eligibility and crawlable pagination

- Update the archive generator so only topics with at least one related video or segment appear in `SiteArchiveData.topics`. Leave `src/derived/video-segments/topics.json` unchanged.
- Add generator unit coverage proving that an unreferenced topic remains valid registry data but does not become a public archive route.
- Define the 500-record page size and pagination route builders once in pure `src/site/search-indexing-contract.ts`, shared by Astro route generation and the validator. Do not duplicate the literal in two implementations.
- Add `site/src/data/pagination.ts` for collection slicing plus reusable `SegmentIndexPage.astro`, `TopicIndexPage.astro`, and `CollectionPagination.astro` components.
- Keep the first page at the existing index URL. Each dynamic pagination route must use `getStaticPaths()` to generate only page 2 and later below `/page/<n>/`; `/page/1/` must never exist.
- Render ordinary anchor navigation with clear current-page and total-page labels. Use component-scoped styles so this task does not absorb the currently dirty shared stylesheet.
- Keep pagination pages indexable and self-canonical. Add the page number to their `<title>`, description, social description, and visible pagination state.
- Ensure each substantive detail route has at least one inbound ordinary anchor from the appropriate index sequence.

Expected files:

- `src/site/archive-data.ts`
- `src/site/archive-data.test.ts`
- `src/site/search-indexing-contract.ts`
- `site/src/data/archive.ts`
- `site/src/data/pagination.ts`
- `site/src/components/CollectionPagination.astro`
- `site/src/components/SegmentIndexPage.astro`
- `site/src/components/TopicIndexPage.astro`
- `site/src/pages/segments/index.astro`
- `site/src/pages/segments/page/[page].astro`
- `site/src/pages/topics/index.astro`
- `site/src/pages/topics/page/[page].astro`
- `site/src/data/generated/archive.json`

### Phase 2: Sitemap discovery

- Install a version of `@astrojs/sitemap` compatible with the existing Astro version as a development dependency using npm so both `package.json` and `package-lock.json` remain synchronized.
- Register the integration in `astro.config.mjs`.
- Preserve the existing `site`, `base`, `output`, `srcDir`, `publicDir`, and `outDir` settings.
- Configure a sitemap filter that compares the full absolute page URL and excludes exactly `https://r-jack-ray.github.io/naval-history-with-dr-alex/search/`.
- Keep the default entry limit and do not configure custom chunks without measured need.
- Do not add invented `priority` or `changefreq` values; Google ignores them.
- Do not add `lastmod` until a reliable per-page substantive-modification date exists.
- Add an absolute `<link rel="sitemap">` in the shared head pointing to the sitemap index as a non-Google-critical secondary hint.
- Do not emit a nested `robots.txt`; document the GitHub Pages host-root limitation instead.
- Confirm the production build emits `site/dist/sitemap-index.xml` and every child sitemap referenced by the index.

Expected files:

- `astro.config.mjs`
- `package.json`
- `package-lock.json`
- `site/src/layouts/BaseLayout.astro`

### Phase 3: Canonical, robots, and core metadata

- Extend `BaseLayout.astro` with a typed indexing option. Default every page to indexable without emitting a robots meta element; opt `/search/` into one `content="noindex"` element from its route.
- Derive one absolute canonical URL from the current Astro URL and production configuration. Do not concatenate the host and base path independently in each page.
- Normalize the canonical to the existing trailing-slash route convention.
- Emit exactly one canonical link on each expected Astro page, including the non-indexable Search page as a consistency choice.
- Do not emit a site-wide explicit `index,follow`; the absence of a restriction is the default.
- Add deterministic page-title and description helpers implementing Decision 11. Do not change segment source fields or fabricate descriptions.
- Do not add `noindex` merely because a related topic has scaffold wording. The public archive filter handles only truly unreferenced topics; content quality remains a separate curation concern.

Expected files:

- `site/src/layouts/BaseLayout.astro`
- `site/src/pages/videos/[slug].astro`
- `site/src/pages/segments/[slug].astro`
- Paginated index components/routes
- `site/src/pages/search/index.astro`

### Phase 4: Social metadata

- Add centralized `og:title`, `og:description`, `og:url`, and `og:type` values that match the title, description, and canonical. Use `video.other` only on video-guide pages and `website` elsewhere.
- Add `twitter:card`, `twitter:title`, and `twitter:description` values. Use `summary_large_image` when a suitable image exists and `summary` otherwise.
- Support an optional social image URL:
  - Use the reliable YouTube thumbnail for video pages.
  - Use the source video's thumbnail for segment pages through the current archive lookup.
  - Omit `og:image` and use a summary card on pages without a suitable image; do not repurpose the favicon as a large social image.
- When an image exists, emit matching Open Graph and Twitter image URLs and useful image alt text.
- Keep social metadata secondary to sitemap and canonical work.

Expected files:

- `site/src/layouts/BaseLayout.astro`
- `site/src/pages/videos/[slug].astro`
- `site/src/pages/segments/[slug].astro`

### Phase 5: Accurate structured data and breadcrumbs

#### Video pages

- Add one server-rendered JSON-LD `VideoObject` to each video-guide page.
- Use only archive-backed values:
  - `name`: the deterministic unique video SEO name
  - `thumbnailUrl`: YouTube thumbnail URL
  - `uploadDate`: `publishedAt`
  - `description`: the same unique visible/meta study-guide description
  - `embedUrl`: the existing YouTube embed URL
- `duration`: the source-preserved `durationIso` when present
- Treat `name`, `thumbnailUrl`, and `uploadDate` as Google's required fields. The project also requires the already-available `description` and `embedUrl` so the object is useful and consistent.
- Do not claim a `contentUrl`; the repository does not own or expose the video bytes.
- Escape serialized JSON safely so titles or descriptions cannot terminate the script element.
- Validate unique `VideoObject.name` and `description` values across video pages.

#### Breadcrumbs

- Replace the current partial Segment breadcrumb and add compact visible breadcrumbs to Video and Topic detail pages using the hierarchies in Decision 15.
- The current page is the final breadcrumb item. Ancestors are ordinary anchors; the final item may be plain text.
- Emit one matching `BreadcrumbList` JSON-LD object on each of those detail page types.
- Use absolute production URLs and the base path in every structured-data item; the final structured-data item must equal the page canonical.
- Use component-scoped breadcrumb styling if the existing dirty stylesheet cannot be safely touched.

Expected files:

- `site/src/layouts/BaseLayout.astro` or a small shared SEO component/helper
- `site/src/pages/videos/[slug].astro`
- `site/src/pages/segments/[slug].astro`
- `site/src/pages/topics/[slug].astro`
- `src/site/archive-data.ts`
- `src/site/archive-data.test.ts`
- `site/src/data/archive.ts`

### Phase 6: Generated-output validation

Add a focused generated-site validator that operates only on the generated archive, `site/dist`, and local configuration. Keep it independent of live Google services.

- Put the shared pure page-size/route contract in `src/site/search-indexing-contract.ts` and reusable parser/validation logic in `src/site/search-indexing.ts`.
- Put Node test-runner unit and temporary-fixture tests in `src/site/search-indexing.test.ts`.
- Keep `src/scripts/check-site-indexing.ts` as a thin CLI following existing error-reporting conventions.
- Add direct development dependencies on `htmlparser2` for event-driven HTML extraction and `saxes` for strict XML well-formedness checks. Do not rely on transitive packages or regex-only parsing.
- Process HTML sequentially or with a small fixed concurrency limit. Retain only extracted metadata and link sets, and discard unrelated large script bodies such as the Search payload.

Derive one expected route registry from the filtered archive and the 500-record pagination rule:

- Homepage.
- Video index and every video detail page.
- Every Segment and Topic pagination page.
- Every Segment and substantive Topic detail page.
- Search as the sole non-indexable Astro page.

Enumerate generated Astro `index.html` route files and require equality with that registry. A future exact owner-supplied Google verification HTML file is a static allowlisted artifact, not an Astro page: exclude it from the sitemap and exempt it from page metadata requirements.

The validator should derive expected routes from the generated archive and verify:

- The shared head contains the agreed absolute sitemap-index hint, while diagnostics describe it as a general-crawler hint rather than Google submission.
- No nested `site/dist/robots.txt` is emitted while the project remains on the GitHub Pages subpath.
- `sitemap-index.xml` is well-formed XML with the expected sitemap root/namespace; every unique child reference stays under the production base URL, maps safely below `site/dist`, exists, and parses as an expected URL set.
- The combined child URL set exactly equals the expected indexable route set, with no missing, extra, or duplicate URLs. `/search/` and any verification artifact are absent.
- URL validation uses parsed origin equality and path-boundary checks, not string-prefix checks.
- Every sitemap URL is absolute HTTPS, uses the configured origin/base/trailing-slash form, maps to an expected `index.html`, and equals that page's canonical.
- Every expected Astro page has one trimmed nonempty title, one nonempty meta description, and exactly one canonical.
- No two distinct pages share a canonical.
- Every indexable page emits no robots or Googlebot meta element. Search has exactly one `<meta name="robots">` in `<head>`, no Googlebot-specific duplicate, and a parsed directive set of exactly `{ noindex }`.
- Search's sole `noindex` element appears before the large inline search payload and within the first 1,500,000 raw UTF-8 bytes, so Googlebot receives the directive before its current fetch cutoff.
- Every indexable HTML response is at most 1,500,000 uncompressed bytes, leaving safety margin below Google's current 2 MB cutoff. Report Search size without applying this indexable-page failure threshold.
- Pagination pages have sequential crawlable links, self-canonicals, and stable page-number URLs.
- Every expected detail route has at least one inbound ordinary anchor. Fragment-only and external-origin links are allowed; every same-origin link must remain inside the configured base path and resolve to an expected generated route.
- Open Graph and Twitter title/description values match the page metadata, social URLs match the canonical, card/type values follow Phase 4, and image values match the selected archive thumbnail.
- Every JSON-LD block parses as JSON.
- Every video page has exactly one `VideoObject`; non-video pages have none. Its name, description, duration when available, and media URLs match the archive/page values, and it contains no `contentUrl`.
- Each `uploadDate` is an ISO 8601 date-time with an explicit timezone; each thumbnail is absolute and video-specific; and `embedUrl` equals the `src` of the visible video-page iframe/player rather than merely matching an unchecked archive field.
- Video page-identity fields such as `url`, `@id`, or `mainEntityOfPage`, if emitted, match the canonical. Do not apply that rule to external media URLs or ancestor breadcrumb URLs.
- Every `BreadcrumbList` has contiguous positions, expected generated ancestor routes, and the current canonical as its final item.
- Global duplicate titles/descriptions outside `VideoObject` are warnings, not automatic failures, because distinct source-backed pages can legitimately share labels. Record exact duplicate Topic titles for taxonomy follow-up.

Add unit coverage for URL-to-file normalization, base-path escape attempts, pagination route construction, sitemap index/child parsing, malformed XML, attribute-order-independent HTML metadata extraction, entity decoding, canonical mismatch/duplication, robots token parsing and early-head placement, size failures, missing link targets/inbound links, malformed JSON-LD, `</script>` escaping, archive-to-`VideoObject` mismatches, and a small missing/extra-route fixture.

Expose:

```json
{
  "check:site-indexing": "npm run build && node dist/scripts/check-site-indexing.js",
  "site:build:generated": "astro build && pagefind --site site/dist && npm run check:site-indexing"
}
```

Update the Pages deployment workflow so its existing `site:check` step is followed by `site:build:generated`, not `site:build`. That preserves the deployment gate while generating shared data only once in CI. Do not add the validator to `site:check`, which does not create `site/dist`.

Likely files:

- `src/site/search-indexing-contract.ts`
- `src/site/search-indexing.ts`
- `src/site/search-indexing.test.ts`
- `src/scripts/check-site-indexing.ts`
- `package.json`
- `package-lock.json`
- `.github/workflows/deploy-site.yml`

### Phase 7: Manual Search Console runbook

Create tracked `docs/operations/google-search-console-setup.md`. Root `docs/` content is not part of the Astro deployment because `srcDir` is `site/src`. Update `README.md` so it no longer says that no committed `docs/` tree exists, and identify this file as repository operations documentation rather than public study-guide content.

The runbook should instruct the owner to:

1. Add this exact URL-prefix property, including the trailing slash:

   ```text
   https://r-jack-ray.github.io/naval-history-with-dr-alex/
   ```

2. Do not attempt a Domain property for `github.io`; the repository owner does not control that registrable domain.
3. Select an ownership method offered by Search Console:
   - HTML tag: copy the exact owner-specific token into the deployed homepage `<head>`.
   - HTML file: place Google's exact file, unchanged, under `site/public/` so it deploys at the property root.
4. Treat the verification value/file as owner-supplied input. Do not commit a placeholder or invent a token.
5. Verify the deployed token or file in an incognito browser before clicking **Verify**.
6. Keep the verification artifact deployed after verification; Google rechecks ownership periodically.
7. Submit:

   ```text
   https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap-index.xml
   ```

8. Use URL Inspection on:
   - Homepage
   - `/videos/`
   - One later Segment pagination page
   - One video detail page
   - One segment detail page, preferably a `kind: qa` segment
   - One topic detail page
9. After Google has indexed or reprocessed each representative URL, confirm the user-declared and Google-selected canonicals agree.
10. Request indexing for the homepage and a small representative set after deployment; do not manually submit thousands of URLs.
11. Run the Rich Results Test on a representative deployed video page.
12. Monitor Page indexing, Sitemaps, Video indexing, and Performance after Google recrawls the site. Monitor the Breadcrumb and Video rich-result reports if and when Search Console detects those markup types.

Do not automate account actions or claim verification without owner access and the exact owner-supplied artifact.

Expected files:

- `docs/operations/google-search-console-setup.md`
- `README.md`

### Phase 8: Implementation report

Create `reports/google-search-indexing-implementation.md` containing:

- Baseline findings
- Files changed and rationale
- Commands and results
- Generated sitemap index and child filenames
- Derived indexable URL count at implementation time
- Representative canonical, sitemap-link, robots-meta, social, and JSON-LD output
- Live endpoint checks after deployment
- Manual Search Console actions still outstanding
- Any intentionally deferred metadata or schema work

`reports/` is intentionally ignored. Treat this as local execution evidence; put the durable manual runbook in `docs/operations/` and summarize implementation results in the eventual PR/task closeout.

## Validation Sequence

After the Phase 0 quiet-window check, run in this order while preserving unrelated worktree changes:

```powershell
npm run check
npm run site:check
npm run site:build:generated
git diff --check -- astro.config.mjs package.json package-lock.json README.md src/site src/scripts/check-site-indexing.ts site/src docs/operations/google-search-console-setup.md .github/workflows/deploy-site.yml
```

This sequence generates shared data once: `site:check` regenerates it, while `site:build:generated` consumes the settled output and runs the indexing validator. Do not replace the final command with `site:build`, which would generate shared data a second time.

Run an additional full-tree `git diff --check` as a diagnostic. Report any pre-existing unrelated whitespace failures separately; do not misattribute them to the indexing implementation.

Then inspect generated output locally:

- `site/dist/index.html`
- `site/dist/videos/index.html`
- One `site/dist/videos/<slug>/index.html`
- One `site/dist/segments/<slug>/index.html`
- One `site/dist/topics/<slug>/index.html`
- `site/dist/search/index.html`
- `site/dist/sitemap-index.xml`
- Every child sitemap named in the index
- Representative later Segment and Topic pagination pages
- Largest indexable HTML file and its uncompressed byte count

After deployment, make read-only requests to the homepage, the host-root `https://r-jack-ray.github.io/robots.txt`, the sitemap index, one child sitemap, and representative detail URLs. The host-root robots response may remain 404, which permits crawling; it must not contain a rule blocking the project path. Project-owned endpoints must return HTTP 200; HTML endpoints must contain the expected production metadata, and sitemap endpoints must contain the expected XML. Local build success alone is insufficient for deployment acceptance.

## Acceptance Criteria

### Local implementation acceptance

- Existing checks, Astro build, Pagefind, and the indexing validator pass from one settled archive generation.
- Zero-relation registry topics do not become public archive routes; referenced topics remain available.
- Segment and Topic indexes use crawlable, self-canonical pagination; every indexable HTML file is at most 1,500,000 uncompressed bytes.
- The sitemap index and every discovered child are well formed, route-complete, canonical-consistent, and exclude only Search plus non-page verification artifacts.
- Every expected Astro page has one absolute self-canonical under the correct GitHub Pages base path and nonempty transcript-safe metadata.
- `/search/` is crawlable but has one `noindex` directive; all substantive and pagination routes remain indexable.
- Ordinary HTML links and sitemap URLs provide complete detail-route discovery without requiring Pagefind or button interaction.
- Social metadata is canonical-consistent and uses archive-backed images only where available.
- Video JSON-LD is valid, unique where Google requires/recommends uniqueness, visible-content-consistent, and limited to video pages with all required properties.
- Breadcrumb JSON-LD matches visible detail-page navigation.
- No unsupported or misleading FAQ, QAPage, Article, WebSite site-name, BroadcastEvent, Clip, or standalone Segment `VideoObject` markup is added.
- The tracked Search Console runbook and ignored local implementation report are created at their planned paths.

### Post-deployment acceptance

- Deployment is separately authorized and completes successfully.
- Production serves `sitemap-index.xml`, every referenced child, pagination pages, and representative detail pages with HTTP 200.
- The host-root robots state does not block `/naval-history-with-dr-alex/`; no ineffective nested robots file is deployed by this repository.
- Production HTML matches the locally validated canonical, robots, social, and structured-data output.
- Search Console ownership, sitemap submission, inspection, and monitoring steps are completed manually by an authorized owner.

If push or deployment is not authorized in the implementation turn, local acceptance can complete while every post-deployment item remains explicitly outstanding. Do not report production acceptance from local output.

## Scope and Safety Constraints

- Preserve the segment-first site model and all transcript-backed wording.
- Do not rename existing detail routes or slugs. The only new routes are the planned pagination routes; zero-relation topic routes intentionally cease to be generated until referenced.
- Do not edit generated `site/dist/` files directly.
- Do not edit `site/src/data/generated/archive.json` by hand.
- Do not alter shared transcript shards, the topic registry, schedules, reports unrelated to indexing, or the currently dirty stylesheet.
- Do not add tracking or analytics.
- Do not expose internal reports through Astro routes.
- Do not claim control over the `r-jack-ray.github.io` host-root `robots.txt` from this project repository.
- Do not use live Google services in automated tests.
- Treat sitemap submission as a discovery hint, not an indexing guarantee.
- Do not fix the exact duplicate Topic title or scaffold-summary backlog inside this indexing task; record it for separately scoped taxonomy/content work.
- Do not externalize or redesign Search's client data payload in this task.

## Stop Rules

Stop and report instead of broadening scope if:

- A stable shared-generation window cannot be established because lock-free transcript lanes are still writing inputs.
- A target source/configuration file has overlapping user changes that cannot be merged safely.
- A production build fails because of unrelated transcript/shard or shared-output changes.
- The sitemap integration emits URLs without the configured base path and the cause is not isolated to the indexing change.
- Pagination still leaves any indexable HTML file above the 1,500,000-byte project guard.
- Search Console requires an owner-specific token that has not been supplied.
- Accurate structured data would require inventing or guessing unavailable values.
- A proposed fix requires route migration, custom-domain setup, analytics, or editorial rewrites.
- Push, deployment, or Google-account actions are required but have not been separately authorized. Finish local evidence and leave those stages outstanding.

## Primary References

- [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [Google: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: robots.txt file location and scope](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Google: Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: Crawlable link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google: Pagination and incremental page loading](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Google: Googlebot file-size behavior](https://developers.google.com/search/docs/crawling-indexing/googlebot)
- [Google: Robots meta directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Google: Video structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Google: Video indexing best practices](https://developers.google.com/search/docs/appearance/video)
- [Google: Site-name limitations for subdirectories](https://developers.google.com/search/docs/appearance/site-names)
- [Search Console: Add a URL-prefix property](https://support.google.com/webmasters/answer/34592)
- [Search Console: Verify site ownership](https://support.google.com/webmasters/answer/9008080)
- [Search Console: Sitemaps report](https://support.google.com/webmasters/answer/7451001)
- [GitHub Pages site types and default locations](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
