export const KNOWN_PATHS = ["cf", "bs", "accounts", "simulator", "insights"] as const;
export type KnownPath = (typeof KNOWN_PATHS)[number];

function isKnownPath(path: string): path is KnownPath {
  return (KNOWN_PATHS as readonly string[]).includes(path);
}

export function extractPagePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return "";

  if (isKnownPath(segments[0])) {
    return segments.join("/");
  }

  return segments.slice(1).join("/");
}

export function extractGroupIdFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (!firstSegment) return null;
  if (isKnownPath(firstSegment)) return null;

  return firstSegment;
}

export function buildGroupPath(groupId: string | null | undefined, path: string): string {
  if (groupId) {
    return path ? `/${groupId}/${path}` : `/${groupId}`;
  }
  return path ? `/${path}` : "/";
}

export function isNavItemActive(
  pathname: string,
  itemPath: string,
  groupId: string | null,
): boolean {
  const basePath = groupId ? `/${groupId}` : "";
  const normalizedPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (itemPath === "") {
    return normalizedPathname === (basePath || "");
  }

  return pathname.startsWith(`${basePath}/${itemPath}`);
}
