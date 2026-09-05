import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCuratedTopicStore,
  type CuratedTopicSeed,
  type CuratedTopicStore,
} from "../content/schemas/index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";

const DEFAULT_TOPIC_STORE_PATH = path.resolve("src/derived/video-segments/topics.json");

export interface SortVideoTopicRegistryRuntime {
  stdout?: (text: string) => void;
}

export interface SortVideoTopicRegistryResult {
  changed: boolean;
  removedBlankSummaryCount: number;
  sortedAliasListCount: number;
  topicCount: number;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function arraysMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortTopic(topic: CuratedTopicSeed): CuratedTopicSeed {
  return {
    slug: topic.slug,
    title: topic.title,
    ...(topic.summary === undefined || topic.summary.trim().length === 0
      ? {}
      : {summary: topic.summary}),
    ...(topic.aliases === undefined ? {} : {aliases: [...topic.aliases].sort(compareText)}),
  };
}

export function sortVideoTopicRegistry(store: CuratedTopicStore): CuratedTopicStore {
  return {
    topics: store.topics
      .map(sortTopic)
      .sort((left, right) => compareText(left.slug, right.slug)),
  };
}

export async function runSortVideoTopicRegistry(
    inputPath = DEFAULT_TOPIC_STORE_PATH,
    runtime: SortVideoTopicRegistryRuntime = {},
): Promise<SortVideoTopicRegistryResult> {
  const resolvedInputPath = path.resolve(inputPath);
  const stdout = runtime.stdout ?? ((text: string) => console.log(text));
  const originalText = await readFile(resolvedInputPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(originalText) as unknown;
  } catch (error) {
    throw new Error(`Could not parse topic registry ${resolvedInputPath}.`, {cause: error});
  }

  const store = parseCuratedTopicStore(parsed, `Topic registry ${resolvedInputPath}`);
  const sortedStore = sortVideoTopicRegistry(store);
  const removedBlankSummaryCount = store.topics.filter((topic) => (
    topic.summary !== undefined && topic.summary.trim().length === 0
  )).length;
  const sortedAliasListCount = store.topics.filter((topic) => (
    topic.aliases !== undefined
    && !arraysMatch(topic.aliases, [...topic.aliases].sort(compareText))
  )).length;
  const sortedText = `${JSON.stringify(sortedStore, null, 2)}\n`;
  const changed = sortedText !== originalText;

  if (changed) {
    await writeTextAtomically(resolvedInputPath, sortedText);
    stdout(
        [
          `Sorted ${store.topics.length} topics by slug and ${sortedAliasListCount} alias list(s);`,
          `removed ${removedBlankSummaryCount} blank summary field(s): ${resolvedInputPath}`,
        ].join(" "),
    );
  } else {
    stdout(`Already sorted: ${resolvedInputPath}`);
  }

  return {
    changed,
    removedBlankSummaryCount,
    sortedAliasListCount,
    topicCount: store.topics.length,
  };
}

function isCliEntryPoint(moduleUrl: string, argumentPath: string | undefined): boolean {
  let isEntryPoint = false;
  if (argumentPath !== undefined) {
    const modulePath = path.resolve(fileURLToPath(moduleUrl));
    const resolvedArgumentPath = path.resolve(argumentPath);
    isEntryPoint = process.platform === "win32"
        ? modulePath.toLocaleLowerCase("en-US") === resolvedArgumentPath.toLocaleLowerCase("en-US")
        : modulePath === resolvedArgumentPath;
  }
  return isEntryPoint;
}

async function main(): Promise<void> {
  await runSortVideoTopicRegistry(process.argv[2] ?? DEFAULT_TOPIC_STORE_PATH);
}

if (isCliEntryPoint(import.meta.url, process.argv[1])) {
  await main();
}
