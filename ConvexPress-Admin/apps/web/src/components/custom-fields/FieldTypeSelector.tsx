/**
 * FieldTypeSelector - Categorized dropdown for choosing a field type
 *
 * Groups types into categories: Basic, Content, Choice, Relational,
 * Date & Time, Layout, Compound. Shows icon, label, and description.
 */

import {
  AlignLeftIcon,
  CalendarIcon,
  CheckSquareIcon,
  FileIcon,
  GroupIcon,
  HashIcon,
  ImageIcon,
  LayoutListIcon,
  LinkIcon,
  ListIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareIcon,
  PaletteIcon,
  PanelTopIcon,
  RadioIcon,
  RepeatIcon,
  SlidersHorizontalIcon,
  SquareStackIcon,
  TextIcon,
  ToggleLeftIcon,
  TypeIcon,
  UsersIcon,
  VideoIcon,
  ClockIcon,
  KeyIcon,
  GlobeIcon,
  LayersIcon,
  FolderIcon,
  TagIcon,
  SplitIcon,
  CalculatorIcon,
  ShoppingCartIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface FieldTypeSelectorProps {
  onSelect: (type: string) => void;
  onClose: () => void;
}

/** Maps field type slugs to display labels */
export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  range: "Range",
  email: "Email",
  url: "URL",
  password: "Password",
  image: "Image",
  file: "File",
  wysiwyg: "WYSIWYG Editor",
  oembed: "oEmbed",
  gallery: "Gallery",
  select: "Select",
  checkbox: "Checkbox",
  radio: "Radio Button",
  button_group: "Button Group",
  true_false: "True / False",
  link: "Link",
  post_object: "Post Object",
  page_link: "Page Link",
  relationship: "Relationship",
  taxonomy: "Taxonomy",
  user: "User",
  date_picker: "Date Picker",
  date_time_picker: "Date Time Picker",
  time_picker: "Time Picker",
  color_picker: "Color Picker",
  message: "Message",
  accordion: "Accordion",
  tab: "Tab",
  group: "Group",
  repeater: "Repeater",
  flexible_content: "Flexible Content",
  calculation: "Calculation",
  product: "Product",
};

interface FieldTypeCategory {
  label: string;
  types: Array<{
    slug: string;
    label: string;
    description: string;
    icon: React.ReactNode;
  }>;
}

const FIELD_TYPE_CATEGORIES: FieldTypeCategory[] = [
  {
    label: "Basic",
    types: [
      { slug: "text", label: "Text", description: "Single line text input", icon: <TypeIcon className="size-3.5" /> },
      { slug: "textarea", label: "Textarea", description: "Multi-line text input", icon: <AlignLeftIcon className="size-3.5" /> },
      { slug: "number", label: "Number", description: "Numeric input with min/max", icon: <HashIcon className="size-3.5" /> },
      { slug: "range", label: "Range", description: "Slider input with min/max", icon: <SlidersHorizontalIcon className="size-3.5" /> },
      { slug: "email", label: "Email", description: "Email address input", icon: <MailIcon className="size-3.5" /> },
      { slug: "url", label: "URL", description: "Web address input", icon: <GlobeIcon className="size-3.5" /> },
      { slug: "password", label: "Password", description: "Masked text input", icon: <KeyIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Content",
    types: [
      { slug: "image", label: "Image", description: "Image upload or select", icon: <ImageIcon className="size-3.5" /> },
      { slug: "file", label: "File", description: "File upload or select", icon: <FileIcon className="size-3.5" /> },
      { slug: "wysiwyg", label: "WYSIWYG Editor", description: "Rich text editor", icon: <TextIcon className="size-3.5" /> },
      { slug: "oembed", label: "oEmbed", description: "Embed URL (YouTube, etc.)", icon: <VideoIcon className="size-3.5" /> },
      { slug: "gallery", label: "Gallery", description: "Multiple image selection", icon: <SquareStackIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Choice",
    types: [
      { slug: "select", label: "Select", description: "Dropdown select menu", icon: <ListIcon className="size-3.5" /> },
      { slug: "checkbox", label: "Checkbox", description: "Multiple choice checkboxes", icon: <CheckSquareIcon className="size-3.5" /> },
      { slug: "radio", label: "Radio Button", description: "Single choice radio buttons", icon: <RadioIcon className="size-3.5" /> },
      { slug: "button_group", label: "Button Group", description: "Inline button selection", icon: <LayoutListIcon className="size-3.5" /> },
      { slug: "true_false", label: "True / False", description: "Toggle switch", icon: <ToggleLeftIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Relational",
    types: [
      { slug: "link", label: "Link", description: "URL, title, and target", icon: <LinkIcon className="size-3.5" /> },
      { slug: "post_object", label: "Post Object", description: "Select existing posts", icon: <FileIcon className="size-3.5" /> },
      { slug: "page_link", label: "Page Link", description: "Select page URLs", icon: <GlobeIcon className="size-3.5" /> },
      { slug: "relationship", label: "Relationship", description: "Multi-post relationship", icon: <LayersIcon className="size-3.5" /> },
      { slug: "taxonomy", label: "Taxonomy", description: "Select taxonomy terms", icon: <TagIcon className="size-3.5" /> },
      { slug: "user", label: "User", description: "Select users", icon: <UsersIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Date & Time",
    types: [
      { slug: "date_picker", label: "Date Picker", description: "Date selection", icon: <CalendarIcon className="size-3.5" /> },
      { slug: "date_time_picker", label: "Date Time Picker", description: "Date and time selection", icon: <CalendarIcon className="size-3.5" /> },
      { slug: "time_picker", label: "Time Picker", description: "Time selection", icon: <ClockIcon className="size-3.5" /> },
      { slug: "color_picker", label: "Color Picker", description: "Color selection", icon: <PaletteIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Layout",
    types: [
      { slug: "message", label: "Message", description: "Display-only text block", icon: <MessageSquareIcon className="size-3.5" /> },
      { slug: "accordion", label: "Accordion", description: "Collapsible section", icon: <PanelTopIcon className="size-3.5" /> },
      { slug: "tab", label: "Tab", description: "Tabbed section divider", icon: <FolderIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Compound",
    types: [
      { slug: "group", label: "Group", description: "Sub-field container", icon: <GroupIcon className="size-3.5" /> },
      { slug: "repeater", label: "Repeater", description: "Repeatable row of fields", icon: <RepeatIcon className="size-3.5" /> },
      { slug: "flexible_content", label: "Flexible Content", description: "Multiple layout types", icon: <SplitIcon className="size-3.5" /> },
    ],
  },
  {
    label: "Calculation",
    types: [
      { slug: "calculation", label: "Calculation", description: "Derived value from a formula", icon: <CalculatorIcon className="size-3.5" /> },
      { slug: "product", label: "Product", description: "Priced line item (price × qty)", icon: <ShoppingCartIcon className="size-3.5" /> },
    ],
  },
];

export function FieldTypeSelector({
  onSelect,
  onClose,
}: FieldTypeSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-foreground">
          Select Field Type
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {FIELD_TYPE_CATEGORIES.map((category) => (
          <div key={category.label}>
            <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
              {category.label}
            </h4>
            <div className="space-y-1">
              {category.types.map((fieldType) => (
                <button
                  key={fieldType.slug}
                  type="button"
                  onClick={() => onSelect(fieldType.slug)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="text-muted-foreground mt-0.5 shrink-0">
                    {fieldType.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground">
                      {fieldType.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {fieldType.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
