import { MENU_VISIBILITY_VALUES } from "../../../../../../../blocks/.generated/instance-runtime.mjs";
export type BlockVisibility = (typeof MENU_VISIBILITY_VALUES)[number];
const labels: Record<BlockVisibility, string> = {
  everyone: "Everyone",
  signedIn: "Signed-in visitors",
  signedOut: "Signed-out visitors",
};
export function BlockVisibilityControls({ value, onChange, disabled }: {
  value: BlockVisibility;
  onChange: (value: BlockVisibility) => void;
  disabled: boolean;
}) {
  return <fieldset className="mb-5 space-y-2" disabled={disabled}>
    <label className="block space-y-2 text-sm">
      <span className="font-semibold">Block visibility</span>
      <select aria-label="Block visibility" className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={value} onChange={event => {
        const next = MENU_VISIBILITY_VALUES.find(choice => choice === event.currentTarget.value);
        if (next) onChange(next);
      }}>
        {MENU_VISIBILITY_VALUES.map(choice => <option key={choice} value={choice}>{labels[choice]}</option>)}
      </select>
    </label>
    <p className="text-xs text-muted-foreground">Applies to this block and its children on the published site. The editing preview keeps all audiences visible. Membership restrictions still apply.</p>
  </fieldset>;
}
