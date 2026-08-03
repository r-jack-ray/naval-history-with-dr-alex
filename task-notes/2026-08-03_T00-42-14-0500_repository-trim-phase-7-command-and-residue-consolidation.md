# Repository Trim Phase 7: Command and Residue Consolidation

Timestamp: 2026-08-03T00:42:14-05:00

Status: Phase 7 is complete and uncommitted for owner review. This checkpoint covers only exact command aliases, one zero-caller unprocessed-file writer, current command/help guidance, and the focused regression contract. It does not authorize deferred repository-weight work, source moves, canonical-data changes, dependency changes, or another phase.

## Removed Names and Replacements

| Removed name | Supported replacement | Zero-caller and parity evidence |
| --- | --- | --- |
| `check:quick` | `check:types` | The alias was exactly `npm run check:types`. Its only executable caller was the canonical `check` package script; current README and package-contract assertions were migrated. |
| `check:functional` | `test` | The alias was exactly `npm test`. Its only executable caller was the canonical `check` package script; current README and package-contract assertions were migrated. |
| `alternate:extract:videos-html` | `alternate:extract:saved-channel-html -- --tab videos` | The alias was exactly the generic saved-channel extractor with `--tab videos`. Current README and channel guidance were its only repository consumers; both now invoke the canonical command explicitly. The generic CLI continues to default to the videos tab and its help now shows the explicit replacement. |
| `list:files-that-need-processing` and `src/scripts/list-files-that-need-processing.ts` | The restart-safe `alternate:fetch:transcripts:safe` handoff for newly stored TXT, and `audit:site-content` for the current missing-shard backlog | CodeGraph found no code caller for the standalone top-level writer. The pre-edit repository search found only its package declaration, one current README row, and its own implementation; no hook, workflow, test, skill, or source consumer used its output. `audit:site-content` derives uncurated records from manifest videos absent from curated segments and prints their manifest TXT paths. |

The ignored zero-byte `task-notes/files-that-need-processing.txt` and other ignored owner scratch files were left untouched. Completed historical task notes were not rewritten; they may retain old names as historical evidence. Current authoritative guidance has no positive reference to a removed command. Focused tests retain only explicit negative assertions that these names stay retired.

## Remaining Package Command Inventory

`package.json` now exposes 53 commands. Each is classified once below.

### Routine (12)

Normal contributor, weekly-owner, integration, or development entrypoints:

- `build`, `check:types`, `test`, `check`, `check:ci`
- `fetch:video-links`, `alternate:fetch:transcripts:safe`
- `generate:site-data`, `site:dev`, `site:preview`, `site:check`, `site:build`

### Repair (8)

Explicit source repair, recovery, alternate acquisition, or low-level source-write entrypoints:

- `fetch:video-metadata`
- `alternate:extract:saved-channel-html`, `alternate:extract:live-streams-html`, `alternate:merge:video-links`
- `alternate:fetch:transcript`, `alternate:fetch:transcripts`
- `sync:video-topics`, `append:site-content-processing-log`

### Internal Build Stage (15)

Stages retained because composite commands, hooks, npm lifecycle behavior, or raw official/custom build paths consume them:

- `clean`, `check:source`, `check:generated`, `check:production`, `check:repository-policy`
- `site:dev:generated`, `site:check:generated`, `site:build:generated`, `site:build:astro`
- `site:build:pagefind`, `site:build:pagefind:workspace`, `site:build:full`
- `check:site-seo:built`, `preaudit:lighthouse:home`, `preaudit:lighthouse:local`

### Local Audit (18)

Read-only reports, validators, diagnostics, explicit custom-Pagefind parity runs, and opt-in Lighthouse audits:

- `report:video-segment-audit-risk`, `report:video-topic-usage`, `report:transcript-problems`
- `audit:site-content`, `diagnose:site-content-duplicates`, `check:video-topics`, `audit:topic-normalization`
- `audit:transcript-schedules`, `audit:video-timestamp-alignment`
- `site:build:workspace-pagefind`, `check:workspace-pagefind`, `check:pagefind-contract`
- `check:search-ranking`, `check:rendered-video-dates`, `check:site-seo`
- `audit:lighthouse:home`, `audit:lighthouse:local`, `audit:lighthouse:seo-baseline`

## Retained Helpers and Boundaries

- `.codex/hooks/validate-content-pipeline.ps1` and `.codex/hooks/validate-site.ps1` remain documented coordinator validation helpers. They group operations under a caller-supplied or internally acquired writer lease and are not exact aliases for one package command.
- `.codex/hooks/site-content-pipeline-lock.mjs` remains the low-level lease and validated-log helper used by package scripts and documented coordinator recovery.
- Raw and generated site stages remain separate. `generate:site-data`, `site:check:generated`, `site:build:generated`, `site:build:astro`, and `site:build:full` were not collapsed.
- Official packaged Pagefind remains the portable production default. The workspace binary, its raw stage, its cached build, and its parity check remain explicit supported alternatives.
- Official YouTube inventory/metadata acquisition remains separate from caption scraping. The single, bounded batch, safe weekly batch, saved-HTML recovery, and metadata-repair entrypoints remain supported.
- All mandatory report commands, topic synchronization/audit boundaries, transcript recovery paths, writer leases, and canonical source files remain unchanged.

## Focused Validation

- `npm run check:types` passed.
- `node --import tsx --test src/scripts/package-command-surface.test.ts` passed: 1 test, 0 failures.
- The focused `src/pipeline/shared-output.test.ts` command-contract test passed after its stale `check:production` expectation was aligned with the committed Phase 2 policy: 1 test, 0 failures.
- `npm run alternate:extract:saved-channel-html -- --help` passed and showed the canonical explicit videos/streams forms.
- `npm run report:video-segment-audit-risk -- --help` passed and directs missing-shard review to `audit:site-content`.
- A package/inventory comparison confirmed that all 53 remaining commands appear exactly once in the four checkpoint classifications.
- A current authoritative caller search found no positive use of the four retired command names outside negative regression assertions. Historical task notes were intentionally excluded from migration.
- `git diff --check` passed for tracked changes. Separate no-index whitespace checks passed for the new focused test and this checkpoint.

No site generation, Astro/Pagefind build, topic report, topic synchronization, corpus audit, live network request, canonical source edit, ignored-output cleanup, package install, staging operation, commit, push, or history rewrite was performed.
