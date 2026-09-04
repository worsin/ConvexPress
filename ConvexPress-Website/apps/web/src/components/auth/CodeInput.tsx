/**
 * CodeInput — one-time code entry used by every verification step.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CodeInput({
  id,
  value,
  onChange,
  label = "Verification code",
  length = 6,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label?: string;
  length?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={"0".repeat(length)}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 12))}
        autoFocus
        required
      />
    </div>
  );
}
