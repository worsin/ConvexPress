import { z } from "zod";
import { sha256Hex } from "@convexpress/site-contract";
import type { QueryCtx } from "../_generated/server";
import { getCurrentUser, resolveUserRole } from "../helpers/permissions";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { currentReferenceGeneration } from "../media/reverseIndex";
import { readCatalogRevision } from "./catalogRevision";
import { CanonicalDataError, stableKey, type DataScope } from "../canonicalDocuments/foundation/contracts";

const DOMAIN = "convexpress:catalog-continuation:v1:";
const encoder = new TextEncoder();
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export interface CatalogContinuation {
  version:1; binding:string; startedAt:number; expiresAt:number;
  phase:"discovering"|"counting"; key:Array<string|number>|null; categories:string[]; counts:number[];
}
const catalogContinuationSchema:z.ZodType<CatalogContinuation> = z.strictObject({
  version: z.literal(1), binding: z.string().regex(/^[a-f0-9]{64}$/u),
  startedAt: integer, expiresAt: integer,
  phase: z.enum(["discovering", "counting"]),
  key: z.array(z.union([z.string().max(256), z.number().finite()])).min(2).max(3).nullable(),
  categories: z.array(z.string().min(1).max(256)).max(24),
  counts: z.array(integer).max(24),
}).refine(value => value.categories.length === value.counts.length && new Set(value.categories).size === value.categories.length);
export type CatalogContext = { scope: DataScope; documentId: string };

async function signingKey() {
  // Existing per-installation auth material supplies entropy. The domain-specific
  // HMAC derivation cannot mint auth JWTs and rotates when the auth key rotates.
  const secret = process.env.AUTH_PRIVATE_KEY?.trim();
  if (!secret || secret.length < 64) throw new CanonicalDataError("CATALOG_CURSOR_UNCONFIGURED", "cursor", "Catalog continuation requires installation signing configuration");
  const root = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(DOMAIN));
  return crypto.subtle.importKey("raw", derived, {name:"HMAC",hash:"SHA-256"}, false, ["sign","verify"]);
}
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), byte=>byte.toString(16).padStart(2,"0")).join("");
export async function sealCatalogContinuation(value: CatalogContinuation): Promise<string> {
  const body = JSON.stringify(catalogContinuationSchema.parse(value));
  const signature = hex(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(DOMAIN + body)));
  const token = signature + "." + body;
  if (token.length > 4096) throw new CanonicalDataError("CATALOG_CURSOR_BUDGET", "cursor", "Catalog continuation exceeds its transport budget");
  return token;
}
export async function openCatalogContinuation(token: string): Promise<CatalogContinuation> {
  const invalid = () => new CanonicalDataError("CATALOG_CURSOR_INVALID", "cursor", "Invalid catalog continuation");
  if (token.length > 4096 || !/^[a-f0-9]{64}\./u.test(token)) throw invalid();
  const signature = new Uint8Array(token.slice(0,64).match(/../gu)!.map(part=>parseInt(part,16)));
  const body = token.slice(65);
  if (!(await crypto.subtle.verify("HMAC", await signingKey(), signature, encoder.encode(DOMAIN+body)))) throw invalid();
  try { return catalogContinuationSchema.parse(JSON.parse(body)); } catch { throw invalid(); }
}

/** Resolve fresh authority even for a continuation whose previous chunk had no
 * membership rules. The binding is a digest; it never discloses user/session data. */
export async function catalogSnapshotBinding(ctx: QueryCtx, context: CatalogContext, selection: unknown, budget: RequestReadLedger): Promise<string> {
  const generation = currentReferenceGeneration();
  if (!generation) throw new CanonicalDataError("CATALOG_EPOCH_UNCONFIGURED", "cursor", "Catalog continuation requires a restore epoch");
  budget.beforeRead();
  const installation = budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q=>q.eq("identityKey","site-identity")).unique());
  if (!installation || installation.websiteKey!==context.scope.websiteKey || installation.instanceKey!==context.scope.instanceKey)
    throw new CanonicalDataError("SCOPE_MISMATCH", "cursor", "Catalog continuation belongs to another installation");
  const identity = await ctx.auth.getUserIdentity();
  const user = await getCurrentUser(ctx, budget);
  const role = user?.status === "active" ? await resolveUserRole(ctx,user,budget) : null;
  const source = await readCatalogRevision(ctx,"source",budget);
  const policy = await readCatalogRevision(ctx,"policy",budget);
  return sha256Hex(stableKey({version:1, context, selection, installationId:installation._id,
    epoch:generation.epoch, source, policy, identity:identity ?? null,
    user:user ? {id:user._id,status:user.status,authSource:user.authSource} : null, role:role ?? null}));
}
