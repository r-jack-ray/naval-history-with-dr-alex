# Plan: Rationalize the Root `src/` Structure

Timestamp: 2026-07-26T12:31:20-05:00

Status: planning only; no source files, datasets, commands, or path contracts have been changed.

## Purpose

Reorganize the repository's root `src/` tree around clear domain boundaries, put repository-owned persisted contracts under one direct `src/schemas/` folder, remove misleading or catch-all groupings, and eliminate nesting that does not earn its path depth.

This plan deliberately separates structural rationalization from content changes. Implementation must preserve transcript identity, manifest-owned `fileStem` values, curated segment content, topic policy, processing history, generated archive behavior, package command names, Astro routes, and Pagefind output.

## Scope

In scope:

- Every file and subfolder under the root `src/`.
- Imports, tests, CLI adapters, default paths, and runtime validators affected by those moves.
- The repository guidance, hooks, skills, Astro adapter, and generated archive manifest that consume root-`src` paths.
- A one-time, validated migration of canonical path strings in the processing log if the video-shard directory moves.
- Clarifying the boundary between tracked API-key loader code and the ignored local YouTube credential file used by package commands.

Out of scope:

- Rewriting transcript text or curated segment prose.
- Renaming any transcript or video shard `fileStem`.
- Changing persisted data shapes or schema-version numbers merely because files move.
- Changing site routes, page design, search behavior, Pagefind behavior, or the generated archive contract.
- Reorganizing `site/src/`; it is a separate Astro source tree.
- Updating completed historical task notes solely to replace old paths.
- Committing, pushing, deploying, or resuming automations.

## Verified Current Baseline

The review covered the complete root `src/` tree, including both large corpora.

| Current area | Files | Approximate size or TypeScript lines | Current responsibility | Assessment |
| --- | ---: | ---: | --- | --- |
| `src/` root | 3 TS | 122 lines | Project constant, segment kinds, timestamps, URLs, video naming | Ambiguous root dumping ground; split into schemas and shared helpers. |
| `src/channel/` | 3 | 12.18 MiB | Episode inventory, YouTube metadata, local README | Cohesive source-data boundary; retain. |
| `src/content/` | 11 TS | 2,559 lines | Audits, reports, log parsing, risk scoring, archive seed model | Mixes unrelated curation, topic, transcript, and archive concerns. |
| `src/content/schemas/` | 7 TS | 558 lines | Zod schemas for four content-owned persisted formats | Correct idea, but unnecessarily nested and incomplete relative to other persisted contracts. |
| `src/derived/` | 3 | 2.00 MiB | Processing config/log and topic normalization policy | `derived` is misleading because these are authored policy or canonical workflow state. |
| `src/derived/video-segments/` | 2,137 JSON | 90.36 MiB | 2,136 canonical video shards plus `topics.json` | Source of truth, not disposable derived output; the topic registry is also not a video shard. |
| `src/pipeline/` | 4 TS | 1,293 lines | Atomic writes, schedule audit, broad integration test | Generic file utility, workflow logic, and integration testing are grouped by accident. |
| `src/pipeline/test-support/` | 1 TS | 90 lines | Worker used by one integration test | An unjustified single-file nesting level. |
| `src/scripts/` | 26 TS | 4,268 lines | Package CLI entrypoints and some substantial application logic | Keep as the flat CLI boundary, but extract non-CLI logic and the API-key helper. |
| `src/site/` | 32 TS + 1 JSON | 6,848 lines | Archive generation, topics, SEO, search ranking, build guidance | Largest structural problem: a catch-all that duplicates the meaning of top-level `site/`. |
| `src/transcripts/` | 3 | 1.52 MiB | Manifest, ingestion status, local README | Cohesive source-data boundary; retain. |
| `src/transcripts/txt/` | 2,136 TXT | 182.02 MiB | Canonical timestamped transcript corpus | The nesting is justified by corpus size and the sibling manifest/status files. |
| `src/youtube/` | 13 TS | 5,688 lines | Channel, metadata, HTML extraction, transcript ingestion | Broad but cohesive provider boundary; keep flat for now. |

Additional findings:

