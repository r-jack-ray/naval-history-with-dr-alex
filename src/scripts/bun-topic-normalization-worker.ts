#!/usr/bin/env bun

import { parentPort, workerData } from "node:worker_threads";

import { resolveTopicCreation, type TopicNormalizationCatalog, type TopicSlugResolution, } from "../site/topic-normalization.js";

interface TopicNormalizationWorkerTask {
  catalog: TopicNormalizationCatalog;
  slugs: string[];
}

export type TopicCreationResolutionEntry = [string, TopicSlugResolution];

const task = workerData as TopicNormalizationWorkerTask;
const entries: TopicCreationResolutionEntry[] = task.slugs.map((slug) => [
  slug,
  resolveTopicCreation(task.catalog, slug),
]);
if (parentPort === null) {
  throw new Error("Bun topic-normalization worker has no parent message port.");
}
parentPort.postMessage(entries);
