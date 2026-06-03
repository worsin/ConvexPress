import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  CheckboxField,
  NumberField,
  RepeaterHeader,
  RepeaterItem,
  SelectField,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { AswProductCard, AswProductCollectionAttrs } from "./schema";

const emptyProduct: AswProductCard = {
  title: "",
  summary: "",
  href: "",
  price: "",
  badge: "",
  mediaId: "",
  imageAlt: "",
};

const emptyGroup: AswProductCollectionAttrs["groups"][number] = {
  label: "Product group",
  productIds: [],
  products: [],
};

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AswProductCollectionEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<AswProductCollectionAttrs>) {
  const updateProduct = (index: number, patch: Partial<AswProductCard>) => {
    onChange({
      ...attrs,
      products: attrs.products.map((product, productIndex) =>
        productIndex === index ? { ...product, ...patch } : product,
      ),
    });
  };
  const updateGroup = (
    index: number,
    patch: Partial<AswProductCollectionAttrs["groups"][number]>,
  ) => {
    onChange({
      ...attrs,
      groups: attrs.groups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, ...patch } : group,
      ),
    });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      </div>
      <TextareaField label="Intro" value={attrs.intro} rows={3} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label="Mode"
          value={attrs.mode}
          disabled={disabled}
          options={[
            ["manual", "Manual cards"],
            ["category", "Category"],
            ["tag", "Tag"],
            ["sale", "Sale"],
            ["featured", "Featured"],
            ["recent", "Recent"],
            ["recentlyViewed", "Recently viewed"],
          ]}
          onChange={(mode) => onChange({ ...attrs, mode })}
        />
        <SelectField
          label="Display"
          value={attrs.display}
          disabled={disabled}
          options={[
            ["grid", "Grid"],
            ["carousel", "Carousel"],
            ["tabs", "Grouped tabs"],
          ]}
          onChange={(display) => onChange({ ...attrs, display })}
        />
      </div>
      <TextareaField
        label="Product IDs"
        value={attrs.productIds.join("\n")}
        rows={4}
        disabled={disabled}
        onChange={(value) => onChange({ ...attrs, productIds: splitLines(value) })}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <TextField label="Category slug" value={attrs.categorySlug} disabled={disabled} onChange={(categorySlug) => onChange({ ...attrs, categorySlug })} />
        <TextField label="Tag slug" value={attrs.tagSlug} disabled={disabled} onChange={(tagSlug) => onChange({ ...attrs, tagSlug })} />
        <NumberField label="Count" value={attrs.count} min={1} max={24} disabled={disabled} onChange={(count) => onChange({ ...attrs, count })} />
        <NumberField label="Columns" value={attrs.columns} min={2} max={4} disabled={disabled} onChange={(columns) => onChange({ ...attrs, columns })} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <CheckboxField label="Show price" checked={attrs.showPrice} disabled={disabled} onChange={(showPrice) => onChange({ ...attrs, showPrice })} />
        <CheckboxField label="Show rating" checked={attrs.showRating} disabled={disabled} onChange={(showRating) => onChange({ ...attrs, showRating })} />
        <CheckboxField label="Show sale badge" checked={attrs.showSaleBadge} disabled={disabled} onChange={(showSaleBadge) => onChange({ ...attrs, showSaleBadge })} />
        <CheckboxField label="Show add to cart" checked={attrs.showAddToCart} disabled={disabled} onChange={(showAddToCart) => onChange({ ...attrs, showAddToCart })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="CTA label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
      <div className="grid gap-3">
        <RepeaterHeader label="Manual product cards" disabled={disabled} onAdd={() => onChange({ ...attrs, products: [...attrs.products, emptyProduct] })} />
        {attrs.products.map((product, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove product"
            onRemove={() => onChange({ ...attrs, products: attrs.products.filter((_, productIndex) => productIndex !== index) })}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Title" value={product.title} disabled={disabled} onChange={(title) => updateProduct(index, { title })} />
              <TextField label="URL" value={product.href} disabled={disabled} onChange={(href) => updateProduct(index, { href })} />
            </div>
            <TextareaField label="Summary" value={product.summary} rows={2} disabled={disabled} onChange={(summary) => updateProduct(index, { summary })} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Price" value={product.price} disabled={disabled} onChange={(price) => updateProduct(index, { price })} />
              <TextField label="Badge" value={product.badge} disabled={disabled} onChange={(badge) => updateProduct(index, { badge })} />
            </div>
            <MediaField label="Product image" value={product.mediaId} disabled={disabled} promptSeed={product.title || product.summary} onChange={(mediaId) => updateProduct(index, { mediaId })} />
            <TextField label="Image alt text" value={product.imageAlt} disabled={disabled} onChange={(imageAlt) => updateProduct(index, { imageAlt })} />
          </RepeaterItem>
        ))}
      </div>
      <div className="grid gap-3">
        <RepeaterHeader label="Product groups" disabled={disabled} onAdd={() => onChange({ ...attrs, groups: [...attrs.groups, emptyGroup] })} />
        {attrs.groups.map((group, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove group"
            onRemove={() => onChange({ ...attrs, groups: attrs.groups.filter((_, groupIndex) => groupIndex !== index) })}
          >
            <TextField label="Group label" value={group.label} disabled={disabled} onChange={(label) => updateGroup(index, { label })} />
            <TextareaField
              label="Group product IDs"
              value={group.productIds.join("\n")}
              rows={4}
              disabled={disabled}
              onChange={(value) => updateGroup(index, { productIds: splitLines(value) })}
            />
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
