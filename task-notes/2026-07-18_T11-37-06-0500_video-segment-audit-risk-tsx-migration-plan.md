# Video Segment Audit Risk `tsx` Migration Plan

Timestamp: 2026-07-18T11:37:06-05:00

Status: planning only; reviewed against the current checkout; do not implement as part of this task.

## Objective

Simplify `rank:video-segment-audit-risk` so it executes its TypeScript entrypoint directly with `tsx` instead of maintaining a task-specific TypeScript compilation configuration and temporary JavaScript build.

The target command is:

```json
"rank:video-segment-audit-risk": "tsx src/scripts/rank-video-segment-audit-risk.ts"
```

The report's behavior, inputs, default output path, ranking logic, tests, CLI arguments, and public terminology must remain unchanged.

## Verified Current State

- `package.json` currently compiles the report through `tsconfig.video-segment-audit-risk.json` and then runs `.tmp/video-segment-audit-risk-build/scripts/rank-video-segment-audit-risk.js`.
- The special config extends the root `tsconfig.json`, narrows compilation to three production files, disables declarations and source maps, and redirects output into the ignored `.tmp` subtree.
- The root `tsconfig.json` already includes `src/**/*.ts`, so normal `build`, `check:types`, and `test` runs continue to cover the report source and tests without the special config.
- `tsconfig.astro.json` is a separate site configuration and remains unchanged. Removing the report-specific config does not make the root config the repository's only TypeScript configuration.
- The source is ESM under `package.json`'s `type: module` and uses NodeNext-style `.js` import specifiers for TypeScript source modules. Direct execution must prove that the installed `tsx` version resolves those imports correctly before the special config is removed.
- `tsx` is not currently a direct dependency and `node_modules/.bin/tsx.cmd` is absent. The lockfile only mentions `tsx` in Vite's optional peer-dependency metadata; that is not an installed or locked `tsx` package.
- The existing CLI integration test runs the normally compiled `dist/scripts/rank-video-segment-audit-risk.js`. It protects report behavior but does not exercise the proposed `tsx` package-script launch path, so the migration needs an explicit runtime/parity smoke test.

## Rationale

The current isolation is valid, but it adds a special configuration and report-specific intermediate output for one internal CLI. Using `tsx` makes that execution path shorter and conventional:

1. The package command points directly to the source entrypoint.
2. The report command no longer needs its own JavaScript output directory.
3. The root `tsconfig.json` remains authoritative for type-checking and normally compiling `src/**/*.ts`; the independent Astro configuration remains as-is.
4. Existing `npm run check:types` and `npm test` continue to provide static and behavioral validation.

`tsx` transpiles and executes TypeScript but does not type-check it. The fast report command therefore remains separate from the repository's type-check and test gates.

This simplification adds a direct development dependency and its locked transitive dependencies. Accept that tradeoff only if the package installation is narrowly scoped and the resolved lockfile contains no unexplained dependency churn.

## Scope

Expected tracked changes during implementation:

- Add `tsx` as a direct `devDependency` in `package.json`.
- Update `package-lock.json` through npm, including a concrete locked `tsx` package entry rather than relying on Vite's optional peer declaration.
- Change only the `rank:video-segment-audit-risk` package script to invoke `tsx` directly.
- Delete `tsconfig.video-segment-audit-risk.json` after runtime parity is proven.
- Update any active tracked documentation that specifically describes the removed compile-then-run mechanism or special config.

No source or test changes are expected in:

- `src/scripts/rank-video-segment-audit-risk.ts`
- `src/content/video-segment-audit-risk.ts`
- `src/content/site-content-processing-log.ts`
- Their tests

No changes are expected in:

- `tsconfig.json` or `tsconfig.astro.json`
- `reports/video-segment-audit-risk.tsv`
- Transcript files, curated shards, processing logs, generated archives, or site code

The historical note `task-notes/2026-07-12_T22-24-19-0500_video-segment-audit-risk-plan.md` may continue to describe the design that was implemented at that time. Do not rewrite completed history merely to eliminate an exact-name search match. As of this review, no tracked active automation or documentation outside `package.json`, the special config, and historical planning notes references the old launch mechanism.

## Implementation Steps

### 1. Reconfirm references and dependency state

Search source, configuration, and documentation for:

```text
tsconfig.video-segment-audit-risk.json
.tmp/video-segment-audit-risk-build
rank:video-segment-audit-risk
```

Classify each match before editing. Preserve historical references unless they incorrectly claim to describe the current implementation. Also confirm that `tsx` is still absent from the root `devDependencies` and from the locally installed top-level packages; do not mistake Vite's optional peer metadata for an installed dependency.

Confirm that every environment which invokes this internal report installs development dependencies. If an external consumer uses `npm ci --omit=dev`, either update that consumer explicitly or stop the migration; do not move `tsx` into production dependencies solely to hide that mismatch.

### 2. Add the runtime dependency

