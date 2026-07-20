Timestamp: 2026-07-19T21:49:27-05:00

# Website SEO Improvement Plan

## Status and scope

Planning only. This note does not authorize implementation, dependency installation, deployment, Search Console changes, or content rewrites.

The goal is to improve crawl discovery, index quality, search-result presentation, video eligibility, page experience, and the authority of the learner-facing study guide. None of these changes guarantees rankings. The work should remain useful to visitors and must not add keyword stuffing, fabricated historical claims, misleading structured data, or thin pages created only for search engines.

This plan updates and reprioritizes the earlier [Google Search discovery and indexing plan](./2026-07-11_T02-34-34-0500_google-search-indexing-guide.md). That note still contains useful implementation detail, but its July 11 route counts and page-shape assumptions are stale.

## Current local audit snapshot

Audit basis: repository source and the generated `site/dist` build present on 2026-07-19. A production HTTPS recheck was attempted, but the managed shell could not establish TLS, so production status must be confirmed after deployment rather than inferred from this local snapshot.

### Existing strengths

- Astro emits static HTML with the substantive video, time-note, and topic content present without requiring client-side rendering.
- `astro.config.mjs` already declares the production origin and GitHub Pages base path.
- `BaseLayout.astro` already receives page-specific titles and descriptions.
- Video, topic, and time-note pages already cross-link with ordinary `<a href>` links.
- The complete time-note directory is already paginated at 48 records per page.
- Video thumbnails have explicit dimensions, and the site already has Lighthouse commands available for later measurement.

### Current scale and gaps

| Measure | Current local result | SEO implication |
| --- | ---: | --- |
| Rendered HTML pages | 75,662 | A sitemap index and automated output checks are warranted. |
| Video guides | 2,138 | Large enough to justify video-specific metadata and discovery work. |
| Time notes | 52,440 | Strong long-tail content, but metadata and crawl coverage need validation. |
| Topics | 19,986 | Topic quality and crawl routing are now major concerns. |
| `site/dist/topics/index.html` | 9,419,461 bytes | Googlebot currently fetches only the first 2 MB of an HTML response, so most directory links can fall beyond its fetched portion. |
| `site/dist/videos/index.html` | 1,552,668 bytes | Near the crawler limit and unnecessarily heavy for users. |
| `site/dist/segments/browse/index.html` | 53,468 bytes | Existing pagination is an effective pattern to reuse. |
| Default topic summaries | 19,776 of 19,986 | Most topic landing pages have formulaic rather than subject-specific introductions. |
| Orphan topics | 33 | These currently receive routes despite having no related video or time note. |
| Empty time-note summaries | 62 | These produce empty meta descriptions on their detail pages. |
| Empty source video descriptions | 92 | Any new metadata helper must have a reliable archive-backed fallback. |
| Duplicate title groups | 6 video, 40 time-note, 0 topic | Search-result titles need deterministic disambiguation. |

The shared layout currently emits a title and description but no self-canonical, robots option, Open Graph metadata, Twitter card metadata, or JSON-LD. No XML sitemap is generated. The Search page is indexable even though its useful results are created interactively. All 33 orphan topics still receive detail routes because `getTopicPaths()` returns every topic.

## Ranking method

The list below is ranked from easiest/fastest to hardest/slowest to implement, not by expected SEO impact. Estimates assume one engineer familiar with this repository and exclude the time search engines need to recrawl and re-evaluate pages.

Every item is intended to be independently shippable. “Interlock” identifies a shared contract or a recommended companion change, not permission to silently expand an implementation into the other item.

