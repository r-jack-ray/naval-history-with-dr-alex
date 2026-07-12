Timestamp: 2026-07-12T03:33:46-05:00
Updated: 2026-07-12T03:39:43-05:00

# Plan: Split the Generated Astro Archive Dataset

## Status and Scope

This is a project-specific implementation plan only. It does not authorize changes to the generator, Astro pages, Pagefind output, build hooks, or generated data.

The migration should replace the tracked monolithic `site/src/data/generated/archive.json` with a deterministic manifest plus stable generated shards. It must preserve the segment-first source model in `src/derived/video-segments/`, all current static routes, and Pagefind's ownership of browser full-text search.

## Verified Current State

The original plan assumed that the browser fetches `archive.json` and that records can be grouped by episode number. Neither assumption matches this repository.

- `src/site/archive-data.ts` builds one logical `SiteArchiveData` object and atomically writes `site/src/data/generated/archive.json`.
- `src/scripts/generate-site-data.ts` is the CLI entry point. `npm run generate:site-data`, `npm run site:check`, and `npm run site:build` all use it.
- `site/src/data/archive.ts` statically imports the JSON during the Astro build and exposes all videos, segments, topics, route builders, and relationship helpers.
- The browser does not request `archive.json` on normal static pages. Astro renders the records into HTML at build time.
- `site/src/pages/search/index.astro` separately serializes a large `searchItems` array into `site/dist/search/index.html`. `site/public/scripts/site-search.js` searches that inline array; it does not currently query Pagefind.
- Pagefind is generated after Astro by `site:build:full`, but the current search UI does not use it.
- Channel records have `videoId`, dates, and `fileStem`, but no trustworthy ordinal episode number. Episode-number ranges are therefore not a valid shard key.
- Astro is configured with `base: "/naval-history-with-dr-alex"` and static output in `astro.config.mjs`.
- `.codex/hooks/site-build-if-changed.mjs` currently treats only `site/src/data/generated/archive.json` as the archive output sentinel.
- The generated archive is intentionally tracked. `README.md`, `AGENTS.md`, and several repository agent/skill briefs name the monolithic path and will need coordinated documentation updates.

Snapshot measured during this review:

| Artifact or collection | Count | Uncompressed bytes | Gzip bytes |
| --- | ---: | ---: | ---: |
| `site/src/data/generated/archive.json` | 1 file | 63,189,237 | not measured as a whole |
| `videos` collection, minified | 1,509 | 4,394,544 | 892,030 |
| `segments` collection, minified | 24,695 | 43,686,836 | 10,106,996 |
| `topics` collection, minified | 12,878 | 2,369,306 | 270,883 |
| `site/dist/search/index.html` | 1 page | 38,754,799 | 8,666,592 |

These values are a working-tree snapshot, not permanent acceptance baselines. Recompute them during a quiet coordinated build because transcript workers can change the source shards.

## Objectives

1. Replace the single 63 MB tracked generated file with a deterministic, validated multi-file dataset.
2. Keep all generated records logically equivalent: no missing or duplicated videos, segments, topics, route slugs, topic references, or video-to-segment relationships.
3. Reduce single-file Git churn, JSON parsing pressure, and the likelihood that one large generated file becomes a file-lock hotspot.
4. Preserve all static Astro routes and rendered learner-facing content.
5. Remove the search page's separate 38 MB inline corpus by making Pagefind the browser full-text search implementation.
6. Preserve GitHub Pages base-path behavior and the current cached build workflow.

Splitting the Astro build input alone will not reduce browser transfer because that input is not served directly. Browser improvement must be measured against `site/dist/search/index.html` and the Pagefind requests made by the search page.

## Proposed Output Contract

Generate this tracked structure:

```text
site/src/data/generated/archive/
  index.json
  videos.json
  topics.json
  segments/
    00.json
    01.json
    ...
    3f.json
```

Use 64 stable segment buckets. Assign every segment by its `videoId` so all segments for one video remain together:

