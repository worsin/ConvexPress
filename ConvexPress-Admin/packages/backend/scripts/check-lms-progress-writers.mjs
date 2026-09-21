/** Progress writes must maintain the unique learner-count ownership boundary. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMediaWriters } from "./media-writer-coverage.mjs";
const convex = fileURLToPath(new URL("../convex/", import.meta.url));
const trusted = {
  "lms/progress/counts.ts": ["insertCountedProgress", "patchCountedProgress", "deleteCountedProgress", "discoverProgressCounts"],
  "media/attachmentGuard.ts": ["insertWithMediaReferences", "patchWithMediaReferences", "replaceWithMediaReferences", "deleteWithMediaReferences", "insertDynamicWithMediaReferences", "patchDynamicWithMediaReferences", "deleteDynamicWithMediaReferences"],
  "media/references.ts": ["applyReferenceClear"],
  "contentPromotion/shared.ts": ["write"],
  "contentPromotion/operations.ts": ["rollback"],
};
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return ["__tests__", "_generated"].includes(entry.name) ? [] : files(path.join(directory, entry.name));
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path.join(directory, entry.name)] : [];
  });
}
const violations = [];
for (const file of files(convex)) {
  const name = path.relative(convex, file).split(path.sep).join("/");
  const result = inspectMediaWriters(fs.readFileSync(file, "utf8"), { fileName: name, ownerTables: ["lms_progress"], trustedFunctions: trusted[name] });
  violations.push(...result.violations);
}
if (violations.length) {
  for (const violation of violations) console.error(`${violation.fileName}:${violation.line}: ${violation.reason}`);
  throw Error(`LMS progress source writer coverage refused ${violations.length} writes.`);
}
console.log("LMS progress source writer coverage: no unguarded learner progress writes.");