| Rank | ID | Independently shippable initiative | Typical effort | Expected effect | Interlock summary |
| ---: | --- | --- | --- | --- | --- |
| 1 | SEO-01 | Keep the interactive Search page out of search results | 1-2 hours | Medium index-quality gain | Sitemap must later exclude the same URL. |
| 2 | SEO-02 | Add absolute self-canonical URLs through one shared helper | 0.5 day | High technical consistency | Reuse for social tags, sitemap validation, and JSON-LD. |
| 3 | SEO-03 | Add Open Graph and Twitter card metadata | 0.5-1 day | Low direct ranking effect; better sharing and previews | Prefer SEO-02 URLs and SEO-06 descriptions when available. |
| 4 | SEO-04 | Stop publishing empty/orphan topic routes | 0.5-1 day | Medium-to-high index-quality gain | Route generation, indexes, and sitemap must share one eligibility rule. |
| 5 | SEO-05 | Generate a split XML sitemap and submit its index | 1-2 days | Very high discovery value at this site size | Must agree with SEO-01, SEO-02, and SEO-04. |
| 6 | SEO-06 | Make titles and descriptions unique, nonempty, and page-specific | 1-3 days | High snippet and relevance value | Reuse the same values in SEO-03, SEO-10, and SEO-11. |
| 7 | SEO-07 | Add visible breadcrumbs plus `BreadcrumbList` JSON-LD | 1-2 days | Medium comprehension and result-presentation value | Reuse SEO-02 canonical URL construction. |
| 8 | SEO-08 | Add a rendered-output SEO validator and monitoring baseline | 2-4 days | Medium direct effect; high regression-prevention value | Update its contract whenever routes or structured data change. |
| 9 | SEO-09 | Paginate the oversized Topic and Video directories | 3-5 days | Very high crawl and page-experience value | Pagination URLs need canonicals, sitemap inclusion, and crawlable links. |
| 10 | SEO-10 | Add accurate `VideoObject` data to video-guide pages | 3-5 days | High video-search eligibility value | Needs canonical URLs, unique descriptions, and source-preserved ISO duration. |
| 11 | SEO-11 | Generate a video sitemap | 3-5 days | Medium-to-high video discovery value | Shares the video metadata contract with SEO-10. |
| 12 | SEO-12 | Curate high-value topic landing pages and consolidate weak taxonomy | First batch 1-2 weeks; ongoing | Very high content-quality value | Search Console can prioritize work; each topic can be handled separately. |
| 13 | SEO-13 | Add same-page timestamp URLs and video key-moment markup | 1-2 weeks | Potentially high video-result value | Requires SEO-10 and a real local seek/deep-link contract. |
| 14 | SEO-14 | Optionally migrate to a custom domain | 1-2 weeks plus DNS/crawl transition | Branding and ownership benefits; ranking effect uncertain | Changes every absolute URL signal and should be decided early if imminent. |
| 15 | SEO-15 | Build an ethical external-link and educator outreach program | Ongoing over months | Potentially very high authority value | Promote stable canonical pages and genuinely useful content assets. |

## Independent work items

### SEO-01 — Keep Search out of search results

Scope:

- Add an optional indexing policy to `BaseLayout.astro`.
- Pass `noindex` from `/search/` while leaving links followable; do not add `nofollow`.
- When a sitemap exists, exclude `/search/` from it.

Acceptance:

- Rendered Search HTML contains exactly one `<meta name="robots" content="noindex">`.
- All normal content pages remain indexable by default and do not need a redundant `index,follow` tag.

Interlock: SEO-05 must consume the same indexability decision, but SEO-01 can ship first.

### SEO-02 — Add one canonical URL contract

Scope:

- Derive an absolute, production-origin, base-aware, trailing-slash canonical from the current Astro URL in one shared helper or shared SEO component.
- Emit one self-referential `<link rel="canonical">` in the HTML head of every HTML route, including each pagination page.
- Exclude query strings and fragments from the canonical unless a future feature explicitly defines a distinct indexable URL.

Acceptance:

- Every sampled route has exactly one absolute canonical.
- Canonical paths match internal links and, once present, sitemap URLs.
- Local preview hosts never leak into production canonical output.

Interlocks: SEO-03, SEO-05, SEO-07, SEO-10, SEO-11, and SEO-13 should reuse this URL helper rather than build URLs independently.

