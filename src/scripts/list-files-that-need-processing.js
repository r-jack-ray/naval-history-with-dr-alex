import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const transcriptDirectory = path.join(repositoryRoot, "src", "transcripts", "txt");
const segmentDirectory = path.join(repositoryRoot, "src", "derived", "video-segments");
const outputPath = path.join(repositoryRoot, "task-notes", "files-that-need-processing.txt");

const [transcriptEntries, segmentEntries] = await Promise.all([
  readdir(transcriptDirectory, { withFileTypes: true }),
  readdir(segmentDirectory, { withFileTypes: true }),
]);

const segmentFileNames = new Set(
  segmentEntries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
    .map((entry) => path.parse(entry.name).name),
);

const filesThatNeedProcessing = transcriptEntries
  .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".txt")
  .filter((entry) => !segmentFileNames.has(path.parse(entry.name).name))
  .map((entry) => path.posix.join("src", "transcripts", "txt", entry.name))
  .sort((left, right) => left.localeCompare(right));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  filesThatNeedProcessing.length > 0 ? `${filesThatNeedProcessing.join("\n")}\n` : "",
  "utf8",
);

console.log(`Wrote ${filesThatNeedProcessing.length} file(s) to task-notes/files-that-need-processing.txt.`);
