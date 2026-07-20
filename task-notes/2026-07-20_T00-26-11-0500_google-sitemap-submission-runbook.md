Timestamp: 2026-07-20T00:26:11-05:00

# Google Sitemap Submission Runbook

## Local implementation

- The official `@astrojs/sitemap` integration is configured for the production GitHub Pages origin and project base path.
- The integration keeps its 45,000-URL default, so a sufficiently large build emits `sitemap-index.xml` plus numbered child sitemap files.
- `/search/`, non-HTML endpoints, and topics without related videos or time notes are excluded.
- Every HTML page advertises the absolute sitemap index URL in its head.
- No project-subpath `robots.txt` is added because this repository does not control the `github.io` host root.

## Owner steps after the next site build and deployment

1. Confirm these files exist in `site/dist/` after the owner-run full build:
   - `sitemap-index.xml`
   - Every child sitemap referenced by that index, such as `sitemap-0.xml`
2. Deploy the site normally.
3. Confirm this URL returns the XML sitemap index:

   `https://r-jack-ray.github.io/naval-history-with-dr-alex/sitemap-index.xml`

4. Open the verified URL-prefix property in Google Search Console:

   `https://r-jack-ray.github.io/naval-history-with-dr-alex/`

5. Open **Sitemaps**, submit `sitemap-index.xml`, and wait for Search Console to finish reading it.
6. Record the initial result below. Do not submit thousands of individual URLs.

## Submission record

| Field | Value |
| --- | --- |
| Locally derived indexable URLs | 75,683 before the owner build; confirm against emitted XML |
| Deployment date | Pending |
| Sitemap submission date | Pending |
| Search Console status | Pending |
| Discovered pages | Pending |
| Indexed pages baseline | Pending |
| Notes or errors | Pending |

## Representative post-deployment checks

- Homepage canonical matches its sitemap URL.
- `/search/` contains one `noindex` meta tag and is absent from the sitemap.
- One video guide, one time note, and one topic page appear with the same absolute trailing-slash URL used by their canonical.
- An unreferenced topic has neither a public page nor a sitemap entry.
- Each child sitemap contains fewer than 50,000 URLs.
