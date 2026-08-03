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

Use the base batch command for a bounded manual probe:

```powershell
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
```

Use the cautious batch for the supported weekly run:

```powershell
npm run alternate:fetch:transcripts:safe
```

The weekly command reads `src/channel/episodes.json`, skips valid stored
transcripts, defers videos whose metadata does not yet prove completion and
processing, uses one shared 60-second request limiter, and writes schema-2
`fetch-status.json` after each attempt. It supplies retry behavior automatically,
so every ready record that still lacks valid TXT is eligible even when an older
failure is saved. It does not force-refetch valid TXT. The lower-level base
command retains `--retry-failed` for explicit recovery runs.

At completion the command prints a deterministic handoff containing new TXT
paths, deferred records, failures from the run, and still-pending ready records.
A rate-limit or blocking failure opens a circuit breaker: no later eligible
video is requested in that run, and those records remain pending for the next
safe run. The status checkpoint and already-written manifest/TXT files preserve
partial progress if another failure interrupts the process. Newly stored TXT
paths remain in `pendingHandoffTxtPaths` until the handoff is successfully
written to standard output. An interrupted run therefore re-emits those paths;
successful delivery acknowledges and clears them so later runs do not duplicate
the curation handoff.

For each new TXT in the handoff, run one separate single-agent
`$naval-transcript-to-site-content` task. Then run at least two independent,
sequential single-agent `$naval-site-content-auditor` tasks for the resulting
exact shard. These file-scoped curation stages remain separate from acquisition
and from one another.

Videos in `src/channel/ignored-videos.json` are excluded before batch accounting
and are also blocked by the direct transcript command. They do not belong in
the transcript failure list because the whole video is outside project scope.

The ordinary weekly `npm run fetch:video-links` command reconciles inventory and
official metadata before caption scraping. Keep `npm run fetch:video-metadata`
as the independently rerunnable metadata repair command. That metadata step
retains upcoming livestream air dates and automatically refreshes a
deferred record about 24 hours after its latest scheduled time. A postponed
stream therefore records its new air date instead of becoming a transcript
failure; a completed stream becomes eligible for the following transcript
batch. A full `npm run fetch:video-links` also forces a targeted metadata
refresh when its current duration data contradicts a stored non-ready record,
so an obsolete future schedule cannot keep an already completed stream
deferred.

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