### SEO-03 — Add social preview metadata

Scope:

- Centralize `og:title`, `og:description`, `og:url`, `og:type`, `twitter:card`, `twitter:title`, and `twitter:description` in the shared layout or SEO component.
- Use the source video thumbnail for video pages and related time-note pages.
- Use `video.other` only for actual embedded video-guide pages and `website` elsewhere.
- Omit a large-image card when there is no suitable image; do not stretch the favicon into a social preview.

Acceptance:

- Social URL, title, and description match the canonical page values.
- Images are absolute, stable, and accompanied by meaningful alternate text where supported.

Interlock: This can ship with current descriptions, but SEO-06 should become the single long-term metadata source.

### SEO-04 — Stop publishing orphan topic routes

Scope:

- Define one public-topic eligibility predicate: at least one related video or time note.
- Apply it to `getTopicPaths()`, all Topic indexes/directories, and later sitemap generation.
- Preserve records in `src/derived/video-segments/topics.json`; this task changes public route eligibility, not the shared registry.
- Add generator/adapter tests proving that a valid but unreferenced registry topic does not produce a public page.

Acceptance:

- The current 33 orphan topics produce no HTML route and no sitemap entry.
- Referenced topics remain unchanged and linked.
- A future orphan cannot silently reappear because different surfaces use different rules.

Interlock: Do this before or alongside SEO-05. If it ships later, the sitemap filter must temporarily exclude the known orphan URLs.

### SEO-05 — Generate and submit a split XML sitemap

Scope:

- Install the Astro-compatible `@astrojs/sitemap` integration through npm so the package manifest and lockfile remain synchronized.
- Keep Astro’s default 45,000-entry limit unless measurement justifies another value. At the current scale, the integration should emit a sitemap index with multiple child sitemaps.
- Include only canonical, indexable HTML pages. Exclude Search and orphan topics.
- Add an absolute `<link rel="sitemap">` to the shared head.
- Do not add a project-subpath `robots.txt`; a robots file is only authoritative at the host root, which this GitHub Pages project does not control.
- Verify a URL-prefix property in Google Search Console and submit `sitemap-index.xml`. Record the submission and baseline coverage in the existing operations guide or a new owner runbook.

Acceptance:

- `site:build` emits `sitemap-index.xml` and every referenced child sitemap.
- Every sitemap contains fewer than 50,000 absolute URLs and passes XML parsing.
- Sitemap URLs are unique, return the expected local output file, match the canonical form, and exclude non-indexable routes.
- Search Console accepts the sitemap index after deployment.

Interlocks: SEO-01, SEO-02, and SEO-04 define what belongs in the sitemap. SEO-09 adds pagination routes that must be included when it ships.

### SEO-06 — Improve page titles and descriptions

Scope:

- Build deterministic metadata helpers from visible/archive-backed facts; do not use raw promotional YouTube descriptions as-is.
- Video pages: summarize the specific video using its title, date or format where helpful, time-note count, and a small number of meaningful topics.
- Time-note pages: use `summary`, then `answerShort`, then a normalized excerpt of `body` so the current 62 empty summaries never create an empty description.
- Disambiguate the current 6 duplicate video-title groups and 40 duplicate time-note-title groups with useful context such as publication date, parent video title, or timestamp. Use opaque IDs only as a last resort.
- Normalize whitespace and bound metadata for usefulness, but do not treat a fixed character count as a ranking rule.
- Keep visible headings aligned with metadata so titles are not misleading.

Acceptance:

- Every indexable page has a nonempty title and description.
- No two detail pages share the same complete SEO title unless an explicit reviewed exception exists.
- Metadata is human-readable, subject-specific, and consistent with visible content.

Interlocks: SEO-03, SEO-10, and SEO-11 should reuse these values. SEO-12 remains necessary because programmatic metadata does not turn a formulaic Topic page into a rich subject guide.

### SEO-07 — Add breadcrumbs and breadcrumb structured data

