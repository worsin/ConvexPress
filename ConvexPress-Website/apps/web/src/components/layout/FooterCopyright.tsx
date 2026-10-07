import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import type { FooterCopyrightCell } from "@/lib/layout/types";

/** Keep the section-footer placeholders intact when its settings become rows. */
export function FooterCopyright({ cell, className }: { cell: FooterCopyrightCell; className?: string }) {
  const identity = useSiteIdentity();
  const title = identity?.title ?? "";
  const text = cell.text.replace(/\{(year|site|siteName)\}/g, (token, key: string) =>
    key === "year" ? (cell.insertYear ? String(new Date().getFullYear()) : token) : title,
  );
  return <p className={className}>{text}</p>;
}
