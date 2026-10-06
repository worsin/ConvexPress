import { blockRoles } from "../../../../../../blocks/.generated/roles";

/** The caller supplies the current authorized display tree, never raw stored content. */
export function opensWithHero(blocks: readonly { name: string }[] | undefined): boolean {
  const name = blocks?.[0]?.name;
  return !!name && Object.hasOwn(blockRoles, name) && blockRoles[name] === "hero";
}
