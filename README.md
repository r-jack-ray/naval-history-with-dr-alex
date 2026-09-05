# Naval History With Dr. Alex

[Main site](https://r-jack-ray.github.io/naval-history-with-dr-alex/)

Static reference archive and learner-facing study guide for [Naval History with Dr Alex](https://www.youtube.com/@DrAlexClarke).

The archive uses a segment-first model. The core curated unit is a video segment: a chapter, notable point, actual Q&A exchange, or optional transcript excerpt.

## Current Status

The repository currently has:

- A Node 22+ and strict TypeScript toolchain.
- Node's built-in test runner.
- An Astro static site configured for GitHub Pages.
- Pagefind indexing during site builds.
- A deployed learner-facing study-guide site with Light, Dark, Bruships, and System theme switching.
- A generated Astro archive dataset built from channel inventory, YouTube metadata, the transcript manifest, curated per-video segment shards, and topic-normalization policy.
- Static video, segment, and topic pages built from the manifest and stable JSON shards under `site/src/data/generated/archive/`.
- Deferred Pagefind-backed search across video guides, time notes, and topics, without an inline archive corpus.
- A subject-focused Time Notes finder with explanation/Q&A filters and a paginated browse-all fallback.
- A transcript-to-site-content process with shard-local curation and audit workflows, backlog reporting, and validation hooks.
- A rate-limited YouTube channel link inventory script.
- A source master episode list under `src/channel/`, with an explicit completeness flag and inventory notes.
- A local transcript store under `src/transcripts/`.
- Planning notes under `task-notes/`.

The generated archive now spans thousands of video guides and tens of thousands of curated segments. Transcript-backed curation and follow-up quality passes are still in progress. The checked-in channel master currently reports `inventory.completeness` as `unknown`, so it must not be treated as the complete channel backlog.

## Project Layout

```text
src/
  channel/                 Canonical channel inventory
    episodes.json          Master episode list
    ignored-videos.json    Full-video exclusions applied before ingestion
    video-metadata.json    YouTube Data API metadata store
  content/                 Site-content audits, reports, models, and processing logic
    schemas/               Runtime schemas for content-owned persisted formats
  derived/                 Curated site-content sources and curation bookkeeping
    site-content-processing.config.json
    site-content-processing.log
    topic-normalization-patterns.tsv  Manually curated topic normalization policy
    video-segments/        Source-of-truth curated study-guide content
      topics.json          Shared topic records and aliases
      <manifest.fileStem>.json One curated segment shard per video; reuse the stored transcript manifest stem
  pipeline/                Atomic writes and transcript-schedule validation
  scripts/                 JavaScript/TypeScript CLIs, build helpers, and validation coordinators
  site/                    Archive generation, search, SEO, and site validation logic
  youtube/                 YouTube inventory, metadata, and transcript-ingestion logic
  transcripts/             Local transcript archive
    manifest.json          Index of stored transcript files
    txt/                   Stored timestamped transcript text; source of record
site/
  src/                     Astro pages, layouts, styles, client scripts, and data adapters
    data/generated/archive/ Ignored deterministic archive dataset
      index.json           Authoritative generated-file manifest
      videos.json          Generated video-guide records
      topics.json          Generated topic records
      segments/            Hash-bucketed generated segment records
  public/                  Static assets copied into the site
  dist/                    Generated GitHub Pages artifact, ignored by Git
.agents/                   Project-local agent briefs and Codex skills
.agents/skills/            Project-local Codex skills
task-notes/                Temporary planning and handoff notes
reports/                   Generated reports and smoke-test output, ignored by Git
dist/                      Compiled JavaScript, ignored by Git
```

Content-owned persisted contracts live under `src/content/schemas/`. This includes the curated video shards, `topics.json`, the site-content processing config, and processing-log rows. Their source files do not carry custom schema-version fields. Audit, scoring, report-generation, and log-parsing behavior remains in the surrounding `src/content/` modules, while derived in-memory archive types live in `src/content/curated-archive-model.ts`. There is no committed `docs/` tree at the moment; the public site is generated through Astro routes and the split dataset under `site/src/data/generated/archive/`.

## Setup

Install dependencies:

```powershell
npm install
```

The normal network-free repository check type-checks once, then
runs functional tests, source/topic validation, and generated-data/Astro validation:

```powershell
npm run check
```

The normal site path regenerates shared archive data when needed, checks the Astro project, and performs the cached Astro/Pagefind build:

```powershell
npm run site:check
npm run site:build
```

On this Windows machine, use `C:\Program Files\nodejs\npm.cmd` for interactive commands if plain `npm` resolves the broken roaming shim.

## npm Script Reference

`package.json` is authoritative. Pass script-specific arguments after `--`; most TypeScript CLI scripts also support `--help`.

### Build and Test

| Script | Purpose |
| --- | --- |
| `clean` | Remove compiled `dist/` output. |
| `build` | Compile the TypeScript tools into `dist/`. |
| `check:types` | Type-check without emitting files. |
| `test` | Type-check without emitting root `dist/`, then run canonical `src/**/*.test.ts` files through Node and `tsx`. |
| `check:source` | Run the gating read-only topic-normalization, topic-store, and site-content checks. |
| `check` | Run the canonical network-free source-test, source-validation, and generated-data layers; `test` performs the TypeScript type check once. |
| `check:production` | Traverse rendered HTML once for the source-owned SEO and date validators, then run search-ranking checks against the existing Astro/Pagefind build; this command does not generate or build the site. |
| `check:ci` | Run tests, one cache-aware official production build, and the post-build checks as the one-pass Pages graph. |

### Curated Content and Reports

| Script | Purpose |
| --- | --- |
| `report:video-segment-audit-risk` | Rank deterministic shard repairs and metadata-indicated substantive audit candidates, then write `reports/video-segment-audit-risk.tsv`. |
| `audit:site-content` | Validate current-schema shards and transcript evidence, then write the backlog report. |
| `check:site-content-wording` | Scan public shard fields for mechanical, report-shaped, and workflow-shaped wording; its actionable strict scan runs in `check:source`, with full-corpus, repeated `--path`, and repeated `--rule` triage controls. |
| `diagnose:site-content-duplicates` | Check curated shards for duplicate segment IDs and slugs. |
| `sync:video-topics` | Add missing shared topic records derived from shard usage and normalization policy with parallel Bun workers. |
| `check:video-topics` | Verify registry completeness without writing source and name the explicit synchronization command when records are missing. |
| `audit:topic-normalization` | Read-only validation of topic-normalization policy against curated shards with parallel Bun workers. |
| `audit:transcript-schedules` | Audit one or more explicitly supplied transcript schedules; at least one `--schedule <path>` is required. |
| `audit:video-timestamp-alignment` | Check timestamp and video-state consistency across source, transcript, shard, and generated data. |
| `report:video-topic-usage` | Write topic usage to `reports/video-topic-usage.tsv` and exact actionable normalization findings to `reports/topic-normalization-review.tsv`. |
| `report:transcript-problems` | Build the human-readable transcript failure report from saved status without contacting YouTube. |

### Channel Inventory and Transcripts

| Script | Purpose |
| --- | --- |
| `fetch:video-links` | Fetch the channel uploads inventory through the YouTube Data API, using `.local/youtube-api-key.txt` by default. |
| `fetch:video-metadata` | Populate or resume the official per-video metadata store. |
| `alternate:extract:saved-channel-html` | Parse a saved `/videos` or `/streams` channel page offline; select the tab with `--tab videos` or `--tab streams`. |
| `alternate:merge:video-links` | Merge saved channel-tab link files into an episode inventory. |
| `alternate:fetch:transcripts` | Batch-fetch missing transcripts with resumable status; use it for bounded/manual runs. |
| `alternate:fetch:transcripts:safe` | Run the supported weekly batch with a 60-second delay while preserving valid-TXT and saved-failure skips. |

### Generated Site and Search

| Script | Purpose |
| --- | --- |
| `generate:site-data` | Validate registry completeness and regenerate the ignored split archive. It never writes `src/derived/video-segments/topics.json`. |
| `site:dev` | Validate/generate the archive, then start Astro without changing canonical source. |
| `site:preview` | Preview an existing `site/dist/` build. |
| `site:check` | Regenerate archive data, then run the Astro check. |
| `site:check:generated` | Run the Astro check against existing generated data without regeneration. |
| `site:build` | Source-validated, cached end-to-end generation, Astro build, output validation, and official Pagefind indexing. |
| `site:build:generated` | Cached Astro/Pagefind build using an already valid generated archive. |
| `site:build:astro` | Run the raw Astro production build only. |
| `site:build:pagefind` | Run Pagefind against `site/dist/` only. |
| `site:build:pagefind:workspace` | Run the explicitly supported sibling Pagefind binary, with a clear prerequisite error when it is unavailable. |
| `site:build:workspace-pagefind` | Source-validated, cached end-to-end build using the sibling Pagefind binary. |
| `check:workspace-pagefind` | Build with the sibling binary and run the same search/page-count and rendered-date contracts used for official output. |
| `check:pagefind-contract` | Verify Pagefind manifest/fragment counts and the five representative Phase 0 searches for either implementation. |
| `check:search-ranking` | Exercise the built Pagefind index and rendered search UI against ranking cases. |
| `check:rendered-video-dates` | Validate dates and video state in the built HTML and Pagefind output. |
| `check:rendered-site` | Run SEO and rendered-date validation from one shared rendered-HTML snapshot. |

### SEO and Lighthouse

| Script | Purpose |
| --- | --- |
| `check:site-seo` | Run the focused canonical TypeScript validator from `src/` against SEO metadata, sitemaps, and rendered `site/dist/` pages. |
| `audit:lighthouse` | Run one parameterized Lighthouse audit; defaults to the representative five-route production baseline and creates its report directory. |

Use `--mode home` for a quick single-page audit, `--base-url` for a local or caller-supplied site root, and `--output-prefix` to choose the report location. The runner still accepts `SEO_AUDIT_BASE_URL`, with an explicit flag taking precedence:

```powershell
npm run audit:lighthouse
npm run audit:lighthouse -- --mode home --output-prefix reports/lighthouse/home
npm run audit:lighthouse -- --mode home --base-url http://127.0.0.1:4321/naval-history-with-dr-alex/ --output-prefix reports/lighthouse/local-home
```

## Website

The public site is deployed from GitHub Actions to [r-jack-ray.github.io/naval-history-with-dr-alex](https://r-jack-ray.github.io/naval-history-with-dr-alex/).

Local site commands:

```powershell
npm run generate:site-data
npm run site:dev
npm run site:check
npm run site:build
npm run site:preview
```

`npm run site:dev` and `npm run site:check` both generate the ignored `site/src/data/generated/archive/` dataset before Astro starts, so a fresh clone does not require a remembered manual generation step. `npm run site:build` and `npm run site:build:workspace-pagefind` both run `check:source` before consulting their caches, so topic, registry, content, and processing-log failures cannot be hidden by unchanged generated output. They then share the same archive generation, integrity validation, Astro, and cache logic; the workspace variant changes only the Pagefind implementation and its fingerprint input. The wrapper regenerates or rebuilds only when inputs or outputs changed; pass `-- --force` to bypass its caches, not the source gate. Both paths are read-only with respect to canonical inputs. If a shard references a missing registry record, run `npm run sync:video-topics`, review the source change, and retry. A performed build emits `site/dist/` and runs Pagefind against that output. Run `site:preview` after a build when you want to inspect that production output locally.

The four promoted Bun-backed maintenance commands (`report:video-topic-usage`, `sync:video-topics`, `audit:topic-normalization`, and `generate:site-data`) plus the read-only `check:video-topics` command use `--workers <count>` with a default of the smaller of eight or the available CPUs. Bun `1.3.14` is pinned in `.bun-version`; each command preserves its output path and ownership contract and reports `runtime=bun` in its summary.

Site generation, Astro/Pagefind build, preview, check, and rendered-SEO validation commands load the shared `site-build.properties` file. It uses commentable `KEY=value` settings in the style of an application properties file. `ASTRO_BUILD_CONCURRENCY` controls parallel Astro page rendering and accepts `1` through `8`; `SITE_SEO_VALIDATION_CONCURRENCY` controls rendered-HTML validation workers and accepts `1` through `32`. A value already present in the calling environment takes precedence. Pagefind 1.5.2 exposes no build-concurrency setting.

The authoritative generated `index.json` runtime manifest lists the collection files and segment buckets. Full Astro/Pagefind builds traverse more than 50,000 HTML pages, can take several minutes, and may be quiet while Astro runs; allow at least 15 minutes before treating an agent-run build as timed out. Do not hand-edit or commit the generated archive dataset, and do not commit generated `site/dist/` files.

The generated site exposes:

- `/videos/`, `/videos/browse/`, `/videos/browse/<page>/`, and `/videos/<slug>/`: the video-guide directory, complete paginated browse view, and individual guides with curated time-note links.
- `/segments/`: a Pagefind-backed subject finder for explanations and transcript-visible Q&A.
- `/segments/browse/` and `/segments/browse/<page>/`: the complete paginated time-note directory.
- `/segments/<slug>/`: independently addressable chapters, notable points, Q&A, and transcript excerpts with direct video-time links.
- `/topics/`, `/topics/browse/`, `/topics/browse/<page>/`, `/topics/browse/all/`, and `/topics/<slug>/`: the topic directory, browse views, and subject pages listing related videos and time notes.
- `/search/`: deferred full-text search across video guides, time notes, and topics through the generated Pagefind index.

## Fetch Channel Video Links

The main inventory task uses a narrow typed client for the official YouTube Data API on Node's built-in `fetch`. It defaults to reading the API key from `.local/youtube-api-key.txt`; alternatively pass `--api-key` or `--api-key-file` after `--`. Direct CLI use can also read `YOUTUBE_API_KEY`. Official API calls default to a one-second delay between requests and use bounded retries for transient failures.

YouTube Data API quota is tracked by Google project and resets at midnight Pacific Time. The default allocation is 10,000 units per day combined for most endpoints, with `playlistItems.list` and `videos.list` costing 1 unit per call. `search.list` has a separate default limit of 100 calls per day, while `captions.list` costs 50 units from the general allocation. Check the official [YouTube Data API quota cost table](https://developers.google.com/youtube/v3/determine_quota_cost) before changing fetch strategy.

A bare run fetches the full channel inventory and updates the source master episode list:

```powershell
npm run fetch:video-links
```

Pass `--master-output` only to select a different master path. Limited `--max-pages` probes and explicit
`--output`, `--links-output`, or `--metadata-output` modes do not overwrite the canonical master implicitly.

The current master can be partial. Check `inventory.completeness` before using it as the full backlog.

Optional separate base-list and metadata report files:

```powershell
npm run fetch:video-links -- --links-output reports/dr-alex-video-list.json --metadata-output reports/dr-alex-video-metadata.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
```

Small smoke test:

```powershell
npm run fetch:video-links -- --max-pages 1 --request-delay-ms 5000 --output reports/dr-alex-video-links-probe.json
```

Exact per-video metadata can be included in 50-ID official API batches:

```powershell
npm run fetch:video-links -- --include-video-details --detail-limit 10 --metadata-output reports/dr-alex-video-metadata-probe.json
```

The official API path crawls the channel uploads playlist. Use saved HTML extraction for channel tabs when a browser-rendered `/videos` or `/streams` page has already been captured.

## Fetch Video Metadata

Populate or resume the source metadata store from `src/channel/episodes.json` using official `videos.list` batches:

```powershell
npm run fetch:video-metadata
```

Useful bounded probe:

```powershell
npm run fetch:video-metadata -- --limit 50 --request-delay-ms 1000
```

The output is `src/channel/video-metadata.json`. Existing records are skipped unless `--force` is passed.

## Alternate Saved-HTML Inventory

If a channel tab page is saved from a browser, parse its rendered lockup markup offline without making YouTube requests:

```powershell
npm run alternate:extract:saved-channel-html -- --tab videos --output reports/dr-alex-videos-html-extraction.json --links-output reports/dr-alex-videos-html-links.json --base-output reports/dr-alex-video-list-from-html.json --metadata-output reports/dr-alex-video-metadata-from-html.json --master-output src/channel/episodes.json --inventory-completeness partial
```

Use the generic command for other saved channel tabs:

```powershell
npm run alternate:extract:saved-channel-html -- --tab streams --output reports/dr-alex-streams-html-extraction.json --links-output reports/dr-alex-streams-html-links.json
```

The report includes parse stats, continuation-token detection, and the standard channel-link result. Saved `/videos` pages can contain many rendered rows; saved `/streams` pages may contain only the visible page of stream items.

Merge saved tab outputs into the source master:

```powershell
npm run alternate:merge:video-links -- --input reports/dr-alex-videos-html-links.json --input reports/dr-alex-streams-html-links.json --master-output src/channel/episodes.json --inventory-completeness partial
```

## Store Video Transcripts Locally

The transcript batch puller uses `youtube-transcript-plus` first, falls back to direct
watch-page caption tracks, and defaults to a 5-second delay between YouTube
requests. The official YouTube Data API does not provide public transcript
download by API key. Batch pulls skip official durations at or below 61 seconds,
including one second of YouTube duration padding around nominal 60-second clips.
The cutoff still applies with `--force`. For a bounded manual pull, use the base
batch runner. It skips transcripts already in `src/transcripts/manifest.json`,
uses `src/channel/video-metadata.json` for timestamped naming, writes canonical
TXT and manifest records, and checkpoints failures/progress to
`src/transcripts/fetch-status.json`:

```powershell
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
```

The supported weekly acquisition-to-curation sequence is:

1. Run `npm run fetch:video-links` to reconcile the official channel inventory
   and metadata. Keep `npm run fetch:video-metadata` as the independently
   rerunnable metadata repair path; official inventory/metadata and caption
   scraping remain separate failure domains.
2. Run `npm run alternate:fetch:transcripts:safe`. It waits 60 seconds between
   YouTube requests, skips valid stored TXT, and preserves records already saved
   as failures. It never force-refetches a valid stored TXT. Use the lower-level
   batch command with `--retry-failed` only for a deliberate recovery run.
3. For each path under `New transcript TXT paths` in the final handoff, start
   one separate single-agent task using
   `<exact TXT path> process with $naval-transcript-to-site-content`.
4. For each resulting exact shard, run at least two independent, sequential
   single-agent tasks using
   `<exact shard path> process with $naval-site-content-auditor`.

Every batch prints one deterministic handoff with newly stored TXT paths,
deferred records, failures from that run, and ready records still pending. A
rate-limit or blocking failure opens the circuit breaker for the remainder of
the run, so later eligible records are listed as pending instead of generating
more YouTube requests. Progress and failures remain checkpointed after each
attempt for diagnosis or an explicitly requested recovery run. Newly stored TXT paths also remain in
the schema-2 checkpoint until the handoff is successfully written to standard
output. If the command is interrupted before that acknowledgement, the next run
re-emits those paths instead of silently treating their curation work as done.

TXT is the stored transcript source of record. Stored transcript files use `timestamp_title-slug_videoId.txt` when exact timing is known, otherwise `title-slug_videoId.txt`.

When transcript naming metadata is incomplete, repair the canonical episode or
video-metadata source before retrying. The public transcript workflow no longer
maintains a separate one-video command with ad hoc naming or output overrides.

See `src/transcripts/README.md` for the storage layout.

## Content Model

Use `segment` as the primary searchable object. Supported segment kinds are:

- `chapter`
- `notable_point`
- `qa`
- `transcript_excerpt`

Every curated segment should point back to a video ID, timestamp, canonical YouTube URL, source transcript file, and transcript evidence window.

Q&A stays as `kind: qa` inside the segment model rather than a separate question collection. Use it only for actual transcript-visible question and answer exchanges.

## Process Transcripts Into Site Content

Transcript curation has one selected semantic-edit shard plus one deterministic shared-registry finalization. Each run must be given exactly one stored TXT transcript and must edit only its manifest-owned `src/derived/video-segments/<manifest.fileStem>.json` file. The transcript basename, `manifest.fileStem`, and shard basename must match; do not derive a new shard name from current title metadata.

The curation run reads the full selected transcript, keeps lecture material as chapters or notable points, and creates `kind: qa` records only for substantive transcript-visible prompts and answers. It reads `src/derived/topic-normalization-patterns.tsv`, resolves new slugs through active creation rules, and preserves established slugs unless the active creation policy canonicalizes them. It applies and validates the canonical shard write, runs `npm run check:site-content-wording -- --path <canonical shard path> --strict --review`, then runs `npm run sync:video-topics`, and appends the one required result line to `src/derived/site-content-processing.log` only after synchronization succeeds. The scoped wording check fails on parse errors and high-confidence findings; review candidates require transcript-grounded judgment but do not need to reach zero. A wording-check or synchronization failure prevents the completion row but does not invalidate the completed shard write. The run edits no other shard, never manually edits the normalization catalog or `topics.json`, performs no corpus-wide topic rewrite, and writes no schedules, reports, generated archives, package/tooling files, or site sources. It also does not run repository-wide audits, generation, tests, or builds.

For agent-driven curation, use `.agents/transcript-content-curator.md` with `.agents/skills/naval-transcript-to-site-content/SKILL.md`. For a follow-up substance and wording pass on one explicitly selected shard, use `.agents/site-content-auditor.md` with `.agents/skills/naval-site-content-auditor/SKILL.md`.

After curator and auditor tasks have synchronized their shared topic records, the repository owner can run the remaining integration checks:

```powershell
npm run audit:topic-normalization
npm run check:video-topics
npm run audit:site-content
npm run check:site-content-wording -- --strict --summary-only
npm run site:check
npm run site:build
```

`npm run audit:site-content` validates curated transcript evidence and writes `reports/site-content-backlog.md`, including manifest transcripts that still have no canonical shard. A valid empty shard counts as canonical presence. `npm run check:site-content-wording` scans every canonical shard by default, and its actionable `--strict --summary-only` form is part of `check:source`. Add `--path src/derived/video-segments/<manifest.fileStem>.json --strict --review` for the curator and auditor completion gate, `--review` for judgment-required candidates, `--fuzzy` for typo-tolerant variants, repeated `--rule <rule-id>` filters for a focused rule family, and `--report` for ignored JSON and Markdown triage reports. Reports include aggregate counts by rule, public field, and segment kind before the detailed findings. Review candidates are transcript-grounded judgment calls, and their count is not a completion target. Reports are ignored by Git. Shared generation, reports, schedules, and logs other than the shard worker's one required `src/derived/site-content-processing.log` append are coordinator-owned outputs.

The existing processing log has this exact semicolon-separated header:

```text
timestamp;shardPath;result;notes
```

Each curator or auditor result is one newline-terminated four-field row appended at the physical bottom. `shardPath` is the selected manifest-owned JSON shard. `result` and `notes` describe what the pass accomplished and identify any unresolved transcript ranges, Q&A, audiovisual work, or other limitation. The curator appends only after its shard write and synchronization succeed; the auditor does the same after every completed selected-file audit, including unchanged, saturated, and intentionally empty results. A synchronization failure is reported without a completion row.

Write new timestamps as exactly 19-character local `yyyy-MM-ddTHH:mm:ss` values. Do not write fractional seconds, a trailing `Z`, or a numeric UTC offset. The reader still accepts older ISO timestamps with `Z` or a numeric UTC offset for compatibility, but those legacy forms are not templates for new writes or repairs and do not need manual removal merely for parsing. The required final newline is also not a data row.

Curator and auditor runs append rather than rewriting earlier rows. Repository-level video removal is the exception: when a video is removed from the episode inventory, transcript manifest, and shard set, remove every processing-log row for that video's former canonical shard path in the same cleanup. Otherwise those historical rows correctly appear as `unmapped_log_rows` because their shard can no longer map through the current manifest.

### Topic Normalization Policy

`src/derived/topic-normalization-patterns.tsv` is the detailed source of truth for steady-state topic creation, display names, aliases, and exceptions. `src/derived/video-segments/topics.json` remains authoritative for curated topic metadata unrelated to that policy. Routine synchronization validates policy compliance and may append missing blank-description registry records. Generation uses the same planning path only as a read-only completeness check; neither command rewrites source shards merely because the catalog changed.

Resolve every new shard topic through active creation rules before writing it. Preserve established slugs unless the active creation policy canonicalizes them, and leave `review`, disabled, ambiguous, or inapplicable candidates unchanged. Use the read-only audit to check policy and registry consistency before shared synchronization or integration work:

```powershell
npm run audit:topic-normalization
```

For an explicitly scoped taxonomy-maintenance pass, a typical owner authorization is:

```text
Curate the topics. In that cleanup/curation, make sure to clean up and specify any
"type-<number>" to what it is related to.
```

That authorization starts this supported topic-curation workflow:

1. Run `npm run report:video-topic-usage`, the report-only discovery command that always emits both companion inputs:

   ```powershell
   npm run report:video-topic-usage
   ```

   Use `reports/video-topic-usage.tsv` for corpus-wide usage, subject/entity classification, aliases, normalization inputs, similarity, and co-topic context. Use `reports/topic-normalization-review.tsv` as the exact work queue for normalization review rules and title/alias collisions; it identifies affected slugs, candidate replacements, every current shard or registry source, and the recommended action. Neither file is canonical source. These review details are intentionally kept out of routine site-build output.
2. Review every listed source before choosing an old-to-canonical slug mapping. Similar strings do not prove identical referents; use transcript context first and authoritative nomenclature sources when a standard name needs confirmation.
3. Update authored source coherently: active policy in `src/derived/topic-normalization-patterns.tsv`, each reviewed video-level or segment-level topic reference in `src/derived/video-segments/*.json`, and the corresponding tracked record in `src/derived/video-segments/topics.json`. Preserve manual descriptions and aliases, and do not rewrite unrelated segment prose.
4. Run `npm run sync:video-topics` to append only genuinely missing canonical registry records. It is not a corpus-rewrite or obsolete-record-removal command. Regenerate both companion reports and inspect the resulting rows.
5. Run the read-only `npm run audit:topic-normalization`. Resolve only findings inside the authorized mapping; record unrelated findings for a separate task.
6. After authored topic changes are approved, hand them to the repository-owner integration flow beginning with `npm run generate:site-data`. The generated archive is noncanonical output and must never be hand-edited.

Type-designated ship topics use `type-<designation>-<singular-vessel-kind>` when the reviewed evidence identifies the referent, such as `type-26-frigate` or `type-212-submarine`. Apply the same referent-bearing rule to non-ship subjects such as missiles, radar, weapons, and uncrewed systems. Bare, generic `-class`, plural, Roman-numeral, alphanumeric, and distinct-variant inputs require reviewed mappings; do not infer a Type 212A record or merge Type 212, Type 212A, and Type 212CD from string similarity.

### Report Ownership and Lifecycle

Everything under `reports/` is ignored local output, never canonical source or public site data. Supported report paths retain these owners and lifecycles:

| Report/output | Generator | Owner and use | Lifecycle |
| --- | --- | --- | --- |
| `reports/video-segment-audit-risk.tsv` | `report:video-segment-audit-risk` | Repository owner prioritizes deterministic repairs and current metadata-indicated substantive audit candidates. | Mandatory keep; ignored, on-demand, and replaced by each run. |
| `reports/video-topic-usage.tsv` | `report:video-topic-usage` | Repository owner and Codex inspect usage, aliases, similarity, normalization inputs, and co-topic context. | Mandatory keep; ignored, on-demand companion output, and replaced by each run. |
| `reports/topic-normalization-review.tsv` | `report:video-topic-usage` | Repository owner and Codex review exact policy matches, collisions, source locations, and recommended actions. | Mandatory keep; ignored, on-demand companion output, and replaced by each run even when it contains only the header. |
| `reports/site-content-backlog.md` | `audit:site-content` | Repository owner or integration coordinator reviews transcript-evidence and shard-quality findings. | Ignored, on-demand validator output; regenerated rather than edited as source. |
| `reports/site-content-wording-scan.json` and `.md` | `check:site-content-wording -- --review --fuzzy --report` | Repository owner or integration coordinator reviews mechanical wording findings and transcript-dependent candidates. | Ignored, on-demand triage output; regenerated rather than edited as source. |
| `reports/transcript-problems.md` | `report:transcript-problems` | Transcript-maintenance operator reviews saved acquisition failures and probable causes. | Ignored, on-demand diagnostic output; regenerated from saved state without network access. |
| `reports/lighthouse/**` | `audit:lighthouse` | Site maintainer compares explicit performance and SEO audits. | Ignored, opt-in smoke-test output; the named run owns its output prefix. |
| Acquisition probe/extraction JSON under `reports/` | Explicit output flags on inventory or saved-HTML commands | Acquisition operator inspects a bounded probe or reconciles alternate inputs before a canonical apply. | Ignored, opt-in scratch output; retention is operator-managed and it never replaces `src/channel/episodes.json` or `src/channel/video-metadata.json`. |

One-off manual analyses may also remain in the ignored directory. Without a documented generator and owner they are not a supported command contract; this lifecycle review does not delete them.

The video-segment audit report excludes shards with empty or unreadable segment arrays and SASC school-function shards. Malformed excluded shards are identified on stderr; malformed entries within a nonempty segment array remain repair rows. The report exposes `repair_required`, `review_candidate`, and `low_signal` routes, in that order. Within each route, the largest evidence gap sorts by minutes descending, then percentage descending, then file stem. This keeps a short clip's large percentage from outranking a longer interval solely because of its proportion. The former Audit Risk Score, its arbitrary thresholds, and the processing-log-count tie-break have been removed. No pass count or model label estimates the probability of another productive audit.

Evidence gaps are measured between the union of valid, source-matching evidence ranges, clipped to the transcript interval and the owning segment's start and optional end. Cross-referenced evidence outside that segment remains valid source data but contributes no span beyond that watch point. A citation without an end is a point; a segment's end alone does not establish an evidence range. Overlapping and touching ranges merge. The report supplies the largest gap's start, end, minutes, and percentage of transcript duration. A completely spanned interval has a zero-length gap at the transcript start; unavailable transcript files or unusable transcript intervals leave gap metrics blank. Existing anchor-gap, size, density, temporal-bin, Q&A, and log-count columns remain diagnostics. Evidence geometry does not prove semantic completeness, and a large gap does not establish that eligible content was missed. Audio concerns remain in the latest processing result and notes; the report does not infer an audio-review status from selected log phrases.

`Transcript Bytes Per Minute` appears between `duration minutes` and `segment count`. It divides the canonical TXT file size by the unrounded transcript duration in minutes and displays two decimal places. Missing transcript bytes or an unusable duration leave the cell blank; an empty TXT with a valid duration produces `0.00`. This diagnostic does not affect ranking.

Before choosing another audit, read its latest processing result and notes, then spot-check the reported gap in the canonical TXT against nearby shard content. Large gaps can contain woodworking, personal funding discussion, silence, or other material deliberately excluded by prior audits. The latest timestamp and log line identify the actual appended outcome, including blocked finalization and unchanged content. A previous saturation claim stays visible without suppressing stronger-model or improved-method reviews. Revisions can add substance without increasing segment counts, and a synchronization failure can follow substantial content additions. Recent outcomes therefore inform this review step rather than a probability calibrated to log-entry counts. This report does not read transcript text or replace source validation.

Shard workers must not edit the catalog, shared registry, or other shards. Changes to shared topic policy or any corpus-wide topic rewrite require a separate, explicitly scoped taxonomy-maintenance task.

Other project workflows are:

- `.agents/site-archive-builder.md`: role brief for Astro/Pagefind pages, routes, search, and generated-data adapters.
- `.agents/skills/naval-video-page-prototype/SKILL.md`: reusable workflow for Astro/Pagefind study-guide implementation.
- `.agents/skills/naval-site-build-repair/SKILL.md`: reusable workflow for diagnosing and repairing site-pipeline failures.

The process is intentionally segment-first. Use `kind: qa` only for actual Q&A exchanges; keep lecture material as `chapter`, `notable_point`, or `transcript_excerpt`.

### Generated Site Data

The deterministic manifest and shards under `site/src/data/generated/archive/` are ignored build output, not canonical source. `npm run generate:site-data`, `npm run site:dev`, and `npm run site:check` regenerate them directly; `npm run site:build` regenerates them only when its validated cache requires that stage. These commands fail with an actionable `npm run sync:video-topics` instruction rather than editing the canonical registry. Never hand-edit or commit `index.json` or its listed files; `index.json` remains the runtime manifest even though Git does not track it. The one-pass CI graph runs tests and then invokes `site:build` once; that wrapper owns source validation plus cache-aware archive, Astro, and official Pagefind work. `check:production` then validates the existing output without starting another build.

## Project Helpers

- `.agents/site-archive-builder.md`: project-local brief for agents working on Astro/Pagefind site pages.
- `.agents/transcript-content-curator.md`: project-local brief for transcript-backed segment curation.
- `.agents/site-content-auditor.md`: project-local brief for follow-up transcript-backed content audits.
- `.agents/skills/naval-video-page-prototype/SKILL.md`: reusable Codex skill for extending the Astro/Pagefind study-guide site.
- `.agents/skills/naval-transcript-to-site-content/SKILL.md`: reusable Codex skill for processing one transcript into curated site content.
- `.agents/skills/naval-site-content-auditor/SKILL.md`: reusable Codex skill for strengthening one selected video shard.
- `.agents/skills/naval-site-build-repair/SKILL.md`: reusable Codex skill for diagnosing and repairing site-pipeline failures.
## Contributor Notes

See `AGENTS.md` for repository-specific contributor and agent guidance.

## Transcript Availability Status

`src/channel/ignored-videos.json` is authoritative for videos excluded from the project in full. Channel refreshes, metadata refreshes, saved-HTML ingestion, and direct or batch transcript fetches apply it before downstream work.

`src/transcripts/manifest.json` is authoritative for stored transcripts, and `src/transcripts/fetch-status.json` is authoritative for resumable ingestion status. The checked-in failure set currently contains completed videos and streams with `no_caption_tracks`; upcoming, live, processing, and otherwise deferred videos are tracked separately, while videos at or below the 61-second cutoff are intentionally skipped.

Generate the current human-readable failure report from saved status without contacting YouTube or retrying anything:

```powershell
npm run report:transcript-problems
```
