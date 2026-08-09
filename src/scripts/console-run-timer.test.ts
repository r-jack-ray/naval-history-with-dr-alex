import assert from "node:assert/strict";
import test from "node:test";

import { formatRunTime, measureRunStage } from "./console-run-timer.js";

test("formats run time consistently for report commands", () => {
  assert.equal(formatRunTime(0), "00:00:00.000");
  assert.equal(formatRunTime(61_234), "00:01:01.234");
  assert.equal(formatRunTime(3_661_007), "01:01:01.007");
});

test("times one named logical stage with stable start and completion messages", async () => {
  const times = [1_000, 2_234];
  const messages: string[] = [];
  const result = await measureRunStage(
    "rendered HTML snapshot",
    async () => 42,
    () => times.shift() ?? 0,
    (message) => messages.push(message),
  );
  assert.equal(result, 42);
  assert.deepEqual(messages, [
    "Stage Start: rendered HTML snapshot",
    "Stage Time: rendered HTML snapshot: 00:00:01.234",
  ]);
});
