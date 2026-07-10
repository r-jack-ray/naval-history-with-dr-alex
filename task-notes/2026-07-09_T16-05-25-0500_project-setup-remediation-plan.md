# Project Setup Remediation Plan

Timestamp: 2026-07-09T16:05:25-05:00

Status: Phase 1 complete; Phase 2 is the next unchecked implementation phase.

Execution model: `gpt-5.6-terra`

Reasoning effort: `high`

Execution mode: Standard, phase-gated Codex implementation

## GPT-5.6 Terra Execution Contract

This plan is assigned to GPT-5.6 Terra. When implementation is explicitly started, use the following configuration for every phase unless the user changes it:

```text
model = "gpt-5.6-terra"
reasoning_effort = "high"
```

Use standard execution; do not enable pro mode for routine plan work.

Execution rules:

1. Do not silently substitute `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-luna`, or another model. If Terra is unavailable, stop before editing and report the availability problem.
2. Use high reasoning as the implementation baseline. Do not raise routine work to `xhigh` or `max`; Phase 8 owns any model-effort evaluation.
3. Execute the phases in the documented order. A later phase may begin only after the earlier phase's acceptance criteria pass or the dependency is explicitly waived in the handoff.
4. Treat one bounded checklist group as one implementation task. Update checkboxes only after the corresponding code, tests, and acceptance criteria are complete.
5. Use one writer in the shared checkout. Parallel work is limited to independent read-only inspection or test analysis until Phase 1 provides safe serialization and atomic shared-output writes.
6. Before each implementation task, read `AGENTS.md`, this plan, and the directly relevant source, hook, workflow, skill, or automation files. Do not reload unrelated transcript content.
7. Preserve unrelated changes. Keep diffs scoped to the active phase and do not reset, discard, commit, push, resume automations, or deploy unless the user separately authorizes that action.
8. Run the phase-specific checks plus the final validation matrix in proportion to the change. Record commands and results in the handoff.
9. If implementation exposes a materially different architecture choice, pause that checklist item, document the evidence and tradeoff, and continue only with independent in-scope work.
10. Lead each handoff with completed outcomes, files changed, checks run, and the next unchecked phase or blocker.

Suggested invocation:

```text
Using GPT-5.6 Terra with high reasoning, implement the next unchecked phase in
task-notes/2026-07-09_T16-05-25-0500_project-setup-remediation-plan.md.
Stay within that phase, satisfy its acceptance criteria, update the plan, and stop.
```

## Purpose

Resolve the project-wide setup risks found in the July 9 review while preserving the segment-first content model, the existing transcript evidence, unrelated worktree changes, and the learner-facing intent of the public site.

The project currently builds and validates successfully. This plan focuses first on concurrency and queue correctness, then release gates and search scalability, followed by site metadata, toolchain reproducibility, repository size, and GPT-5.6 prompt efficiency.

## Current Baseline

- All four transcript-schedule automations are paused.
- All four use `gpt-5.6-terra` with `reasoning_effort = "high"`.
- Initial transcript processing should remain on Terra/high. Do not move the routine initial pass to `xhigh` or `max` without a representative evaluation showing a material quality gain.
- Current transcript manifest: 2,057 TXT records.
- Frozen four-schedule total: 2,049 unique rows.
- Current curated content: 395 videos, 2,355 segments, and 181 topics.
- Latest processing state: 393 seeded videos marked `needsFurtherProcessing=yes` and 2 marked `no`.
- Current static build: 2,936 pages.
- Generated archive: approximately 7.28 MB.
- Search page HTML: approximately 3.56 MB.
- Segment index HTML: approximately 1.86 MB.
- Generated Pagefind assets: approximately 6.65 MB.
- Transcript source stores: approximately 1.43 GB combined.
- Working source tree: approximately 1.47 GB; Git database: approximately 600 MB.
- Production dependency audit: zero known vulnerabilities.
- Development dependency audit: 17 moderate findings through the Lighthouse/OpenTelemetry chain.

Baseline verification passed:

```powershell
npm run check:types
npm test
npm run audit:site-content -- --limit 5
.\node_modules\.bin\astro.cmd check --tsconfig tsconfig.astro.json
npm run site:build
git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check
npm audit --omit=dev
```

