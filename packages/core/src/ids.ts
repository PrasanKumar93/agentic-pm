export function createId(prefix: string): string {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return `${prefix}_${random}`;
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
