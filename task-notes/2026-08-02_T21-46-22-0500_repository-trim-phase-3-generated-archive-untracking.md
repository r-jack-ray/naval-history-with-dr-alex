# Repository Trim Phase 3: Generated Archive Untracking

Timestamp: 2026-08-02T21:46:22-05:00

Status: Phase 3 is complete and uncommitted for owner review. Exactly 67 deterministic archive removals are staged, with no other staged path. Their working files remain present and ignored. This checkpoint covers only Phase 3 and does not authorize or implement Phase 4 or any later repository-trim phase.

## Implemented Policy

- Added the anchored `/site/src/data/generated/archive/` rule to the root `.gitignore`.
- Removed all 67 generated archive paths from the Git index with `git rm --cached`; no working archive file was deleted or regenerated.
- Extended `check:repository-policy` to require both an empty tracked archive path set and the exact anchored root ignore rule. It retains whitespace and tracked-worktree checks, permits the coherent staged archive removals during this transition, and prints a clear not-applicable result when the source package is not itself a Git checkout root.
- Added `src/pipeline/repository-policy.test.ts` with isolated coverage for non-Git packages, tracked archive rejection, rejection of an overbroad replacement ignore rule, and acceptance of staged index removals with the ignored working file preserved.
- Updated current guidance in `README.md`, `AGENTS.md`, `.agents/site-archive-builder.md`, and `.agents/skills/naval-video-page-prototype/SKILL.md`. The archive is now described as generated and ignored, never hand-edited or committed; `index.json` remains its runtime manifest.

No generator, Astro, Pagefind, topic, report, acquisition, dependency, canonical-content, archive-schema, integrity, cache, atomic-publication, or writer-lease behavior changed.

## Post-Change Snapshot

| Measure | Before Phase 3 | After index removal |
| --- | ---: | ---: |
| Tracked archive paths | 67 | 0 |
| Tracked archive working bytes | 151,074,107 bytes (144.08 MiB) | 0 bytes in the index; 151,074,107 bytes intentionally retained in the active working directory |
| Working archive files | 67 | 67 |
| `index.json` present | yes | yes |
| `index.json` SHA-256 | `A39A58B8E20539B14495A58D72595C77FA911364FD52B68DE9978373F0D5B6F4` | unchanged |

`git check-ignore -v --no-index -- site/src/data/generated/archive/index.json` reports:

```text
.gitignore:38:/site/src/data/generated/archive/	site/src/data/generated/archive/index.json
```

The current `HEAD` remains `5915a0a8f2ee8ba842d8ef9c8e07fdae02666c42`. Before and after index removal, `git count-objects -v` reported 4,922 loose objects, 25,143 packed objects across three packs, and the same byte counts. No commit, garbage collection, pack rewrite, or history rewrite occurred, so historical Git objects and existing clone history are unchanged. After the owner commits Phase 3, new checkouts will omit the 144.08 MiB generated current-tree projection; the active working directory intentionally retains it until normal regeneration replaces it.

## Validation

- `git ls-files -- site/src/data/generated/archive` returned no path.
- The anchored ignore probe returned the exact root `.gitignore` rule shown above.
- The working archive remained at 67 files and 151,074,107 bytes immediately after index removal; `index.json` remained present with the same SHA-256.
- `git diff --cached --name-status` contained exactly 67 `D` records under `site/src/data/generated/archive/` and no other staged path.
- Focused policy regression: `node --import tsx --test src/pipeline/repository-policy.test.ts` passed 4 of 4 tests.
- TypeScript validation: `npm run check:types` passed.
- The actual `npm run check:repository-policy` package command passed in a minimal clean Git policy fixture containing the current hook, package script, and `.gitignore`. This was a focused fixture, not a clone or build. In the active checkout, the hook passed its new archive checks and then correctly reported the known unstaged implementation and pre-existing task-note edits through its retained clean-worktree guard.
- Both unstaged and staged `git diff --check` passed.
- A current-guidance search found no remaining statement that the generated archive itself is tracked; rejection messages and tests intentionally retain the word `tracked` when describing the forbidden state.

The Phase 0 and Phase 2 timing, determinism, source-read-only, missing-archive, topic-curation, Astro, and Pagefind evidence was reused. Phase 3 did not run archive generation, `npm ci`, a fresh-clone campaign, the complete test suite, Astro, either Pagefind implementation, Node/Bun comparisons, or performance benchmarks.

## Boundaries Preserved

- The 67 archive working files are ignored but recoverable through the existing source-read-only generation entrypoints.
- `index.json`, its 64 segment buckets, provenance and hash checks, manifest-last publication, cache sentinels, writer lease, and complete-directory validation remain intact.
- Canonical channel, transcript, curated shard, topic-registry, normalization-policy, report, and processing-log sources were untouched.
- The pre-existing unstaged Phase 2 checkpoint edit was preserved without modification.
- No path other than the 67 archive removals was staged. No commit, push, dependency install, history rewrite, Phase 4 work, or later-phase work was performed.
