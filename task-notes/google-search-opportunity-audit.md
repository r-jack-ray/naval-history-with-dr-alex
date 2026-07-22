# Google Search opportunity audit

Date: 2026-07-22  
Scope: the deployed learner-facing site and the current generated `site/dist` build  
Goal: identify realistic changes that may improve Google discovery, indexing, result presentation, and page experience for a site maintained by one person with AI assistance

## Executive summary

The site's basic Google Search implementation is already unusually strong. It emits static HTML, self-canonicals, unique metadata, crawlable pagination, breadcrumbs, `VideoObject` data, an ordinary XML sitemap, a video sitemap, and deliberate `noindex` rules. The live homepage, sitemap index, verification file, and video sitemap all returned HTTP 200 during this audit. The rendered-site validator found no structural SEO errors or warnings across 78,451 HTML pages.

The remaining opportunities are narrower and more practical than a general SEO rebuild:

1. **Paginate oversized topic detail pages.** Two indexable topic pages exceed Googlebot's current 2 MB uncompressed fetch limit. Google cannot see thousands of their later links.
2. **Shorten video and time-note title templates.** Their median `<title>` lengths are 123 and 129 characters. Google has no fixed character limit, but explicitly recommends concise titles and warns against verbose boilerplate.
3. **Use Search Console as the prioritization source.** The verification file and sitemaps exist, but private Search Console submission and indexing status could not be inspected. Confirming those is more valuable than adding more generic SEO tags.
4. **Index fewer low-value topic landing pages and improve a small selected set.** Almost 47% of public topic pages lead to only one video and one time note, and none currently has a custom topic introduction.
5. **Add one public About/Methodology page.** A concise explanation of who maintains the guide, how transcript-backed notes are produced, how AI is used, and how corrections work would add a practical trust signal.
6. **Permit large image previews where high-resolution thumbnails exist.** This is an easy search-presentation improvement, not a ranking change.
7. **Treat video-player performance and key-moment markup as measured pilots.** Both may help, but they have implementation and video-indexing tradeoffs and should not become blanket changes without Search Console evidence.

