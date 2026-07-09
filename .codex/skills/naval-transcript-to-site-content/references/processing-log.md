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
