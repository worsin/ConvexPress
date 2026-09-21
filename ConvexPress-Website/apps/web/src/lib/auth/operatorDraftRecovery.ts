import type { DraftHistory, DraftSnapshot } from "../../templates/sdk/draftModel";

export type CustomizerRecovery = {
  packId: string;
  base: DraftSnapshot;
  revision: string;
  history: DraftHistory;
  draftRevision: string | null | undefined;
};

export type OperatorDraftAccess = {
  read(owner: string): CustomizerRecovery | null;
  write(owner: string, draft: CustomizerRecovery | null): void;
};

/** One tab, one draft. A recovery copy is data, never authentication. The
 * caller supplies the owner returned by the authenticated profile query.
 * Pausing retains data but invalidates every old callback's access. */
export function createOperatorDraftRecovery() {
  let active: object | null = null;
  let generation = 0;
  let entry: { owner: string; draft: CustomizerRecovery } | null = null;
  return {
    activate(session: object | null) {
      if (active !== session) { active = session; generation++; }
    },
    clear() { entry = null; },
    hasDraft() { return entry !== null; },
    isActive(session: object) { return active === session; },
    access(session: object): OperatorDraftAccess {
      const captured = generation;
      const current = () => active === session && generation === captured;
      const select = (owner: string) => {
        if (entry && entry.owner !== owner) entry = null;
      };
      return {
        read(owner) {
          if (!current()) return null;
          select(owner);
          return entry ? structuredClone(entry.draft) : null;
        },
        write(owner, draft) {
          if (!current()) return;
          select(owner);
          entry = draft ? { owner, draft: structuredClone(draft) } : null;
        },
      };
    },
  };
}
