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
- A deployed learner-facing study-guide site with light, dark, and system theme switching.
- A generated Astro archive data file built from channel inventory, YouTube metadata, and curated per-video segment shards.
- Dynamic video, segment, topic, and search pages backed by `site/src/data/generated/archive.json`.
- A Pagefind component search UI with filters for result type, segment kind, topic, and video.
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
    video-segments/        Source-of-truth curated study-guide content
      topics.json          Shared topic records and aliases
      video-<videoId>.json One curated segment shard per video
  scripts/                 TypeScript CLI entrypoints
  site/                    Site data generator and validation logic
  youtube/                 YouTube inventory helpers
  transcripts/             Local transcript archive
    manifest.json          Index of stored transcript files
    json/                  Raw structured transcript JSON
    txt/                   Generated timestamped text
    tsv/                   Generated tab-separated rows
site/
  src/                     Astro pages, layouts, and site data adapters
    data/generated/        Deterministic generated archive JSON
  public/                  Static assets copied into the site
  dist/                    Generated GitHub Pages artifact, ignored by Git
.agents/                   Project-local agent briefs
.codex/skills/             Project-local Codex skills
.codex/hooks/              Project-local validation helper scripts
task-notes/                Temporary planning and handoff notes
reports/                   Generated reports and smoke-test output, ignored by Git
dist/                      Compiled JavaScript, ignored by Git
```

Curated public content currently lives in `src/derived/video-segments/`. There is no committed `docs/` tree at the moment; the public site is generated through Astro routes and `site/src/data/generated/archive.json`.

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
npm run generate:site-data
npm run site:check
npm run site:build
```

## Website

