/** Initials for an avatar: "Omar Mohamed" -> "OM", "amara@x.org" -> "A". */
export function initials(name: string): string {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