Scope:

- Add visible breadcrumbs to video, time-note, and topic detail pages.
- Preserve and improve the existing Time Notes > Video breadcrumb on time-note pages.
- Emit matching `BreadcrumbList` JSON-LD with absolute canonical item URLs.
- Do not mark unrelated navigation or every Topic tag as a breadcrumb.

Acceptance:

- Visible and structured breadcrumbs describe the same hierarchy.
- JSON parses without HTML escaping defects and passes Google’s Rich Results Test on representative deployed pages.

Interlock: Reuse SEO-02 URLs. This task can ship without `VideoObject`.

### SEO-08 — Add automated SEO validation and a measurement baseline

Scope:

- Add a streaming validator over rendered HTML and sitemap files; avoid loading all 75,662 pages into memory at once.
- Check title/description presence, canonical uniqueness and shape, robots eligibility, one-H1 structure, sitemap coverage, broken internal links, orphan-route absence, duplicate SEO titles, oversized hub pages, JSON-LD parsing, and required structured-data properties.
- Add representative Lighthouse runs for Home, a Video page, a Time Note, a Topic page, and the largest directory type rather than measuring Home only.
- Record a Search Console baseline for indexed pages, sitemap processing, query/impression leaders, video indexing, and Core Web Vitals. Manual export is sufficient; do not add repository credentials.

Acceptance:

- The validator fails with actionable route and rule names.
- It can run after `site:build` without materially extending the already-long Astro/Pagefind build.
- CI distinguishes hard failures from advisory content opportunities.

Interlock: This is a recommended companion to every later item, but no other item must wait for it if that item includes focused tests.

### SEO-09 — Paginate oversized Video and Topic directories

Scope:

- Reuse the successful Time Notes browse pattern to ensure the full Video and Topic collections are available through small, statically rendered pages with ordinary anchors.
- Keep `/topics/` useful as a topic finder/featured entry point, but move the full 19,986-record crawl directory to paginated HTML such as `/topics/browse/` and later pages.
- Either paginate `/videos/` directly without breaking its URL or keep it as a latest/featured entry point and add a paginated `/videos/browse/` directory.
- Keep all detail routes reachable from at least one crawlable archive page.
- Give every page a distinct page-number title/description and a self-canonical. Include every pagination URL in the sitemap.
- If client-side filtering remains, search external data or Pagefind rather than embedding the full corpus in one HTML response.
- Keep browse pages out of Pagefind’s content index if indexing them would create duplicate search results.

Acceptance:

- No index/directory HTML response approaches Googlebot’s 2 MB fetch ceiling; target well below 1 MB.
- The current 9.4 MB Topic index and 1.55 MB Video index are replaced by lightweight entry pages plus crawlable pagination.
- A route-coverage check proves every eligible Video and Topic page has an inbound directory link.
- Navigation works with JavaScript disabled.

Interlocks: Pagination needs SEO-02-compatible self-canonicals and SEO-05 sitemap inclusion. SEO-08 must understand the new route contract. It does not depend on social or structured metadata.

### SEO-10 — Add accurate `VideoObject` markup

Scope:

- Emit `VideoObject` JSON-LD only on pages that visibly embed the corresponding video.
- Preserve a validated source ISO 8601 duration, such as `durationIso`, through the archive generator instead of reconstructing it from `durationLabel`.
- Supply all currently required Google properties and supported recommended properties from truthful data: page-specific name and description, thumbnail, upload date, duration, and player/embed URL.
- Do not add `BroadcastEvent` for archived streams, `QAPage` for ordinary audience answers, or `Article` for time-note pages.

Acceptance:

- Representative upload and archived-stream pages pass Google’s Rich Results Test without critical errors.
- Generated-output validation rejects missing or malformed required values instead of emitting partial markup.
- Structured text matches the visible page and does not make the study guide appear to own or host the underlying video file.

Interlocks: SEO-02 supplies the page URL and SEO-06 supplies the description. The archive must expose source-preserved ISO duration. SEO-11 can reuse the same validated video record.

