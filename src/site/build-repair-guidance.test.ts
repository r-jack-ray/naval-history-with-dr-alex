import assert from "node:assert/strict";
import test from "node:test";

import {
  siteBuildRepairHint,
  withSiteBuildRepairHint,
} from "./build-repair-guidance.js";

test("adds a copy-and-paste skill trigger to site build errors exactly once", () => {
  const message = withSiteBuildRepairHint("Duplicate segment ID: example");

  assert.match(message, /Duplicate segment ID: example/u);
  assert.match(message, /Use \$naval-site-build-repair/u);
  assert.equal(withSiteBuildRepairHint(message), message);
  assert.ok(message.endsWith(siteBuildRepairHint));
});
