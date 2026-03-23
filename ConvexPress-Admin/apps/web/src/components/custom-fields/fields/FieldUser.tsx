import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

export function FieldUser({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const multiple = settings.multiple ?? false;
  const roles: string[] = settings.roles ?? [];

  // Fetch users
  const users = useQuery(api.users.queries.list, { limit: 200 });

  const filteredUsers = useMemo(() => {
    if (!users?.users) return [];
    if (roles.length === 0) return users.users;
    return users.users.filter((u: { role?: string }) => roles.includes(u.role ?? "subscriber"));
  }, [users, roles]);

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <select
        value={multiple ? undefined : value}
        multiple={multiple}
        onChange={(e) => {
          if (multiple) {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange(JSON.stringify(selected));
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
        style={multiple ? { height: "auto", minHeight: "6rem" } : undefined}
      >
        {!multiple && <option value="">- Select User -</option>}
        {filteredUsers.map((u: { _id: string; name?: string; email?: string; displayName?: string }) => (
          <option key={u._id} value={u._id}>{u.displayName ?? u.name ?? u.email ?? u._id}</option>
        ))}
      </select>
      {users === undefined && <p className="text-[10px] text-muted-foreground mt-1">Loading users...</p>}
    </FieldWrapper>
  );
}