### SEO-11 — Generate a video sitemap

Scope:

- Generate a video sitemap for the 2,138 embedded video-guide pages using the canonical guide URL, thumbnail, page-specific title/description, publication date, duration, and supported player/embed data.
- Split files if required by the protocol and link them from the public sitemap index.
- Keep ordinary Time Note pages out unless they become valid watch pages under a later design.

Acceptance:

- Every video sitemap record maps to one indexable page containing the matching visible embed.
- URLs and metadata match `VideoObject` and canonical output.
- Google Search Console accepts the deployed file and can report video-indexing outcomes.

Interlock: This can ship before SEO-10, but both should share one validated metadata model. SEO-02, SEO-05, and the ISO-duration work from SEO-10 are recommended prerequisites.

### SEO-12 — Curate high-value Topic landing pages

Scope:

- Do not attempt to hand-edit all 19,776 default summaries at once.
- Select an initial 25-50 topics using Search Console impressions/queries, internal search demand, segment coverage, learner importance, and taxonomy confidence.
- Give each selected Topic page a unique learner-facing introduction, useful subheadings or thematic groupings, representative videos/time notes, and contextual internal links.
- Consolidate synonyms and near-duplicate topic concepts through the repository’s topic-normalization policy before investing in competing landing pages.
- Keep every claim grounded in the curated archive/transcript evidence. Avoid generated filler or pages created solely to target keyword variants.
- Treat each Topic as its own reviewable work item so several can be improved independently without a corpus-wide rewrite.

Acceptance:

- Each selected page clearly answers what the subject is, why it matters, and which Dr. Clarke moments are most useful.
- The page is materially different from a list of links plus the default one-sentence template.
- Related pages use descriptive contextual links rather than repeated generic “read more” anchors.
- Search Console performance is compared before and after enough crawl time has elapsed.

Interlocks: This can begin at any time. SEO-05 and Search Console make prioritization easier; SEO-09 makes Topic discovery more reliable; SEO-06 improves snippets while deeper content is curated.

### SEO-13 — Add local timestamp URLs and key-moment markup

Scope:

- Define a same-page query contract such as `/videos/<slug>/?t=<seconds>` that opens the existing embedded video at the requested offset.
- Ensure the URL works when loaded directly, degrades safely without JavaScript, and does not create a separate canonical page for every timestamp.
- Once that behavior is real and tested, add `Clip` entries under the parent `VideoObject` using curated time-note titles and offsets.
- Start with a small set of high-quality videos before expanding across the archive.

Acceptance:

- Every emitted key-moment URL points to the same canonical video-page path with a functional timestamp parameter.
- No two clips on one video share a start offset, and clip ordering/labels match visible time notes.
- Representative pages pass the Rich Results Test and the deep link works on desktop and mobile.

Interlock: SEO-10 is required. Current links jump directly to YouTube and do not satisfy the same-page Clip URL contract by themselves.

### SEO-14 — Optionally migrate to a custom domain

Scope:

- Treat this as a branding, ownership, and operational decision rather than a guaranteed ranking boost.
- If approved, plan DNS, HTTPS, GitHub Pages configuration, old-origin redirects, canonical/sitemap/social/JSON-LD URL changes, Search Console properties, and post-migration monitoring as one migration.
- A custom host would allow an authoritative host-root `robots.txt` and domain-level site identity instead of a GitHub Pages project subdirectory.

Acceptance:

- Old URLs redirect consistently to their exact new equivalents.
- No output contains mixed old/new origins.
- Search Console migration and sitemap submission are complete, with coverage monitored through the transition.

Interlock: If a custom domain is likely within the next three months, decide before implementing SEO-02, SEO-05, SEO-10, or SEO-11. Otherwise, ship those improvements now and treat the domain change as a later controlled migration.

### SEO-15 — Earn authoritative external links and referrals

Scope:

