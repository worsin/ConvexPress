import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { GradeGalleryAttrs, GradeGalleryImage } from "./schema";

const emptySection: GradeGalleryAttrs["sections"][number] = {
  grade: "Grade",
  description: "",
  notes: "",
  images: [],
};

const emptyImage: GradeGalleryImage = {
  mediaId: "",
  alt: "",
  caption: "",
};

export function GradeGalleryEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<GradeGalleryAttrs>) {
  const updateSection = (
    index: number,
    patch: Partial<GradeGalleryAttrs["sections"][number]>,
  ) => {
    onChange({
      ...attrs,
      sections: attrs.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    });
  };
  const updateImage = (sectionIndex: number, imageIndex: number, patch: Partial<GradeGalleryImage>) => {
    const section = attrs.sections[sectionIndex];
    if (!section) return;
    updateSection(sectionIndex, {
      images: section.images.map((image, index) =>
        index === imageIndex ? { ...image, ...patch } : image,
      ),
    });
  };

  return (
    <div className="grid gap-4">
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.intro} rows={3} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <div className="grid gap-3">
        <RepeaterHeader label="Grade sections" disabled={disabled} onAdd={() => onChange({ ...attrs, sections: [...attrs.sections, emptySection] })} />
        {attrs.sections.map((section, sectionIndex) => (
          <RepeaterItem
            key={sectionIndex}
            disabled={disabled}
            removeLabel="Remove grade"
            onRemove={() => onChange({ ...attrs, sections: attrs.sections.filter((_, index) => index !== sectionIndex) })}
          >
            <TextField label="Grade" value={section.grade} disabled={disabled} onChange={(grade) => updateSection(sectionIndex, { grade })} />
            <TextareaField label="Description" value={section.description} rows={4} disabled={disabled} onChange={(description) => updateSection(sectionIndex, { description })} />
            <TextareaField label="Notes" value={section.notes} rows={3} disabled={disabled} onChange={(notes) => updateSection(sectionIndex, { notes })} />
            <div className="grid gap-3 border border-border bg-background p-3">
              <RepeaterHeader
                label="Images"
                disabled={disabled}
                onAdd={() => updateSection(sectionIndex, { images: [...section.images, emptyImage] })}
              />
              {section.images.map((image, imageIndex) => (
                <RepeaterItem
                  key={imageIndex}
                  disabled={disabled}
                  removeLabel="Remove image"
                  onRemove={() => updateSection(sectionIndex, { images: section.images.filter((_, index) => index !== imageIndex) })}
                >
                  <MediaField label="Image" value={image.mediaId} disabled={disabled} promptSeed={`${section.grade} product`} onChange={(mediaId) => updateImage(sectionIndex, imageIndex, { mediaId })} />
                  <TextField label="Alt text" value={image.alt} disabled={disabled} onChange={(alt) => updateImage(sectionIndex, imageIndex, { alt })} />
                  <TextField label="Caption" value={image.caption} disabled={disabled} onChange={(caption) => updateImage(sectionIndex, imageIndex, { caption })} />
                </RepeaterItem>
              ))}
            </div>
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
