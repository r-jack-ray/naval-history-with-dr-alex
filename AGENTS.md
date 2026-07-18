# Repository Guidelines

## Project Structure & Module Organization

Static reference archive for Dr. Alex Clarke's YouTube channel. Keep source data under `src/`, curated Markdown under `docs/`, site/search output under `site/`, reports under `reports/`, and planning notes under `task-notes/`.

Planned source layout:

- `src/channel/`: channel inventory, playlists, video IDs, dates, and transcript states.
- `src/transcripts/txt/`: stored timestamped plain-text transcripts, the transcript source of record.
- `src/derived/video-segments/`: source-of-truth curated site content, with `topics.json` plus one `<manifest.fileStem>.json` file per video. Use the stored `fileStem` from `src/transcripts/manifest.json`; do not recompute it from current metadata.
- `src/derived/topic-normalization-patterns.tsv`: manually curated steady-state policy for topic creation, display names, aliases, and exceptions.
- `src/derived/`: other generated or supporting derived data.
- `src/site/`: deterministic site-data generator and tests.
- `docs/videos/`: one primary Markdown page per video.
- `site/src/data/generated/archive/`: tracked, generated Astro-facing archive manifest and JSON shards.
- `site/dist/pagefind/`: generated Pagefind index, ignored by Git.

## Site Intent

Treat the public site as a learner-oriented study guide for Dr. Alex Clarke's videos, not as creator analytics, maintainer workflow, or raw inventory.

The site should help visitors:

- Learn how navies work: institutions, doctrine, procurement, logistics, technology, force structure, and operational tradeoffs.
- Learn naval history through concrete ships, battles, navies, wars, people, policies, and design choices.
- Decide which Dr. Clarke video moment to watch by reading a short pointer summary that explains what they will see or hear there.
- Search effectively for ships, classes, navies, battles, weapons, acronyms, time periods, concepts, and alternate wordings.
- Dive deeply through many separate, substantive time notes rather than one broad note per video.

Public pages should privilege subject discovery, direct video jumps, and learning value. Avoid foregrounding YouTube creator metrics, internal filenames, transcript-processing status, or implementation details unless a user explicitly asks for an admin/debug view.

## Build, Test, and Development Commands

Use Node 22+ and TypeScript.

```bash
npm run build
npm run check:types
npm test
npm run check
npm run audit:site-content
npm run generate:site-data
npm run site:check
npm run site:build
npm run sync:video-topics
npm run fetch:video-links -- --master-output src/channel/episodes.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
npm run alternate:fetch:transcript -- --video-id uURe69Wnh-Q
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
```

Do not run Git commands as routine preflight, status, boundary, or validation checks. Prefer direct file inspection, targeted searches, parsers, and the relevant project validators so unnecessary Git output does not consume time or context. Run Git only when the user explicitly requests a Git operation or when a specific overlapping edit cannot otherwise be resolved safely. When Git is genuinely needed, use the narrowest read-only command first. Never commit or push unless the user explicitly requests it.

On Windows, do not launch the roaming `npm` shim from repository Node wrappers: on this machine it resolves a missing `C:\Users\JR\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js`. Direct `spawn()` of `npm.cmd` can also fail with `EINVAL`. Resolve `npm.cmd` beside `process.execPath` and invoke that fixed command through the system shell; for interactive validation, use `C:\Program Files\nodejs\npm.cmd` directly when plain `npm` hits the broken shim.

`build` emits `dist/`; `check:types` type-checks only; `test` compiles and runs Node's test runner; `check` combines both. `audit:site-content` validates curated transcript evidence and writes `reports/site-content-backlog.md`. `generate:site-data` writes deterministic Astro data under `site/src/data/generated/archive/`, with `index.json` as the authoritative manifest for the generated files. Never hand-edit that tracked generated dataset. `site:build` fingerprints the generator and site inputs, validates every manifest-listed archive file and SHA-256 before skipping generation, uses ignored `.tmp/` caches to skip unchanged archive, Astro, and Pagefind stages, and performs the required stages when inputs or outputs change; use `npm run site:build -- --force` to bypass both caches. Official YouTube Data API tasks default to one second between requests; alternate transcript fetches default to five seconds.

