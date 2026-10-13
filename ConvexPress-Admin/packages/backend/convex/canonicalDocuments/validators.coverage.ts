/**
 * Compile-time coverage for the structural canonical transport validators.
 *
 * `documentReadValidator`, `migrationValidator` and `publicDocumentValidator`
 * describe block trees structurally (a node's `name` is any string, its attrs a
 * JSON record), while the DTO types narrow every block by name. The validators
 * are therefore wider than the DTOs and cannot be typed as `Validator<Dto>`;
 * the canonical service still runs the full Zod refinements.
 *
 * What has to hold is the other direction: every DTO value a handler returns
 * passes its `returns` validator. Each alias below fails to compile if a DTO
 * stops being assignable to its validator's type.
 *
 * The multi-dot file name keeps Convex from treating this as a function module;
 * `tsc -p convex` still checks it.
 */
import type { Infer } from "convex/values";
import type { CanonicalDocumentRead } from "./foundation/documentContracts";
import type { CanonicalMigrationDto } from "./foundation/migrationContracts";
import type { PublicCanonicalDocument } from "./foundation/publicDocumentContracts";
import type { documentReadValidator, migrationValidator, publicDocumentValidator } from "./validators";

/** Resolves to `Narrow` only when every `Narrow` value is a `Wide` value. */
type AcceptedBy<Wide, Narrow extends Wide> = Narrow;

export type DocumentReadCoverage = AcceptedBy<Infer<typeof documentReadValidator>, CanonicalDocumentRead>;
export type MigrationCoverage = AcceptedBy<Infer<typeof migrationValidator>, CanonicalMigrationDto>;
export type PublicDocumentCoverage = AcceptedBy<Infer<typeof publicDocumentValidator>, PublicCanonicalDocument>;
