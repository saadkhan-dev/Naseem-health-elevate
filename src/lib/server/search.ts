import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side global site search.
 *
 * Searches across the public content the clinic publishes: services,
 * conditions (diseases), videos, products and FAQs. Every query is a
 * case-insensitive substring match against the visible rows only (RLS also
 * guards this, but the filters mirror the public pages exactly). Results are
 * capped per group so the response stays small.
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

  const [servicesRes, conditionsRes, videosRes, productsRes, faqsRes] = await Promise.all([
    admin
      .from("services")
      .select("id, name, description")
      .eq("is_active", true)
      .or(`name.ilike.${like},description.ilike.${like}`)
      .limit(LIMIT),
    admin
      .from("conditions")
      .select("id, category, title, description")
      .eq("is_active", true)
      .or(`title.ilike.${like},description.ilike.${like}`)
      .limit(LIMIT),
    admin
      .from("videos")
      .select("id, title, description")
      .eq("is_published", true)
      .or(`title.ilike.${like},description.ilike.${like}`)
      .limit(LIMIT),
    admin
      .from("products")
      .select("id, name, description")
      .eq("in_stock", true)
      .or(`name.ilike.${like},description.ilike.${like}`)
      .limit(LIMIT),
    admin
      .from("faqs")
      .select("id, question, answer")
      .eq("is_active", true)
      .or(`question.ilike.${like},answer.ilike.${like}`)
      .limit(LIMIT),
  ]);

  if (servicesRes.data?.length) {
    groups.push({
      title: "Services",
      items: itemsOf(servicesRes.data).map((s) => ({
        id: s.id as string,
        label: s.name as string,
        description: (s.description as string | null) ?? "",
        href: "/#services",
      })),
    });
  }
  if (conditionsRes.data?.length) {
    groups.push({
      title: "Diseases & Conditions",
      items: itemsOf(conditionsRes.data).map((c) => ({
        id: c.id as string,
        label: c.title as string,
        description: (c.description as string | null) ?? "",
        href: `/conditions?category=${c.category}`,
      })),
    });
  }
  if (videosRes.data?.length) {
    groups.push({
      title: "Videos",
      items: itemsOf(videosRes.data).map((v) => ({
        id: v.id as string,
        label: v.title as string,
        description: (v.description as string | null) ?? "",
        href: "/#videos",
      })),
    });
  }
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
  if (faqsRes.data?.length) {
    groups.push({
      title: "FAQ",
      items: itemsOf(faqsRes.data).map((f) => ({
        id: f.id as string,
        label: f.question as string,
        description: (f.answer as string | null) ?? "",
        href: "/faq",
      })),
    });
  }

  return groups;
}
