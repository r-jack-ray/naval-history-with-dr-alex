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
- Curate into `src/derived/video-segments/video-<videoId>.json`. Add topic slugs to that shard; archive generation synchronizes shared records in `src/derived/video-segments/topics.json` without a routine AI editing step.
- Use `src/channel/episodes.json` and `src/channel/video-metadata.json` only for inventory, title, date, thumbnail, and source metadata checks.
- Use `src/derived/site-content-processing.config.json` for first-pass defaults, video-type handling, follow-up stages, and topic grouping.
- Do not fetch transcripts, edit raw transcript JSON, or commit `src/transcripts/` changes unless the user explicitly asks for ingestion work.

## Workflow

1. For a scheduled run, acquire the persistent repository writer lease before dependency checks, queue claims, or content edits, then set `CONTENT_PIPELINE_LOCK_TOKEN` to its token so normal pipeline npm commands join the lease. If the lease is busy, report its diagnostics and stop without changing a schedule row or source file.
2. Verify local dependencies before content edits. If `node_modules/.bin/tsc.cmd` or the platform equivalent is missing in the active workspace, run `npm ci` before validation. If dependency installation or the first audit cannot run, release any lease and report the blocker without transcript-content edits.
3. Resolve the input from the invoking task. A named transcript path or claimed schedule/queue row is authoritative; follow its claim timing and do not replace it with a generic backlog candidate merely because a shard or processing-log row already exists. For a schedule file, claim through `node .codex/hooks/site-content-pipeline-lock.mjs schedule-claim --schedule-path <schedule> --token <lease-token>`. This atomically changes `[ ]` to `[~]` or resumes the one existing `[~]` row.
4. Only when no input was named, run `npm run audit:site-content` and open `reports/site-content-backlog.md` to select the next stored transcript without curated segments. For named inputs, still run the audit after claiming when the invoking workflow requires current context.
5. Inspect the transcript TXT/TSV before writing summaries. For long transcripts, use TSV timestamps to map the full duration and read contiguous time-based chunks small enough to avoid tool-output truncation; do not rely on one raw full-file dump or only the opening portion.
6. Add or update the current-schema content shard under `src/derived/video-segments/`, normally `video-<videoId>.json` for the selected transcript. Treat that shard as the owned content artifact for this process run.
7. Add evidence-backed topic slugs to the video and segment arrays. Do not inspect or edit `topics.json` unless synchronization or validation reports a problem.
8. Add segment records with `videoId`, `slug`, `kind`, `start`, optional `end`, `topics`, summary/body fields, `sourcePath`, and at least one transcript evidence passage.
9. Use `kind: qa` only for actual question/answer exchanges. Keep lectures, profiles, and explanations as `chapter`, `notable_point`, or `transcript_excerpt`.
10. Append one line to `src/derived/site-content-processing.log` for each transcript file processed with `npm.cmd run append:site-content-processing-log -- --token <lease-token> ...`; do not write this shared file directly. It remains bookkeeping rather than the content source of truth.
11. Renew the writer lease after a long inspection and before any shared write with `node .codex/hooks/site-content-pipeline-lock.mjs renew --token <lease-token>`. For scheduled work, validate with `.codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck -LockToken <lease-token> -RetainCallerLease`, append the processing-log row, change the claimed row from `[~]` to `[x]` with `schedule-complete`, and then release the lease. On a handled failure, use `schedule-reset` before releasing; an interrupted `[~]` row is resumed by the next run. Run validation without `-SkipRepoCheck` when TypeScript or shared contracts changed.
12. For the main transcript pass, prioritize getting useful current-schema watch points into the site over final polish. Use `needsFurtherProcessing=yes` for entries that should receive a later auditor cleanup, more granular follow-up, or additional transcript coverage. Use `no` only after full-duration inspection plus complete substantive chaptering or Q&A extraction, or when the file is intentionally closed without a site segment. The flag is bookkeeping for separately managed follow-up passes.
13. Let segment count arise from the transcript for every video. Do not target a minimum, maximum, or preferred numeric range; split when the subject, argument, example, or exchange meaningfully changes, and avoid both broad catch-all notes and artificial padding.
14. Check the canonical source type in the channel inventory. Treat every live stream as mixed classroom-style content: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create a separate `kind: qa` segment for every substantive transcript-visible prompt and response. Each Q&A needs its own `start`, optional `end`, `question`, `answerShort`, and evidence.
15. Compare the canonical title with `liveStreamExtraction.explicitQaTitleMarkers` in the processing config. A matching title makes exhaustive Q&A extraction especially explicit, but it does not erase lecture material; retain substantive lecture portions under their proper segment kinds.
16. If a live-stream run cannot complete full-duration mixed-content extraction, keep `needsFurtherProcessing=yes` and state the remaining coverage in the processing log or handoff.
17. Derive significant segment topic slugs from the transcript as content is extracted. Add every evidence-backed slug needed for discovery and understanding, without targeting a tag count or restricting the pass to a starter taxonomy. The deterministic synchronizer handles routine registry creation and consistency; investigate synonym or taxonomy issues only when validation finds a problem.

## Public Wording

- Write `summary`, `body`, `question`, and `answerShort` for readers using a study guide, not for maintainers watching the workflow.
- Keep workflow terms out of public fields when they describe the site or content pipeline: avoid "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", "prototype", "this segment exists to", and similar scaffold language. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing.
- Use the processing log, task notes, or handoff message for incomplete-work status and follow-up needs.
- Make `body` meatier than a label. Prefer 2-4 concise sentences that explain the video moment's subject, the useful detail or argument, and any transcript-grounded caveat. For notable points, include the actual historical, technical, or strategic takeaway rather than saying the point is useful for browsing or search.
- Avoid creator-facing metrics, internal filenames, and raw inventory language in public text unless the user explicitly asks for an admin/debug view.
- It is fine for evidence notes to be short and factual, but public notes should still sound like study-guide prose.
- Prefer public labels such as `video guide`, `watch point`, `time note`, and `video moment`. Keep timestamp terminology for technical fields, evidence checks, and URLs rather than button, card, or headline copy.

## Processing Log

Use `src/derived/site-content-processing.log` as the append-only curation log. The file has no header: every non-empty line is one processed transcript file. The log is useful for backlog filtering, but public content lives in `src/derived/video-segments/`. The repository writer lease serializes log updates, so a scheduled run must not direct-append or reconcile concurrent log churn.

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
- Let the transcript determine the number of useful segments. Use substantive changes in subject, argument, example, or Q&A exchange as boundaries; do not compress distinct material into one note or create filler to reach a quota. For live streams, preserve lecture blocks and extract every substantive Q&A exchange across the full duration. Leave unfinished coverage explicit through `needsFurtherProcessing=yes` rather than calling a sampled live-stream set complete.
- Let significant topics arise from the extracted content. Prefer an evidence-backed specific slug over omitting a useful discovery path. Leave registry generation to the synchronizer and reserve synonym or near-duplicate work for reported taxonomy problems.

## Handoff

- Mention the video ID, transcript path, segment count added, topic slugs introduced in the shard, transcript coverage status, processing-log line added, and validation command. Mention the registry only if synchronization failed.
- If a transcript is too noisy or incomplete, leave a dated task note under `task-notes/` with the blocker and the windows already inspected.
