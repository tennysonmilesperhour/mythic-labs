import matter from "gray-matter";

export type CatalogFrontmatter = {
  name?: string;
  description?: string;
};

/** Parse catalogue metadata without letting one malformed file hide a plugin. */
export function parseCatalogFrontmatter(
  content: string,
  path: string
): CatalogFrontmatter {
  try {
    return matter(content).data as CatalogFrontmatter;
  } catch {
    // Keep the item visible by its path without logging source content.
    console.warn(`Could not parse frontmatter for ${path}`);
    return {};
  }
}