- The tree currently contains 4,380 files. The transcript and video-shard corpora account for 4,273 of them.
- There are 97 TypeScript files and approximately 21,426 TypeScript lines.
- `src/site/` and `src/content/` import one another. The observed cross-boundary imports include nine `site -> content` imports and three `content -> site` imports, showing that the current names do not represent a one-way architecture.
- Repository-owned persisted shapes are spread across `src/index.ts`, `src/youtube/`, `src/content/schemas/`, `src/site/archive-data.ts`, `src/site/topic-normalization.ts`, and `src/scripts/check-search-ranking.ts`.
- Several repository-owned JSON files are loaded with unchecked `JSON.parse(... as SomeType)` casts, while only the curated-content formats use a consistent central runtime-schema boundary.
- `src/site/video-segment-files.ts` has to special-case `topics.json` because the shared topic registry is stored among per-video shards.
- `src/scripts/check-search-ranking.ts` is 1,224 lines. It is application/test logic presented as a CLI entrypoint, not a thin adapter.
- `src/index.ts` exports `projectName`, a legacy `VideoSegment` interface, and `youtubeTimestampUrl`; current production code does not consume those exports. Its remaining live responsibilities are segment-kind ownership and timestamp formatting.

## Rationalization Rules

1. **Use direct domain folders.** Prefer `src/topics/` to `src/site/topics/` or `src/modules/topics/`.
2. **Centralize persisted contracts, not every type.** A file belongs in `src/schemas/` when it defines or validates a repository-owned JSON, TSV, log, manifest, generated-file, or other serialized contract.
3. **Keep runtime-only types with their owner.** Function options, results, intermediate models, SEO diagnostics, and vendor SDK types do not belong in `src/schemas/`.
4. **Validate at I/O boundaries.** Parse repository-owned persisted data once through its canonical schema rather than casting the result of `JSON.parse`.
5. **Avoid a schema barrel.** Import from the specific schema module so dependency ownership remains visible; do not recreate a broad `schemas/index.ts`.
6. **Keep tests beside the code or schema they verify.** Use `src/integration/` only for tests that intentionally cross several domains or invoke external repository surfaces.
7. **Keep CLI entrypoints flat and thin.** `src/scripts/` remains one direct folder because its filenames already group commands by verb and map clearly to `package.json`.
8. **Preserve justified bulk nesting.** Keep `src/transcripts/txt/`; keep all per-video shards in one dedicated folder. Do not add year/month/video-ID bucket nesting.
9. **Do not add generic wrappers.** Avoid new `src/lib/`, `src/modules/`, `src/data/`, or `src/domain/` layers that make every path longer without resolving ownership.
10. **Canonical data gets one home.** Do not leave forwarding files, duplicate canonical directories, symlinks, or long-lived compatibility mirrors after cutover.
11. **Keep credentials outside tracked source and output domains.** Tracked `src/` files may load a credential but must never contain one. Put local secret files under a dedicated root `/.secrets/` directory that is ignored as a whole, rather than mixing them with source or generated reports.

## Proposed Target Tree

