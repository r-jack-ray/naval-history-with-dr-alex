# Full Site Build Performance Plan

Status: Planning only. No performance changes are implemented by this note.

Date: 2026-07-19

Review: Revised on 2026-07-19 against the current wrapper, Astro archive adapter,
route templates, Pagefind consumers, generated archive, and built output.

## Objective

Reduce the elapsed time of a forced Astro and Pagefind build against a fixed generated archive while preserving the learner-facing study-guide routes, generated-archive integrity, GitHub Pages compatibility, Pagefind search quality, and deterministic output.

Also measure, but do not conflate with the primary target:

- a forced end-to-end run that regenerates the archive;
- the unchanged-input cache-hit path.

The optimization target is the normal repository build cost. Machine-wide or ChatGPT-related performance degradation is outside this plan.

The review changes the original order: reduce and profile the workload before choosing Astro concurrency, add Astro-side archive loading as a measured surface, exclude Pagefind route families that its consumers never request, and treat multi-process route sharding as a separate research spike.

## Current Build Shape

The supported full path is sequential:

1. Validate or regenerate the generated archive.
2. Build the static Astro site.
3. Run Pagefind against the completed `site/dist` tree.

The last two stages are composed by `site:build:full` as:

```text
astro build --silent && pagefind --site site/dist
```

They cannot safely run at the same time because Pagefind consumes Astro's completed HTML. Archive generation must likewise finish before Astro reads the generated archive.

The wrapper currently launches `site:build:full` as one child command. Its total timer cannot distinguish Astro from Pagefind, so stage-specific timing requires separate named child calls or a dedicated benchmark runner before optimization begins.

Observed checkout scale on 2026-07-19, tied to the current generated archive and existing `site/dist` tree:

| Surface | Count or size |
| --- | ---: |
| Generated video records | 2,138 |
| Generated segment records | 52,167 |
| Generated topic records | 19,866 |
| Generated archive files | 67 |
| Generated archive bytes | 131,692,148 bytes |
| Built HTML files | 75,263 |
| Built HTML bytes | 928,605,801 bytes |
| Segment-area HTML | 53,255 files / 598,248,175 bytes |
| Topic-area HTML | 19,867 files / 287,482,171 bytes |
| Video-area HTML | 2,139 files / 42,854,461 bytes |
| Pagefind output | 76,561 files / 144,656,897 bytes |
| Pagefind indexed pages | 75,263 |
| Detail pages requested by the search UIs | 74,171 |
| Paginated segment-browse pages | 1,087 |
| Topic records with zero coverage | 33 |
| Topic records with exactly one segment | 9,220 |

For generated counts `V`, `S`, and `T`, the expected current route formula is:

```text
video routes   = V + 1 directory
topic routes   = T + 1 directory
segment routes = S + ceil(S / 48) browse pages + 1 finder
singletons     = home + search
```

The exact counts are a dated benchmark snapshot, not permanent acceptance constants. Every benchmark series must record the SHA-256 of `site/src/data/generated/archive/index.json`; if it changes, discard cross-series comparisons and rebaseline.

The installed Astro version is 7.1.1. The repository does not currently set `build.concurrency`, so Astro uses its default of `1` page at a time. Astro's concurrency option overlaps page-generation work inside one JavaScript process; it is not a pool of independent worker processes and should not be set directly to the machine's logical-processor count.

The shared layout currently emits approximately 3.2 KB of inline script tags into every HTML page. The second theme-interaction script accounts for approximately 2.28 KB per page, or roughly 171 MB of repeated HTML across the current output.

Before rendering routes, `site/src/data/archive.ts` synchronously reads and parses the roughly 125.6 MiB split archive, reserializes its arrays to verify hashes, validates relationships, builds indexes, and sorts some relationship collections on demand. The wrapper separately fingerprints and validates the generated archive, including a fresh pre-Astro validation that intentionally detects concurrent staleness.

Pagefind currently indexes all 75,263 HTML pages. The search page requests only `video`, `segment`, and `topic` result types, and the Time Notes finder requests only `segment`; the 1,092 home, search, directory, finder, and browse pages therefore add Pagefind records that neither consumer requests. Video detail pages also repeat every time-note summary, and topic detail pages repeat their related time-note and video titles.

## Constraints

