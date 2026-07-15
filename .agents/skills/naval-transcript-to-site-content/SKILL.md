---
name: naval-transcript-to-site-content
description: Convert one explicitly selected Dr. Alex Clarke transcript TXT into one segment-first per-video study-guide shard about naval history and materially related general history. Use when asked to process a named transcript, curate a named video guide, add transcript-backed chapters/notable points/Q&A watch points, cover related subjects such as aircraft, land battles, railways, and land logistics, or update its manifest-owned file under `src/derived/video-segments/`.
---

# Naval Transcript To Site Content

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when converting stored transcripts into site-visible segment data.

## Start

1. Read `AGENTS.md` and `.agents/transcript-content-curator.md`.
2. Before any shard edit, require an explicitly named transcript path or an exact transcript/video selected by the invoking automation. When the automation prompt defines its own atomic claim procedure, let that prompt perform the claim first. Otherwise, if no exact transcript was supplied, stop without edits; do not select from a backlog, schedule, report, manifest, or existing shard set.
3. Do not acquire, inspect, wait on, renew, or release a repository lease. Do not claim, complete, or reset schedule rows. An invoking automation owns any claim, lane log, private validation, completion, or reset procedure.
4. Verify required dependencies and compiled helpers only when the invoking workflow names them. If anything is missing, report the prerequisite and stop without edits; do not run `npm ci`, build tooling, audits, generation, or tests.
5. Read the selected `src/transcripts/txt/*.txt` file before editing site content. For long transcripts, map the full duration from its timestamped lines and read contiguous time-based chunks small enough to avoid tool-output truncation; do not rely on one raw full-file dump or only the opening portion.
   - Keep transcript reads antivirus-safe. Never build or run a multi-range timestamp extractor as an inline PowerShell `-Command`. Do not stream the full file through `ForEach-Object` or `foreach` while using regex timestamp parsing, range arrays, command-line variables, or a command-line output-encoding prelude. Do not encode, obfuscate, or move equivalent dynamic logic into an ad hoc script.
   - Read sequentially with separate, simple commands. Locate a known timestamp with `rg -n --fixed-strings` when useful, then read one contiguous line slice at a time with a literal path and numeric constants, for example `Get-Content -LiteralPath '<transcript>' | Select-Object -Skip <line> -First <count>`. If endpoint protection blocks a read, stop and report the blocked command pattern; do not retry it in another dynamic form.
6. Read `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md` before changing the selected shard.
7. Check `src/derived/site-content-processing.config.json` for first-pass content policy, video-type defaults, follow-up stages, and topic grouping guidance.

## Site Intent

- Treat the public site as a study guide for people learning naval history, its wider historical context, and how navies work, not as creator analytics, maintainer workflow, or raw transcript inventory.
- Include general history when it materially contextualizes or intersects with naval history. Aircraft and aviation, land battles and campaigns, railways and trains, and land logistics are in scope when they affect maritime strategy, naval operations, sea power, fleets, ports, amphibious warfare, coastal defense, procurement, or naval institutions. Do not require every segment to center on ships, but do not include unrelated general history solely because it appears in the transcript.
- Help readers find concrete ships, classes, navies, aircraft, armies, battles, campaigns, weapons, railways, ports, supply systems, policies, doctrine, logistics, institutions, acronyms, time periods, and alternate wordings.
- Use segment summaries as watch points into Dr. Clarke videos: preview what the viewer will encounter, why that moment matters, and what naval-history, related-history, or force-design question it helps answer. Explain the connection to naval history when that connection is not obvious.
- Prefer granular, separate segments over a thin video-level overview when the transcript has enough distinct material.
- Keep public fields free of creator metrics, internal filenames, processing status, raw inventory language, and developer-facing labels for video time markers unless the user asks for an admin/debug view.

## Curate

