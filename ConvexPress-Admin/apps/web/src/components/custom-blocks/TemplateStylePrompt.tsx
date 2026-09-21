import { useId, useState } from "react";
import { packDesigns } from "@backend/canonical-blocks-foundation/generated/pack-designs";
import { Button } from "@/components/ui/button";

export function TemplateStylePrompt({ disabled, busy, onGenerate }: { disabled: boolean; busy: boolean; onGenerate: (packId: string, prompt: string) => void }) {
  const id = useId(), [packId, setPackId] = useState("core"), [prompt, setPrompt] = useState("");
  return <section aria-label="Template treatment generator" className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
    <h3 className="font-semibold">Style for a template</h3>
    <p className="text-sm text-muted-foreground">Describe a layout or mood. AI uses the template’s design guide and this saved block’s fields to propose a treatment you can edit and preview.</p>
    <label htmlFor={id + "-template"} className="block text-sm font-medium">Treatment template</label>
    <select id={id + "-template"} disabled={disabled} value={packId} onChange={event => setPackId(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
      {Object.values(packDesigns).map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
    </select>
    <label htmlFor={id + "-prompt"} className="block text-sm font-medium">Styling request</label>
    <textarea id={id + "-prompt"} value={prompt} maxLength={8000} rows={3} disabled={disabled} onChange={event => setPrompt(event.target.value)} placeholder="A spacious introduction with a bold heading and a quiet supporting line…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    <Button type="button" variant="outline" disabled={disabled || !prompt.trim()} onClick={() => onGenerate(packId, prompt)}>{busy ? "Generating treatment…" : "Generate treatment proposal"}</Button>
    <p className="text-xs text-muted-foreground">Generation uses your configured AI provider. Nothing is saved or approved until you review it.</p>
  </section>;
}
