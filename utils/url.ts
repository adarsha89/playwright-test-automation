/**
 * Joins a base URL (typically a `<SITE>_BASE_URL` from `config/env.ts`) and
 * a path with exactly one `/` between them.
 *
 * The env schema (`z.string().url()`) doesn't enforce a trailing slash, so
 * raw concatenation like `` `${env.X_BASE_URL}inventory.html` `` breaks as
 * soon as the value is set without one. `joinUrl(base)` with no path returns
 * the base normalized to a single trailing slash, matching how the browser
 * reports a site's root URL.
 */
export function joinUrl(base: string, path = ''): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
