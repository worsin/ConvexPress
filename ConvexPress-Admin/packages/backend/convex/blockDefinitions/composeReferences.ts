import { resolverReferenceValues } from "../canonicalDocuments/foundation/resolverReferences";
import type { AiResource } from "../canonicalDocuments/aiResources";

export function assertAiResolverReferences(jobs: readonly { resolver: string; args: unknown }[], resources: readonly AiResource[]) {
  const allowed = new Set<string>();
  for (const item of resources) {
    allowed.add(JSON.stringify([item.kind, "id", item.id]));
    if (item.kind === "product") allowed.add(JSON.stringify([item.kind, "slug", item.slug]));
  }
  for (const { kind, storage, value } of resolverReferenceValues(jobs)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !allowed.has(JSON.stringify([kind, storage, value])))
      throw Error("A generated resolver reference was not explicitly selected.");
  }
}
