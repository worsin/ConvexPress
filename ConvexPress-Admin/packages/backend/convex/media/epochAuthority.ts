import { ConvexError, v } from "convex/values";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  MEDIA_INDEX_EPOCH_NAME,
  parsePendingEpoch,
  validateEpochTransition,
  type EpochTransition,
  type EpochReply,
  type EpochClaim,
} from "@convexpress/site-contract/media-index-epoch";
const kind = v.union(
  v.literal("initialize"),
  v.literal("import"),
  v.literal("bind-import"),
  v.literal("activate"),
);
const phase = v.union(v.literal("claimed"), v.literal("dispatched"), v.literal("verified"));
const fields = {
  kind,
  requestId: v.string(),
  expected: v.union(v.string(), v.null()),
  next: v.string(),
};
type Args = EpochTransition & { phase: "prepare" | "dispatch" | "verify" };
function refuse(): never {
  throw new ConvexError({
    code: "MEDIA_EPOCH_UNRESOLVED",
    message:
      "Another media epoch transition is unresolved. Reconcile its exact persisted value before retrying; do not overwrite it.",
  });
}
/** Deployment-admin-only infrastructure API. No public session or user impersonation. */
export const coordinate: RegisteredMutation<
  "internal",
  Args,
  Promise<EpochReply>
> = internalMutation({
  args: {
    ...fields,
    phase: v.union(v.literal("prepare"), v.literal("dispatch"), v.literal("verify")),
  },
  returns: v.object({
    claim: v.union(v.object({ ...fields, phase }), v.null()),
    epoch: v.union(v.string(), v.null()),
    dispatch: v.boolean(),
  }),
  handler: async (ctx, args): Promise<EpochReply> => {
    validateEpochTransition(args);
    const epoch = process.env[MEDIA_INDEX_EPOCH_NAME] || null;
    const pending = parsePendingEpoch(epoch);
    const row = await ctx.db
      .query("media_epoch_claim")
      .withIndex("by_key", (q) => q.eq("key", "active"))
      .unique();
    const projection = (value: EpochClaim): EpochClaim => ({
      kind: value.kind,
      requestId: value.requestId,
      expected: value.expected,
      next: value.next,
      phase: value.phase,
    });
    const same =
      row?.kind === args.kind &&
      row.requestId === args.requestId &&
      row.expected === args.expected &&
      row.next === args.next;
    if (args.phase === "prepare") {
      // All initializers adopt one still-claimed allocation; only dispatch grants a write.
      if (
        args.kind === "initialize" &&
        row?.kind === "initialize" &&
        row.phase !== "verified" &&
        (epoch === null || epoch === row.next)
      )
        return { claim: projection(row), epoch, dispatch: false };
      if (
        args.kind === "import" &&
        row?.kind === "import" &&
        row.requestId === args.requestId &&
        row.expected === args.expected &&
        row.phase !== "verified"
      )
        return { claim: projection(row), epoch, dispatch: false };
      if (same) {
        if (
          row!.phase === "verified"
            ? epoch !== row!.next
            : epoch !== row!.expected && epoch !== row!.next
        )
          refuse();
        return { claim: projection(row!), epoch, dispatch: false };
      }
      // replaceAll can replace this row. A known-ID pending marker is the surviving
      // authority for the privileged caller that has verified provider completion.
      if (row && row.phase !== "verified") refuse();
      if (args.kind === "initialize" && epoch !== null) {
        if (pending) refuse();
        return { claim: null, epoch, dispatch: false };
      }
      if (epoch !== args.expected) refuse();
      const value = {
        key: "active" as const,
        kind: args.kind,
        requestId: args.requestId,
        expected: args.expected,
        next: args.next,
        phase: "claimed" as const,
        updatedAt: Date.now(),
      };
      if (row) await ctx.db.replace("media_epoch_claim", row._id, value);
      else await ctx.db.insert("media_epoch_claim", value);
      return { claim: projection(value), epoch, dispatch: false };
    }
    if (!same || !row) refuse();
    if (args.phase === "dispatch") {
      if (row.phase !== "claimed") return { claim: projection(row), epoch, dispatch: false };
      if (epoch !== row.expected) refuse();
      await ctx.db.patch("media_epoch_claim", row._id, {
        phase: "dispatched",
        updatedAt: Date.now(),
      });
      return { claim: { ...projection(row), phase: "dispatched" }, epoch, dispatch: true };
    }
    if (row.phase === "claimed" || epoch !== row.next) refuse();
    if (row.kind === "activate") {
      const completed = parsePendingEpoch(row.expected);
      if (!completed?.importId) refuse();
      const receipt = await ctx.db
        .query("media_epoch_import_receipts")
        .withIndex("by_import_key", (q) => q.eq("importKey", completed.key))
        .unique();
      if (
        receipt &&
        (receipt.importId !== completed.importId ||
          receipt.pendingEpoch !== row.expected ||
          receipt.activeEpoch !== row.next)
      )
        refuse();
      if (!receipt)
        await ctx.db.insert("media_epoch_import_receipts", {
          importKey: completed.key,
          importId: completed.importId,
          pendingEpoch: row.expected!,
          activeEpoch: row.next,
          completedAt: Date.now(),
        });
    }
    await ctx.db.patch("media_epoch_claim", row._id, { phase: "verified", updatedAt: Date.now() });
    return { claim: { ...projection(row), phase: "verified" }, epoch, dispatch: false };
  },
});

type Completion = {
  importId: string;
  pendingEpoch: string;
  activeEpoch: string;
  verified: boolean;
};
export const completedImport: RegisteredQuery<
  "internal",
  { importKey: string },
  Promise<Completion | null>
> = internalQuery({
  args: { importKey: v.string() },
  returns: v.union(
    v.object({
      importId: v.string(),
      pendingEpoch: v.string(),
      activeEpoch: v.string(),
      verified: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{24}$/.test(args.importKey)) refuse();
    const row = await ctx.db
      .query("media_epoch_import_receipts")
      .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
      .unique();
    if (row)
      return {
        importId: row.importId,
        pendingEpoch: row.pendingEpoch,
        activeEpoch: row.activeEpoch,
        verified: true,
      };
    // An acknowledged env write can outlive the verification call. Reconcile only
    // this known dispatched activation; never invent completion or repeat its write.
    const claim = await ctx.db
      .query("media_epoch_claim")
      .withIndex("by_key", (q) => q.eq("key", "active"))
      .unique();
    const pending = claim?.kind === "activate" ? parsePendingEpoch(claim.expected) : null;
    if (
      claim &&
      claim.phase === "dispatched" &&
      pending?.key === args.importKey &&
      pending.importId &&
      process.env[MEDIA_INDEX_EPOCH_NAME] === claim.next
    )
      return {
        importId: pending.importId,
        pendingEpoch: claim.expected!,
        activeEpoch: claim.next,
        verified: false,
      };
    return null;
  },
});
