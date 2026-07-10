---
name: naval-transcript-to-site-content
description: Convert one explicitly selected Dr. Alex Clarke transcript TXT into one segment-first per-video study-guide shard. Use when asked to process a named transcript, curate a named video guide, add transcript-backed chapters/notable points/Q&A watch points, or update `src/derived/video-segments/video-<videoId>.json`.
---

# Naval Transcript To Site Content

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when converting stored transcripts into site-visible segment data.

## Start

1. Read `AGENTS.md` and `.agents/transcript-content-curator.md`.
2. Before any shard edit, require an explicitly named transcript path or an exact transcript/video selected by the invoking automation. When the automation prompt defines its own atomic claim procedure, let that prompt perform the claim first. Otherwise, if no exact transcript was supplied, stop without edits; do not select from a backlog, schedule, report, manifest, or existing shard set.
3. Do not acquire, inspect, wait on, renew, or release a repository lease. Do not claim, complete, or reset schedule rows. An invoking automation owns any claim, lane log, private validation, completion, or reset procedure.
4. Verify required dependencies and compiled helpers only when the invoking workflow names them. If anything is missing, report the prerequisite and stop without edits; do not run `npm ci`, build tooling, audits, generation, or tests.
5. Read the selected `src/transcripts/txt/*.txt` file before editing site content. For long transcripts, map the full duration from its timestamped lines and read contiguous time-based chunks small enough to avoid tool-output truncation; do not rely on one raw full-file dump or only the opening portion.
6. Read `references/segment-seed-schema.md` before changing the selected shard.
7. Check `src/derived/site-content-processing.config.json` for first-pass content policy, video-type defaults, follow-up stages, and topic grouping guidance.

## Site Intent

- Treat the public site as a study guide for people learning naval history and how navies work, not as creator analytics, maintainer workflow, or raw transcript inventory.
- Help readers find concrete ships, classes, navies, battles, weapons, policies, doctrine, logistics, institutions, acronyms, time periods, and alternate wordings.
- Use segment summaries as watch points into Dr. Clarke videos: preview what the viewer will encounter, why that moment matters, and what naval-history or force-design question it helps answer.
- Prefer granular, separate segments over a thin video-level overview when the transcript has enough distinct material.
- Keep public fields free of creator metrics, internal filenames, processing status, raw inventory language, and developer-facing labels for video time markers unless the user asks for an admin/debug view.

## Curate

1. Inspect the full transcript for both subject segments and actual Q&A, regardless of source type or title. Identify useful chapters, notable points, short transcript excerpts, and every substantive transcript-visible prompt and response; do not defer Q&A wholesale to a later pass.
2. Add evidence-backed topic slugs directly to the video or segment `topics` arrays. Do not inspect or edit `topics.json` during routine curation; the repository owner's later build synchronizes missing registry records from the video shards. Investigate topics only when a previously reported synchronization or taxonomy problem explicitly requires it.
3. Add or update `src/derived/video-segments/video-<videoId>.json` for the selected transcript.
4. Add segment records with source-backed `start`, optional `end`, `sourcePath`, and `evidence`.
5. Use `kind: qa` only when the transcript contains an actual prompt and answer. Do not invent Q&A from lecture material.
6. Check the canonical source type before applying ordinary density guidance. The first-pass Q&A scan applies to recorded videos, interviews, premieres, and other non-live sources as well as live streams. Treat every live stream as mixed classroom-style content: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create one `kind: qa` record for every substantive prompt and response. Each Q&A record needs an accurate `start`, optional `end`, concise `question`, concise `answerShort`, and evidence.
7. Compare live-stream titles with `liveStreamExtraction.explicitQaTitleMarkers` in `src/derived/site-content-processing.config.json`. A marker match makes exhaustive Q&A extraction mandatory but does not force lecture portions into Q&A.
8. Keep `summary` concise, searchable, and useful as a watch pointer. Use `body` for reader-facing context, caveats, and why the segment matters.
9. Avoid long transcript quotes; paraphrase and cite the time window.
10. Do not write processing logs, schedules, reports, topic registries, generated archives, package files, tooling, Astro/CSS sources, or any file other than the selected per-video shard. An invoking automation may perform only its explicitly defined lane-private bookkeeping after this shard edit.
11. For the main transcript pass, do as much useful in-file processing as the configured model and effort can support across the full transcript. Favor coverage and transcript-backed substance over final wording polish, but do not stop at an overview, sample a subset, or deliberately reserve supported chapters or transcript-visible Q&A for a later audit. Use `needsFurtherProcessing=yes` when the lower-effort run genuinely leaves substantive chapter or Q&A coverage unresolved; use `no` only when the transcript was fully chaptered and Q&A was extracted, or the review intentionally closed the file without site content. Disclose remaining coverage in the processing log or handoff.
12. Let the transcript determine segment count for every video. Do not target a minimum, maximum, or preferred numeric range. Split when the subject, argument, example, or Q&A exchange meaningfully changes; avoid both broad catch-all notes and artificial padding.
13. Derive significant segment topic slugs from the transcript. Add evidence-backed slugs needed to describe ships, classes, navies, battles, weapons, policies, doctrine, logistics, people, places, and time periods without targeting a tag count or limiting the pass to a fixed starter taxonomy. Preserve useful specificity for the later auditor; leave registry creation, titles, default summaries, and routine consistency checks to the deterministic synchronizer.