```text
src/
  archive/
    archive-data.ts
    archive-data.test.ts
    build-repair-guidance.ts
    build-repair-guidance.test.ts
    curated-seed.ts
    model.ts
    video-segment-files.ts

  channel/
    README.md
    episodes.json
    video-metadata.json

  curation/
    site-content-audit.ts
    site-content-audit.test.ts
    site-content-processing-log.ts
    site-content-processing-log.test.ts
    site-content-processing.config.json
    site-content-processing.log
    transcript-schedule-audit.ts
    transcript-schedule-audit.test.ts
    video-segment-audit-risk.ts
    video-segment-audit-risk.test.ts
    video-timestamp-alignment.ts
    video-timestamp-alignment.test.ts

  integration/
    shared-output.test.ts
    shared-output-worker.ts

  schemas/
    common.ts
    channel.ts
    transcripts.ts
    curated-content.ts
    curation.ts
    topics.ts
    topic-normalization.ts
    site-archive.ts
    search-ranking.ts
    *.test.ts

  scripts/
    ...flat, thin package-command entrypoints...

  search/
    ranking-cases.json
    ranking-check.ts
    ranking-check.test.ts

  seo/
    concurrency.ts
    concurrency.test.ts
    page-indexing.contract.test.ts
    page-metadata.ts
    page-metadata.test.ts
    seo-monitoring.ts
    seo-monitoring.test.ts
    seo-validation.ts
    seo-validation.test.ts
    site-urls.ts
    structured-data.ts
    structured-data.test.ts
    video-seo.ts
    video-seo.test.ts
    video-sitemap-routing.contract.test.ts
    video-sitemap-validation.ts
    video-sitemap-validation.test.ts

  shared/
    atomic-write.ts
    timestamps.ts
    timestamps.test.ts
    video-naming.ts
    video-naming.test.ts

  topics/
    topics.json
    normalization-patterns.tsv
    normalization.ts
    normalization.test.ts
    normalization-audit.ts
    normalization-audit.test.ts
    guidance-contract.test.ts
    public-topic.ts
    store.ts
    store.test.ts
    video-topic-usage-report.ts
    video-topic-usage-report.test.ts

  transcripts/
    README.md
    manifest.json
    fetch-status.json
    txt/
      <manifest.fileStem>.txt

  video-segments/
    <manifest.fileStem>.json

  youtube/
    api-key-loader.ts
    batch-transcripts.ts
    batch-transcripts.test.ts
    channel-video-links.ts
    channel-video-links.test.ts
    live-streams-html.ts
    live-streams-html.test.ts
    saved-channel-html.ts
    saved-channel-html.test.ts
    transcript-problem-report.ts
    transcript-problem-report.test.ts
    transcripts.ts
    transcripts.test.ts
    transcripts-fixture.test.ts
    video-metadata.ts
    video-metadata.test.ts
```

The exact schema test split can follow the contract boundaries rather than a fixed file count. The important constraint is that every repository-owned persisted contract has one obvious runtime-schema owner.

### Local Credential Boundary Outside `src/`

The proposed `src/youtube/api-key-loader.ts` is tracked source code only. It replaces the current reusable helper at `src/scripts/youtube-api-key-file.ts` and resolves a key supplied through an option, a caller-selected file, or `YOUTUBE_API_KEY`. It must never contain the actual API key.

Use this separate local-only layout for the credential:

```text
.secrets/
  youtube-api-key.txt
```

The existing credential currently remains at `reports/youtube-api-key.txt`; this planning pass does not read or move it. During implementation, add `/.secrets/` to `.gitignore` before moving the local file, retain the existing filename-level `youtube-api-key.txt` ignore rule as defense in depth, and update the package-command defaults and live documentation together. Never copy the key into `src/`, a tracked configuration file, a test fixture, a task note, or generated report output.

## Current-to-Target Move Map

