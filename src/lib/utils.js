/**
 * Convert a URL to a slugified filename format matching Lighthouse or pa11y report naming convention
 * @param {string} url - The full URL to slugify
 * @param {string} method - The report method: 'lh' for lighthouse (default) or 'pa11y'
 * @returns {string|null} - The slugified string or null if url is empty
 */
export function slugify(url, method = "lh") {
  if (!url) return null;
  let slug = url.replace(/^https?:\/\//, "");
  const hasTrailingSlash = slug.endsWith("/");
  slug = slug.replace(/\/$/, "");

  if (method === "pa11y") {
    // pa11y filenames normalize encoded bytes (e.g., %c2%ae -> -c2-ae).
    slug = slug
      .replace(/%([0-9a-fA-F]{2})/g, (match, hex) => `-${hex.toLowerCase()}`)
      .replace(/\.html$/, "");
    slug = slug.replace(/\//g, "-");
    slug = slug.replace(/\./g, "-");
    slug = slug.replace(/\s+/g, "-");
    slug = slug.replace(/[#!?=+&]/g, "-");
    slug = slug.replace(/[()]/g, "");
    slug = slug.replace(/-+/g, "-");
    return slug;
  } else {
    slug = slug.replace(/\//g, "_");
    slug = slug.replace(/\./g, "_");
    slug = slug.replace(/[#!?]/g, "_");
    // Lighthouse report filenames keep a trailing underscore for URLs ending with '/'.
    return hasTrailingSlash ? slug + "_" : slug;
  }
}
