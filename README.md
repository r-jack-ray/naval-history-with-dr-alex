# Naval History With Dr. Alex

[Main site](https://r-jack-ray.github.io/naval-history-with-dr-alex/)

Static reference archive tooling for [Naval History with Dr Alex](https://www.youtube.com/@DrAlexClarke).

The archive uses a segment-first model. The core curated unit is a video segment: a chapter, notable point, actual Q&A exchange, or optional transcript excerpt.

## Current Status

The repository currently has:

- Node 22+ and TypeScript project scaffolding.
- Strict TypeScript compilation.
- Node's built-in test runner.
- An Astro static site configured for GitHub Pages.
- Pagefind indexing during site builds.
- A deployed learner-facing study-guide site with Light, Dark, Bruships, and System theme switching.
- A generated Astro archive dataset built from channel inventory, YouTube metadata, and curated per-video segment shards.
- Static video, segment, and topic pages built from the manifest and stable JSON shards under `site/src/data/generated/archive/`.
- Deferred Pagefind-backed search across video guides, time notes, and topics, without an inline archive corpus.
- A subject-focused Time Notes finder with explanation/Q&A filters and a paginated browse-all fallback.
- A transcript-to-site-content process with curation and audit agent briefs, Codex skills, backlog audit, and validation hooks.
- A rate-limited YouTube channel link inventory script.
- A source master episode list under `src/channel/`.
- A local transcript store under `src/transcripts/`.
- Planning notes under `task-notes/`.

The generated archive already spans hundreds of video guides and thousands of curated segments. Transcript-backed curation and follow-up quality passes are still in progress.

## Project Layout

```text
src/
  channel/                 Canonical channel inventory
    episodes.json          Master episode list
    video-metadata.json    YouTube Data API metadata store
  content/                 Site-content audit logic
  derived/                 Curated site-content sources and curation bookkeeping
    site-content-processing.config.json
    site-content-processing.log
    topic-normalization-patterns.tsv Manually curated topic normalization policy
    video-segments/        Source-of-truth curated study-guide content
      topics.json          Shared topic records and aliases
      <manifest.fileStem>.json One curated segment shard per video; reuse the stored transcript manifest stem
  scripts/                 TypeScript CLI entrypoints
  site/                    Site data generator and validation logic
  youtube/                 YouTube inventory helpers
  transcripts/             Local transcript archive
    manifest.json          Index of stored transcript files
    txt/                   Stored timestamped transcript text; source of record
site/
  src/                     Astro pages, layouts, and site data adapters
    data/generated/archive/ Deterministic generated archive manifest and JSON shards
  public/                  Static assets copied into the site
  dist/                    Generated GitHub Pages artifact, ignored by Git
.agents/                   Project-local agent briefs and Codex skills
.agents/skills/            Project-local Codex skills
.codex/hooks/              Project-local validation helper scripts
task-notes/                Temporary planning and handoff notes
reports/                   Generated reports and smoke-test output, ignored by Git
dist/                      Compiled JavaScript, ignored by Git
```

Curated public content currently lives in `src/derived/video-segments/`. There is no committed `docs/` tree at the moment; the public site is generated through Astro routes and the split dataset under `site/src/data/generated/archive/`.

## Setup

Install dependencies:

```powershell
npm install
```

Useful checks:

```powershell
npm run build
npm run check:types
npm test
npm run check
npm run audit:site-content
npm run sync:video-topics
npm run generate:site-data
npm run site:check
npm run site:build
```

On this Windows machine, use `C:\Program Files\nodejs\npm.cmd` for interactive commands if plain `npm` resolves the broken roaming shim.

## Website

The public site is deployed from GitHub Actions to [r-jack-ray.github.io/naval-history-with-dr-alex](https://r-jack-ray.github.io/naval-history-with-dr-alex/).

Local site commands:

```powershell
npm run site:dev
npm run site:check
npm run site:build
npm run site:preview
```

`npm run site:check` regenerates `site/src/data/generated/archive/` before running Astro checks. `npm run site:build` fingerprints the generator and site inputs, validates the manifest-listed generated files and SHA-256 values, and regenerates or rebuilds only when inputs or outputs changed; pass `-- --force` to bypass its caches. A performed build emits `site/dist/` and runs Pagefind against that output. The authoritative generated `index.json` manifest lists the tracked collection files and segment buckets. Do not hand-edit the generated archive dataset, and do not commit generated `site/dist/` files.

The generated site exposes:

- `/videos/` and `/videos/<slug>/`: the video-guide directory and individual guides with curated time-note links.
- `/segments/`: a Pagefind-backed subject finder for explanations and transcript-visible Q&A.
- `/segments/browse/` and `/segments/browse/<page>/`: the complete paginated time-note directory.
- `/segments/<slug>/`: independently addressable chapters, notable points, Q&A, and transcript excerpts with direct video-time links.
- `/topics/` and `/topics/<slug>/`: the topic directory and subject pages listing related videos and time notes.
- `/search/`: deferred full-text search across video guides, time notes, and topics through the generated Pagefind index.

## Fetch Channel Video Links

The main inventory task uses the official YouTube Data API through `googleapis`. It defaults to reading the API key from `reports/youtube-api-key.txt`; alternatively pass `--api-key` or `--api-key-file` after `--`. Direct CLI use can also read `YOUTUBE_API_KEY`. Official API calls default to a one-second delay between requests.

YouTube Data API quota is tracked by Google project and resets at midnight Pacific Time. The default allocation is 10,000 units per day for most endpoints, with `playlistItems.list` and `videos.list` costing 1 unit per call. `search.list` has its own default limit of 100 calls per day, and `captions.list` costs 50 units per call. Check the official [YouTube Data API quota cost table](https://developers.google.com/youtube/v3/determine_quota_cost) before changing fetch strategy.

Full run into the source master episode list:

```powershell
npm run fetch:video-links -- --master-output src/channel/episodes.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
```

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
npm run alternate:extract:videos-html -- --output reports/dr-alex-videos-html-extraction.json --links-output reports/dr-alex-videos-html-links.json --base-output reports/dr-alex-video-list-from-html.json --metadata-output reports/dr-alex-video-metadata-from-html.json --master-output src/channel/episodes.json --inventory-completeness partial
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

The transcript puller uses `youtube-transcript-plus` first, falls back to direct
watch-page caption tracks, and defaults to a 5-second delay between YouTube
requests. The official YouTube Data API does not provide public transcript
download by API key. By default this writes TXT and updates
`src/transcripts/manifest.json`:

```powershell
npm run alternate:fetch:transcript -- --video-id uURe69Wnh-Q
```

For unattended ingestion, use the batch runner. It skips transcripts already in
`src/transcripts/manifest.json`, uses `src/channel/video-metadata.json` for
timestamped naming, and checkpoints failures/progress to
`src/transcripts/fetch-status.json`:

```powershell
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
npm run alternate:fetch:transcripts
```

Use `--request-delay-ms 60000` if YouTube starts rate-limiting or blocking
transcript requests. Use `--retry-failed` to retry videos recorded in the status
file.

TXT is the stored transcript source of record. Stored transcript files use `timestamp_title-slug_videoId.txt` when exact timing is known, otherwise `title-slug_videoId.txt`.

When the transcript backend does not provide enough naming metadata, pass explicit values:

```powershell
npm run alternate:fetch:transcript -- --video-id uURe69Wnh-Q --video-title "Video Title" --video-timestamp 2026-06-14T05:29:19-05:00
```

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

Transcript curation is shard-only. Each run must be given exactly one stored TXT transcript and must edit only its manifest-owned `src/derived/video-segments/<manifest.fileStem>.json` file. The transcript basename, `manifest.fileStem`, and shard basename must match; do not derive a new shard name from current title metadata.

The curation run reads the full selected transcript, keeps lecture material as chapters or notable points, and creates `kind: qa` records only for substantive transcript-visible prompts and answers. It reads `src/derived/topic-normalization-patterns.tsv`, resolves new slugs through active creation rules, and preserves established slugs unless the active creation policy canonicalizes them. It edits no other shard, leaves review or ambiguous rules unchanged, and appends exactly one required result line to `src/derived/site-content-processing.log` after a successful shard write. It does not edit the normalization catalog or `topics.json`, perform corpus-wide topic rewrites, or write schedules, reports, generated archives, package/tooling files, or site sources. It also does not run repository-wide audits, generation, tests, or builds.

For agent-driven curation, use `.agents/transcript-content-curator.md` with `.agents/skills/naval-transcript-to-site-content/SKILL.md`. For a follow-up substance and wording pass on one explicitly selected shard, use `.agents/site-content-auditor.md` with `.agents/skills/naval-site-content-auditor/SKILL.md`.

After shard work, the repository owner can synchronize shared topic records and run integration checks:

```powershell
npm run audit:topic-normalization
npm run sync:video-topics
npm run audit:site-content
npm run site:check
npm run site:build
```

`npm run audit:site-content` validates curated transcript evidence and writes `reports/site-content-backlog.md`. Reports are ignored by Git. Shared generation, reports, schedules, and logs other than the shard worker's one required `src/derived/site-content-processing.log` append are coordinator-owned outputs.

The existing processing log has this exact semicolon-separated header:

```text
timestamp;shardPath;result;needsFurtherProcessing;notes
```

Each curator or auditor result is one newline-terminated five-field row appended at the physical bottom. `shardPath` is the selected manifest-owned JSON shard, and `needsFurtherProcessing` is exactly `yes` or `no`. The curator appends after a successful shard write; the auditor appends after every completed selected-file audit, including unchanged, saturated, and intentionally empty results. Neither workflow acquires the shared writer lease for this append.

### Topic Normalization Policy

`src/derived/topic-normalization-patterns.tsv` is the detailed source of truth for steady-state topic creation, display names, aliases, and exceptions. `src/derived/video-segments/topics.json` remains authoritative for curated topic metadata unrelated to that policy. Routine synchronization and generation validate policy compliance but never rewrite source shards merely because the catalog changed.

Resolve every new shard topic through active creation rules before writing it. Preserve established slugs unless the active creation policy canonicalizes them, and leave `review`, disabled, ambiguous, or inapplicable candidates unchanged. Use the read-only audit to check policy and registry consistency before shared synchronization or integration work:

```powershell
npm run audit:topic-normalization
```

Shard workers must not edit the catalog, shared registry, or other shards. Changes to shared topic policy or any corpus-wide topic rewrite require a separate, explicitly scoped taxonomy-maintenance task.

Other project workflows are:

- `.agents/site-archive-builder.md`: role brief for Astro/Pagefind pages, routes, search, and generated-data adapters.
- `.agents/skills/naval-video-page-prototype/SKILL.md`: reusable workflow for Astro/Pagefind study-guide implementation.
- `.agents/skills/naval-site-build-repair/SKILL.md`: reusable workflow for diagnosing and repairing site-pipeline failures.
- `.codex/hooks/validate-content-pipeline.ps1`: audit, regenerate generated site data, run Astro checks, and optionally run the full repository check.

The process is intentionally segment-first. Use `kind: qa` only for actual Q&A exchanges; keep lecture material as `chapter`, `notable_point`, or `transcript_excerpt`.

### Shared Content-Pipeline Writes

The generated manifest and shards under `site/src/data/generated/archive/` remain tracked so Astro can statically import a reviewable archive dataset. `npm run generate:site-data` and `npm run site:check` regenerate it directly; `npm run site:build` regenerates it only when its validated cache requires that stage. Never hand-edit `index.json` or its listed files. The content validation hook builds once, writes the backlog report, regenerates the archive once, and then runs the no-regeneration Astro check.

The archive, backlog report, shared topic registry, and normalization apply are protected by the repository-wide writer lease at `.tmp/site-content-pipeline.lock`. Direct shared-writer commands such as `npm run audit:site-content`, `npm run sync:video-topics`, and `npm run generate:site-data` acquire a short-lived lease automatically. A coordinator that intentionally groups several shared-output operations may acquire one persistent lease and pass its token to the supported commands:

```powershell
$lease = node .codex/hooks/site-content-pipeline-lock.mjs acquire --owner "content-coordinator" --purpose "shared-content-integration" --recover-stale | ConvertFrom-Json
```

Keep `$lease.lease.token` for the current run and export it before invoking any normal pipeline npm command, so that command joins the existing lease:

```powershell
$env:CONTENT_PIPELINE_LOCK_TOKEN = $lease.lease.token
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck -LockToken $lease.lease.token
Remove-Item Env:CONTENT_PIPELINE_LOCK_TOKEN -ErrorAction SilentlyContinue
```

The hook releases the lease in `finally` on success or failure; the caller clears its own environment variable after the child PowerShell process returns. If a run stops before reaching validation, release it explicitly with `node .codex/hooks/site-content-pipeline-lock.mjs release --token $lease.lease.token`. Leases expire after 90 minutes unless renewed; use `status` to inspect a blocker, and `acquire --recover-stale` to quarantine an expired lease with its owner metadata before continuing.

Lane-isolated transcript automations follow their prompt-owned atomic claim, lane-private log, video-specific temporary checks, and exact completion/reset procedure. They remain single-agent, do not acquire or inspect the repository lease, and do not write shared topics, reports, or generated archives.

## Project Helpers

- `.agents/site-archive-builder.md`: project-local brief for agents working on Astro/Pagefind site pages.
- `.agents/transcript-content-curator.md`: project-local brief for transcript-backed segment curation.
- `.agents/site-content-auditor.md`: project-local brief for follow-up transcript-backed content audits.
- `.agents/skills/naval-video-page-prototype/SKILL.md`: reusable Codex skill for extending the prototype video-page workflow.
- `.agents/skills/naval-transcript-to-site-content/SKILL.md`: reusable Codex skill for processing transcripts into segment seed data.
- `.agents/skills/naval-site-content-auditor/SKILL.md`: reusable Codex skill for strengthening one selected video shard.
- `.agents/skills/naval-site-build-repair/SKILL.md`: reusable Codex skill for diagnosing and repairing site-pipeline failures.
- `.codex/hooks/validate-site.ps1`: optional validation helper for site checks and the full repository check.
- `.codex/hooks/validate-content-pipeline.ps1`: optional validation helper for transcript curation plus generated site checks.

Run the helper directly when you want a site-focused validation pass:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-site.ps1 -SkipRepoCheck
```

## Contributor Notes

See `AGENTS.md` for repository-specific contributor and agent guidance.

## Videos and Live Streams Without Available Transcripts

These completed videos and live streams have saved `no_caption_tracks` failures in `src/transcripts/fetch-status.json`. Upcoming videos and live streams are excluded.

### Videos

| Date | Title |
| --- | --- |
| 2020-12-13 | Town Class Part 5 of 7: Southamptons (inadvertent silent movie style...6&7 are ok) |
| 2020-12-15 | Town Class Part 5 of 7: Southamptons |
| 2021-08-23 | No Sound??? Battle of the Atlantic: Escort Procurement - Comment Response |
| 2022-06-28 | Blonde Class: Scout Cruisers of the Royal Navy (Long Patrol) |
| 2023-04-30 | Amagi Class Battlecruiser: No Sound, but still a Question |
| 2023-05-31 | Building an R Class to fight a convoy battle vs the Scharnhorsts |

### Live Streams

| Date | Title |
| --- | --- |
| 2020-10-27 | Patreon 8 - “The Treaty of London 1930” by Daniel Freedman |
| 2020-11-03 | Arethusa Class Cruisers |
| 2021-02-28 | Bruships 39: Books Off the Shelf... |
| 2021-07-18 | Bruships 53: The Big Gun Era.... bad sound... |
| 2021-10-14 | Patreon 35: The Naval Career of Jackie Fisher - First Sea Lord Extraordinaire |
| 2021-10-17 | Bruships 57: Some Cool Books and Naval History Chat |
| 2021-10-24 | 'The Imperial High Seas Fleet: Tarkin replaces Tirpitz & Thrawn replaces Scheer at Jutland...’ |
| 2023-09-21 | Patreon 84: The underpaid and underappreciated Merchant Marine of WWII |
| 2024-11-17 | Bruships 171: Oh Kallax my Kallax, Where art though my Kallax |
| 2026-02-01 | Bruships 230: Naval History Questions Answered Live...2nd Start |
