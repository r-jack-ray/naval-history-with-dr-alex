# Plain Search Ranking Improvement Plan

Timestamp: 2026-07-19T16:39:43-05:00

Status: Implemented and validated 2026-07-19.

## Purpose

Improve relevance ordering on the main `/search/` page so an exact subject query leads with the intended subject instead of stemmed or fuzzy near-matches. The observed regression is the plain query `HMS Victory`: results about HMS Victoria and HMS Victorious appear before direct HMS Victory results.

The solution must retain Pagefind, the segment-first study-guide structure, canonical routes, current result filters, and lazy result loading. It must not replace relevance with a static type/date sort or make the browser load every match.

## Verified Starting Point

- `site/src/scripts/site-search.js` submits the query to Pagefind with `video`, `segment`, and `topic` type filters, then renders Pagefind's order unchanged in batches of 24.
- The current Pagefind instance supplies `basePath` and `baseUrl` but no explicit ranking configuration. Pagefind 1.5.2 therefore applies its defaults, including `termSimilarity: 1.0` and `metaWeights.title: 5.0`.
- No template uses `data-pagefind-weight`, but titles are not currently unweighted: the first `h1` becomes automatic `title` metadata, title metadata receives the default 5x boost, and Pagefind gives `h1` body text its default content weight of 7.
- Pagefind 1.5.2 uses stemming and prefix-tolerant matching. A plain `HMS Victory` query can therefore match `HMS Victoria` and `HMS Victorious`. Unlike `pageLength` and `termFrequency`, `termSimilarity` accepts any non-negative value; raising it above the 1.0 default is the native control intended to suppress longer word extensions.
- Automatic title metadata is already available. Video, segment, and topic pages also expose type and topic filters; topic aliases are indexed as visible topic-page text but are not separate weighted metadata.
- Page length varies substantially: topic pages contain relationship lists, video pages contain many time notes, and segment pages are much smaller. That is a plausible scoring pressure, not yet a proven cause of this regression; Phase 1 diagnostics must establish whether length or frequency contributes before either parameter changes.
- The current topic registry snapshot contains 19,986 topics and 965 alias strings. It already supplies authoritative canonical query terms and expected `/topics/<slug>/` routes.
- The registry contains distinct `hms-victory`, `hms-victoria`, `hms-victorious`, and `hms-victoria-1887` records. The generated archive associates HMS Victory with 47 videos and 60 segments, so this is a ranking problem rather than missing content.
- The accepted fixed-archive snapshot contains 74,564 Pagefind detail records: 2,138 videos, 52,440 segments, and 19,986 topics. Its recorded Pagefind output was 144,309,847 bytes. Treat a fresh Phase 1 build as the authoritative size baseline.
- `site/dist/pagefind/pagefind-entry.json` is absent at this review because the last performance run was interrupted during Pagefind. The implementation must create one fresh baseline index before it can run the ranking checker.

## Required Outcome

For the unquoted plain query `HMS Victory`:

1. `/topics/hms-victory/` is result 1.
2. `/segments/hms-victory-first-rate-institutional-product/` appears within the first five results.
3. The direct guide `/videos/from-mary-rose-to-victory-how-and-why-construction-of-the-wooden-wall-changed-naval-history-live/` appears before both named near-matches below.
4. `/videos/hms-victoria-1887/` and `/segments/victorious-rebuild-found-accumulated-wartime-damage/` each rank after both direct HMS Victory anchors above.
5. Broad discovery remains useful: near-matches may remain in the result set, but they must not displace the exact subject from the leading positions.

Across the wider fixture:

- A unique exact canonical topic-title query returns its topic route at rank 1.
- An exact title ranks ahead of named morphological, year-qualified, or prefix-sharing siblings.
- A unique alias finds its canonical topic route within the first three results.
- For an ambiguous title or alias, the top result must belong to a declared allowed set; the checker does not impose an order within that set or invent a canonical winner that the registry does not define.
- Result URLs remain unique and the first rendered batch remains 24 items.

