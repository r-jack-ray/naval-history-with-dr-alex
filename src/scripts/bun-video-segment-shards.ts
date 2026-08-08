import {
  buildVideoSegmentShardIndex,
  listVideoSegmentShardFileNames,
  loadVideoSegmentShardFiles,
  type VideoSegmentShard,
  type VideoSegmentShardIndex,
} from "../site/video-segment-files.js";
import { partitionRoundRobin } from "./bun-worker-options.js";
import { runBunWorkerTask } from "./bun-worker-runner.js";

export async function discoverVideoSegmentShardsWithBunWorkers(
    inputDirectory: string,
    requestedWorkers: number,
): Promise<{ shardIndex: VideoSegmentShardIndex; workerCount: number }> {
  const fileNames = await listVideoSegmentShardFileNames(inputDirectory);
  const workerCount = Math.min(requestedWorkers, Math.max(1, fileNames.length));
  if (workerCount === 1) {
    return {
      shardIndex: buildVideoSegmentShardIndex(
          await loadVideoSegmentShardFiles(inputDirectory, fileNames),
      ),
      workerCount,
    };
  }

  const partitions = partitionRoundRobin(fileNames, workerCount);
  const loaded = (await Promise.all(partitions.map(async (partition) => (
      await runBunWorkerTask<VideoSegmentShard[]>(
          new URL("./bun-video-segment-shard-worker.ts", import.meta.url),
          {fileNames: partition, inputDirectory},
          "Video-segment shard",
      )
  )))).flat();
  if (loaded.length !== fileNames.length) {
    throw new Error(
        `Parallel shard loading returned ${loaded.length} shards for ${fileNames.length} files.`,
    );
  }
  return {
    shardIndex: buildVideoSegmentShardIndex(loaded),
    workerCount,
  };
}
