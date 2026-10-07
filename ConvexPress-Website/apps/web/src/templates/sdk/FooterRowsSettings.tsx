import {FooterAudienceSelect} from "./FooterAudienceSelect";
import { Component, useState, type ReactNode } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { FOOTER_CELL_DEFAULTS } from "./chromeDefinitions";
import { Checkbox } from "@/components/ui/checkbox";

type Item = Record<string, unknown>;
const input =
  "w-full rounded border border-input bg-background px-2 py-1 text-sm";
const fieldOptions: Record<string, string[]> = {
  background: ["default", "muted", "accent", "contrast", "transparent"],
  padding: ["none", "compact", "normal", "spacious"],
  container: ["narrow", "default", "wide", "full"],
  alignment: ["left", "center", "right"],
  topBorder: ["none", "subtle", "bold", "accent"],
};
const label = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
const newCell = () => structuredClone(FOOTER_CELL_DEFAULTS.text);
const id = () => crypto.randomUUID();

/** Ordered footer rows use the existing builder cell schema; changes stay in the draft. */
export function FooterRowsSettings({
  rows,
  onChange,
}: {
  rows: unknown;
  onChange: (rows: unknown[]) => void;
}) {
  const list = Array.isArray(rows) ? (rows as Item[]) : [];
  const patch = (index: number, value: Item) =>
    onChange(list.map((row, position) => (position === index ? value : row)));
  return (
    <section aria-label="Footer rows" className="space-y-3">
      <h3 className="text-sm font-medium">Footer rows</h3>
      {list.map((row, index) => (
        <details
          key={String(row.id ?? index)}
          className="rounded border border-border p-2"
        >
          <summary>Row {index + 1}</summary>
          <div className="my-2 flex gap-3 text-xs">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const next = [...list];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(list.filter((_, position) => position !== index))
              }
            >
              Remove row
            </button>
          </div>
          <ObjectFields
            value={row}
            omit={["id", "columns"]}
            onChange={(value) => patch(index, value)}
          />
          <ColumnFields
            columns={row.columns}
            onChange={(columns) => patch(index, { ...row, columns })}
          />
        </details>
      ))}
      <button
        type="button"
        className="text-xs underline"
        onClick={() =>
          onChange([
            ...list,
            {
              id: id(),
              background: "default",
              padding: "normal",
              container: "default",
              topBorder: "none",
              columns: [{ id: id(), cell: newCell() }],
            },
          ])
        }
      >
        Add footer row
      </button>
      {!list.length && (
        <p className="text-xs text-muted-foreground">
          With no rows, the footer uses the section settings above.
        </p>
      )}
    </section>
  );
}

