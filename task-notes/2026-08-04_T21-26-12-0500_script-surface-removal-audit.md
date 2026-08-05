# Script Surface Removal Audit

Timestamp: 2026-08-04T21:26:12-05:00

Original audit status: Documentation-only audit complete. At the audit timestamp, no scripts, package commands, dependencies, generated data, source data, tests, or hooks were changed or removed.

## Implementation Update

Timestamp: 2026-08-04T21:43:20-05:00

The owner-authorized consolidation subset is complete:

- `check` now starts with `npm test`; the standalone `check:types` command remains available, while the aggregate no longer compiles the same `tsconfig.json` twice.
- `alternate:extract:saved-channel-html -- --tab streams` now preserves the specialized parser's non-video filtering, video-ID fallbacks, metadata extraction, ignored-video handling, continuation state, raw lockup counts, source positions, and merge-compatible `ChannelVideoLinksResult`. The redundant `alternate:extract:live-streams-html` entry, CLI, module, and test were retired after that parity was covered in the generic parser tests.
- A single `audit:lighthouse` TypeScript runner replaced the two preaudit hooks and three audit entries. It supports production or caller-supplied/local base URLs, home-only or representative five-route modes, configurable output prefixes, and internal report-directory creation.
- The focused `check:video-topics` contract and transcript schedule audit remain unchanged because this audit classified those as conditional rather than immediate consolidations.
- Pure removal recommendations were outside that consolidation subset; their later implementation is recorded below.

Validation completed:

- `npm run check`: passed outside the sandbox with 251/251 tests, zero topic-normalization blockers, zero site-content errors/warnings, and zero Astro diagnostics. The initial sandboxed attempt hit the known Bun `EPERM` read boundary in three generator subprocess tests; the required identical escalated rerun passed.
- `npm run audit:lighthouse -- --help`: passed without starting an audit.
- IntelliJ error inspections over the changed TypeScript files: no errors.
- A live Lighthouse run was intentionally not performed; it remains an opt-in audit against a deployed site or running local preview.

## Removal Update

Timestamp: 2026-08-04T22:07:06-05:00

The owner-authorized confirmed and strong removal recommendations are complete:

- Deleted the unused `site/src/scripts/topics-index.js` browser asset. No import, dynamic loader, or matching `data-topic-*` markup remains.
- Removed the `check:generated` alias and changed `check` to call `site:check` directly.
- Removed the unused `append:site-content-processing-log` package alias while retaining `src/scripts/site-content-pipeline-lock.mjs`, its `append-log` capability, and its tests.
- Removed the uncalled `site:dev:generated` entry while retaining the safer generation-owning `site:dev` command.
- Removed the uncalled `site:build:full` entry. When an already valid generated archive must be rebuilt without generation, the supported replacement is `npm run site:build:generated -- --force`.
- Updated current README, repository guidance, build-repair guidance, and command/concurrency contracts. Regression tests now require the four command names and dead browser asset to stay retired.
- Retained the explicitly optional convenience entries `clean` and `check:site-seo`. The initial retention of `check:repository-policy` was reversed after the owner review recorded below.

The package command surface was 43 entries after this removal slice and is 42 after the repository-policy follow-up below.

Post-removal validation completed:

- `npm run check`: passed outside the sandbox with 251/251 tests, zero topic-normalization blockers, zero site-content errors/warnings, and zero Astro diagnostics across 31 Astro files.
- IntelliJ error inspections over the changed TypeScript contract tests: no errors.
- A scoped current-guidance/source scan found the retired names and file path only in intentional negative regression assertions; retained `site:check:generated` references remain distinct and valid.

### Repository-Policy Follow-up

Timestamp: 2026-08-04T22:29:12-05:00

Owner review rejected repository hygiene alone as sufficient reason to retain a dedicated hook. The resulting removal is complete:

