import { useId, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { BlockField, SpecJson, ReferenceKind } from "@backend/canonical-blocks-foundation/generated/spec-runtime.mjs";
import { changeFieldType, defaultForField, editFields, fieldAt, fieldDefinition, fieldList, fieldTypes, newField, type FieldPath } from "./field-editor";
const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const references: ReferenceKind[] = ["product", "productCategory", "productTag", "post", "page", "category", "course", "event", "eventCategory", "tag", "user", "bundle", "membershipPlan", "recipe", "album", "syncedBlock", "mailingList", "poll", "instructor", "kbCategory"];
const names: Record<string, string> = { text: "Text", richtext: "Rich text", number: "Number", boolean: "Yes or no", select: "Choice", reference: "Content reference", media: "Media", link: "Link", icon: "Icon", "color-role": "Theme color", date: "Date", menu: "Menu", form: "Form", repeater: "Repeating items", object: "Field group" };
function outline(fields: BlockField[], parent: FieldPath = []): { field: BlockField; path: FieldPath }[] {
  return fields.flatMap((field, index) => {
    const path = [...parent, index];
    return [{ field, path }, ...("fields" in field && field.fields ? outline(field.fields, path) : []), ...(field.type === "repeater" && field.item ? itemOutline(field.item, [...path, "item"]) : [])];
  });
}
function itemOutline(field: BlockField, path: FieldPath): { field: BlockField; path: FieldPath }[] {
  return [{ field, path }, ...("fields" in field && field.fields ? outline(field.fields, path) : []), ...(field.type === "repeater" && field.item ? itemOutline(field.item, [...path, "item"]) : [])];
}
function JsonValue({ label, value, onChange, onInvalidChange }: { label: string; value: SpecJson; onChange: (value: SpecJson) => void; onInvalidChange?: (invalid: boolean) => void }) {
  const serialized = JSON.stringify(value, null, 2), [text, setText] = useState(serialized), [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setText(serialized);setError("");input.current?.setCustomValidity(""); }, [serialized]);
  useEffect(() => { onInvalidChange?.(!!error);return () => onInvalidChange?.(false); }, [error, onInvalidChange]);
  return <label className="block space-y-1 text-sm">{label}<textarea ref={input} className={inputClass + " font-mono text-xs"} rows={4} maxLength={100000} value={text} onChange={event => {
    const next = event.target.value;setText(next);
    try { const parsed = JSON.parse(next);onChange(parsed);event.target.setCustomValidity("");setError(""); }
    catch { event.target.setCustomValidity("Enter valid JSON before saving.");setError("Enter valid JSON before saving."); }
  }} />{error && <span role="alert" className="text-destructive">{error}</span>}</label>;
}
export function FieldDesigner({ source, onChange, disabled, onInvalidChange }: { source: string; onChange: (source: string) => void; disabled: boolean; onInvalidChange?: (invalid: boolean) => void }) {
  const [path, setPath] = useState<FieldPath>([0]), [adding, setAdding] = useState<BlockField["type"]>("text"), [error, setError] = useState("");
  const id = useId();let definition;
  try { definition = fieldDefinition(source); } catch { return <p role="status" className="text-sm text-muted-foreground">The field editor will return once advanced source contains a supported field structure.</p>; }
  const fields = definition.spec.fields;
  let field: BlockField | null = null;let selectedPath = path;
  try { field = fieldAt(fields, path); } catch { field = fields[0] ?? null;selectedPath = [0]; }
  const change = (operation: (fields: BlockField[]) => void) => {
    if (disabled) return;
    try { onChange(editFields(source, operation));setError(""); } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not edit the field."); }
  };
  const patch = (key: string, value: unknown) => change(items => { const target = fieldAt(items, selectedPath) as unknown as Record<string, unknown>;if (value === undefined) delete target[key];else target[key] = value; });
  const replace = (value: BlockField) => change(items => {
    if (selectedPath.at(-1) === "item") { const parent = fieldAt(items, selectedPath.slice(0, -1));if (parent.type === "repeater") parent.item = value; }
    else fieldList(items, selectedPath.length === 1 ? null : selectedPath.slice(0, -1))[selectedPath.at(-1) as number] = value;
  });
  const add = (parent: FieldPath | null) => {
    let next: FieldPath | null = null;
    change(items => { const list = fieldList(items, parent);next = [...parent ?? [], list.length];list.push(newField(adding, list)); });
    if (next) setPath(next);
  };
  const parentPath = selectedPath.length === 1 ? null : selectedPath.slice(0, -1);
  const scalarItem = selectedPath.at(-1) === "item";
  const siblings = field && !scalarItem ? fieldList(fields, parentPath) : [];
  const index = selectedPath.at(-1) as number;
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Field designer" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(event.target.type)) event.preventDefault(); }}><legend className="px-2 font-semibold">Content fields</legend>
    <p className="text-sm text-muted-foreground">Define what page editors can change. Field keys connect content to the composition; changing a key or removing a field may require updating its bindings and examples.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-end gap-2"><label htmlFor={id + "-add"} className="min-w-40 flex-1 text-sm">New field type<select aria-label="New field type" id={id + "-add"} className={inputClass} value={adding} onChange={event => setAdding(event.target.value as BlockField["type"])}>{fieldTypes.map(type => <option value={type} key={type}>{names[type]}</option>)}</select></label><Button type="button" variant="outline" onClick={() => add(null)}>Add field</Button></div>
    <div className="grid gap-4 md:grid-cols-[minmax(10rem,0.65fr)_minmax(0,1fr)]"><nav aria-label="Field outline" className="min-w-0 space-y-1">{outline(fields).map(row => <button key={row.path.join(".")} type="button" aria-current={row.path.join(".") === selectedPath.join(".") ? "true" : undefined} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-md px-3 text-left text-sm hover:bg-muted aria-[current=true]:bg-muted" style={{ paddingInlineStart: 12 + (row.path.length - 1) * 12 }} onClick={() => setPath(row.path)}><span className="break-all">{row.field.title || row.field.id || "Untitled field"}</span><span className="text-xs text-muted-foreground">{names[row.field.type]}</span></button>)}{!fields.length && <p className="text-sm text-muted-foreground">Add a field to make this block editable.</p>}</nav>
    {field && <div key={selectedPath.join(".")} className="min-w-0 space-y-4">
      <label className="block text-sm">Field key<input className={inputClass} maxLength={80} value={field.id} onChange={event => patch("id", event.target.value)} /></label>
      <label className="block text-sm">Field label<input className={inputClass} maxLength={160} value={field.title ?? ""} onChange={event => patch("title", event.target.value || undefined)} /></label>
      <label className="block text-sm">Help text<input className={inputClass} maxLength={1000} value={field.description ?? ""} onChange={event => patch("description", event.target.value || undefined)} /></label>
      <label className="block text-sm">Field type<select aria-label="Field type" className={inputClass} value={field.type} onChange={event => replace(changeFieldType(field!, event.target.value as BlockField["type"]))}>{fieldTypes.map(type => <option key={type} value={type}>{names[type]}</option>)}</select></label>
      <p className="text-xs text-muted-foreground">Changing type replaces its type-specific settings. Existing default values and examples are kept for review.</p>
      <div className="flex flex-wrap gap-4">{[["required", "Required"], ["nullable", "Allow null"]].map(([key, title]) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={scalarItem && key === "required" && field.required === true} checked={!!field![key as "required" | "nullable"]} onChange={event => patch(key, event.target.checked)} />{title}</label>)}</div>
      <FieldOptions field={field} patch={patch} />
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={scalarItem && !Object.hasOwn(field, "default")} checked={Object.hasOwn(field, "default")} onChange={event => patch("default", event.target.checked ? defaultForField(field) : undefined)} />Use a default value</label>
      {Object.hasOwn(field, "default") && <DefaultValue field={field} onChange={value => patch("default", value)} onInvalidChange={onInvalidChange} />}
      {"fields" in field && field.fields && <Button type="button" variant="outline" onClick={() => add(selectedPath)}>Add nested field</Button>}
      {field.type === "repeater" && <label className="block text-sm">Repeated item structure<select aria-label="Repeated item structure" className={inputClass} value={field.item ? "item" : "fields"} onChange={event => { const updated = { ...field } as Extract<BlockField, { type: "repeater" }>;if (event.target.value === "item") { delete updated.fields;updated.item = { id: "value", type: "text", required: true }; } else { delete updated.item;updated.fields = [{ id: "text", type: "text" }]; }delete updated.constraints;replace(updated); }}><option value="fields">Group of fields</option><option value="item">Single value</option></select><span className="text-xs text-muted-foreground">Switching replaces the nested field structure. Defaults and examples are retained.</span></label>}
      {!scalarItem && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => { change(items => { const list = fieldList(items, parentPath);[list[index-1], list[index]] = [list[index], list[index-1]]; });setPath([...parentPath ?? [], index-1]); }}>Move field up</Button><Button type="button" variant="outline" size="sm" disabled={index === siblings.length-1} onClick={() => { change(items => { const list = fieldList(items, parentPath);[list[index+1], list[index]] = [list[index], list[index+1]]; });setPath([...parentPath ?? [], index+1]); }}>Move field down</Button><Button type="button" variant="outline" size="sm" onClick={() => { change(items => fieldList(items, parentPath).splice(index,1));setPath(parentPath ?? [0]); }}>Remove field</Button></div>}
      {"constraints" in field && field.constraints?.length ? <p className="text-xs text-muted-foreground">This group also has validation rules. Review them in advanced definition source.</p> : null}
    </div>}
    </div>
  </fieldset>;
}
function DefaultValue({ field, onChange, onInvalidChange }: { field: BlockField; onChange: (value: SpecJson) => void; onInvalidChange?: (invalid: boolean) => void }) {
  if (field.type === "select" && field.options.some(option => option === field.default)) return <label className="block text-sm">Default value<select aria-label="Default value" className={inputClass} value={String(field.options.indexOf(field.default as string | number))} onChange={event => onChange(field.options[Number(event.target.value)])}>{field.options.map((option, index) => <option key={index} value={index}>{String(option)}</option>)}</select></label>;
  if (typeof field.default === "boolean") return <label className="block text-sm">Default value<select aria-label="Default value" className={inputClass} value={String(field.default)} onChange={event => onChange(event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select></label>;
  if (typeof field.default === "number") return <label className="block text-sm">Default value<input className={inputClass} type="number" value={field.default} onChange={event => { if (event.target.value !== "") onChange(Number(event.target.value)); }} /></label>;
  if (typeof field.default === "string") return <label className="block text-sm">Default value<input className={inputClass} maxLength={100000} value={field.default} onChange={event => onChange(event.target.value)} /></label>;
  return <JsonValue label="Structured default (JSON)" value={field.default!} onChange={onChange} onInvalidChange={onInvalidChange} />;
}
function FieldOptions({ field, patch }: { field: BlockField; patch: (key: string, value: unknown) => void }) {
  return <div className="space-y-3">
    {[...(["text", "number", "repeater"].includes(field.type) ? ["min"] : []), ...((["text", "number", "repeater", "richtext", "reference"].includes(field.type) || field.type === "media" && field.storage === "id" || field.type === "link" && field.storage === "href") ? ["max"] : [])].map(key => <label key={key} className="block text-sm">{key === "min" ? "Minimum" : "Maximum"}<input className={inputClass} type="number" value={(field as unknown as Record<string, number>)[key] ?? ""} onChange={event => patch(key, event.target.value === "" ? undefined : Number(event.target.value))} /></label>)}
    {field.type === "number" && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field.integer ?? false} onChange={event => patch("integer", event.target.checked)} />Whole numbers only</label>}
    {field.type === "richtext" && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field.inline ?? false} onChange={event => patch("inline", event.target.checked)} />Inline rich text</label>}
    {field.type === "text" && <><label className="block text-sm">Text format<select aria-label="Text format" className={inputClass} value={field.format ?? ""} onChange={event => patch("format", event.target.value || undefined)}><option value="">Any text</option><option value="timezone">Time zone</option><option value="anchor">Anchor</option><option value="resource-id">Resource ID</option></select></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field.domId ?? false} onChange={event => patch("domId", event.target.checked || undefined)} />Use as a page element ID</label></>}
    {field.type === "select" && <div className="space-y-2"><p className="text-sm font-medium">Choices</p>{field.options.map((option, i) => <div key={i} className="flex flex-wrap gap-2"><label className="min-w-32 flex-1 text-sm">Choice {i+1}<input className={inputClass} value={option} type={typeof option === "number" ? "number" : "text"} onChange={event => patch("options", field.options.map((item,n) => n === i ? typeof option === "number" ? Number(event.target.value) : event.target.value : item))} /></label><select aria-label={`Choice ${i+1} type`} className={inputClass + " !w-auto"} value={typeof option} onChange={event => patch("options", field.options.map((item,n) => n === i ? event.target.value === "number" ? Number.isFinite(Number(item)) ? Number(item) : 0 : String(item) : item))}><option value="string">Text</option><option value="number">Number</option></select><Button type="button" variant="outline" size="sm" aria-label={`Remove choice ${i+1}`} onClick={() => patch("options", field.options.filter((_,n) => n!==i))}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" disabled={field.options.length >= 100} onClick={() => patch("options", [...field.options, `Choice ${field.options.length+1}`])}>Add choice</Button></div>}
    {field.type === "reference" && <label className="block text-sm">Reference type<select aria-label="Reference type" className={inputClass} value={field.of} onChange={event => patch("of", event.target.value)}>{references.map(kind => <option key={kind}>{kind}</option>)}</select></label>}
    {["reference", "media", "link"].includes(field.type) && <><label className="block text-sm">Stored value<select aria-label="Stored value" className={inputClass} value={(field as {storage?:string}).storage ?? ""} onChange={event => patch("storage", event.target.value || undefined)}><option value="">Standard format</option>{field.type === "reference" ? <><option value="id">ID</option><option value="slug">Slug</option></> : field.type === "media" ? <option value="id">Media ID</option> : <option value="href">URL only</option>}</select></label>{(field.type === "reference" || field.type === "media" && field.storage === "id" || field.type === "link" && field.storage === "href") && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={(field as {allowEmpty?:boolean}).allowEmpty ?? false} onChange={event => patch("allowEmpty", event.target.checked)} />Allow an empty value</label>}</>}
    {field.type === "link" && <fieldset className="flex flex-wrap gap-3"><legend className="text-sm">Allowed link types (leave unchecked for defaults)</legend>{["http", "https", "relative", "anchor", "mailto", "tel"].map(protocol => <label key={protocol} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field.protocols?.includes(protocol as NonNullable<typeof field.protocols>[number]) ?? false} onChange={event => { const next = event.target.checked ? [...field.protocols ?? [], protocol] : field.protocols?.filter(item => item !== protocol);patch("protocols", next?.length ? next : undefined); }} />{protocol}</label>)}</fieldset>}
  </div>;
}