| Current path or responsibility | Proposed owner | Reason |
| --- | --- | --- |
| `src/content/schemas/*` | `src/schemas/*` | Make persisted contracts a direct, repository-wide concern rather than content-only nested infrastructure. |
| Segment-kind constants from `src/index.ts` | `src/schemas/curated-content.ts` | Segment kind is part of the persisted curated-content contract. |
| Timestamp formatting from `src/index.ts` | `src/shared/timestamps.ts` | Pure cross-domain utility. |
| Unused `projectName`, legacy `VideoSegment`, and unused `youtubeTimestampUrl` | Remove after a final reference check | Avoid relocating dead public surface. |
| `src/naming.ts` | `src/shared/video-naming.ts` | Shared by ingestion and archive generation; it is not a root entrypoint. |
| `src/content/curated-archive-model.ts` | `src/archive/model.ts` | It is an in-memory aggregate, not a persisted schema. |
| Site-content audit, log reader, schedule audit, and risk analysis | `src/curation/` | One workflow domain with shared manifest/log/config concepts. |
| Processing config and append-only processing log | `src/curation/` | Canonical configuration/state should live with the curation workflow that owns it. |
| `src/content/transcript-problem-report.ts` | `src/youtube/transcript-problem-report.ts` | Reports failures from the YouTube transcript-ingestion domain. |
| `src/content/video-topic-usage-report.ts` | `src/topics/video-topic-usage-report.ts` | Topic corpus analysis belongs with topic policy and storage. |
| `src/derived/video-segments/<fileStem>.json` | `src/video-segments/<fileStem>.json` | Removes the false claim that canonical authored shards are disposable derived data without adding a wrapper directory. |
| `src/derived/video-segments/topics.json` | `src/topics/topics.json` | The shared registry is not a video shard; discovery no longer needs a filename exception. |
| `src/derived/topic-normalization-patterns.tsv` | `src/topics/normalization-patterns.tsv` | Co-locates authored topic policy with its parser, audit, store, and registry. |
| `src/pipeline/atomic-write.ts` | `src/shared/atomic-write.ts` | Generic filesystem behavior is not pipeline-specific. |
| `src/pipeline/shared-output.test.ts` and its worker | `src/integration/` | Cross-process repository integration test; flatten the one-file support subfolder. |
| Archive generation, curated-seed loading, shard discovery, build guidance | `src/archive/` | Clear domain currently buried in the `site` catch-all. |
| Topic normalization, topic store, public-topic rule | `src/topics/` | Removes the current `content <-> site` dependency cycle. |
| Page metadata, structured data, sitemap, rendered SEO validation/monitoring | `src/seo/` | Cohesive site-quality domain with no need for an extra `site/` wrapper. |
| Search ranking case file, checker engine, tests | `src/search/` | Search quality is independent of archive generation and SEO validation. |
| `src/scripts/youtube-api-key-file.ts` | `src/youtube/api-key-loader.ts` | Tracked reusable loader code, not a CLI entrypoint and never credential storage. |
| Local `reports/youtube-api-key.txt` | Local `.secrets/youtube-api-key.txt` | Keep the secret outside `src/` and under an explicitly ignored credential-only directory rather than mixing it with generated reports. |
| Business logic and unit tests currently inside `src/scripts/` | Owning domain; leave only adapter/integration code in `src/scripts/` | Keep `package.json` commands stable while making code ownership visible. |

## Schema Rationalization

### What must move into `src/schemas/`

Create runtime schemas and inferred persisted types for:

- `src/channel/episodes.json`.
- `src/channel/video-metadata.json`.
- `src/transcripts/manifest.json`.
- `src/transcripts/fetch-status.json`.
- Stored transcript JSON records handled by the transcript parser, where repository-owned.
- Per-video curated segment shards.
- The curated topic registry.
- Site-content processing configuration.
- Site-content processing-log rows.
- Topic-normalization TSV rows and header contract.
- Search-ranking case JSON.
- The logical generated archive records and the split archive manifest/shard contracts.

Move version constants beside their schemas. A path move alone must not increment:

- Episode inventory schema version.
- Video metadata schema version.
- Transcript manifest schema version.
- Transcript fetch-status schema version.
- Logical `SiteArchiveData.schemaVersion`.
- Split archive `siteArchiveSchemaVersion`.
- Search-ranking fixture schema version.

If implementation discovers a real persisted-shape change, split that into a separately reviewed contract migration with the corresponding version update.

### What must stay out of `src/schemas/`

Keep these with the module that owns their behavior:

- `*Options`, `*Result`, diagnostics, reports, and intermediate scan models.
- In-memory `CuratedArchiveSeed`.
- SEO parse snapshots and validation results.
- Google/YouTube SDK response types.
- Test-only interfaces used to dynamically load Astro adapter modules.
- Pure UI/view metadata such as `PageMetadata`.

### Schema loading rules

- Every repository-owned JSON load should follow `read -> JSON.parse as unknown -> canonical schema parse`.
- Every TSV/log load should pass through its canonical row/header parser.
- Remove duplicated transcript-manifest interfaces from curation, schedule, and archive modules; import the canonical persisted type.
- Prefer specific schema imports, such as `../schemas/transcripts.js`, over a global schema barrel.
- Keep Astro's `site/src/data/archive.ts` as a consumer boundary. Do not make browser-facing Astro code import Node-only Zod modules merely to remove duplicated consumer types.

## Desired Dependency Direction

```text
schemas  shared
   \      /
    \    /
 youtube  topics  curation
      \      \      /
       \      archive
        \       |
         \     seo  search
          \     \    /
             scripts

integration -> any domain intentionally under cross-boundary test
```