Observed results:

- TypeScript passed.
- All 41 tests passed.
- Astro reported zero errors, warnings, or hints.
- The content audit reported zero errors and warnings.
- Pagefind completed successfully.
- The latest five GitHub Pages deployments succeeded.

## Operating Constraints

1. Preserve unrelated dirty changes and avoid repository-wide mechanical rewrites while schedule work is active.
2. Keep one claimed transcript and one current-schema shard as the normal scheduler unit.
3. Keep routine scheduled transcript runs single-agent; do not use ultra or subagents inside a claimed run.
4. Keep transcript evidence, `sourcePath`, timestamps, and learner-facing public wording mandatory.
5. Do not make generated archives, reports, or logs the authoritative content source.
6. Keep the site static and compatible with GitHub Pages.
7. Introduce measurable acceptance criteria before changing model level, reasoning effort, or prompt structure.

## Phase 1: Serialize Shared Writers

Priority: P1

Problem: Four ten-minute schedulers target the same checkout. Each can update shared topics, the append-only log, the backlog report, and the monolithic generated archive. Validation currently rewrites shared files directly, and prior runs have recorded transient archive and automation-memory failures.

### Tasks

- [x] Choose one concurrency model:
  - One scheduler driving four logical queues; or
  - A repository-wide single-flight lock shared by all four automations.
- [x] If retaining four automations, stagger their schedules in addition to the lock so they do not all wake at the same instant.
- [x] Define lock ownership, timeout, stale-lock recovery, and guaranteed release on success or failure.
- [x] Make generated report and archive writes atomic using write-to-temporary-file followed by rename/replace.
- [x] Ensure log appends cannot interleave or truncate records.
- [x] Stop validation from regenerating the same archive more than once per run.
- [x] Decide whether `site/src/data/generated/archive.json` should remain tracked. If retained, document exactly when it is regenerated; otherwise generate it as a build artifact.
- [x] Add a concurrency regression test or a bounded parallel-writer simulation.

### Acceptance Criteria

- At most one process writes shared pipeline outputs at a time.
- An interrupted run cannot leave a partial JSON archive or report.
- A stale lock can be diagnosed and safely recovered.
- Two deliberately overlapping test invocations complete without corrupted output or lost log rows.
- A normal validation run generates the archive once.

### Phase 1 Implementation Handoff (2026-07-09)

Completed outcomes:

- Retained the four paused local schedules, added a shared persistent writer lease, and staggered their ten-minute starts to minutes 0, 2, 5, and 7.
- Added atomic archive/report publication, a lease-aware atomic processing-log appender, stale-lock inspection/recovery, and guaranteed release in both validation hooks.
- Retained `site/src/data/generated/archive.json` as tracked Astro input; the README now defines its regeneration contract.
- Split generated-data checks from normal site commands so each validation hook generates the archive once.

Files changed:

- `.codex/hooks/site-content-pipeline-lock.mjs`, both validation hooks, `src/pipeline/`, archive/audit writers, package scripts, and scheduled-worker guidance.
- The four paused Codex automation records were updated through the app; no automation was resumed.

Checks:

- `npm run check` — 46 tests passed, including cross-process writer, stale-recovery, nested-lease, atomic-write, and single-generation regression coverage.
- `pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck` — passed with one archive generation.
- `pwsh -NoProfile -File .codex/hooks/validate-site.ps1 -SkipRepoCheck` and `npm run site:build` — passed.
- Persistent-lease handoff integration (nested `npm.cmd` audit plus validation) — passed and released the lease.
- `npm audit --omit=dev` — 0 vulnerabilities.

Next unchecked phase: Phase 2, queue and completion-state correctness.

## Phase 2: Make Queue and Completion State Correct

Priority: P1

### 2.1 Reconcile the Frozen Schedules

The four schedules omit these current manifest video IDs:

- `-sOPrkXNRaU`
- `3M9ae7K2XKU`
- `5G14HxOrzGg`
- `j8csQfIH0mQ`
- `O0vjty1ueho`
- `P-Pj-Vkc04g`
- `rJmiSW1x2nU`
- `rrr7wCH8SH8`

