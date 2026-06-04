import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { RichText, SectionIntro } from "../_shared/rendering";
import { contactStackAttrsSchema, type ContactStackAttrs } from "./schema";

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-6 text-foreground">
        {href ? <a href={href} className="hover:underline">{value}</a> : value}
      </dd>
    </div>
  );
}

function ContactStackRenderer({ attrs }: BlockRendererProps<ContactStackAttrs>) {
  return (
    <div className="space-y-6">
      <SectionIntro heading={attrs.heading} body={attrs.intro} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <dl className="grid gap-3">
          <ContactRow label="Phone" value={attrs.phone} href={attrs.phone ? `tel:${attrs.phone}` : ""} />
          <ContactRow label="Email" value={attrs.email} href={attrs.email ? `mailto:${attrs.email}` : ""} />
          <ContactRow label="Address" value={attrs.address} />
          <ContactRow label="Hours" value={attrs.hours} />
          {attrs.items.map((item, index) => (
            <ContactRow key={index} label={item.label} value={item.value} href={item.href} />
          ))}
        </dl>
        {attrs.mapEmbedUrl ? (
          <iframe
            src={attrs.mapEmbedUrl}
            title={`${attrs.heading} map`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          className="min-h-96 w-full rounded-md border border-border"
        />
      ) : (
          <div className="rounded-md border border-border bg-muted p-5">
            <RichText text={attrs.address} className="text-sm text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

export const definition = {
  name: "blocks/contact-stack",
  title: "Contact Stack",
  version: 1,
  schema: contactStackAttrsSchema,
  Renderer: ContactStackRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