Rules:

- `schemas/` and `shared/` must not import application domains.
- Domain modules must not import `scripts/`.
- `scripts/` may import domain modules and should contain argument parsing, output, exit-code handling, and little else.
- `archive/` may consume curated-content, channel, transcript, and topic contracts.
- `seo/` may consume archive models, but archive generation must not depend on SEO.
- `topics/` and `curation/` must not depend on a generic `site/` layer.
- No replacement cycle should be introduced while eliminating `content <-> site`.

## Implementation Phases

### Phase 0: Freeze Writers and Capture a Migration Baseline

Before any implementation:

1. Ensure transcript curation, shard auditing, topic synchronization, archive generation, and site builds are not actively writing.
2. Keep scheduled transcript work paused for the path-cutover window.
3. Record direct inventories for:
   - Transcript manifest records.
   - Transcript TXT basenames.
   - Per-video shard basenames.
   - Topic registry presence.
   - Processing-log data-row count.
4. Produce a temporary filename-and-SHA-256 manifest for all per-video shards. Do not commit it.
5. Record the processing-log header, final-newline state, row order, field counts, malformed count, unmapped count, and whole-file hash.
6. Run the current type/test baseline before structural edits.
7. Search repository instructions, hooks, package commands, Astro adapters, and any active automation prompts for all old path contracts.

Acceptance criteria:

- The 2,136 current transcript TXT basenames and 2,136 current video-shard basenames have a deterministic comparison baseline.
- All active writers are stopped.
- The pre-migration processing log is fully characterized.
- Existing failures, if any, are recorded before moves begin.

### Phase 1: Establish `schemas/` and `shared/` Without Moving Canonical Data

1. Move the existing Zod schemas from `src/content/schemas/` to direct `src/schemas/` modules.
2. Split `src/index.ts` responsibilities:
   - Segment kinds into the curated-content schema.
   - Timestamp formatting into `src/shared/timestamps.ts`.
   - Remove unused exports after confirming no live consumers.
3. Move `src/naming.ts` to `src/shared/video-naming.ts`.
4. Move the atomic-write helper to `src/shared/atomic-write.ts`.
5. Add canonical runtime schemas for the other repository-owned persisted contracts, one contract family at a time.
6. Replace duplicated local persisted interfaces and unchecked repository-owned JSON casts with schema loads.
7. Move archive-only in-memory aggregate types to `src/archive/model.ts`, not `src/schemas/`.
8. Keep every persisted shape and schema-version value unchanged.

Acceptance criteria:

- `src/schemas/` is the only root-`src` folder whose purpose is persisted contract definition.
- There is no new schema barrel.
- Existing persisted files parse without modification.
- Repository-owned persisted types are not re-declared in multiple domains.
- Type checking and focused schema tests pass.

### Phase 2: Split the Catch-All Code Folders

Move code and colocated tests according to the move map while canonical data paths still point to their old locations:

1. Create `archive/`, `curation/`, `topics/`, `seo/`, `search/`, and `integration/`.
2. Move `src/content/` behavior into its real domain.
3. Move `src/site/` behavior into archive, topic, SEO, or search domains.
4. Move the schedule audit into curation.
5. Flatten the shared-output integration worker into `src/integration/`.
6. Move topic-guidance contract tests with the topic domain.
7. Move Astro page-indexing and sitemap-routing contract tests with SEO.
8. Update imports and test subprocess paths without changing behavior.
9. Keep `src/youtube/`, `src/channel/`, and `src/transcripts/` flat; do not introduce speculative subfolders.

Acceptance criteria:

- `src/content/`, `src/pipeline/`, and `src/site/` contain no remaining behavior awaiting an owner.
- The old `content <-> site` dependency cycle is gone.
- Tests remain colocated except intentional cross-domain integration tests.
- No canonical data path has changed yet.
- Type checking and the complete Node test suite pass.

### Phase 3: Make `src/scripts/` a True CLI Boundary