1. Inspect the full transcript for both subject segments and actual Q&A, regardless of source type or title. Identify useful chapters, notable points, short transcript excerpts, and every substantive transcript-visible prompt and response; do not defer Q&A wholesale to a later pass. Preserve materially connected aviation, land warfare, transport, industrial, political, and logistical history rather than excluding it merely because its immediate subject is not a navy or ship.
2. Add evidence-backed topic slugs directly to the video or segment `topics` arrays. Do not inspect or edit `topics.json` during routine curation; the repository owner's later build synchronizes missing registry records from the video shards. Investigate topics only when a previously reported synchronization or taxonomy problem explicitly requires it.
3. Add or update `src/derived/video-segments/<manifest.fileStem>.json` for the selected transcript. Use its stored manifest `fileStem` exactly: the selected transcript TXT basename must equal `<fileStem>.txt`, and current video title or publish metadata must not be used to synthesize a new filename.
4. Add segment records with source-backed `start`, optional `end`, `sourcePath`, and `evidence`.
5. Use `kind: qa` only when the transcript contains an actual prompt and answer. Do not invent Q&A from lecture material.
6. Check the canonical source type before applying ordinary density guidance. The first-pass Q&A scan applies to recorded videos, interviews, premieres, and other non-live sources as well as live streams. Treat every live stream as mixed classroom-style content: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create one `kind: qa` record for every substantive prompt and response. Each Q&A record needs an accurate `start`, optional `end`, concise `question`, concise `answerShort`, and evidence.
7. Compare live-stream titles with `liveStreamExtraction.explicitQaTitleMarkers` in `src/derived/site-content-processing.config.json`. A marker match makes exhaustive Q&A extraction mandatory but does not force lecture portions into Q&A.
8. Keep `summary` concise, searchable, and useful as a watch pointer. Use `body` for reader-facing context, caveats, and why the segment matters.
9. Avoid long transcript quotes; paraphrase and cite the time window.
10. After successfully writing the selected shard, append exactly one newline-terminated, semicolon-separated data line after the current final line at the physical bottom of the existing `src/derived/site-content-processing.log`. Never prepend the entry or insert it beneath the header. Use the synchronized logging contract below. Keep workflow status in the log rather than in public shard fields. Do not write schedules, reports, topic registries, generated archives, package files, tooling, Astro/CSS sources, or any other file. An invoking automation may perform only its explicitly defined lane-private bookkeeping after this shard edit.
11. For the main transcript pass, do as much useful in-file processing as the configured model and effort can support across the full transcript. Favor coverage and transcript-backed substance over final wording polish, but do not stop at an overview, sample a subset, or deliberately reserve supported chapters or transcript-visible Q&A for a later audit. Use `needsFurtherProcessing=yes` when the lower-effort run genuinely leaves substantive chapter or Q&A coverage unresolved; use `no` only when the transcript was fully chaptered and Q&A was extracted, or the review intentionally closed the file without site content. Disclose remaining coverage in the processing log or handoff.
12. Let the transcript determine segment count for every video. Do not target a minimum, maximum, or preferred numeric range. Split when the subject, argument, example, or Q&A exchange meaningfully changes; avoid both broad catch-all notes and artificial padding.
13. Derive significant segment topic slugs from the transcript. Add evidence-backed slugs needed to describe ships, classes, navies, aircraft, armies, battles, campaigns, weapons, railways, ports, supply systems, policies, doctrine, logistics, people, places, and time periods without targeting a tag count or limiting the pass to a fixed starter taxonomy. Preserve useful specificity for the later auditor; leave registry creation, titles, default summaries, and routine consistency checks to the deterministic synchronizer.

Public fields must not expose workflow status. Do not put "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", "prototype", or "this segment exists to..." language in `summary`, `body`, `question`, or `answerShort` when it describes the site or content pipeline. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing. Put incomplete-work status in the processing log or handoff. Segment `body` should normally be 4-10 substantive sentences, especially for `chapter` and `notable_point` records, with concrete transcript-backed detail rather than a one-line label.

## Processing Log Contract

