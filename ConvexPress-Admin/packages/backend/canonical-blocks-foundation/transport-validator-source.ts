// Build-time only. Generate Convex transport validators outside the deployment isolate.
/** Finite Convex transport shapes derived from the authoritative pure schemas.
 * Zod/full-tree validation remains mandatory for refinements and bounded bytes. */
import { v, type Validator } from "convex/values";
import { z } from "zod";
import {
	canonicalDocumentSchema,
	canonicalInitializationSchema,
	canonicalWriteReceiptSchema,
	canonicalRevisionPageSchema,
	canonicalPageOptionsSchema,
	type CanonicalDocumentRead,
 type CanonicalDocumentDto,
	type CanonicalWriteReceipt,
	type CanonicalRevisionPage,
	type CanonicalPageOptions,
} from "./documentContracts";
import { canonicalNodeSchema } from "./generated/instances";
import { syncedDisplaySchema } from "./syncedDisplay";
import { composedRegistrySnapshotSchema, type ComposedRegistrySnapshot } from "./composedRegistry";
type Shape = {
	type?: string;
	const?: string | number | boolean;
	enum?: Array<string | number>;
	anyOf?: Shape[];
	items?: Shape;
	properties?: Record<string, Shape>;
	required?: string[];
	additionalProperties?: boolean | Shape;
};
function fromShape(shape: Shape): Validator<any, "required", string> {
	if (shape.const !== undefined) return v.literal(shape.const);
	if (shape.enum)
		return v.union(...shape.enum.map((value) => v.literal(value)));
	if (shape.anyOf) return v.union(...shape.anyOf.map(fromShape));
	switch (shape.type) {
		case "string":
			return v.string();
		case "integer":
		case "number":
			return v.number();
		case "boolean":
			return v.boolean();
		case "null":
			return v.null();
		case "array":
			return v.array(fromShape(shape.items!));
		case "object": {
			if (!shape.properties && typeof shape.additionalProperties === "object")
				return v.record(v.string(), fromShape(shape.additionalProperties));
			if (shape.additionalProperties !== false)
				throw Error("Canonical transport objects must be closed");
			return v.object(
				Object.fromEntries(
					Object.entries(shape.properties ?? {}).map(([key, value]) => [
						key,
						shape.required?.includes(key)
							? fromShape(value)
							: v.optional(fromShape(value)),
					]),
				),
			);
		}
		case undefined:
			return v.any();
		default:
			throw Error("Unsupported canonical transport schema");
	}
}
function fromZod<T>(schema: z.ZodType): Validator<T, "required", string> {
	return fromShape(
		z.toJSONSchema(schema, { unrepresentable: "any" }) as Shape,
	) as Validator<T, "required", string>;
}
export const composedRegistrySnapshotValidator: Validator<ComposedRegistrySnapshot, "required", string> = fromZod(composedRegistrySnapshotSchema);
const structuralSyncedDisplay = syncedDisplaySchema.extend({ revisions: z.array(syncedDisplaySchema.shape.revisions.element.extend({ blocks: z.array(canonicalNodeSchema) })) });
const structuralDocument: z.ZodType = canonicalDocumentSchema.extend({
  displayBlocks: z.array(canonicalNodeSchema).optional(),
	synced: structuralSyncedDisplay.optional(),
	document: canonicalDocumentSchema.shape.document.extend({
		blocks: z.array(canonicalNodeSchema),
	}),
});
export const documentReadValidator: Validator<
	CanonicalDocumentRead,
	"required",
	string
> = v.union(
	v.null(),
	fromZod(canonicalInitializationSchema),
	fromZod(structuralDocument),
);
export const receiptValidator: Validator<
	CanonicalWriteReceipt,
	"required",
	string
> = fromZod(canonicalWriteReceiptSchema);
export const revisionPageValidator: Validator<
	CanonicalRevisionPage,
	"required",
	string
> = fromZod(canonicalRevisionPageSchema);
export const pageOptionsValidator: Validator<
	CanonicalPageOptions,
	"required",
	string
> = fromZod(canonicalPageOptionsSchema);

