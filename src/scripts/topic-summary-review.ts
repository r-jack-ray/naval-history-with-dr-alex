import { readFile } from "node:fs/promises";

import {
  applyTopicSummaryLedger,
  auditTopicSummaries,
  buildTopicSummaryIndex,
  canonicalJson,
  createTopicSummaryBatch,
  inspectTopicSummary,
  loadTopicSummaryIndex,
  parseTopicSummaryLedger,
  sha256,
  writeTopicSummaryIndex,
  type TopicSummaryBatchSpec,
  type TopicSummaryCorpusManifest,
  type TopicSummaryIndex,
  type TopicSummaryIndexOptions,
  type TopicSummaryLedgerRecord,
} from "../site/topic-summary-review.js";

const defaults: TopicSummaryIndexOptions = {
  segmentsInput: "src/derived/video-segments",
  patternsInput: "src/derived/topic-normalization-patterns.tsv",
  episodesInput: "src/channel/episodes.json",
  metadataInput: "src/channel/video-metadata.json",
  transcriptsInput: "src/transcripts/manifest.json",
};

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

export async function runTopicSummaryReview(args: string[]): Promise<string> {
  const lines: string[] = [];
  await run(args, (line) => lines.push(line));
  return lines.join("\n");
}

async function run(args: string[], logger: (line: string) => void = console.log): Promise<void> {
  const command = args[0];
  if (command === undefined || command === "--help" || command === "-h") {
    logger(usage());
    return;
  }
  const options = parseOptions(args.slice(1));
  if (command === "index") {
    const index = await buildTopicSummaryIndex(indexOptions(options));
    const output = value(options, "output", "reports/topic-summary-review/index.json");
    const hash = await writeTopicSummaryIndex(output, index);
    logger(`Topic summary index ${index.indexVersion}: ${output} (${hash}; ${index.counts.registryTopics} topics, ${index.counts.videoKeys} video keys, ${index.counts.segmentKeys} segment keys).`);
    return;
  }
  if (command === "inspect") {
    const index = await loadIndex(value(options, "index", "reports/topic-summary-review/index.json"));
    const slug = requiredValue(options, "slug");
    logger(canonicalJson(inspectTopicSummary(index, slug)).trimEnd());
    return;
  }
  if (command === "packet") {
    const index = await loadIndex(value(options, "index", "reports/topic-summary-review/index.json"));
    const specPath = requiredValue(options, "batch");
    const spec = JSON.parse(await readFile(specPath, "utf8")) as TopicSummaryBatchSpec;
    const result = await createTopicSummaryBatch(index, spec);
    logger(`Created topic summary batch ${spec.batchId}: ${result.records.length} records, ledger ${result.ledgerSha256}, evidence ${result.evidencePacketSha256}.`);
    return;
  }
  if (command === "manifest") {
    const indexPath = value(options, "index", "reports/topic-summary-review/index.json");
    const indexText = await readFile(indexPath, "utf8");
    const index = await loadTopicSummaryIndex(indexPath);
    const specPaths = options.get("batch") ?? [];
    if (specPaths.length === 0) throw new Error("Manifest creation requires one or more --batch <spec.json> arguments.");
    const batches = [];
    const owned = new Set<string>();
    for (const specPath of specPaths) {
      const spec = JSON.parse(await readFile(specPath, "utf8")) as TopicSummaryBatchSpec;
      const ledgerText = await readFile(spec.outputLedgerPath, "utf8");
      for (const slug of spec.slugs) {
        if (owned.has(slug)) throw new Error(`Duplicate batch ownership for slug ${slug}.`);
        owned.add(slug);
      }
      batches.push({
        batchId: spec.batchId,
        primaryGroup: spec.primaryGroup,
        subgroup: spec.subgroup,
        slugs: [...spec.slugs],
        ledgerPath: spec.outputLedgerPath,
        ledgerSha256: sha256(ledgerText),
      });
    }
    const missing = index.topics.map((topic) => topic.slug).filter((slug) => !owned.has(slug));
    if (missing.length > 0) throw new Error(`Corpus manifest is missing ${missing.length} topic slugs; first missing: ${missing.slice(0, 20).join(", ")}.`);
    const manifest: TopicSummaryCorpusManifest = {
      schemaVersion: 1,
      indexVersion: index.indexVersion,
      indexPath,
      indexSha256: sha256(indexText),
      batches,
    };
    const output = requiredValue(options, "output");
    const { writeTextAtomically } = await import("../pipeline/atomic-write.js");
    await writeTextAtomically(output, canonicalJson(manifest));
    logger(`Created complete topic summary corpus manifest: ${output} (${batches.length} batches, ${owned.size} topics).`);
    return;
  }
  if (command === "audit") {
    const indexPath = options.get("index")?.at(-1);
    const index = indexPath === undefined
      ? await buildTopicSummaryIndex(indexOptions(options))
      : await loadIndex(indexPath);
    const manifestPath = options.get("manifest")?.at(-1);
    let manifest: TopicSummaryCorpusManifest | undefined;
    const ledgers = new Map<string, TopicSummaryLedgerRecord[]>();
    if (manifestPath !== undefined) {
      manifest = JSON.parse(await readFile(manifestPath, "utf8")) as TopicSummaryCorpusManifest;
      for (const batch of manifest.batches) {
        const text = await readFile(batch.ledgerPath, "utf8");
        if (sha256(text) !== batch.ledgerSha256) throw new Error(`Ledger hash mismatch: ${batch.ledgerPath}.`);
        ledgers.set(batch.ledgerPath, parseTopicSummaryLedger(text, batch.ledgerPath));
      }
    }
    const generatedTopicsPath = value(options, "generated-topics", "site/src/data/generated/archive/topics.json");
    let generatedTopics: Array<{ slug: string; summary: string }> = [];
    try {
      generatedTopics = JSON.parse(await readFile(generatedTopicsPath, "utf8")) as Array<{ slug: string; summary: string }>;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    const result = auditTopicSummaries(index, manifest, ledgers, generatedTopics);
    const output = options.get("output")?.at(-1);
    if (output === undefined) {
      logger(canonicalJson(result).trimEnd());
    } else {
      const { writeTextAtomically } = await import("../pipeline/atomic-write.js");
      await writeTextAtomically(output, canonicalJson(result));
      logger(`Topic summary audit: ${output} (${result.usedTopicCount} used topics; ${result.legacyDefaultSlugs.length} legacy defaults; ${result.emptySummarySlugs.length} empty; ${result.ledgerFindings.length} ledger findings).`);
    }
    const blockers = result.legacyDefaultSlugs.length + result.forbiddenFramingSlugs.length
      + result.emptySummarySlugs.length + result.overLengthSlugs.length
      + result.duplicateSummaryGroups.length + result.generatedSummaryMismatchSlugs.length
      + result.ledgerFindings.length;
    if (options.has("require-complete") && blockers > 0) throw new Error(`Topic summary audit found ${blockers} blocking result groups.`);
    return;
  }
  if (command === "apply") {
    const index = await loadIndex(requiredValue(options, "index"));
    const ledger = requiredValue(options, "ledger");
    const selectedSlugs = options.get("slug");
    const changes = await applyTopicSummaryLedger({
      index,
      ledgerPath: ledger,
      topicStorePath: value(options, "topic-store", "src/derived/video-segments/topics.json"),
      ...(selectedSlugs === undefined ? {} : { selectedSlugs }),
      dryRun: !options.has("write"),
    });
    logger(canonicalJson({ dryRun: !options.has("write"), changes }).trimEnd());
    return;
  }
  throw new Error(`Unknown topic-summary command ${command}.\n${usage()}`);
}

function indexOptions(options: Map<string, string[]>): TopicSummaryIndexOptions {
  return {
    segmentsInput: value(options, "segments-input", defaults.segmentsInput),
    patternsInput: value(options, "patterns-input", defaults.patternsInput),
    episodesInput: value(options, "episodes-input", defaults.episodesInput),
    metadataInput: value(options, "metadata-input", defaults.metadataInput),
    transcriptsInput: value(options, "transcripts-input", defaults.transcriptsInput),
  };
}

async function loadIndex(path: string): Promise<TopicSummaryIndex> {
  return loadTopicSummaryIndex(path);
}

function parseOptions(args: string[]): Map<string, string[]> {
  const values = new Map<string, string[]>();
  const flags = new Set(["write", "require-complete"]);
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (raw === undefined || !raw.startsWith("--")) throw new Error(`Expected option, received ${raw ?? "<missing>"}.`);
    const name = raw.slice(2);
    if (flags.has(name)) {
      values.set(name, ["true"]);
      continue;
    }
    const optionValue = args[++index];
    if (optionValue === undefined || optionValue.startsWith("--")) throw new Error(`Missing value for --${name}.`);
    values.set(name, [...(values.get(name) ?? []), optionValue]);
  }
  return values;
}

function value(options: Map<string, string[]>, name: string, fallback: string): string {
  return options.get(name)?.at(-1) ?? fallback;
}

function requiredValue(options: Map<string, string[]>, name: string): string {
  const result = options.get(name)?.at(-1);
  if (result === undefined) throw new Error(`Missing required --${name} option.`);
  return result;
}

function usage(): string {
  return `Usage: npm run topic-summary:<command> -- [options]

Commands:
  index     Build a stable complete-corpus evidence index.
  inspect   Print every indexed location for one --slug.
  packet    Create one proposal ledger and immutable evidence packet from --batch.
  manifest  Create a complete ownership manifest from repeated --batch specs.
  audit     Audit live summaries and optional --manifest ledgers.
  apply     Dry-run exact verified proposals; add --write to update topics.json.`;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
