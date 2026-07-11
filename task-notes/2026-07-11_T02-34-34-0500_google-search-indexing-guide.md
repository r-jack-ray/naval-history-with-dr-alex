Timestamp: 2026-07-11T02:34:34-05:00

# Google Search Discovery and Indexing Guide

## Project

- Repository: `https://github.com/r-jack-ray/naval-history-with-dr-alex`
- Published site: `https://r-jack-ray.github.io/naval-history-with-dr-alex/`
- Hosting: GitHub Pages

## Objective

Improve the site's technical readiness for Google crawling, indexing, and search visibility without adding misleading SEO text or changing the editorial character of the site.

The implementation should make it easy for Google to:

1. Discover every substantive page.
2. Determine the canonical URL for each page.
3. Understand the site's page hierarchy and video-related content.
4. Render the same important content and links on mobile and desktop.
5. Avoid indexing duplicate, generated, utility, or low-value pages when appropriate.
6. Provide actionable diagnostics through Google Search Console.

This work can improve discovery and indexing, but it cannot guarantee rankings or that Google will index every page.

## Scope

Inspect the current repository and implement only the items that are missing, broken, or materially incomplete.

Expected areas include:

- XML sitemap generation
- `robots.txt`
- Canonical URLs
- Page titles and meta descriptions
- Internal crawlable links
- Structured data
- GitHub Pages base-path handling
- Mobile-visible content
- Indexability safeguards
- Documentation for Google Search Console setup

Do not assume the implementation framework or generator structure before inspecting the repository.

## Phase 1: Audit the Current Site

Before changing code, inspect the repository and generated output.

### Determine

- The static-site framework and build process.
- The configured production base URL.
- Whether the site is built under the GitHub Pages subpath:
  - `/naval-history-with-dr-alex/`
- Whether a sitemap is already generated.
- Whether `robots.txt` already exists.
- Whether page templates already emit canonical links.
- Whether metadata is generated centrally or separately by page type.
- Whether JSON-LD or other structured data already exists.
- Whether question pages, episode pages, topic pages, and index pages are reachable through ordinary HTML links.
- Whether any templates emit `noindex`, `nofollow`, or conflicting canonical URLs.
- Whether JavaScript is required before primary page content or navigation links become available.

### Record Findings

Create a concise report under `reports/` containing:

- Existing SEO and indexing features
- Missing features
- Incorrect or risky behavior
- Files likely requiring modification
- Any items requiring manual Google configuration rather than code changes

Do not modify generated output directly when it is produced from templates or source data.

## Phase 2: Sitemap

Ensure the production site exposes:

```text
https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap.xml
```

### Sitemap Requirements

The sitemap should include canonical production URLs for substantive public pages, including as applicable:

- Homepage
- Episode pages
- Individual question pages
- Topic, category, ship, person, battle, or other reference index pages
- Other useful editorial or navigation pages intended for search discovery

Exclude pages that are:

- Drafts
- Development-only output
- Duplicate routes
- Search-result pages generated from query parameters
- Reports or internal tooling pages
- Error pages
- Redirect-only URLs
- Explicitly marked non-indexable

### Sitemap Validation

Verify that:

- Every URL uses HTTPS.
- Every URL includes the GitHub Pages repository subpath.
- URLs do not point to localhost, preview hosts, repository source files, or filesystem paths.
- URLs match the canonical link emitted by the corresponding page.
- The XML is valid.
- The sitemap is present in the final built site.
- A representative sample of sitemap URLs returns successful pages after deployment.

Use existing framework-supported sitemap generation when available. Avoid building a parallel custom sitemap system unless necessary.

## Phase 3: robots.txt

Ensure the production site exposes:

```text
https://r-jack-ray.github.io/naval-history-with-dr-alex/robots.txt
```

A suitable minimal result is:

```text
User-agent: *
Allow: /

Sitemap: https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap.xml
```

Modify this only when the repository has real paths that should be excluded from crawling.

### Requirements

- Do not block the entire site.
- Do not block CSS, JavaScript, images, or other resources needed to render public pages.
- Do not use `robots.txt` as a substitute for `noindex`.
- Reference the production sitemap with an absolute URL.
- Confirm the file is copied to the root of the deployed GitHub Pages site.

## Phase 4: Canonical URLs

Every indexable HTML page should emit one canonical link in its `<head>`:

```html
<link rel="canonical" href="https://r-jack-ray.github.io/naval-history-with-dr-alex/.../">
```

### Requirements

