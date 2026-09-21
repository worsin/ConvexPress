import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../_generated/server";

/** Transactional collision check also covers concurrent issuances and imports. */
export async function newCertificateSerial(ctx: Pick<MutationCtx, "db">): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Convex supplies a transaction-seeded strong PRNG, including on retries.
    const entropy = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0"),
    ).join("").toUpperCase();
    const serial = "CERT-" + entropy;
    const existing = await ctx.db.query("lms_certificate_issues")
      .withIndex("by_serial", q => q.eq("serial", serial)).first();
    if (!existing) return serial;
  }
  throw new ConvexError({ code: "SERIAL_CONFLICT", message: "Could not allocate a certificate serial. Please retry." });
}