- Deleted `.codex/hooks/check-repository-policy.mjs` and its four-test temporary-repository fixture suite in `src/pipeline/repository-policy.test.ts`.
- Removed the `check:repository-policy` package entry and its final `check:ci` invocation. `check:ci` now composes only the canonical network-free and production validation graphs.
- Removed current README and repository-guidance claims that CI enforces exact ignore spelling, whitespace policy, or a clean tracked worktree.
- Kept `/site/src/data/generated/archive/` in `.gitignore`; ignored generated output remains the repository convention without a dedicated Git-policy validator.
- Added retirement contracts for both the package name and hook path.

The hook had been introduced with the completed generated-archive untracking migration. Its remaining checks enforced optional Git hygiene rather than site correctness, archive integrity, or a currently used workflow, so retaining a dedicated implementation and test suite was not justified.

Validation completed:

- `npm run check`: passed outside the sandbox with 247/247 tests, zero topic-normalization blockers, zero site-content errors/warnings, and zero Astro diagnostics across 31 Astro files. The initial sandboxed run reached the expected three Bun generator-test `EPERM` failures; the identical escalated command passed.
- IntelliJ error inspections over the two changed TypeScript contract tests: no errors.
- A scoped live-reference scan found the retired command and hook only in intentional negative regression assertions; the hook source, focused source test, and compiled test artifact are absent.

The original audit findings below remain the pre-implementation evidence record except where the implementation updates or revised repository-policy conclusion explicitly supersede them.

### Source-Layout Follow-up

Timestamp: 2026-08-04T22:49:57-05:00

The owner established that JavaScript and TypeScript utilities which are not registered hooks belong under `src/scripts/`. None of the remaining `.codex/hooks/` files were registered event hooks, so the layout migration is complete:

- Moved `run-workspace-pagefind.mjs`, `site-build-if-changed.mjs`, `site-build-support.mjs`, `site-content-pipeline-lock.mjs`, and `site-dev.mjs` to `src/scripts/` without changing their supported package-command boundaries.
- Replaced `validate-content-pipeline.ps1` and `validate-site.ps1` with `src/scripts/validate-content-pipeline.ts` and `src/scripts/validate-site.ts`.
- Added `src/scripts/validation-workflow.ts` for their shared argument validation, fixed npm/Node subprocess execution, lease acquisition or renewal, active-token propagation, ordered stages, release-on-success-or-failure, and environment restoration.
- Updated package commands, Astro configuration, cache fingerprints, tests, README guidance, repository guidance, project briefs, and skills to the new paths.
- Added behavioral tests for validation option bounds, acquire/renew behavior, ordered token propagation, release after failure, caller-lease retention, release warnings, and environment restoration.
- `.codex/hooks/` had no remaining files after migration and the empty directory was removed.

This relocation changes organization and invocation paths, not the underlying build, Pagefind, shared-writer, or validation workflows. The package command surface remains 42 entries.

Validation completed:

- The focused migration suite passed 21/21 tests, covering the moved command contracts, shared-output lease behavior, source-layout retirement assertions, site-concurrency support import, and the new validation workflow.
- `node --import tsx src/scripts/validate-content-pipeline.ts --skip-repo-check --backlog-limit 1` passed outside the sandbox, exercising live lease acquisition/release, fixed Windows npm invocation, topic audit, content audit, archive generation, and Astro diagnostics. Its initial sandboxed attempt reached the expected Bun `EPERM` read boundary and still released the lease correctly.
- `npm run check` passed outside the sandbox with 252/252 tests, zero topic-normalization blockers, zero site-content errors/warnings, and zero Astro diagnostics across 31 Astro files.
- Both TypeScript validation CLIs and the moved lock CLI returned successful `--help` output without acquiring a lease or starting validation.
- A scoped current-source/guidance scan found old `.codex/hooks/` and PowerShell paths only in intentional retirement assertions; the directory itself is absent.

## Scope

The live repository was audited across both command exposure and implementation files:

