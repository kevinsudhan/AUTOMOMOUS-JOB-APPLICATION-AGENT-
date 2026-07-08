/**
 * PostgREST (Supabase's API layer) caps unranged `.select()` queries at a
 * default of 1000 rows, silently — no error, the response just stops there.
 * This is what made "Total Contacts" / company contact counts flatten out
 * once a user had 1000+ contacts. Explicit `.range()` requests aren't
 * subject to that default cap, so we page through with `.range()` until a
 * page comes back short of a full chunk.
 *
 * IMPORTANT: every `fetchPage` builder MUST end with a deterministic
 * `.order(...)` that fully disambiguates row order (add the primary key as
 * a tiebreaker if the natural sort column isn't unique, e.g.
 * `.order('name').order('id')`). Without it, Postgres doesn't guarantee the
 * same row order across the separate range queries, so a row can appear on
 * two pages (duplicate) or on none (dropped) — this caused a "duplicate
 * React key" bug the first time this was added without ordering.
 */
export async function selectAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  chunkSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + chunkSize - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < chunkSize) break;
    from += rows.length;
  }
  return all;
}
