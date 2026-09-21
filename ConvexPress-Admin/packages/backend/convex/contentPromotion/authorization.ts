import type {
	PromotionKind,
	PromotionRecord,
} from "@convexpress/site-contract/content-promotion";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import type { Capability } from "../types/capabilities";
import type { QueryCtx } from "../_generated/server";
import { fail, type Row } from "./shared";

/** Promotion adds no alternative path around the normal authoring capabilities. */
export async function promotionAuthorization(ctx: QueryCtx) {
	const context = ctx;
	const operator = await requireCan(context, "manage_options");
	const role = await resolveUserRole(context, operator);
	const checked = new Set<Capability>();
	const can = async (capability: Capability) => {
		if (!checked.has(capability)) {
			await requireCan(context, capability);
			checked.add(capability);
		}
	};
	return {
		operator,
		async read(kind: PromotionKind, row?: Row) {
      if (kind === "kbCategory") await can("kb.manageCategories");
			if (kind === "page" || kind === "post") {
				await can(`${kind}.read`);
				if (
					kind === "page" &&
					(row?.status === "private" || row?.visibility === "private")
				)
					await can("page.read_private");
				if (
					kind === "post" &&
					row &&
					row.status !== "publish" &&
					(row.status === "private" || row.authorId !== operator._id) &&
					(role?.level ?? 0) < 80
				)
					fail(
						"FORBIDDEN",
						"Exporting another author’s unpublished content requires Editor access.",
					);
			}
			if (kind.startsWith("course")) await can("lms.course.edit");
      if (kind === "course" && row && row.authorId !== operator._id && (role?.level ?? 0) < 80) fail("FORBIDDEN", "Exporting another author’s course requires Editor access.");
      if (kind === "media") await can("media.read");
			if (kind === "menu" || kind === "menuItem" || kind === "menuLocation")
				await can("menu.update");
		},
		async write(record: PromotionRecord, current: Row | null) {
			const kind = record.kind;
      if (kind === "kbCategory") await can("kb.manageCategories");
      if (kind === "course") { await can(current ? "lms.course.edit" : "lms.course.create"); if (record.data.status === "published") await can("lms.course.publish"); if (current && current.authorId !== operator._id && (role?.level ?? 0) < 80) fail("FORBIDDEN", "Editing another author’s course requires Editor access."); }
      if (kind === "courseNode" || kind === "coursePrerequisite") { await can("lms.builder.manage"); if (kind === "courseNode" && record.data.kind === "lesson") await can("lms.lesson.edit"); }
			if (kind === "page" || kind === "post") {
				await can(`${kind}.${current ? "update" : "create"}`);
				if (record.data.status === "publish" || record.data.blocksVersion === 2 && (record.data.status !== "draft" || current && current.status !== "draft")) await can(`${kind}.publish`);
				if (
					kind === "post" &&
					current &&
					current.authorId !== operator._id &&
					(role?.level ?? 0) < 80
				)
					fail(
						"FORBIDDEN",
						"Editing another author’s target post requires Editor access.",
					);
				if (kind === "page" && record.data.parentId !== current?.parentId)
					await can("page.set_parent");
			}
			if (kind === "media")
				await can(current ? "media.update" : "media.upload");
			if (kind === "menu") await can(current ? "menu.update" : "menu.create");
			if (kind === "menuItem")
				await can(current ? "menu.update_item" : "menu.add_item");
			if (kind === "menuLocation") await can("menu.assign_location");
			if (kind === "term")
				await can(
					`taxonomy.${current ? "update" : "create"}_${record.data.taxonomy === "category" ? "category" : "tag"}`,
				);
			if (kind === "termRelationship") await can("taxonomy.assign");
		},
	};
}
