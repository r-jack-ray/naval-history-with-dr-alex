# Repository Guidelines

## Project Structure & Module Organization

Static reference archive for Dr. Alex Clarke's YouTube channel. Keep source data under `src/`, curated Markdown under `docs/`, site/search output under `site/`, reports under `reports/`, and planning notes under `task-notes/`.

Planned source layout:

- `src/channel/`: channel inventory, playlists, video IDs, dates, and transcript states.
- `src/transcripts/json/`: raw transcript JSON, the source of record.
- `src/transcripts/txt/`: generated plain-text transcripts.
- `src/transcripts/tsv/`: optional structured timestamp rows.
- `src/derived/video-segments/`: source-of-truth curated site content, with `topics.json` plus one `video-<videoId>.json` file per video.
- `src/derived/`: other generated or supporting derived data.
- `src/site/`: deterministic site-data generator and tests.
- `docs/videos/`: one primary Markdown page per video.
- `site/src/data/generated/`: generated Astro-facing archive JSON.
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
npm run convert:transcript-json -- src/transcripts/json/uURe69Wnh-Q.json --output-dir src/transcripts/txt
```

Use normal Git for repository operations:

```powershell
git status --short --branch
git diff --check
git push
```

`build` emits `dist/`; `check:types` type-checks only; `test` compiles and runs Node's test runner; `check` combines both. `audit:site-content` validates curated transcript evidence and writes `reports/site-content-backlog.md`. `generate:site-data` writes deterministic Astro data to `site/src/data/generated/archive.json`; `site:build` regenerates that data, builds `site/dist/`, and runs Pagefind. Official YouTube Data API tasks default to one second between requests; alternate transcript fetches default to five seconds.

## Coding Style & Naming Conventions

Use TypeScript under `src/**/*.ts`, Markdown for curated content, and JSON for inventories. Keep filenames lowercase and hyphenated, for example `docs/videos/battle-of-jutland-overview.md`. Use timestamp-first task notes matching `yyyy-MM-dd_THH-mm-ss-0500_short-topic.md`.

Transcript and episode file stems should use `timestamp_title-slug_videoId` when an exact timestamp is known, otherwise `title-slug_videoId`; keep the video ID suffix.

The core content model is `segment`, not `question`. Valid segment kinds include `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`. Do not force ordinary lecture segments into fabricated Q&A.

Keep Q&A as `kind: qa` segment data unless a future layout/search requirement proves a separate collection is needed.

When processing transcripts into site content, use `.agents/transcript-content-curator.md` and `$naval-transcript-to-site-content`. This skill is shard-only: the invoking user or automation must identify exactly one transcript and one owned `src/derived/video-segments/video-<videoId>.json` shard. The skill must not select work from a backlog, manifest, report, schedule, or shard directory; acquire or inspect leases; claim or complete schedule rows; install dependencies; write logs, reports, topics, archives, package files, tooling, Astro/CSS sources, or other shards; or run repository-wide generation, tests, builds, audits, or validation. Keep `sourcePath` and transcript evidence on every segment. Video-level `topics` are a concise summary subset for the video page, while segment-level topics may be more granular. Add evidence-backed topic slugs only to the owned shard; the repository owner's later build synchronizes the shared registry and performs integration checks before push. A lane automation may separately own only the atomic claim, lane-private log, video-specific temporary checks, and exact completion/reset defined in its prompt. Scheduled transcript processing remains single-agent work: do not use `ultra`, multi-agent mode, or subagents inside a claimed transcript run.

Processing logs, schedules, reports, and generated archives are coordinator-owned shared outputs, not shard-worker outputs. A lane automation may write only its explicitly named lane-private log and schedule state. Use `src/derived/site-content-processing.config.json` read-only for first-pass content defaults, video-type handling, follow-up stages, and topic grouping.

For first-pass work, report `needsFurtherProcessing=no` only after the full transcript was inspected and all substantive chapters or Q&A were captured, or when the transcript is intentionally closed without usable public content. Full-duration inspection by itself is not a completion determination. A coordinating automation or repository owner records that determination outside the shard-only skill.

Let segment count arise from the transcript for every video; do not target a minimum, maximum, or preferred numeric range. Split when the subject, argument, example, or exchange meaningfully changes, and avoid both broad catch-all notes and artificial padding. Treat live streams as mixed classroom-style content, not as one generic format segment: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create a separate `kind: qa` segment for every substantive transcript-visible prompt and response, with its own `start`, optional `end`, `question`, and `answerShort`. Explicit title markers such as `Q&A`, `Q & A`, `Questions Answered`, or `Question and Answer` make exhaustive Q&A extraction mandatory; a sampled subset must keep `needsFurtherProcessing=yes` and must not be described as complete.

Let significant segment topics arise from transcript content rather than a fixed tag quota or starter list. During transcript and higher-effort content passes, add evidence-backed topic slugs to the video shard while deepening or splitting content; do not spend model effort maintaining the shared registry. The deterministic topic synchronizer materializes missing records and the test suite checks its behavior. Consolidate synonyms, near-duplicates, or aliases only when validation reveals a taxonomy problem or the user explicitly requests taxonomy work. Keep each video's topic list as a concise summary subset. Repeat focused content passes while substantive transcript-backed learning value remains absent from the pages.

Do not treat a pass number as proof of completion. Each high-effort content-exhaustion review must independently compare the full transcript with the current shard and add genuinely missing chapters, arguments, examples, Q&A exchanges, context, and topics. If a pass only churns wording or structure without adding transcript-backed substance, mark that specific model-and-effort configuration as saturated and stop repeating it. Saturation is not permanent completion: keep the transcript eligible for another review when a materially stronger model, higher effort level, improved method, or new evidence becomes available. Configure model and effort in the invoking runtime rather than pinning a version here.

Public `summary`, `body`, `question`, and `answerShort` text must read as user-facing study-guide notes, not workflow status. Do not expose phrases such as "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", or "prototype" in public fields when they describe site workflow or content scaffolding. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing. Keep workflow details in logs, task notes, and handoffs. Segment `body` text should usually be 2-4 substantive sentences that explain what the video moment covers, why it matters, and any important caveat grounded in the transcript.

Segment titles and summaries should work as watch points: a reader should understand the naval subject, the likely learning payoff, and why opening the video at that time is useful. When transcript evidence supports it, prefer multiple focused segments over a sparse overview so topic pages and search results can send readers to precise moments.

For follow-up quality passes, use `.agents/site-content-auditor.md` and `$naval-site-content-auditor`. This audit pass requires an explicitly selected `video-<videoId>.json` shard and must stop without edits when none is supplied. It adds transcript-backed substance to that shard only. It must not run repository-wide generation, tests, Astro/Pagefind builds, or shared validation, and it must not edit shared or generated outputs. The repository owner performs those integration checks before push.

## Testing Guidelines

Use Node's built-in test runner with `*.test.ts` files. Validators should check timestamp labels and links, transcript sources, inventory references, search manifest integrity, generated site-data references, duplicate routes, topic references, curation backlog state, transcript evidence passages, and TXT coverage. Add search tests for ship names, battles, classes, operations, admirals, countries, dates, and abbreviations.

## Commit & Pull Request Guidelines

History uses concise imperative commits. Keep commits scoped. PRs should explain changes, rationale, validation, and known transcript/tooling gaps.

## Agent-Specific Instructions

Treat this repository's `AGENTS.md`, `.agents/` briefs, and `.agents/skills/` as the authoritative setup guidance. Do not consult or modify sibling repositories unless the user explicitly requests it.

Preserve the segment-first design. Ground claims in transcript evidence: video ID, timestamp, and source passage when possible. Keep temporary notes in `task-notes/`; put durable guidance here or in stable docs.
