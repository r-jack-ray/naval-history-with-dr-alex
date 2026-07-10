import {
  defaultSiteArchiveOutput,
  defaultSiteEpisodesInput,
  defaultSiteMetadataInput,
  defaultSiteSegmentsInput,
  generateSiteArchiveData,
} from "../site/archive-data.js";
import { withSiteBuildRepairHint } from "../site/build-repair-guidance.js";
import { synchronizeCuratedTopicStore } from "../site/topic-store.js";

try {
  const options = parseArgs(process.argv.slice(2));
  await synchronizeCuratedTopicStore(options.segmentsInput);
  const archive = await generateSiteArchiveData(options);
  console.error(
    `Generated site archive data: ${options.output} (${archive.videos.length} videos, ${archive.segments.length} segments, ${archive.topics.length} topics)`,
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
    segmentsInput: defaultSiteSegmentsInput,
    output: defaultSiteArchiveOutput,
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
      case "--segments-input":
        options.segmentsInput = readValue(args, ++index, arg);
        break;
      case "--output":
        options.output = readValue(args, ++index, arg);
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
  --segments-input <path>  Per-video curated content directory. Defaults to ${defaultSiteSegmentsInput}.
  --output <path>          Astro-facing archive JSON. Defaults to ${defaultSiteArchiveOutput}.
`);
}
