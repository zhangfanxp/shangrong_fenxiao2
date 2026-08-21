export function normalizeUserTags(value?: string | null) {
  if (!value) return null;
  const tags = value.split("|").map(tag => tag.trim()).filter(Boolean);
  return tags.length ? [...new Set(tags)].join("|") : null;
}