```text
bucket = firstUInt32BE(sha256(videoId)) % 64
filename = bucket.toString(16).padStart(2, "0") + ".json"
```

Reasons for this project-specific choice:

- `videoId` is stable and present on every video and segment.
- Adding a video changes only its assigned segment bucket rather than shifting range boundaries.
- Keeping a video's segments together matches `segmentsForVideo()` and video guide rendering.
- Sixty-four buckets put the current segment corpus near 1 MB of pretty-printed data per bucket on average, while avoiding roughly 1,500 generated per-video files.
- The fixed bucket set makes expected output and stale-file cleanup simple.

Do not shard by current title, mutable slug, source filename order, array position, or a nonexistent episode ordinal. Do not use calendar-year buckets: live streams and older uploads can be added retroactively, causing concentrated churn in historical files.

Keep `videos.json` and `topics.json` as separate top-level collections initially. Their measured minified sizes are materially smaller than the segment collection. Only add stable sharding for either collection if measurement after the first migration proves it necessary.

## Manifest Contract

`archive/index.json` is the authoritative dataset manifest. It should contain no wall-clock `generatedAt` field because the generated archive is required to be deterministic.

Conceptual schema:

```json
{
  "schemaVersion": 2,
  "source": {
    "episodesInput": "src/channel/episodes.json",
    "metadataInput": "src/channel/video-metadata.json",
    "segmentsInput": "src/derived/video-segments"
  },
  "counts": {
    "videos": 1509,
    "segments": 24695,
    "topics": 12878
  },
  "segmentSharding": {
    "algorithm": "sha256-video-id-mod",
    "bucketCount": 64
  },
  "files": {
    "videos": {
      "path": "./videos.json",
      "count": 1509,
      "sha256": "..."
    },
    "topics": {
      "path": "./topics.json",
      "count": 12878,
      "sha256": "..."
    },
    "segmentBuckets": [
      {
        "id": "00",
        "path": "./segments/00.json",
        "count": 401,
        "sha256": "..."
      }
    ]
  }
}
```

Paths must be relative to the manifest. Hashes must cover the exact UTF-8 bytes written to disk. Emit all 64 bucket files, including empty arrays if a bucket is empty, so the output set remains predictable.

## Phase 0: Establish a Quiet Baseline

Before implementation:

1. Confirm no transcript curation or site generation worker is actively writing shared generated output.
2. Record `git status --short --branch` and preserve unrelated changes.
3. Run the existing generator once and record:
   - logical counts for videos, segments, and topics
   - SHA-256 of the monolithic archive
   - route counts under `site/dist/videos/`, `site/dist/segments/`, and `site/dist/topics/`
   - `site/dist/search/index.html` raw and gzip size
   - Astro and Pagefind build duration and peak memory, if practical
4. Save a temporary canonical logical-data hash that ignores JSON whitespace and top-level file boundaries. Use it only for migration comparison; do not add a nondeterministic field to generated output.

## Phase 1: Define Types and Split Invariants

Keep the existing public record shapes (`SiteVideo`, `SiteSegment`, `SiteTopic`) as the logical schema. Add explicit types for:

- `SiteArchiveManifest`
- `SiteArchiveFileRecord`
- `SiteArchiveSegmentBucketRecord`
- the split dataset returned by the generator

Add pure functions alongside `buildSiteArchiveData()` in `src/site/archive-data.ts`, or a focused adjacent module under `src/site/`, for:

- stable bucket assignment from `videoId`
- splitting one logical `SiteArchiveData`
- producing canonical serialized bytes
- generating per-file SHA-256 values
- validating the manifest and shard set
- reconstructing the logical dataset for equivalence tests

Required invariants:

- manifest counts equal source collection counts
- the sum of segment-bucket counts equals the segment count
- all 64 declared bucket IDs and files exist exactly once
- every segment is in the bucket computed from its `videoId`
- every video, segment ID, segment slug, topic slug, and video route slug remains unique under the current rules
- every record appears exactly once across the split dataset
- collection and within-bucket ordering are deterministic
- every declared hash matches the written bytes
- reconstructing the split data produces the same canonical logical data as the legacy archive

