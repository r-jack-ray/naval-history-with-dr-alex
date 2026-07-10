---
name: naval-site-content-auditor
description: Audit and strengthen the Naval History with Dr. Alex Astro/Pagefind study-guide content after transcript curation. Use when asked to add substance to thin segment notes, remove workflow/scaffold wording from public fields, align wording with learner intent, validate transcript-backed claims, improve segment density, or run a high-effort follow-up pass over `src/derived/video-segments/`, video pages, segment pages, topic pages, or generated archive data.
---

# Naval Site Content Auditor

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` after one or more transcripts have already been converted into site-visible content.

Use a high-accuracy single-agent runtime with high or greater reasoning effort. Keep model-version selection in the invoking runtime or automation rather than pinning it in this skill. If the runtime cannot enforce that setting, still follow this workflow with a slow, evidence-first audit stance.

This audit is repeatable. A prior first, second, third, or later pass is not evidence that the content is exhausted, and a newly available stronger model is a valid reason to run another independent full-transcript comparison. If a pass only rephrases or rearranges existing material without adding transcript-backed substance, stop repeating that specific model-and-effort configuration and record it as saturated. Saturation does not prevent a future pass with a materially stronger model, higher effort, improved method, or new evidence.

## Site Intent

- Write for readers learning naval history and how navies work, not for creators, maintainers, or pipeline operators.
- Treat every segment as a watch point into a Dr. Clarke video: preview what the reader will see or hear, identify the naval subject, and explain the learning payoff.
- Keep the site highly searchable by using transcript-supported names for ships, classes, navies, battles, weapons, policies, doctrine, logistics, acronyms, and alternate wording.
- Prefer many precise, substantive segments over one sparse video overview when transcript evidence supports more granular coverage.
- Do not surface YouTube analytics, internal filenames, processing status, or raw inventory details in public pages unless the user asks for an admin/debug view.

## Start

1. Read `AGENTS.md`, `.agents/transcript-content-curator.md`, and `.agents/site-content-auditor.md`.
2. Inspect the current diff before edits with `git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex status --short`.
3. Treat `src/derived/video-segments/` as the source for public segment wording. Treat `site/src/data/generated/archive.json` as generated output.
4. If a specific video, segment, topic, or screenshot was named, scope the audit there first. Otherwise sample the shortest and most scaffold-like segment bodies across `chapter`, `notable_point`, and `qa`.

## Audit Public Wording

1. Scan public fields: `summary`, `body`, `question`, `answerShort`, visible page headings, card text, and search placeholder text.
2. Remove maintainer/workflow language from public fields when it describes the site or content pipeline, including "first pass", "later extraction", "processing", "curation", "source window", "evidence window", "search metadata", "seed", "prototype", "this segment exists to", and "useful for search".
3. Keep workflow status in `src/derived/site-content-processing.log`, `reports/`, task notes, or the handoff, not in the site content.
4. Prefer reader-facing study-guide prose:
   - Explain what the video moment covers.
   - State the historical, technical, strategic, or historiographic takeaway.
   - Make clear why opening the video at that time is useful.
   - Include transcript-grounded caveats when useful.
   - Avoid announcing that the page or segment is an archive, prototype, seed, extraction, or search target. Words such as "prototype" and "processing" are fine when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes or data processing.

## Add Substance

1. Find thin records with short or label-like `body` text. Useful scans include bodies under 120-160 characters, bodies that begin with "This is", and bodies that mention users/search/browsing instead of the subject.
2. Read the segment `summary`, `evidence` notes, and the cited transcript passage before expanding a record.
3. For `chapter` and `notable_point`, aim for 2-4 concise sentences in `body`.
4. For `qa`, keep the actual prompt in `question`, the direct answer in `answerShort`, and use `body` for context, constraints, and why the answer matters.
5. Do not invent new facts. If the existing evidence is too thin, either inspect the transcript around the cited time or leave a targeted follow-up note.
6. Merge duplicate phrasing instead of padding. More text should add substance, not repetition.

## Deepen Coverage And Topics

1. Re-read the transcript across the audited scope, not only the existing segment windows. Add omitted chapters, notable points, and Q&A exchanges when substantive learning value is still missing from the pages.
2. Let significant topics arise from the strengthened content. Add transcript-backed topic slugs to the video and segment arrays without targeting a tag count or confining the audit to the existing taxonomy. Do not inspect or edit `topics.json` during an ordinary content audit; archive generation synchronizes it deterministically.
3. Keep video-level topics as a concise summary subset of the richer segment-level topics. Investigate registry records, aliases, synonyms, or near-duplicates only when synchronization or validation reports a taxonomy problem, or when the user explicitly requests taxonomy work.
4. Treat the audit as iterative rather than terminal. On each content-exhaustion review, independently compare the full transcript against the current shard instead of reviewing only previously selected windows. Leave precise follow-up targets for thin or under-extracted ranges. Stop repeating the same model and effort when a pass produces churn without new transcript-backed substance, but keep the transcript eligible for a future review under a materially stronger configuration or improved method.

## Validate

1. Regenerate generated data after editing the seed:

```powershell
npm run generate:site-data
```

2. Run the content/site validation hook:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
```

3. Run the site build when layout, visible wording, generated archive data, or Pagefind output matters:

```powershell
npm run site:build
```

4. Run `git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check`.
5. Report any existing warnings separately from new failures.

## Handoff

Report the scope audited, the number or type of records strengthened, topic slugs added to shards, files changed, validation commands, and any remaining transcript passages that need another focused pass. Mention topic-registry work only when a synchronization or taxonomy problem required intervention.