Full `site:build`, `site:build:generated`, and `site:build:full` runs now traverse more than 50,000 HTML pages and can take well over three minutes, especially during Pagefind. Agent-run commands must allow at least 15 minutes (900,000 ms) before timing out and should treat several minutes of silence from `astro build --silent` as normal; do not kill and restart a build solely because it has not emitted recent output.

## Coding Style & Naming Conventions

Use TypeScript under `src/**/*.ts`, Markdown for curated content, and JSON for inventories. Keep filenames lowercase and hyphenated, for example `docs/videos/battle-of-jutland-overview.md`. Use timestamp-first task notes matching `yyyy-MM-dd_THH-mm-ss-0500_short-topic.md`.

Transcript and episode file stems should use `timestamp_title-slug_videoId` when an exact timestamp is known, otherwise `title-slug_videoId`; keep the video ID suffix.

The core content model is `segment`, not `question`. Valid segment kinds include `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`. Do not force ordinary lecture segments into fabricated Q&A.

Keep Q&A as `kind: qa` segment data unless a future layout/search requirement proves a separate collection is needed.

When processing transcripts into site content, use `.agents/transcript-content-curator.md` and `$naval-transcript-to-site-content`. This skill is shard-only except for its required processing-log append: the invoking user or automation must identify exactly one transcript and one owned `src/derived/video-segments/<manifest.fileStem>.json` shard. The selected transcript's manifest record is authoritative: its TXT basename must equal `<fileStem>.txt`, and the shard uses that same stored stem with `.json`; never synthesize a shard name from current title metadata. After a successful shard write, the skill must append exactly one result line at the physical bottom of `src/derived/site-content-processing.log`. It must not select work from a backlog, manifest, report, schedule, or shard directory; acquire or inspect leases; claim or complete schedule rows; install dependencies; write reports, topics, archives, package files, tooling, Astro/CSS sources, or other shards; or run repository-wide generation, tests, builds, audits, or validation. Keep `sourcePath` and transcript evidence on every segment. Video-level `topics` are a concise summary subset for the video page, while segment-level topics may be more granular. Add evidence-backed topic slugs only to the owned shard; the repository owner's later build synchronizes the shared registry and performs integration checks before push. A lane automation may separately own only the atomic claim, lane-private log, video-specific temporary checks, and exact completion/reset defined in its prompt. Scheduled transcript processing remains single-agent work: do not use `ultra`, multi-agent mode, or subagents inside a claimed transcript run.

Schedules, reports, generated archives, and logs other than `src/derived/site-content-processing.log` are coordinator-owned shared outputs, not shard-worker outputs. The transcript consumer appends exactly one result line to the bottom of that processing log after a successful shard write. The content auditor appends exactly one result line after every completed audit of a selected shard, including audits that leave the shard unchanged, find it saturated, or confirm an intentionally empty shard; it omits the line only when no exact file was supplied or a blocker stopped the audit before that file was processed. A lane automation may also write only its explicitly named lane-private log and schedule state. Use `src/derived/site-content-processing.config.json` read-only for first-pass content defaults, video-type handling, follow-up stages, and topic grouping.

For first-pass work, do as much useful in-file processing as the configured model and effort can support across the full transcript. Inspect every transcript for both subject segments and transcript-visible Q&A, regardless of source type or title. Preserve substantive chapters and notable points, and create a separate `kind: qa` segment for every substantive prompt and response; do not stop at an overview, sample a subset, or deliberately reserve supported content for a later pass. Report `needsFurtherProcessing=no` only after all substantive chapters and Q&A were captured, or when the transcript is intentionally closed without usable public content. A lower-effort run may legitimately leave `needsFurtherProcessing=yes`, but full-duration inspection by itself is not a completion determination. Record that determination in the skill's required processing-log append so a coordinating automation or repository owner can consume it.

Let segment count arise from the transcript for every video; do not target a minimum, maximum, or preferred numeric range. Split when the subject, argument, example, or exchange meaningfully changes, and avoid both broad catch-all notes and artificial padding. Treat live streams as mixed classroom-style content, not as one generic format segment: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create a separate `kind: qa` segment for every substantive transcript-visible prompt and response, with its own `start`, optional `end`, `question`, and `answerShort`. Explicit title markers such as `Q&A`, `Q & A`, `Questions Answered`, or `Question and Answer` make exhaustive Q&A extraction mandatory; a sampled subset must keep `needsFurtherProcessing=yes` and must not be described as complete.