Retain the existing validation in `buildSiteArchiveData()` for source identities, topic references, route uniqueness, timestamps, and segment kinds. Do not weaken it merely because the output is split.

## Phase 2: Make Multi-File Generation Transaction-Safe

Update `generateSiteArchiveData()` and `src/scripts/generate-site-data.ts` so the default destination is the directory `site/src/data/generated/archive/`. Prefer a new `--output-dir` option. If `--output` is retained temporarily, define it explicitly as the legacy compatibility output instead of giving the flag two meanings.

The current single output uses `writeTextAtomically()`. A multi-file writer needs equivalent failure semantics:

1. Build and validate the entire logical dataset in memory.
2. Serialize every output once and compute its hash.
3. Write shard files atomically to stable paths.
4. Verify every just-written file against the pending manifest.
5. Publish `index.json` last as the commit marker.
6. Remove obsolete generated files only after the new manifest is valid.
7. On failure, clean temporary files, leave a detectable hash mismatch or the previous manifest, and fail generation. Never report success for a partial dataset.

Do not recursively delete the live generated directory before writing. Windows file locks have already produced `EPERM` failures in this repository; the writer should preserve existing repair guidance and make a locked file an explicit generation failure.

During migration, optionally dual-write the legacy `archive.json` from the same in-memory object. Use it only as a short-lived equivalence and rollback surface. Do not create a second transformation path.

## Phase 3: Update the Astro Data Adapter

Refactor `site/src/data/archive.ts` without changing its public helper behavior in the first pass.

Recommended structure:

```text
site/src/data/
  archive-types.ts
  archive.ts
  generated/archive/
    index.json
    videos.json
    topics.json
    segments/*.json
```

The adapter should:

1. Import `index.json`, `videos.json`, and `topics.json` at build time.
2. Load segment buckets with a sorted eager `import.meta.glob("./generated/archive/segments/*.json")` or another compile-time mechanism supported by Astro/Vite.
3. Verify that loaded paths and counts match the manifest before exporting data.
4. Reconstruct `archiveVideos`, `archiveSegments`, and `archiveTopics` so existing pages can migrate with minimal churn.
5. Build maps once rather than repeatedly scanning the complete collections:
   - video by ID
   - video by slug
   - segment by slug
   - segments by video ID
   - segments by topic slug
   - videos by topic slug
6. Keep deterministic output ordering when returning arrays from those indexes.

The map work is important at current scale. The topic routes currently call helpers that scan the full 24,695-segment collection for each of 12,878 topics. Preserve rendered order, but eliminate repeated full-corpus scans while touching this seam.

All current static page consumers must remain covered:

- `site/src/pages/index.astro`
- `site/src/pages/videos/index.astro`
- `site/src/pages/videos/[slug].astro`
- `site/src/pages/segments/index.astro`
- `site/src/pages/segments/[slug].astro`
- `site/src/pages/topics/index.astro`
- `site/src/pages/topics/[slug].astro`
- `site/src/pages/search/index.astro`

Do not add browser `fetch()` calls for ordinary video, segment, or topic pages. They are static pages, and moving their data loading to the browser would weaken crawlability and Pagefind indexing.

## Phase 4: Move Browser Full-Text Search to Pagefind

Treat this as a distinct but required performance phase. The generated-data split alone does not address the 38 MB search HTML page.

Update `site/src/pages/search/index.astro` and `site/public/scripts/site-search.js` so the browser queries the generated Pagefind index under the configured Astro base path.

Requirements:

