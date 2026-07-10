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
- Curate only the explicitly selected `src/derived/video-segments/video-<videoId>.json` shard. Add topic slugs to that shard; the repository owner's later build synchronizes shared records without a routine AI editing step.
- Use `src/channel/episodes.json` and `src/channel/video-metadata.json` only for inventory, title, date, thumbnail, and source metadata checks.
- Use `src/derived/site-content-processing.config.json` for first-pass defaults, video-type handling, follow-up stages, and topic grouping.
- Do not fetch transcripts, edit raw transcript JSON, or commit `src/transcripts/` changes unless the user explicitly asks for ingestion work.

## Workflow

1. Before any shard edit, require an explicitly named transcript path or an exact transcript/video selected by the invoking automation. When the automation prompt defines its own atomic claim procedure, let that prompt perform the claim first. Otherwise, if no exact transcript was supplied, stop without edits; do not select from a backlog, schedule, report, manifest, or existing shard set.
2. Do not acquire, inspect, wait on, renew, or release repository leases. Do not claim, complete, or reset schedule rows. An invoking automation owns any claim, lane log, private validation, completion, or reset procedure.
3. If required dependencies or compiled helpers are missing, report the prerequisite and stop without edits. Do not install dependencies, build tooling, run audits, or generate shared output.
4. Inspect the selected transcript TXT/TSV before writing summaries. For long transcripts, use TSV timestamps to map the full duration and read contiguous time-based chunks small enough to avoid tool-output truncation; do not rely on one raw full-file dump or only the opening portion.
5. Add or update only the selected current-schema `video-<videoId>.json` shard. Preserve every other shard and all shared or generated files.
6. Add evidence-backed topic slugs to the video and segment arrays. Do not inspect or edit `topics.json`; the repository owner's later build synchronizes the registry.
7. Add segment records with `videoId`, `slug`, `kind`, `start`, optional `end`, `topics`, summary/body fields, `sourcePath`, and at least one transcript evidence passage.
8. Use `kind: qa` only for actual question/answer exchanges. Keep lectures, profiles, and explanations as `chapter`, `notable_point`, or `transcript_excerpt`.
9. Do not write processing logs, schedules, reports, the topic registry, generated archives, package files, tooling, Astro/CSS sources, or any file other than the selected shard. Do not run repository-wide generation, tests, builds, audits, or validation commands.
10. For the main transcript pass, prioritize useful current-schema watch points over final polish. Report `needsFurtherProcessing=yes` unless full-duration inspection and complete substantive chaptering or Q&A extraction support `no`, or the file is intentionally closed without a site segment.
11. Let segment count arise from the transcript. Do not target a minimum, maximum, or preferred numeric range; split when the subject, argument, example, or exchange meaningfully changes, and avoid broad catch-all notes and artificial padding.
12. Check the canonical source type in the channel inventory. Treat every live stream as mixed classroom-style content: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create a separate `kind: qa` segment for every substantive transcript-visible prompt and response. Each Q&A needs its own `start`, optional `end`, `question`, `answerShort`, and evidence.
13. Compare the canonical title with `liveStreamExtraction.explicitQaTitleMarkers` in the processing config. A matching title makes exhaustive Q&A extraction explicit but does not erase lecture material.
14. If a live-stream run cannot complete full-duration mixed-content extraction, report `needsFurtherProcessing=yes` and state the remaining coverage in the handoff.
15. Derive significant segment topic slugs from the transcript without targeting a tag count or restricting the pass to a starter taxonomy. Investigate synonym or taxonomy issues only when the repository owner's later synchronization reports a concrete problem.

## Public Wording

- Write `summary`, `body`, `question`, and `answerShort` for readers using a study guide, not for maintainers watching the workflow.
- Keep workflow terms out of public fields when they describe the site or content pipeline: avoid "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", "prototype", "this segment exists to", and similar scaffold language. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing.
- Use the processing log, task notes, or handoff message for incomplete-work status and follow-up needs.
- Make `body` meatier than a label. Prefer 2-4 concise sentences that explain the video moment's subject, the useful detail or argument, and any transcript-grounded caveat. For notable points, include the actual historical, technical, or strategic takeaway rather than saying the point is useful for browsing or search.
- Avoid creator-facing metrics, internal filenames, and raw inventory language in public text unless the user explicitly asks for an admin/debug view.
- It is fine for evidence notes to be short and factual, but public notes should still sound like study-guide prose.
- Prefer public labels such as `video guide`, `watch point`, `time note`, and `video moment`. Keep timestamp terminology for technical fields, evidence checks, and URLs rather than button, card, or headline copy.

## Shared-Output Boundary

- Edit only the selected per-video shard.
- Do not touch leases, schedules, processing logs, reports, `topics.json`, generated archives, `site/dist/`, package files, tooling, Astro/CSS sources, or other shards.
- Do not run `npm ci`, builds, audits, generation, tests, Pagefind, or shared validation.
- The repository owner performs shared integration work before push. A lane automation may separately perform only the claim, lane-private log, temporary validation, and exact completion/reset steps defined in its own prompt.

## Evidence Rules

- Every curated claim needs transcript evidence: video ID, timestamp, `sourcePath`, and a source passage.
- Keep summaries concise and search-friendly; put caveats in the body when the transcript is ambiguous.
- Preserve Dr. Alex's meaning, but do not overquote transcript text.
- Let the transcript determine the number of useful segments. Use substantive changes in subject, argument, example, or Q&A exchange as boundaries; do not compress distinct material into one note or create filler to reach a quota. For live streams, preserve lecture blocks and extract every substantive Q&A exchange across the full duration. Leave unfinished coverage explicit through `needsFurtherProcessing=yes` rather than calling a sampled live-stream set complete.
- Let significant topics arise from the extracted content. Prefer an evidence-backed specific slug over omitting a useful discovery path. Leave registry generation to the synchronizer and reserve synonym or near-duplicate work for reported taxonomy problems.

## Handoff

- Mention the video ID, transcript path, shard changed, segment count added, topic slugs introduced, transcript coverage status, and remaining ranges. State that shared generation, logs, schedules, tests, builds, and validation were intentionally not touched.
- If an invoking automation performed lane-private bookkeeping or temporary checks, report only those prompt-owned results. If a transcript is too noisy or incomplete, report the blocker and inspected windows without creating a shared task note.
