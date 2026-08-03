# Repository Trim Phase 0 Baseline and Invariants

Timestamp: 2026-08-02T16:52:06-05:00

Corrected: 2026-08-02T17:46:11-05:00

Status: Phase 0 completed as a measurement-only checkpoint. No source implementation, tracked generated output, report policy, Git policy, dependency, command, or workflow contract was changed.

Plan: `task-notes/2026-08-02_T14-31-45-0500_repository-structure-and-generated-output-trim-plan.md`

## Revision and Isolated Locations

- Source revision: `c1557615d43b807d825d921c7062712556ae9c93` on `master` (`master` was one commit ahead of `origin/master` when measured).
- Active checkout: `C:\Workspaces\naval-history-with-dr-alex`.
- Clean validation clone: `C:\Workspaces\naval-history-with-dr-alex-phase0-validation` at the same revision; the targeted correction rechecked that both `HEAD` values are `c1557615d43b807d825d921c7062712556ae9c93`.
- Isolated canary root: `C:\Workspaces\naval-history-with-dr-alex-phase0-validation\.tmp\phase0-baseline`.
- Official Pagefind snapshot: `C:\Workspaces\naval-history-with-dr-alex-phase0-validation\.tmp\phase0-baseline\pagefind-official`.
- Custom Pagefind output: the validation clone's ignored `site/dist/pagefind/`, generated only after the official output was snapshotted and removed.
- `.tmp/` and `site/dist/` are ignored by existing policy. The validation clone had no tracked changes after all Phase 0 commands (`git status --short --untracked-files=no` was empty).

## Current Tree and Git Storage

The following physical-byte remeasurement ran at 2026-08-02T17:37:00-05:00, immediately before this checkpoint-only documentation update. It distinguishes the active checkout from the revision-pinned clean clone instead of treating active-worktree bytes as commit bytes. MiB uses 1,048,576 bytes.

| Surface | Active files | Active bytes | Active MiB | Clean-clone files | Clean-clone bytes | Clean-clone MiB | Active minus clean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Entire tracked current tree | 4,571 | 463,414,833 | 441.95 | 4,571 | 463,412,026 | 441.94 | +2,807 bytes |
| Tracked generated archive | 67 | 151,074,107 | 144.08 | 67 | 151,074,107 | 144.08 | 0 bytes |
| Tracked curated shard store | 2,143 | 101,231,379 | 96.54 | 2,143 | 101,229,254 | 96.54 | +2,125 bytes |
| Tracked transcript TXT store | 2,142 | 191,396,112 | 182.53 | 2,142 | 191,396,112 | 182.53 | 0 bytes |
| Eight-file metadata/policy snapshot | 8 | 19,129,720 | 18.24 | 8 | 19,129,272 | 18.24 | +448 bytes |

The active checkout was intentionally neither cleaned nor overwritten. The two tracked path sets were identical (4,571 files each). At the time of the targeted correction, the following four active-checkout file contents differed from the clean clone:

| Path | Active bytes | Clean-clone bytes | Difference | Treatment |
| --- | ---: | ---: | ---: | --- |
| `.agents/skills/naval-video-page-prototype/agents/openai.yaml` | 238 | 234 | +4 | Pre-existing active-checkout change; preserved without content inspection or modification. |
| `src/derived/site-content-processing.log` | 1,544,950 | 1,544,502 | +448 | Pre-existing append-only content; preserved without modification. |
| `src/derived/video-segments/2023-11-05_T19-26-02_bruships-128-invasions-and-amphibious-warfare_CrS-QSNjtig.json` | 137,814 | 135,689 | +2,125 | Pre-existing active-checkout change; preserved without content inspection or modification. |
| `task-notes/2026-08-02_T14-31-45-0500_repository-structure-and-generated-output-trim-plan.md` | 62,308 | 62,078 | +230 | Expected Phase 0 status/checkpoint-link update from the original Phase 0 run; preserved by the targeted correction. |