- remove the `searchItems` full-corpus mapping and the inline `<script id="site-search-data">`
- load Pagefind only after the user interacts with search, or at least defer it until after the initial page renders
- build Pagefind URLs from `import.meta.env.BASE_URL`; no root-relative `/pagefind/...` assumptions
- preserve search coverage for titles, summaries, bodies, Q&A fields, video IDs, timestamps, kinds, topic names, and topic aliases through rendered content and `data-pagefind-*` metadata
- preserve the current query-string behavior (`?q=`), clear control, status updates, keyboard submission, accessible result announcements, and learner-oriented result cards
- display an explicit recoverable error if the Pagefind runtime or index cannot load
- define local-development behavior because `astro dev` does not run the post-build Pagefind stage; production search validation must use `site:build` plus `site:preview` or a static server

Do not edit anything inside `site/dist/pagefind/` by hand and do not create a second custom full-text index. Pagefind remains generated output owned by `pagefind --site site/dist`.

If Pagefind cannot reproduce a required structured browse feature, keep that feature as a small purpose-built manifest or filter dataset. Do not restore the full segment body corpus to the search HTML.

## Phase 5: Update Build Caching and Output Validation

Adapt `.codex/hooks/site-build-if-changed.mjs`:

- replace the single `archive.json` sentinel with `site/src/data/generated/archive/index.json`
- validate every manifest-listed file and hash before allowing archive generation to be skipped
- bump `archiveCacheVersion`
- bump `siteCacheVersion` when the generated input contract changes
- keep `site/src` in the site fingerprint so any changed shard invalidates Astro/Pagefind output
- keep `site/dist/index.html` and `site/dist/pagefind/pagefind-entry.json` as site output sentinels unless measurement identifies a stronger existing Pagefind sentinel

The hook must not treat the existence of `index.json` alone as proof that the dataset is complete.

## Phase 6: Tests

Extend `src/site/archive-data.test.ts` and add focused tests where separation improves clarity.

Generator tests:

- produces the same logical dataset as `buildSiteArchiveData()`
- assigns a video's segments to one deterministic bucket
- emits all 64 bucket records in lexical order
- preserves stable filenames when records are appended
- computes correct counts and hashes
- rejects a missing, extra, corrupt, or misbucketed shard
- rejects manifest schema-version mismatch
- remains byte-for-byte deterministic for identical inputs
- preserves existing duplicate ID, duplicate slug, missing topic, timestamp, and route-uniqueness failures

Astro/build checks:

- every manifest file can be loaded by the adapter
- route counts match the quiet baseline
- representative video, segment, and topic pages retain their URLs and rendered content
- the search page no longer embeds the full corpus
- Pagefind returns representative ship, battle, class, navy, weapon, doctrine, person, date, and abbreviation queries
- GitHub Pages base-path URLs work in generated HTML and browser requests

Add a migration-only comparison that reconstructs the shards and deep-compares them with the legacy `archive.json`. Remove that compatibility test when the legacy file and writer are removed; retain the permanent shard-integrity tests.

## Phase 7: Documentation and Repository Contracts

Once implementation is proven, update every authoritative reference to the generated archive contract in the same scoped change:

- `AGENTS.md`
- `README.md`
- `.agents/site-archive-builder.md`
- `.agents/skills/naval-video-page-prototype/SKILL.md`
- build-repair and content-auditor briefs that name the generated output
- any durable task-note checklist that is intended to describe the current workflow rather than historical state

Historical task notes should generally remain historical. Do not rewrite old completed plans merely to replace a path string.

The new guidance must still say:

- `src/derived/video-segments/` is source of truth
- generated archive files are never hand-edited
- `npm run generate:site-data`, `npm run site:check`, and `npm run site:build` own regeneration
- shard-only transcript/content workers must not write generated archive output
- the generated archive directory remains tracked unless a separate explicit repository policy change is approved

## Phase 8: Cutover and Cleanup

Cut over in this order:

1. Land pure split/validation logic and tests.
2. Add multi-file generation while retaining the legacy file temporarily.
3. Prove canonical logical equivalence.
4. Migrate `site/src/data/archive.ts` and all Astro consumers.
5. Migrate browser search to Pagefind and remove the inline corpus.
6. Update cache sentinels and versions.
7. Force a clean production build and compare routes, rendered content, Pagefind behavior, size, time, and memory.
8. Remove the legacy generator path and `site/src/data/generated/archive.json`.
9. Update documentation and commit the manifest/shard dataset with its source changes.