Let significant segment topics arise from transcript content rather than a fixed tag quota or starter list. During transcript and higher-effort content passes, add evidence-backed topic slugs to the video shard while deepening or splitting content; do not spend model effort maintaining the shared registry. The deterministic topic synchronizer materializes missing records and the test suite checks its behavior. Outside active normalization rules, consolidate synonyms, near-duplicates, or aliases only when validation reveals a taxonomy problem or the user explicitly requests taxonomy work. Keep each video's topic list as a concise summary subset. Repeat focused content passes while substantive transcript-backed learning value remains absent from the pages.

Use `src/derived/topic-normalization-patterns.tsv` as the detailed source of truth for steady-state topic creation, display, alias, and exception policy. The curator and auditor read it but do not edit it: they resolve new slugs through active `creation` rules, preserve established slugs unless the active creation policy canonicalizes them, and leave `review`, disabled, or ambiguous candidates unchanged for the handoff. They must not edit `topics.json`, another shard, generated data, or shared validation output, and must not perform corpus-wide topic rewrites from a shard-only workflow.

Do not treat a pass number as proof of completion. Each high-effort content-exhaustion review must independently compare the full transcript with the current shard and add genuinely missing chapters, arguments, examples, Q&A exchanges, context, and topics. If a pass only churns wording or structure without adding transcript-backed substance, mark that specific model-and-effort configuration as saturated and stop repeating it. Saturation is not permanent completion: keep the transcript eligible for another review when a materially stronger model, higher effort level, improved method, or new evidence becomes available. Configure model and effort in the invoking runtime rather than pinning a version here.

Public `summary`, `body`, `question`, and `answerShort` text must read as user-facing study-guide notes, not workflow status. Do not expose phrases such as "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", or "prototype" in public fields when they describe site workflow or content scaffolding. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing. Keep workflow details in logs, task notes, and handoffs. Segment `body` text should usually be 4-10 substantive sentences that explain what the video moment covers, why it matters, and any important caveat grounded in the transcript.

Segment titles and summaries should work as watch points: a reader should understand the naval subject, the likely learning payoff, and why opening the video at that time is useful. When transcript evidence supports it, prefer multiple focused segments over a sparse overview so topic pages and search results can send readers to precise moments.

For follow-up quality passes, use `.agents/site-content-auditor.md` and `$naval-site-content-auditor`. This audit pass requires an explicitly selected `<manifest.fileStem>.json` shard and must stop without edits when none is supplied. It adds transcript-backed substance when supported and, after processing the selected shard, appends exactly one result line at the physical bottom of `src/derived/site-content-processing.log`, even when the shard remains unchanged, is saturated, or is intentionally empty. It must not run repository-wide generation, tests, Astro/Pagefind builds, or shared validation, and it must not edit any other shared or generated outputs. The repository owner performs those integration checks before push.

## Testing Guidelines

Use Node's built-in test runner with `*.test.ts` files. Validators should check timestamp labels and links, transcript sources, inventory references, search manifest integrity, generated site-data references, duplicate routes, topic references, curation backlog state, transcript evidence passages, and TXT coverage. Add search tests for ship names, battles, classes, operations, admirals, countries, dates, and abbreviations.

## Commit & Pull Request Guidelines

History uses concise imperative commits. Keep commits scoped. PRs should explain changes, rationale, validation, and known transcript/tooling gaps.

## Agent-Specific Instructions

Treat this repository's `AGENTS.md`, `.agents/` briefs, and `.agents/skills/` as the authoritative setup guidance. Do not consult or modify sibling repositories unless the user explicitly requests it.

For Astro/Pagefind page, route, search, or generated-data adapter work, use `.agents/site-archive-builder.md` with `$naval-video-page-prototype`. For build, archive-generation, Astro, or Pagefind failures, use `$naval-site-build-repair`; it delegates transcript-backed content judgment to `$naval-site-content-auditor` and site implementation changes to `$naval-video-page-prototype` when needed.

Preserve the segment-first design. Ground claims in transcript evidence: video ID, timestamp, and source passage when possible. Keep temporary notes in `task-notes/`; put durable guidance here or in stable docs.
