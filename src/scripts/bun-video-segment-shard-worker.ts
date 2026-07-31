#!/usr/bin/env bun

import { parentPort, workerData } from "node:worker_threads";

import {
  loadVideoSegmentShardFiles,
  type VideoSegmentShard,
} from "../site/video-segment-files.js";

interface VideoSegmentShardWorkerTask {
  fileNames: string[];
  inputDirectory: string;
}

const task = workerData as VideoSegmentShardWorkerTask;
const shards: VideoSegmentShard[] = await loadVideoSegmentShardFiles(
  task.inputDirectory,
  task.fileNames,
);
if (parentPort === null) {
  throw new Error("Bun video-segment shard worker has no parent message port.");
}
parentPort.postMessage(shards);
