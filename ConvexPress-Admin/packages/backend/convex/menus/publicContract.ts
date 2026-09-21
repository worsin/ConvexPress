import { v, type Validator } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { menuItemTypeValidator } from "../schema/menus";
import { MAX_DEPTH } from "./validators";

export interface PublicMenuItem {
  _id: string;
  menuId: string;
  itemType: "page" | "post" | "category" | "tag" | "custom" | "dashboard" | "heading" | "separator";
  label: string;
  title?: string;
  description?: string;
  url?: string;
  parentItemId?: string;
  position: number;
  depth: number;
  target?: "_self" | "_blank";
  cssClasses?: string;
  linkRel?: string;
  icon?: string;
  badge?: string;
  children: PublicMenuItem[];
}
export interface PublicMenuResult {
  menu: { _id: Id<"menus">; name: string; slug: string };
  items: PublicMenuItem[];
}
function itemShape(
  children: Validator<PublicMenuItem[], "required", string>,
): Validator<PublicMenuItem, "required", string> {
  return v.object({
    _id: v.string(),
    menuId: v.string(),
    itemType: menuItemTypeValidator,
    label: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    parentItemId: v.optional(v.string()),
    position: v.number(),
    depth: v.number(),
    target: v.optional(v.union(v.literal("_self"), v.literal("_blank"))),
    cssClasses: v.optional(v.string()),
    linkRel: v.optional(v.string()),
    icon: v.optional(v.string()),
    badge: v.optional(v.string()),
    children,
  });
}
// The projector emits an empty children array at the maximum depth. The finite
// transport shape cannot recurse into further menu objects beyond that level.
// An empty union has no accepted element values, so its array must be empty.
let item = itemShape(v.array(v.union()));
for (let depth = 0; depth < MAX_DEPTH; depth++) item = itemShape(v.array(item));
export const publicMenuResultValidator: Validator<PublicMenuResult | null, "required", string> =
  v.union(
    v.null(),
    v.object({
      menu: v.object({ _id: v.id("menus"), name: v.string(), slug: v.string() }),
      items: v.array(item),
    }),
  );