- Use the final production URL.
- Include the `/naval-history-with-dr-alex/` base path.
- Match the site's chosen trailing-slash convention.
- Avoid canonicalizing all pages to the homepage or to an episode index.
- Avoid relative canonical URLs when an absolute URL can be generated reliably.
- Ensure duplicate route forms resolve consistently through redirects or canonicalization.

Test at least:

- Homepage
- Episode page
- Question page
- Topic or index page
- Any pagination page

## Phase 5: Page Titles and Meta Descriptions

Inspect the metadata generated for each page type.

### Titles

Each substantive page should have a descriptive and reasonably unique `<title>`.

Suggested patterns, adjusted to the actual data model:

```text
<Question title> | Naval History with Dr. Alex Clarke
<Episode title> | Naval History with Dr. Alex Clarke
<Topic name> Questions | Naval History with Dr. Alex Clarke
```

Avoid:

- Repeating the same title across most pages
- Using only a question number or episode number
- Stuffing unrelated keywords
- Replacing clear historical terminology with awkward search-oriented wording

### Meta Descriptions

Generate concise descriptions from real page content when reliable source text is available.

For question pages, a description may use the short answer or a carefully bounded summary. It should not expose raw transcript filler, timestamps, template labels, or truncated Markdown syntax.

When no reliable unique description exists, omit the description rather than generating low-quality or misleading text.

## Phase 6: Crawlable Internal Links

Google should be able to reach every important page by following ordinary HTML anchor links without operating the site's search interface.

### Verify Navigation Paths

- Homepage to major indexes
- Episode index to episode pages
- Episode pages to their question pages
- Question index to individual question pages
- Topic pages to related questions
- Question pages back to the source episode
- Related-question links where the relationship is genuine

### Requirements

Use rendered anchors such as:

```html
<a href="/naval-history-with-dr-alex/questions/example-page/">
  Why did the Royal Navy adopt this design?
</a>
```

Links should:

- Have descriptive visible text.
- Use valid production-aware paths.
- Not depend solely on click handlers.
- Not exist only after running the client-side search engine.
- Avoid large sets of repetitive, unrelated links added merely for SEO.

Do not create a giant indiscriminate link dump. Preserve usable site structure.

## Phase 7: Structured Data

Add or correct JSON-LD only when it accurately describes the visible page content.

### Recommended Baseline

Consider these schema types where appropriate:

- `WebSite` for the site identity
- `BreadcrumbList` for hierarchical navigation
- `VideoObject` for pages centered on a specific YouTube episode or source video
- `Article` or another suitable type only when the page genuinely fits that schema

### VideoObject Guidance

For episode pages or question pages tied to a source video, include fields only when the repository has reliable values, such as:

- `name`
- `description`
- `thumbnailUrl`
- `uploadDate`
- `embedUrl`
- `contentUrl`
- `duration`

Do not invent unavailable dates, durations, thumbnails, authorship, or publication details.

### Structured Data Rules

- JSON must be valid.
- Values must agree with visible page content.
- URLs must use the production host and base path.
- Avoid duplicate conflicting JSON-LD blocks from nested templates.
- Do not mark every question page as a standalone video when it merely references a timestamp in a longer episode unless the chosen schema remains accurate.
- Do not add FAQ structured data merely because the site uses a question-and-answer presentation. Treat it cautiously and only implement it if it complies with current Google eligibility guidance and accurately represents the page.

Add automated validation where practical.

## Phase 8: GitHub Pages Base-Path Safety

The deployment URL is under a repository subpath rather than the domain root.

Audit all SEO-sensitive URLs for correct base-path handling:

- Canonical links
- Sitemap entries
- `robots.txt` sitemap URL
- Open Graph URLs
- Structured-data URLs
- Internal links
- CSS and JavaScript assets
- Favicons and social-preview images

No generated production URL should accidentally resolve as:

```text
https://r-jack-ray.github.io/questions/...
```

when the correct form is:

```text
https://r-jack-ray.github.io/naval-history-with-dr-alex/questions/...
```

Prefer the framework's production URL and base-path configuration over scattered string concatenation.

## Phase 9: Indexability and Duplicate Control

Inspect for accidental indexing barriers:

```html
<meta name="robots" content="noindex">
```

```http
X-Robots-Tag: noindex
```

```text
Disallow: /
```

Also inspect for duplicate-content sources such as:

- Multiple URLs for the same question
- `.html` and clean-URL versions
- Case variants
- Trailing-slash and non-trailing-slash versions
- Duplicate generated pages under old routes
- Query-parameter versions that expose the same content

Use the framework and GitHub Pages behavior to establish one consistent public URL per page. Do not add complex redirects unless the hosting stack supports them reliably.

## Phase 10: Mobile and Rendered Content

Google primarily evaluates the mobile-rendered page.