import { inactiveLegacySettingsSchema, retainedLegacyAutosaveSchema, revisionImportSourceSchema, revisionSourceSchema, type RevisionSourceDto, type CanonicalMigrationDto } from "./migrationContracts";
export const revisionSourceValidator: Validator<RevisionSourceDto, "required", string> = fromZod(revisionSourceSchema);
export const migrationValidator: Validator<CanonicalMigrationDto, "required", string> = v.object({
  contract: v.literal("canonical-migration-v1"),
  source: v.object({ postId: v.string(), revision: v.number(), authoringDigest: v.string() }),
  candidate: fromZod<CanonicalDocumentDto>(structuralDocument),
  archive: v.optional(fromZod(revisionImportSourceSchema)),
  preservesTrash: v.optional(v.literal(true)),
  retainedAutosave: v.optional(fromZod(retainedLegacyAutosaveSchema)),
  inactiveSettings: v.optional(v.array(fromZod(inactiveLegacySettingsSchema))),
  importedContent: v.optional(v.union(v.literal("plain-text"),v.literal("html"))),
});

import { publicReadySchema, publicRestrictedSchema, type PublicCanonicalDocument } from "./publicDocumentContracts";
const publicReadyStructural: z.ZodType = publicReadySchema.extend({
  synced: structuralSyncedDisplay.optional(),
  document: canonicalDocumentSchema.shape.document.omit({ status: true, scheduledAt: true }).extend({ blocks: z.array(canonicalNodeSchema) }),
});
export const publicDocumentValidator: Validator<PublicCanonicalDocument, "required", string> = v.union(v.null(), fromZod(publicRestrictedSchema), fromZod(publicReadyStructural));


import {canonicalMenuOptionsSchema, type CanonicalMenuOptions} from './documentContracts';
export const menuOptionsValidator: Validator<CanonicalMenuOptions,'required',string> = fromZod(canonicalMenuOptionsSchema);
import {canonicalTermOptionsSchema,type CanonicalTermOptions} from './documentContracts';
export const termOptionsValidator:Validator<CanonicalTermOptions,'required',string> = fromZod(canonicalTermOptionsSchema);

import { canonicalAuthorOptionsSchema, type CanonicalAuthorOptions } from './documentContracts';
export const authorOptionsValidator:Validator<CanonicalAuthorOptions,'required',string> = fromZod(canonicalAuthorOptionsSchema);
import {canonicalEventCategoryOptionsSchema,type CanonicalEventCategoryOptions} from './documentContracts';
export const eventCategoryOptionsValidator:Validator<CanonicalEventCategoryOptions,'required',string>=fromZod(canonicalEventCategoryOptionsSchema);

import { canonicalFormOptionsSchema, type CanonicalFormOptions } from "./documentContracts";
export const formOptionsValidator: Validator<CanonicalFormOptions, "required", string> = fromZod(canonicalFormOptionsSchema);

import { canonicalProductOptionsSchema, type CanonicalProductOptions } from "./documentContracts";
export const productOptionsValidator: Validator<CanonicalProductOptions, "required", string> = fromZod(canonicalProductOptionsSchema);

import { canonicalProductTermOptionsSchema, type CanonicalProductTermOptions } from "./documentContracts";
export const productTermOptionsValidator: Validator<CanonicalProductTermOptions, "required", string> = fromZod(canonicalProductTermOptionsSchema);

import {canonicalAlbumOptionsSchema,canonicalRecipeOptionsSchema,type CanonicalAlbumOptions,type CanonicalRecipeOptions} from "./documentContracts";
export const recipeOptionsValidator:Validator<CanonicalRecipeOptions,"required",string>=fromZod(canonicalRecipeOptionsSchema);
export const albumOptionsValidator:Validator<CanonicalAlbumOptions,"required",string>=fromZod(canonicalAlbumOptionsSchema);

import {canonicalMembershipPlanOptionsSchema,type CanonicalMembershipPlanOptions} from "./documentContracts";
export const membershipPlanOptionsValidator:Validator<CanonicalMembershipPlanOptions,"required",string>=fromZod(canonicalMembershipPlanOptionsSchema);

import {canonicalCourseOptionsSchema,type CanonicalCourseOptions} from "./documentContracts";
export const courseOptionsValidator:Validator<CanonicalCourseOptions,"required",string>=fromZod(canonicalCourseOptionsSchema);

import {canonicalKbCategoryOptionsSchema,type CanonicalKbCategoryOptions} from "./documentContracts";
export const kbCategoryOptionsValidator:Validator<CanonicalKbCategoryOptions,"required",string>=fromZod(canonicalKbCategoryOptionsSchema);

import {canonicalEventOptionsSchema,type CanonicalEventOptions} from "./documentContracts";
export const eventOptionsValidator:Validator<CanonicalEventOptions,"required",string>=fromZod(canonicalEventOptionsSchema);

import {canonicalMailingListOptionsSchema,type CanonicalMailingListOptions} from "./documentContracts";
export const mailingListOptionsValidator:Validator<CanonicalMailingListOptions,"required",string>=fromZod(canonicalMailingListOptionsSchema);