- 52 commands under `package.json` `scripts`
- 41 TypeScript files under `src/scripts/`, including 7 test files
- 8 files under `.codex/hooks/` at the original audit timestamp; these were subsequently removed, relocated, or migrated in the implementation follow-ups above
- 7 browser assets under `site/src/scripts/`
- package-script callers in composite commands, GitHub Actions, validation helpers, tests, current guidance, and project skills

The audit distinguishes removing an npm entry from deleting implementation code. Many package entries are orchestration names whose removal would not reduce repository code, while several files not named directly by `package.json` are imported implementations or worker modules and must remain.

## Owner-Confirmed Workflows

The following commands are actively used and are protected from removal:

- `report:video-segment-audit-risk`
- `report:video-topic-usage`
- `site:build`
- `site:build:workspace-pagefind`
- `fetch:video-links`
- `alternate:fetch:transcripts:safe`

`list:files-that-need-processing` was formerly used for a one-time large transcript backlog. It and `src/scripts/list-files-that-need-processing.ts` can remain retired. Its old complete sorted-path output was not identical to the current manifest/log-aware `audit:site-content` report, but that historical workflow is no longer required.

## Recommended Removals

### Confirmed Dead File

Delete `site/src/scripts/topics-index.js`.

Evidence:

- It has no Astro import, package command, hook caller, test caller, or dynamic import.
- Its `data-topic-directory`, controls, grid, card, sort, and filter selectors occur nowhere else in the current site.
- The current topic index uses ordinary navigation to the study-guide search and paginated/full topic directories instead of the retired client-side card filter.

This is the only implementation file proven to be dead without requiring a workflow decision.

### Strong Package-Entry Removals

These entries can be removed after migrating their very small caller/documentation surface:

1. `check:generated`
   - Exact alias for `npm run site:check`.
   - Its only executable caller is `check`.
   - Change `check` to call `site:check` directly, then update the exact command-contract tests and README row.

2. `append:site-content-processing-log`
   - Only exposed `site-content-pipeline-lock.mjs append-log`; the retained implementation now lives under `src/scripts/`.
   - Exact-name references are its package declaration and README row; current curator/auditor instructions do not call the npm alias.
   - Remove only the package entry and documentation row. Retain the lock hook and its validated append capability/tests.

3. `site:dev:generated`
   - Raw Astro development command against existing generated data.
   - No executable caller exists; `site:dev` does not call it.
   - It also lacks `site:dev`'s archive generation and agent-environment foreground workaround.

4. `site:build:full`
   - Exact composition of `site:build:astro` followed by `site:build:pagefind`.
   - No executable caller exists.
   - `npm run site:build:generated -- --force` is the safer replacement when a valid generated archive already exists because it retains archive integrity checks, required-asset validation, and cache recording.

### Package-Surface Entries That Are Removable but Low Value

- `check:site-seo`: pure convenience composition of `build` and `check:site-seo:built`. The compiled validator and `check:site-seo:built` must remain.
- `clean`: its action must remain before test compilation to prevent stale compiled tests. The npm entry could be inlined into `test`, but `npm run clean` is a conventional useful manual command.

### Repository-Policy Hook and Entry

Remove `check:repository-policy`, `.codex/hooks/check-repository-policy.mjs`, and `src/pipeline/repository-policy.test.ts`.

- The hook was added to enforce the one-time generated-archive untracking migration and included an explicit migration-only staged-deletion exception.
- Keeping generated output untracked and narrowly ignored is useful repository discipline, but it is not required for archive generation, validation, Astro, Pagefind, or deployment correctness.
- The exact-ignore-rule check enforced one spelling rather than a functional requirement.
- Its whitespace and clean-worktree checks were optional Git policy. No current user workflow invokes them independently.
- `.gitignore` continues to exclude the generated archive without maintaining a dedicated validator and fixture suite for that preference.

## Consolidation Opportunities

### Remove Duplicate Type Checking From `check`

