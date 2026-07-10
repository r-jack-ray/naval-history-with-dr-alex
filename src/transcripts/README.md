# Transcript Store

This directory is the local transcript archive.

## Layout

```text
src/transcripts/
  manifest.json   Index of locally stored transcript files.
  fetch-status.json  Batch fetch progress and failures.
  json/           Raw structured transcript JSON. Source of record.
  txt/            Timestamped plain-text view generated from JSON.
  tsv/            Tab-separated timestamp rows generated from JSON.
```

## File Naming

Use a readable filename stem that keeps the YouTube video ID at the end:

```text
json/2026-06-14_T05-29-19_title-slug_videoId.json
txt/2026-06-14_T05-29-19_title-slug_videoId.txt
tsv/2026-06-14_T05-29-19_title-slug_videoId.tsv
```

If an exact publish or stream timestamp is not known, omit the timestamp prefix
and use `title-slug_videoId.ext`. The ID must remain in the filename.

## Workflow

Fetch and store all local transcript formats:

```powershell
npm run alternate:fetch:transcript -- --video-id uURe69Wnh-Q
```

The default store root is `src/transcripts`. The fetcher writes JSON, TXT, TSV,
and updates `manifest.json`. If the video is already present in the manifest,
the command reads the local JSON and exits without calling YouTube; pass
`--force` only when you intentionally want to refetch. Transcript requests
default to a 5-second delay; pass `--request-delay-ms 60000` for cautious runs.

Fetch from the channel master list:

```powershell
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
npm run alternate:fetch:transcripts
```

The batch runner reads `src/channel/episodes.json`, skips stored transcripts,
uses one shared request limiter, and writes `fetch-status.json` after each
attempt. Previous failures are skipped on resume unless `--retry-failed` is
provided.

By default, the fetcher reads `src/channel/video-metadata.json` for title and
publish timestamp naming. Use `--video-title` and `--video-timestamp` when
naming metadata needs to be supplied manually, or `--no-metadata-lookup` to use
only transcript-provided metadata. Use explicit `--json-output`, `--txt-output`,
or `--tsv-output` only for ad hoc exports outside the store.

Re-store an existing JSON file without calling YouTube:

```powershell
npm run store:transcript-json -- src/transcripts/json/<file-stem>.json --video-title "Video Title" --video-timestamp 2026-06-14T05:29:19-05:00
```

Treat JSON as authoritative. Regenerate TXT or TSV from JSON when formatting
changes:

```powershell
npm run convert:transcript-json -- src/transcripts/json/<file-stem>.json --output-dir src/transcripts/txt
npm run convert:transcript-json -- --format tsv src/transcripts/json/<file-stem>.json --output-dir src/transcripts/tsv
```