The public site is deployed from GitHub Actions to [r-jack-ray.github.io/naval-history-with-dr-alex](https://r-jack-ray.github.io/naval-history-with-dr-alex/).

Local site commands:

```powershell
npm run site:dev
npm run site:check
npm run site:build
npm run site:preview
```

`npm run site:check` and `npm run site:build` regenerate `site/src/data/generated/archive.json` first. `npm run site:build` emits `site/dist/` and then runs Pagefind against that output. Do not commit generated `site/dist/` files.

The generated site exposes:

- `/videos/<slug>/`: video metadata and curated segment links.
- `/segments/<slug>/`: independently addressable segment or Q&A entries with timestamp links.
- `/topics/<slug>/`: topic landing pages listing related videos and segments.
- `/search/`: Pagefind component search over the built HTML with filters for type, kind, topic, and video.

## Fetch Channel Video Links

The inventory script uses the official YouTube Data API through `googleapis`. The npm scripts default to reading the API key from `reports/youtube-api-key.txt`; alternatively pass `--api-key` or `--api-key-file` after `--` when invoking the npm script. Direct CLI use can also read `YOUTUBE_API_KEY`. Fetching defaults to one request per minute; this is conservative and can be lowered for official API runs.

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

## Extract Saved Live Streams HTML

If a channel tab page is saved from a browser, parse its rendered lockup markup offline without making YouTube requests:

```powershell
npm run extract:videos-html -- --output reports/dr-alex-videos-html-extraction.json --links-output reports/dr-alex-videos-html-links.json --base-output reports/dr-alex-video-list-from-html.json --metadata-output reports/dr-alex-video-metadata-from-html.json --master-output src/channel/episodes.json --inventory-completeness partial
```

Use the generic command for other saved channel tabs:

```powershell
npm run extract:saved-channel-html -- --tab streams --output reports/dr-alex-streams-html-extraction.json --links-output reports/dr-alex-streams-html-links.json
```

The report includes parse stats, continuation-token detection, and the standard channel-link result. Saved `/videos` pages can contain many rendered rows; saved `/streams` pages may contain only the visible page of stream items.

Merge saved tab outputs into the source master:

```powershell
npm run merge:video-links -- --input reports/dr-alex-videos-html-links.json --input reports/dr-alex-streams-html-links.json --master-output src/channel/episodes.json --inventory-completeness partial
```

## Store Video Transcripts Locally

The transcript puller uses `youtube-transcript-plus` first, falls back to direct
watch-page caption tracks, and defaults to a 5-second delay between YouTube
requests. The official YouTube Data API does not provide public transcript
download by API key. By default this writes JSON, TXT, TSV, and updates
`src/transcripts/manifest.json`:

```powershell
npm run fetch:transcript -- --video-id uURe69Wnh-Q
```

For unattended ingestion, use the batch runner. It skips transcripts already in
`src/transcripts/manifest.json`, uses `src/channel/video-metadata.json` for
timestamped naming, and checkpoints failures/progress to
`src/transcripts/fetch-status.json`:

```powershell
npm run fetch:transcripts -- --limit 1 --request-delay-ms 5000
npm run fetch:transcripts
```

Use `--request-delay-ms 60000` if YouTube starts rate-limiting or blocking
transcript requests. Use `--retry-failed` to retry videos recorded in the status
file.

JSON stores structured segment data. TXT is a readable timestamped transcript. TSV is for structured timestamp/link review. Stored transcript files use `timestamp_title-slug_videoId.ext` when exact timing is known, otherwise `title-slug_videoId.ext`.

When the transcript backend does not provide enough naming metadata, pass explicit values:

```powershell
npm run fetch:transcript -- --video-id uURe69Wnh-Q --video-title "Video Title" --video-timestamp 2026-06-14T05:29:19-05:00
```

To re-store an existing JSON file with readable naming without calling YouTube:

```powershell
npm run store:transcript-json -- src/transcripts/json/<file-stem>.json --video-title "Video Title" --video-timestamp 2026-06-14T05:29:19-05:00
```

Convert existing transcript JSON without calling YouTube:

```powershell
npm run convert:transcript-json -- src/transcripts/json/<file-stem>.json --output-dir src/transcripts/txt
npm run convert:transcript-json -- --format tsv src/transcripts/json/<file-stem>.json --output-dir src/transcripts/tsv
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

Use the transcript curation process when moving stored transcript material into site-visible pages:

```powershell
npm run audit:site-content
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
```

`npm run audit:site-content` validates existing curated segment evidence and writes `reports/site-content-backlog.md` with stored transcripts that do not yet have curated segments. Reports are ignored by Git.

Record every processed transcript file in `src/derived/site-content-processing.log`. The log has no header; every non-empty line is one processed file with tab-separated fields:

```text
processedAt	sourcePath	videoId	action	needsFurtherProcessing	determination
```

Use `yes` or `no` for `needsFurtherProcessing`.

For agent-driven work, use:

- `.agents/transcript-content-curator.md`: role brief for transcript-backed curation.
- `.agents/site-content-auditor.md`: role brief for follow-up public wording, density, and evidence checks.
- `.codex/skills/naval-transcript-to-site-content/SKILL.md`: reusable workflow for converting transcript TXT/TSV evidence into `src/derived/video-segments/video-<videoId>.json`.
- `.codex/skills/naval-site-content-auditor/SKILL.md`: reusable workflow for strengthening existing segment notes.
- `.codex/hooks/validate-content-pipeline.ps1`: audit, regenerate generated site data, run Astro checks, and optionally run the full repository check.

The process is intentionally segment-first. Use `kind: qa` only for actual Q&A exchanges; keep lecture material as `chapter`, `notable_point`, or `transcript_excerpt`.

## Project Helpers

- `.agents/site-archive-builder.md`: project-local brief for agents working on Astro/Pagefind site pages.
- `.agents/transcript-content-curator.md`: project-local brief for transcript-backed segment curation.
- `.codex/skills/naval-video-page-prototype/SKILL.md`: reusable Codex skill for extending the prototype video-page workflow.
- `.codex/skills/naval-transcript-to-site-content/SKILL.md`: reusable Codex skill for processing transcripts into segment seed data.
- `.codex/hooks/validate-site.ps1`: optional validation helper for site checks and the full repository check.
- `.codex/hooks/validate-content-pipeline.ps1`: optional validation helper for transcript curation plus generated site checks.

Run the helper directly when you want a site-focused validation pass:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-site.ps1 -SkipRepoCheck
```

## Contributor Notes

See `AGENTS.md` for repository-specific contributor and agent guidance.