Tasks:

- [ ] Add a deterministic manifest-versus-schedule coverage checker.
- [ ] Generate a delta queue for manifest records absent from all active schedules.
- [ ] Add the eight current omissions without redistributing or duplicating existing rows.
- [ ] Fail scheduler preflight, or emit a prominent blocking report, when schedule coverage drifts again.
- [ ] Replace wording that claims a frozen schedule permanently contains every stored transcript.

Acceptance criteria:

- Every current manifest TXT path is in exactly one initial-processing schedule or an explicit delta queue.
- Duplicate video IDs and missing files are rejected.
- Adding a manifest record creates a visible queue delta automatically.

### 2.2 Restore the Follow-up Pipeline

Problem: The audit backlog removes every video that already has a segment, so 393 seeded videos whose latest state is `needsFurtherProcessing=yes` are invisible. The configured follow-up stages are not consumed operationally.

Tasks:

- [ ] Separate the unseeded initial-processing backlog from the seeded follow-up backlog.
- [ ] Build follow-up eligibility from the latest processing-log state per video.
- [ ] Make `followUpStages` in `site-content-processing.config.json` drive real queues or remove the unused configuration.
- [ ] Route structured material to `granular-chaptering` and noisy live streams to `exhaustive-live-qa-review` according to the existing stage definitions.
- [ ] Prevent a first-pass shard from being treated as complete merely because it contains one segment.
- [ ] Add tests covering `yes`, `no`, multiple log entries, empty shards, and missing log entries.

Acceptance criteria:

- All 393 current `yes` videos appear in a machine-readable follow-up view.
- Videos whose latest state is `no` do not appear unless explicitly reopened.
- A newer log row supersedes older state deterministically.

### 2.3 Separate Claim, Completion, and Coverage

Tasks:

- [ ] Preserve early claiming but add machine-readable states for `claimed`, `completed`, `failed`, and `retryable`.
- [ ] Record claimed time, completed time, video ID, transcript path, validation result, and failure reason.
- [ ] Record inspected transcript ranges or an explicit full-duration coverage declaration.
- [ ] Add recovery behavior for a run that crashes after marking `[x]` but before validation.
- [ ] Add a freshness hash or regeneration check to fixed auditor plans so stale segment counts cannot silently drive work.

Acceptance criteria:

- A checked schedule row alone is not treated as proof of successful completion.
- Crashed claims are discoverable and retryable without manual archaeology.
- Full-duration and partial transcript coverage are machine-readable.

## Phase 3: Strengthen CI and Deployment Gates

Priority: P1

Problem: The Pages workflow runs the Astro checks and build but omits the repository test suite and transcript-evidence audit. It also has no pull-request validation path.

### Tasks

- [ ] Add a pull-request validation workflow or expand the existing workflow to validate PRs without deploying.
- [ ] Run `npm ci` with a pinned Node/npm toolchain.
- [ ] Run `npm run check`.
- [ ] Run `npm run audit:site-content -- --no-output`.
- [ ] Run `npm run site:check`.
- [ ] Run `npm run site:build` once after the preceding gates pass.
- [ ] Make deployment depend on the complete validation job.
- [ ] Add a check that generation leaves tracked generated data in the expected state, depending on the Phase 1 tracking decision.
- [ ] Upgrade `actions/setup-node` from v4 to the current supported major.

### Acceptance Criteria

- A unit-test, type-check, transcript-evidence, route, topic-reference, or Astro failure blocks deployment.
- Pull requests receive the same non-deployment validation as `main`.
- Deployment does not repeat generation unnecessarily.
- The workflow uses a supported GitHub Actions runtime.

## Phase 4: Make Pagefind the Search Authority

Priority: P1

Problem: The public search page embeds and scans the complete archive in HTML while the build separately generates Pagefind assets that the search interface does not use.

### Tasks

