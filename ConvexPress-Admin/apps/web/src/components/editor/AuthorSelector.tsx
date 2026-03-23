/**
 * AuthorSelector - Author reassignment dropdown
 *
 * Dropdown to change the post's author. Only visible to Editor+ roles.
 * Displays user display name with email.
 * Wired to Convex profiles.listUsers query.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { AuthorItem } from "@/types/editor";

interface AuthorSelectorProps {
  authorId: string;
  onChange: (authorId: string) => void;
  userRole: string;
}

function isEditorOrAbove(role: string): boolean {
  return role === "editor" || role === "administrator";
}

export function AuthorSelector({
  authorId,
  onChange,
  userRole,
}: AuthorSelectorProps) {
  // Only show to editors and administrators
  if (!isEditorOrAbove(userRole)) {
    return null;
  }

  // Fetch users who can author posts (Author+ role level >= 60)
  const usersResult = useQuery(api.profiles.queries.listUsers, {
    perPage: 100,
  });

  // Map to a flat list of author-capable users
  const authors = useMemo((): AuthorItem[] => {
    if (!usersResult?.users) return [];
    return usersResult.users.map((u: Record<string, unknown>) => ({
      id: String(u._id ?? ""),
      displayName: String(u.displayName ?? u.name ?? u.email ?? "Unknown"),
      email: String(u.email ?? ""),
      role: String(u.role ?? ""),
    }));
  }, [usersResult]);

  return (
    <div>
      <select
        value={authorId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 rounded-none border border-border bg-transparent px-2 text-xs"
        aria-label="Post author"
      >
        {authors.map((author) => (
          <option key={author.id} value={author.id}>
            {author.displayName} ({author.email})
          </option>
        ))}
      </select>
    </div>
  );
}