From the repository root, use the fixed Windows npm executable required by `AGENTS.md`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install --save-dev tsx
& 'C:\Program Files\nodejs\npm.cmd' ls tsx --depth=0
```

Allow npm to update both `package.json` and `package-lock.json`. Do not hand-author lockfile entries. Verify that:

- `tsx` appears in the root `devDependencies`.
- The lockfile contains a concrete resolved `node_modules/tsx` package.
- `npm ls` reports one valid top-level installation.
- Any `esbuild` or other transitive-dependency changes are explained by the resolved `tsx` dependency rather than unrelated upgrades.

### 3. Prove direct-runtime compatibility before deleting the fallback

Keep the old package script and `tsconfig.video-segment-audit-risk.json` in place for this gate. Run the compiled and direct-source paths back-to-back against the same checkout:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run rank:video-segment-audit-risk -- --output .tmp/video-segment-audit-risk-compiled.tsv
& '.\node_modules\.bin\tsx.cmd' src/scripts/rank-video-segment-audit-risk.ts --output .tmp/video-segment-audit-risk-tsx.tsv
& '.\node_modules\.bin\tsx.cmd' src/scripts/rank-video-segment-audit-risk.ts --help

$compiledReportHash = (Get-FileHash -Algorithm SHA256 -LiteralPath '.tmp/video-segment-audit-risk-compiled.tsv').Hash
$tsxReportHash = (Get-FileHash -Algorithm SHA256 -LiteralPath '.tmp/video-segment-audit-risk-tsx.tsv').Hash
if ($compiledReportHash -ne $tsxReportHash) { throw 'Compiled and tsx report outputs differ.' }
```

This gate proves the repository's actual ESM/NodeNext `.js` specifiers, CLI argument handling, and deterministic TSV output under the resolved `tsx` version. If shared report inputs change between the two executions, rerun both paths against a stable checkout before treating a hash difference as a runtime regression.

Stop and use the rollback procedure if direct execution fails or the TSVs differ for stable inputs. Do not change application import specifiers or report logic merely to force the migration.

### 4. Simplify the package command

After the parity gate passes, replace:

```json
"rank:video-segment-audit-risk": "tsc -p tsconfig.video-segment-audit-risk.json && node .tmp/video-segment-audit-risk-build/scripts/rank-video-segment-audit-risk.js"
```

with:

```json
"rank:video-segment-audit-risk": "tsx src/scripts/rank-video-segment-audit-risk.ts"
```

Do not prepend a full type-check or build. Those remain separate validation concerns and would recreate the latency this migration is intended to remove.

### 5. Remove only the special compiler configuration and obsolete output

Delete:

```text
tsconfig.video-segment-audit-risk.json
```

Do not change either remaining TypeScript configuration. The normal root build will still emit `dist/scripts/rank-video-segment-audit-risk.js`; that is expected and is distinct from the obsolete report-specific `.tmp` build.

If `.tmp/video-segment-audit-risk-build` exists locally, resolve and verify that exact path before removing only that ignored generated subtree. Do not remove `.tmp` broadly. This cleanup is optional for source correctness, but it makes the non-recreation check unambiguous.

### 6. Update only active documentation references

Update documentation that presents the special config or temporary output as the current execution design. Keep the command name and report usage unchanged. Historical planning notes may retain the old mechanism as completed history; at most, add a concise supersession note if this repository routinely maintains such notes in place.

## Validation

Run the following from the repository root after the package-script change and config deletion:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check:types
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run rank:video-segment-audit-risk -- --output .tmp/video-segment-audit-risk-tsx-validation.tsv
& 'C:\Program Files\nodejs\npm.cmd' ls tsx --depth=0
```

Then verify:

- The type-check succeeds with the report source covered by the root configuration.
- Existing tests pass without semantic changes. The compiled-dist CLI integration test remains useful and complementary to the direct-runtime parity gate.
- The package-script invocation exits successfully and its output matches the pre-deletion `tsx` parity artifact.
- The validation TSV has the expected audit-risk headers and CLI arguments after `--` reach the script.
- `tsx` is a valid direct development dependency in both package files and the local install.
- The package command does not recreate `.tmp/video-segment-audit-risk-build`.
- The normal root build may still recreate `dist/scripts/rank-video-segment-audit-risk.js`; do not treat that expected artifact as a migration failure.
- Exact-name searches find no active reference that requires the deleted config or emitted `.tmp` JavaScript path.
- Only the dependency metadata, package script, deleted special config, and any directly affected active documentation changed.

Repository-wide site generation, Astro/Pagefind builds, transcript audits, and shard validation are unnecessary because this migration changes only how an existing internal CLI is launched.

## Rollback

If dependency installation, Node/ESM resolution, `.js` specifier mapping, CLI forwarding, or output parity fails:

1. Record the exact failure and stop before deleting the special config whenever possible.
2. Restore the previous package command and `tsconfig.video-segment-audit-risk.json` if either was changed.
3. Remove the direct dependency through npm so both package files remain synchronized:

   ```powershell
   & 'C:\Program Files\nodejs\npm.cmd' uninstall --save-dev tsx
   ```

4. Rerun the original command to confirm the fallback path still works.
5. Do not alter application imports, report logic, data, tests, or root TypeScript configuration without a separate design decision.

## Definition of Done

- `tsx` is a concrete, valid, locked direct development dependency.
- The direct `tsx` and prior compiled launch paths produced byte-identical TSVs from stable inputs before fallback removal.
- `rank:video-segment-audit-risk` runs the TypeScript source directly and preserves CLI argument forwarding.
- `tsconfig.video-segment-audit-risk.json` is removed.
- The package command no longer produces `.tmp/video-segment-audit-risk-build`.
- Root type-checking and the existing test suite pass; the normal `dist` build remains intact.
- No report logic, report data, public terminology, tests, root/Astro TypeScript configuration, or unrelated repository content changes.