`check` currently runs `check:types` and then `test`. `test` runs `build`, and both operations compile the same `tsconfig.json`; the build performs type checking while emitting output.

Keep `check:types` as the fast standalone no-output command, but allow `check` to begin with `npm test`. Re-add an explicit type-check stage if `test` ever stops building.

### Saved Live-Stream HTML Parser

`alternate:extract:live-streams-html` substantially overlaps:

```text
npm run alternate:extract:saved-channel-html -- --tab streams
```

The generic parser already accepts saved Streams pages and falls back to `ytInitialData`. Before retiring the specialized command, prove parity for:

- non-video lockup filtering
- video-ID endpoint fallbacks
- title, duration, publication, and view-count fields
- ignored-video handling
- continuation metadata
- output schemas consumed by the merge workflow

If parity is established, remove the package entry and the specialized CLI/module/test bundle while retaining the generic extractor.

### Lighthouse Surface

None of the five Lighthouse entries is required by CI, the production build, hooks, or source validation.

The preferred design is one parameterized TypeScript runner supporting:

- production or caller-supplied/local base URL
- home-only or representative five-route mode
- configurable output prefix
- internal report-directory creation

That one command could replace:

- `preaudit:lighthouse:home`
- `audit:lighthouse:home`
- `preaudit:lighthouse:local`
- `audit:lighthouse:local`
- `audit:lighthouse:seo-baseline`

The current home/local commands remain useful as quick single-page audits, while the SEO baseline is broader and requires generated video data. Do not simply delete the shortcuts unless that difference is accepted.

### Focused Topic Completeness Check

`check:video-topics` overlaps `audit:topic-normalization` because both can identify missing registry records. Retain it unless a merger preserves its focused actionable error, package/skill references, and contract tests. This is not an immediate removal.

### Transcript Schedule Audit

No tracked transcript schedule files currently exist. `audit:transcript-schedules` still validates externally supplied schedules and the repository continues to document schedule-lane coordination.

Remove the command, `src/scripts/audit-transcript-schedules.ts`, `src/pipeline/transcript-schedule-audit.ts`, and its test only after confirming that external schedule lanes are formally retired.

## Complete `package.json` Assessment

### Build and Validation

| Script | Verdict | Reason |
| --- | --- | --- |
| `clean` | Keep action; entry optional | `test` needs cleanup to prevent deleted tests from surviving as stale compiled JavaScript. |
| `build` | Keep | Compiles all TypeScript and produces the SEO validator consumed from `dist/`. |
| `check:types` | Keep | Useful fast no-output check; redundant only inside the current aggregate `check`. |
| `test` | Keep | Canonical clean, compile, and test operation. |
| `check:source` | Keep | Meaningful source-only grouping of topic, content, and report checks. |
| `check:generated` | Remove entry | Pure alias for `site:check`; only `check` calls it. |
| `check` | Keep and optimize | Canonical network-free validation; avoid its duplicate TypeScript pass. |
| `check:production` | Keep | Distinct rendered-site, official Pagefind, SEO, ranking, and date-validation phase. |
| `check:repository-policy` | Remove entry and hook | Migration-era Git hygiene is not required for site correctness or a current workflow. |
| `check:ci` | Keep | Actual GitHub Pages validation/deployment entrypoint. |

### Content, Topics, and Acquisition

