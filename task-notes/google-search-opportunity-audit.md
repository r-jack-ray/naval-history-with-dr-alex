# Google Search opportunity audit — usability-first revision

Date: 2026-07-22  
Scope: the deployed learner-facing site and the current generated `site/dist` build  
Goal: identify realistic improvements for a reference and learning site based on Dr. Clarke's YouTube videos and live streams, while treating Google discovery and presentation as supporting concerns rather than the product goal

## Executive summary

The site's basic learner flow and Google Search implementation are already strong. A visitor can search a subject, open a concise transcript-backed time note, see its source video and timestamp, inspect the longer parent guide, and jump to the original YouTube moment. The site also emits static HTML, self-canonicals, breadcrumbs, `VideoObject` data, ordinary and video sitemaps, and deliberate `noindex` rules. The live homepage, sitemap index, verification file, and video sitemap returned HTTP 200 during this audit. The rendered-site validator found no structural SEO errors or warnings across 78,451 HTML pages.

The priorities should therefore be chosen by asking whether a change makes Dr. Clarke's work easier to find, understand, verify, and watch. Google requirements matter when they expose a real technical defect or support that experience; they should not dictate the site's information architecture.

The recommended order is:

1. **Make very large topic collections usable.** Royal Navy currently contains 12,562 time notes and 1,663 video guides on one page. Pagination is necessary, but the learner need is broader: clear starting points, topic-local filtering, manageable result sets, and stable shareable pages.
2. **Improve broad search-result journeys.** A live search for `Jutland` returned 1,838 matches, showing 24 initially. Exact subject results are useful, but visitors need lightweight filtering and clearer distinctions between topics, time notes, and full videos when a query is broad.
3. **Improve topic coherence before reducing index coverage.** `Jutland` and `Battle Of Jutland` both appear as topic results without explaining whether they are aliases or distinct subjects. Merge true synonyms and clearly disambiguate genuinely different concepts. Do not automatically treat a one-note topic as low value; rare ships, people, and technical terms are legitimate reference entries.
4. **Reduce the number of steps from discovery to watching.** On a video guide, each time-note card should offer a clear `Watch from 2:45` action as well as the link to the deeper note. Same-page timestamp URLs would serve learners first and could support Google key-moment markup secondarily.
5. **Add a concise About/Methodology page.** This should explain the source relationship, how notes and timestamps are produced, how AI assists, the limitations of transcript interpretation, and how corrections are handled.
6. **Shorten browser-title templates for human scanning.** The visible headings already serve visitors well and should not be rewritten merely to insert search phrases. Shorter `<title>` values would improve browser tabs, bookmarks, history, and search-result readability.
7. **Use Search Console and performance data as diagnostic evidence.** They can reveal discovery, indexing, demand, and real-user performance problems, but they should not outrank the reference site's learner needs.

Large image previews and Google `Clip` enhancements remain reasonable low-priority opportunities. They should follow the improvements above.