- [ ] Replace the inline JSON search index with lazy-loaded Pagefind search.
- [ ] Configure Pagefind for the GitHub Pages project subpath.
- [ ] Preserve learner-oriented matching for ships, classes, navies, battles, people, weapons, acronyms, periods, and alternate wording.
- [ ] Add useful filters for content type, topic, video, and other proven discovery needs.
- [ ] Include video ID and timestamp metadata only where it materially improves filtering or result context.
- [ ] Keep direct timestamped YouTube links in segment results.
- [ ] Paginate or progressively render the segment and video browse indexes.
- [ ] Remove the superseded custom search payload and client-side full-array scan.
- [ ] Add search tests for representative naval terms, aliases, abbreviations, and empty/no-result queries.
- [ ] Define page-weight budgets for search and browse pages.

### Acceptance Criteria

- Search does not serialize the full archive into initial HTML.
- Only one production search index is generated and maintained.
- Search works under `/naval-history-with-dr-alex/` on GitHub Pages.
- Search and segment-index HTML sizes fall materially below the current 3.56 MB and 1.86 MB baselines.
- Existing high-value search fixtures continue to pass.

## Phase 5: Correct Public Ordering, Dates, and Discovery Metadata

Priority: P2

### Tasks

- [ ] Prefer canonical `publishedAt` or `publishDate` values over scraped relative text.
- [ ] Use relative publication text only as a final fallback.
- [ ] Add a deterministic published-date sort for video browsing.
- [ ] Sort segments deliberately by video and start time where chronological order is intended.
- [ ] Replace video-ID filename order as the homepage featured-content selector.
- [ ] Define explicit editorial featured IDs or a documented automatic selection rule.
- [ ] Add canonical URLs and Open Graph metadata.
- [ ] Add a favicon with base-path-correct references.
- [ ] Add sitemap generation, `robots.txt`, and a custom 404 page.
- [ ] Add tests for exact publication labels, ordering, canonical URLs, and required static assets.

### Acceptance Criteria

- None of the 154 records with an available exact date display an aging relative-only label.
- Homepage and browse ordering is intentional, documented, and tested.
- The production build contains a sitemap, robots file, favicon, and custom 404.
- No favicon or other base-path asset 404 appears in browser validation.

## Phase 6: Reproducible Toolchain and Developer Workflow

Priority: P2

### Tasks

- [ ] Change the documented and declared Node floor from `>=22` to the actual supported minimum, currently `>=22.12.0` for the locked Astro version.
- [ ] Add a version file such as `.node-version` or `.nvmrc`.
- [ ] Pin the package manager version if relying on npm-version-specific behavior.
- [ ] Either pin npm 11 so `allowScripts` is enforced or remove the misleading policy until it can be enforced consistently.
- [ ] Make `site:dev` regenerate the archive before startup and watch or document the source-to-generated-data workflow.
- [ ] Clean stale TypeScript output before build/test, or otherwise guarantee deleted compiled tests cannot continue running.
- [ ] Add `.gitattributes` rules for the append-only log and schedule Markdown files to eliminate recurring CRLF churn.
- [ ] Review the 17 moderate development-only audit findings without applying a breaking forced downgrade.
- [ ] Add the favicon and rerun Lighthouse on search, segment index, representative video, segment, and topic pages.

### Acceptance Criteria

- A newly configured machine uses a supported Node and npm combination without guesswork.
- Local development cannot silently serve an outdated archive after normal source changes.
- Deleted tests cannot survive as stale compiled output.
- Line-ending normalization no longer creates noisy schedule/log diffs.
- Production dependencies remain free of known audit findings.

## Phase 7: Reduce Repository and Deployment Weight

Priority: P2

### Tasks

- [ ] Measure which transcript formats the production site build actually consumes.
- [ ] Use sparse checkout in the Pages workflow if raw JSON/TXT files are not required for deployment.
- [ ] Evaluate Git LFS, release assets, a separate archival repository, or another durable source-of-record strategy for large raw transcript history.
- [ ] Keep the curated shards and deterministic site inputs easy to clone and audit.
- [ ] Document the recovery and regeneration path before moving any canonical transcript data.
- [ ] Add repository-size monitoring or a periodic size report.

### Acceptance Criteria

- Pages CI does not download transcript stores it does not use.
- Any storage migration preserves canonical transcript provenance and reproducibility.
- The normal contributor clone is materially smaller or its size is explicitly accepted and monitored.

## Phase 8: Tune GPT-5.6 Instructions with an Evaluation

