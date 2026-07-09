# Transcript Content Curator

Use this brief when turning stored Dr. Alex transcript files into site-visible segment data.

## Site Intent

- Curate for readers learning naval history and how navies work.
- Use transcript-backed segments to steer readers to the Dr. Clarke video moment that matches their interest.
- Make summaries act as watch pointers: name the naval subject, preview the argument or example, and clarify the learning payoff.
- Keep the site highly searchable with concrete ships, classes, navies, battles, weapons, policies, doctrine, logistics, acronyms, and alternate wording when supported by the transcript.
- Prefer many distinct, useful time notes over a single sparse overview when the transcript has enough substance.
- Keep the reusable project theme here and in the skill. The normal processing unit is one transcript/video content shard per process run in the main working checkout. Current schedule workers may use independent queue files, but each invocation still owns exactly one claimed transcript and one current-schema shard. Do not use detached worktrees or `src/derived/prototype-segments.json` for routine transcript curation. Scheduled transcript runs are single-agent jobs; do not use `ultra`, multi-agent mode, or subagents inside a claimed run.

## Scope

- Read from `src/transcripts/manifest.json` and the matching `src/transcripts/txt/` or `src/transcripts/tsv/` file.
- Curate into `src/derived/video-segments/video-<videoId>.json`. Shared topic records live in `src/derived/video-segments/topics.json`.
- Use `src/channel/episodes.json` and `src/channel/video-metadata.json` only for inventory, title, date, thumbnail, and source metadata checks.
- Use `src/derived/site-content-processing.config.json` for first-pass defaults, video-type handling, follow-up stages, and topic grouping.
- Do not fetch transcripts, edit raw transcript JSON, or commit `src/transcripts/` changes unless the user explicitly asks for ingestion work.

## Workflow

1. Verify local dependencies before content edits. If `node_modules/.bin/tsc.cmd` or the platform equivalent is missing in the active workspace, run `npm ci` before validation. If dependency installation or the first audit cannot run, report the blocker and make no transcript-content edits.
2. Resolve the input from the invoking task. A named transcript path or claimed schedule/queue row is authoritative; follow its claim timing and do not replace it with a generic backlog candidate merely because a shard or processing-log row already exists.
3. Only when no input was named, run `npm run audit:site-content` and open `reports/site-content-backlog.md` to select the next stored transcript without curated segments. For named inputs, still run the audit after claiming when the invoking workflow requires current context.
4. Inspect the transcript TXT/TSV before writing summaries. For long transcripts, use TSV timestamps to map the full duration and read contiguous time-based chunks small enough to avoid tool-output truncation; do not rely on one raw full-file dump or only the opening portion.
5. Add or update the current-schema content shard under `src/derived/video-segments/`, normally `video-<videoId>.json` for the selected transcript. Treat that shard as the owned content artifact for this process run.
6. Add topic records when the segment needs new stable browsing/search tags.
7. Add segment records with `videoId`, `slug`, `kind`, `start`, optional `end`, `topics`, summary/body fields, `sourcePath`, and at least one transcript evidence passage.
8. Use `kind: qa` only for actual question/answer exchanges. Keep lectures, profiles, and explanations as `chapter`, `notable_point`, or `transcript_excerpt`.
9. Append one line to `src/derived/site-content-processing.log` for each transcript file processed. Treat this as best-effort append-only bookkeeping; shared log churn is acceptable and should not be confused with the content source of truth.
10. Regenerate and validate with `.codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck` before handoff; run without `-SkipRepoCheck` when TypeScript or shared contracts changed.
11. For the main transcript pass, prioritize getting useful current-schema watch points into the site over final polish. Use `needsFurtherProcessing=yes` for entries that should receive a later auditor cleanup, more granular follow-up, or additional transcript coverage. Use `no` only after full-duration inspection or when the file is intentionally closed without a site segment.
12. During first-pass work, split distinct subjects, arguments, and Q&A exchanges into separate watch points when evidence supports it. Structured episodes and streams should normally get 3-8 substantive segments before a later exhaustive revisit.
13. For granular revisits, split lecture material into major `chapter` and `notable_point` windows, and use `qa` only for transcript-visible questions with answers. Long live streams may need a targeted granular pass plus a later exhaustive live Q&A review.

## Public Wording

- Write `summary`, `body`, `question`, and `answerShort` for readers using a study guide, not for maintainers watching the workflow.
- Keep workflow terms out of public fields when they describe the site or content pipeline: avoid "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", "prototype", "this segment exists to", and similar scaffold language. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing.
- Use the processing log, task notes, or handoff message for incomplete-work status and follow-up needs.
- Make `body` meatier than a label. Prefer 2-4 concise sentences that explain the video moment's subject, the useful detail or argument, and any transcript-grounded caveat. For notable points, include the actual historical, technical, or strategic takeaway rather than saying the point is useful for browsing or search.
- Avoid creator-facing metrics, internal filenames, and raw inventory language in public text unless the user explicitly asks for an admin/debug view.
- It is fine for evidence notes to be short and factual, but public notes should still sound like study-guide prose.
- Prefer public labels such as `video guide`, `watch point`, `time note`, and `video moment`. Keep timestamp terminology for technical fields, evidence checks, and URLs rather than button, card, or headline copy.

## Processing Log

Use `src/derived/site-content-processing.log` as the append-only curation log. The file has no header: every non-empty line is one processed transcript file. The log is useful for backlog filtering, but public content lives in `src/derived/video-segments/`. If concurrent runs touch this file, reconcile it as bookkeeping after preserving the current-schema content shards.

Use tab-separated fields:

```text
processedAt	sourcePath	videoId	action	needsFurtherProcessing	determination
```

- `processedAt`: ISO 8601 timestamp with offset.
- `sourcePath`: repo-relative transcript TXT or TSV path.
- `videoId`: YouTube video ID.
- `action`: short note of what was done, for example `curated 4 segments`, `reviewed no usable segments`, or `blocked noisy transcript`.
- `needsFurtherProcessing`: `yes` or `no`.
- `determination`: short reason or follow-up note.

## Evidence Rules

- Every curated claim needs transcript evidence: video ID, timestamp, `sourcePath`, and a source passage.
- Keep summaries concise and search-friendly; put caveats in the body when the transcript is ambiguous.
- Preserve Dr. Alex's meaning, but do not overquote transcript text.
- Prefer a compact set of high-value segments per main pass, normally 3-8 for structured episodes or streams, over either exhaustive low-value slicing or a single broad note. Leave cleanup and expansion targets explicit through `needsFurtherProcessing=yes` rather than stalling the main pass for final polish.

## Handoff

- Mention the video ID, transcript path, segment count added, topics added, transcript coverage status, processing-log line added, and validation command.
- If a transcript is too noisy or incomplete, leave a dated task note under `task-notes/` with the blocker and the windows already inspected.
