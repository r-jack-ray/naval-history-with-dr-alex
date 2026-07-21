# Transcript Store

This directory is the local transcript archive. Timestamped TXT files are the transcript source of record.

`manifest.json` is authoritative for what is stored. `fetch-status.json` is the
live resumable-ingestion status; use its `stats` and `failures` rather than a
manually maintained transcript count or unavailable-video list.

## Layout

```text
src/transcripts/
  manifest.json      Index of locally stored transcript files.
  fetch-status.json  Batch fetch progress and failures.
  txt/               Stored timestamped plain-text transcripts.
```

## File Naming

Use a readable filename stem that keeps the YouTube video ID at the end:

```text
txt/2026-06-14_T05-29-19_title-slug_videoId.txt
```

The timestamp is the video's canonical UTC date: an eligible completed stream's
actual start when available, its scheduled start only as a completion-proven
fallback, or the raw YouTube publication time. Upcoming, live, processing, and
zero-duration videos are deferred and do not receive stored transcript files.
Videos at or below 61 seconds are also excluded from TXT pulls; the extra second
prevents nominal 60-second clips reported with YouTube container padding from
slipping through. The cutoff applies to single, batch, retry, and forced pulls.
The ID must remain in the filename. Once a record is stored, its manifest
`fileStem` remains authoritative during refetches even if title or timestamp
metadata later changes.

Manifest schema 3 stores the normalized value as `videoDateAt` and its source as
`videoDateKind`; it does not overload a publication-named field with stream time.

## Workflow

Fetch and store a transcript:

```powershell
npm run alternate:fetch:transcript -- --video-id uURe69Wnh-Q
```

The default store root is `src/transcripts`. The fetcher writes TXT and updates
`manifest.json`. A manifest record plus its TXT file is sufficient for the
command to exit without calling YouTube; pass `--force` only when you
intentionally want to refetch. Transcript requests default to a 5-second delay;
pass `--request-delay-ms 60000` for cautious runs.

Fetch from the channel master list:

```powershell
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
npm run alternate:fetch:transcripts
```

The batch runner reads `src/channel/episodes.json`, skips stored transcripts,
defers videos whose metadata does not yet prove completion and processing, uses
one shared request limiter, and writes schema-2 `fetch-status.json` after each
attempt. Deferred videos are not attempts or previous failures. Previous real
failures are skipped on resume unless `--retry-failed` is provided.

Run `npm run fetch:video-metadata` before the transcript batch. That metadata
step retains upcoming livestream air dates and automatically refreshes a
deferred record about 24 hours after its latest scheduled time. A postponed
stream therefore records its new air date instead of becoming a transcript
failure; a completed stream becomes eligible for the following transcript
batch.

Generate a diagnostic report from the saved failures without contacting YouTube
or retrying any transcript:

```powershell
npm run report:transcript-problems
```

The command reads `fetch-status.json` and writes
`reports/transcript-problems.md`. Its probable reasons are labeled with a
confidence level and remain limited to evidence saved by prior fetch runs.

By default, the fetcher reads `src/channel/video-metadata.json` for title and
canonical video-date naming. Use `--video-title` and `--video-timestamp` when
naming metadata needs to be supplied manually, or `--no-metadata-lookup` to use
only transcript- or episode-provided metadata and bypass the readiness and
short-duration preflight. Use explicit `--txt-output` or `--tsv-output` only for
ad hoc exports outside the store.
