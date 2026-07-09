# Processing Log

Log every transcript file processed in `src/derived/site-content-processing.log`.

The file has no header. Every non-empty line is one processed transcript file.

Use tab-separated fields:

```text
processedAt	sourcePath	videoId	action	needsFurtherProcessing	determination
```

Example:

```text
2026-07-08T02:45:00-05:00	src/transcripts/txt/example_uURe69Wnh-Q.txt	uURe69Wnh-Q	curated 4 segments	no	ready for site
```

Field rules:

- `processedAt`: ISO 8601 timestamp with offset.
- `sourcePath`: repo-relative transcript TXT or TSV path.
- `videoId`: YouTube video ID.
- `action`: short statement of what was done, such as `curated 4 segments`, `reviewed no usable segments`, or `blocked noisy transcript`.
- `needsFurtherProcessing`: exactly `yes` or `no`.
- `determination`: short conclusion or follow-up note.

If one transcript file is revisited later, add another line for the later processing pass. Do not edit old log lines unless correcting a factual typo from the same pass.

The latest valid line for a video controls whether audit backlog treats it as complete. Use `needsFurtherProcessing=no` only when the transcript is fully curated or intentionally closed without site content; leave partial first-pass curation as `yes`.

## Shared Writer Lease

For a scheduled transcript run, acquire the repository writer lease before claiming the schedule row or editing shared topics, then set `CONTENT_PIPELINE_LOCK_TOKEN` to its token before invoking normal pipeline npm commands. Append the log through the lock-aware command while the lease is held:

```powershell
npm.cmd run append:site-content-processing-log -- --token <lease-token> --processed-at <iso-time> --source-path <transcript-path> --video-id <video-id> --action <action> --needs-further-processing <yes-or-no> --determination <reason>
```

The command validates all six fields and atomically publishes the complete log, so it does not interleave or leave a partial final record. Do not use `Add-Content` or hand-edit the shared log during a scheduled run. Pass the same token to the validation hook; it releases the lease on success or failure. Clear `CONTENT_PIPELINE_LOCK_TOKEN` in the calling shell after validation returns. If a run ends before validation, release the lease explicitly and report the failure.
