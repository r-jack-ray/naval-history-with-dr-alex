# Repository Guidelines

## Project Structure & Module Organization

Static reference archive and learner-facing study guide for Dr. Alex Clarke's YouTube channel. Keep source data, transcripts, and curated JSON under `src/`; Astro source and generated site data under `site/`; reports under `reports/`; and planning notes under `task-notes/`. There is no committed `docs/` content tree.

Current source layout:

- `src/channel/`: channel inventory, video IDs, dates, transcript states, and official YouTube metadata.
- `src/content/`: site-content audit, processing-log, topic, transcript-problem, and report logic and tests. Runtime schemas for content-owned persisted formats live under `src/content/schemas/`; derived in-memory archive types live in `src/content/curated-archive-model.ts`.
- `src/derived/video-segments/`: source-of-truth curated site content, with `topics.json` plus one `<manifest.fileStem>.json` file per video. Use the stored `fileStem` from `src/transcripts/manifest.json`; do not recompute it from current metadata.
- `src/derived/topic-normalization-patterns.tsv`: manually curated steady-state policy for topic creation, display names, aliases, and exceptions.
- `src/pipeline/`: atomic-write and transcript-schedule validation helpers and tests.
- `src/scripts/`: JavaScript and TypeScript CLI entrypoints, site-build helpers, validation coordinators, and shared-writer tooling.
- `src/site/`: deterministic archive generation, validation, search-ranking cases, and tests.
- `src/transcripts/txt/`: stored timestamped plain-text transcripts, the transcript source of record.
- `src/youtube/`: channel, metadata, saved-HTML, and transcript-ingestion logic and tests.
- `site/src/`: Astro pages, layouts, styles, client scripts, and data adapters.
- `site/src/data/generated/archive/`: ignored generated `index.json`, `videos.json`, `topics.json`, and hash-bucketed segment JSON files. `index.json` remains the runtime manifest. Never hand-edit them.
- `site/dist/pagefind/`: generated Pagefind index, ignored by Git.
- `.agents/`: project-local agent briefs and skills.

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

Use Node 22+ and TypeScript. Bun `1.3.14` is pinned in `.bun-version` for the canonical `report:video-topic-usage`, `sync:video-topics`, `audit:topic-normalization`, and `generate:site-data` maintenance commands; npm and `package-lock.json` remain the install contract.

```bash
npm run build
npm run check:types
npm test
npm run check
npm run audit:site-content
npm run check:site-content-wording
npm run audit:topic-normalization
npm run audit:video-timestamp-alignment
npm run generate:site-data
npm run check:video-topics
npm run site:check
npm run site:build
npm run sync:video-topics
npm run check:ci
npm run report:video-segment-audit-risk
npm run check:search-ranking
npm run check:rendered-video-dates
npm run fetch:video-links
npm run fetch:video-metadata
npm run alternate:fetch:transcripts:safe
```

