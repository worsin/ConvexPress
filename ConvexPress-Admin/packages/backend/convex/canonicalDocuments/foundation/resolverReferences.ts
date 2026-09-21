import { dependencyDescriptors } from "./generated/metadata";

type ReferencePath = { path: string[]; kind: string; storage: string };
function valuesAt(value: unknown, path: readonly string[]): unknown[] {
  if (!path.length) return [value];
  const [part, ...rest] = path;
  if (part === "*") return Array.isArray(value) ? value.flatMap(item => valuesAt(item, rest)) : [];
  return value && typeof value === "object" ? valuesAt((value as Record<string, unknown>)[part], rest) : [];
}

/** Derive resolver reference paths from installed contracts, not model-authored
 * field types. Labeling a product selector as text must not bypass selection. */
function referencePaths(resolver: string): ReferencePath[] {
  const result: ReferencePath[] = [];
  for (const descriptor of Object.values(dependencyDescriptors)) {
    if (descriptor.data?.resolver !== resolver) continue;
    function walk(value: unknown, path: string[]) {
      if (typeof value === "string" && /^attrs\.[A-Za-z0-9_.]+$/.test(value)) {
        const bound = value.slice(6).split(".");
        for (const field of descriptor.fields) {
          const target = [...field.path, ...field.valuePath];
          if (!bound.every((part, i) => target[i] === part)) continue;
          const kind = field.type === "reference" && "of" in field ? field.of : field.type;
          result.push({ path: [...path, ...target.slice(bound.length)], kind, storage: "storage" in field ? field.storage ?? "id" : "id" });
        }
      } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, String(index)]));
      else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
    }
    walk(descriptor.data.args, []);
  }
  return result;
}

export function resolverReferenceValues(jobs: readonly { resolver: string; args: unknown }[]) {
  return jobs.flatMap(job => referencePaths(job.resolver).flatMap(field => valuesAt(job.args, field.path).map(value => ({ kind: field.kind, storage: field.storage, value }))));
}
