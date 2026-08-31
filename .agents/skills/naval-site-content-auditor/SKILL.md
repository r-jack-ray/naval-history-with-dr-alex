---
name: naval-site-content-auditor
description: Audit and strengthen transcript-backed study-guide content about naval history or general history in one selected per-video shard after transcript curation, then complete its shared topic-registry synchronization. Use when asked to add substance to thin segment notes, remove workflow/scaffold wording from public fields, align wording with learner intent, validate transcript-backed claims, improve segment density, recover substantive non-naval subjects such as ancient history, land campaigns, aviation, politics, economics, railways, industry, or logistics, cover historically informative strategy-game discussion, or run a high-effort follow-up pass over a manifest-owned file under `src/derived/video-segments/`.
---

# Naval Site Content Auditor

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` after one or more transcripts have already been converted into site-visible content.

Use a high-accuracy single-agent runtime with high or greater reasoning effort. Keep model-version selection in the invoking runtime or automation rather than pinning it in this skill. If the runtime cannot enforce that setting, still follow this workflow with a slow, evidence-first audit stance.

This audit is repeatable. A prior first, second, third, or later pass is not evidence that the content is exhausted, and a newly available stronger model is a valid reason to run another independent full-transcript comparison. If a pass only rephrases or rearranges existing material without adding transcript-backed substance, stop repeating that specific model-and-effort configuration and record it as saturated. Saturation does not prevent a future pass with a materially stronger model, higher effort, improved method, or new evidence.

## Site Intent

- Write for readers learning naval history, general history, and how armed forces, states, institutions, technology, and logistics work, not for creators, maintainers, or pipeline operators.
- Treat every segment as a watch point into its source video: preview what the reader will see or hear, identify the historical subject, and state the learning payoff. Explain a subject's naval connection when one matters, but do not require a naval connection.
- Include substantive general history on its own merits. Ancient, medieval, early-modern, and modern political, diplomatic, economic, social, technological, industrial, aviation, military, transport, and logistical history are in scope whenever the transcript offers useful historical explanation, argument, context, or Q&A.
- Treat historically framed games, simulations, and counterfactual scenarios as eligible when the discussion teaches something substantive about historical geography, strategy, operations, state capacity, economics, diplomacy, institutions, logistics, or interpretation. Distinguish game rules and scenario state from claims about actual history. Exclude technical setup, personal chatter, bare move-by-move gameplay narration, and other non-historical filler unless it develops a substantive learning point or answered question.
- Keep the site highly searchable by using transcript-supported names for ships, classes, navies, states, empires, peoples, armies, aircraft, battles, campaigns, leaders, weapons, railways, ports, places, trade routes, supply systems, policies, doctrine, logistics, acronyms, and alternate wording.
- Prefer many precise, substantive segments over one sparse video overview when transcript evidence supports more granular coverage.
- Do not surface YouTube analytics, internal filenames, processing status, or raw inventory details in public pages unless the user asks for an admin/debug view.

## Start

1. Read `AGENTS.md` and `.agents/site-content-auditor.md`.
2. Require an explicitly named exact per-video shard. If none was supplied, stop without edits; do not sample or select from the shard directory.
3. Read the selected shard, then read the transcript TXT named by its `sourcePath`. Treat that TXT as the historical source of record and the exact supplied shard as the only owned public-content file.
4. Treat `src/derived/video-segments/` as the source for public segment wording. Treat the shards under `site/src/data/generated/archive/` as generated output.
5. Preserve every other shard and all generated outputs. The deterministic topic synchronizer described below is the only permitted shared-source writer.
6. Read `src/derived/topic-normalization-patterns.tsv` before evaluating the selected shard's topic arrays. Treat the catalog as read-only authored policy.
7. Read `.agents/skills/humanizer/SKILL.md` completely. Reserve its embedded-mode rewrite loop for the final public-wording pass below.

## Transcript Read Safety

- Keep transcript reads antivirus-safe. Never build or run a multi-range timestamp extractor as an inline PowerShell `-Command`. Do not stream the full file through `ForEach-Object` or `foreach` while using regex timestamp parsing, range arrays, command-line variables, or a command-line output-encoding prelude. Do not encode, obfuscate, or move equivalent dynamic logic into an ad hoc script.
- Read sequentially with separate, simple commands. Locate a known timestamp with `rg -n --fixed-strings` when useful, then read one contiguous line slice at a time with a literal path and numeric constants, for example `Get-Content -LiteralPath '<transcript>' | Select-Object -Skip <line> -First <count>`. If endpoint protection blocks a read, stop and report the blocked command pattern; do not retry it in another dynamic form.

## Audit Public Wording

1. Scan public fields: shard `title`, `summary`, `body`, `question`, and `answerShort`, plus any visible page headings, card text, and search placeholder text in the explicitly selected scope.
2. Remove maintainer/workflow language from public fields when it describes the site or content pipeline, including "first pass", "later extraction", "processing", "curation", "source window", "evidence window", "search metadata", "seed", "prototype", "this segment exists to", and "useful for search".
3. Keep workflow status in `src/derived/site-content-processing.log`, `reports/`, task notes, or the handoff, not in the site content. This skill records its completed audit in the processing log as specified below.
4. Prefer reader-facing study-guide prose:
   - Explain what the video moment covers.
   - State the historical, technical, strategic, or historiographic takeaway.
   - Make clear why opening the video at that time is useful.
   - Include transcript-grounded caveats when useful.
   - Avoid announcing that the page or segment is an archive, prototype, seed, extraction, or search target. Words such as "prototype" and "processing" are fine when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes or data processing.

## Add Substance

1. Find thin records with short or label-like `body` text. Useful scans include bodies under 120-160 characters, bodies that begin with "This is", and bodies that mention users/search/browsing instead of the subject.
2. Read the segment `summary`, `evidence` notes, and the cited transcript passage before expanding a record.
3. For `chapter` and `notable_point`, aim for 4-10 concise sentences in `body`.
4. For `qa`, keep the actual prompt in `question`, the direct answer in `answerShort`, and use `body` for context, constraints, and why the answer matters.
5. Do not invent new facts. If the existing evidence is too thin, either inspect the transcript around the cited time or leave a targeted follow-up note.
6. Merge duplicate phrasing instead of padding. More text should add substance, not repetition.

## Deepen Coverage And Topics

1. Re-read the transcript across the audited scope, not only the existing segment windows. Add omitted chapters, notable points, and Q&A exchanges when substantive historical learning value is still missing from the pages. Preserve substantive general history whether or not it connects to a navy or ship. For games, simulations, and counterfactuals, capture historically informative analysis with clear real-history-versus-scenario caveats rather than excluding the video's main subject or presenting game events as historical fact.
2. Let significant topics arise from the strengthened content. Add transcript-backed topic slugs to the video and segment arrays without targeting a tag count or confining the audit to the existing taxonomy. Do not manually edit `topics.json`; the required same-run `npm run sync:video-topics` finalization materializes missing records while preserving existing manual metadata. Synchronization creates each new registry record with a blank description. Topic descriptions are optional manual metadata: never generate, infer, refresh, normalize, or clear them.
3. Use `src/derived/topic-normalization-patterns.tsv` as the detailed source of truth for steady-state topic creation, display names, aliases, and exceptions. Resolve every new slug through active rules whose scope includes `creation`. Preserve evidence-backed subject specificity, including distinctions between generic calibres and named systems, and preserve established slugs unless the active creation policy canonicalizes them. Leave `review`, `disabled`, ambiguous, or inapplicable matches unchanged and identify unresolved review candidates in the handoff.
4. Keep video-level topics as a concise summary subset of the richer segment-level topics. Resolve active creation rules before the canonical write. Treat review, ambiguous, or synchronization failures caused by the selected shard as blockers to finalization rather than leaving them for another process; do not widen the audit into unrelated corpus taxonomy maintenance.
5. Put referents that exist only inside fictional works under `fiction-...`, including fictional vessels, people, factions, events, technologies, and in-universe systems. Keep counterfactual real history, real proposed or unbuilt designs, possible future systems, and genre/format topics outside that namespace. If the fictional example illustrates a real-world point, retain both its `fiction-...` topic and the ordinary transcript-backed topics for the real doctrine, engineering, logistics, institution, or other lesson.
6. Treat the audit as iterative rather than terminal. On each content-exhaustion review, independently compare the full transcript against the current shard instead of reviewing only previously selected windows. Leave precise follow-up targets for thin or under-extracted ranges. Stop repeating the same model and effort when a pass produces churn without new transcript-backed substance, but keep the transcript eligible for a future review under a materially stronger configuration or improved method.

## Final Public-Wording Pass

After all transcript-backed content and topic decisions are complete, and before writing and validating the canonical shard:

1. Apply `$humanizer` in embedded mode. Run its draft, audit, and final loop internally, then use only the final rewrite in the shard. Do not place Humanizer draft text, audit bullets, or a separate Humanizer summary in the JSON, processing log, or handoff.
2. Apply Humanizer to every string value in `title`, `summary`, `body`, `question`, and `answerShort`, including video-level and segment-level occurrences. Use a neutral reference and study-guide voice. Read the shard as a continuous human experience, including summaries beside their bodies, rather than treating an individually grammatical field as automatically finished.
3. Treat the transcript and this naval-content skill's evidence-preservation instructions as higher priority than generic Humanizer defaults. Preserve every transcript-backed claim, proper noun, date, number, technical list, qualification, uncertainty, caveat, limitation, real-history-versus-scenario distinction, and whether a point is certain, tentative, or conditional. Attribution wording is not automatically preserved.
4. Every segment already carries `sourcePath` and `evidence`, so public host attribution is never needed merely to establish provenance. In a solo-speaker episode, drop routine host attribution and write the subject naturally. This applies equally to explanations, interpretations, judgments, predictions, recommendations, humor, uncertainty, and caution. A solo-speaker segment should normally contain no routine `Dr. Clarke`, `Dr Clarke`, `Alex Clarke`, bare `Clarke`, `the presenter`, `the speaker`, `the lecturer`, or `the host` framing. Preserve uncertainty and interpretation through the wording itself instead of repeatedly naming the person who said it. Do not repeat the name in a summary and its body.
5. In multi-speaker material such as an interview, panel, collaborative stream, or Bruships episode, name a speaker only when the reader needs the attribution to follow a change of speaker, disagreement, contrast, or quotation. Once the identity is clear, return to natural subject-first prose.
6. Before writing, scan all public fields in the whole shard for `Clark`, `Clarke`, and the generic speaker labels above. Identify the person behind every surname match from the transcript before editing. Rewrite routine references to Dr. Alex Clarke in a solo-speaker episode unless an actual quotation needs identification. Preserve other people named Clark or Clarke. If `check:site-content-wording` reports `host-attribution`, inspect every hit. A solo-speaker shard may retain the review finding only when every surviving match names another person or identifies a quotation that genuinely needs an owner. In multi-speaker material, also retain attribution needed to distinguish speakers.
7. During this wording phase, leave identifiers, slugs, kinds, starts, ends, timestamps, topics, `sourcePath`, evidence, key order, array order, JSON structure, and all other fields unchanged. Keep `videoId` only at the shard root and do not add it to segment records. Do not rewrite existing processing-log text. Required finalization may append its one new row after the checks succeed.
8. Review the fields one at a time and recheck every rewrite against its cited transcript passage. Check video-level `title` and `summary` wording against the full transcript and the evidence supporting its segments. Reject or revise wording that adds, removes, strengthens, weakens, or reattributes a claim.
9. Write the final field values, run the scoped wording check, and complete every required wording repair before running the timestamp sorter. Then run the sorter once for the selected shard, perform canonical shard validation, synchronize topics, and finalize the processing log in the required order below. The sorter is the ordering mechanism; do not replace it with a manual ordering check or repeat it unless a real sorting problem requires a repair and rerun.

## Shared-Output Boundary

- Do not run `generate:site-data`, `site:check`, `site:build`, Pagefind, `npm run check`, `npm run check:source`, or any other repository-wide generation, test, build, audit, topic-rewrite, or validation command. The repository-wide actionable wording gate runs inside `check:source`, while this skill uses only the exact-shard timestamp sorter, canonical validation of the selected shard, the scoped read-only `npm run check:site-content-wording -- --path <shard> --strict --review` command, and deterministic `npm run sync:video-topics` finalization as its validation and shared-command exceptions.
- Finish transcript comparison, apply every justified wording or content change directly to the selected shard, and write the canonical shard. Do not perform a pre-write drift check.
- After writing the selected shard, run `C:\Program Files\nodejs\npm.cmd run check:site-content-wording -- --path <canonical shard path> --strict --review`. Fix every high-confidence issue and rerun the wording check until it succeeds. Inspect every review candidate against the transcript; preserve legitimate historical, technical, operational, or interpretive wording, and do not use `--strict-review` or require the review count to reach zero. Run this scoped check even when the completed audit is unchanged, saturated, or confirms an intentionally empty shard. Finish and write all wording repairs before moving to the sorter.
- After the scoped wording check succeeds and all wording repairs are written, run the sorter once for that exact shard from the repository root:

  ```powershell
  bun run ./src/scripts/sort-video-segments-by-start.ts ./src/derived/video-segments/<manifest.fileStem>.json
  ```

  Run it with `sandbox_permissions: require_escalated` on the first attempt to avoid sandbox EPERM failures. The sorter writes only the selected shard. On `Sorted` or `Already sorted`, continue to canonical validation without a confirmation rerun. Do not rerun it because wording repairs changed the shard; those repairs must occur before this sort. Rerun only after repairing a malformed timestamp, sorter failure, or canonical-validation finding that demonstrates an actual chronological-ordering problem. An unresolved selected-shard sorting failure blocks finalization.
- After the scoped wording check, sorter result, and canonical shard validation succeed, run `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with `sandbox_permissions: require_escalated` on the first attempt. Ask for approval with a concise topic-synchronization justification and use the narrow reusable prefix for that npm command when the runtime supports one. Do not make a sandboxed attempt first. If elevation is denied or synchronization fails, stop finalization and report the blocker. Run synchronization even when the completed audit is unchanged, saturated, or confirms an intentionally empty shard; its corpus-wide result may be `added N topics` or `already current` and must not be attributed only to the selected shard.
- Append exactly one newline-terminated, semicolon-separated data line after the current final line at the physical bottom of the existing `src/derived/site-content-processing.log` only after the scoped wording check, sorter result, canonical shard validation, and topic synchronization all succeed. Append this result line for every completed selected-file audit, whether the audit changed the shard, left it unchanged, found the existing content saturated, or confirmed an intentionally empty shard. A wording-check failure, selected-shard sorting or validation failure, synchronization failure, or required elevation denial is a finalization blocker. Never prepend the entry or insert it beneath the header.
- Before appending, read and verify that the existing first line is exactly `timestamp;shardPath;result;notes`. If the file or header is missing or invalid, stop and report the blocker instead of creating or repairing the log.
- Construct the row as exactly four nonempty field values in this order: an exactly 19-character local timestamp formatted `yyyy-MM-ddTHH:mm:ss`; canonical shard path; concise result; concise notes. Do not write fractional seconds, a trailing `Z`, or a numeric UTC offset, and never use round-trip formats such as `Get-Date -Format o`. Describe any unresolved coverage or audiovisual work plainly in `result` and `notes` and in the handoff.
- Use this low-freedom PowerShell pattern, supplying the four variables with the actual audit result:

  ```powershell
  $timestamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  if ($timestamp.Length -ne 19 -or $timestamp -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$') { throw 'Processing-log timestamp must be exactly yyyy-MM-ddTHH:mm:ss with no fraction or timezone suffix.' }
  $fields = @($timestamp, $shardPath, $result, $notes)
  if ($fields.Count -ne 4 -or $fields.Where({ [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) { throw 'Processing-log row requires four nonempty fields.' }
  if ($fields.Where({ $_ -match '[;\r\n]' }).Count -gt 0) { throw 'Processing-log fields must not contain semicolons or line breaks.' }
  $line = $fields -join ';'
  Add-Content -LiteralPath 'src/derived/site-content-processing.log' -Value $line -Encoding utf8
  ```

