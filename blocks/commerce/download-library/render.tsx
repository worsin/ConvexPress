import { observeSectionReveal } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives/reveal";
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { DownloadLibraryHostView } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/download-library";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
function Arrow() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>; }
function size(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
const states = { expired: "Access expired", exhausted: "Download limit reached", unavailable: "Currently unavailable" };
function expiryLabel(value: number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `Available until ${date.toISOString().slice(0, 10)}` : "See your order for access details.";
}
export default defineBlock("commerce/download-library", ({ attrs }) => (
  <DownloadLibraryHostView>{library => (
    <section className="cp-download-library" data-download-state={library.state} aria-label={attrs.heading || "Your downloads"}>
      <header className="cp-download-heading"><div><P.Eyebrow>Your collection, ready when you are</P.Eyebrow><P.Heading>{attrs.heading || "Your downloads"}</P.Heading></div>{attrs.helpLink && <P.Link label={attrs.helpLink.label || "Need a hand?"} href={attrs.helpLink.href} />}</header>
      {library.state === "signed-out" ? <div className="cp-download-empty"><P.Heading level={3}>Everything you’ve collected, in one place.</P.Heading><P.Text>Sign in with the account you used at checkout to find your files.</P.Text><P.Button label="Sign in" href="/login" /></div>
        : library.state !== "ready" ? <p className="cp-download-notice" role="status">{library.state === "loading" ? "Loading your downloads…" : library.state === "offline" ? "Reconnect to see your downloads." : "Your downloads are unavailable right now. Please try again shortly."}</p>
        : <><p className="cp-download-feedback" role="status" aria-live="polite" aria-atomic="true">{library.message}</p>
          {library.items.length === 0 ? <div className="cp-download-empty"><P.Heading level={3}>A place for your next discovery.</P.Heading><P.Text>{attrs.emptyMessage}</P.Text><P.Link label="Browse the collection" href="/products" /></div> : <ul className="cp-download-list">{library.items.map((item, index) => <li key={item.id} className="cp-download-file" ref={observeSectionReveal}>
            <div className="cp-download-art" aria-hidden="true"><span className="cp-download-number">{String(index + 1).padStart(2, "0")}</span><svg viewBox="0 0 64 80" fill="none"><path d="M12 2h28l16 16v60H12z" stroke="currentColor" strokeWidth="1.4"/><path d="M40 2v18h16M22 40h24M22 48h24M22 56h14" stroke="currentColor" strokeWidth="1.4"/></svg><span>{item.fileName.split(".").pop()?.slice(0, 7).toUpperCase() || "FILE"}</span></div>
            <div className="cp-download-detail"><span className="cp-download-label">{item.label || "Digital edition"}</span><P.Heading level={3}>{item.title}</P.Heading><p className="cp-download-filename">{item.fileName}</p><dl className="cp-download-meta">{item.version && <div><dt>Version</dt><dd>{item.version}</dd></div>}{item.fileSize !== null && <div><dt>Size</dt><dd>{size(item.fileSize)}</dd></div>}<div><dt>Order</dt><dd>{item.orderNumber}</dd></div></dl></div>
            <div className="cp-download-action">{item.status === "available" ? <><button type="button" onClick={() => void library.download(item.id)} disabled={library.busy.has(item.id)} aria-label={`Download ${item.title}`}><span>{library.busy.has(item.id) ? "Preparing…" : "Download"}</span><Arrow /></button><span className="cp-download-allowance">{item.remainingDownloads === null ? "Unlimited downloads" : `${item.remainingDownloads} download${item.remainingDownloads === 1 ? "" : "s"} remaining`}</span>{item.expiresAt !== null && <span className="cp-download-expiry">{expiryLabel(item.expiresAt)}</span>}</> : <span className="cp-download-unavailable">{states[item.status]}</span>}</div>
          </li>)}</ul>}
          {(library.previous || library.next) && <nav className="cp-download-pager" aria-label="Download pages"><button type="button" disabled={!library.previous} onClick={() => library.previous?.()}>← Previous</button><button type="button" disabled={!library.next} onClick={() => library.next?.()}>Next →</button></nav>}
        </>}
    </section>
  )}</DownloadLibraryHostView>
));