| Script | Verdict | Reason |
| --- | --- | --- |
| `report:video-segment-audit-risk` | Keep | Actively used manual shard-audit queue. |
| `report:video-topic-usage` | Keep | Actively used and required by `check:source` and taxonomy maintenance. |
| `report:transcript-problems` | Manual keep | Distinct network-free report over stored transcript failures. |
| `audit:site-content` | Keep | Integration validator and current manifest/log-aware backlog report. |
| `diagnose:site-content-duplicates` | Manual repair keep | Supplies exact duplicate locations that generation errors do not. |
| `sync:video-topics` | Keep | Sole canonical additive topic-registry writer. |
| `check:video-topics` | Keep for now | Focused actionable completeness check embedded in current skills/contracts. |
| `audit:topic-normalization` | Keep | Required read-only taxonomy validation. |
| `append:site-content-processing-log` | Remove entry | Unused npm alias; keep the underlying hook. |
| `audit:transcript-schedules` | Conditional keep | No tracked schedules, but external schedule-lane support is still documented. |
| `audit:video-timestamp-alignment` | Manual keep | Checks source, metadata, manifest, shard, TXT, and generated-state alignment. |
| `fetch:video-links` | Keep | Actively used supported weekly acquisition entrypoint. |
| `fetch:video-metadata` | Repair keep | Independent resumable/forced metadata repair capability. |
| `alternate:extract:saved-channel-html` | Recovery keep | Current generic offline Videos/Streams parser. |
| `alternate:extract:live-streams-html` | Merge candidate | Substantial overlap with generic `--tab streams`; parity is not yet proven. |
| `alternate:merge:video-links` | Recovery keep | Combines Videos and Streams recovery outputs. |
| `alternate:fetch:transcripts` | Repair keep | Provides explicit limits, retries, force, and dry-run controls. |
| `alternate:fetch:transcripts:safe` | Keep | Actively used supported weekly preset. |
| `generate:site-data` | Keep | Critical deterministic archive generator used by development, checks, and builds. |

### Site and Pagefind

| Script | Verdict | Reason |
| --- | --- | --- |
| `site:dev` | Keep | Safe generation-owning dev server with the agent foreground workaround. |
| `site:dev:generated` | Remove entry | No executable caller and fewer safeguards than `site:dev`. |
| `site:preview` | Manual keep | Previews production output and Pagefind assets. |
| `site:check` | Keep | Canonical archive generation plus Astro diagnostics. |
| `site:check:generated` | Keep internal | Used by `site:check` and both coordinator helpers to avoid duplicate generation. |
| `site:build` | Keep | Actively used canonical cached production build. |
| `site:build:generated` | Keep internal | Required by `check:production` and coordinator validation. |
| `site:build:astro` | Keep internal | Called by the cached build wrapper. |
| `site:build:pagefind` | Keep internal | Required by the protected official build. |
| `site:build:pagefind:workspace` | Keep internal | Required by the protected workspace-Pagefind build. |
| `site:build:full` | Remove entry | No executable caller; forced generated build is safer. |
| `site:build:workspace-pagefind` | Keep | Actively used workspace-Pagefind build. |
| `check:workspace-pagefind` | Keep | Adds parity, ranking, and date checks beyond merely building. |
| `check:pagefind-contract` | Keep | Distinct exact-count and representative-query parity contract. |
| `check:search-ranking` | Keep | Production search and rendered-UI regression coverage. |
| `check:rendered-video-dates` | Keep | Exhaustive rendered HTML/Pagefind date and state validation. |
| `check:site-seo` | Optional package removal | Convenience composition with no executable caller. |
| `check:site-seo:built` | Keep internal | Required by `check:production`. |

### Lighthouse

| Script | Verdict | Reason |
| --- | --- | --- |
| `preaudit:lighthouse:home` | Consolidate | Duplicates the local pre-hook's directory creation. |
| `audit:lighthouse:home` | Optional manual | Fast one-page production audit; not used by builds or CI. |
| `preaudit:lighthouse:local` | Consolidate | Identical report-directory creation. |
| `audit:lighthouse:local` | Optional manual | Fast local-preview audit; not used by builds or CI. |
| `audit:lighthouse:seo-baseline` | Manual keep/consolidate | Broader five-route audit; requires generated video data and has no pass/fail thresholds. |

## Files Not Directly Exposed by `package.json`

### Browser Assets