The first three differences predated the original Phase 0 run; the plan-note difference is the expected documentation output of that run. All four existed before the targeted correction and were left untouched by it. All command timings, Node/Bun parity outputs, topic-curation canary results, and Pagefind builds below came from the clean clone. The active rows are a local storage snapshot only; the clean-clone rows are the revision-pinned baseline.
- A complete comparison confirmed that all 66 generated archive data files in the active tracked archive and clean-clone Node output were byte-identical. Their `index.json` files differed only in the recorded `segmentsInput` provenance path.

The generated archive had 78 commits in `HEAD` history that touched its path. This is a current-tree baseline only; no history rewrite is authorized.

`git count-objects -vH` in the active checkout reported:

- 4,816 loose objects using 453.85 MiB
- 25,143 packed objects in 3 packs using 254.94 MiB
- 5 garbage files using 411.44 KiB

The garbage files were pre-existing temporary object files. Phase 0 did not prune, repack, or delete Git objects.

## Runtime, Dependency, and Command Surface

| Item | Measurement |
| --- | ---: |
| Node | 24.18.0 |
| npm | 11.16.0 |
| Bun | 1.3.14 |
| Public npm scripts | 51 |
| Existing Node/Bun public pairs | 4 |
| Direct runtime dependencies | 3 |
| Direct development dependencies | 11 |
| Lockfile package entries | 583 |
| `package-lock.json` | 290,937 bytes |
| Fresh `npm ci` | 12.313 s; 474 packages added, 475 audited |
| Fresh `node_modules/` | 28,916 files; 602,026,542 bytes (574.14 MiB) |
| Installed `googleapis/` subtree | 1,851 files; 207,485,089 bytes (197.87 MiB) |

The fresh install reported one high-severity npm advisory plus deprecation warnings for `node-domexception@1.0.0` and `glob@10.5.0`. Phase 0 recorded but did not change dependencies or run an audit fix.

## Build and Validation Timings

Commands ran in the clean validation clone. Pagefind implementations ran sequentially against the same completed Astro output.

| Command | Wall time | Result |
| --- | ---: | --- |
| `npm ci` | 12.313 s | Passed. |
| `npm run check:types` | 7.957 s | Passed. |
| `npm run build` | 8.782 s | Passed. |
| `npm test` | 14.077 s | Failed with 7 pre-existing test failures; 216/223 tests passed. |
| `npm run site:build:astro` | 83.451 s | Passed. |
| `npm run site:build:pagefind` | 399.634 s | Passed; Pagefind reported 332.090 s internally. |
| `npm run site:build:pagefind:workspace` | 280.498 s | Passed; Pagefind reported 251.733 s internally. |

The focused topic-report contract tests passed independently: 3 tests passed, including the human-readable usage headers and actionable rule/collision `sources` plus `recommended action` fields.

## Node/Bun Parity Canary

The four existing pairs were run against complete isolated shard copies. Node and Bun never received the active checkout's canonical segment directory. The commands used their existing path flags; Bun used its default eight workers.

| Pair | Node wall time | Bun wall time | Equivalent result |
| --- | ---: | ---: | --- |
| Topic normalization audit | 9.698 s | 4.638 s | 2,142 shards; 25,258 registry topics; 25,212 used topics; 0 blockers; 0 review findings. |
| Topic usage plus normalization review reports | 102.844 s | 30.600 s | Both report files were byte-identical. |
| Topic synchronization | 7.914 s | 3.976 s | Both reported already current; all isolated registries remained byte-identical to canonical. |
| Site archive generation | 22.756 s | 16.166 s | All 66 data files were byte-identical; manifests differed only because their isolated `segmentsInput` provenance paths differed. |

The Bun generator was then rerun against the exact same isolated `segmentsInput` path used by Node. All 67 files, including `index.json`, were byte-identical. The shared-input manifest SHA-256 was `E78DB7C04EC257BFF8462ED2FCF546829FD74DDC25BD26109E80CB6235621D15` for both implementations.

## Archive Logical and Hash Baseline

- Split-manifest schema version: 7.
- Segment sharding: `sha256-video-id-mod`, 64 buckets.
- Logical counts: 2,142 videos; 58,958 segments; 25,258 topics.
- Physical files: 67 (`index.json`, `videos.json`, `topics.json`, and 64 segment buckets).
- Normalization policy SHA-256: `B9E5DB6832F973CEA87328DFA20A19C62C703FE8E632BB03A5CD74CECB8B8755`.

