import {
  loadTopicNormalizationCatalog,
  resolveTopicCreation,
  type TopicNormalizationCatalog,
  type TopicSlugResolution,
} from "../site/topic-normalization.js";
import type { VideoSegmentShardIndex } from "../site/video-segment-files.js";
import { partitionRoundRobin } from "./bun-worker-options.js";
import { runBunWorkerTask } from "./bun-worker-runner.js";
import { discoverVideoSegmentShardsWithBunWorkers } from "./bun-video-segment-shards.js";
import type { TopicCreationResolutionEntry } from "./bun-topic-normalization-worker.js";

export interface ParallelTopicNormalizationInputs {
  catalog: TopicNormalizationCatalog;
  creationResolutions: ReadonlyMap<string, TopicSlugResolution>;
  shardIndex: VideoSegmentShardIndex;
  workerCount: number;
}

export async function prepareParallelTopicNormalizationInputs(
  segmentsInput: string,
  patternsInput: string,
  requestedWorkers: number,
): Promise<ParallelTopicNormalizationInputs> {
  const [{ shardIndex, workerCount: shardWorkerCount }, catalog] = await Promise.all([
    discoverVideoSegmentShardsWithBunWorkers(segmentsInput, requestedWorkers),
    loadTopicNormalizationCatalog(patternsInput),
  ]);
  const slugs = collectTopicCreationSlugs(shardIndex);
  const workerCount = Math.min(requestedWorkers, Math.max(1, slugs.length));
  const creationResolutions = await buildParallelTopicCreationResolutions(
    catalog,
    slugs,
    workerCount,
  );
  return {
    catalog,
    creationResolutions,
    shardIndex,
    workerCount: Math.max(shardWorkerCount, workerCount),
  };
}

export function collectTopicCreationSlugs(
  shardIndex: VideoSegmentShardIndex,
): string[] {
  const slugs = new Set<string>();
  for (const shard of shardIndex.shards) {
    for (const slug of shard.value.topics) {
      slugs.add(slug);
    }
    for (const segment of shard.value.segments) {
      for (const slug of segment.topics) {
        slugs.add(slug);
      }
    }
  }
  return [...slugs].sort((left, right) => left.localeCompare(right));
}

async function buildParallelTopicCreationResolutions(
  catalog: TopicNormalizationCatalog,
  slugs: readonly string[],
  workerCount: number,
): Promise<Map<string, TopicSlugResolution>> {
  if (workerCount === 1) {
    return new Map(slugs.map((slug) => [slug, resolveTopicCreation(catalog, slug)]));
  }

  const partitions = partitionRoundRobin(slugs, workerCount);
  const entries = (await Promise.all(partitions.map(async (partition) => (
    await runBunWorkerTask<TopicCreationResolutionEntry[]>(
      new URL("./bun-topic-normalization-worker.ts", import.meta.url),
      { catalog, slugs: partition },
      "Topic-normalization",
    )
  )))).flat();
  const result = new Map(entries);
  if (entries.length !== slugs.length || result.size !== slugs.length) {
    throw new Error(
      `Parallel topic normalization returned ${entries.length} entries for ${slugs.length} topic slugs.`,
    );
  }
  return result;
}