Priority: P2 optimization; do not block Phases 1-4 on this work.

Current decision: retain `gpt-5.6-terra` with `high` effort for the initial transcript pass. OpenAI guidance describes Terra as the capability/cost balance and recommends testing the current effort against one level lower rather than assuming maximum effort is best.

Reference: <https://developers.openai.com/api/docs/guides/latest-model>

### Tasks

- [ ] Consolidate invariant transcript workflow rules into the transcript skill.
- [ ] Keep `AGENTS.md` focused on durable repository-wide policy.
- [ ] Keep `.agents/transcript-content-curator.md` focused on the role-specific content brief.
- [ ] Reduce each automation prompt to schedule identity, one-item claim scope, runtime constraints, and the required handoff.
- [ ] Remove redundant copies of the same autonomy, wording, and validation rules after confirming the remaining instruction chain is authoritative.
- [ ] Retain explicit constraints that GPT-5.6 still needs: one claimed transcript, named-input authority, single-agent execution, no ultra, full-duration chunk inspection, evidence grounding, public wording, and validation.
- [ ] Build a representative evaluation set covering:
  - A short structured lecture.
  - A long structured lecture.
  - A noisy live Q&A.
  - Setup chatter with no honest public watch point.
  - A transcript requiring new shared topics.
  - A transcript with difficult timestamp/evidence boundaries.
- [ ] Compare Terra/high with Terra/medium on task success, evidence accuracy, full-duration coverage, segment usefulness, validation retries, tokens, latency, and cost.
- [ ] Test `xhigh` only on difficult follow-up/auditor cases where the evaluation can detect a real quality improvement.
- [ ] Reserve `max` for exceptional quality-first investigations, not routine initial processing.

### Acceptance Criteria

- The shortened instruction stack preserves all required workflow behaviors on the evaluation set.
- Terra/medium replaces Terra/high only if it meets the same quality and evidence thresholds with a meaningful efficiency benefit.
- `xhigh` or `max` is used only for a documented class of tasks with measured benefit.
- Prompt changes reduce duplicated instructions and starting context without reducing validation success.

## Recommended Implementation Order

1. Phase 1: Serialize shared writers and make writes atomic.
2. Phase 2: Reconcile schedules and establish initial/follow-up/retry state.
3. Phase 3: Put the complete validation pipeline in CI.
4. Phase 4: Replace the custom inline search with Pagefind.
5. Phase 5: Correct dates, ordering, and discovery metadata.
6. Phase 6: Pin the toolchain and repair stale-development paths.
7. Phase 7: Reduce clone and deployment weight.
8. Phase 8: Simplify and benchmark GPT-5.6 prompts.

Phases 1 and 2 should be completed before resuming all four ten-minute schedule workers. Phase 3 should precede any further production deployment changes. Phase 8 should use representative evaluations rather than intuition alone.

## Final Validation Matrix

Run the complete matrix after the applicable phases:

```powershell
npm ci
npm run check
npm run audit:site-content -- --no-output
npm run generate:site-data
npm run site:check
npm run site:build
npm audit --omit=dev
git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check
```

Also verify:

- [ ] Manifest-to-initial-queue coverage is complete and duplicate-free.
- [ ] Latest `needsFurtherProcessing` state produces the expected follow-up queue.
- [ ] Interrupted claims are recoverable.
- [ ] Concurrent writer tests do not corrupt shared outputs.
- [ ] Search works from the deployed project subpath.
- [ ] Search and browse page sizes meet the new budgets.
- [ ] Publication dates and homepage ordering are correct.
- [ ] Sitemap, robots, favicon, canonical metadata, and custom 404 are present.
- [ ] GitHub Pages deploys only after the full release gate passes.
- [ ] Model/effort changes, if any, are backed by evaluation results.

## External References

- GPT-5.6 model and reasoning guidance: <https://developers.openai.com/api/docs/guides/latest-model>
- Pagefind subpath configuration: <https://pagefind.app/docs/search-config/>
- Current `actions/setup-node`: <https://github.com/actions/setup-node>
- GitHub Actions Node 20 migration notice: <https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/>
- GitHub large-file and repository-size guidance: <https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github>
