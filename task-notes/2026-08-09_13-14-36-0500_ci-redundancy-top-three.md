# CI Redundancy: Top Three Opportunities

## Scope and current baseline

The observed `npm run check:ci` run completed in about 14 minutes 16 seconds. Its top-level sequence is sound: type-check and test once, build the production site once, then validate the built output. This plan covers only redundant work reachable from the Deploy Site workflow's `npm run check:ci` command.

The source-linkage cleanup completed before this plan established the following baseline:

- `npm test` runs `src/**/*.test.ts` through Node with `tsx` after its current clean-and-build step.
- `check:production` calls `check:site-seo`, which executes `src/scripts/check-site-seo.ts` directly.
- Test workers and validation helpers execute their canonical TypeScript sources under `src/`.
- Command-surface assertions reject executable references to `dist/scripts`.

Root `dist/` is therefore generated output. No command in the current GitHub pipeline consumes its compiled scripts.

## 1. Keep the topic-usage report out of the CI source gate

`check:source` currently runs `report:video-topic-usage` after the gating normalization, topic-store, and site-content checks. The report is an on-demand taxonomy-curation artifact: it writes `reports/video-topic-usage.tsv` and `reports/topic-normalization-review.tsv`, but its duplicate-review count is informational and does not fail CI.

In the observed run, this command took about 64 seconds and wrote an 8.5 MB usage report that was not included in the deployed Pages artifact.

Recommended change:

- Remove `report:video-topic-usage` from `check:source`.
- Retain the standalone command for explicitly authorised taxonomy-maintenance work.
- Update command-surface tests and guidance so the report remains discoverable without becoming a routine build stage.

Why it helps: GitHub stops creating a large, non-gating report during every source validation while retaining all source gates.

Validation:

- `npm test`
- `npm run check:source`
- `npm run report:video-topic-usage`
- `npm run check:ci`

## 2. Stop emitting unused root build output during tests

`npm test` currently runs `clean`, emits compiled JavaScript with `build`, and then executes the TypeScript tests from `src/**/*.test.ts`. The later `site:build` and `check:production` stages also execute their tooling from `src/`, so the root `dist/` output produced at the start of CI has no consumer.

Recommended change:

- Replace the `clean && build` prefix in `test` with one `check:types` pass.
- Continue running the tests from `src/**/*.test.ts` through Node with `tsx`.
- Retain `clean` and `build` as explicit commands for callers that intentionally want compiled output.
- Update the documented `test` contract and command-surface assertions to require type-checking without a CI dependency on `dist/scripts`.

Why it helps: CI keeps the same TypeScript checking and test coverage while avoiding deletion and re-emission of compiled files that no later stage uses.

Validation:

- `npm run check:types`
- `npm test`
- `npm run check:ci`

## 3. Combine the SEO and rendered-date HTML scans

`check:site-seo` enumerates and parses every rendered HTML page. `check:rendered-video-dates` then performs another complete enumeration and read of the same HTML output before separately inspecting Pagefind fragments. The current `site/dist` contains about 181,000 files and 1.33 GB of data, so the duplicate HTML traversal is substantial.

Recommended change:

- Extract the SEO and rendered-date checks into source-owned validation functions that accept one parsed rendered-page snapshot.
- Add one production-validation coordinator that traverses rendered HTML once and applies both sets of checks.
- Preserve the date validator's coverage of segment details, browse cards, video details, forbidden public wording, semantic `<time>` values, home-page metadata, and publication readiness.
- Retain the Pagefind-fragment date pass because it verifies indexed metadata that the HTML snapshot cannot prove.
- Keep focused standalone entrypoints for SEO and rendered-date diagnosis while changing `check:production` to use the combined coordinator.
- Preserve each validator's diagnostics so a failure still identifies the violated contract.

Why it helps: production validation reads and parses the rendered HTML corpus once instead of twice.

Validation:

- Focused SEO and rendered-date unit tests
- `npm run check:site-seo`
- `npm run check:rendered-video-dates`
- `npm run check:production`
- `npm run check:ci`

## Recommended order

1. Remove the non-gating report from `check:source`.
2. Replace the unused test-time emit with `check:types`.
3. Consolidate the rendered HTML traversal after the two command-surface changes are complete.

Astro rendering, Pagefind indexing, search-ranking checks, archive integrity checks, source validation, and Pagefind date-metadata validation remain required production gates.