function ColumnFields({
  columns,
  onChange,
}: {
  columns: unknown;
  onChange: (columns: Item[]) => void;
}) {
  const list = Array.isArray(columns) ? (columns as Item[]) : [];
  const patch = (index: number, value: Item) =>
    onChange(
      list.map((column, position) => (position === index ? value : column)),
    );
  return (
    <div className="mt-3 space-y-2">
      {list.map((column, index) => {
        const cell: Item =
          column.cell && typeof column.cell === "object"
            ? (column.cell as Item)
            : newCell();
        return (
          <details
            key={String(column.id ?? index)}
            className="rounded border border-border p-2"
          >
            <summary>
              Column {index + 1} · {String(cell.type)}
            </summary>
            <label className="my-2 block text-xs">
              Content type
              <select
                className={input}
                value={String(cell.type)}
                onChange={(event) =>
                  patch(index, {
                    ...column,
                    cell: structuredClone(
                      FOOTER_CELL_DEFAULTS[
                        event.target.value as keyof typeof FOOTER_CELL_DEFAULTS
                      ],
                    ),
                  })
                }
              >
                {Object.keys(FOOTER_CELL_DEFAULTS).map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-xs">
              Width
              <select
                className={input}
                value={String(column.width ?? "auto")}
                onChange={(event) =>
                  patch(index, {
                    ...column,
                    width: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              >
                {["", "3", "4", "6", "8", "9", "12"].map((width) => (
                  <option key={width} value={width}>
                    {width ? `${width} of 12 columns` : "Auto"}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-xs">
              Content alignment
              <select className={input} value={String(cell.alignment ?? "inherit")} onChange={event => {
                const next = { ...cell };
                if (event.target.value === "inherit") delete next.alignment;
                else next.alignment = event.target.value;
                patch(index, { ...column, cell: next });
              }}>
                {["inherit", "left", "center", "right"].map(value => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </label>
            <ObjectFields
              value={cell}
              omit={["type", "alignment", "audienceId"]}
              onChange={(value) => patch(index, { ...column, cell: value })}
            />
            {cell.type === "newsletter" && <FooterAudienceSelect value={String(cell.audienceId ?? "")} onChange={audienceId => { const next = { ...cell }; if (audienceId) next.audienceId = audienceId; else delete next.audienceId; patch(index, { ...column, cell: next }); }} />}
            <div className="mt-2 flex gap-3 text-xs">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...list];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  onChange(next);
                }}
              >
                Move left
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange(list.filter((_, position) => position !== index))
                }
              >
                Remove column
              </button>
            </div>
          </details>
        );
      })}
      <button
        type="button"
        className="text-xs underline"
        onClick={() => onChange([...list, { id: id(), cell: newCell() }])}
      >
        Add column
      </button>
    </div>
  );
}

/** Reuses each cell's existing labelled primitives, including links and payment logos. */
function ObjectFields({
  value,
  omit = [],
  onChange,
}: {
  value: Item;
  omit?: string[];
  onChange: (value: Item) => void;
}) {
  return (
    <div className="space-y-2">
      {Object.entries(value)
        .filter(([key]) => !omit.includes(key))
        .map(([key, current]) => {
          const update = (next: unknown) => onChange({ ...value, [key]: next });
          if (Array.isArray(current))
            return (
              <fieldset
                key={key}
                className="space-y-2 border border-border p-2"
              >
                <legend className="text-xs">{label(key)}</legend>
                {current.map((entry, index) => (
                  <div key={index} className="border-b border-border pb-2">
                    {entry && typeof entry === "object" ? (
                      <ObjectFields
                        value={entry as Item}
                        onChange={(next) =>
                          update(
                            current.map((item, position) =>
                              position === index ? next : item,
                            ),
                          )
                        }
                      />
                    ) : (
                      <input
                        aria-label={`${label(key)} ${index + 1}`}
                        className={input}
                        value={String(entry)}
                        onChange={(event) =>
                          update(
                            current.map((item, position) =>
                              position === index ? event.target.value : item,
                            ),
                          )
                        }
                      />
                    )}
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        update(
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() =>
                    update([
                      ...current,
                      key === "items" ? { label: "", url: "/" } : "",
                    ])
                  }
                >
                  Add {label(key).toLowerCase()}
                </button>
              </fieldset>
            );
          if (key === "mediaId" || key === "backgroundImageId")
            return (
              <ImageSetting
                key={key}
                value={typeof current === "string" ? current : ""}
                onChange={update}
              />
            );
          if (fieldOptions[key])
            return (
              <label key={key} className="block text-xs">
                {label(key)}
                <select
                  className={input}
                  value={String(current ?? "")}
                  onChange={(event) => update(event.target.value)}
                >
                  {fieldOptions[key].map((option) => (
                    <option key={option} value={option}>
                      {label(option)}
                    </option>
                  ))}
                </select>
              </label>
            );
          if (current && typeof current === "object") return null;
          return (
            <label key={key} className="block text-xs">
              {label(key)}
              {typeof current === "boolean" ? (
                <Checkbox
                  className="ml-2 inline-flex"
                  checked={current}
                  onCheckedChange={update}
                />
              ) : (
                <input
                  className={input}
                  value={current === null ? "" : String(current)}
                  type={typeof current === "number" ? "number" : "text"}
                  onChange={(event) =>
                    update(
                      typeof current === "number"
                        ? Number(event.target.value)
                        : event.target.value || null,
                    )
                  }
                />
              )}
            </label>
          );
        })}
    </div>
  );
}

class ImageSettingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="text-sm"><p>Images could not be loaded. Your access may have changed, or this page exceeded its read budget.</p><button type="button" className={input} onClick={() => this.setState({ failed: false })}>Retry images</button></div>;
  }
}

export function ImageSetting(props: { value: string; onChange: (value: unknown) => void; label?: string; id?: string }) {
  return <ImageSettingBoundary><ImageSettingContent {...props} /></ImageSettingBoundary>;
}

function ImageSettingContent({
  value,
  onChange,
  label = "Image",
  id,
}: {
  value: string;
  onChange: (value: unknown) => void;
  label?: string;
  id?: string;
}) {
  const [search, setSearch] = useState("");
  const images = usePaginatedQuery(api.media.queries.list, {
    mediaType: "image",
    search: search || undefined,
  }, { initialNumItems: 30 });
  return (
    <div className="space-y-1">
      <label className="block text-xs">
        Find an image
        <input
          className={input}
          maxLength={256}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <select
        aria-label={label}
        id={id}
        className={input}
        value={value}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">No image</option>
        {value &&
          !images.results.some((image) => String(image._id) === value) && (
            <option value={value}>Current image</option>
          )}
        {images.results.map((image) => (
          <option key={image._id} value={image._id}>
            {image.title || image.fileName}
          </option>
        ))}
      </select>
      <p role="status" className="text-xs text-muted-foreground">{images.status === "LoadingFirstPage" ? "Loading images…" : images.status === "Exhausted" ? `${images.results.length} matching images loaded · complete` : images.results.length === 0 ? "No matches in the loaded pages. Continue loading to check more images." : `${images.results.length} matching images loaded · more available`}</p>
      {images.status !== "Exhausted" && <button type="button" className={input} disabled={images.status !== "CanLoadMore"} onClick={() => images.loadMore(30)}>{images.status === "LoadingFirstPage" || images.status === "LoadingMore" ? "Loading images…" : "Load more images"}</button>}
    </div>
  );
}

export function FooterMenuColumnsSettings({
  columns,
  onChange,
}: {
  columns: unknown;
  onChange: (columns: Item[]) => void;
}) {
  const list = Array.isArray(columns) ? (columns as Item[]) : [];
  return (
    <fieldset className="space-y-2 rounded border border-border p-2">
      <legend className="text-xs">Footer menu columns</legend>
      {list.map((column, index) => (
        <div key={index} className="space-y-1 border-b border-border pb-2">
          <label className="block text-xs">
            Heading
            <input
              className={input}
              value={String(column.heading ?? "")}
              onChange={(event) =>
                onChange(
                  list.map((item, position) =>
                    position === index
                      ? { ...item, heading: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label className="block text-xs">
            Menu location
            <input
              className={input}
              value={String(column.menuSource ?? "")}
              onChange={(event) =>
                onChange(
                  list.map((item, position) =>
                    position === index
                      ? { ...item, menuSource: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="text-xs underline"
            onClick={() =>
              onChange(list.filter((_, position) => position !== index))
            }
          >
            Remove column
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs underline"
        onClick={() =>
          onChange([
            ...list,
            { heading: "", menuSource: `footer-${list.length + 1}` },
          ])
        }
      >
        Add menu column
      </button>
    </fieldset>
  );
}
