# Repository Trim Phase 6: Topic-Curation Workflow and Report Lifecycle

Timestamp: 2026-08-03T00:01:32-05:00

Reviewed: 2026-08-03T00:07:05-05:00

Status: Phase 6 is complete and uncommitted for owner review. This checkpoint covers only current workflow/report documentation, focused Type-designation regression fixtures, and the retained report-command help correction. It does not authorize or implement Phase 7.

## Implemented Behavior

- Corrected the stale `rank:video-segment-audit-risk` name in current `README.md`, `AGENTS.md`, and the CLI usage string to the retained `report:video-segment-audit-risk` package command. Historical task notes were not rewritten.
- Expanded the current topic-maintenance guidance into one end-to-end owner workflow: explicit authorization, the two companion reports, source review and mapping, the normalization catalog, exact shard topic-reference updates, registry preservation, additive synchronization, read-only audit, and repository-owner generated-data handoff.
- Documented that reports are ignored, on-demand, noncanonical local outputs. Added explicit owners and lifecycles for the three mandatory keep reports and inventoried the other supported report families without removing any artifact or command.
- Added guidance regression coverage for the retained report command, the complete topic-curation handoff, mandatory report ownership/lifecycle, and the unrelated report inventory.
- Added a production-catalog fixture that freezes the already-reviewed Type-designation direction without changing the catalog, registry, or any shard.

## Type-Designation Fixture

The focused fixture now covers:

- bare, generic `-class`, and plural inputs through `type-212`, `type-212-class`, and `type-212-submarines`
- the singular canonical `type-212-submarine` no-op
- alphanumeric `type-052c` and the distinct `type-212cd` design
- Roman-numeral `type-ix-submarines` and its `type-ix-u-boat` canonical form
- non-ship referents through `type-12-missile` and canonical `type-267-radar`
- a direct assertion that Type 212 and Type 212CD resolve separately
- the intentionally unresolved `type-212a`, which remains unchanged without a reviewed evidence-backed rule

No Type 212A record, similarity-based family merge, taxonomy rule, registry record, or shard reference was added.

## Mandatory Report Ownership and Lifecycle

| Report | Generator | Owner/use | Lifecycle |
| --- | --- | --- | --- |
| `reports/video-segment-audit-risk.tsv` | `report:video-segment-audit-risk` | Repository owner manually prioritizes shard repair and follow-up review. | Mandatory keep; ignored, on-demand, and replaced by each run. |
| `reports/video-topic-usage.tsv` | `report:video-topic-usage` | Repository owner and Codex inspect usage, classification, aliases, normalization inputs, similarity, and co-topic context. | Mandatory keep; ignored, on-demand companion output, and replaced by each run. |
| `reports/topic-normalization-review.tsv` | `report:video-topic-usage` | Repository owner and Codex review exact policy matches, collisions, exact sources, and recommended actions. | Mandatory keep; ignored, on-demand companion output, and replaced by each run even when header-only. |

## Unrelated Report Inventory

No unrelated report was retired or modified as canonical source.

| Report/output | Current evidence | Phase 6 disposition |
| --- | --- | --- |
| `reports/site-content-backlog.md` | Current 453-byte ignored output of `audit:site-content`. | Retained as an on-demand repository-owner/coordinator validation report. |
| `reports/transcript-problems.md` | Current 7,550-byte ignored output of `report:transcript-problems`. | Retained as an on-demand transcript-maintenance diagnostic. |
| `reports/google-search-opportunity-audit.md` | Current 25,592-byte ignored manual analysis; a targeted current-source/config search found no package generator or caller. | Left untouched; it is not promoted to a supported command contract and no deletion is authorized. |
| `reports/lighthouse/**` | Supported by the three explicit Lighthouse audit commands; no current output directory was required for this phase. | Retained as opt-in site-maintainer smoke-test output. |
| Acquisition probe/extraction JSON under `reports/` | Supported only through explicit output flags on inventory or saved-HTML workflows. | Retained as operator-managed scratch output; it never replaces canonical channel source. |

The existing `reports/video-segment-audit-risk.tsv` was inspected but not regenerated. Its human-readable header remains intact.

## Focused Validation

- The two new current-guidance tests passed: 2 tests, 0 failures.
- The new production Type-designation test passed: 1 test, 0 failures.
- Existing stable-header fixtures for both topic reports passed: 3 tests, 0 failures.
- `npm run report:video-segment-audit-risk -- --help` passed and printed only the retained command name.
- `npm run report:video-topic-usage` completed once with Bun 1.3.14 in 40.827 seconds: 25,258 topics, 2,142 videos, 25,212 used topics, 46 unused topics, 0 unregistered topics, 0 normalization blockers, and 0 normalization-review findings. The usage report retained its ten human-readable columns and 25,259 lines; the companion review report is the expected one-line header-only TSV.
- `npm run audit:topic-normalization` completed once with 2,142 shards, 25,258 registry topics, 25,212 used topics, 0 blockers, and 0 review findings.
- Both Bun commands first hit sandbox `EPERM` reads and then passed unchanged under the required narrow sandbox escalation. This was a runner boundary, not a repository failure.
- `git diff --check` passed after the checkpoint and plan cursor updates.

A broader diagnostic run of the related production-policy test file surfaced four of the plan's already-recorded topic-policy baseline failures: the prior Type 91 expectation, two historical rule-count expectations, and the prior Type UB III display expectation. The new Phase 6 fixture passed in that same run. Those unrelated baseline assertions were recorded and intentionally not repaired or rerun as a broader corpus task.

## Boundaries Preserved

No `sync:video-topics`, taxonomy edit, registry edit, shard edit, archive generation, Astro/Pagefind command, live network request, repository-wide test suite, dependency change, benchmark, staging operation, commit, push, history rewrite, or Phase 7 work was performed.