Public fields must not expose workflow status. Do not put "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", "prototype", or "this segment exists to..." language in `summary`, `body`, `question`, or `answerShort` when it describes the site or content pipeline. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing. Put incomplete-work status in the processing log or handoff. Segment `body` should normally be 2-4 substantive sentences, especially for `chapter` and `notable_point` records, with concrete transcript-backed detail rather than a one-line label.

For public wording, prefer human study-guide terms such as `video guide`, `watch point`, `time note`, and `video moment`. Keep `timestamp` for technical fields, evidence ranges, source validation, and YouTube URL parameters rather than headline/button/card copy. A good public segment should answer: what subject is covered, what the viewer will learn there, and why that part of the video is worth opening.

## Runner Boundary

- Keep reusable site intent, public wording, and segment-density rules in this skill and `.agents/transcript-content-curator.md`.
- The normal processing unit is one transcript/video content shard per process run in the main working checkout. That is already isolated by design, so do not default to detached worktrees for routine transcript curation.
- A worktree is only useful for broad, risky, or unrelated code changes. For one transcript file -> one content shard, worktrees add merge and stale-state failure modes without much isolation benefit.
- Require the invoking task or automation to identify exactly one transcript and one owned current-schema shard. Do not choose work from a generic backlog or infer ownership from existing files.
- The skill itself edits only that shard. It does not acquire leases; inspect other active runs; claim schedules; append logs; generate reports or archives; synchronize shared topics; install dependencies; run tests, builds, audits, or validation; or complete/reset queue state.
- A schedule automation may separately own an atomic claim, lane-private log, video-specific temporary validation directory, and exact-row completion/reset. Follow those prompt-specific steps without widening them into shared pipeline work.
- Run scheduled transcript processing as a single-agent job. Do not use `ultra`, multi-agent mode, or subagents inside a claimed run. Scheduled workers must refuse `src/derived/prototype-segments.json`, write only the one owned current-schema shard, use only automation-prompt-owned private checks when supplied, and stop after the one claimed transcript.
- A transcript path or exact automation-claimed row is authoritative. A queue or schedule filename by itself does not select a shard; the invoking automation must perform its own atomic claim before this skill edits content.
- Main-pass curation and follow-up auditing are separate phases, but the main pass must exhaust the useful transcript-backed work it can perform at its configured model and effort. Do not trade coverage for exhaustive wording polish, and do not deliberately leave supported chapters or Q&A for the auditor. Use follow-up passes for content the lower-effort run genuinely missed, stronger-model review, or later substance and wording improvements; unfinished coverage remains `needsFurtherProcessing=yes`.

## Handoff

Report the video ID, transcript path, shard changed, segments added or changed, topic slugs introduced, transcript coverage status, and any remaining ranges. State that shared generation, logs, schedules, tests, builds, and validation were intentionally not touched by the skill. If an invoking automation performed lane-private bookkeeping or temporary checks, report only those prompt-owned results. If the transcript cannot be curated safely, report the blocker and inspected time windows without creating a shared task note.
