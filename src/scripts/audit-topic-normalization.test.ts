import assert from "node:assert/strict";
import test from "node:test";

import { runAuditTopicNormalization } from "./audit-topic-normalization.js";

test("prints read-only audit help", async () => {
  let output = "";
  const code = await runAuditTopicNormalization(["--help"], {
    stdout: (text) => { output += text; },
  });

  assert.equal(code, 0);
  assert.match(output, /npm run audit:topic-normalization/u);
  assert.match(output, /--patterns-input/u);
  assert.doesNotMatch(output, /apply|plan-output/iu);
});

test("rejects unsupported mutation arguments", async () => {
  await assert.rejects(
    runAuditTopicNormalization(["--apply"]),
    /Unknown argument: --apply/u,
  );
});