Fixture URLs are base-independent canonical paths such as `/topics/hms-victory/`. The checker must compare `raw_url` when Pagefind returns it, otherwise strip the configured `/naval-history-with-dr-alex/` base prefix before asserting. The rendered-UI check separately proves that browser links retain the required base prefix.

## Scope

### In scope

- Main plain-search relevance on `/search/`.
- Pagefind's public ranking options and existing result-handle diagnostics.
- Canonical-title, topic, and alias metadata where measured evidence shows it is needed.
- A small topic-derived ranking fixture and one automated built-index checker that runs Pagefind in a headless browser against a loopback-only static server.
- A bounded exactness-aware client reranker only if Pagefind-native tuning cannot satisfy the ranking contract.

### Out of scope

- Topic taxonomy cleanup, topic merging, slug or route changes, and new aliases invented only for tests.
- Transcript, video-shard, or generated archive edits.
- Hand-editing `site/src/data/generated/archive/` or `site/dist/pagefind/`.
- Replacing Pagefind with a custom search index or embedding the complete archive in the search page.
- Static Pagefind sorting by type or date; that replaces relevance instead of refining it.
- Reworking topic-directory filtering or Time Notes search in the same change. If a reusable ranking configuration is intentionally shared with `time-notes-finder.js`, its behavior must receive separate fixtures and acceptance results.
- A large benchmark framework, screenshots, or persistent per-run result dumps.
- Calling `pagefind.filters()` at query time to download the complete 19,986-topic filter dictionary merely to resolve one exact subject.

## Topic-Derived Ranking Fixture

Create one small committed fixture, proposed as `src/site/search-ranking-cases.json`. Resolve its topic slugs against `src/derived/video-segments/topics.json` so its queries and expected routes cannot drift away from the authoritative registry. Derive uniqueness and ambiguity mechanically with the same normalization used by the checker; do not label a title or alias unique by inspection alone.

Keep the gating fixture to approximately 25 cases:

| Stratum | Approximate cases | Rule |
| --- | ---: | --- |
| HMS Victory permanent regression | 1 | Exact anchors and named near-matches above |
| Unique canonical titles | 8 | Expected topic route at rank 1 |
| Collision/disambiguation families | 8 | Exact entity must outrank named siblings |
| Unique aliases | 4 | Canonical topic route within top 3 |
| Ambiguous title/alias phrases | 4 | Rank 1 must belong to the declared allowed set; no order inside the set |

Candidate families must come from existing topics, with a short reason stored in each fixture row:

- `HMS Victory`, `HMS Victoria`, `HMS Victorious`, `HMS Victoria 1887`, generic `Victory`, and the wider `victor*` family.
- Year-qualified ships such as HMS Hood, HMS Nelson, and HMS Dreadnought and their dated namesakes.
- Generic versus qualified subjects such as Royal Navy and Royal Navy doctrine/procurement/logistics topics.
- Acronym and word-boundary cases such as `ASW` and Anti-Submarine Warfare.
- Punctuation and morphology cases such as Pre-Dreadnoughts/Predreadnoughts.
- Unique aliases such as `RN` for Royal Navy and `Skagerrak` for Battle of Jutland. Both are unique after normalization in the reviewed registry snapshot; the fixture validator must recheck that fact on every run.
- Known ambiguous phrases such as `Jutland`, `Marine Nationale`, and `Dreadnoughts`; these use allowed sets rather than rank-1 assertions.

Do not query all 19,986 topics in the gating command. A separate optional observation mode may take a fixed-seed, stratified sample and report Hit@1, Hit@3, and mean reciprocal rank, but it must not lengthen routine validation or create tracked reports.

Suggested fixture fields:

