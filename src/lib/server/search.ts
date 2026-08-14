import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side site search.
 *
 * The navbar / search page is a PRODUCTS-ONLY search ("Search our products"),
 * so this intentionally queries just the visible in-stock products. Results
 * are capped so the response stays small.
 */

export interface SearchGroup {
  title: string;
  items: Array<{
    id: string;
    label: string;
    description: string;
    /** Where the item lives — used to build the "view all / open" link. */
    href: string;
  }>;
}

const LIMIT = 5;

function itemsOf<T>(rows: T[], take = LIMIT): T[] {
  return (rows ?? []).slice(0, take);
}

export async function searchSite(admin: SupabaseClient, query: string): Promise<SearchGroup[]> {
  const q = (query ?? "").trim();
  if (!q) return [];

  const like = `%${q}%`;
  const groups: SearchGroup[] = [];

  const productsRes = await admin
    .from("products")
    .select("id, name, description")
    .eq("in_stock", true)
    .or(`name.ilike.${like},description.ilike.${like}`)
    .limit(LIMIT);

  if (productsRes.data?.length) {
    groups.push({
      title: "Products",
      items: itemsOf(productsRes.data).map((p) => ({
        id: p.id as string,
        label: p.name as string,
        description: (p.description as string | null) ?? "",
        href: "/#products",
      })),
    });
  }

  return groups;
}
