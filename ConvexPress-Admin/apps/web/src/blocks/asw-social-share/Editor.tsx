import type { BlockEditorProps } from "@/lib/blocks/types";
import { CheckboxField, SelectField, TextareaField, TextField } from "../_shared/editorFields";
import type { AswSocialShareAttrs } from "./schema";

const networkOptions: Array<[AswSocialShareAttrs["networks"][number], string]> = [
  ["facebook", "Facebook"],
  ["x", "X"],
  ["pinterest", "Pinterest"],
  ["linkedin", "LinkedIn"],
  ["email", "Email"],
  ["copy", "Copy link"],
];

export function AswSocialShareEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<AswSocialShareAttrs>) {
  const toggleNetwork = (network: AswSocialShareAttrs["networks"][number], checked: boolean) => {
    const networks = checked
      ? [...attrs.networks, network]
      : attrs.networks.filter((item) => item !== network);
    onChange({ ...attrs, networks: [...new Set(networks)] });
  };

  return (
    <div className="grid gap-4">
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} rows={3} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <SelectField
        label="Share URL"
        value={attrs.shareUrlMode}
        disabled={disabled}
        options={[
          ["currentPage", "Current page"],
          ["custom", "Custom URL"],
        ]}
        onChange={(shareUrlMode) => onChange({ ...attrs, shareUrlMode })}
      />
      <TextField label="Custom URL" value={attrs.customUrl} disabled={disabled} onChange={(customUrl) => onChange({ ...attrs, customUrl })} />
      <div className="grid gap-2">
        <span className="text-xs font-medium text-muted-foreground">Networks</span>
        <div className="grid gap-2 md:grid-cols-3">
          {networkOptions.map(([network, label]) => (
            <CheckboxField
              key={network}
              label={label}
              checked={attrs.networks.includes(network)}
              disabled={disabled}
              onChange={(checked) => toggleNetwork(network, checked)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
