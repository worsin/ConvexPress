import { useEffect, useRef, useState } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useBlockPageHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import type { AlbumResult } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/albumContracts";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

type Album = NonNullable<AlbumResult["album"]>;
function AlbumImages({ album, items }: { album: Album; items: AlbumResult["items"] }) {
  const [active, setActive] = useState<number | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const selected = active === null ? null : items[active];
  useEffect(() => {
    const dialog = modal.current;
    if (active !== null && dialog && !dialog.open) dialog.showModal();
  }, [active]);
  useEffect(() => { const dialog = modal.current; return () => { dialog?.close(); }; }, []);
  const close = () => { modal.current?.close(); setActive(null); trigger.current?.focus(); };
  return <>
    <div className="cp-album-grid">
      {items.map((item, index) => <figure className="cp-album-frame" key={item.id}>
        {album.lightboxEnabled ? <button className="cp-album-open" type="button"
          aria-label={`View image ${index + 1}: ${item.image.alt || item.caption || album.title}`}
          aria-haspopup="dialog" onClick={event => { trigger.current = event.currentTarget; setActive(index); }}>
          <img {...item.image} loading="lazy" decoding="async"/>
          <span className="cp-album-expand" aria-hidden="true">↗</span>
        </button> : <div className="cp-album-open"><img {...item.image} loading="lazy" decoding="async"/></div>}
        <figcaption className="cp-album-caption"><span className="cp-album-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span>{item.caption}{item.href && <a href={item.href}>Explore this image <span aria-hidden="true">↗</span></a>}
            {!album.lightboxEnabled && album.downloadEnabled && <a href={item.image.src} target="_blank" rel="noopener noreferrer">Open original image</a>}</span>
        </figcaption>
      </figure>)}
    </div>
    {album.lightboxEnabled && <dialog ref={modal} className="cp-album-lightbox"
      aria-label={selected ? `${album.title} — image ${(active ?? 0) + 1}` : album.title}
      onClose={() => { setActive(null); trigger.current?.focus(); }}
      onKeyDown={event => {
        if (event.key === "Tab") {
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]")].filter(node => node.tabIndex >= 0);
          const first = controls[0], last = controls.at(-1), focused = event.currentTarget.ownerDocument.activeElement;
          if (first && last && (event.shiftKey ? focused === first : focused === last)) {
            event.preventDefault(); (event.shiftKey ? last : first).focus();
          }
          return;
        }
        if (active === null || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault(); setActive((active + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length);
        }
      }}>
      <div className="cp-album-toolbar"><span>{album.title}</span><button type="button" autoFocus onClick={close} aria-label="Close album preview">Close <span aria-hidden="true">×</span></button></div>
      {selected && <figure className="cp-album-selected"><img {...selected.image}/>{selected.caption && <figcaption>{selected.caption}</figcaption>}</figure>}
      <div className="cp-album-toolbar"><div className="cp-album-paging"><button type="button" aria-label="Previous image" disabled={items.length < 2} onClick={() => setActive(((active ?? 0) - 1 + items.length) % items.length)}>←</button>
        <span role="status" aria-live="polite">{active === null ? "" : `${active + 1} / ${items.length}`}</span>
        <button type="button" aria-label="Next image" disabled={items.length < 2} onClick={() => setActive(((active ?? 0) + 1) % items.length)}>→</button></div>
        {selected && album.downloadEnabled && <a href={selected.image.src} target="_blank" rel="noopener noreferrer">Open original <span aria-hidden="true">↗</span></a>}
      </div>
    </dialog>}
  </>;
}

export default defineDataBlock("gallery/album", "gallery.album", ({ data, blockId }) => {
  const href = useBlockPageHref(blockId);
  const next = data.nextCursor ? href(data.nextCursor) : null;
  const first = data.cursor ? href(null) : null;
  if (!data.album) return <P.Text tone="muted">This album is not available here.</P.Text>;
  return <section className="cp-album" aria-label={data.album.title}>
    <header className="cp-album-header"><P.Stack gap="sm"><P.Eyebrow>In pictures</P.Eyebrow><P.Heading size="lg">{data.album.title}</P.Heading></P.Stack>
      {data.album.description && <P.Text tone="muted">{data.album.description}</P.Text>}
    </header>
    {data.items.length ? <AlbumImages key={JSON.stringify([data.album, data.cursor, data.items])} album={data.album} items={data.items}/> : <P.Text tone="muted">No images are available on this page.</P.Text>}
    <footer className="cp-album-footer"><P.Link href={data.album.href} label="Visit album →"/>
      {(data.cursor || data.nextCursor) && <nav aria-label="Album pagination">{first && <P.Link href={first} label="Back to first images"/>}{next && <P.Link href={next} label="More images →"/>}</nav>}
    </footer>
  </section>;
});