```json
{
  "query": "HMS Victory",
  "queryKind": "unique-title",
  "sourceTopicSlugs": ["hms-victory", "hms-victoria", "hms-victorious"],
  "expectedRankedUrls": [
    { "url": "/topics/hms-victory/", "maxRank": 1 },
    { "url": "/segments/hms-victory-first-rate-institutional-product/", "maxRank": 5 }
  ],
  "mustRankBefore": [
    { "better": "/topics/hms-victory/", "worse": "/videos/hms-victoria-1887/" },
    { "better": "/topics/hms-victory/", "worse": "/segments/victorious-rebuild-found-accumulated-wartime-damage/" },
    { "better": "/segments/hms-victory-first-rate-institutional-product/", "worse": "/videos/hms-victoria-1887/" },
    { "better": "/segments/hms-victory-first-rate-institutional-product/", "worse": "/segments/victorious-rebuild-found-accumulated-wartime-damage/" },
    { "better": "/videos/from-mary-rose-to-victory-how-and-why-construction-of-the-wooden-wall-changed-naval-history-live/", "worse": "/videos/hms-victoria-1887/" },
    { "better": "/videos/from-mary-rose-to-victory-how-and-why-construction-of-the-wooden-wall-changed-naval-history-live/", "worse": "/segments/victorious-rebuild-found-accumulated-wartime-damage/" }
  ],
  "reason": "Exact ship name must outrank stemmed near-matches."
}
```

Ambiguous rows use `queryKind: "ambiguous"`, `allowedTopUrls`, and `allowedTopRank: 1` instead of `expectedRankedUrls`. Fixture validation must reject a row that declares both a unique winner and an allowed top set.

## Ranking Policy

Use exactness tiers only to correct relevance; do not impose a global result-type order.

1. One unique exact canonical topic-title or unique-alias route, promoted at most once.
2. Exact normalized result title or exact token-bounded title phrase.
3. Results carrying the exact canonical topic value, subject to a small fixture-selected promotion cap so a broad topic does not consume the first page.
4. Pagefind's unchanged relevance order and score.

Normalization is limited to Unicode NFKC normalization, case folding, punctuation-to-space conversion, and whitespace collapse. Compare token arrays rather than JavaScript `\b`, whose behavior is not a reliable Unicode word-boundary contract. `Victory` is not an exact-token match inside `Victoria` or `Victorious`. Preserve Pagefind order as the tie-breaker inside each tier. Ambiguous registry terms never receive tier 1.

## Implementation Phases

### Phase 1: Establish the ranking contract and baseline

- Add the compact fixture described above and validate every referenced topic slug, normalized title/alias classification, and expected route against source/generated data.
- Add one explicit built-index command, proposed as `npm run check:search-ranking`. The checker starts a loopback-only static server for `site/dist`, launches headless Chrome, imports the generated Pagefind browser bundle from that origin, and queries it with the same type filters as the live page. Do not assume the generated browser bundle can be imported directly by Node.
- Baseline and candidate modes may query Pagefind directly to collect scores and matched metadata. The default final mode must also drive the rendered `/search/` form, load additional batches when a named comparison requires it, and assert the actual link order produced by `site-search.js`; an independently configured diagnostic query is not proof that the shipped client uses the selected settings.
- If the checker imports `chrome-launcher` or `puppeteer-core`, declare those packages directly rather than relying on Lighthouse's transitive dependency tree. Reuse the installed browser; do not download a separate browser binary for this check.
- For each query, inspect only the first 50 result handles and hydrate only those 50 for route/title assertions. Record rank, normalized route, handle `score`, and `matchedMetaFields` in concise console output only on failure or when `--verbose` is supplied.
- Normalize URLs through result `raw_url` when available, otherwise strip the configured site base. Fail if two inspected handles normalize to the same canonical route.
- Run one forced baseline build because the current Pagefind sentinel is absent. Capture the fixture result, total on-disk bytes under `site/dist/pagefind`, and representative warm-query timings before tuning. Do not create tracked baseline reports.
- Do not rebuild between runtime ranking-option candidates; `termSimilarity`, `metaWeights`, `pageLength`, `termFrequency`, and `termSaturation` can all be compared against the same index.
- Keep pure normalization/comparator unit tests in the fast test suite only if Phase 3 adds client reranking. Keep the built-index check explicit after `site:build`, not inside routine `npm test`.

Acceptance gate:

