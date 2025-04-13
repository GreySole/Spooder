export function webJoin(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/(^\/+|\/+$)/g, '')) // Remove leading/trailing slashes
    .join('/');
}
