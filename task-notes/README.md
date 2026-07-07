# Task Notes

Use this directory for transient in-project task notes, including AI session summaries and temporary human task documentation.

Do not store generated reports here. Put validation output, smoke-test output, CSV/JSON report data, and Markdown report files under `../reports/`.

Use durable project files such as `README.md`, `AGENTS.md`, or another stable documentation file for guidance that should apply outside a task note.

## Filename Format

Use timestamp-first names so notes sort chronologically in file browsers while remaining searchable by task name:

```text
yyyy-MM-dd_THH-mm-ss<UTC-offset>_<summary-name>.md
```

Rules:

- Use local time.
- Include the UTC offset without a colon in the filename.
- Use an ASCII, lowercase, hyphenated summary name with no spaces.
- Keep the file extension as `.md`.

Example:

```text
2026-06-14_T05-29-19-0500_episode-14-summary.md
```

Also include the full ISO 8601 timestamp in the file header, using colons in the time and UTC offset:

```text
Timestamp: 2026-06-14T05:29:19-05:00
```