No ranking is guaranteed. Google states that meeting its requirements and best practices does not guarantee crawling, indexing, or serving a page in results. See [Google Search Essentials](https://developers.google.com/search/docs/essentials).

## Audit basis

### Current generated site

| Measure | Current result |
| --- | ---: |
| HTML pages checked | 78,451 |
| Indexable routes | 78,449 |
| URLs in ordinary sitemaps | 78,449 |
| Video sitemap records | 2,133 |
| Child sitemaps | 3, including 1 video sitemap |
| Rendered SEO validator | 0 errors, 0 warnings |
| Public topic pages | 21,048 |
| Time-note pages | 53,662 |

The two non-indexable HTML pages are the interactive Search page and the unpaginated all-topics convenience page. Both use `noindex`, while crawlable paginated alternatives remain available.

### Live endpoint checks

The following deployed resources returned HTTP 200 on 2026-07-22:

- `https://r-jack-ray.github.io/naval-history-with-dr-alex/`
- `https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap-index.xml`
- `https://r-jack-ray.github.io/naval-history-with-dr-alex/video-sitemaps/0.xml`
- `https://r-jack-ray.github.io/naval-history-with-dr-alex/google97c69278bf6d9b00.html`

The verification file proves that the required artifact is deployed. It does not reveal the private Search Console property's current state or whether the sitemap index has been submitted and accepted.

### Representative Lighthouse sample

These are single mobile lab runs against production, not field Core Web Vitals and not ranking predictions.

| Page | Performance | Accessibility | Best practices | SEO | LCP | Transfer size |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 98 | 100 | 100 | 100 | 2.1 s | 150 KiB |
| Time note | 100 | 100 | 100 | 100 | 1.2 s | 72 KiB |
| Normal topic (`naval-guns`) | 98 | 100 | 100 | 100 | 1.4 s | 102 KiB |
| Video guide | 61 | 100 | 96 | 100 | 8.4 s | 1,131 KiB |
| Very large topic (`royal-navy`) | 44 | incomplete | 100 | incomplete | 5.7 s | 824 KiB compressed |

The Royal Navy audit ended with a DevTools timeout after collecting the performance data. Its local uncompressed HTML is 5.90 MB; Googlebot's limit applies to uncompressed data, so the smaller compressed transfer size does not remove the crawl problem.

## What is already correct

These areas should be maintained, not rebuilt:

- Substantive content is server-rendered as static HTML rather than hidden behind client-side search.
- Every expected indexable route is represented in the ordinary sitemap, and video pages also appear in a dedicated video sitemap.
- The live sitemap index and video sitemap are reachable.
- Search is `noindex` but remains crawlable, so its ordinary links can still be discovered.
- Canonical URLs are absolute, production-origin, base-path aware, and self-referential.
- Detail pages have one visible H1 and matching visible/structured breadcrumbs.
- Video pages contain a visible YouTube iframe, stable thumbnail metadata, `VideoObject`, and matching video-sitemap data.
- Video and time-note pages use source thumbnails in Open Graph and Twitter metadata.
- Internal archive and detail links are ordinary `<a href>` links.
- Linked thumbnail images already have `alt` text; text links do not need `alt` attributes.
- Normal pages performed well in the Lighthouse sample and the site has no ads or intrusive interstitials.

## Prioritized findings

### P0 — Paginate oversized topic detail pages and enforce an HTML size ceiling

Googlebot currently processes only the first 2 MB of an HTML response. Bytes after the cutoff are not fetched, rendered, or indexed. Google recommends lean HTML and putting critical metadata early. See [Googlebot file-size behavior](https://developers.google.com/search/docs/crawling-indexing/googlebot) and Google's [crawler byte-limit explanation](https://developers.google.com/search/blog/2026/03/crawler-blog-post).

Two indexable pages currently exceed that limit:

| Topic page | Uncompressed HTML | Full segment links | Segment links in first 2,000,000 bytes | Full video links | Video links in first 2,000,000 bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Royal Navy | 5,896,933 bytes | 12,562 | 4,566 | 1,663 | 0 |
| Naval Procurement | 2,380,909 bytes | 4,595 | 4,587 | 1,268 | 0 |

`naval-aviation` is already close at 1,920,186 bytes. The non-indexable `topics/browse/all/` page is also 2,735,687 bytes, but it is a user-experience issue rather than an indexing priority.

Recommended change:

- Paginate the related time-note and video-guide collections on large topic pages.
- Give each pagination page a unique URL, ordinary previous/next anchors, and a self-canonical.
- Do not canonicalize every page in a sequence back to page 1.
- Keep every pagination URL in the sitemap if it remains indexable.
- Preserve the topic heading and any eventual introduction on page 1.
- Add a rendered-output failure for any indexable HTML page over approximately 1.5 MB, leaving margin for HTTP headers and future growth; add an earlier warning around 1 MB.

Google's pagination guidance explicitly recommends unique URLs, sequential `<a href>` links, and self-canonicals for each page. See [Pagination best practices](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).

Expected effect: **high confidence technical improvement**. It makes currently invisible links and text available to Google and materially improves the largest topic pages for users.

### P1 — Shorten title templates and make static H1s more literal

Current detail-page title distribution:

| Page type | Count | Median length | 90th percentile | Over 100 characters | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Video | 2,133 | 123 | 153 | 1,780 | 161 |
| Time note | 53,662 | 129 | 143 | 51,465 | 159 |
| Topic | 21,048 | 43 | 51 | 0 | 77 |

Google does not impose a fixed title-character limit, so this should not become a simplistic 60-character rule. It does, however, recommend descriptive, concise titles and warns against unnecessarily long and repetitive boilerplate. See [Influencing title links](https://developers.google.com/search/docs/appearance/title-link).

The current video title template adds the publication date, time-note count, and `Dr. Alex Clarke Video Guide` to an already long source title. Time notes add a long parent-video title, timestamp, and `Time Note` suffix.

Recommended change:

- Put the unique subject first.
- Remove the time-note count from video `<title>` text.
- Add a date only when it is needed to distinguish duplicate video titles.
- For time notes, use the segment title plus only the shortest useful parent/timestamp discriminator.
- Keep the full visible video H1 unchanged when it is the truthful source title.
- Keep title uniqueness tests, but do not satisfy uniqueness by adding opaque IDs or large boilerplate blocks.
- Decouple the browser title from `VideoObject.name` if necessary; each should remain truthful and consistent, but they need not be character-for-character identical.

The main static H1s are friendly but less literal than the corresponding metadata. Easy improvements include:

| Route | Current H1 | More search-descriptive direction |
| --- | --- | --- |
| Home | Find the Dr. Clarke answer you're looking for. | Search Dr. Alex Clarke's naval-history videos and time notes. |
| Videos | Video guides. | Dr. Alex Clarke video guides. |
| Time Notes | Find a useful moment to watch. | Find naval-history time notes. |
| Topics | Follow a naval subject. | Explore naval-history topics. |

The exact wording can retain the site's voice. The goal is to put the terms visitors actually use in the title and main heading, as recommended by [Search Essentials](https://developers.google.com/search/docs/essentials).

Expected effect: **medium confidence result-presentation and relevance improvement**. It may reduce title rewrites and makes the useful subject visible before truncation.

### P1 — Confirm Search Console submission and use its reports to choose work

The site has a deployed verification file and a valid sitemap index. The remaining high-value step is account-side confirmation, not more sitemap code.

Recommended owner checklist:

1. Confirm the URL-prefix property for `https://r-jack-ray.github.io/naval-history-with-dr-alex/` is verified.
2. Submit `https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap-index.xml` once if it is not already listed.
3. Confirm all three child sitemaps were read without errors.
4. Review Page Indexing totals by route family: videos, segments, topics, and browse pages.
5. Review Video Indexing and Video rich-result reports for representative watch pages.
6. Review Performance by query and page to identify topics already earning impressions but weak click-through rates.
7. Review Core Web Vitals before spending time on speculative performance changes.

Google says sitemap submission may speed discovery and makes sitemap processing monitorable, but a sitemap does not guarantee indexing or improve ranking by itself. See [Search Console setup guidance](https://developers.google.com/search/docs/monitor-debug/search-console-start) and [asking Google to recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

This can be a brief manual check after material deployments and roughly monthly while the archive is growing. Repository credentials or automated account access are unnecessary.

Expected effect: **high decision value**. It reveals whether the actual constraint is discovery, canonical selection, content quality, video eligibility, or user demand.

### P1 — Separate “public topic” from “indexable topic”

Current public-topic distribution:

| Topic condition | Count | Share of public topics |
| --- | ---: | ---: |
| Custom topic introduction present | 0 | 0% |
| Exactly 1 video and 1 time note | 9,886 | 47.0% |
| 2 or fewer time notes | 13,289 | 63.1% |
| 5 or fewer time notes | 16,703 | 79.4% |
| 10 or more time notes | 2,919 | 13.9% |

A one-item topic page is generally an intermediate list that points to a richer time-note page. It can remain useful for navigation without necessarily becoming its own Google landing page. There is no Google rule that says a topic needs a specific item count; the thresholds above are local evidence for a quality decision, not Google requirements.

Recommended change:

- Define index eligibility separately from route/public visibility.
- As a conservative first pass, apply `noindex` and sitemap exclusion to topics with exactly one video and one time note unless the topic is explicitly approved as a useful landing page.
- Keep those pages accessible to users if the taxonomy navigation benefits from them.
- Use Search Console impressions and learner importance to select a small batch of strong topic pages for real introductions and useful grouping.
- Keep final topic-description prose intentionally authored and reviewed; do not bulk-generate 21,048 introductions.
- Consolidate aliases and near-duplicate topic concepts through the existing normalization policy rather than creating pages for query variants.

This is not a claim that the current site violates a spam policy. The time notes are transcript-backed and add value. It is a precaution against making thousands of minimally distinct landing pages the public search surface. Google emphasizes substantial, people-first value and warns against scaled pages that add little value regardless of whether automation or humans produced them. See [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [guidance on generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), and [scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content).

Expected effect: **medium-to-high confidence index-quality improvement**, especially if Search Console shows many discovered-but-not-indexed or crawled-but-not-indexed topic URLs.

### P2 — Add one public About/Methodology page

The public site explains the learner purpose but does not currently provide an About or editorial-method page. Google recommends making it clear who created content, how it was produced, and why users should trust it. It specifically mentions clear sourcing, author or site background, and About pages. See [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content#who-how-why).

One concise static page is enough for this project's scale. It should explain:

- that the site is an independent learner-oriented study guide;
- that Dr. Alex Clarke's videos and transcript-visible statements are the source material;
- how timestamps, notes, evidence windows, and topic links are produced and checked;
- the role of AI assistance and the limits of automated interpretation;
- who maintains the site;
- how a factual, transcription, or linking error can be reported;
- that the original video remains authoritative for context.

Link it from the footer and, optionally, from the source panel on time-note pages. A separate byline on all 53,662 generated notes is unnecessary if the shared methodology and maintainer information are clear.

Expected effect: **medium trust and user-value improvement** with low maintenance cost.

### P2 — Permit large image previews for high-resolution video thumbnails

Current thumbnail sources:

| Thumbnail source | Videos |
| --- | ---: |
| YouTube `maxresdefault.jpg` | 1,951 |
| YouTube `sddefault.jpg` | 100 |
| YouTube `hqdefault.jpg` | 82 |

Video and time-note pages already emit `og:image`, but indexable pages do not explicitly allow large image previews. Google supports:

```html
<meta name="robots" content="max-image-preview:large">
```

This allows, but does not guarantee, a larger image preview in web results, Google Images, Discover, and other surfaces. See [robots preview controls](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#max-image-preview).

Recommended change:

- Emit `max-image-preview:large` on indexable video and time-note pages when the selected thumbnail is genuinely high resolution.
- Preserve `noindex` as the controlling directive on non-indexable pages.
- Update the rendered SEO validator, which currently assumes indexable pages have no robots meta element, to allow this positive preview directive.
- Do not upscale the 182 smaller thumbnails merely to satisfy a nominal dimension.

Expected effect: **low ranking effect, potentially useful click-through and Discover presentation effect**. This is a search-appearance improvement rather than a content or indexing fix.

### P2 — Investigate video-page Core Web Vitals before changing the player

The representative video page scored 61 for Lighthouse performance with an 8.4-second LCP. Its own document and CSS were small; most transfer weight came from the YouTube player, including roughly 862 KiB of player scripts in that run. The page already uses `youtube-nocookie.com` and `loading="lazy"`.

Recommended sequence:

1. Check real video-route Core Web Vitals in Search Console. A single Lighthouse result is not enough to justify a risky player rewrite.
2. If field data is poor, prototype automatic post-load or viewport-based iframe activation on a small test set.
3. Ensure the iframe appears in rendered HTML without requiring a click, swipe, or other user action.
4. Retain the stable `embedUrl`, `VideoObject`, video sitemap, and visible watch-page prominence.
5. Verify the rendered player through URL Inspection and confirm Video Indexing does not regress before broad rollout.

Do not use a purely click-to-load facade without testing. Google's video guidance says not to rely on user actions to load a video and requires an embedded video on the watch page. See [Video SEO best practices](https://developers.google.com/search/docs/appearance/video). Google also advises treating Core Web Vitals as one part of overall page experience, not as a standalone ranking target. See [Page experience](https://developers.google.com/search/docs/appearance/page-experience).

Expected effect: **conditional medium page-experience improvement**. Do nothing if field data is already good.

### P3 — Pilot same-page timestamp URLs and `Clip` key moments

The archive already contains curated segment titles and `startSeconds`, which makes it unusually well suited to video key-moment markup. The missing prerequisite is a local watch-page URL that actually seeks the embedded player.

Recommended pilot:

- Add a same-path parameter such as `/videos/<slug>/?t=120` that starts the embedded video at 120 seconds.
- Keep the canonical URL on the base video page without the timestamp parameter.
- Verify direct loading, back/forward navigation, and mobile behavior.
- Add a bounded set of high-quality `Clip` records under the page's `VideoObject`, using existing segment titles and offsets.
- Start with a small set of videos that already earn impressions or have especially strong time-note coverage.
- Validate the deployed page with Google's Rich Results Test and Video Indexing report before expansion.

Google requires each `Clip.url` to use the same video-page path with time parameters and requires the page to be a place where users can watch the video. See [`Clip` structured data](https://developers.google.com/search/docs/appearance/structured-data/video#clip).

Expected effect: **possible video-result enhancement**, not a guaranteed ranking improvement. It is lower priority because Google may already infer key moments from YouTube.

## Small optional cleanups

- Replace repeated `Watch at this time` text with a more descriptive visible label where it remains readable, for example `Watch “Royal Navy cruiser limits” at 2:34:26 on YouTube`. Google uses anchor text as a relevance and discovery signal. This is a minor clarity improvement because the current links already sit beside descriptive context. See [link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
- Consider adding a representative `og:image` only to selected, substantial topic pages after their index-quality policy is settled. Do not assign arbitrary thumbnails across all topics.
- If accurate per-page modification dates are introduced later, add truthful sitemap `lastmod` values. Do not use every build time or the original video publication date as a false content-modification date.

## Suggestions intentionally excluded

The following are not recommended for this project now:

- **A custom domain solely for SEO.** It would create migration work and recurring cost without a predictable ranking benefit.
- **A project-path `robots.txt`.** The site is under a GitHub Pages subdirectory; robots rules are authoritative only at the hostname root. The missing root file permits crawling.
- **A domain-level `WebSite` site-name campaign or favicon migration.** Google treats a hostname, not a subdirectory, as a site for these features. This is not worth changing the hosting model to obtain.
- **Bulk AI-written topic introductions or pages for query variants.** Quantity is not a substitute for unique value and could create scaled-content risk.
- **`FAQPage` or `QAPage` markup for ordinary transcript Q&A.** Those segment types do not match Google's supported page contracts.
- **Fake sitemap freshness fields.** Do not add build-time `lastmod`, `changefreq`, or `priority` values merely to appear active.
- **Alt attributes on every link.** `alt` belongs on images; ordinary links need descriptive visible anchor text.
- **Paid SEO tools, automated rank scraping, repository Search Console credentials, backlink campaigns, or multi-person editorial processes.** None is necessary to execute the prioritized work above.

## Recommended implementation order

1. Paginate oversized topic detail pages and add the rendered HTML size gate.
2. Shorten video/time-note title templates and make the four static H1s more literal.
3. Confirm Search Console sitemap, Page Indexing, Video Indexing, and Core Web Vitals status.
4. Use those reports to define topic index eligibility; begin with singleton topics if evidence supports it.
5. Add the About/Methodology page and footer link.
6. Add conditional large-image-preview permission.
7. Run a bounded video-player performance experiment only if field data is poor.
8. Pilot same-page timestamps and `Clip` markup on a small set of strong videos.

## Verification for future changes

For each implemented item:

- run focused tests for the affected helper or route contract;
- run `npm run site:check`;
- run the full `npm run site:build` with the repository's 15-minute timeout allowance;
- run `npm run check:site-seo` against the resulting `site/dist`;
- spot-check production canonicals, sitemap membership, robots directives, and rendered HTML;
- use URL Inspection or Rich Results Test when changing video rendering or structured data;
- compare Search Console results only after Google has had time to recrawl.

## Official Google documentation reviewed

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google guidance on generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [Spam policies, including scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies)
- [Googlebot and the 2 MB fetch limit](https://developers.google.com/search/docs/crawling-indexing/googlebot)
- [Crawler byte-limit explanation](https://developers.google.com/search/blog/2026/03/crawler-blog-post)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Search Console setup](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Pagination best practices](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Title-link guidance](https://developers.google.com/search/docs/appearance/title-link)
- [Snippet and meta-description guidance](https://developers.google.com/search/docs/appearance/snippet)
- [Link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Video SEO best practices](https://developers.google.com/search/docs/appearance/video)
- [`VideoObject` and `Clip` structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Video sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps)
- [Robots preview controls](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Page experience](https://developers.google.com/search/docs/appearance/page-experience)