- Preserve the segment-first route and content model.
- Preserve the GitHub Pages base path `/naval-history-with-dr-alex/`.
- Keep individual time-note pages searchable in Pagefind.
- Keep topic titles, summaries, aliases, and canonical topic routes discoverable unless a later product decision explicitly changes route policy.
- Do not hand-edit `site/src/data/generated/archive/index.json` or any manifest-listed generated shard.
- Do not run multiple Astro processes against the same output directory.
- Do not trade search correctness or route integrity for a timing improvement.
- Keep each optimization independently measurable and independently reversible.
- Preserve the fresh validation immediately before Astro; do not memoize across that staleness checkpoint.
- Preserve cache invalidation for the wrapper, generated archive, site inputs, configuration values that affect output, and required content-hashed assets.
- Keep output hashing and search-result comparison outside timed intervals.

## Phase 0: Benchmark Contract and Baseline

### Make Stage Timing Possible

Split Astro and Pagefind into separate named npm scripts or add a dedicated benchmark runner. Keep `site:build:full` as the supported composite command, preserve failure propagation, and write the site-build cache only after both stages succeed.

Time at least:

- archive input discovery and fingerprinting;
- each archive-integrity validation pass;
- archive generation when requested;
- Astro archive-adapter initialization;
- Astro route generation;
- Pagefind indexing;
- total wrapper time.

Peak memory sampling must cover the Astro process tree, not only the wrapper or npm shell.

### Benchmark Modes

Use three explicitly named modes:

| Mode | Command | Purpose |
| --- | --- | --- |
| Fixed archive, forced site | `npm run site:build:generated -- --force` | Primary Astro/Pagefind comparison; validates but does not regenerate the archive |
| Forced end to end | `npm run site:build -- --force` | Secondary generator, wrapper, Astro, and Pagefind measurement |
| Warm cache hit | `npm run site:build` | Cache correctness and unchanged-input latency |

Use `C:\Program Files\nodejs\npm.cmd` for interactive Windows runs.

### Record for Every Series

Record at least:

- resolved Node, npm, Astro, and Pagefind versions;
- CPU, available RAM, and the warm/cold filesystem-cache policy;
- generated archive manifest SHA-256 and wrapper cache versions;
- all stage timings and total time;
- peak process-tree working set during Astro;
- built HTML file count and total bytes;
- route counts by family;
- Pagefind file count and total bytes;
- Pagefind indexed-page count;
- Pagefind result counts by type and filter;
- a sorted relative-path, size, and SHA-256 inventory of the Astro tree before Pagefind;
- fixed-query Pagefind top-N results, metadata, filters, and excerpts.

### Trial Protocol