- The checker reproduces the HMS Victory failure and reports deterministic rank assertions. If the fresh baseline no longer reproduces it, stop and amend the regression contract from measured results instead of tuning a stale symptom.
- Every fixture query originates in the current topic registry.
- Ambiguous normalized title/alias phrases are identified and excluded from single-winner assertions.

### Phase 2: Prefer Pagefind-native ranking

- Pass a named ranking configuration through the existing `options()` call before Pagefind initialization in `site-search.js`.
- Test the native control closest to the defect first. With the default title weight unchanged at 5.0, run a bounded `termSimilarity` sweep of 1.0, 1.5, and 2.0, stopping at the smallest passing value. Pagefind 1.5.2 clamps this option only at zero; 1.0 is the default, not the maximum.
- If that sweep does not pass, retain the best non-regressing `termSimilarity` value and run one bounded `metaWeights.title` sweep of 5.0, 7.5, and 10.0. The 5.0 baseline matters because title matches are already boosted by default.
- Use a fresh Pagefind instance for every candidate so options do not leak between comparisons; `metaWeights` is merged with defaults.
- Inspect `pageLength`, `termFrequency`, and `termSaturation` only if both targeted sweeps fail and result-handle scores identify one of them as the cause. Reject any setting that fixes HMS Victory by materially worsening the topic-derived fixture.
- Do not use Pagefind `sort` and do not combine several unexplained weight changes.

Acceptance gate:

- Select the smallest native configuration that passes every hard fixture case and does not reduce aggregate Hit@3 from baseline.
- If no native configuration passes, retain the best non-regressing native configuration and continue to Phase 3.

### Phase 3: Add only the minimum exact-match signal needed

Apply these options in order, stopping as soon as the fixture passes:

1. Reuse automatic title metadata and existing topic filter values in a bounded reranker over the leading general results.
2. If aliases cannot be identified reliably, expose joined topic aliases as one supported Pagefind metadata field on topic detail pages and give it a lower weight than the canonical title.
3. If the canonical topic can fall outside the bounded general-result window, issue one second Pagefind search restricted to `type: "topic"`, hydrate at most its first 24 results, identify the exact normalized title or unique alias from metadata, and merge that handle ahead of the general list. Do not call `pagefind.filters()`; it loads the complete filter dictionary and does not solve alias-to-route identity.
4. Add a compact exact title/alias lookup only if the topic-only search is too slow or incomplete. Generate it deterministically from `topics.json`, include only normalized title/alias-to-topic-route mappings, preserve ambiguous keys as multiple routes rather than choosing one, and measure its compressed size before accepting it.

Client reranking constraints:

- Hydrate general candidates in 24-item windows, stop as soon as the fixture-defined signal is resolved, and never hydrate more than 72 general candidates plus 24 topic-only candidates per query. Retain the current 24-result initial render.
- Promote at most one unique canonical topic page to rank 1. Select the smallest cap for other exact-topic promotions that passes the fixture, and never allow those promotions to fill the first batch.
- Preserve Pagefind score/order within each tier; do not depend on an undocumented score formula.
- Deduplicate merged handles by Pagefind's unique result `id` before hydration, then retain canonical-URL deduplication as a defensive render-time check. Keep result counts and Show More state based on the deduplicated handle list.
- Cancel stale searches using the current search-id behavior and preserve debounce, history, clear, error, and Show More behavior.

Acceptance gate:

- All hard fixture cases pass.
- In one browser session, discard the cold run and measure at least 20 warm runs for each query in a fixed representative set. Warm-cache p95 time to the first rendered batch is no more than 100 ms or 20% slower than baseline, whichever allowance is larger.
- A metadata/index change increases the recursive on-disk byte total of `site/dist/pagefind` by no more than 2% unless the plan is explicitly amended with measured justification.
- No query hydrates all matches, including the recorded 1,296-result HMS Victory case. Remeasure that count in the fresh baseline and update the note if the index has drifted.

## Expected Change Surface

Required only if the corresponding phase is reached:

- `src/site/search-ranking-cases.json`: compact authoritative fixture.
- `src/scripts/check-search-ranking.ts`: loopback/headless-browser built-index checker.
- `package.json`: one `check:search-ranking` command and direct checker dependencies only if the script imports them.
- `package-lock.json`: dependency-root update only if a checker dependency must become direct.
- `site/src/scripts/site-search.js`: Pagefind options and, only if needed, bounded reranking.
- `site/src/scripts/search-ranking.js`: DOM-independent normalization and bounded-promotion helpers.
- `site/src/pages/search/index.astro`: the generated exact-topic lookup URL supplied to the search client.
- `site/src/pages/search-topic-lookup.json.ts`: deterministic compact topic-title and alias lookup.
- `src/site/search-ranking.test.ts`: focused helper tests for token boundaries, ambiguity, and promotion.
- `site/src/pages/topics/[slug].astro`: alias metadata only if Phase 3 evidence requires it.
- `site/src/pages/videos/[slug].astro` and `site/src/pages/segments/[slug].astro`: canonical metadata only if automatic title/topic data proves insufficient.
- One small DOM-independent ranking helper and unit test only if client reranking is added.

Do not edit all of these pre-emptively.

## Validation Sequence

Use the existing fixed Windows Node/npm executables. The implementation budget is one forced baseline build, no rebuilds while comparing runtime ranking options, and one final forced build after the selected client code and any index-affecting markup are settled.