1. Preserve every existing `package.json` command name.
2. Extract search-ranking logic from the 1,224-line CLI into `src/search/ranking-check.ts`.
3. Extract timestamp-alignment logic into curation and rendered-date/SEO logic into SEO.
4. Move topic audit/sync/report logic into topics where it is not already there.
5. Keep archive generation logic in archive; the script only parses options and invokes it.
6. Move `youtube-api-key-file.ts` to `src/youtube/api-key-loader.ts`; the module remains loader code only.
7. Establish the local credential boundary as one coordinated configuration change:
   - Add `/.secrets/` to `.gitignore` before placing anything there.
   - Retain the filename-level `youtube-api-key.txt` ignore rule as a second safeguard.
   - Move the existing local `reports/youtube-api-key.txt` to `.secrets/youtube-api-key.txt` without printing it or copying its contents into a tracked artifact.
   - Update the two `package.json` API command defaults, the root README, and `src/channel/README.md` to use the new path.
   - Preserve `--api-key`, `--api-key-file`, and `YOUTUBE_API_KEY` behavior.
8. Move unit tests with the extracted domain logic. Retain script tests only when they intentionally exercise process arguments, output, or exit behavior; use fake credentials in tests.
9. Do not add action-based subfolders beneath `src/scripts/`; the existing verb-prefixed filenames are sufficient.

Acceptance criteria:

- Package command names and CLI option/environment behavior are unchanged; only the documented default local key-file path changes from `reports/` to `.secrets/`.
- No application domain imports from `src/scripts/`.
- Large check/audit/report algorithms no longer live in CLI files.
- Source and compiled-output integration tests continue to find the intended entrypoints.
- `src/youtube/api-key-loader.ts` contains no credential, and the actual key resides only under the ignored `/.secrets/` directory.

### Phase 4: Cut Over Canonical Data Paths as One Coordinated Change

Perform this only with writers still stopped.

1. Move exactly 2,136 per-video JSON files:
   - From `src/derived/video-segments/<fileStem>.json`.
   - To `src/video-segments/<fileStem>.json`.
2. Move `topics.json` separately to `src/topics/topics.json`.
3. Move `topic-normalization-patterns.tsv` to `src/topics/normalization-patterns.tsv`.
4. Move the processing config and log to `src/curation/`.
5. Update all runtime defaults, validators, hooks, lock configuration, build fingerprints, tests, and generated-manifest source paths.
6. Update current authoritative guidance in:
   - `AGENTS.md`.
   - `README.md`.
   - `.agents/` role briefs.
   - Installed repository-local skill instructions and their active references.
   - `.codex/hooks/`.
   - `site/src/data/archive.ts` only where its source-path contract requires it.
7. Inspect active operational queue/command notes and external automation prompts. Update only live operational contracts; leave completed historical Markdown plans unchanged.
8. Regenerate the tracked split archive through its owner after source paths are valid. Never hand-edit generated archive files.

#### Processing-log migration

The processing log stores canonical shard paths as data, so moving only the log file is insufficient.

Perform one explicit, tested migration:

- Preserve the exact header, row order, timestamps, result text, completion flags, notes, and final newline.
- Replace only the second-field prefix:
  - `src/derived/video-segments/`
  - with `src/video-segments/`.
- Update the canonical row schema and regex to accept only the new forward-slash path.
- Validate every migrated row against the new schema.
- Confirm every current-manifest shard row maps by the unchanged `fileStem`.
- Compare all non-path fields before and after.
- Record the intentional whole-file hash change and the unchanged data-row count.
- Do not append a synthetic curation result merely for the directory migration.

#### Topic-registry separation

After `topics.json` moves:

- Shard discovery should enumerate every JSON file in `src/video-segments/` without a `topics.json` exclusion.
- Topic loading should use the explicit `src/topics/topics.json` path.
- No per-video shard content should change.

Acceptance criteria:

- Every pre-migration shard hash matches its post-migration file by basename.
- Transcript and shard `fileStem` pairing remains exactly one-to-one.
- The topic registry and normalization policy parse in their new locations.
- The migrated log has the same header, row count, row order, non-path fields, and final-newline state.
- No live code, hook, skill, active queue, or automation points at the old canonical paths.
- There is no second canonical shard directory.

### Phase 5: Validate, Remove Empty Legacy Folders, and Document the Result

