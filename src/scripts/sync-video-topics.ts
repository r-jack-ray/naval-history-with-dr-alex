import type { TopicNormalizationCatalog, TopicSlugResolution, } from "../site/topic-normalization.js";
import { assertTopicStoreSynchronized, defaultTopicNormalizationPatternsInput, planTopicStoreSynchronization, writeTopicStoreSynchronization, } from "../site/topic-store.js";
import type { VideoSegmentShardIndex } from "../site/video-segment-files.js";

export interface SyncVideoTopicsCliOptions {
  help: boolean;
  patternsInput: string;
  segmentsInput: string;
}

export interface SyncVideoTopicsRuntime {
  precomputedCreationResolutions?: ReadonlyMap<string, TopicSlugResolution>;
  preloadedCatalog?: TopicNormalizationCatalog;
  preloadedShardIndex?: VideoSegmentShardIndex;
  summaryFields?: readonly string[];
}

export async function runSyncVideoTopics(
    options: SyncVideoTopicsCliOptions,
    runtime: SyncVideoTopicsRuntime = {},
): Promise<void> {
  const plan = await planTopicStoreSynchronization({
    patternsInput: options.patternsInput,
    segmentsInput: options.segmentsInput,
    ...(runtime.precomputedCreationResolutions === undefined
        ? {}
        : {precomputedCreationResolutions: runtime.precomputedCreationResolutions}),
    ...(runtime.preloadedCatalog === undefined
        ? {}
        : {preloadedCatalog: runtime.preloadedCatalog}),
    ...(runtime.preloadedShardIndex === undefined
        ? {}
        : {preloadedShardIndex: runtime.preloadedShardIndex}),
  });
  const result = await writeTopicStoreSynchronization(plan);
  const action = result.changed
      ? `added ${result.addedSlugs.length} topic${result.addedSlugs.length === 1 ? "" : "s"}`
      : "already current";
  console.log(
      [
        `Synchronized ${options.segmentsInput}/topics.json:`,
        action,
        `(${result.usedTopicCount} used, ${result.topicCount} stored).`,
        ...(runtime.summaryFields ?? []),
      ].join(" "),
  );
  for (const topic of result.reviewTopics) {
    console.warn(
        `Topic title requires review: ${topic.slug} (generated title: ${topic.generatedTitle}).`,
    );
  }
}

export async function runCheckVideoTopics(
    options: SyncVideoTopicsCliOptions,
    runtime: SyncVideoTopicsRuntime = {},
): Promise<void> {
  const plan = await planTopicStoreSynchronization({
    patternsInput: options.patternsInput,
    segmentsInput: options.segmentsInput,
    ...(runtime.precomputedCreationResolutions === undefined
        ? {}
        : {precomputedCreationResolutions: runtime.precomputedCreationResolutions}),
    ...(runtime.preloadedCatalog === undefined
        ? {}
        : {preloadedCatalog: runtime.preloadedCatalog}),
    ...(runtime.preloadedShardIndex === undefined
        ? {}
        : {preloadedShardIndex: runtime.preloadedShardIndex}),
  });
  const result = assertTopicStoreSynchronized(plan);
  console.log(
      [
        `Topic registry is current: ${plan.topicStorePath}`,
        `(${result.usedTopicCount} used, ${result.topicCount} stored).`,
        ...(runtime.summaryFields ?? []),
      ].join(" "),
  );
  for (const topic of result.reviewTopics) {
    console.warn(
        `Topic title requires review: ${topic.slug} (generated title: ${topic.generatedTitle}).`,
    );
  }
}

export function parseSyncVideoTopicsArgs(args: readonly string[]): SyncVideoTopicsCliOptions {
  const options: SyncVideoTopicsCliOptions = {
    help: false,
    segmentsInput: "src/derived/video-segments",
    patternsInput: defaultTopicNormalizationPatternsInput,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--segments-input") {
      options.segmentsInput = readValue(args, ++index, arg);
      continue;
    }
    if (arg === "--patterns-input") {
      options.patternsInput = readValue(args, ++index, arg);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function syncVideoTopicsUsage(
    command = "npm run sync:video-topics",
    includeWorkers = false,
): string {
  return `Usage: ${command} -- [options]

Options:
  --segments-input <path>  Per-video curated content directory. Defaults to src/derived/video-segments.
  --patterns-input <path>  Topic normalization catalog. Defaults to ${defaultTopicNormalizationPatternsInput}.
${includeWorkers ? "  --workers <count>        Worker count. Defaults to min(8, available CPUs).\n" : ""}  --help                    Show this help.
`;
}
