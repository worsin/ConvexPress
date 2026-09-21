/** A taxonomy coordinate is useful only if every source writer maintains it. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMediaWriters } from "./media-writer-coverage.mjs";
const convex = fileURLToPath(new URL("../convex/", import.meta.url));
const trusted = {
  "helpers/postDiscovery.ts": ["insertTermRelationship", "refreshTermDiscovery", "syncPostDiscovery"],
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
  const result = inspectMediaWriters(fs.readFileSync(file, "utf8"), { fileName: name, ownerTables: ["posts", "termRelationships"], trustedFunctions: trusted[name] });
  // Deletion removes relationship index entries automatically. Post deletions
  // remain governed by the stricter existing media/source writer coverage gate.
  violations.push(...result.violations.filter(write => write.operation !== "delete"));
}
if (violations.length) {
  for (const violation of violations) console.error(`${violation.fileName}:${violation.line}: ${violation.reason}`);
  throw Error(`Post discovery writer coverage refused ${violations.length} writes.`);
}
console.log("Post discovery writer coverage: no unguarded post or taxonomy coordinate writes.");
