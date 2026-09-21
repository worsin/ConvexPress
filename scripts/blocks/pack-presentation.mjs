/** Manifest declarations are compile-time vocabulary, never authored CSS. */
export function parsePackPresentation(manifest, blocks, packId) {
  const styles = manifest?.blocks?.styles ?? {};
  const hidden = manifest?.blocks?.hidden ?? [];
  const specs = new Map(blocks.map(({ spec }) => [spec.name, spec]));
  if (!styles || typeof styles !== "object" || Array.isArray(styles) || Object.keys(styles).length > blocks.length)
    throw Error("Invalid pack styles");
  for (const [name, choices] of Object.entries(styles)) {
    if (!specs.get(name)?.supports.styles || !Array.isArray(choices) || !choices.length || choices.length > 16
      || new Set(choices).size !== choices.length || choices.some(value => typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)))
      throw Error(`Invalid pack style ${packId}/${name}`);
    if (choices.some(value => value !== "default") && !Object.hasOwn(manifest.blocks.renderers ?? {}, name))
      throw Error(`Named styles require an owned renderer ${packId}/${name}`);
  }
  if (!Array.isArray(hidden) || hidden.length > blocks.length || new Set(hidden).size !== hidden.length
    || hidden.some(name => typeof name !== "string" || !specs.has(name))) throw Error("Invalid pack hidden blocks");
  return { styles, hidden };
}
