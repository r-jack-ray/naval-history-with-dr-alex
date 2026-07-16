import { synchronizeCuratedTopicStore } from "../site/topic-store.js";

const inputDirectory = readInputDirectory(process.argv.slice(2));

try {
  const result = await synchronizeCuratedTopicStore(inputDirectory);
  const action = result.changed
    ? `added ${result.addedSlugs.length} topic${result.addedSlugs.length === 1 ? "" : "s"}`
    : "already current";
  console.error(
    `Synchronized ${inputDirectory}/topics.json: ${action} (${result.usedTopicCount} used, ${result.topicCount} stored).`,
  );
  for (const topic of result.reviewTopics) {
    console.error(
      `Topic title requires review: ${topic.slug} (generated title: ${topic.generatedTitle}).`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function readInputDirectory(args: string[]): string {
  if (args.length === 0) {
    return "src/derived/video-segments";
  }
  if (args.length === 2 && args[0] === "--segments-input" && args[1] !== undefined) {
    return args[1];
  }
  throw new Error("Usage: npm run sync:video-topics -- [--segments-input <path>]");
}