After the fixture and checker exist, establish the baseline:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run site:build -- --force
& 'C:\Program Files\nodejs\npm.cmd' run check:search-ranking -- --mode baseline
```

`--mode baseline` succeeds only when fixture validation passes and the documented HMS Victory regression is reproduced; it reports measurements without treating the known rank failure as a command failure. Candidate modes must use fresh Pagefind instances against this same index.

After selecting and implementing the smallest passing configuration, run the final gates:

```powershell
& 'C:\Program Files\nodejs\node.exe' --check site/src/scripts/site-search.js
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run site:check:generated
& 'C:\Program Files\nodejs\npm.cmd' run site:build -- --force
& 'C:\Program Files\nodejs\npm.cmd' run check:search-ranking
& 'C:\Program Files\nodejs\npm.cmd' run check:rendered-video-dates
```

If a separate plain-JavaScript ranking helper is added, run `node --check` on that exact file too. Use the project validators and direct file inspection for the planning boundary; do not add routine Git status or whitespace commands to this workflow.

Then serve `site/dist` and verify these production routes and behaviors:

```text
/naval-history-with-dr-alex/search/?q=HMS%20Victory
/naval-history-with-dr-alex/search/?q=HMS%20Victoria
/naval-history-with-dr-alex/search/?q=HMS%20Victorious
/naval-history-with-dr-alex/search/?q=RN
/naval-history-with-dr-alex/search/?q=Skagerrak
```

Check keyboard input, debounce, URL history, Clear, Show More, duplicate suppression, empty results, and base-prefixed links. Verify the exact HMS Victory rank contract from the rendered UI, not only the checker.

## Implementation Results

Implemented and validated against a freshly forced production build on 2026-07-19.

### Baseline and native-option sweep

- The baseline indexed 74,564 pages in 144,311,903 bytes. `HMS Victory` returned 1,296 matches, but `/topics/hms-victory/` ranked 37, `/segments/hms-victory-first-rate-institutional-product/` ranked 36, HMS Victoria ranked 1, and a Victorious result ranked 4. The required direct HMS Victory guide was outside the first 50.
- The 21 fixture cases with an unambiguous canonical winner measured Hit@1 `2/21`, Hit@3 `3/21`, and MRR `0.1578`. The representative warm-cache maximum p95 was 251.2 ms.
- `termSimilarity` values 1.5 and 2.0 did not improve Hit@3 and slightly reduced MRR, so the final configuration retains 1.0.
- Raising title weight to 7.5 did not improve the fixture. A title weight of 10 improved Hit@3 to `4/21` and MRR to `0.1621` without regression, but native tuning alone did not satisfy the hard cases.

### Selected implementation

- Pagefind remains the primary retrieval engine, with `termSimilarity: 1` and title metadata weight 10.
- A deterministic `/search-topic-lookup.json` endpoint maps normalized canonical titles and aliases to canonical topic routes. It preserves ambiguous mappings instead of choosing an arbitrary winner. Topic-page alias metadata was not needed.
- Exact token-phrase matching distinguishes Victory from Victoria and Victorious. The client normally inspects only the first four Pagefind candidates. A unique exact title may additionally inspect at most four topic-filtered video candidates and twenty topic-filtered segment candidates, for at most 28 Pagefind candidates plus the authoritative topic result; it never hydrates the complete match set.
- Promotion and result-data caches are bounded. Search-id cancellation, debounce, URL history, Clear, filters, the 24-card initial batch, lazy Show More, canonical-link deduplication, and base-prefixed links remain in place.
- The lookup contains 20,644 normalized keys and 20,941 topic mappings. Its generated payload is 1,288,274 bytes raw and 297,146 bytes at gzip level 9.
- No topic slug, existing canonical route, transcript shard, or hand-edited generated archive was changed. The only new route is the search-support lookup endpoint.

### Final measurements

- All 25 hard fixture cases passed. The 21 unambiguous-winner cases reached Hit@1 `21/21`, Hit@3 `21/21`, and MRR `1.0000`.
- A separate deterministic sample of 24 additional queries derived from topic titles and aliases also reached Hit@1 `24/24`, Hit@3 `24/24`, and MRR `1.0000`.
- The final Pagefind index is 144,311,752 bytes, 151 bytes smaller than baseline and comfortably within the 2% limit.
- The representative warm-cache maximum p95 was 14.0 ms, below both the 100 ms absolute gate and the measured baseline allowance.
- The rendered checker confirmed 24 unique initial cards, lazy first-50 inspection, base-prefixed links, exact HMS Victory ordering, retained near-match discoverability, and ambiguous-query behavior.
- `node --check` passed for both browser scripts. `npm run check` passed 159 tests. `site:check:generated`, a forced production build, the subsequent cache/integrity readback, `check:rendered-video-dates`, the default ranking checker, and the additional topic-derived sample all passed.

## Final Acceptance Checklist

- [x] The `HMS Victory` permanent gate passes exactly as defined.
- [x] A fresh baseline index reproduced the recorded defect before tuning, or the plan was amended from fresh evidence.
- [x] The compact topic-derived fixture passes without an arbitrary winner for ambiguous terms.
- [x] Exact token boundaries distinguish Victory from Victoria and Victorious.
- [x] Near-matches remain discoverable after direct results.
- [x] Pagefind remains the primary retrieval and scoring engine.
- [x] The first batch remains 24 results and large result sets remain lazy and bounded.
- [x] Fixture comparisons use base-independent canonical paths while rendered links retain the GitHub Pages base.
- [x] The default checker exercises the rendered search client, not only an independently configured Pagefind instance.
- [x] Any merged search handles are deduplicated by Pagefind result ID before hydration and by canonical URL while rendering.
- [x] No topic slug, existing canonical route, transcript shard, hand-edited generated archive, or unrelated search surface changed; only the documented search-support endpoint was added.
- [x] The native `termSimilarity` sweep was evaluated before title-weight, metadata, or client-reranking changes.
- [x] Query-time resolution does not load the complete Pagefind filter dictionary.
- [x] Build/index size and first-render latency stay within the stated limits.
- [x] Only the fixture, checker, lookup, and bounded ranking code required by the selected phase remain after validation.

## References

- [Pagefind ranking controls](https://pagefind.app/docs/ranking/)
- [Pagefind content weighting](https://pagefind.app/docs/weighting/)
- [Pagefind metadata](https://pagefind.app/docs/metadata/)
- [Pagefind Search API](https://pagefind.app/docs/api/)
- [Pagefind filtering API](https://pagefind.app/docs/js-api-filtering/)
- [Pagefind Search API types](https://pagefind.app/docs/api-reference/)
- [Pagefind sorting behavior](https://pagefind.app/docs/js-api-sorting/)
- [Pagefind 1.5.2 ranking option implementation](https://github.com/Pagefind/pagefind/blob/v1.5.2/pagefind_web/src/lib.rs)
