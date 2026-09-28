import { createElement } from "react";
import { usePrimitivePackId } from "../primitives";
import { dependencyDescriptors } from "../block-data/portable/generated/metadata";
import type { RendererDefinition, RendererRegistry, RenderInput } from "./model";
import type { BlockPackManifest } from "./pack-registry";

type Loader = () => Promise<RendererDefinition>;
/** A cached Suspense resource. Preloads consume failures; the next read reports
 * the same error to the document boundary instead of retrying a missing chunk. */
function resource(load: Loader) {
  let state: "idle" | "pending" | "ready" | "failed" = "idle";
  let value: RendererDefinition, error: unknown, pending: Promise<void>;
  const start = () => {
    if (state === "idle") {
      state = "pending";
      pending = Promise.resolve().then(load).then(
        result => { value = result; state = "ready"; },
        reason => { error = reason; state = "failed"; },
      );
    }
    return pending;
  };
  return {
    start,
    async get() { await start(); if (state === "failed") throw error; return value; },
    read() { start(); if (state === "pending") throw pending; if (state === "failed") throw error; return value; },
  };
}

/** Validate the installed paths eagerly, but load a definition only when its
 * document needs it. Each pack keeps its own registry; Library resources are
 * shared across packs and views. No component is selected by authored code. */
export function createLazyRendererRegistry(
  libraryModules: Readonly<Record<string, Loader>>,
  manifests: readonly BlockPackManifest[],
  ownedModules: Readonly<Record<string, Loader>>,
) {
  const library: Record<string, ReturnType<typeof resource>> = Object.create(null);
  for (const [file, load] of Object.entries(libraryModules)) {
    const name = file.match(/\/([^/]+)\/([^/]+)\/render\.tsx$/u)?.slice(1).join("/");
    if (!name || !Object.hasOwn(dependencyDescriptors, name)) throw Error(`Renderer has no discovered canonical spec: ${file}`);
    if (Object.hasOwn(library, name)) throw Error(`Duplicate renderer: ${name}`);
    library[name] = resource(async () => {
      const definition = await load();
      if (definition.blockName !== name) throw Error(`Renderer does not match its discovered canonical spec: ${file}`);
      return definition;
    });
  }
  const owned: Record<string, Record<string, ReturnType<typeof resource>>> = Object.create(null);
  const used = new Set<string>();
  for (const manifest of manifests) {
    if (!/^[a-z][a-z0-9-]*$/.test(manifest.id) || Object.hasOwn(owned, manifest.id)) throw Error("Invalid or duplicate renderer pack");
    const selected: Record<string, ReturnType<typeof resource>> = Object.create(null);
    for (const [name, source] of Object.entries(manifest.blocks?.renderers ?? {})) {
      if (!Object.hasOwn(library, name) || source !== `./blocks/${name}.tsx`) throw Error("Pack renderer must match a canonical block and its owned file");
      const entries = Object.entries(ownedModules).filter(([file]) => file.endsWith(`/packs/${manifest.id}/blocks/${name}.tsx`));
      if (entries.length !== 1) throw Error(`Missing or ambiguous pack renderer ${manifest.id}/${name}`);
      const [file, load] = entries[0];
      selected[name] = resource(async () => {
        const [baseline, definition] = await Promise.all([library[name].get(), load()]);
        if (definition.blockName !== name || definition.dataResolver !== baseline.dataResolver || definition.flow !== baseline.flow)
          throw Error("Pack renderer changed its canonical identity, data contract or flow");
        return { ...baseline, View: (props: RenderInput) => <div data-pack-block={`${manifest.id}:${name}`} className={`cp-owned-block cp-owned-${manifest.id}`}>
          {createElement(definition.View, props)}
        </div> };
      });
      used.add(file);
    }
    owned[manifest.id] = selected;
  }
  for (const file of Object.keys(ownedModules)) if (!used.has(file)) throw Error(`Undeclared pack renderer ${file}`);
  const registries = new Map<string, RendererRegistry>();
  function selected(packId: string, name: string) {
    if (!Object.hasOwn(owned, packId)) throw Error("The document's template pack is not installed on this Website.");
    return owned[packId][name] ?? library[name];
  }
  function forPack(packId: string): RendererRegistry {
    if (!Object.hasOwn(owned, packId)) throw Error("The document's template pack is not installed on this Website.");
    let registry = registries.get(packId);
    if (!registry) {
      const entries = Object.fromEntries(Object.keys(library).map(name => [name, {enumerable: true, get: () => selected(packId, name).read()}]));
      registry = Object.freeze(Object.defineProperties(Object.create(null), entries)) as RendererRegistry;
      registries.set(packId, registry);
    }
    return registry;
  }
  /** Start siblings together before rendering can suspend on the first one.
   * This is an optimization only; prepareBlocks retains complete validation.
   * Unknown/custom names are skipped while their canonical child slots load. */
  function preload(packId: string, trees: readonly unknown[]) {
    forPack(packId);
    const names = new Set<string>();
    for (const tree of trees) {
      let count = 0;
      const seen = new Set<object>();
      const visit = (nodes: unknown, depth: number) => {
        if (!Array.isArray(nodes) || depth > 8) return;
        for (const node of nodes) {
          if (++count > 80) return;
          if (!node || typeof node !== "object" || seen.has(node)) continue;
          seen.add(node);
          if (typeof node.name === "string" && Object.hasOwn(library, node.name)) names.add(node.name);
          visit(node.children, depth + 1);
        }
      };
      visit(tree, 0);
    }
    for (const name of names) selected(packId, name).start();
    return [...names];
  }
  // Existing SDK/demo consumers prepare trees before entering their primitive
  // provider. Keep that interface lazy too; choose the owned view at paint time.
  const shared = new Map<string, RendererDefinition>();
  const registry = Object.freeze(Object.defineProperties(Object.create(null), Object.fromEntries(
    Object.keys(library).map(name => [name, { enumerable: true, get: () => {
      const baseline = library[name].read();
      let definition = shared.get(name);
      if (!definition) {
        definition = { ...baseline, View: (props: RenderInput) => {
          const packId = usePrimitivePackId();
          const current = packId && Object.hasOwn(owned, packId) ? selected(packId, name).read() : baseline;
          return createElement(current.View, props);
        } };
        shared.set(name, definition);
      }
      return definition;
    } }]),
  ))) as RendererRegistry;
  async function load(packId: string, names: readonly string[]) {
    forPack(packId);
    await Promise.all([...new Set(names)].map(name => {
      if (!Object.hasOwn(library, name)) throw Error(`No installed renderer: ${name}`);
      return selected(packId, name).get();
    }));
  }
  return { forPack, preload, load, registry };
}
