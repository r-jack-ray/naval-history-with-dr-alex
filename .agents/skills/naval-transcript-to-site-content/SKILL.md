---
name: naval-transcript-to-site-content
description: Convert stored Dr. Alex Clarke transcript TXT/TSV evidence into segment-first study-guide content for this repository. Use when asked to process transcripts, curate video guides, add chapters/notable points/Q&A watch points, expand searchable topics, validate transcript evidence passages, or move transcript-backed material into `src/derived/video-segments/` and the Astro/Pagefind site.
---

# Naval Transcript To Site Content

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when converting stored transcripts into site-visible segment data.

## Start

1. Read `AGENTS.md` and `.agents/transcript-content-curator.md`.
2. For a scheduled run, acquire the persistent repository writer lease before dependency checks, queue claims, or content edits, then set `CONTENT_PIPELINE_LOCK_TOKEN` to its token so normal pipeline npm commands join the lease. If it is busy, report the lock status and stop without changing a schedule row or source file.
3. Verify local dependencies before content edits. If `node_modules/.bin/tsc.cmd` or the platform equivalent is missing in the active workspace, run `npm ci` before validation. If dependency installation or the first audit cannot run, release any lease and report the blocker without transcript-content edits.
4. Resolve the selected input. When the invoking task names a transcript path or schedule/queue row, treat it as authoritative, follow its claim timing, and do not replace it with a generic backlog candidate merely because existing content or log rows are present.
5. Only when no input was named, run `npm run audit:site-content` and pick one transcript from `reports/site-content-backlog.md`. For named inputs, still run the audit after claiming when the invoking workflow requires current context.
6. Read the matching `src/transcripts/txt/*.txt` or `src/transcripts/tsv/*.tsv` file before editing site content. For long transcripts, map the full duration from TSV timestamps and read contiguous time-based chunks small enough to avoid tool-output truncation; do not rely on one raw full-file dump or only the opening portion.
7. Read `references/segment-seed-schema.md` before changing `src/derived/video-segments/`.
8. Check `src/derived/site-content-processing.config.json` for first-pass policy, video-type defaults, follow-up stages, and topic grouping guidance.

## Site Intent

- Treat the public site as a study guide for people learning naval history and how navies work, not as creator analytics, maintainer workflow, or raw transcript inventory.
- Help readers find concrete ships, classes, navies, battles, weapons, policies, doctrine, logistics, institutions, acronyms, time periods, and alternate wordings.
- Use segment summaries as watch points into Dr. Clarke videos: preview what the viewer will encounter, why that moment matters, and what naval-history or force-design question it helps answer.
- Prefer granular, separate segments over a thin video-level overview when the transcript has enough distinct material.
- Keep public fields free of creator metrics, internal filenames, processing status, raw inventory language, and developer-facing labels for video time markers unless the user asks for an admin/debug view.

## Curate

1. Identify useful time windows: chapters, notable points, actual Q&A exchanges, or short transcript excerpts.
2. Add missing topic records before using new topic slugs.
3. Add or update `src/derived/video-segments/video-<videoId>.json` for the selected transcript.
4. Add segment records with source-backed `start`, optional `end`, `sourcePath`, and `evidence`.
5. Use `kind: qa` only when the transcript contains an actual prompt and answer. Do not invent Q&A from lecture material.
6. Keep `summary` concise, searchable, and useful as a watch pointer. Use `body` for reader-facing context, caveats, and why the segment matters.
7. Avoid long transcript quotes; paraphrase and cite the time window.
8. Append one line to `src/derived/site-content-processing.log` through `npm.cmd run append:site-content-processing-log -- --token <lease-token> ...`. Read `references/processing-log.md` for the exact format. The current-schema content shard remains the source of truth; do not direct-append the shared log.
9. For the main transcript pass, prioritize getting useful current-schema watch points into the site over final polish. Use `needsFurtherProcessing=yes` unless the full duration was inspected and the transcript was fully chaptered or Q&A was extracted, or the review intentionally closed the file without site content. Partial transcript coverage must remain `yes` and be disclosed in the processing log or handoff.
10. Do not stop at one broad overview when the transcript contains distinct subjects, arguments, examples, or Q&A exchanges. Add multiple focused watch points, normally 3-8 for structured episodes and streams when evidence supports them, then leave deeper cleanup or expansion for the auditor pass.

Public fields must not expose workflow status. Do not put "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", "prototype", or "this segment exists to..." language in `summary`, `body`, `question`, or `answerShort` when it describes the site or content pipeline. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing. Put incomplete-work status in the processing log or handoff. Segment `body` should normally be 2-4 substantive sentences, especially for `chapter` and `notable_point` records, with concrete transcript-backed detail rather than a one-line label.

For public wording, prefer human study-guide terms such as `video guide`, `watch point`, `time note`, and `video moment`. Keep `timestamp` for technical fields, evidence ranges, source validation, and YouTube URL parameters rather than headline/button/card copy. A good public segment should answer: what subject is covered, what the viewer will learn there, and why that part of the video is worth opening.

## Runner Boundary

- Keep reusable site intent, public wording, segment density, and validation rules in this skill and `.agents/transcript-content-curator.md`.
- The normal processing unit is one transcript/video content shard per process run in the main working checkout. That is already isolated by design, so do not default to detached worktrees for routine transcript curation.
- A worktree is only useful for broad, risky, or unrelated code changes. For one transcript file -> one content shard, worktrees add merge and stale-state failure modes without much isolation benefit.
- The processing log, generated backlog report, and generated archive are shared writer outputs. Acquire the persistent repository lease before a scheduled run claims a row; use its token for the log appender and validation hook.
- Independent schedule files are supported when each invocation claims exactly one transcript, runs locally in the main checkout, and owns one current-schema shard. The prohibited failure modes are detached-worktree curation, stale `src/derived/prototype-segments.json` edits, or two workers owning the same transcript/shard.
- Treat transcript processing as an explicit scoped run: one named transcript or one selected backlog item, its current-schema `src/derived/video-segments/video-<videoId>.json` shard, optional shared topic additions, one processing-log entry, generated archive regeneration, and validation. If the run fails before validation, release the lease explicitly; otherwise the validation hook releases it in `finally`. Clear `CONTENT_PIPELINE_LOCK_TOKEN` in the calling shell after validation returns.
- Run scheduled transcript processing as a single-agent job. Do not use `ultra`, multi-agent mode, or subagents inside a claimed run. Scheduled workers must refuse `src/derived/prototype-segments.json`, write only supported `src/derived/video-segments/` content, validate locally, and stop after the one claimed transcript.
- When a user names a task-note queue file or transcript path, treat that as the selected input and do not replace it with the generic backlog choice.
- Main-pass curation and follow-up auditing are separate phases. Do not stall the main pass trying to exhaustively polish every segment; produce useful transcript-backed content now and let `$naval-site-content-auditor` handle later substance, wording, and density passes.

## Validate

Run the content hook after curation:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck -LockToken <lease-token>
```

Run the full hook when TypeScript, schema, generator, or shared site behavior changed:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -LockToken <lease-token>
```

The hook writes `reports/site-content-backlog.md`, regenerates `site/src/data/generated/archive.json`, and checks the Astro site. Do not commit `reports/` or `site/dist/`.

## Handoff

Report the video ID, transcript path, segments added or changed, topics added, transcript coverage status, processing-log entry, and validation command. If a transcript cannot be curated safely, leave a dated Markdown note under `task-notes/` with the blocker and inspected time windows.
