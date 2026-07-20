Timestamp: 2026-07-20T00:26:11-05:00

# SEO Monitoring Baseline

## Status

The automated validator and repeatable Lighthouse target selection are implemented. Search Console values and deployed Lighthouse results remain pending until the owner builds and deploys the current SEO changes.

## Automated checks

- Run `npm run check:site-seo` after a complete site build. Errors are deployment-blocking; warnings identify advisory content or page-size work.
- Run `npm run audit:lighthouse:seo-baseline` after deployment. Set `SEO_AUDIT_BASE_URL` to a local or alternate deployed base URL when needed.
- The Lighthouse command selects a current Video, Time Note, and Topic from generated episode data, plus Home and the first page of the paginated Topic directory at `/topics/browse/`. Reports are written under `reports/lighthouse/seo-baseline/`.

## Search Console baseline

| Metric | Baseline | Refresh cadence |
| --- | --- | --- |
| Sitemap index status | Pending deployment and submission | After discovery-related deployments |
| Discovered URLs | Pending | After sitemap processing |
| Indexed pages | Pending | Monthly |
| Not-indexed pages and leading reasons | Pending | Monthly |
| Top queries by impressions | Pending manual export | Monthly |
| Top pages by impressions | Pending manual export | Monthly |
| Video indexing | Pending | Monthly |
| Core Web Vitals mobile | Pending | Monthly |
| Core Web Vitals desktop | Pending | Monthly |

## Lighthouse baseline

| Route type | Performance | Accessibility | Best Practices | SEO | Captured |
| --- | ---: | ---: | ---: | ---: | --- |
| Home | Pending | Pending | Pending | Pending | Pending deployment |
| Video guide | Pending | Pending | Pending | Pending | Pending deployment |
| Time note | Pending | Pending | Pending | Pending | Pending deployment |
| Topic | Pending | Pending | Pending | Pending | Pending deployment |
| Largest directory | Pending | Pending | Pending | Pending | Pending deployment |

Do not store Search Console credentials in the repository. Manual exports or manually recorded totals are sufficient.