The supported weekly handoff is `fetch:video-links`, then `alternate:fetch:transcripts:safe`, then one separate single-agent `$naval-transcript-to-site-content` task for each newly stored exact TXT, then
at least two independent, sequential single-agent `$naval-site-content-auditor` tasks for each resulting exact shard. Each curator and auditor task writes its selected shard, passes the scoped `check:site-content-wording -- --path <shard> --strict --review` check, runs `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with sandbox elevation on the first attempt, and appends the processing-log row only after synchronization succeeds. Finish each task's finalization before the next task begins. Keep `fetch:video-metadata` as the independently rerunnable official-metadata repair command. Inventory/metadata and caption
scraping remain separate stages. The safe transcript command preserves valid-TXT and saved-failure skips, uses cautious pacing, maintains checkpoints, and prints the exact acquisition-to-curation handoff. Explicit failure retries remain a deliberate lower-level batch operation. Newly stored TXT paths
remain in the schema-2 checkpoint until that handoff has been flushed to standard output, so an interrupted run re-emits rather than loses pending curation work. The command does not authorize batching the file-scoped curation stages or using subagents for them.

Do not run Git commands as routine preflight, status, boundary, or validation checks. Prefer direct file inspection, targeted searches, parsers, and the relevant project validators so unnecessary Git output does not consume time or context. Run Git only when the user explicitly requests a Git operation or when a specific overlapping edit cannot otherwise be resolved safely. When Git is genuinely needed, use the narrowest read-only command first. Never commit or push unless the user explicitly requests it.

On Windows, do not launch the roaming `npm` shim from repository Node wrappers: on this machine it resolves a missing `%APPDATA%\npm\node_modules\npm\bin\npm-cli.js`. Direct `spawn()` of `npm.cmd` can also fail with `EINVAL`. Resolve `npm.cmd` beside `process.execPath` and invoke that fixed command through the system shell; for interactive validation, use `C:\Program Files\nodejs\npm.cmd` directly when plain `npm` hits the broken shim.

### Codex sandbox permissions for Bun-backed commands

On this Windows machine, Bun launched inside the managed Codex sandbox can return `EPERM reading ...` for an existing `src/scripts/*-bun.ts` entrypoint. The full test suite has this exposure because `src/scripts/generate-site-data.test.ts` starts Bun child processes; a sandboxed `npm run check` has specifically failed while Bun tried to read `src/scripts/generate-site-data-bun.ts`.

The current user-level Codex setup uses `sandbox_mode = "workspace-write"`, `approval_policy = "on-request"`, `approvals_reviewer = "auto_review"`, and `[windows] sandbox = "elevated"`. Its loaded user rule allows an escalated command whose executable token is exactly `C:\Program Files\nodejs\npm.cmd` to run outside the sandbox without prompting. That rule grants execution permission; the current request and this file still control which package command is authorized. Continue to use the fixed executable path because invoking plain `npm` can still resolve the broken roaming shim described above; the separate plain-`npm` allow rules do not change executable resolution.

For an authorized command whose package-script graph invokes `bun run` directly or from the test suite, Codex must use `C:\Program Files\nodejs\npm.cmd` with `sandbox_permissions: require_escalated` on the first attempt. The loaded fixed-path rule already covers that executable, so do not request a duplicate prefix rule. If the rule is absent in another Codex environment, request the narrowest reusable command-specific prefix. Do not make a sandboxed trial first. This applies to:

- Direct Bun-backed maintenance commands: `report:video-topic-usage`, `sync:video-topics`, `check:video-topics`, `audit:topic-normalization`, and `generate:site-data`.
- The full `npm test` suite and parent validation graphs that reach Bun: `check:source`, `check`, `site:check`, `site:dev`, `site:build`, `site:build:workspace-pagefind`, `check:workspace-pagefind`, and `check:ci`.

Keep Node-only commands such as `check:types`, focused tests that do not spawn Bun, `site:check:generated`, and `site:build:generated` sandboxed unless a concrete permissions-shaped failure occurs. First-attempt elevation changes execution permission only; it does not authorize generation, a full site build, or a broader validation graph. Continue to require current-request authorization for `site:build`, `site:build:workspace-pagefind`, `check:workspace-pagefind`, and `check:ci`, and run only the selected terminal site-pipeline command.

`build` emits `dist/`; `check:types` type-checks only; `test` type-checks once without emitting root build output before running the canonical TypeScript tests under `src/` through Node and `tsx`. `clean` and `build` remain explicit commands for callers that intentionally need compiled output. `check` is the canonical network-free graph over source-owned tests, source/topic validation, one archive generation, Astro diagnostics, and generated-data validation. `check:ci` is the one-pass production graph: it runs `test`, then one `site:build` whose wrapper owns source validation plus cache-aware archive, Astro, and Pagefind work, then `check:production`; it does not run `check` or `site:check` first. `check:production` runs source-owned validation tools against existing `site/dist` output, shares one rendered-HTML snapshot between SEO and date validation, and performs only SEO, ranking, rendered-date, and Pagefind date-metadata validation; it must not generate or build the site. `audit:site-content` validates curated transcript evidence and writes `reports/site-content-backlog.md`. `check:site-content-wording` scans public shard fields for mechanical, report-shaped, and workflow-shaped prose. Its full-directory actionable scan runs inside `check:source` with `--strict --summary-only`; review, fuzzy, filtered, and report modes remain explicit on-demand triage. Curator and auditor tasks continue to use the scoped strict check. `report:video-topic-usage` remains the explicit on-demand taxonomy-curation report and is not part of `check:source`. `generate:site-data` writes deterministic, ignored Astro data under `site/src/data/generated/archive/`, with `index.json` as the authoritative runtime manifest for the generated files, but it never writes canonical topic source. Curator and auditor tasks run the scoped wording check and `sync:video-topics` before their completion-log append; both always use `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with escalation on the first attempt. Run synchronization explicitly when repairing legacy, interrupted, or non-skill shard edits that leave registry records missing. `site:dev` and `site:check` generate before Astro. Both `site:build` and `site:build:workspace-pagefind` run `check:source` before consulting archive or site caches, so a cached local production build still enforces the same topic, registry, content, processing-log, and actionable wording gates used by CI; `--workspace-pagefind` changes only the Pagefind implementation and its fingerprint input. The shared build wrapper then fingerprints the generator and site inputs, validates every manifest-listed archive file and SHA-256 before skipping generation, uses ignored `.tmp/` caches to skip unchanged archive, Astro, and Pagefind stages, and performs the required stages when inputs or outputs change; use `npm run site:build -- --force` to bypass its caches, not the source gate. Never hand-edit or commit the generated archive dataset. Keep `audit:video-timestamp-alignment` as an explicit source-maintenance audit; rendered production dates are checked after Pagefind by `check:production`. Official YouTube Data API tasks default to one second between requests; alternate transcript fetches default to five seconds.

`src/site/archive-data.ts` owns the split-manifest schema through `siteArchiveSchemaVersion`. Any manifest-schema change must update the Astro reader in `site/src/data/archive.ts`, the preflight validator in `src/scripts/site-build-if-changed.mjs`, and the cross-consumer assertions in `src/pipeline/shared-output.test.ts` in the same change. Do not confuse the split-manifest version with the logical reconstructed `SiteArchiveData.schemaVersion`; they version different contracts.

Full `site:build` and `site:build:generated` runs now traverse more than 50,000 HTML pages and can take well over three minutes, especially during Pagefind. Agent-run commands must allow at least 15 minutes (900,000 ms) before timing out and should treat several minutes of silence from `astro build --silent` as normal; do not kill and restart a build solely because it has not emitted recent output.

Astro executes exported `getStaticPaths` functions in an isolated scope. Paginated and dynamic routes must obtain computed path data through imported adapter helpers or create it inside the exported function; they must not reference frontmatter-local computed constants. `astro check` does not execute prerender path generation, so any route or `getStaticPaths` change requires a full `site:build` before handoff.

## Coding Style & Naming Conventions

Use TypeScript under `src/**/*.ts`, JSON for inventories and curated segment shards, and Markdown for durable guidance and task notes. Keep manually named documentation files lowercase and hyphenated. Manifest-owned transcript and shard filenames are the exception: preserve the exact stored `fileStem`, including its timestamp and video-ID suffix. Use timestamp-first task notes matching `yyyy-MM-dd_THH-mm-ss-0500_short-topic.md`.

Every new or repaired `src/derived/site-content-processing.log` row must begin with exactly one 19-character local wall-clock timestamp in `yyyy-MM-ddTHH:mm:ss` form. Do not write fractional seconds, a trailing `Z`, or a numeric UTC offset, and do not use round-trip formats such as `Get-Date -Format o`. The reader accepts older suffixed ISO timestamps only for compatibility; those legacy rows are not templates for new writes or repairs.

Use human-readable column headers with spaces in every TSV written under `reports/`; do not use underscores in report headers. This convention applies to both new reports and their generators. It does not apply to source-data TSV contracts elsewhere in the repository, such as `src/derived/topic-normalization-patterns.tsv`, whose machine-readable schemas must remain stable.

Transcript and episode file stems should use `timestamp_title-slug_videoId` when an exact timestamp is known, otherwise `title-slug_videoId`; keep the video ID suffix.

The core content model is `segment`, not `question`. Valid segment kinds include `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`. Do not force ordinary lecture segments into fabricated Q&A.

Keep Q&A as `kind: qa` segment data unless a future layout/search requirement proves a separate collection is needed.

Store `videoId` once at the shard root. Segment records inherit that identity and must not persist their own `videoId`. Keep the existing `sourcePath` and transcript evidence on every segment.

Use `slug` as the sole authored segment key and public route identity. Authored segment records must not persist a separate `id`; the loader derives runtime and generated segment IDs from `slug` for archive compatibility.

When processing transcripts into site content, use `.agents/transcript-content-curator.md` and `$naval-transcript-to-site-content`. The invoking user or automation must identify exactly one transcript and one owned `src/derived/video-segments/<manifest.fileStem>.json` shard. The selected transcript's manifest record is authoritative: its TXT basename must equal `<fileStem>.txt`, and the shard uses that same stored stem with `.json`; never synthesize a shard name from current title metadata. Apply justified wording and content changes directly to the selected shard and validate its canonical write. After the shard write is complete, pass the scoped wording check, run `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with sandbox elevation on the first attempt, and append exactly one result line only after synchronization succeeds. The scoped wording command is `C:\Program Files\nodejs\npm.cmd run check:site-content-wording -- --path <canonical shard path> --strict --review`. Fix every high-confidence issue, inspect review candidates against the transcript, and rerun until the scoped command succeeds; review candidates do not need to reach zero. Append the result line at the physical bottom of `src/derived/site-content-processing.log`. It must not select work from a backlog, manifest, report, schedule, or shard directory; claim or complete schedule rows; install dependencies; manually edit `topics.json`; write reports, archives, package files, tooling, Astro/CSS sources, or other shards; or run repository-wide generation, tests, builds, audits, or validation. The scoped wording command and topic synchronization are the only validation and shared-command exceptions. Keep `sourcePath` and transcript evidence on every segment. Video-level `topics` are a concise summary subset for the video page, while segment-level topics may be more granular. Add evidence-backed topic slugs only to the owned shard; the same-run deterministic synchronizer materializes missing shared records before completion. A lane automation may separately own only the atomic claim, lane-private log, video-specific temporary checks, and exact completion/reset defined in its prompt. Scheduled transcript processing remains single-agent work: do not use `ultra`, multi-agent mode, or subagents inside a claimed transcript run.

