import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

interface DateLocalizationModule {
  formatViewerDate: (value: string, locales?: Intl.LocalesArgument) => string;
}

const moduleUrl = pathToFileURL(resolve("site/src/scripts/localize-dates.js")).href;
const dateLocalization = await import(moduleUrl) as DateLocalizationModule;

test("formats video dates with the viewer locale while preserving the UTC date", () => {
  const timestamp = "2026-07-08T23:30:00Z";

  assert.equal(dateLocalization.formatViewerDate(timestamp, "en-US"), "Jul 8, 2026");
  assert.equal(dateLocalization.formatViewerDate(timestamp, "en-GB"), "8 Jul 2026");
});

test("leaves the generated fallback available for an invalid datetime", () => {
  assert.equal(dateLocalization.formatViewerDate("invalid", "en-US"), "");
});
