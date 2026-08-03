# Repository Trim Phase 4: Acquisition and Curation Handoff

Timestamp: 2026-08-02T22:16:36-05:00

Corrected: 2026-08-02T22:54:15-05:00

Status: Phase 4 is complete, corrected after owner review, and uncommitted for owner review. This checkpoint covers only the weekly acquisition/curation handoff and does not authorize or implement Phase 5 or any later repository-trim phase.

## Implemented Behavior

- Kept `fetch:video-links` as the supported weekly inventory and official-metadata reconciliation command, and kept `fetch:video-metadata` as the independently rerunnable metadata repair command. Caption scraping remains a separate command and failure domain.
- Changed `alternate:fetch:transcripts:safe` to retain its 60-second request delay while supplying `--retry-failed`. A later ordinary safe run now retries every ready record that still lacks valid TXT, including saved failures, without forcing a refetch of valid stored TXT.
- Retained the lower-level `alternate:fetch:transcripts` command and its `--retry-failed` option for bounded/manual operation. The single-video fetch and saved-HTML inventory/repair commands remain supported and unchanged.
- Cleared a saved failure when the manifest-owned TXT is already readable, while preserving the existing valid-TXT skip, ignored-video exclusion, 61-second cutoff, metadata readiness/deferred states, shared request pacing, and schema-2 status checkpoint.
- Added a run-local circuit breaker for `rate_limited_or_blocked` failures. The triggering failure is checkpointed, later stored/deferred records are still classified without a request, and every later ready missing record is left pending for the next safe run.
- Added a deterministic end-of-run handoff. It sorts and lists newly stored portable TXT paths, deferred records, failures produced by that run, and still-pending records; it then instructs the owner to run one single-agent curator task per listed TXT and at least two independent sequential single-agent auditor tasks per resulting shard.
- Made the new-TXT handoff restart-safe. Schema-2 status now retains `pendingHandoffTxtPaths` after every successful transcript write. The CLI clears those paths only after the formatted handoff has been flushed to standard output, so interruption before delivery causes the next run to re-emit the paths while successful delivery prevents duplicate handoffs.
- Updated current CLI help and owner guidance in `README.md`, `AGENTS.md`, and `src/transcripts/README.md` to describe the exact four-stage weekly sequence and its ownership boundaries.

## Retired Public Aliases

| Retired name | Supported replacement | Evidence |
| --- | --- | --- |
| `alternate:fetch:transcripts:retry` | `alternate:fetch:transcripts:safe` for the weekly recovery path; base command plus `--retry-failed` for an explicit bounded run | The safe command now retries saved failures that remain ready and lack valid TXT. No current caller remains. |
| `alternate:fetch:transcripts:retry:safe` | `alternate:fetch:transcripts:safe` | The supported safe command retains the 60-second delay and no longer forces already valid TXT. No current caller remains. |

Completed historical task notes were not rewritten and may still name the retired aliases as historical evidence.

## Focused Validation

- `node --import tsx --test src/youtube/batch-transcripts.test.ts` passed all 15 focused offline fixtures. Coverage includes stored TXT and stale-failure cleanup, metadata-free fetching, ignored and short-video policy, deferred states, missing-TXT recovery, manifest-stem preservation, saved-failure retry eligibility, per-attempt failure checkpoint recovery, interrupted handoff re-emission and acknowledgement, circuit breaking, safe-command pacing/alias wiring, and exact deterministic handoff text.
- `npm run check:types` passed.
- `npm run alternate:fetch:transcripts:safe -- --help` completed without a network request and displayed both supported batch entrypoints, the safe command example, its included retry behavior, and the distinct 5-second base versus 60-second safe pacing.
- A live-guidance/caller search across `package.json`, README/AGENTS, source, hooks, workflows, and agent files found no use of either retired retry alias outside the focused negative assertions. Historical task notes were intentionally excluded.
- `git diff --check` passed for every tracked Phase 4 change. A no-index `--check` of this new checkpoint produced no whitespace diagnostics (its exit code was 1 only because the file differs from `NUL`), and the file ends with a newline.

No live YouTube request, canonical channel/transcript/status mutation, repository-wide test suite, archive generation, Astro/Pagefind build, topic synchronization/audit, dependency change, package install, content-skill edit, staging operation, commit, push, or later-phase task was performed.

## Boundaries Preserved

- The supported sequence remains `fetch:video-links`, `alternate:fetch:transcripts:safe`, one exact-TXT curator task, and at least two sequential exact-shard auditor tasks.
- Inventory/metadata acquisition and transcript caption scraping remain independently rerunnable systems.
- Each curator and auditor remains single-agent and file-scoped; the new printed handoff does not select, batch, parallelize, or execute those tasks.
- `src/transcripts/fetch-status.json` remains schema 2 and continues to checkpoint saved failures and progress after each attempt. Its additive `pendingHandoffTxtPaths` field makes successful acquisition-to-curation delivery durable without requiring migration by existing report or timestamp-audit consumers.
- Generated archives, site code, topic policy/registry/shards, content skills and briefs, dependencies, reports, and Phases 5-7 were untouched.
