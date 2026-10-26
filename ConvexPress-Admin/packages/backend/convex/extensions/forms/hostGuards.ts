/**
 * Checks a host application adds to a form's final submission, before the
 * submission is stored and before any action (payment, account, webhook) runs.
 * A host that keeps its own records uses this to refuse an answer that would
 * duplicate one of them, while the visitor can still fix it.
 *
 * ConvexPress ships no checks. A site replaces this module with its own
 * (CaseMedix overlays it). It runs inside the submit mutation: it may read the
 * database but must not write.
 */
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** Why a submission is refused: tied to one answer (`fieldKey`) or to the form as a whole. */
export type HostSubmitRefusal = { fieldKey?: string; error: string };

export type HostSubmitInput = {
  form: Doc<"forms">;
  /** The visible answers, keyed by field key. */
  values: Readonly<Record<string, string>>;
  /** The signed-in submitter, when there is one (ctx.auth has the full identity). */
  identity: { subject: string } | null;
};

export async function hostSubmitGuards(_ctx: MutationCtx, _input: HostSubmitInput): Promise<HostSubmitRefusal[]> {
  return [];
}
