# Package Scripts `tsx` Migration Review

Timestamp: 2026-07-18T12:38:09-05:00

Status: completed; no remaining package-script TypeScript entrypoints require migration to direct `tsx` execution.

## Objective

Review every entry in `package.json`'s `scripts` section that does not already use the direct `tsx` pattern. Determine whether each entry could migrate to direct TypeScript execution and record the benefits, costs, and recommended priority.

## Summary

The review is complete. Every package script that launches a repository TypeScript entrypoint now uses direct `tsx` execution, including shared writers that retain their repository lease through `node --import tsx`.

The other 20 entries are compiler operations, npm aliases, third-party CLIs, inline JavaScript, or JavaScript orchestration hooks. Most should remain in their current form. The test command could migrate only with supporting test refactors.

## Verified Current State

- `tsx` 4.23.1 is an installed direct development dependency.
- The repository runs Node.js 22.23.1.
- `npm run check:types` passed during the review.
- Existing NodeNext-style `.js` import specifiers resolved correctly through the installed `tsx` version.
- Lock-wrapped TypeScript commands retain their lease and use `node --import tsx <source.ts>` because the wrapper launches protected commands with `spawn(..., { shell: false })`.
- Static type-checking and emitted-JavaScript tests remain separate validation gates because `tsx` transpiles without type-checking.

## Entries That Should Not Directly Migrate

| Package script | Assessment |
| --- | --- |
| `clean` | No useful migration. `tsx -e` could delete `dist`, but it would add startup overhead to a one-line JavaScript operation. |
| `build` | Do not migrate. Its purpose is emitting JavaScript, declarations, and source maps, which `tsx` does not provide. |
| `check:types` | Do not migrate. Type-checking is specifically outside `tsx`'s role. |
| `test` | Possible only with supporting refactors. `tsx --test` could avoid the clean/build cycle, but three tests currently launch or locate compiled `.js` files under `dist`, and the suite would stop validating emitted JavaScript. |
| `check` | Keep as an npm orchestrator. It can benefit indirectly from a future test change but should not itself become a `tsx` command. |
| `append:site-content-processing-log` | Do not migrate independently. It calls the large JavaScript lock/orchestration hook, not a TypeScript entrypoint. Converting that hook would be a separate architectural change. |
| `alternate:extract:videos-html` | Keep as an alias to the direct-source saved-channel extractor. |
| `alternate:fetch:transcripts:retry` | Keep as an alias to the direct-source base batch command. |
| `alternate:fetch:transcripts:retry:safe` | Keep as an alias preserving the safety arguments on the direct-source base batch command. |
| `site:dev` | Keep the Astro CLI invocation. |
| `site:preview` | Keep the Astro CLI invocation. |
| `site:check` | Keep as an orchestrator that runs direct-source site-data generation before Astro validation. |
| `site:check:generated` | Keep the `astro check` invocation. |
| `site:build` | Do not migrate directly. It invokes a JavaScript fingerprint/cache orchestrator. Converting that hook would require broader testing and would invalidate both build caches. |
| `site:build:generated` | Same conclusion as `site:build`. |
| `site:build:full` | Keep the Astro and Pagefind CLI composition. |
| `preaudit:lighthouse:home` | No useful migration. A TypeScript file solely to create one directory would add needless complexity. |
| `audit:lighthouse:home` | Keep the third-party Lighthouse CLI invocation. |
| `preaudit:lighthouse:local` | Same conclusion as the home preaudit command. |
| `audit:lighthouse:local` | Keep the third-party Lighthouse CLI invocation. |

## Test Migration Constraints

Moving `test` to `tsx --test` is not a mechanical package-only change. At least these existing tests are coupled to compiled output:

- `src/scripts/generate-site-data.test.ts` constructs and launches `generate-site-data.js` relative to its emitted `dist` location.
- `src/scripts/rank-video-segment-audit-risk.test.ts` explicitly launches `dist/scripts/rank-video-segment-audit-risk.js` with Node.
- `src/pipeline/shared-output.test.ts` resolves a compiled `.js` worker relative to its emitted test directory.

A source-test migration would need to update those subprocess paths and decide whether to preserve a separate emitted-JavaScript integration test. Keeping both a fast source test command and a compiled-output test command is a viable alternative.
