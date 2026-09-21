import { observeSectionReveal } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives/reveal";
import {useSocialMedia} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/social-media";
import { useEffect, useState } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import type { SocialFeedResult } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/socialFeedContracts";
import "./render.css";
const date = (time: number) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(time);
function Feed({ data }: { data: SocialFeedResult }) {
 const media=useSocialMedia();
 const [images, setImages] = useState(false), [failed, setFailed] = useState<Set<string>>(() => new Set()), [expired, setExpired] = useState(false);
 useEffect(() => {
  if (data.expiresAt === null) return;
  const remaining = data.expiresAt - Date.now();
  if (remaining <= 0) { setExpired(true); return; }
  const timer = setTimeout(() => setExpired(true), Math.min(remaining, 2147483647));
  return () => clearTimeout(timer);
 }, [data.expiresAt]);
 if (data.status !== "ready" || !data.profile || expired) return <section className="cp-social" aria-label="Social feed"><p className="cp-social-empty" role="status">This feed is not available right now.</p></section>;
 const provider = data.provider === "mastodon" ? "Mastodon" : "Instagram", hasImages = data.items.some(item => item.image);
 return <section className="cp-social" aria-label={`${data.profile.name} on ${provider}`}>
  <header className="cp-social-header"><div><span className="cp-social-eyebrow">Elsewhere / {provider}</span><h2>{data.profile.name}</h2><a className="cp-social-profile" href={data.profile.url} target="_blank" rel="noopener noreferrer">@{data.profile.handle} <span aria-hidden="true">↗</span><span className="cp-social-sr"> (opens in a new tab)</span></a></div><p>Public posts,<br/>from the source.</p></header>
  {hasImages && <div className="cp-social-media-choice"><p>{images ? "Images are loaded directly from this account’s approved media host." : "Read the notes here. Load photographs when you’re ready."}</p><button type="button" onClick={() => setImages(value => !value)} aria-pressed={images}>{images ? "Hide photographs" : "Load photographs"}</button></div>}
  {data.items.length ? <ol className="cp-social-grid">{data.items.map((item, index) => <li className="cp-social-card" ref={observeSectionReveal} key={item.id}>
   <article><div className="cp-social-card-top"><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><time dateTime={new Date(item.publishedAt).toISOString()}>{date(item.publishedAt)}</time></div>
    {item.image && images && <div className="cp-social-photo">{failed.has(item.id) ? <p role="status">This photograph could not be loaded.</p> : <img src={media[item.image.url] ?? item.image.url} alt={item.image.alt} width={item.image.width ?? undefined} height={item.image.height ?? undefined} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(current => new Set(current).add(item.id))}/>}</div>}
    {item.text && <p className="cp-social-text">{item.text}</p>}
    <a className="cp-social-post-link" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`View post ${index + 1} on ${provider} (opens in a new tab)`}>View on {provider} <span aria-hidden="true">↗</span></a>
   </article>
  </li>)}</ol> : <p className="cp-social-empty" role="status">No public posts to share just yet.</p>}
  <footer className="cp-social-footer"><span>From the original account</span>{data.refreshedAt !== null && <span>Updated <time dateTime={new Date(data.refreshedAt).toISOString()}>{date(data.refreshedAt)}</time></span>}</footer>
 </section>;
}
export default defineDataBlock("core/social-feed", "social.feed", ({ data }) => <Feed key={JSON.stringify(data)} data={data}/>);
