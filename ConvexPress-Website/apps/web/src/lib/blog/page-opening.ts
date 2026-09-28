import { blockRoles } from "../../../../../../blocks/.generated/roles";
import type { PageDetail } from "./types";

/** The caller supplies the current authorized display tree, never raw stored content. */
export function opensWithHero(blocks: readonly { name: string }[] | undefined): boolean {
  const name = blocks?.[0]?.name;
  return !!name && Object.hasOwn(blockRoles, name) && blockRoles[name] === "hero";
}

/** Historical alias retained until the legacy page migration is complete. */
export function legacyPageOpensWithHero(page: PageDetail): boolean {
  if (page.blocksVersion === 2 || page.contentMode !== "blocks") return false;
  return opensWithHero(page.blocks) || page.blocks?.[0]?.name === "blocks/page-banner";
}