Verify that on narrow viewports:

- The full primary question and answer remain present in the DOM.
- Episode links and question links remain discoverable.
- Content is not removed and replaced with desktop-only placeholders.
- Navigation remains usable.
- Important text is not inserted only after user interaction.
- Client-side failures do not leave an empty page.

Responsive collapsing is acceptable when content remains accessible and crawlable.

## Phase 11: Open Graph and Social Metadata

Although this is not a direct indexing mechanism, consistent social metadata helps shared links present clearly.

Audit or add as appropriate:

- `og:title`
- `og:description`
- `og:url`
- `og:type`
- `og:image`
- Twitter card metadata

Ensure `og:url` matches the canonical URL and includes the GitHub Pages base path.

Do not let this work delay the sitemap, canonical, and internal-link requirements.

## Phase 12: Automated Tests

Add tests or build-time checks appropriate to the repository.

At minimum, verify representative generated pages for:

- A nonempty `<title>`
- Exactly one canonical link
- A canonical URL using the production origin and repository subpath
- No accidental `noindex`
- Valid internal base-path links
- Valid JSON-LD when present
- Presence of sitemap and `robots.txt`
- Sitemap URLs matching the expected production prefix

Where practical, add a site-wide generated-output check that finds:

- Broken internal links
- Canonicals outside the production site
- Duplicate canonical URLs across unrelated pages
- Sitemap entries with missing generated files
- Orphaned question pages not linked by any index or episode page

Do not make tests depend on live Google services.

## Phase 13: Manual Google Search Console Instructions

Create a repository document such as:

```text
docs/google-search-console-setup.md
```

Adapt the path if that location would be published unintentionally or conflicts with the site's content structure. A private project-documentation location is preferable if `docs/` is the GitHub Pages publishing root.

The document should tell the maintainer to:

1. Open Google Search Console.
2. Add a URL-prefix property for:

   ```text
   https://r-jack-ray.github.io/naval-history-with-dr-alex/
   ```

3. Complete ownership verification using a method compatible with GitHub Pages.
4. Submit:

   ```text
   https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap.xml
   ```

5. Use URL Inspection for:
   - Homepage
   - Main question index
   - One episode page
   - One representative question page
6. Request indexing only for important new or substantially changed pages rather than trying to submit every page manually.
7. Review the Page indexing report for exclusions and errors.
8. Review the Performance report for queries, impressions, clicks, and pages.
9. Recheck after major routing, canonical, or sitemap changes.

Clearly mark these as manual steps that Codex cannot complete without access to the owner's Google account.

## Phase 14: Validation Commands and Evidence

Use the repository's existing package manager and scripts where available.

Run all relevant checks, such as:

- Dependency installation if needed
- Production build
- Existing test suite
- Linting
- New SEO/indexing tests
- Local inspection of generated HTML
- Sitemap XML validation
- Internal-link validation

When the site can be served locally, inspect representative pages in the production configuration rather than relying only on source templates.

Provide evidence in the final report:

- Commands run
- Test results
- Generated file paths
- Representative canonical URLs
- Representative sitemap entries
- Any unresolved limitations

## Acceptance Criteria

The task is complete when all applicable criteria below are satisfied:

- The production build succeeds.
- The deployed output contains `sitemap.xml`.
- The deployed output contains `robots.txt` referencing the sitemap.
- Important page types are present in the sitemap.
- Every tested indexable page emits exactly one correct canonical URL.
- Canonical and structured-data URLs include the GitHub Pages repository subpath.
- Representative question pages are reachable through normal HTML links.
- No accidental site-wide crawl or indexing block exists.
- Metadata is descriptive and page-specific where reliable content permits it.
- Structured data is valid and does not invent facts.
- Automated tests cover the most important regressions.
- Manual Google Search Console setup is documented separately from code changes.
- A final implementation report identifies changed files, test evidence, and remaining manual actions.

## Constraints

- Preserve the site's existing historical content and editorial wording.
- Do not generate keyword-stuffed prose.
- Do not change question or answer meaning merely for SEO.
- Do not invent metadata unavailable from the source material.
- Do not add tracking scripts or analytics unless explicitly requested.
- Do not expose repository reports, development files, or internal data through the published site.
- Do not manually edit large sets of generated pages when the correct fix belongs in a shared template, generator, or data pipeline.
- Prefer small centralized changes with tests over repeated per-page patches.

## Final Codex Response

After implementation, report:

1. What was already present.
2. What was added or corrected.
3. Files changed.
4. Tests and validation commands run.
5. Representative generated URLs and metadata.
6. Manual Search Console steps still required.
7. Any issues that could not be resolved safely.
