/** External epoch markers survive replaceAll. Pending markers NEVER authorize indexing. */
export const MEDIA_INDEX_EPOCH_NAME = "MEDIA_REFERENCE_INDEX_EPOCH";
export const MEDIA_IMPORT_PREFIX = "mi_pending_";
export type EpochTransition = {
  kind: "initialize" | "import" | "bind-import" | "activate";
  requestId: string;
  expected: string | null;
  next: string;
};
export type EpochClaim = EpochTransition & { phase: "claimed" | "dispatched" | "verified" };
export type EpochReply = { claim: EpochClaim | null; epoch: string | null; dispatch: boolean };
export function parsePendingEpoch(
  epoch: string | null,
): { key: string; nonce: string; importId: string | null } | null {
  if (!epoch?.startsWith(MEDIA_IMPORT_PREFIX)) return null;
  const match = /^mi_pending_([a-f0-9]{24})_([a-f0-9]{32})(?:_([a-zA-Z0-9]{1,48}))?$/.exec(epoch);
  if (!match?.[1] || !match[2]) throw Error("Invalid pending media import epoch.");
  return { key: match[1], nonce: match[2], importId: match[3] ?? null };
}
export function validateEpochTransition(value: EpochTransition): void {
  if (
    !/^[a-zA-Z0-9:_-]{1,180}$/.test(value.requestId) ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(value.next) ||
    !(value.expected === null || /^[a-zA-Z0-9_-]{16,128}$/.test(value.expected))
  )
    throw Error("Invalid media epoch transition.");
  const previous = parsePendingEpoch(value.expected),
    next = parsePendingEpoch(value.next);
  if (value.kind === "initialize" && (value.expected !== null || next))
    throw Error("Initialization cannot rotate an existing epoch.");
  if (value.kind === "import" && (previous || !next || next.importId))
    throw Error("An import must start with a fresh pending epoch.");
  if (
    value.kind === "bind-import" &&
    (!previous ||
      previous.importId ||
      !next?.importId ||
      previous.key !== next.key ||
      previous.nonce !== next.nonce)
  )
    throw Error("Import identity does not match its pending epoch.");
  if (
    value.kind === "activate" &&
    (!previous?.importId || value.next !== `mi_ready_${previous.nonce}`)
  )
    throw Error("Only a known completed import can activate its exact epoch.");
}
export function parseEpochReply(value: unknown): EpochReply {
  if (!value || typeof value !== "object") throw Error("Invalid media epoch reply.");
  const raw = value as Record<string, unknown>;
  if (
    !(
      raw.epoch === null ||
      (typeof raw.epoch === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(raw.epoch))
    ) ||
    typeof raw.dispatch !== "boolean"
  )
    throw Error("Invalid media epoch reply.");
  let claim: EpochClaim | null = null;
  if (raw.claim !== null) {
    if (!raw.claim || typeof raw.claim !== "object") throw Error("Invalid media epoch claim.");
    const row = raw.claim as Record<string, unknown>;
    if (
      !["initialize", "import", "bind-import", "activate"].includes(String(row.kind)) ||
      !["claimed", "dispatched", "verified"].includes(String(row.phase)) ||
      typeof row.requestId !== "string" ||
      typeof row.next !== "string" ||
      !(row.expected === null || typeof row.expected === "string")
    )
      throw Error("Invalid media epoch claim.");
    claim = {
      kind: row.kind as EpochClaim["kind"],
      phase: row.phase as EpochClaim["phase"],
      requestId: row.requestId,
      expected: row.expected,
      next: row.next,
    };
    validateEpochTransition(claim);
  }
  return { claim, epoch: raw.epoch as string | null, dispatch: raw.dispatch };
}
/** One caller receives dispatch permission. Lost dispatch responses never authorize a second write. */
export async function transitionMediaEpoch(
  io: {
    coordinate(
      phase: "prepare" | "dispatch" | "verify",
      transition: EpochTransition,
    ): Promise<EpochReply>;
    write(epoch: string): Promise<void>;
  },
  proposed: EpochTransition,
): Promise<string> {
  validateEpochTransition(proposed);
  const prepared = parseEpochReply(await io.coordinate("prepare", proposed));
  if (!prepared.claim) {
    if (!prepared.epoch || parsePendingEpoch(prepared.epoch))
      throw Error("Media indexing is paused while an import is unresolved.");
    return prepared.epoch;
  }
  const claim = prepared.claim;
  if (
    claim.kind !== proposed.kind ||
    claim.requestId !== proposed.requestId ||
    claim.expected !== proposed.expected
  )
    throw Error("Media epoch authority returned a different operation.");
  if (claim.phase === "verified") {
    if (prepared.epoch !== claim.next) throw Error("Media epoch readiness changed.");
    return claim.next;
  }
  const dispatch = parseEpochReply(await io.coordinate("dispatch", claim));
  if (dispatch.dispatch) {
    try {
      await io.write(claim.next);
    } catch {
      /* Only site-side exact readback can resolve a lost acknowledgement. */
    }
  }
  const verified = parseEpochReply(await io.coordinate("verify", claim));
  if (verified.claim?.phase !== "verified" || verified.epoch !== claim.next)
    throw Error("Media epoch write is unresolved; no retry write was dispatched.");
  return claim.next;
}
