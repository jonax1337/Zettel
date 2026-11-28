/** Up to two initials for the avatar: the first characters of the first two words that start with a letter or digit. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => [...word][0].toLocaleUpperCase("de-DE"))
    .join("");
}
