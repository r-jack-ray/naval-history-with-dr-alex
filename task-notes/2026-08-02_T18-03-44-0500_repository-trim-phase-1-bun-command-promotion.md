# Repository Trim Phase 1: Bun Command Promotion

Timestamp: 2026-08-02T18:03:44-05:00

Reviewed: 2026-08-02T18:23:58-05:00

Corrected: 2026-08-02T18:35:51-05:00

Status: Phase 1 completed. The reviewed generator CLI tests and live writer-lease help example now invoke the promoted Bun CLI, the archive-integrity assertion is structurally coupled to `ensureBuiltSite`, and the full Phase 1 validation gate was rerun. This checkpoint covers only Phase 1 and does not authorize or implement Phase 2 or any later repository-trim phase.

## Implemented Command Contract

The four public commands now invoke their existing Bun worker entrypoints:

| Canonical command | Bun worker |
| --- | --- |
| `report:video-topic-usage` | `src/scripts/report-video-topic-usage-bun.ts` |
| `sync:video-topics` | `src/scripts/sync-video-topics-bun.ts` |
| `audit:topic-normalization` | `src/scripts/audit-topic-normalization-bun.ts` |
| `generate:site-data` | `src/scripts/generate-site-data-bun.ts` |

The corresponding `:bun` aliases were removed after caller migration. Their former Node direct-execution files now remain only as runtime-neutral parsers, writers, and shared command implementations imported by the Bun CLIs; the underlying business logic was not duplicated or rewritten.

`Bun 1.3.14` is pinned in `.bun-version`, and the GitHub Pages workflow installs that exact runtime with `oven-sh/setup-bun@v2` before any canonical command can run. npm and `package-lock.json` remain the dependency-install contract.

The PowerShell validation hooks now call the repository-owned canonical npm commands while retaining the exported writer-lease token. The archive-build fingerprint includes `.bun-version` and its cache version was advanced so a runtime-pin change invalidates a previously successful archive-generation cache.

README and `AGENTS.md` describe the canonical Bun-backed commands and their pinned runtime. Current agent/skill briefs already invoked only the unsuffixed commands, so no generated-data or shard-workflow instruction was changed.

## Validation

`bun --version` reported the pinned `1.3.14` runtime. The correction canary used a new complete isolated shard copy at `.tmp/phase1-correction-20260802/`.

All four canonical commands passed against that isolated copy:

- `audit:topic-normalization` reported 2,142 shards, 25,258 registry topics, 25,212 used topics, 0 blockers, and 0 review findings with `runtime=bun workers=8`.
- `report:video-topic-usage` regenerated both documented companion outputs with the Phase 0 hashes: `video-topic-usage.tsv` `1F41C354425D63219491229EE5F83C64933C477055A8A7C7C5436747B5908DE9` and header-only `topic-normalization-review.tsv` `A3341F1C8B853455FF67467BDDCB589E63CB124BFD0502B5961E146E8D34A1A4`. Their complete human-readable headers, including exact source and recommended-action fields, were preserved.
- `sync:video-topics` joined the shared writer lease and reported the isolated registry already current. Its SHA-256 remained `6AE34EDA12D1219DC795ABCF3FA257492184AF6922F5E9C1645CB972D5E9B05B`, identical to the source registry; the source registry was not modified.
- `generate:site-data` joined the shared writer lease and emitted schema 7 with 2,142 videos, 58,958 segments, 25,258 topics, and all 67 expected files. All 66 manifest-listed data-file hashes verified independently. `videos.json`, `topics.json`, and `segments/00.json` matched their Phase 0 SHA-256 values exactly. A second generation produced the identical full-tree digest `D7475981FFB486AE3DCD708C8D4EF50573AFE67644A8D8A56D6E40E06E5DBD73`.

The third mandatory retained report, `report:video-segment-audit-risk`, regenerated successfully at its documented ignored path with its human-readable header intact.

The corrected caller and structural contracts passed in both execution modes:

- Compiled Node focus: `node --test dist/scripts/generate-site-data.test.js dist/pipeline/shared-output.test.js` - 14 passed.
- Bun source focus: `bun test src/pipeline/shared-output.test.ts src/scripts/generate-site-data.test.ts --test-name-pattern "canonical Bun|GitHub Pages|validation hooks|generation rejects"` - 5 passed.
- `npm run check:types` - passed.

The full unsandboxed `npm test` run compiled successfully and reported 224 tests: 218 passed and 6 failed. Both former Phase 1 generator regressions now pass. The remaining six failures are the same pre-existing topic-normalization/store fixture mismatches already recorded in the Phase 0 baseline and earlier Phase 1 review; no later-phase fixture migration was performed here.

Sandboxed Bun subprocess and report-write attempts reproduced `EPERM`; the same focused tests and report command passed with scoped sandbox escalation. These failures are therefore classified as sandbox interference, not as Windows, antivirus, or external file-lock evidence.

## Boundaries Preserved

- `sync:video-topics` remains the sole explicit public topic synchronization command and still retains its writer lease and atomic `topics.json` behavior.
- `generate:site-data` still performs its existing topic synchronization before archive generation. Moving that source-writing behavior is explicitly deferred to Phase 2.
- The archive remains tracked. No `.gitignore` policy, untracking operation, history rewrite, staging, commit, push, dependency change, Pagefind implementation, acquisition command, or source-tree move was performed.