| File | SHA-256 |
| --- | --- |
| Active tracked `index.json` | `A39A58B8E20539B14495A58D72595C77FA911364FD52B68DE9978373F0D5B6F4` |
| `videos.json` | `884CD42536DB2D884A289A1CDFE9CDC068543D2EE1E7D91BDB91F9C5A6BB940B` |
| `topics.json` | `0239899ABBCA58B4700E565986D45E9C810EA8A3C929153115F6A647C8896462` |
| `segments/00.json` | `9D339DA97D9221A9C817CB0B4BD8DB30463852593ACE359783D81676D76DA310` |

The tracked manifest hash differs from the isolated manifest hash only because the manifest records its input path. The representative data hashes above were identical in the active archive and both isolated generators.

## Complete Topic-Curation Canary

The source registry SHA-256 was `6AE34EDA12D1219DC795ABCF3FA257492184AF6922F5E9C1645CB972D5E9B05B`. It was unchanged in all four complete isolated copies after audit, report, synchronization, and generation.

### Companion outputs

| Output | Bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| `video-topic-usage.tsv` | 8,029,764 | 25,259 | `1F41C354425D63219491229EE5F83C64933C477055A8A7C7C5436747B5908DE9` |
| `topic-normalization-review.tsv` | 137 | 1 | `A3341F1C8B853455FF67467BDDCB589E63CB124BFD0502B5961E146E8D34A1A4` |

The usage report contained 25,258 topics, 25,212 used topics, 46 unused topics, 0 unregistered topics, and 369 potential-duplicate review flags. Its exact header was:

```text
topic slug\tdisplay name\tusage count\tgeneral subject\tentity type\ttopic aliases\tnormalization inputs\tsimilar topics\tfrequent co topics\tpotential duplicate review
```

The normalization review report correctly remained header-only at the fresh 0-review baseline. Its exact header preserved the required exact-context fields:

```text
finding type\ttopic slug\trelated topic slug\trule id\tcandidate replacement\tcollision value\tsource count\tsources\tdetails\trecommended action
```

The focused report fixture test separately proved populated rule and collision rows retain exact `sources` and `recommended action` values. The current header-only corpus result therefore does not substitute for field-level fixture coverage.

### Repeatable canary contract

For each later phase:

1. Create complete, separate copies of `src/derived/video-segments/` under an ignored validation root.
2. Run Node and Bun audits against separate copies and require identical counts, blockers, and review findings.
3. Generate both companion reports into separate ignored paths and require byte-identical outputs, the exact headers above, and populated exact-source/action fixture coverage.
4. Run Node and Bun synchronization against separate copies; require identical `topics.json` hashes and no mutation outside those copies.
5. Run Node and Bun archive generation against the same isolated segment path; require all 67 output files and logical counts to match byte-for-byte.
6. Run the read-only normalization audit again and require the recorded 0-blocker/0-review comparison unless a separately authorized topic change explains a new baseline.
7. Confirm the validation clone has no tracked changes.

## Official and Custom Pagefind Baselines

Both implementations indexed the same Astro output: 88,118 matching `index.html` files, 86,312 indexed pages, 497,040 words, 5 filters, and 0 sorts.

| Property | Official package | Custom workspace binary |
| --- | ---: | ---: |
| Owner/route | Portable default; `site:build:pagefind` and default deployment | Optional sibling workspace; `site:build:pagefind:workspace` and `site:build:workspace-pagefind` |
| Reported version | 1.5.2 | 0.0.0 |
| Wall time | 399.634 s | 280.498 s |
| Internal time | 332.090 s | 251.733 s |
| Index files | 87,764 | 87,764 |
| Index bytes | 167,878,242 | 167,875,480 |
| Page count in `pagefind-entry.json` | 86,312 | 86,312 |
| Entry SHA-256 | `64C3A5D96514C8B2B5CA7BCFCD151E1C0E293DE6F0127CA7646E486C5F117FE7` | `7A8872EA377E19AA2C2D6E9A847FADB7921F8B4D592F1C1EC40806C9056D98C3` |

Representative runtime assets intentionally differed between the installed package and the sibling binary:

