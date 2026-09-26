/** Transforme un nom en slug d'URL (« Café Pause » → « cafe-pause »). `trim` à false garde un tiret final pendant la saisie. */
export function slugify(value: string, trim = true): string {
  const slug = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-");
  return trim ? slug.replace(/^-+|-+$/g, "") : slug.replace(/^-+/, "");
}