| File | Verdict | Caller or role |
| --- | --- | --- |
| `site/src/scripts/archive-page-jump.js` | Keep | Imported by video and topic paginated browse routes. |
| `site/src/scripts/search-ranking.js` | Keep | Emitted by the search page and dynamically used by `site-search.js`; directly tested. |
| `site/src/scripts/search-submit-feedback.js` | Keep | Imported by the topic-index page for loading and ARIA feedback. |
| `site/src/scripts/site-search.js` | Keep | Core rendered search UI and Pagefind loader. |
| `site/src/scripts/theme-interaction.js` | Keep | Imported site-wide by `BaseLayout.astro`; its hashed output is build-validated. |
| `site/src/scripts/time-notes-finder.js` | Keep | Core Pagefind-backed Time Notes finder. |
| `site/src/scripts/topics-index.js` | Delete | No caller and no live matching markup. |

### Shared TypeScript Implementations and Workers

Keep all of the following. They are active imported implementations or worker infrastructure, not obsolete Node variants:

- `src/scripts/sync-video-topics.ts`
- `src/scripts/report-video-topic-usage.ts`
- `src/scripts/generate-site-data.ts`
- `src/scripts/audit-topic-normalization.ts`
- `src/scripts/youtube-api-key-file.ts`
- `src/scripts/console-run-timer.ts`
- `src/scripts/bun-worker-runner.ts`
- `src/scripts/bun-worker-options.ts`
- `src/scripts/bun-video-segment-shards.ts`
- `src/scripts/bun-video-segment-shard-worker.ts`
- `src/scripts/bun-topic-normalization.ts`
- `src/scripts/bun-topic-normalization-worker.ts`

`src/scripts/check-site-seo.ts` is another important non-obvious case: TypeScript compilation emits `dist/scripts/check-site-seo.js`, which is invoked by `check:site-seo:built`.

### Tests

All seven `src/scripts/*.test.ts` files should remain. They are discovered through the compiled `dist/**/*.test.js` glob even though `package.json` does not name them individually:

- `audit-topic-normalization.test.ts`
- `bun-topic-normalization.test.ts`
- `bun-worker-options.test.ts`
- `console-run-timer.test.ts`
- `generate-site-data.test.ts`
- `package-command-surface.test.ts`
- `rank-video-segment-audit-risk.test.ts`

### Build and Coordinator Helpers

Keep these active implementations under `src/scripts/`:

- `run-workspace-pagefind.mjs`: required by the actively used workspace Pagefind build
- `site-build-if-changed.mjs`: implementation behind cached official and workspace builds
- `site-build-support.mjs`: imported by the build wrapper and Astro configuration
- `site-content-pipeline-lock.mjs`: shared writer lease, recovery, and validated-log infrastructure
- `site-dev.mjs`: implementation behind the safe development command
- `validate-content-pipeline.ts`: documented coordinator validation under one writer lease
- `validate-site.ts`: documented site-focused coordinator validation helper
- `validation-workflow.ts`: shared lease-aware subprocess and cleanup implementation for both validation CLIs

The TypeScript validation CLIs are not package commands or aliases. Their persistent lease acquisition, token propagation, ordered validation stages, and `finally` release behavior remain distinct.

## Required Follow-Up When Implementing Cleanup

Any command removal or consolidation must update all affected current contracts together:

- `package.json`
- `README.md`
- `AGENTS.md` where applicable
- affected `.agents/` briefs or skills
- `src/pipeline/shared-output.test.ts`
- `src/scripts/package-command-surface.test.ts`
- `src/site/concurrency-settings.test.ts`

The recommended first implementation slice is:

1. delete `site/src/scripts/topics-index.js`
2. remove `check:generated`
3. remove `append:site-content-processing-log`
4. remove `site:dev:generated`
5. remove `site:build:full`
6. eliminate the duplicate `check:types` invocation inside `check`
7. remove `check:repository-policy`, its hook, and its dedicated test after owner review

The saved-stream parser and Lighthouse consolidation should be separate follow-up changes because they require parity or interface design work rather than pure zero-caller removal.
