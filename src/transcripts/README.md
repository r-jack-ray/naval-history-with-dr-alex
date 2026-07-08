# Transcript Store

This directory is the local transcript archive.

## Layout

```text
src/transcripts/
  manifest.json   Index of locally stored transcript files.
  json/           Raw structured transcript JSON. Source of record.
  txt/            Timestamped plain-text view generated from JSON.
  tsv/            Tab-separated timestamp rows generated from JSON.
```

## File Naming

Use a readable filename stem that keeps the YouTube video ID at the end:

```text
json/2026-06-14_T05-29-19-0500_title-slug_videoId.json
txt/2026-06-14_T05-29-19-0500_title-slug_videoId.txt
tsv/2026-06-14_T05-29-19-0500_title-slug_videoId.tsv
```

If an exact publish or stream timestamp is not known, omit the timestamp prefix
and use `title-slug_videoId.ext`. The ID must remain in the filename.

## Workflow

Fetch and store all local transcript formats:

```powershell
npm run fetch:transcript -- --video-id uURe69Wnh-Q
```

The default store root is `src/transcripts`. The fetcher writes JSON, TXT, TSV,
and updates `manifest.json`. Use explicit `--json-output`, `--txt-output`, or
`--tsv-output` only for ad hoc exports outside the store.
Use `--video-title` and `--video-timestamp` when naming metadata needs to be
supplied manually.

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