Do not leave both archive formats as permanent tracked outputs. That would increase repository size without providing an active compatibility benefit.

## Validation Commands

Use the repository's Windows-safe npm path if the roaming shim fails:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run site:check
& 'C:\Program Files\nodejs\npm.cmd' run site:build -- --force
git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check
git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex status --short --branch
```

For production behavior, serve `site/dist/` or use `npm run site:preview` after Pagefind has been generated. Verify at the configured base path:

```text
/naval-history-with-dr-alex/
/naval-history-with-dr-alex/videos/
/naval-history-with-dr-alex/segments/
/naval-history-with-dr-alex/topics/
/naval-history-with-dr-alex/search/?q=Jutland
```

If source-data validation passes but the build fails with `EPERM` or `TS5033` on `dist` or a generated temporary file while the repository lock is absent, treat it as an external file-lock/concurrent-writer problem. Do not rewrite valid source data to chase that failure.

## Performance Measurements

Compare quiet before-and-after builds using the same source revision and forced-build path:

- total generated archive bytes
- largest generated archive file
- number of generated archive files
- generator duration and peak memory
- Astro duration and peak memory
- Pagefind duration and output size
- `site/dist/search/index.html` raw and gzip size
- initial search-page transfer before the first query
- transfer after the first query
- time until the search input is usable
- time until first Pagefind results render

Expected result: the largest tracked generated JSON file falls from roughly 63 MB to a bounded shard size, and the initial search page no longer transfers or parses the complete 24,695-segment search corpus. Do not claim lower total archive bytes or lower aggregate Astro memory unless measurements demonstrate it.

## Rollback Plan

Before deleting the legacy output:

1. Keep the legacy writer driven by the same logical `SiteArchiveData` object.
2. If the new adapter fails, restore `site/src/data/archive.ts` to import `generated/archive.json`.
3. If Pagefind search fails independently, restore only the prior search page/script while keeping the split build dataset.
4. Restore the old cache sentinel/version combination only with the corresponding legacy generator.

After the legacy file is removed, rollback through Git as one coherent change. Do not hand-merge old and new generated files or keep a partially published manifest.

## Acceptance Criteria

The migration is complete when:

- `site/src/data/generated/archive.json` is no longer generated, imported, or required
- `site/src/data/generated/archive/index.json` and every declared file are generated deterministically and tracked
- all 1,509 videos, 24,695 segments, and 12,878 topics from the implementation baseline are present exactly once, adjusted only for intentional source changes made after this snapshot
- split reconstruction is canonically equivalent to the legacy logical archive during cutover
- all current video, segment, and topic routes still build with unchanged slugs
- relationship helpers return the same ordered records without repeated full-corpus scans per topic page
- the build cache validates the complete manifest-listed output set
- the search page does not embed the complete archive-derived search corpus
- browser full-text search uses generated Pagefind output under the GitHub Pages base path
- representative search queries and filters work after a production build
- Pagefind generation remains untouched and deterministic
- `npm run check`, `npm run site:check`, forced `npm run site:build`, and `git diff --check` pass, apart from a separately identified external file-lock blocker
- before-and-after measurements are recorded without overstating benefits that were not observed

## Non-Goals

This migration must not:

- change `src/derived/video-segments/` ownership or naming
- recompute transcript `fileStem` values
- modify transcript shards, shared topics, schedules, logs, or reports as part of data-format work
- introduce episode numbers that the source data does not contain
- move static page content behind browser-only fetches
- replace static Astro output with a server runtime
- hand-edit or manually shard Pagefind output
- create another full-text search engine alongside Pagefind
- use Git LFS for generated JSON
- untrack the generated Astro dataset without a separate explicit policy decision
- promise repository-size reduction merely from splitting one tracked file into several tracked files