Use the same generated archive and this fixed-archive forced command for Astro/Pagefind comparisons:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run site:build:generated -- --force
```

For each control or candidate, perform one untimed warm-up followed by at least three measured trials under comparable conditions. Interleave control and candidate runs when practical. Report median, range, elapsed-second change, percentage change, and peak memory.

Predeclare the gate for a meaningful build-stage win: at least a 5% median total-time reduction and at least 10 seconds saved on the fixed-archive forced build, with no correctness regression. A stage-local optimization may use a narrower stage-specific gate only when that stage is at least 10% of total time.

Invalidate a trial when:

- the archive manifest hash changes;
- another Astro or Pagefind process overlaps it;
- paging, an `EPERM`/`TS5033` output lock, or an interrupted process occurs;
- the candidate and control use different Node/package versions or cache policy.

Editing `.codex/hooks/site-build-if-changed.mjs` invalidates both current fingerprints. Treat the first resulting normal build as cache invalidation, not as a warm-cache measurement.

Do not use a cache-hit wrapper run as the performance baseline because it intentionally skips Astro and Pagefind.

## Phase 1: Reduce Repeated and Avoidable HTML Weight

Keep Astro concurrency at `1` throughout this phase so the output-size changes are measured against a stable renderer.

### Candidate A: Externalize Theme Interaction

Keep the small early theme bootstrap inline so the saved theme can be applied before first paint. Move the larger theme-switcher interaction script from the shared layout into a processed or content-hashed external asset loaded by every page.

The external script must preserve:

- light, dark, Bruships, and system choices;
- stored theme selection;
- live system-theme changes;
- `aria-pressed` state;
- the existing safe behavior when browser storage is unavailable.

This phase targets approximately 171 MB of repeated HTML at the current page count. The exact realized reduction must be measured from the built tree rather than assumed from source size.

Use a base-aware Astro/Vite asset URL and preserve the current after-DOM execution behavior. Do not place an unhashed copy in `site/public`.

Externalization creates a new cache-integrity requirement. The current cache hit checks only `site/dist/index.html` and `site/dist/pagefind/pagefind-entry.json`; the implementation must also record or validate the required content-hashed theme asset and treat the cache as invalid if that asset is missing or corrupt.

### Candidate B: Benchmark Full Lossless HTML Compression

Benchmark Astro's explicit `compressHTML: true` separately from script externalization. Astro 7.1.1 currently defaults to `"jsx"`; the `true` setting may reduce output further but can change whitespace. Keep it only if rendered text, inline-element spacing, theme behavior, Pagefind excerpts, and accessibility labels remain correct.

### Validation

- Theme behavior works on the home, video, segment, topic, directory, and search pages.
- The early theme bootstrap still prevents an obvious incorrect-theme flash.
- Only one content-hashed copy of the interaction script is emitted.
- Deleting or corrupting that asset prevents a false cache hit.
- Built HTML bytes decrease materially without increasing route count.
- Pagefind search results and filters remain unchanged.
- A full Astro path/hash inventory is captured for each candidate; every changed file is explained by the candidate.
- The fixed-archive forced build is remeasured after each candidate independently.

### Decision Gate

Accept each candidate independently. Externalization must remove the repeated script bytes and improve or at least not regress fixed-archive total time. Accept `compressHTML: true` only when it produces an additional material byte or time reduction with no whitespace, rendering, or search regression.

### Rollback

Restore the existing inline interaction script in `BaseLayout.astro`, restore the previous HTML-compression setting, and remove any asset-cache contract added only for the rejected candidate.

## Phase 2: Remove Unused and Duplicated Pagefind Input

### Change

Keep each canonical segment, video, and topic detail page searchable, but stop indexing route families and relationship text that the current search consumers do not request.

Test these candidates separately and in this order:

1. Exclude all 1,092 non-detail records: home, search, the video/topic directories, the Time Notes finder, and all 1,087 `/segments/browse/` pages. These pages have result types the search UI never requests. Remove `data-pagefind-body` from the complete page rather than adding another narrow ignore; the browse card grid is already ignored.
2. Ignore the complete Time Notes list within each video detail page while retaining the video title, concise video topics, date/runtime/format fields, and all Pagefind metadata and filters. This list repeats all 52,167 segment summaries or Q&A answers.
3. Ignore related-time-note and related-video lists on topic detail pages while retaining the topic title, summary, aliases, and Pagefind topic metadata.

Use `data-pagefind-ignore` on duplicated detail-page surfaces. Do not remove Pagefind metadata that supplies result type, topic, video, timestamp, source date, segment kind, or filters.

After candidate 1, the expected Pagefind page count is exactly the detail-page formula `V + S + T`, currently 74,171. HTML route count remains unchanged.

### Search Regression Fixture

Before the first exclusion, save a machine-readable fixture with fixed queries covering:

- a ship name;
- a ship class;
- a navy;
- a battle or operation;
- a weapon or sensor;
- doctrine or logistics;
- a person;
- an acronym;
- an alternate topic alias;
- a known Q&A subject.

For every query, record:

- the exact query string;
- expected canonical URLs and result types;
- baseline ordered top-N URLs;
- required metadata and filters;
- the allowed ranking tolerance.

After each candidate, verify that authoritative segment, topic, and video destinations remain within the declared bounds and that type, topic, video, and segment-kind filters remain usable. A candidate may intentionally stop returning a video page for a segment-only phrase, but that change must be declared in the fixture and approved rather than hidden as “unchanged.”

Also run `npm run check:rendered-video-dates`; it verifies that every video and segment detail remains in Pagefind with the expected metadata.

### Decision Gate

Keep an exclusion only when it reduces Pagefind time or output size without removing authoritative results or materially worsening representative ranking.

### Rollback

Restore the relevant `data-pagefind-body` or remove the relevant `data-pagefind-ignore` boundary, then rebuild Pagefind.

## Phase 3: Profile and Optimize Astro Archive Loading

### Change

Instrument the initialization of `site/src/data/archive.ts` before changing it. The current adapter reads and parses all 67 generated archive files, canonically reserializes every loaded array to verify hashes, validates every record and relationship, builds lookup maps, and sorts related records for route rendering.

If this initialization is material, benchmark these changes independently:

1. Read each generated file's raw bytes once, verify the manifest SHA-256 from those bytes, and parse that same buffer once. This removes the full `JSON.stringify` pass while making noncanonical byte changes fail rather than silently normalizing them.
2. Precompute video-date numeric keys and stable sorted topic/video relationship collections once, rather than repeating `Date.parse` and sort work during page rendering.

Retain validation when `astro build` is invoked directly, without the wrapper. Keep manifest schema, provenance, path, bucket, hash, count, uniqueness, relationship, and generated-file-set checks at the layer that currently owns each guarantee.

Do not optimize generated-archive loading by embedding the whole archive in page props, duplicating it per route, or removing the lookup maps that already avoid corpus-wide scans.

### Validation

- Existing archive-adapter and generator tests pass.
- Missing, malformed, stale, mis-sharded, reordered, path-escaping, duplicate, and hash-mismatched fixtures still fail at the appropriate wrapper or Astro layer.
- The complete Astro route/path/hash inventory is identical to the control because this phase has no intended public-output change.
- Archive-adapter initialization, Astro time, total time, and peak memory are remeasured.

### Decision Gate

Implement only changes that reduce a measured material stage outside normal variation. If adapter initialization is small, record that result and close the phase without code churn.

### Rollback

Restore the prior adapter read/hash/sort implementation.

## Phase 4: Benchmark Astro Page Concurrency on the Reduced Workload

### Change

After accepted HTML and archive-loading changes have stabilized the workload, make Astro build concurrency configurable and benchmark these values:

1. `1`
2. `2`
3. `4`

Use `ASTRO_BUILD_CONCURRENCY` as a bounded positive-integer override. Reject nonnumeric, fractional, zero, negative, and values above `4`; do not silently coerce them. Keep `1` as the control and commit a different default only after the benchmark identifies a repeatable winner.

The override must be cache-safe. Include its normalized value in the site fingerprint and add a cache-invalidation test, or keep it strictly inside a benchmark runner that always forces the build. Do not allow a normal cache hit to reuse output generated with a different effective value.

Do not begin with `8`, `12`, or `24`. Astro overlaps route-generation promises in one JavaScript process; high values can increase memory pressure, garbage collection, and filesystem contention.

### Validation

- `npm run site:check:generated` passes for the selected configuration.
- Every candidate completes a forced fixed-archive build.
- The complete pre-Pagefind route set, relative-path inventory, and HTML SHA-256 inventory match the concurrency-`1` control exactly.
- Required sentinels and recorded content-hashed assets exist and match.
- Peak process-tree memory remains stable without paging or output locks.

Investigate every output difference. Do not pre-classify build metadata as nondeterministic unless a specific field is first demonstrated and documented.

### Decision Gate

Adopt the fastest value that clears the Phase 0 timing gate and memory/correctness checks. If `2` and `4` do not beat `1` outside measurement noise, retain `1` and close this phase.

After choosing a default, run one fresh benchmark series with that committed default and no override.

### Rollback

Remove the override and explicit setting or restore the committed default to `1`; bump the site cache version if fingerprint semantics changed.

## Phase 5: Prototype Archive-Backed Segment Records for Pagefind

Use this only if Pagefind remains a material share after Phase 2.

### Change

Prototype the installed Pagefind Node API as a hybrid indexer:

1. Index video and topic detail HTML normally.
2. Exclude canonical segment-detail HTML from directory indexing.
3. Add one custom Pagefind record per generated segment with its canonical `/segments/<slug>/` URL.
4. Write the completed Pagefind bundle once to `site/dist/pagefind`.

This keeps every segment page available to visitors while avoiding Pagefind's need to parse roughly 598 MB of segment-area HTML. It does not reduce Astro route-generation time.

Each custom segment record must reproduce the contract consumed by `site-search.js`, `time-notes-finder.js`, and `check-rendered-video-dates.ts`, including:

- title and searchable body/question/answer text;
- result type, video title, video ID, source date, timestamp, kind, kind key, and summary metadata;
- type, video, topic, kind, and kind-key filters;
- video-guide and timestamped watch URLs;
- stable language and canonical URL handling.

Reject duplicate or missing URLs, preserve deterministic input order, surface every Pagefind API error, and ensure HTML and custom-record inputs cannot both create the same segment URL.

### Validation

- Pagefind reports exactly `V + S + T` detail records unless an explicitly documented Pagefind behavior changes that count.
- Every video, segment, and topic URL appears exactly once.
- The complete fixed-query regression fixture, filter counts, and rendered-date regression pass.
- Index file count/bytes, Pagefind time, total time, and peak memory improve outside variation.
- Browser checks confirm search and Time Notes finder links, excerpts, filters, and pagination.

### Decision Gate

Adopt the hybrid only when it materially reduces Pagefind time and preserves all current metadata/filter/search contracts. If 52,167 custom-record calls are slower or less stable than HTML indexing, retain the CLI directory indexer and record the result.

### Rollback

Restore `pagefind --site site/dist` and the accepted Phase 2 HTML boundaries.

## Phase 6: Optimize Wrapper Fingerprinting and Validation

### Change

Profile wrapper input discovery, fingerprinting, and each validation pass before modifying them. Proceed only if they consume a meaningful share of the forced or cache-hit path.

Candidate changes:

- compute bounded per-file digests concurrently and combine them in stable path order;
- validate independent manifest-listed archive files concurrently, but select and report the first error in manifest order;
- exclude generated archive shards from the generic recursive `site/src` fingerprint only after the already validated manifest digest and declared file hashes are incorporated explicitly;
- reuse bytes or digests only within one validation/fingerprint snapshot.

Do not reuse results across the fresh validation immediately before Astro. Preserve the existing `became stale before Astro/Pagefind` guard, the wrapper's inclusion in both fingerprint sets, directory/symlink/path ordering semantics, and all output-asset checks.

Any fingerprint algorithm, input set, or effective configuration change must bump the appropriate cache version.

### Validation

- Add fixture or subprocess tests for missing, malformed, stale, mis-sharded, reordered, duplicate, path-escaping, and hash-mismatched archive files at the layer responsible for each error.
- Existing valid archives and cache hits pass.
- Fingerprints are deterministic across repeated runs.
- Changes to every tracked file input, relevant environment/configuration value, and required hashed output asset invalidate the correct cache.
- A mutation between the initial and pre-Astro checks still fails as stale.
- The measured wrapper stage improves outside variation without increasing peak memory materially.

### Rollback

Restore the prior fingerprint and validation implementation and bump the affected cache version again so no cache written by the rejected algorithm can be reused.

## Phase 7: Evaluate Route-Count Reduction

This phase requires an explicit product decision because it can change public navigation and subject discovery.

### Low-Value Route Audit

Audit, but do not automatically remove:

- the 33 currently zero-coverage topic routes;
- the 9,220 topic routes that currently lead to exactly one segment;
- browse pages that may be replaceable with the existing Pagefind-backed finder;
- topic pages whose only useful content duplicates one segment page.

Omitting all one-segment topic routes would reduce the current HTML page count by up to roughly 12%, but those routes may still provide valuable long-tail subject discovery. Redirect pages would preserve compatibility but would also preserve much of the static-route count, so they are not equivalent to route elimination as a build optimization.

### Decision Gate

Proceed only with an approved route policy covering:

- which topics merit standalone pages;
- how topic chips link when no standalone topic route exists;
- canonical URLs and compatibility expectations;
- Pagefind behavior for omitted topics;
- external-link and learner-navigation effects. The repository does not currently configure a sitemap, so sitemap work is not part of the present gate.

### Validation

- No generated link points to an omitted route.
- Search still finds the underlying segment for every omitted one-segment topic.
- Canonical topic routes retained by policy return HTTP 200.
- Route-count reduction and build-time improvement are measured directly.

### Rollback

Restore the previous topic/browse route policy and links, regenerate the complete route set, and rebuild Pagefind. Redirect-only rollback preserves URLs but not the build-time benefit and must not be reported as equivalent to route restoration.

## Phase 8: Research True Multi-Process Route Sharding Separately

This is an approval-gated feasibility study, not an implementation-ready phase of the current plan. Create a separate design note only if the earlier phases leave the full build unacceptably slow.

A true multicore design would require:

1. Deterministically partitioning static paths by route class or hash shard.
2. Running a small number of independent Astro worker processes.
3. Giving every worker a separate `outDir`, Astro `cacheDir`, and Vite `cacheDir`.
4. Providing an explicit mechanism that prevents workers from rendering unowned dynamic and singleton routes.
5. Building shared singleton routes and assets exactly once, or proving duplicate shared outputs are byte-identical.
6. Merging worker outputs with asset-reference, collision, completeness, and expected-route-manifest checks.
7. Running Pagefind once against the merged final tree.

Do not let multiple Astro processes write to `site/dist` concurrently. Separate output directories and a validated merge are mandatory.

This approach repeats Astro startup and generated-archive loading in every worker and may consume substantial memory. Benchmark two workers before considering four. Treat route coverage, asset consistency, and deterministic merge behavior as correctness requirements.

Rollback is the existing single-process Astro build. The spike must leave that path intact until the sharded build has independent correctness and performance proof.

## Recommended Implementation Order

1. Add separable stage timing and capture the fixed-archive, forced-end-to-end, and cache-hit baselines.
2. Externalize the repeated theme interaction script at concurrency `1`; benchmark `compressHTML: true` separately.
3. Exclude non-detail Pagefind records, then test duplicated video and topic relationship surfaces one at a time.
4. Profile and, only if justified, optimize Astro archive loading and sorting.
5. Benchmark Astro concurrency values `1`, `2`, and `4` on the reduced workload.
6. If Pagefind remains material, prototype archive-backed custom segment records.
7. Profile and, only if justified, optimize wrapper fingerprinting and validation.
8. Present route-count reduction as a separate learner-experience decision.
9. Create a separate multi-process feasibility plan only if all simpler changes are insufficient.

Rebaseline after every accepted phase. Do not combine several unmeasured changes into one benchmark because that would hide which optimization helped or regressed the build.

## Final Validation Matrix

Run validation in proportion to the implemented phase:

```powershell
& 'C:\Program Files\nodejs\node.exe' --check .codex/hooks/site-build-if-changed.mjs
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run site:check:generated
& 'C:\Program Files\nodejs\npm.cmd' run site:build:generated -- --force
& 'C:\Program Files\nodejs\npm.cmd' run check:rendered-video-dates
& 'C:\Program Files\nodejs\npm.cmd' run site:build:generated
```

Run `node --check` on any new plain JavaScript asset or benchmark/indexing script. `npm run check` is mandatory when the wrapper, tests, TypeScript, package scripts, archive adapter, or shared contracts change. Run `npm run generate:site-data` when generator behavior changes. When wrapper/archive-generation behavior changes, also run one forced end-to-end `site:build -- --force`, followed by an unchanged cache-hit run.

For the final accepted configuration, verify:

- archive manifest and shard integrity;
- exact expected route counts by formula and route family;
- duplicate-route absence;
- complete pre-Pagefind relative-path and SHA-256 inventory;
- GitHub Pages base-aware links;
- rendered theme behavior;
- required content-hashed asset existence and corruption/missing-asset cache invalidation;
- fixed-query Pagefind results, metadata, excerpts, type counts, and filters;
- HTML and Pagefind output sizes;
- elapsed time by stage and total;
- peak process-tree memory during Astro;
- cache-hit and cache-miss wrapper behavior.

The required wrapper sentinels remain `site/dist/index.html` and `site/dist/pagefind/pagefind-entry.json`; they are necessary but not sufficient once the shared theme logic becomes a hashed asset.

## Out of Scope

- Transcript or curated-content edits.
- Topic taxonomy normalization.
- Hand edits to generated archive files.
- Deployment or GitHub Actions changes unless later profiling shows a deployment-only bottleneck.
- Machine-wide, Windows, ChatGPT, Codex, antivirus, or filesystem-filter diagnostics.
- Route removal without an approved product policy.
- Multi-process route-sharding implementation under this plan.
- Implementation of any recommendation in this planning task.

## Expected Deliverables from a Future Implementation

Store benchmark artifacts under `reports/site-build-performance/` and include:

- environment, package versions, archive manifest hash, cache versions, and trial-validity notes;
- raw trial timings plus median/range summaries for every benchmark mode;
- pre-Pagefind route/path/hash inventories and HTML/Pagefind size counts;
- separate before-and-after results for theme externalization, HTML compression, Pagefind exclusions, archive loading, concurrency, and any later prototype;
- the fixed-query search regression fixture and before/after results;
- the selected Astro concurrency value and cache treatment, or the evidence for retaining `1`;
- exact changed files, focused validation results, and rollback status;
- explicitly deferred wrapper, hybrid-index, route-policy, and multi-process decisions.