- Create a small set of genuinely link-worthy assets: curated campaign guides, ship/class explainers, naval-doctrine reading paths, or educator-friendly collections built from the existing evidence-backed pages.
- Contact relevant museums, naval-history societies, educators, reading lists, research communities, and creator collaborators with a specific resource that helps their audience.
- Track referrals and earned links. Do not buy links, automate mass outreach, trade links at scale, or spam forums and directories.

Acceptance:

- Outreach points to stable canonical resources with a clear learner benefit.
- Every placement is editorially defensible and complies with Google’s spam policies.
- Results are measured over months rather than judged by immediate rank changes.

Interlock: Technical work is not a hard prerequisite, but SEO-02 and SEO-12 reduce link churn and give outreach stronger destinations.

## Interlock map

| Shared contract | Consumers | Rule |
| --- | --- | --- |
| Public URL eligibility | SEO-01, SEO-04, SEO-05, SEO-08 | Only canonical, indexable, substantive routes belong in the sitemap and coverage totals. |
| Absolute URL builder | SEO-02, SEO-03, SEO-05, SEO-07, SEO-10, SEO-11, SEO-13 | One implementation must own origin, base path, trailing slash, and query handling. |
| Page metadata builder | SEO-03, SEO-06, SEO-10, SEO-11 | Title and description must not diverge among HTML, social metadata, JSON-LD, and video sitemap output. |
| Crawlable pagination contract | SEO-05, SEO-08, SEO-09 | Each page is self-canonical, linked with ordinary anchors, included in the sitemap, and small enough to fetch fully. |
| Video metadata contract | SEO-10, SEO-11, SEO-13 | Preserve ISO duration and use the same title, description, thumbnail, date, embed, and offsets everywhere. |
| Production origin | SEO-02, SEO-03, SEO-05, SEO-07, SEO-10, SEO-11, SEO-14 | A custom-domain decision changes all absolute URL outputs and must be handled as a migration. |

## Recommended delivery order by value

The tasks remain independently shippable, but the best first delivery wave is not the same as the ease ranking:

1. Decide whether a custom domain is imminent. Do not start a migration merely for SEO.
2. Ship index hygiene and discovery: SEO-01, SEO-02, SEO-04, and SEO-05.
3. Fix the largest current crawl defect: SEO-09.
4. Add regression protection and better snippets: SEO-08 and SEO-06.
5. Add presentation and video eligibility: SEO-07, SEO-03, SEO-10, and SEO-11.
6. Run SEO-12 continuously in small topic batches; evaluate SEO-13 only after the base video markup is stable.
7. Begin SEO-15 with the strongest curated resources and stable URLs.

## Validation and handoff expectations

For any implementation item:

- Preserve unrelated transcript, shard, schedule, log, report, and generated-output changes.
- Add focused source tests before running repository-wide checks.
- Validate rendered output, not only Astro source.
- Use `C:\Program Files\nodejs\npm.cmd` if the roaming npm shim fails.
- Allow at least 15 minutes for full `site:build`; silence during Astro/Pagefind is normal.
- A complete integration change should normally pass the relevant targeted test, `npm run site:check`, `npm run site:build`, and its rendered-output SEO checks.
- After deployment, verify representative URLs, sitemap files, canonicals, robots metadata, structured data, Page Indexing, Video Indexing, and Core Web Vitals in the appropriate Google tools.

## Authoritative references checked for this plan

- [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: specify canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: robots meta tag specifications](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Google: write useful meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google: crawlable links and internal linking](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google: VideoObject and key-moment structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Google: video SEO best practices](https://developers.google.com/search/docs/appearance/video)
- [Google: page experience and Core Web Vitals](https://developers.google.com/search/docs/appearance/page-experience)
- [Google: site names and domain/subdomain eligibility](https://developers.google.com/search/docs/appearance/site-names)
- [Google: current crawler fetch-size behavior](https://developers.google.com/search/blog/2026/03/crawler-blog-post)
- [Astro: sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
