export function pageAccessCandidates(path: string): string[] {
  const cleanPath = path.split("?")[0]?.split("#")[0] || "/";
  const withLeadingSlash = cleanPath.startsWith("/")
    ? cleanPath
    : `/${cleanPath}`;

  if (withLeadingSlash === "/") return ["/", "/admin"];
  if (withLeadingSlash === "/profile" || withLeadingSlash === "/admin/profile") {
    return ["/profile", "/admin/profile", "/admin/users/profile"];
  }
  if (
    withLeadingSlash === "/posts/categories" ||
    withLeadingSlash === "/admin/posts/categories"
  ) {
    return ["/posts/categories", "/admin/posts/categories", "/admin/categories"];
  }
  if (withLeadingSlash === "/posts/tags" || withLeadingSlash === "/admin/posts/tags") {
    return ["/posts/tags", "/admin/posts/tags", "/admin/tags"];
  }
  if (withLeadingSlash.startsWith("/admin")) return [withLeadingSlash];

  return [withLeadingSlash, `/admin${withLeadingSlash}`];
}

export function matchesPageAccess(path: string, allowed: string): boolean {
  const normalizedAllowed = allowed.endsWith("/")
    ? allowed.slice(0, -1)
    : allowed;

  if (normalizedAllowed === "/" || normalizedAllowed === "/admin") {
    return path === normalizedAllowed;
  }

  if (normalizedAllowed.endsWith("/*")) {
    const prefix = normalizedAllowed.slice(0, -2);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  return path === normalizedAllowed || path.startsWith(`${normalizedAllowed}/`);
}
