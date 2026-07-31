import {
  defaultSiteArchiveOutputDir,
  defaultSiteEpisodesInput,
  defaultSiteMetadataInput,
  defaultSitePatternsInput,
  defaultSiteTranscriptsInput,
  defaultSiteSegmentsInput,
  generateSiteArchiveData,
} from "../site/archive-data.js";
import { withSiteBuildRepairHint } from "../site/build-repair-guidance.js";
import type {
  TopicNormalizationCatalog,
  TopicSlugResolution,
} from "../site/topic-normalization.js";
import {
  planTopicStoreSynchronization,
  writeTopicStoreSynchronization,
} from "../site/topic-store.js";
import {
  discoverVideoSegmentShards,
  type VideoSegmentShardIndex,
} from "../site/video-segment-files.js";
import {
  isDirectExecution,
  printRunTime,
} from "./console-run-timer.js";

export interface GenerateSiteDataCliOptions {
  episodesInput: string;
  help: boolean;
  metadataInput: string;
  outputDir: string;
  patternsInput: string;
  segmentsInput: string;
  transcriptsInput: string;
}

export interface GenerateSiteDataRuntime {
  precomputedCreationResolutions?: ReadonlyMap<string, TopicSlugResolution>;
  preloadedCatalog?: TopicNormalizationCatalog;
  preloadedShardIndex?: VideoSegmentShardIndex;
  summaryFields?: readonly string[];
}

export async function runGenerateSiteData(
  options: GenerateSiteDataCliOptions,
  runtime: GenerateSiteDataRuntime = {},
): Promise<void> {
  const shardIndex = runtime.preloadedShardIndex
    ?? await discoverVideoSegmentShards(options.segmentsInput);
  const topicPlan = await planTopicStoreSynchronization({
    segmentsInput: options.segmentsInput,
    patternsInput: options.patternsInput,
    ...(runtime.precomputedCreationResolutions === undefined
      ? {}
      : { precomputedCreationResolutions: runtime.precomputedCreationResolutions }),
    ...(runtime.preloadedCatalog === undefined
      ? {}
      : { preloadedCatalog: runtime.preloadedCatalog }),
    preloadedShardIndex: shardIndex,
  });
  const topicResult = await writeTopicStoreSynchronization(topicPlan);
  for (const topic of topicResult.reviewTopics) {
    console.error(
      `Topic title requires review: ${topic.slug} (generated title: ${topic.generatedTitle}).`,
    );
  }
  const archive = await generateSiteArchiveData({
    ...options,
    patternsSha256: topicPlan.catalog.sha256,
    patternsSourceSha256: topicPlan.catalog.sourceSha256,
    preloadedShardIndex: shardIndex,
  });
  console.error(
    [
      `Generated site archive data: ${options.outputDir}`,
      `(${archive.manifest.counts.videos} videos,`,
      `${archive.manifest.counts.segments} segments,`,
      `${archive.manifest.counts.topics} topics)`,
      ...(runtime.summaryFields ?? []),
    ].join(" "),
  );
}

export function parseGenerateSiteDataArgs(args: readonly string[]): GenerateSiteDataCliOptions {
  const options: GenerateSiteDataCliOptions = {
    episodesInput: defaultSiteEpisodesInput,
    help: false,
    metadataInput: defaultSiteMetadataInput,
    transcriptsInput: defaultSiteTranscriptsInput,
    segmentsInput: defaultSiteSegmentsInput,
    patternsInput: defaultSitePatternsInput,
    outputDir: defaultSiteArchiveOutputDir,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--episodes-input":
        options.episodesInput = readValue(args, ++index, arg);
        break;
      case "--metadata-input":
        options.metadataInput = readValue(args, ++index, arg);
        break;
      case "--transcripts-input":
        options.transcriptsInput = readValue(args, ++index, arg);
        break;
      case "--segments-input":
        options.segmentsInput = readValue(args, ++index, arg);
        break;
      case "--patterns-input":
        options.patternsInput = readValue(args, ++index, arg);
        break;
      case "--output-dir":
        options.outputDir = readValue(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
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

export function generateSiteDataUsage(
  command = "npm run generate:site-data",
  includeWorkers = false,
): string {
  return `Usage: ${command} -- [options]

Options:
  --episodes-input <path>  Channel episode master. Defaults to ${defaultSiteEpisodesInput}.
  --metadata-input <path>  YouTube metadata store. Defaults to ${defaultSiteMetadataInput}.
  --transcripts-input <path> Transcript manifest. Defaults to ${defaultSiteTranscriptsInput}.
  --segments-input <path>  Per-video curated content directory. Defaults to ${defaultSiteSegmentsInput}.
  --patterns-input <path>  Topic normalization catalog. Defaults to ${defaultSitePatternsInput}.
  --output-dir <path>      Astro-facing archive directory. Defaults to ${defaultSiteArchiveOutputDir}.
${includeWorkers ? "  --workers <count>        Worker count. Defaults to min(8, available CPUs).\n" : ""}  --help                    Show this help.
`;
}

async function main(): Promise<void> {
  const options = parseGenerateSiteDataArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(generateSiteDataUsage());
    return;
  }
  await runGenerateSiteData(options);
}

if (isDirectExecution(import.meta.url)) {
  const runStartedAt = Date.now();
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(withSiteBuildRepairHint(message));
    process.exitCode = 1;
  }).finally(() => {
    printRunTime(runStartedAt);
  });
}
