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
import {
  planTopicStoreSynchronization,
  writeTopicStoreSynchronization,
} from "../site/topic-store.js";

try {
  const options = parseArgs(process.argv.slice(2));
  const topicPlan = await planTopicStoreSynchronization({
    segmentsInput: options.segmentsInput,
    patternsInput: options.patternsInput,
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
  });
  console.error(
    `Generated site archive data: ${options.outputDir} (${archive.manifest.counts.videos} videos, ${archive.manifest.counts.segments} segments, ${archive.manifest.counts.topics} topics)`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(withSiteBuildRepairHint(message));
  process.exitCode = 1;
}

function parseArgs(args: string[]) {
  const options = {
    episodesInput: defaultSiteEpisodesInput,
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
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printUsage(): void {
  console.log(`Usage: npm run generate:site-data -- [options]

Options:
  --episodes-input <path>  Channel episode master. Defaults to ${defaultSiteEpisodesInput}.
  --metadata-input <path>  YouTube metadata store. Defaults to ${defaultSiteMetadataInput}.
  --transcripts-input <path> Transcript manifest. Defaults to ${defaultSiteTranscriptsInput}.
  --segments-input <path>  Per-video curated content directory. Defaults to ${defaultSiteSegmentsInput}.
  --patterns-input <path>  Topic normalization catalog. Defaults to ${defaultSitePatternsInput}.
  --output-dir <path>      Astro-facing archive directory. Defaults to ${defaultSiteArchiveOutputDir}.
`);
}
