import {
  defaultTopicNormalizationPatternsInput,
  synchronizeCuratedTopicStore,
} from "../site/topic-store.js";

const options = parseArgs(process.argv.slice(2));

try {
  const result = await synchronizeCuratedTopicStore(
    options.segmentsInput,
    options.patternsInput,
  );
  const action = result.changed
    ? `added ${result.addedSlugs.length} topic${result.addedSlugs.length === 1 ? "" : "s"}`
    : "already current";
  console.error(
    `Synchronized ${options.segmentsInput}/topics.json: ${action} (${result.usedTopicCount} used, ${result.topicCount} stored).`,
  );
  for (const topic of result.reviewTopics) {
    console.error(
      `Topic title requires review: ${topic.slug} (generated title: ${topic.generatedTitle}).`,
    );
  }
  for (const slug of result.summaryReviewSlugs) {
    console.error(`Topic summary requires corpus-grounded review: ${slug}.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args: string[]): { segmentsInput: string; patternsInput: string } {
  const options = {
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
      console.log(`Usage: npm run sync:video-topics -- [options]

Options:
  --segments-input <path>  Per-video curated content directory. Defaults to src/derived/video-segments.
  --patterns-input <path>  Topic normalization catalog. Defaults to ${defaultTopicNormalizationPatternsInput}.`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
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
