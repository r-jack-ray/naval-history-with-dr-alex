# Naval History With Dr. Alex

Static reference archive tooling for [Naval History with Dr Alex](https://www.youtube.com/@DrAlexClarke).

The archive uses a segment-first model. The core curated unit is a video segment: a chapter, notable point, actual Q&A exchange, or optional transcript excerpt.

## Current Status

The repository is in early setup. It currently has:

- Node 22+ and TypeScript project scaffolding.
- Strict TypeScript compilation.
- Node's built-in test runner.
- A rate-limited YouTube channel link inventory script.
- A source master episode list under `src/channel/`.
- A local transcript store under `src/transcripts/`.
- Planning notes under `task-notes/`.

Curated video pages, transcript ingestion, search indexes, and static site output are planned but not complete yet.

## Project Layout

```text
src/
  channel/                 Canonical channel inventory
    episodes.json          Master episode list
    video-metadata.json    YouTube Data API metadata store
  scripts/                 TypeScript CLI entrypoints
  youtube/                 YouTube inventory helpers
  transcripts/             Local transcript archive
    manifest.json          Index of stored transcript files
    json/                  Raw structured transcript JSON
    txt/                   Generated timestamped text
    tsv/                   Generated tab-separated rows
task-notes/                Temporary planning and handoff notes
reports/                   Generated reports and smoke-test output, ignored by Git
dist/                      Compiled JavaScript, ignored by Git
```

Planned archive data will follow the structure in `task-notes/2026-07-07_T17-34-31-0500_naval-history-project-plan.md`, including `docs/videos/` and `site/static/search/`.

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
```

## Fetch Channel Video Links

The inventory script uses the official YouTube Data API through `googleapis`. Set `YOUTUBE_API_KEY` before running API-backed commands. It defaults to one request per minute; this is conservative and can be lowered for official API runs.

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

Use `segment` as the primary searchable object. Segment kinds currently planned:

- `chapter`
- `notable_point`
- `qa`
- `transcript_excerpt`

Every curated segment should eventually point back to a video ID, timestamp, canonical YouTube URL, source transcript file, and transcript evidence window.

## Contributor Notes

See `AGENTS.md` for repository-specific contributor and agent guidance.
