// Compares dot-separated numeric version strings (e.g. "0.5.11" vs "0.5.9"), ignoring a
// leading "v" so release tags can be passed in raw. Returns positive if `a` is newer,
// negative if older, 0 if equal. Missing segments count as 0.
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) =>
    version
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((p) => parseInt(p, 10) || 0);

  const aParts = parse(a);
  const bParts = parse(b);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}