| Asset | Official bytes / SHA-256 | Custom bytes / SHA-256 |
| --- | --- | --- |
| `pagefind.js` | 45,555 / `252D272BD34D483D19A752060F6A065114D15AB12C42D8F905CA565E2768A009` | 45,582 / `BEFD0338030987512E9DF09A307091ECD5D207E65F4EFB2207B3549CBBD91E53` |
| `wasm.en.pagefind` | 72,206 / `68C6AEFBC022A1482B1A9D2ADBD5599F23FD53AC0326E58CB3AEBD82E8CD8232` | 72,136 / `8E29E65E4CA5DFE10182EB0062B5DB06DABBA2CD48585FBFB7127CD49F0D1209` |
| `wasm.unknown.pagefind` | 68,023 / `706A7A423F3E9FDD1B6E987B61305A9ABF694CA940B3F822E12F2668E4037384` | 68,226 / `48ACD312A599A611A03459C774F4D9F20CDEA4327B8F1D153E007FC6B63A8F2C` |

### Representative rankings

A read-only headless-browser probe originally ran the same five queries against each completed index. The total result counts and top five URLs were identical between implementations. Single-run search times are observations, not acceptance constants.

| Query | Results | Top result | Official / custom query time |
| --- | ---: | --- | ---: |
| `HMS Victory` | 1,604 | `/segments/hms-enterprise-as-an-escort-for-hms-victorious/` | 272.8 / 267.8 ms |
| `HMS Victoria` | 456 | `/segments/victoria-camperdown-command-culture/` | 30.5 / 32.5 ms |
| `RN` | 2,598 | `/videos/2-minutes-rn-vs-the-e-boat-a-quick-summary/` | 31.9 / 32.4 ms |
| `Skagerrak` | 281 | `/segments/bruships-102-skagerrak-german-view/` | 5.0 / 4.4 ms |
| `Radar` | 3,068 | `/segments/radar-retrofit-versus-purpose-built/` | 42.0 / 43.8 ms |

At 2026-08-02T17:37:00-05:00, the targeted checkpoint correction first validated both retained index roots: each contained `pagefind.js`, parseable `pagefind-entry.json`, `wasm.en.pagefind`, and `wasm.unknown.pagefind`. It then reran only these five searches against the retained official and custom indexes. No Astro or Pagefind index build ran, and the deterministic total/top-five comparison passed with these shared ordered results:

- `HMS Victory` (1,604 results):
  1. `/segments/hms-enterprise-as-an-escort-for-hms-victorious/`
  2. `/segments/victorious-rebuild-found-accumulated-wartime-damage/`
  3. `/segments/victoria-camperdown-command-culture/`
  4. `/segments/victorian-orders-and-camperdown/`
  5. `/segments/malta-class-angled-deck-rebuild-costs/`
- `HMS Victoria` (456 results):
  1. `/segments/victoria-camperdown-command-culture/`
  2. `/segments/victorian-orders-and-camperdown/`
  3. `/segments/victoria-command-culture-frame/`
  4. `/segments/hms-victoria-collision-and-command-obedience/`
  5. `/segments/hms-victoria-replaces-warrior-in-1860/`
- `RN` (2,598 results):
  1. `/videos/2-minutes-rn-vs-the-e-boat-a-quick-summary/`
  2. `/videos/rn-commands-in-1939-a-river-plate-80-video/`
  3. `/videos/p1-introduction-to-pre-tribal-class-destroyers-of-the-rn-special-guest-fluffy-research-assistant/`
  4. `/videos/p2-introduction-to-pre-tribal-class-destroyers-of-the-rn/`
  5. `/videos/hms-renown-the-rn-s-most-underated-capital-ship-of-wwii-key-ship-series-3-ship-8/`
- `Skagerrak` (281 results):
  1. `/segments/bruships-102-skagerrak-german-view/`
  2. `/topics/nexans-skagerrak/`
  3. `/segments/nexans-skagerrak-undersea-cables/`
  4. `/segments/nexans-skagerrak-cable-laying-ship/`
  5. `/segments/seawolf-norwegian-waters-career/`
