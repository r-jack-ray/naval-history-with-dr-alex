import assert from "node:assert/strict";
import test from "node:test";

import { formatRunTime } from "./console-run-timer.js";

test("formats run time consistently for report commands", () => {
  assert.equal(formatRunTime(0), "00:00:00.000");
  assert.equal(formatRunTime(61_234), "00:01:01.234");
  assert.equal(formatRunTime(3_661_007), "01:01:01.007");
});
