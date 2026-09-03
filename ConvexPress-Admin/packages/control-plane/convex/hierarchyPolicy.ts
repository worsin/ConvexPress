export function normalizeEntityName(value: string): string {
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error("Invalid hierarchy entity name");
  }
  return name;
}

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96)
    .replace(/-+$/gu, "");
  if (!slug || slug.length < 2) throw new Error("Invalid hierarchy slug");
  return slug;
}

export function normalizeDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Invalid website domain");
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    if (!url.hostname || url.username || url.password) {
      throw new Error("invalid");
    }
    return url.hostname.toLowerCase().replace(/\.+$/u, "");
  } catch {
    throw new Error("Invalid website domain");
  }
}

export function requireActiveParent<T extends { isActive: boolean }>(
  value: T | null | undefined,
  label: string,
): T {
  if (!value) throw new Error(`${label} not found`);
  if (!value.isActive) throw new Error(`${label} is inactive`);
  return value;
}

export function chooseDefaultId(input: {
  currentDefaultId?: string;
  children: readonly { id: string; isActive: boolean; order: number }[];
}): string | null {
  const current = input.children.find(
    (child) => child.id === input.currentDefaultId && child.isActive,
  );
  if (current) return current.id;
  return (
    [...input.children]
      .filter((child) => child.isActive)
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      )[0]?.id ?? null
  );
}