No ranking is guaranteed. Google states that meeting its requirements and best practices does not guarantee crawling, indexing, or serving a page in results. See [Google Search Essentials](https://developers.google.com/search/docs/essentials).

## Product decision rule

The site exists to help someone answer four questions:

1. What did Dr. Clarke say about this subject?
2. In which video or live stream did he say it?
3. At what moment can I watch the explanation?
4. What related material should I study next?

A recommendation should be accepted when it improves one or more of those tasks without weakening source fidelity, completeness, accessibility, or maintainability for one person working with AI. A Google-only change should be deferred when it adds complexity without a clear learner benefit.

This rule changes two conclusions from the first draft:

- A topic with one precise time note is not automatically thin or unhelpful. Reference works need coverage of rare subjects. Topic accuracy, disambiguation, and usefulness matter more than item count.
- The existing friendly H1 text should not be replaced solely to make it more keyword-literal. Search wording belongs in supporting copy and metadata when the current heading is clearer for people.

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

### Rendered usability walkthrough

The deployed site was also exercised as a visitor rather than only inspected as generated HTML:

- The homepage states the study-guide purpose, offers direct routes to videos, time notes, topics, and search, and provides featured watch points and subject starting points.
- Search preserves the query in a shareable URL such as `/search/?q=Jutland`.
- The `Jutland` search produced 1,838 matches and initially displayed 24. It placed an exact topic first and then supplied specific time notes with source videos, dates, timestamps, kinds, summaries, and matched subjects.
- The same results also exposed a navigation problem: `Jutland` and `Battle Of Jutland` appeared as separate topics without a visible explanation of whether they mean a place, the battle, or two aliases.
- A time-note page provides a focused summary, a substantive explanatory note, topic links, source video, date, timestamp range, evidence passage, `Watch at this time`, and `Full video guide`.
- A video guide provides an embedded player and a chronological list of descriptive time notes. Opening a listed moment for its explanation is easy; watching that moment requires opening the time-note page first or manually seeking in the embedded player.

These observations make search refinement, topic coherence, collection navigation, and watch-path efficiency more important than additional generic SEO markup.

## What is already correct

These areas should be maintained, not rebuilt:

- The site clearly presents itself as a study guide rather than a transcript dump or creator-analytics site.
- Time notes explain both what Dr. Clarke covers and why the moment is worth watching.
- Source provenance is visible on time-note pages through the video, date, timestamp range, kind, and evidence passage.
- Video guides turn long videos and live streams into chronological, descriptive learning paths.
- Search queries are shareable and results expose useful distinctions such as topic, chapter, notable point, and Q&A.

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

### P0 — Turn very large topic pages into usable subject collections

The problem is not merely that Googlebot cannot process all of the HTML. A learner who opens a topic containing thousands of moments is presented with a collection too large to scan or understand as a learning path.

| Topic page | Uncompressed HTML | Time notes | Video guides | Links visible to Google before 2 MB cutoff |
| --- | ---: | ---: | ---: | --- |
| Royal Navy | 5,896,933 bytes | 12,562 | 1,663 | 4,566 time notes; 0 videos |
| Naval Procurement | 2,380,909 bytes | 4,595 | 1,268 | 4,587 time notes; 0 videos |

`naval-aviation` is close to Google's limit at 1,920,186 bytes. The non-indexable `topics/browse/all/` page is 2,735,687 bytes and presents the same human-scale problem even though indexing is not its purpose.

Recommended change:

- Show a manageable first page rather than the complete collection.
- Keep time notes and full video guides visibly distinct and show their result counts.
- Add topic-local search and lightweight filters for content type, time-note kind, and date. Do not build an elaborate faceted-search system before testing the small set that directly supports learning.
- For the most-used broad topics, add a small reviewed `Start here` group or overview. Do not manually curate thousands of topic pages.
- Use stable, shareable pagination URLs with ordinary previous/next links. Preserve full reference coverage across the sequence.
- Make each pagination page self-canonical rather than pointing every page to page 1.
- Add a rendered-output warning around 1 MB and a failure around 1.5 MB for any indexable HTML page so future growth cannot recreate the cutoff.

The Google requirement supports the same design: Googlebot processes only the first 2 MB of an HTML response, and Google recommends unique pagination URLs, sequential links, and self-canonicals. See [Googlebot file-size behavior](https://developers.google.com/search/docs/crawling-indexing/googlebot), the [crawler byte-limit explanation](https://developers.google.com/search/blog/2026/03/crawler-blog-post), and [pagination best practices](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).

Expected effect: **high learner and technical value**. Visitors get a navigable subject reference, and Google can reach material that is currently beyond its fetch limit.

### P0 — Make broad searches easier to narrow and compare

The search experience already has good foundations: the query is stored in the URL, exact topic matches appear early, results identify their type and source, and each time note has a descriptive title and summary.

The live `Jutland` test also shows the scale problem. It returned 1,838 matches and displayed 24 initially. A researcher looking for the battle generally, a specific ship, a Q&A answer, or a full lecture has to interpret one mixed stream.

Recommended change:

- Add simple content-type controls: `All`, `Time notes`, `Videos`, and `Topics`.
- When time notes are selected, allow `Chapter`, `Notable point`, and `Q&A` filtering.
- Consider a compact source-format distinction between edited videos and live streams only if visitors actually need it.
- Keep exact canonical topics first, followed by the strongest time-note matches and then broader video matches.
- Show enough source context to compare results without repeating long metadata blocks.
- Preserve the query and selected filters in the URL so a research result can be bookmarked or shared.
- Add focused ranking cases for real reference queries such as a battle, ship, class, person, acronym, weapon, and doctrine term.

The Search page is deliberately `noindex`, so this work should be judged by findability and successful navigation, not by whether Google can index the result screen.

Expected effect: **high learner value**. It shortens the path from a broad historical question to the right explanation.

### P1 — Strengthen topic coherence before changing index coverage

Current public-topic distribution provides scale context, not a quality verdict:

| Topic condition | Count | Share of public topics |
| --- | ---: | ---: |
| Custom topic introduction present | 0 | 0% |
| Exactly 1 video and 1 time note | 9,886 | 47.0% |
| 2 or fewer time notes | 13,289 | 63.1% |
| 10 or more time notes | 2,919 | 13.9% |

A rare ship, officer, treaty clause, weapon, or design term may deserve a precise topic path even when only one strong time note exists. Automatically applying `noindex` to singleton topics would optimize a number rather than the reference purpose.

The rendered `Jutland` search offers a better quality signal: `Jutland` and `Battle Of Jutland` appear as separate topics without explaining whether they are synonyms or whether the first means the geographic region. That can fragment a learner's path or make the taxonomy look unreliable.

Recommended change:

- Use the existing normalization policy to merge true aliases and near-duplicates into one canonical topic.
- Redirect retired alias routes when practical; use canonical or `noindex` treatment only when a route must remain accessible.
- Disambiguate genuinely different concepts in their display names, for example a geographic place versus a battle.
- Audit broad or surprising topic associations for subject accuracy. The question is whether the linked note teaches that topic, not merely whether the transcript contains the word.
- Add reviewed introductions only to high-use or easily misunderstood topics. Do not bulk-generate 21,048 descriptions.
- Keep a precise singleton topic indexable when it is a useful reference entry. Exclude empty, erroneous, duplicate, or irreducibly ambiguous pages—not pages based only on a low item count.

Google's people-first and scaled-content guidance supports accuracy and unique value, but it does not supply an item-count threshold. See [helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [generative-AI guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), and [scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content).

Expected effect: **high reference-integrity value** and a likely secondary indexing benefit from reducing duplicate or confusing landing pages.

### P1 — Let visitors watch a discovered moment in one action

The current pages separate two useful actions:

- a time-note card opens the full explanation;
- the time-note detail page then offers `Watch at this time` and `Full video guide`.

That is appropriate for reading, but a learner scanning a video guide must take an extra page navigation before watching the selected moment.

Recommended change:

- Give each video-guide time-note card two clearly distinguished actions: open the full note and `Watch from <timestamp>`.
- Prefer a shareable same-page timestamp URL such as `/videos/<slug>/?t=165` that seeks the embedded player. A direct timestamped YouTube link is a simpler acceptable first version.
- Keep the base video URL canonical while preserving the timestamp parameter for sharing and browser navigation.
- Change the generic detail-page label to a descriptive action such as `Watch “Jutland's fleets were decades in the making” at 2:45 on YouTube` when it remains readable.
- Consider previous/next links between time notes from the same video so a learner can continue through the guide without returning to the full list.

If local timestamp URLs are implemented well for visitors, they can later be reused for Google `Clip` markup. Structured data is a by-product, not the reason for the control.

Expected effect: **high purpose alignment**. The site's central promise is to help someone find and watch the relevant moment.

### P1 — Add one public About/Methodology page for reference transparency

The public site explains its learner purpose and each note exposes source information, but it does not currently explain the editorial method in one place.

One concise static page is enough. It should explain:

- that the site is an independent reference and study guide based on Dr. Alex Clarke's published YouTube videos and live streams;
- that Dr. Clarke's recordings and transcript-visible statements are the source material;
- how timestamps, summaries, longer notes, evidence windows, segment kinds, and topic links are produced and checked;
- how AI assists and where transcription or interpretation can still be wrong;
- who maintains the site and how to report a factual, transcription, timestamp, or linking error;
- that the original video remains authoritative for tone and full context.

Link the page from the footer and optionally from the time-note source panel. A separate byline on every generated note would add clutter without improving the reference workflow.

This is useful to learners independently of Google. It also aligns with Google's recommendation to explain who created content, how it was produced, and why it should be trusted. See [Google's who/how/why guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content#who-how-why).

Expected effect: **medium-to-high trust value** with low ongoing maintenance.

### P2 — Shorten browser titles for human scanning; retain useful visible headings

Current detail-page title distribution:

| Page type | Count | Median length | 90th percentile | Over 100 characters | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Video | 2,133 | 123 | 153 | 1,780 | 161 |
| Time note | 53,662 | 129 | 143 | 51,465 | 159 |
| Topic | 21,048 | 43 | 51 | 0 | 77 |

Long browser titles make tabs, bookmarks, history entries, and search results harder to distinguish. The visible headings are a separate concern: the homepage's `Find the Dr. Clarke answer you're looking for` is clear, memorable, and immediately supported by literal explanatory copy. It does not need to be rewritten merely for keyword placement.

Recommended change:

- Put the unique subject first in `<title>`.
- Remove the time-note count from video titles.
- Include the date only when it distinguishes otherwise duplicate source titles.
- For time notes, use the segment title plus the shortest useful parent or timestamp discriminator.
- Keep full, truthful source titles as visible video H1 text.
- Retain title-uniqueness tests without using opaque IDs or long repeated boilerplate.

Google has no fixed title-character limit, so this should not become a 60-character rule. Its guidance to use concise, descriptive titles happens to match the human scanning benefit. See [title-link guidance](https://developers.google.com/search/docs/appearance/title-link).

Expected effect: **medium usability and result-presentation value**.

### P2 — Investigate real video-page loading experience before changing the player

The representative video page scored 61 for Lighthouse performance with an 8.4-second LCP. Its own document and CSS were small; most transfer weight came from the YouTube player, including roughly 862 KiB of player scripts in that run. The page already uses `youtube-nocookie.com` and `loading="lazy"`.

Recommended sequence:

1. Check real video-route Core Web Vitals and, if possible, test on an ordinary phone and connection.
2. If visitors really experience a slow heading or unresponsive page, prototype automatic post-load or viewport-based iframe activation on a small set.
3. Keep the video obviously available and do not make the primary watch action depend on an obscure interaction.
4. Retain the stable `embedUrl`, source link, `VideoObject`, and video-sitemap record.
5. Confirm Video Indexing does not regress before broad rollout.

Do not rewrite a working player based on one lab run. Google's video and page-experience guidance is relevant, but the decision should be whether the page becomes faster and clearer for learners. See [Video SEO best practices](https://developers.google.com/search/docs/appearance/video) and [Page experience](https://developers.google.com/search/docs/appearance/page-experience).

Expected effect: **conditional medium learner value**. Do nothing if field behavior is already good.

### P2 — Use Search Console as a diagnostic, not as the product roadmap

The site has a deployed verification file and valid sitemaps. The remaining account-side checks are worthwhile but should diagnose the public surface rather than decide which naval-history material deserves coverage.

Recommended lightweight checklist:

1. Confirm the URL-prefix property for `https://r-jack-ray.github.io/naval-history-with-dr-alex/` is verified.
2. Submit the sitemap index once if it is not already listed, and confirm all three child sitemaps were read.
3. Review Page Indexing by route family and Video Indexing for representative guides.
4. Use query and page impressions to identify language visitors use and subjects they struggle to find.
5. Use Core Web Vitals to decide whether the video-player experiment is warranted.

Search data can reveal a naming or findability problem, but it should not cause the guide to abandon rare, useful reference subjects. Google also states that sitemap submission helps discovery and monitoring but does not guarantee indexing or improve ranking by itself. See [Search Console setup](https://developers.google.com/search/docs/monitor-debug/search-console-start) and [recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

Expected effect: **high diagnostic value, low direct learner value**.

### P3 — Permit large image previews for genuine high-resolution thumbnails

Current thumbnail sources:

| Thumbnail source | Videos |
| --- | ---: |
| YouTube `maxresdefault.jpg` | 1,951 |
| YouTube `sddefault.jpg` | 100 |
| YouTube `hqdefault.jpg` | 82 |

Video and time-note pages already emit `og:image`. Adding `<meta name="robots" content="max-image-preview:large">` where the selected thumbnail is genuinely high resolution may improve result presentation, but it does not improve the learning experience after arrival and is not a ranking change. See [robots preview controls](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#max-image-preview).

If implemented, preserve `noindex` on non-indexable pages, update the validator to allow the positive preview directive, and do not upscale the smaller thumbnails.

Expected effect: **low-priority search-presentation value**.

### P3 — Add Google `Clip` markup only after timestamp URLs help visitors

The archive already contains curated segment titles and `startSeconds`. If same-page timestamp URLs are added for the watch workflow, a bounded set of those moments could be exposed as `Clip` records under `VideoObject`.

Start with a small set of well-covered videos, keep the base page canonical, and validate deployed results before expanding. Google requires each `Clip.url` to use the same watch-page path with a time parameter. See [`Clip` structured data](https://developers.google.com/search/docs/appearance/structured-data/video#clip).

Expected effect: **possible video-result enhancement**. It is not a reason to build timestamp URLs that are not useful to visitors.

## Small optional cleanups

- Review search-result excerpts for repeated or run-together taxonomy text. The result title, learning summary, source video, timestamp, and a small number of matched subjects should remain visually distinct.
- Use `Video` and `Live stream` consistently where the distinction helps visitors choose a source; do not add it everywhere merely as metadata.
- Consider adding a representative `og:image` only to selected, substantial topic pages after their subject scope is settled. Do not assign arbitrary thumbnails across all topics.
- If accurate per-page modification dates are introduced later, add truthful sitemap `lastmod` values. Do not use every build time or the original video publication date as a false content-modification date.

## Suggestions intentionally excluded

The following are not recommended for this project now:

- **A custom domain solely for SEO.** It would create migration work and recurring cost without a predictable ranking benefit.
- **A project-path `robots.txt`.** The site is under a GitHub Pages subdirectory; robots rules are authoritative only at the hostname root. The missing root file permits crawling.
- **A domain-level `WebSite` site-name campaign or favicon migration.** Google treats a hostname, not a subdirectory, as a site for these features. This is not worth changing the hosting model to obtain.
- **Bulk AI-written topic introductions or pages for query variants.** Quantity is not a substitute for unique value and could create scaled-content risk.
- **Blanket `noindex` treatment based only on topic item count.** A single precise note about a rare subject can be a valuable reference destination.
- **Replacing clear visible headings solely with search phrases.** Metadata can be concise without flattening the site's learner-facing voice.
- **`FAQPage` or `QAPage` markup for ordinary transcript Q&A.** Those segment types do not match Google's supported page contracts.
- **Fake sitemap freshness fields.** Do not add build-time `lastmod`, `changefreq`, or `priority` values merely to appear active.
- **Alt attributes on every link.** `alt` belongs on images; ordinary links need descriptive visible anchor text.
- **Paid SEO tools, automated rank scraping, repository Search Console credentials, backlink campaigns, or multi-person editorial processes.** None is necessary to execute the prioritized work above.

## Recommended implementation order

1. Redesign oversized topic detail pages as manageable collections with pagination, basic filtering, and the rendered HTML size gate.
2. Add search content-type and time-note-kind filters, preserve them in the URL, and strengthen representative ranking tests.
3. Resolve or disambiguate high-impact topic collisions and aliases, beginning with cases exposed by real searches rather than singleton counts.
4. Add a direct `Watch from <timestamp>` action to video-guide time notes and make the timestamp URL shareable.
5. Add the About/Methodology page and footer link.
6. Shorten video and time-note browser-title templates while retaining useful visible headings.
7. Check real video-page loading behavior and Search Console diagnostics; experiment with player loading only if visitor evidence warrants it.
8. Add large-image-preview permission and pilot `Clip` markup only after the higher-purpose work is complete.

## Verification for future changes

Verify the visitor tasks first:

- a broad search can be narrowed to the appropriate topic, time note, or source video;
- a selected time note can be watched at the stated timestamp in one clear action;
- topic filtering and pagination preserve full reference coverage and shareable state;
- aliases lead to one coherent subject path while distinct concepts are visibly disambiguated;
- keyboard and mobile use remain practical on search, topic, video, and time-note pages.

Then run the proportional technical checks:

- run focused tests for the affected helper or route contract;
- run `npm run site:check`;
- run the full `npm run site:build` with the repository's 15-minute timeout allowance;
- run `npm run check:site-seo` against the resulting `site/dist`;
- spot-check production links, URL state, canonicals, sitemap membership, robots directives, and rendered HTML;
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
