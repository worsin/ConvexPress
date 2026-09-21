import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { PollProvider, PollView, type PollSnapshot } from "./poll";
import { ensurePollVisitorAcrossTabs, pollStorageKey, readPollVisitor, subscribePoll, PollInteractionError, pollResponseError } from "./poll-client";
import { parsePollDefinition } from "../block-data/portable/pollContracts";
import { FormSecurityControls } from "../../../extensions/forms/SecurityControls";
import { retryPollWrite } from "../block-data/portable/pollRetry";

const PollDrafts = createContext<Map<string, string> | null>(null);
/** Retain only the visitor's unsent option key while authorized content is
 * cleared for renewal. No labels, results, identity or CAPTCHA proof is cached.
 * The owning document/session generation remounts this scope when it changes. */
export function PollDraftScope({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, string>());
  return <PollDrafts value={drafts}>{children}</PollDrafts>;
}

/** Installed only inside an authorized public document. The owning generation
 * changes on account/session/client/environment/password changes. Native preview
 * and SSR keep the inert renderer; callbacks never come from authored content. */
export function ProductionPollProvider({ installationKey, generation, signedIn, password, children }: {
  installationKey: string; generation: string; signedIn: boolean; password?: string; children: ReactNode;
}) {
  const client = useConvex(), [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const value = useMemo(() => ({ render: ready ? (poll: PollSnapshot) => <LivePoll key={JSON.stringify([client.url, installationKey, generation, signedIn, password, poll.postId, poll.blockId, poll.definitionVersion])} initial={poll} installationKey={installationKey} signedIn={signedIn} password={password} /> : null }), [client, installationKey, generation, signedIn, password, ready]);
  return <PollProvider value={value}>{children}</PollProvider>;
}
function LivePoll({ initial, installationKey, signedIn, password }: { initial: PollSnapshot; installationKey: string; signedIn: boolean; password?: string }) {
  const drafts = useContext(PollDrafts);
  const client = useConvex(), [refresh, setRefresh] = useState(0);
  const [poll, setPoll] = useState<PollSnapshot | null | undefined>(undefined), [visitor, setVisitor] = useState<string | undefined>();
  const [acknowledged, setAcknowledged] = useState<string | undefined>();
  const [captchaToken, setCaptchaToken] = useState(""), [captchaError, setCaptchaError] = useState<string | null>(null), [honeypot, setHoneypot] = useState(""), [verificationAttempt, setVerificationAttempt] = useState(0);
  const alive = useRef(true), current = useRef<PollSnapshot | null>(null);
  const storageKey = pollStorageKey(`${client.url}:${installationKey}`, initial);
  const [selection, setSelection] = useState(() => drafts?.get(storageKey) ?? "");
  useEffect(() => { alive.current = true; return () => { alive.current = false; current.current = null; }; }, []);
  useEffect(() => {
    if (signedIn) return;
    try { setVisitor(readPollVisitor(window.localStorage, storageKey)); } catch { /* No storage access before an explicit vote is required. */ }
    const changed = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) { try { setVisitor(readPollVisitor(window.localStorage, storageKey)); } catch { setVisitor(undefined); } } };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [storageKey, signedIn]);
  useEffect(() => {
    setPoll(undefined); current.current = null;
    const watch = client.watchQuery(api.extensions.forms.polls.get, { postId: initial.postId as Id<"posts">, blockId: initial.blockId, password, visitorToken: visitor, refreshKey: crypto.randomUUID() });
    return subscribePoll(watch, initial, value => { current.current = value; setPoll(value); }, () => setRefresh(value => value + 1));
  }, [client, initial.postId, initial.blockId, initial.definitionVersion, password, visitor, refresh]);
  const securityKey = JSON.stringify(poll?.security);
  const publicSecurity = useMemo(() => poll?.security, [securityKey]);
  if (poll === undefined) return <p role="status">Preparing poll…</p>;
  if (poll === null) return <p role="status">This poll is not currently available.</p>;
  const attrs = parsePollDefinition({ question: poll.question, options: poll.options.map(({ key, label }) => ({ key, label })), showResults: poll.total !== null, responsePolicy: poll.responsePolicy });
  return <PollView key={poll.definitionVersion} attrs={attrs} poll={poll} acknowledged={acknowledged}
    selection={{ value: selection, onChange: value => {
      setSelection(value);
      if (drafts) {
        // Bound retention even if a visitor explores many ballot revisions.
        if (!drafts.has(storageKey) && drafts.size >= 128) drafts.delete(drafts.keys().next().value!);
        drafts.set(storageKey, value);
      }
    } }}
    securityControls={poll.canVote ? <FormSecurityControls key={verificationAttempt} formId={`poll-${poll.postId}-${poll.blockId}`} security={publicSecurity} honeypotValue={honeypot} onHoneypotChange={setHoneypot} onCaptchaTokenChange={setCaptchaToken} onCaptchaErrorChange={setCaptchaError} /> : null}
    onVote={async optionKey => {
    const source = current.current;
    if (!alive.current || !source?.canVote || source.definitionVersion !== initial.definitionVersion) throw new Error("Poll authority changed");
    if (source.security.captchaEnabled && !captchaToken.trim()) throw new PollInteractionError(captchaError ?? "Complete the verification challenge before sending your response.");
    // Signed-in policy has no need for a browser identity. The server always
    // prefers verified account identity when one exists under visitor policy.
    let token: string | undefined;
    if (!signedIn && source.responsePolicy === "visitor") {
      try { token = await ensurePollVisitorAcrossTabs(window.localStorage, storageKey, crypto, { locks: window.navigator.locks, indexedDB: window.indexedDB }); }
      catch { throw new PollInteractionError("Allow browser storage to save your response and prevent duplicate submissions."); }
    }
    if (!alive.current || current.current?.definitionVersion !== source.definitionVersion) throw new Error("Poll authority changed while preparing the response");
    const args = { postId: source.postId as Id<"posts">, blockId: source.blockId, definitionVersion: source.definitionVersion, optionKey, password, visitorToken: token, honeypot };
    let result;
    try {
      result = source.security.captchaEnabled ? await client.action(api.extensions.forms.polls.voteWithVerification, { ...args, captchaToken }) : await retryPollWrite(() => client.mutation(api.extensions.forms.polls.vote, args), { active: () => alive.current && current.current?.definitionVersion === source.definitionVersion });
    } catch (error) {
      throw pollResponseError(error);
    } finally {
      if (alive.current && source.security.captchaEnabled) { setCaptchaToken(""); setVerificationAttempt(value => value + 1); }
    }
    if (!alive.current || current.current?.definitionVersion !== source.definitionVersion) throw new Error("Poll session changed");
    // Do not increment displayed counts locally. Subscribe with the saved token
    // to receive the server's recorded response and current aggregate.
    setAcknowledged(result.optionKey);
    drafts?.delete(storageKey);
    if (token !== visitor) setVisitor(token);
    return result;
  }} />;
}
