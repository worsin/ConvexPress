import { createContext, useContext, useState, type ReactNode } from "react";

/** A visitor's unsent input, held above a public document so it survives the
 * document being re-installed when its authorization lease renews. Memory only:
 * the owning document/session generation remounts these scopes when it changes.
 * Kept apart from the live poll and RSVP hosts, which load only on pages that
 * hold those blocks. */

const PollDrafts = createContext<Map<string, string> | null>(null);
/** Retain only the visitor's unsent option key while authorized content is
 * cleared for renewal. No labels, results, identity or CAPTCHA proof is cached. */
export function PollDraftScope({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, string>());
  return <PollDrafts value={drafts}>{children}</PollDrafts>;
}
export const usePollDrafts = () => useContext(PollDrafts);

export type RsvpContact = { name: string; email: string };
export type RsvpPending = { fingerprint: string; requestKey: string; operation: "register" | "cancel"; expectedRevision: number; definitionVersion: string };
export type RsvpDraft = { contact: RsvpContact; pending?: RsvpPending };
const RsvpDrafts = createContext<Map<string, RsvpDraft> | null>(null);
/** Contact drafts are discarded on document/session generation changes. The
 * map survives short authorization-lease renewals. */
export function RsvpDraftScope({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, RsvpDraft>());
  return <RsvpDrafts value={drafts}>{children}</RsvpDrafts>;
}
export const useRsvpDrafts = () => useContext(RsvpDrafts);
