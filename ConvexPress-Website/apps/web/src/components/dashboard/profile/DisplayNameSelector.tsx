import type { UserProfile } from "@/lib/dashboard/types";
import { useDisplayNameOptions } from "@/hooks/useDisplayNameOptions";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DisplayNameSelectorProps {
  user: UserProfile;
  value: string;
  onChange: (value: string) => void;
}

/**
 * WordPress-style dropdown for selecting how the display name is composed.
 * Generates options from first name, last name, nickname, and email username.
 */
export function DisplayNameSelector({
  user,
  value,
  onChange,
}: DisplayNameSelectorProps) {
  const options = useDisplayNameOptions(user);

  return (
    <div data-slot="display-name-selector" className="space-y-1.5">
      <Label htmlFor="display-name-select">Display name publicly as</Label>
      <select
        id="display-name-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50",
          "h-8 w-full rounded-none border bg-transparent px-2.5 py-1 text-xs",
          "outline-hidden transition-colors focus-visible:ring-1",
        )}
        aria-label="Display name publicly as"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