- Do not put semicolons or line breaks inside field values; use commas when internal punctuation is needed. Before appending, confirm `$line.Split(';').Count -eq 4`. A valid row resembles `2026-07-15T16:10:20;src/derived/video-segments/<manifest.fileStem>.json;12 records strengthened;Full transcript compared, current pass saturated`.
- `shardPath` must be `src/derived/video-segments/<manifest.fileStem>.json`, matching the shard audited by this skill, not the transcript TXT path or a generated Markdown path. Do not add a separate video-ID field because the manifest-owned shard filename already contains the video ID. Describe the audit result in field three (for example, records strengthened, watch points added, unchanged saturated content, or intentionally empty shard confirmed), and use notes for coverage, limitations, and remaining work.
- Never use `Set-Content`, `WriteAllText`, output redirection, or any read-modify-rewrite operation for routine logging; never truncate, recreate, replace, remove, or reorder existing log content.
- Apart from the selected shard, the deterministic synchronizer's `topics.json` update, and that one processing-log append, do not write `src/derived/topic-normalization-patterns.tsv`, anything under `reports/`, `site/src/data/generated/archive/`, `site/dist/`, schedules, package files, tooling, Astro source, or CSS. Never inspect or hand-edit `topics.json`.
- The repository owner performs shared generation, tests, Astro/Pagefind builds, and integration validation before push.
- Read-only inspection scoped to the owned shard and its transcript TXT is allowed when useful. A lane-specific automation may additionally run only the private temporary-directory checks explicitly provided by that automation prompt.

## Handoff

Report the scope audited, the number or type of records strengthened, topic slugs added to the owned shard, active creation rules used, unresolved review or ambiguous candidates, whether the shard changed, the scoped wording-check result and any retained transcript-supported review candidates, whether the sorter changed or confirmed the selected shard, that `sync:video-topics` was invoked with elevation, the exact corpus-wide synchronization result, the processing-log line appended, and any remaining transcript passages that need another focused pass. State that the normalization catalog, manual registry editing, corpus-wide topic rewriting, generation, reports, other tests, builds, and validation were intentionally not touched. If the selected file was fully processed without a shard edit, still run the scoped wording check, sorter, synchronization, and append, then report the result line. Do not append when any required finalization gate fails.
