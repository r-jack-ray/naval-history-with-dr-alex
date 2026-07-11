# Transcript Store

This directory is the local transcript archive. Timestamped TXT files are the transcript source of record.

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

If an exact publish or stream timestamp is not known, omit the timestamp prefix
and use `title-slug_videoId.txt`. The ID must remain in the filename. Once a
record is stored, its manifest `fileStem` remains authoritative during refetches
even if title or timestamp metadata later changes.

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
uses one shared request limiter, and writes `fetch-status.json` after each
attempt. Previous failures are skipped on resume unless `--retry-failed` is
provided.

By default, the fetcher reads `src/channel/video-metadata.json` for title and
publish timestamp naming. Use `--video-title` and `--video-timestamp` when
naming metadata needs to be supplied manually, or `--no-metadata-lookup` to use
only transcript-provided metadata. Use explicit `--txt-output` or `--tsv-output`
only for ad hoc exports outside the store.
