---
name: naval-transcript-to-site-content
description: Convert stored Dr. Alex Clarke transcript TXT/TSV evidence into segment-first study-guide content for this repository. Use when asked to process transcripts, curate video guides, add chapters/notable points/Q&A watch points, expand searchable topics, validate transcript evidence passages, or move transcript-backed material into `src/derived/video-segments/` and the Astro/Pagefind site.
---

# Naval Transcript To Site Content

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when converting stored transcripts into site-visible segment data.

## Start

1. Read `AGENTS.md` and `.agents/transcript-content-curator.md`.
2. Run `npm run audit:site-content` to validate current curation and generate `reports/site-content-backlog.md`.
3. Pick one transcript from the backlog unless the user named a specific video or transcript path.
4. Read the matching `src/transcripts/txt/*.txt` or `src/transcripts/tsv/*.tsv` file before editing site content.
5. Read `references/segment-seed-schema.md` before changing `src/derived/video-segments/`.
6. Check `src/derived/site-content-processing.config.json` for first-pass policy, video-type defaults, follow-up stages, and topic grouping guidance.

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
8. Append one line to `src/derived/site-content-processing.log` for the transcript file just processed. Read `references/processing-log.md` for the exact format. Treat log conflicts as recoverable bookkeeping; the per-video content file is the source of truth.
9. For partial first-pass work, use `needsFurtherProcessing=yes` unless the transcript was fully chaptered, Q&A was extracted, or the review intentionally closed the file without site content.
10. Do not stop at one broad overview when the transcript contains distinct subjects, arguments, examples, or Q&A exchanges. Add multiple focused watch points, normally 3-8 for structured episodes and streams when evidence supports them.

Public fields must not expose workflow status. Do not put "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", or "this segment exists to..." language in `summary`, `body`, `question`, or `answerShort`. Put incomplete-work status in the processing log or handoff. Segment `body` should normally be 2-4 substantive sentences, especially for `chapter` and `notable_point` records, with concrete transcript-backed detail rather than a one-line label.

For public wording, prefer human study-guide terms such as `video guide`, `watch point`, `time note`, and `video moment`. Keep `timestamp` for technical fields, evidence ranges, source validation, and YouTube URL parameters rather than headline/button/card copy. A good public segment should answer: what subject is covered, what the viewer will learn there, and why that part of the video is worth opening.

## Automation Boundary

- Keep reusable site intent, public wording, segment density, and validation rules in this skill and `.agents/transcript-content-curator.md`.
- Keep schedule-only mechanics in automation prompts: which queue file to claim from, dirty-tree/concurrency handling, one-transcript scope, pause-on-empty behavior, and commit/push policy.
- When an automation names a schedule file or transcript path, treat that as the user's selected input and do not replace it with the generic backlog choice.

## Validate

Run the content hook after curation:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
```

Run the full hook when TypeScript, schema, generator, or shared site behavior changed:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1
```

The hook writes `reports/site-content-backlog.md`, regenerates `site/src/data/generated/archive.json`, and checks the Astro site. Do not commit `reports/` or `site/dist/`.

## Handoff

Report the video ID, transcript path, segments added or changed, topics added, processing-log entry, and validation command. If a transcript cannot be curated safely, leave a dated Markdown note under `task-notes/` with the blocker and inspected time windows.