1. Run stale-reference searches across live source, configuration, hooks, guidance, skills, and active task files.
2. Exclude completed historical task-note Markdown from the requirement to have new paths; those files should remain accurate historical records.
3. Confirm the old `src/content/`, `src/derived/`, `src/pipeline/`, and `src/site/` folders are empty, then remove the empty directories.
4. Verify all canonical persisted inputs through `src/schemas/`.
5. Verify manifest/TXT/shard filename equality and processing-log mapping.
6. Verify package commands still invoke the intended thin CLI files.
7. Update the root repository structure documentation to reflect the final tree and schema ownership.
8. Record actual implementation results in a separate timestamped task note rather than rewriting this plan's baseline.

Recommended validation order:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run audit:topic-normalization
& 'C:\Program Files\nodejs\npm.cmd' run audit:transcript-schedules
& 'C:\Program Files\nodejs\npm.cmd' run audit:video-timestamp-alignment
& 'C:\Program Files\nodejs\npm.cmd' run audit:site-content -- --no-output
& 'C:\Program Files\nodejs\npm.cmd' run site:build -- --force
& 'C:\Program Files\nodejs\npm.cmd' run site:check:generated
```

The forced site build must be allowed at least 15 minutes and must not be interrupted merely because Astro is quiet. `site:check:generated` is listed after the build so it checks the already generated archive without immediately repeating generation.

Do not add routine Git commands to this validation sequence. Use Git only if the user separately requests a Git operation or a specific overlapping edit cannot be resolved through direct inspection.

## Cross-Consumer Contract Checks

The following coordinated contracts must survive the reorganization:

| Contract | Required consumers |
| --- | --- |
| Manifest-owned `fileStem` | Transcript manifest, transcript TXT basename, per-video shard basename, curation log parser, schedule audit, archive generator, skills. |
| Curated segment schema | Shard loader, content audit, risk analysis, topic sync, archive generator, schema corpus test. |
| Topic registry and normalization policy | Topic store, normalization audit, curation guidance, archive generator, build repair guidance. |
| Processing-log schema and path prefix | Curation/auditor skills, append hook, log parser, site-content audit, schedule audit, tests. |
| Split archive manifest schema | Node generator/schema, Astro reader, build preflight validator, shared-output integration test. |
| CLI source locations | `package.json`, subprocess tests, lock hook examples, durable documentation. |
| Local YouTube credential path | `.gitignore`, `package.json`, root README, `src/channel/README.md`, and local `.secrets/youtube-api-key.txt`; tracked loader code must remain value-free. |
| Build input fingerprints | `.codex/hooks/site-build-if-changed.mjs`, generated archive manifest source metadata, source path defaults. |

Moving `siteArchiveSchemaVersion` to `src/schemas/site-archive.ts` changes its code owner but not its value. The Astro reader, build hook, and cross-consumer assertions must still agree with that authoritative constant. Do not combine this directory migration with a split-manifest format revision.

## Risks and Mitigations

### Concurrent shard or log writes

Risk: A curator can write an old-path shard or append an old-path log row during cutover.

Mitigation: Stop all shard, audit, sync, archive, and build writers before Phase 4; resume only after stale-reference and full validation gates pass.

### Large directory move

Risk: A partial move of 2,136 files can create two incomplete canonical directories.

Mitigation: Use a verified basename/hash manifest, move the resolved directory within the workspace, compare every file, and do not delete the old empty directory until the comparison passes.

### Append-only log semantics

Risk: A broad text replacement can corrupt semicolon fields, line endings, or row order.

Mitigation: Parse and rewrite exactly the shard-path field in a one-time migration, validate all rows, and compare every other field. Treat this as repository layout migration, not normal curation.

### Hidden live path consumers

Risk: Repository-local skills, hooks, active automations, or queues may continue writing old paths even after TypeScript passes.

Mitigation: Search authoritative non-TypeScript surfaces before and after cutover. Update live operational files in the same change; do not use compatibility mirrors to mask stale consumers.

### Generated archive drift

Risk: The generated manifest records source paths and hashes, and the build wrapper fingerprints specific inputs.

Mitigation: Update generator defaults and wrapper inputs together, regenerate through the canonical command, validate every manifest-listed output and hash, and keep schema versions unchanged unless the format changes.

### Astro consumer drift

Risk: Moving the Node-side archive schema owner could leave `site/src/data/archive.ts` or the build preflight validator out of sync.

Mitigation: Retain the existing cross-consumer assertions and run a forced Astro/Pagefind build after the move.

### Compiled subprocess tests

Risk: Tests that resolve emitted `.js` files by relative location can fail after moving their TypeScript sources.

Mitigation: Update source and emitted paths together and retain explicit compiled-output coverage where it currently exists.

### Credential and Loader Confusion

Risk: An ambiguous source filename or a credential stored among generated reports can lead someone to place the real key in `src/`, a fixture, or another tracked file.

Mitigation: Name the tracked module `api-key-loader.ts`, ignore `/.secrets/` as a complete directory before the local move, retain the generic `youtube-api-key.txt` ignore rule, and use only fake values in tests. Validation may confirm file presence and path resolution but must not print or inspect the credential.

## Rollback Strategy

Treat each phase as a separately validated change batch.

- Phases 1-3 can roll back imports and code locations without touching canonical data.
- If the Phase 3 local credential-path change is rolled back, restore the package defaults, documentation, and local file location together; never use a tracked file as an intermediate location.
- Phase 4 is one atomic conceptual cutover: shard directory, topic files, curation state, processing-log row paths, runtime defaults, hooks, and authoritative guidance move together.
- If Phase 4 fails before validation, stop writers and restore all old data locations and old log path prefixes as one unit.
- Never roll back only the directory while leaving new log rows, hooks, or skills active.
- Do not keep both old and new canonical directories as a fallback after a successful cutover.
- The generated archive can be regenerated from the restored canonical inputs; do not hand-merge generated JSON.

## Final Acceptance Criteria

The rationalization is complete when:

- Root `src/` matches the domain-oriented target or records an explicit evidence-backed deviation.
- `src/schemas/` directly owns all repository-managed persisted contracts, and runtime-only types remain with their domains.
- Repository-owned JSON/TSV/log inputs are validated at load boundaries rather than trusted through unchecked casts.
- `src/site/` and `src/content/` no longer form a catch-all circular dependency.
- `src/scripts/` remains flat, preserves public package command names, and acts as a thin CLI boundary.
- The tracked API-key loader contains no secret, while the local YouTube key is outside `src/` under the directory-level ignored `/.secrets/` boundary.
- `src/transcripts/txt/` remains intact and `src/video-segments/` contains exactly one unchanged shard per manifest-owned transcript.
- `topics.json` is no longer mixed into the per-video shard directory.
- `derived` is no longer used to label canonical authored content or workflow state.
- The processing log maps through the new shard path with no migration-induced malformed or unmapped rows.
- No live authoritative code, hook, skill, queue, automation, or documentation uses retired root-`src` paths.
- Historical completed task notes remain unchanged unless they are still active operational inputs.
- Persisted schema-version values, site routes, learner-facing content, and generated archive behavior are unchanged.
- Repository tests, targeted audits, the forced site build, Pagefind generation, and Astro generated-data checks pass.

## Non-Goals and Explicit Rejections

- Do not introduce `src/data/` merely to separate file extensions; it would add depth to every canonical corpus without improving domain ownership.
- Do not use `src/curated/video-segments/`; `src/video-segments/` already communicates the collection and avoids an otherwise single-child wrapper.
- Do not split transcripts or shards into year/month directories.
- Do not create `src/site/archive/`, `src/site/topics/`, `src/site/seo/`, and `src/site/search/`; those domains are meaningful enough to be direct and the extra `site` wrapper recreates the catch-all.
- Do not split `src/youtube/` into speculative `api/`, `html/`, and `transcripts/` subtrees during this task. Its current provider boundary is coherent; large-module decomposition can be planned separately.
- Do not place the real YouTube API key in `src/youtube/api-key-loader.ts`, any other `src/` file, a tracked configuration file, a fixture, a task note, or generated report output.
- Do not combine this structural migration with content cleanup, taxonomy normalization, route changes, schema-version changes, or search-quality work.