Keep long transcript reads antivirus-safe. Use separate simple commands with literal paths and fixed numeric `Get-Content | Select-Object -Skip/-First` slices, optionally locating a known timestamp first with `rg -n --fixed-strings`. Do not build inline PowerShell multi-range timestamp extractors, stream a whole transcript through regex-heavy `ForEach-Object`/`foreach` logic, encode equivalent dynamic commands, or retry a blocked pattern in another form.

Schedules, reports, generated archives, and logs other than `src/derived/site-content-processing.log` are coordinator-owned shared outputs, not shard-worker outputs. The scoped read-only `npm run check:site-content-wording -- --path <shard> --strict --review` command is the sole shard validation allowed during curator or auditor finalization, and the deterministic `npm run sync:video-topics` command is the sole additional shared-source writer; never inspect or hand-edit `topics.json`. The transcript consumer and content auditor always pass the scoped wording check, then run `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with sandbox elevation on the first attempt, then append exactly one result line after successful synchronization. Auditors perform both checks for every completed selected-shard audit, including unchanged, saturated, and intentionally empty results. The selected shard does not require a pre-write drift check. Resolve every high-confidence wording issue and every review or ambiguous topic problem before shared-output finalization; wording review candidates require transcript-grounded adjudication but do not need to reach zero. For curators and auditors, a wording-check failure, elevation denial, or synchronization failure blocks the completion row without rolling back or invalidating a completed shard write. Normal curator and auditor work never rewrites earlier log rows. Repository-level video removal is the exception: when a video is removed from the episode inventory, transcript manifest, and shard set, remove every processing-log row for its former canonical shard path in the same cleanup. A lane automation may also write only its explicitly named lane-private log and schedule state. Use `src/derived/site-content-processing.config.json` read-only for first-pass content defaults, video-type handling, follow-up stages, and topic grouping.

For first-pass work, do as much useful in-file processing as the configured model and effort can support across the full transcript. Inspect every transcript for both subject segments and transcript-visible Q&A, regardless of source type or title. Preserve substantive chapters and notable points, and create a separate `kind: qa` segment for every substantive prompt and response; do not stop at an overview, sample a subset, or deliberately reserve supported content for a later pass. Record any unresolved chapter ranges, Q&A, audiovisual work, or other limitation plainly in the processing-log result and notes and in the handoff. Full-duration inspection by itself is not a completion determination.

Let segment count arise from the transcript for every video; do not target a minimum, maximum, or preferred numeric range. Split when the subject, argument, example, or exchange meaningfully changes, and avoid both broad catch-all notes and artificial padding. Treat live streams as mixed classroom-style content, not as one generic format segment: inspect the full duration, preserve substantive lecture blocks as `chapter` or `notable_point`, and create a separate `kind: qa` segment for every substantive transcript-visible prompt and response, with its own `start`, optional `end`, `question`, and `answerShort`. Explicit title markers such as `Q&A`, `Q & A`, `Questions Answered`, or `Question and Answer` make exhaustive Q&A extraction mandatory; describe any sampled or incomplete coverage plainly in the processing-log result and notes and in the handoff.
                                                            
Never swap dating systems from BC and AD to BCE and CE. Use the date system found in the transcript.

Let significant segment topics arise from transcript content rather than a fixed tag quota or starter list. During transcript and higher-effort content passes, add evidence-backed topic slugs to the video shard while deepening or splitting content, then run the deterministic topic synchronizer before recording the pass as complete. Do not hand-edit the shared registry. Outside active normalization rules, resolve a selected-shard taxonomy problem before finalization rather than leaving it for another process; do not widen a shard pass into unrelated corpus taxonomy maintenance. Keep each video's topic list as a concise summary subset. Repeat focused content passes while substantive transcript-backed learning value remains absent from the pages.

Use the `fiction-...` topic namespace when the referent exists only inside a fictional work, including fictional vessels, people, factions, events, technologies, and in-universe systems. Do not apply that prefix to counterfactual treatments of real history, real proposed or unbuilt designs, possible future systems, or genre/format topics such as `science-fiction`. When Dr. Clarke uses a fictional story to illustrate a real-world point, tag both layers: the fictional referent with its `fiction-...` topic and each transcript-backed real doctrine, engineering, logistics, institutional, or other lesson with its ordinary topic.

Topic descriptions are optional manual metadata. Deterministic topic creation must initialize a new registry record with a blank description and must never ask an AI process to generate, infer, refresh, normalize, or clear topic-description text. Synchronization must preserve any nonblank description that a person later adds manually. Do not confuse a video's concise summary subset of topic slugs with topic-description prose.

Use `src/derived/topic-normalization-patterns.tsv` as the detailed source of truth for steady-state topic creation, display, alias, and exception policy. The curator and auditor read it but do not edit it: they resolve new slugs through active `creation` rules, preserve established slugs unless the active creation policy canonicalizes them, and treat `review`, disabled, or ambiguous candidates affecting the selected shard as blockers to completion. They must not manually edit `topics.json`, another shard, generated data, or shared validation output, and must not perform corpus-wide topic rewrites from a selected-shard workflow. The deterministic synchronizer is the only permitted registry writer.

For a separately authorized taxonomy-maintenance task, run `npm run report:video-topic-usage` and consume both generated reports. Use `reports/video-topic-usage.tsv` for usage, similarity, aliases, normalization inputs, and co-topic context; use `reports/topic-normalization-review.tsv` as the actionable queue for exact review-rule matches and title/alias collisions, including their current shard or registry sources and recommended action. The command is report-only and must always emit both ignored, on-demand companion files. Do not expect routine site builds to print this curation backlog.

Before changing authored topics, review every listed source and record the intended old-to-canonical slug mapping. Then update the active rules in `src/derived/topic-normalization-patterns.tsv`, each affected video-level or segment-level topic reference in `src/derived/video-segments/*.json`, and the corresponding tracked registry records in `src/derived/video-segments/topics.json` without rewriting unrelated content prose. Preserve manual registry descriptions and aliases. Run `npm run sync:video-topics` only to append genuinely missing canonical records; it is not a corpus-rewrite or obsolete-record-removal command. Regenerate both reports, run the read-only `npm run audit:topic-normalization`, and hand approved authored changes to the repository owner for `npm run generate:site-data`. Generated archive files are noncanonical output and must never be hand-edited.

Do not treat a pass number as proof of completion. Each high-effort content-exhaustion review must independently compare the full transcript with the current shard and add genuinely missing chapters, arguments, examples, Q&A exchanges, context, and topics. If a pass only churns wording or structure without adding transcript-backed substance, mark that specific model-and-effort configuration as saturated and stop repeating it. Saturation is not permanent completion: keep the transcript eligible for another review when a materially stronger model, higher effort level, improved method, or new evidence becomes available. Configure model and effort in the invoking runtime rather than pinning a version here.

Public `title`, `summary`, `body`, `question`, and `answerShort` text must read as user-facing study-guide notes, not workflow status. Do not expose phrases such as "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "seed", or "prototype" in public fields when they describe site workflow or content scaffolding. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing. Keep workflow details in logs, task notes, and handoffs. Segment `body` text should usually be 4-10 substantive sentences that explain what the video moment covers, why it matters, and any important caveat grounded in the transcript.

Every segment already carries `sourcePath` and `evidence`, so public prose does not need to repeat the host's name to establish provenance. In a solo-speaker episode, drop routine references to `Dr. Clarke`, `Dr Clarke`, `Alex Clarke`, bare `Clarke`, and generic substitutes such as `the presenter`, `the speaker`, `the lecturer`, or `the host`; write the subject naturally and preserve uncertainty or interpretation through the wording itself. A solo-speaker segment should normally contain no host attribution, and the summary and body must not repeat it. In multi-speaker material such as interviews, panels, collaborative streams, and Bruships episodes, identify speakers only where a change of speaker, disagreement, contrast, or quotation would otherwise be unclear. Treat every `host-attribution` wording finding as a whole-shard review prompt. For each matched `Clark` or `Clarke`, use the transcript to identify the person before editing. Remove routine references to Dr. Alex Clarke, and preserve other people who share the surname. A solo-speaker shard may retain the review finding only when every surviving match has been verified as another person or a quotation that genuinely needs an owner.

Segment titles and summaries should work as watch points: a reader should understand the naval subject, the likely learning payoff, and why opening the video at that time is useful. When transcript evidence supports it, prefer multiple focused segments over a sparse overview so topic pages and search results can send readers to precise moments.

For follow-up quality passes, use `.agents/site-content-auditor.md` and `$naval-site-content-auditor`. This audit pass requires an explicitly selected `<manifest.fileStem>.json` shard and must stop without edits when none is supplied. It writes any transcript-backed improvements directly to that shard. After the shard is complete, it runs the scoped `check:site-content-wording -- --path <shard> --strict --review` check, fixes every high-confidence issue, and adjudicates review candidates against the transcript. It then runs `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with sandbox elevation on the first attempt and appends exactly one result line at the physical bottom of `src/derived/site-content-processing.log` only after synchronization succeeds. It performs the scoped wording check and synchronization even when the shard remains unchanged, is saturated, or is intentionally empty. It must not run repository-wide generation, tests, Astro/Pagefind builds, or shared validation, and it must not manually edit any other shared or generated output. The repository owner performs those integration checks before push.

## Testing Guidelines

Use Node's built-in test runner with `*.test.ts` files. Unit tests under `src/**/*.test.ts` use self-contained fixtures for channel records, transcript manifests, curated shards, topic registries, normalization catalogs, and generated archives. Keep current-corpus membership, counts, titles, aliases, and cross-file integrity in the dedicated source and production validators; never load canonical corpus files merely to pin their present contents in a unit test. Validators should check timestamp labels and links, transcript sources, inventory references, search manifest integrity, generated site-data references, duplicate routes, topic references, curation backlog state, transcript evidence passages, and TXT coverage. Add search tests for ship names, battles, classes, operations, admirals, countries, dates, and abbreviations. The actionable corpus-wide wording scan is part of `check:source`. Run `npm run check:site-content-wording` directly for triage. Use `--path <shard> --strict --review` as the curator and auditor completion gate, `--review` for judgment-required terms, `--fuzzy` for typo-tolerant variants, repeated `--rule <rule-id>` filters for focused remediation, and `--report` for ignored JSON and Markdown reports with aggregate rule, field, and segment-kind counts. Review candidates require transcript-grounded judgment and are not a general zero-count completion target. A solo-speaker shard must clear every `host-attribution` occurrence that refers to Dr. Alex Clarke before completion. Verified references to other people named Clark or Clarke remain intact.

## Commit & Pull Request Guidelines

History uses concise imperative commits. Keep commits scoped. PRs should explain changes, rationale, validation, and known transcript/tooling gaps.

## Agent-Specific Instructions

Treat this repository's `AGENTS.md`, `.agents/` briefs, and `.agents/skills/` as the authoritative setup guidance. Do not consult or modify sibling repositories unless the user explicitly requests it.

For Astro/Pagefind page, route, search, or generated-data adapter work, use `.agents/site-archive-builder.md` with `$naval-video-page-prototype`. For build, archive-generation, Astro, or Pagefind failures, use `$naval-site-build-repair`; it delegates transcript-backed content judgment to `$naval-site-content-auditor` and site implementation changes to `$naval-video-page-prototype` when needed.

For separately authorised corpus-wide topic taxonomy maintenance, use `$naval-topic-taxonomy-curator`. Keep one-shard transcript-backed topic discovery inside `$naval-transcript-to-site-content` or `$naval-site-content-auditor`, and keep narrow topic failures discovered during a build inside `$naval-site-build-repair` unless they require a broader semantic migration.

Preserve the segment-first design. Ground claims in transcript evidence: video ID, timestamp, and source passage when possible. Keep temporary notes in `task-notes/`; put durable guidance here or in stable docs.

## Tool Advisor

Prefer existing project tooling and installed libraries over ad hoc shell parsing, custom implementations, or new dependencies.

Available development libraries include:

* `ignore` — use for repository traversal or file matching that should honor `.gitignore` rules.
* `fast-fuzzy` — use for fuzzy text matching, near-duplicate detection, title/question comparison, and typo-tolerant matching.
* `gray-matter` — use for reading or writing Markdown front matter as structured data.
* `markdown-it` — use when Markdown structure must be parsed reliably rather than approximated with regular expressions.
* `systeminformation` — use when scripts need machine, CPU, memory, filesystem, process, or other system information.
* `ps-list` — use for lightweight process enumeration and process metadata.

Use these tools only when they directly simplify the task.

Prefer:

1. Existing project code and utilities.
2. The JavaScript/TypeScript standard platform APIs.
3. An already-installed library appropriate to the task.
4. A small new implementation only when the above do not fit.

Do not introduce new frameworks, abstraction layers, wrappers, logging systems, helper architectures, or dependencies merely because they could be useful.

For simple tasks, keep the implementation simple.

Before implementing functionality manually, check whether an existing installed library above already provides the required behavior.