- `Radar` (3,068 results):
  1. `/segments/radar-retrofit-versus-purpose-built/`
  2. `/segments/radar-linked-fire-control/`
  3. `/segments/first-radar-battle-definition/`
  4. `/segments/tribal-class-radar-use/`
  5. `/segments/radar-iff-friendly-fire-limits/`

### Exact, reusable read-only representative-ranking probe

Run the following from the clean validation clone. The first argument is the retained official snapshot; the second is the custom index. Substitute two other completed Pagefind output directories to compare later candidates. The probe serves each index only on an ephemeral loopback port, applies the repository's current default `termSimilarity=1` and title weight `5`, prints the deterministic totals/top-five URLs, and exits nonzero if they differ.

```powershell
@'
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const queries = ["HMS Victory", "HMS Victoria", "RN", "Skagerrak", "Radar"];
const siteBase = "/naval-history-with-dr-alex/";

function contentType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

async function probe(rootInput) {
  const root = resolve(rootInput);
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const filePath = resolve(root, pathname.replace(/^\/+/, ""));
      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      try {
        response.statusCode = 200;
        response.setHeader("Content-Type", contentType(filePath));
        response.end(await readFile(filePath));
      } catch {
        response.statusCode = 404;
        response.end();
      }
    })();
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const basePath = `http://127.0.0.1:${address.port}/`;
  try {
    const pagefind = await import(pathToFileURL(join(root, "pagefind.js")));
    const results = [];
    for (const query of queries) {
      const instance = pagefind.createInstance({ basePath, baseUrl: siteBase });
      await instance.options?.({
        baseUrl: siteBase,
        ranking: { termSimilarity: 1, metaWeights: { title: 5 } },
      });
      await instance.init?.();
      const response = await instance.search(query);
      const handles = Array.isArray(response?.results) ? response.results : [];
      const data = await Promise.all(handles.slice(0, 5).map((handle) => handle.data()));
      results.push({
        query,
        total: handles.length,
        urls: data.map((value) => new URL(
          value.raw_url ?? value.url,
          "https://probe.invalid",
        ).pathname.replace(siteBase.slice(0, -1), "")),
      });
      await instance.destroy?.();
    }
    return results;
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

const official = await probe(process.argv[2]);
const custom = await probe(process.argv[3]);
if (JSON.stringify(official) !== JSON.stringify(custom)) {
  console.error(JSON.stringify({ official, custom }, null, 2));
  throw new Error("Official and custom Pagefind results differ.");
}
console.log("Official and custom Pagefind totals/top-five URLs are identical.");
console.log(JSON.stringify(official, null, 2));
'@ | & 'C:\Program Files\nodejs\node.exe' --input-type=module - `
  '.tmp\phase0-baseline\pagefind-official' `
  'site\dist\pagefind'
```

The supported validation route remains `npm run check:search-ranking` after either index build. At this revision it failed before opening Pagefind because the fixture query `Queen Elizabeth Class` references missing topic `queen-elizabeth-class`. Phase 0 did not repair that later-phase fixture; the independent probe above preserves a usable ranking baseline while the exact pre-existing failure remains explicit.

## Supported Weekly Workflow I/O

No live YouTube request was made during Phase 0. The inventory command was exercised only through `--help`; the safe transcript command used `--dry-run --limit 1` and an isolated status path.

| Stage | Exact repository reads | Exact writes on a normal successful run |
| --- | --- | --- |
| `npm run fetch:video-links` | `.local/youtube-api-key.txt`; `src/channel/ignored-videos.json`; `src/transcripts/manifest.json`; existing `src/channel/video-metadata.json`; the first-pass `src/channel/episodes.json` when metadata synchronization consumes it | `src/channel/episodes.json` before metadata refresh; `src/channel/video-metadata.json` after each metadata batch/finalization; then `src/channel/episodes.json` again with refreshed metadata. Bare invocation writes no report/checkpoint path. |
| `npm run alternate:fetch:transcripts:safe` | `src/channel/episodes.json`; `src/channel/video-metadata.json`; `src/channel/ignored-videos.json`; optional existing `src/transcripts/fetch-status.json`; `src/transcripts/manifest.json`; each manifest-selected `src/transcripts/txt/<fileStem>.txt` used to prove an existing transcript | `src/transcripts/fetch-status.json` initially, after each attempt, and finally; on success, `src/transcripts/txt/<fileStem>.txt` and `src/transcripts/manifest.json`; an obsolete former TXT may be removed when a pre-existing record changes stem. It does not write transcript JSON or TSV. |
| One `$naval-transcript-to-site-content` task | The exact manifest-owned TXT and manifest record, the existing exact shard when present, `src/derived/site-content-processing.config.json`, and `src/derived/topic-normalization-patterns.tsv` | Only `src/derived/video-segments/<manifest.fileStem>.json` plus one physical-bottom append to `src/derived/site-content-processing.log`. |
| One `$naval-site-content-auditor` task | The exact shard and matching TXT/manifest evidence plus read-only processing/normalization policy | The same exact shard when substance changes plus one physical-bottom processing-log append after every completed audit. |
| `report:video-topic-usage` | `src/derived/video-segments/topics.json`, every authored shard, and `src/derived/topic-normalization-patterns.tsv` | Both ignored companion files: `reports/video-topic-usage.tsv` and `reports/topic-normalization-review.tsv`. |
| `audit:topic-normalization` | The topic registry, every authored shard, and normalization policy | None. |
| `sync:video-topics` | The topic registry, every authored shard, normalization policy, and the ignored `.tmp/site-content-pipeline.lock/owner.json` lease while held | Atomic replacement of `src/derived/video-segments/topics.json` only when missing topics exist; ignored lease lifecycle under `.tmp/site-content-pipeline.lock/`. |
| Current `generate:site-data` | Episodes, metadata, transcript manifest, normalization policy, topic registry, every authored shard, and the same ignored writer lease | Currently may update `src/derived/video-segments/topics.json`; writes the 67-file split archive under `site/src/data/generated/archive/` with manifest last. This is the recorded Phase 2 source-read-only blocker. |
| Astro/Pagefind integration | Generated archive plus `site/src/`, `site/public/`, build configuration, installed dependencies, and the selected Pagefind implementation | Ignored `site/dist/`, Astro state, Pagefind index, and `.tmp/` build caches. |

The isolated transcript dry run read 2,164 episode records and reported 2,142 stored, 7 upcoming/deferred, 1 would-fetch attempt, 0 fetches, 0 failures, and 15 pending. It wrote only `.tmp/phase0-baseline/transcript-fetch-dry-run-status.json`; its timestamp-bearing SHA-256 is evidence for this run, not a deterministic future gate.

## Recorded Pre-Existing Failures

Phase 0's exit gate permits pre-existing failures when they are recorded with evidence. The clean clone produced these failures without any tracked mutation:

1. `npm test`: 223 tests, 216 passed, 7 failed.
   - `validation hooks share the split-archive contract and generate once before their generated-data checks`
   - `production policy applies the repository-owner topic normalization batch`
   - `production policy encodes the dc950 topic audit without collapsing semantic distinctions`
   - `production policy applies the reviewed full-corpus singular and plural consolidation`
   - `production policy uses reviewed official and common display forms`
   - `keeps the reviewed singular/plural and Leander split canonical in the production store`
   - `keeps the dc950 topic audit canonical while retaining function and type topics`
2. `npm run check:search-ranking`: fixture query `Queen Elizabeth Class` references missing topic `queen-elizabeth-class`; the command exits before loading either index.
3. `npm ci`: one high-severity npm advisory and two dependency deprecation warnings.
4. `git count-objects`: five pre-existing garbage object files totaling 411.44 KiB.

These are baseline findings, not authorization to implement Phase 1, Phase 2, Phase 6, Phase 7, dependency fixes, topic migrations, test repairs, or Git maintenance.

## Phase 0 Exit Gate

- Baseline commands passed except for the explicitly recorded pre-existing failures above.
- Official Pagefind remains the portable default/deployment owner; custom Pagefind remains an independently measured optional workspace route.
- The complete topic-curation contract now has exact counts, headers, hashes, field-level fixture proof, isolated writer checks, and a repeatable later-phase procedure.
- The active canonical topic registry and representative generated archive data retained their original hashes.
- The clean validation clone ended with no tracked changes.
- No tracked source, tracked generated output, report policy, Git policy, dependency, or later phase was changed.
