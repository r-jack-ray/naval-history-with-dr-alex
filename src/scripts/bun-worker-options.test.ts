import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBunWorkerOptions,
  partitionRoundRobin,
} from "./bun-worker-options.js";

test("Bun worker options preserve command arguments and extract the worker count", () => {
  assert.deepEqual(
    parseBunWorkerOptions(["--segments-input", "fixtures", "--workers", "1", "--quiet"]),
    {
      commandArgs: ["--segments-input", "fixtures", "--quiet"],
      workers: 1,
    },
  );
  assert.throws(
    () => parseBunWorkerOptions(["--workers", "0"]),
    /--workers must be an integer/u,
  );
  assert.throws(
    () => parseBunWorkerOptions(["--workers", "1", "--workers", "1"]),
    /only once/u,
  );
});

test("round-robin partitions preserve deterministic input order", () => {
  assert.deepEqual(
    partitionRoundRobin(["a", "b", "c", "d", "e"], 3),
    [["a", "d"], ["b", "e"], ["c"]],
  );
});