- Before appending, read and verify that the existing first line is exactly `timestamp;shardPath;result;needsFurtherProcessing;notes`. If the file or header is missing or invalid, stop and report the blocker instead of creating or repairing the log.
- Construct the row as exactly five field values in this order: local timestamp formatted `yyyy-MM-ddTHH:mm:ss` without timezone or UTC offset; canonical shard path; concise result; the bare lowercase value `yes` or `no`; concise notes. Field four must be exactly `yes` or exactly `no`. Never write a label in that field: `needsFurtherProcessing no`, `needsFurtherProcessing=no`, and `needsFurtherProcessing yes` are malformed.
- Use this low-freedom PowerShell pattern, supplying the five variables with the actual curation result:

  ```powershell
  $timestamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  $fields = @($timestamp, $shardPath, $result, $needsFurtherProcessing, $notes)
  if ($fields.Count -ne 5 -or $fields.Where({ [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) { throw 'Processing-log row requires five nonempty fields.' }
  if ($needsFurtherProcessing -notin @('yes', 'no')) { throw 'Processing-log field four must be exactly yes or no.' }
  if ($fields.Where({ $_ -match '[;\r\n]' }).Count -gt 0) { throw 'Processing-log fields must not contain semicolons or line breaks.' }
  $line = $fields -join ';'
  Add-Content -LiteralPath 'src/derived/site-content-processing.log' -Value $line -Encoding utf8
  ```

- Do not put semicolons or line breaks inside field values; use commas when internal punctuation is needed. Before appending, confirm `$line.Split(';').Count -eq 5`. A valid row resembles `2026-07-15T16:10:20;src/derived/video-segments/<manifest.fileStem>.json;12 records added;no;Full transcript chaptered and answered Q&A covered`.
- `shardPath` must be `src/derived/video-segments/<manifest.fileStem>.json`, matching the shard written by this skill, not the transcript TXT path or a generated Markdown path. Do not add a separate video-ID field because the manifest-owned shard filename already contains the video ID.
- Never use `Set-Content`, `WriteAllText`, output redirection, or any read-modify-rewrite operation for routine logging; never truncate, recreate, replace, remove, or reorder existing log content.

For public wording, prefer human study-guide terms such as `video guide`, `watch point`, `time note`, and `video moment`. Keep `timestamp` for technical fields, evidence ranges, source validation, and YouTube URL parameters rather than headline/button/card copy. A good public segment should answer: what subject is covered, what the viewer will learn there, and why that part of the video is worth opening.

## Runner Boundary

- Keep reusable site intent, public wording, and segment-density rules in this skill and `.agents/transcript-content-curator.md`.
- The normal processing unit is one transcript/video content shard per process run in the main working checkout. That is already isolated by design, so do not default to detached worktrees for routine transcript curation.
- A worktree is only useful for broad, risky, or unrelated code changes. For one transcript file -> one content shard, worktrees add merge and stale-state failure modes without much isolation benefit.
- Require the invoking task or automation to identify exactly one transcript and one owned current-schema shard. Do not choose work from a generic backlog or infer ownership from existing files.
- The skill itself edits only that shard and appends its one required result line to `src/derived/site-content-processing.log`. It does not acquire leases; inspect other active runs; claim schedules; generate reports or archives; synchronize shared topics; install dependencies; run tests, builds, audits, or validation; or complete/reset queue state.
- A schedule automation may separately own an atomic claim, lane-private log, video-specific temporary validation directory, and exact-row completion/reset. Follow those prompt-specific steps without widening them into shared pipeline work.
- Run scheduled transcript processing as a single-agent job. Do not use `ultra`, multi-agent mode, or subagents inside a claimed run. Scheduled workers must refuse `src/derived/prototype-segments.json`, write only the one owned current-schema shard, use only automation-prompt-owned private checks when supplied, and stop after the one claimed transcript.
- A transcript path or exact automation-claimed row is authoritative. A queue or schedule filename by itself does not select a shard; the invoking automation must perform its own atomic claim before this skill edits content.
- Main-pass curation and follow-up auditing are separate phases, but the main pass must exhaust the useful transcript-backed work it can perform at its configured model and effort. Do not trade coverage for exhaustive wording polish, and do not deliberately leave supported chapters or Q&A for the auditor. Use follow-up passes for content the lower-effort run genuinely missed, stronger-model review, or later substance and wording improvements; unfinished coverage remains `needsFurtherProcessing=yes`.

## Handoff

Report the video ID, transcript path, shard changed, segments added or changed, topic slugs introduced, transcript coverage status, the processing-log line appended, and any remaining ranges. State that shared generation, schedules, tests, builds, and validation were intentionally not touched by the skill. If an invoking automation performed lane-private bookkeeping or temporary checks, report only those prompt-owned results. If the transcript cannot be curated safely, report the blocker and inspected time windows without creating a shared task note or appending a success line.
