import { recoverCanonicalDraft as decode } from "@backend/canonical-blocks-foundation/draftRecovery";
import type { CanonicalDraft } from "./document-adapter";
export function recoverCanonicalDraft(value: unknown): CanonicalDraft {
  return decode(value) as CanonicalDraft;
}
