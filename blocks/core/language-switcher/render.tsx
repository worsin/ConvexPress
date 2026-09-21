import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineDataBlock("core/language-switcher", "site.locales", ({data}) => {
  if (!data.enabled || !data.items.length) return null;
  return <nav className="cp-languages" aria-label="Choose a language">
    <div className="cp-languages-intro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg><P.Text size="sm" tone="muted">Language</P.Text></div>
    <ul className="cp-languages-list">{data.items.map(item => <li key={item.code}>
      <a href={item.href} hrefLang={item.code} aria-current={item.current ? "page" : undefined} className="cp-language-link">
        <span className="cp-language-native" lang={item.code} dir={item.direction}>{item.label}</span>
        <span className="cp-language-detail">{item.current ? "Current" : item.destination === "landing" ? "Language home" : "Translation"}</span>
        <span className="cp-language-mark" aria-hidden="true">{item.current ? "✓" : "↗"}</span>
      </a>
    </li>)}</ul>
  </nav>;
});
