import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import type { PollDefinition } from "../block-data/portable/pollContracts";
import { parsePollDefinition } from "../block-data/portable/pollContracts";
import type { PollResult } from "../block-data/portable/pollDataContracts";
import * as P from "../primitives";
import { PollInteractionError } from "./poll-client";
import "./poll.css";
export type PollSnapshot = NonNullable<PollResult["poll"]>;
type Host = { render: ((poll: PollSnapshot) => ReactNode) | null };
const PollHost = createContext<Host>({ render: null });
export function PollProvider({ value, children }: { value: Host; children: ReactNode }) { return <PollHost value={value}>{children}</PollHost>; }
export function PollBody({ attrs, data }: { attrs: PollDefinition; data: PollResult }) {
  const host = useContext(PollHost);
  try { parsePollDefinition(attrs); } catch { return <p role="status">Add a question and at least two distinct choices to this poll.</p>; }
  if (host.render) return data.poll ? host.render(data.poll) : <p role="status">This poll is not currently available.</p>;
  return <PollView key={JSON.stringify(attrs)} attrs={attrs} poll={data.poll} preview />;
}

/** The view never creates a visitor identity, performs a query, or fabricates a
 * tally. The live host alone supplies an authorized snapshot and vote callback. */
export function PollView({ attrs, poll, preview = false, onVote, acknowledged, securityControls, selection }: {
  attrs: PollDefinition; poll: PollSnapshot | null; preview?: boolean;
  onVote?: (optionKey: string) => Promise<{ accepted: boolean; optionKey: string }>;
  acknowledged?: string;
  securityControls?: ReactNode;
  selection?: { value: string; onChange: (value: string) => void };
}) {
  const id = useId(), [localSelected, setLocalSelected] = useState(""), [pending, setPending] = useState(false);
  const selected = selection?.value ?? localSelected;
  const setSelected = selection?.onChange ?? setLocalSelected;
  const [error, setError] = useState(""), [receipt, setReceipt] = useState<string | null>(acknowledged ?? null);
  const active = useRef(true), inFlight = useRef(false), notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (error || receipt) notice.current?.focus(); }, [error, receipt]);
  const question = preview ? attrs.question : poll?.question ?? attrs.question;
  const options = preview ? attrs.options.map(option => ({ ...option, count: null })) : poll?.options ?? [];
  const total = preview ? null : poll?.total ?? null, voted = poll?.votedKey ?? receipt;
  const disabled = preview || pending || !!voted || !poll?.canVote || !onVote;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || inFlight.current || !onVote) return;
    if (!selected) { setError("Choose one option before sending your response."); return; }
    inFlight.current = true; setPending(true); setError("");
    try {
      const result = await onVote(selected);
      if (active.current) setReceipt(result.optionKey);
    } catch (error) { if (active.current) setError(error instanceof PollInteractionError ? error.message : "Your response could not be saved. Please try again."); }
    finally { inFlight.current = false; if (active.current) setPending(false); }
  };
  return <div className="cp-poll-shell"><form className="cp-poll" onSubmit={submit} aria-labelledby={`${id}-question`} aria-busy={pending} noValidate>
    <div className="cp-poll-heading"><p className="cp-poll-eyebrow">A question for you</p><div id={`${id}-question`}><P.Heading>{question}</P.Heading></div><p className="cp-poll-description">Choose the one that speaks to you.</p></div>
    <fieldset disabled={disabled} aria-describedby={`${id}-notice`}><legend className="cp-poll-sr">Choose one response</legend>
      {options.map((option, index) => {
        const percent = total && option.count !== null ? Math.round(option.count / total * 100) : 0;
        const checked = (voted ?? selected) === option.key;
        return <label className="cp-poll-option" key={option.key} data-selected={checked || undefined}>
          <span aria-hidden="true" className="cp-poll-fill" style={{ "--cp-poll-fraction": total && option.count !== null ? option.count / total : 0 } as CSSProperties} />
          <input type="radio" name={`${id}-choice`} value={option.key} checked={checked} onChange={() => { setSelected(option.key); setError(""); }} />
          <span className="cp-poll-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="cp-poll-label">{option.label}</span>
          {total !== null ? <span className="cp-poll-percent" aria-label={`${option.count} ${option.count === 1 ? "response" : "responses"}, ${percent} percent`}>{percent}<small>%</small></span> : <span className="cp-poll-indicator" aria-hidden="true">{checked && <Check size={14} />}</span>}
        </label>;
      })}
    </fieldset>
    {securityControls}
    <div className="cp-poll-footer"><p>{total !== null ? `${total.toLocaleString()} ${total === 1 ? "response" : "responses"}` : "Your perspective matters."}</p><button type="submit" disabled={disabled}>{pending ? "Saving response…" : voted ? "Response recorded" : "Send my response"}{voted ? <Check size={18} aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}</button></div>
    <p id={`${id}-notice`} className="cp-poll-notice" ref={notice} tabIndex={-1} role={error ? "alert" : "status"}>{error || (preview ? "Poll preview — responses are not sent." : receipt ? "Thank you. Your response has been recorded." : voted ? "You have already responded to this question." : !poll?.canVote ? "Sign in to share your response." : poll.responsePolicy === "visitor" ? "One response per browser, or per account when signed in." : "One response per signed-in account.")}</p>
  </form></div>;
}
